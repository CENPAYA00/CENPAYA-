import type {Env,User} from "./types.js";
import {uuid} from "./security.js";
type C={url:URL;path:string;method:string;user:User|null};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const fail=(error:string,status=400)=>json({success:false,error},status);
const MAX_BYTES=500*1024*1024;
async function processor(env:Env,path:string,data?:unknown,method="POST"){
 if(!env.VIDEO_PROCESSOR||!env.VIDEO_PROCESSOR_TOKEN)return null;
 return env.VIDEO_PROCESSOR.fetch("https://video-processor.internal"+path,{method,headers:{"Authorization":"Bearer "+env.VIDEO_PROCESSOR_TOKEN,...(data?{"Content-Type":"application/json"}:{})},body:data?JSON.stringify(data):undefined});
}
export async function handleVideoRoutes(request:Request,env:Env,{url,path,method,user}:C):Promise<Response|null>{
 if(path==="/api/videos/upload-intent"&&method==="POST"){
  if(!user)return fail("Authentication required",401);
  const b=await request.json().catch(()=>null) as Record<string,unknown>|null;if(!b)return fail("Valid JSON body required");
  const mime=typeof b.mime_type==="string"?b.mime_type.toLowerCase():"",size=Number(b.size_bytes),filename=typeof b.filename==="string"?b.filename.slice(0,160):"video";
  if(!["video/mp4","video/quicktime","video/webm","video/x-matroska"].includes(mime))return fail("Unsupported video format");
  if(!Number.isSafeInteger(size)||size<1||size>MAX_BYTES)return fail("Video must not exceed 500 MB",413);
  const id=uuid(),key="videos/source/"+user.id+"/"+id+"/source",r=await processor(env,"/v1/uploads",{video_id:id,object_key:key,mime_type:mime,size_bytes:size});
  if(!r)return fail("Video processor service is not configured",503);if(!r.ok)return fail("Could not create upload URL",502);
  const data=await r.json() as {upload_url?:string;expires_at?:string};if(!data.upload_url)return fail("Invalid processor response",502);
  await env.DB.prepare("INSERT INTO video_assets(id,owner_id,status,source_key,source_bytes,mime_type) VALUES(?,?,'awaiting_upload',?,?,?)").bind(id,user.id,key,size,mime).run();
  return json({success:true,data:{video_id:id,filename,upload_url:data.upload_url,method:"PUT",headers:{"Content-Type":mime},expires_at:data.expires_at,max_duration_seconds:300}},201);
 }
 const m=path.match(/^\/api\/videos\/([0-9a-f-]{36})\/(complete|status|playlist)$/i);
 if(m){
  if(!user)return fail("Authentication required",401);
  const row=await env.DB.prepare("SELECT v.id,v.owner_id,v.status,v.source_key,v.source_bytes,v.mime_type,v.hls_key,v.duration_seconds,v.thumbnail_key,v.post_id,p.author_id,p.visibility,p.status AS post_status,p.deleted_at FROM video_assets v LEFT JOIN posts p ON p.id=v.post_id WHERE v.id=?").bind(m[1]).first<Record<string,unknown>>();
  if(!row)return fail("Video not found",404);
  const owner=row.owner_id===user.id;
  const visible=owner||(row.post_id&&row.post_status==="published"&&!row.deleted_at&&row.visibility==="public"&&row.author_id!==user.id?true:false);
  if(!visible)return fail("Video not found",404);
  if(m[2]==="status"&&method==="GET")return json({success:true,data:{video_id:row.id,status:row.status,duration_seconds:row.duration_seconds}});
  if(m[2]==="playlist"&&method==="GET"){
   if(row.status!=="ready"||!row.hls_key)return fail("Video is not ready",409);
   if(!owner){
    const blocked=await env.DB.prepare("SELECT 1 FROM user_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)").bind(user.id,row.author_id,user.id,row.author_id).first();
    if(blocked)return fail("Video not found",404);
   }
   const r=await processor(env,"/v1/playback?key="+encodeURIComponent(String(row.hls_key)),undefined,"GET");
   if(!r||!r.ok)return fail("Video playback is temporarily unavailable",503);
   return new Response(r.body,{status:200,headers:{"Content-Type":"application/vnd.apple.mpegurl","Cache-Control":"private, no-store","Access-Control-Allow-Origin":url.origin,"Access-Control-Allow-Headers":"Range"}});
  }
  if(m[2]==="complete"&&method==="POST"){
   if(!owner)return fail("Only the uploader can complete this video",403);
   if(row.status!=="awaiting_upload")return fail("Video is already queued",409);
   const r=await processor(env,"/v1/process",{video_id:row.id,source_key:row.source_key,source_bytes:row.source_bytes,mime_type:row.mime_type});
   if(!r)return fail("Video processor service is not configured",503);if(!r.ok)return fail("Processing failed; source remains in B2",502);
   const result=await r.json() as {status?:string;hls_key?:string;thumbnail_key?:string;duration_seconds?:number;width?:number;height?:number;sha256?:string;backup?:string};
   if(result.status!=="ready"||!result.hls_key||result.backup!=="verified")return fail("Processor did not confirm HLS and verified backup",502);
   await env.DB.batch([
    env.DB.prepare("UPDATE video_assets SET status='ready',hls_key=?,thumbnail_key=?,duration_seconds=?,width=?,height=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND owner_id=? AND status='awaiting_upload'").bind(result.hls_key,result.thumbnail_key||null,result.duration_seconds||null,result.width||null,result.height||null,row.id,user.id),
    env.DB.prepare("INSERT OR REPLACE INTO video_backup_jobs(id,video_id,object_key,checksum_sha256,status,attempts) VALUES(?,?,?,?,'verified',1)").bind(uuid(),row.id,row.source_key,result.sha256||"")
   ]);
   return json({success:true,data:{video_id:row.id,status:"ready",duration_seconds:result.duration_seconds}});
  }
  return fail("Method not allowed",405);
 }
 if(path==="/api/reels"&&method==="GET"){
  const limit=Math.min(Math.max(Number(url.searchParams.get("limit")||10),1),20),cursor=url.searchParams.get("cursor")||"";
  const rows=await env.DB.prepare(`SELECT v.id AS video_id,v.post_id,v.hls_key,v.thumbnail_key,v.duration_seconds,p.content,p.created_at,p.author_id,u.username,u.display_name,u.avatar_url
   FROM video_assets v JOIN posts p ON p.id=v.post_id JOIN users u ON u.id=p.author_id
   WHERE v.status='ready' AND p.status='published' AND p.deleted_at IS NULL AND p.visibility='public'
   AND u.account_status='active' AND u.banned=0 AND u.deleted_at IS NULL
   AND (?='' OR p.created_at<?)
   AND (? IS NULL OR NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=? AND b.blocked_id=p.author_id) OR (b.blocker_id=p.author_id AND b.blocked_id=?)))
   ORDER BY p.created_at DESC LIMIT ?`).bind(cursor,cursor,user?.id||null,user?.id||null,user?.id||null,limit).all<Record<string,unknown>>();
  const data=rows.results.map(row=>({...row,playlist_url:"/api/videos/"+row.video_id+"/playlist",thumbnail_url:null,next_cursor:row.created_at}));
  return json({success:true,data,next_cursor:data.length?data[data.length-1].next_cursor:null});
 }
 return null;
}
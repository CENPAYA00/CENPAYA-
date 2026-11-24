import type {Env,User} from "./types.js";
import {uuid} from "./security.js";
type C={path:string;method:string;user:User|null};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const fail=(error:string,status=400)=>json({success:false,error},status);
const MAX_BYTES=500*1024*1024;
async function processor(env:Env,path:string,data:unknown){if(!env.VIDEO_PROCESSOR||!env.VIDEO_PROCESSOR_TOKEN)return null;return env.VIDEO_PROCESSOR.fetch("https://video-processor.internal"+path,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+env.VIDEO_PROCESSOR_TOKEN},body:JSON.stringify(data)});}
export async function handleVideoRoutes(request:Request,env:Env,{path,method,user}:C):Promise<Response|null>{
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
 const m=path.match(/^\/api\/videos\/([0-9a-f-]{36})\/(complete|status)$/i);if(!m)return null;
 if(!user)return fail("Authentication required",401);
 const row=await env.DB.prepare("SELECT id,status,source_key,source_bytes,mime_type FROM video_assets WHERE id=? AND owner_id=?").bind(m[1],user.id).first<{id:string;status:string;source_key:string;source_bytes:number;mime_type:string}>();
 if(!row)return fail("Video not found",404);
 if(m[2]==="status"&&method==="GET")return json({success:true,data:{video_id:row.id,status:row.status}});
 if(m[2]==="complete"&&method==="POST"){
  if(row.status!=="awaiting_upload")return fail("Video is already queued",409);
  const r=await processor(env,"/v1/process",{video_id:row.id,source_key:row.source_key,source_bytes:row.source_bytes,mime_type:row.mime_type});
  if(!r)return fail("Video processor service is not configured",503);if(!r.ok)return fail("Processing could not be queued",502);
  await env.DB.prepare("UPDATE video_assets SET status='processing',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(row.id).run();
  return json({success:true,data:{video_id:row.id,status:"processing"}},202);
 }
 return fail("Method not allowed",405);
}

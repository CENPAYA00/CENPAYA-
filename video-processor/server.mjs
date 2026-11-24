import http from "node:http";
import {timingSafeEqual,createHash} from "node:crypto";
import {spawn} from "node:child_process";
import {mkdtemp,readFile,writeFile,readdir,stat,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {S3Client,PutObjectCommand,GetObjectCommand,HeadObjectCommand} from "@aws-sdk/client-s3";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";
const e=process.env;
const b2=new S3Client({region:e.B2_REGION,endpoint:e.B2_ENDPOINT,forcePathStyle:true,credentials:{accessKeyId:e.B2_KEY_ID||"",secretAccessKey:e.B2_APPLICATION_KEY||""}});
const tg=new S3Client({region:e.TIGRIS_REGION||"auto",endpoint:e.TIGRIS_ENDPOINT||"https://t3.storage.dev",credentials:{accessKeyId:e.TIGRIS_ACCESS_KEY_ID||"",secretAccessKey:e.TIGRIS_SECRET_ACCESS_KEY||""}});
const safe=s=>typeof s==="string"&&/^[\w/-]{1,400}$/.test(s);
function auth(req){const a=Buffer.from(req.headers.authorization||""),b=Buffer.from("Bearer "+(e.VIDEO_PROCESSOR_TOKEN||""));return a.length===b.length&&b.length>20&&timingSafeEqual(a,b);}
async function body(req){let s="";for await(const c of req){s+=c;if(s.length>16000)throw Error("body too large");}return JSON.parse(s||"{}");}
function ff(args,cwd){return new Promise((ok,no)=>{const p=spawn("ffmpeg",args,{cwd,stdio:["ignore","ignore","pipe"]});let err="";p.stderr.on("data",d=>err+=d);p.on("error",no);p.on("close",c=>c===0?ok():no(Error(err.slice(-1000))));});}
async function putObject(client,bucket,key,body,contentType,metadata={}){
 await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:body,ContentType:contentType,Metadata:metadata}));
 const head=await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));
 if(Number(head.ContentLength)!==body.length)throw Error("object verification failed: "+key);
}
async function processVideo(d){
 if(!safe(d.source_key)||!d.source_key.startsWith("videos/source/")||!safe(d.video_id))throw Error("invalid job");
 const obj=await b2.send(new GetObjectCommand({Bucket:e.B2_BUCKET_NAME,Key:d.source_key})),chunks=[];
 for await(const c of obj.Body)chunks.push(c);
 const bytes=Buffer.concat(chunks);
 if(bytes.length!==d.source_bytes||bytes.length>524288000)throw Error("upload size mismatch");
 const hash=createHash("sha256").update(bytes).digest("hex"),dir=await mkdtemp(join(tmpdir(),"cenpaya-")),input=join(dir,"source");
 try{
  await writeFile(input,bytes);
  const probe=await new Promise((ok,no)=>{const p=spawn("ffprobe",["-v","error","-show_entries","format=duration:stream=width,height,codec_type","-of","json",input]);let s="";p.stdout.on("data",x=>s+=x);p.on("error",no);p.on("close",c=>c===0?ok(JSON.parse(s)):no(Error("invalid video")));});
  const duration=Number(probe.format?.duration||0);
  if(!duration||duration>300)throw Error("maximum video duration is five minutes");
  const streams=probe.streams||[],video=streams.find(x=>x.codec_type==="video");
  if(!video||!video.width||!video.height)throw Error("video stream is missing");
  const renditions=[{name:"360p",height:360,bandwidth:800000},{name:"480p",height:480,bandwidth:1400000},{name:"720p",height:720,bandwidth:2800000}].filter(x=>Number(video.height)>=x.height);
  if(!renditions.length)renditions.push({name:"source",height:Number(video.height),bandwidth:900000});
  const outputs=[];
  for(const r of renditions){
   const folder=join(dir,r.name);await (await import("node:fs/promises")).mkdir(folder,{recursive:true});
   await ff(["-y","-i",input,"-vf",`scale=w='min(1280,iw)':h='min(${r.height},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`,"-c:v","libx264","-preset","veryfast","-profile:v","main","-crf","23","-maxrate",String(Math.round(r.bandwidth*.9)),"-bufsize",String(r.bandwidth*2),"-c:a","aac","-b:a","96k","-ac","2","-f","hls","-hls_time","6","-hls_playlist_type","vod","-hls_flags","independent_segments","-hls_segment_filename",join(folder,"segment_%05d.ts"),join(folder,"index.m3u8")],dir);
   const outHeight=Math.min(r.height,Number(video.height));\n   const outWidth=Math.min(1280,Math.floor((Number(video.width)*outHeight/Number(video.height))/2)*2);\n   outputs.push({...r,folder,width:outWidth,height:outHeight});
  }
  const thumb=join(dir,"thumbnail.jpg");
  await ff(["-y","-ss",String(Math.min(1,Math.max(0,duration/4))),"-i",input,"-frames:v","1","-vf","scale=w=640:h=-2","-q:v","4",thumb],dir);
  const master=["#EXTM3U","#EXT-X-VERSION:3",...outputs.flatMap(r=>[`#EXT-X-STREAM-INF:BANDWIDTH=${r.bandwidth},RESOLUTION=${r.width}x${r.height}`,r.name+"/index.m3u8"])].join("\n")+"\n";
  const prefix="videos/hls/"+d.video_id+"/",playlist=Buffer.from(master);
  await putObject(b2,e.B2_BUCKET_NAME,prefix+"master.m3u8",playlist,"application/vnd.apple.mpegurl");
  const generated=[];
  for(const r of outputs){
   for(const n of await readdir(r.folder)){
    const file=join(r.folder,n),body=await readFile(file),key=prefix+r.name+"/"+n;
    const type=n.endsWith(".m3u8")?"application/vnd.apple.mpegurl":"video/mp2t";
    await putObject(b2,e.B2_BUCKET_NAME,key,body,type);generated.push({key,body,type});
   }
  }
  const thumbnail=await readFile(thumb),thumbnailKey=prefix+"thumbnail.jpg";
  await putObject(b2,e.B2_BUCKET_NAME,thumbnailKey,thumbnail,"image/jpeg");
  await putObject(tg,e.TIGRIS_BUCKET_NAME,d.source_key,bytes,obj.ContentType||"application/octet-stream",{sha256:hash});
  const check=await tg.send(new HeadObjectCommand({Bucket:e.TIGRIS_BUCKET_NAME,Key:d.source_key}));
  if(check.Metadata?.sha256!==hash||Number(check.ContentLength)!==bytes.length)throw Error("Tigris checksum verification failed");
  // Keep a complete independent backup of every published HLS object and verify each copy.
  const backupObjects=[{key:prefix+"master.m3u8",body:playlist,type:"application/vnd.apple.mpegurl"},...generated,{key:thumbnailKey,body:thumbnail,type:"image/jpeg"}];
  for(const item of backupObjects){
   await putObject(tg,e.TIGRIS_BUCKET_NAME,item.key,item.body,item.type,{sha256:createHash("sha256").update(item.body).digest("hex")});
  }
  return {status:"ready",hls_key:prefix+"master.m3u8",thumbnail_key:thumbnailKey,duration_seconds:duration,width:Number(video.width),height:Number(video.height),sha256:hash,backup:"verified",renditions:outputs.map(x=>x.name),backup_objects:backupObjects.length+1};
 }finally{await rm(dir,{recursive:true,force:true});}
}
async function playbackPlaylist(key){
 if(!safe(key)||!key.startsWith("videos/hls/")||!key.endsWith(".m3u8"))throw Error("invalid playlist");
 const obj=await b2.send(new GetObjectCommand({Bucket:e.B2_BUCKET_NAME,Key:key}));let source="";
 for await(const c of obj.Body)source+=c.toString();
 const base=key.slice(0,key.lastIndexOf("/")+1),lines=source.split(/\r?\n/),rewritten=[];
 for(const line of lines){
  if(!line||line.startsWith("#")){rewritten.push(line);continue;}
  const child=base+line;
  if(line.endsWith(".m3u8")){rewritten.push("__CENPAYA_PLAYLIST__/"+encodeURIComponent(child));continue;}
  const signed=await getSignedUrl(b2,new GetObjectCommand({Bucket:e.B2_BUCKET_NAME,Key:child}),{expiresIn:900});
  rewritten.push(signed);
 }
 return rewritten.join("\n");
}
http.createServer(async(req,res)=>{try{
 if(!auth(req)){res.writeHead(401).end();return;}
 const u=new URL(req.url,"http://localhost");
 if(req.method==="GET"&&u.pathname==="/health"){res.writeHead(200).end("ok");return;}
 if(req.method==="GET"&&u.pathname==="/v1/playback"){
  const key=u.searchParams.get("key")||"",playlist=await playbackPlaylist(key);
  res.writeHead(200,{"content-type":"application/vnd.apple.mpegurl","cache-control":"private, no-store","access-control-allow-origin":"*"}).end(playlist);return;
 }
 const d=await body(req);let out;
 if(u.pathname==="/v1/uploads"&&req.method==="POST"){
  if(!safe(d.object_key)||!d.object_key.startsWith("videos/source/")||!Number.isSafeInteger(d.size_bytes)||d.size_bytes>524288000)throw Error("invalid upload");
  out={upload_url:await getSignedUrl(b2,new PutObjectCommand({Bucket:e.B2_BUCKET_NAME,Key:d.object_key,ContentType:d.mime_type}),{expiresIn:900}),expires_at:new Date(Date.now()+900000).toISOString()};
 }else if(u.pathname==="/v1/process"&&req.method==="POST")out=await processVideo(d);
 else{res.writeHead(404).end();return;}
 res.writeHead(200,{"content-type":"application/json"}).end(JSON.stringify(out));
 }catch(err){res.writeHead(400,{"content-type":"application/json"}).end(JSON.stringify({error:err.message||"failed"}));}
}).listen(Number(e.PORT||8080),"0.0.0.0");
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
async function processVideo(d){
 if(!safe(d.source_key)||!d.source_key.startsWith("videos/source/")||!safe(d.video_id))throw Error("invalid job");
 const obj=await b2.send(new GetObjectCommand({Bucket:e.B2_BUCKET_NAME,Key:d.source_key})),chunks=[];for await(const c of obj.Body)chunks.push(c);const bytes=Buffer.concat(chunks);
 if(bytes.length!==d.source_bytes||bytes.length>524288000)throw Error("upload size mismatch");
 const hash=createHash("sha256").update(bytes).digest("hex"),dir=await mkdtemp(join(tmpdir(),"cenpaya-")),input=join(dir,"source");
 try{
  await writeFile(input,bytes);
  const probe=await new Promise((ok,no)=>{const p=spawn("ffprobe",["-v","error","-show_entries","format=duration:stream=width,height","-of","json",input]);let s="";p.stdout.on("data",x=>s+=x);p.on("close",c=>c===0?ok(JSON.parse(s)):no(Error("invalid video")));});
  const duration=Number(probe.format?.duration||0);if(!duration||duration>300)throw Error("maximum video duration is five minutes");
  await ff(["-y","-i",input,"-vf","scale=w='min(1280,iw)':h=-2","-c:v","libx264","-preset","veryfast","-crf","23","-c:a","aac","-b:a","128k","-f","hls","-hls_time","6","-hls_playlist_type","vod","-hls_segment_filename",join(dir,"segment_%05d.ts"),join(dir,"index.m3u8")],dir);
  const prefix="videos/hls/"+d.video_id+"/";for(const n of await readdir(dir)){if(n==="source")continue;const p=join(dir,n);if(!(await stat(p)).isFile())continue;await b2.send(new PutObjectCommand({Bucket:e.B2_BUCKET_NAME,Key:prefix+n,Body:await readFile(p),ContentType:n.endsWith(".m3u8")?"application/vnd.apple.mpegurl":"video/mp2t"}));}
  await tg.send(new PutObjectCommand({Bucket:e.TIGRIS_BUCKET_NAME,Key:d.source_key,Body:bytes,ContentType:obj.ContentType||"application/octet-stream",Metadata:{sha256:hash}}));
  const check=await tg.send(new HeadObjectCommand({Bucket:e.TIGRIS_BUCKET_NAME,Key:d.source_key}));if(check.Metadata?.sha256!==hash)throw Error("Tigris checksum verification failed");
  return {status:"ready",hls_key:prefix+"index.m3u8",duration_seconds:duration,sha256:hash,backup:"verified"};
 }finally{await rm(dir,{recursive:true,force:true});}
}
http.createServer(async(req,res)=>{try{if(!auth(req)){res.writeHead(401).end();return;}const u=new URL(req.url,"http://localhost");if(req.method==="GET"&&u.pathname==="/health"){res.writeHead(200).end("ok");return;}const d=await body(req);let out;if(u.pathname==="/v1/uploads"&&req.method==="POST"){if(!safe(d.object_key)||!d.object_key.startsWith("videos/source/")||!Number.isSafeInteger(d.size_bytes)||d.size_bytes>524288000)throw Error("invalid upload");out={upload_url:await getSignedUrl(b2,new PutObjectCommand({Bucket:e.B2_BUCKET_NAME,Key:d.object_key,ContentType:d.mime_type}),{expiresIn:900}),expires_at:new Date(Date.now()+900000).toISOString()};}else if(u.pathname==="/v1/process"&&req.method==="POST")out=await processVideo(d);else{res.writeHead(404).end();return;}res.writeHead(200,{"content-type":"application/json"}).end(JSON.stringify(out));}catch(err){res.writeHead(400,{"content-type":"application/json"}).end(JSON.stringify({error:err.message||"failed"}));}}).listen(Number(e.PORT||8080),"0.0.0.0");

import type { Env, User } from "./types.js";
import { uuid, constantTimeEqual } from "./security.js";
import { extractMediaKey, signMediaUrl } from "./media.js";
import { enqueueVideoCleanup } from "./video-lifecycle.js";

type Ctx={url:URL;path:string;method:string;user:User|null};
const NOW="strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const fail=(message:string,status=400)=>json({success:false,error:message},status);
const str=(v:unknown,max=1000)=>typeof v==="string"?v.trim().slice(0,max):"";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function readBody(req:Request):Promise<Record<string,unknown>|null>{try{if(req.headers.get("Content-Type")?.split(";")[0]!=="application/json")return null;const raw=await req.text();if(raw.length>64000)return null;const v=JSON.parse(raw);return v&&typeof v==="object"&&!Array.isArray(v)?v:null;}catch{return null;}}
async function internal(req:Request,env:Env){const secret=env.D1_INTERNAL_CALL_SECRET||"",given=req.headers.get("X-CenPaya-Internal-Secret")||"";return !!secret&&secret.length>=32&&constantTimeEqual(secret,given);}
async function orderFor(env:Env,id:string,user:User){return env.DB.prepare("SELECT * FROM marketplace_order_workflows WHERE order_id=? AND (buyer_id=? OR seller_id=?)").bind(id,user.id,user.id).first<Record<string,unknown>>();}
async function scheduleDeliveryVideoDeletion(env:Env,orderId:string){
 const order=await env.DB.prepare("SELECT financial_status,workflow_status FROM marketplace_order_workflows WHERE order_id=?").bind(orderId).first<{financial_status:string;workflow_status:string}>();
 if(!order||!["released","completed"].includes(order.financial_status)||!["accepted","completed"].includes(order.workflow_status))return;
 const videos=await env.DB.prepare("SELECT v.video_id FROM marketplace_order_delivery_videos v JOIN marketplace_order_deliveries d ON d.id=v.delivery_id WHERE v.order_id=? AND d.status='accepted'").bind(orderId).all<{video_id:string}>();
 for(const item of videos.results){
  await env.DB.prepare("UPDATE video_assets SET retention_expires_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND purpose='delivery' AND deleted_at IS NULL").bind(item.video_id).run();
  await enqueueVideoCleanup(env,item.video_id);
 }
}
async function filesFor(env:Env,origin:string,deliveryId:string){const rows=await env.DB.prepare("SELECT id,original_name,mime_type,file_size_bytes,r2_object_key FROM marketplace_order_delivery_files WHERE delivery_id=? ORDER BY created_at").bind(deliveryId).all<Record<string,unknown>>();return Promise.all(rows.results.map(async f=>({id:f.id,name:f.original_name,mime_type:f.mime_type,size:f.file_size_bytes,url:await signMediaUrl(env,origin,String(f.r2_object_key))})));}
export async function handleOrderWorkflowRoutes(req:Request,env:Env,ctx:Ctx):Promise<Response|null>{
 const {url,path,method,user}=ctx;
 // Authenticated financial-worker event. Only the financial system may create/synchronize order facts.
 if(path==="/internal/v1/marketplace/order-events"&&method==="POST"){
  if(!await internal(req,env))return fail("Unauthorized",401);
  const b=await readBody(req);if(!b)return fail("Valid JSON body required");
  const eventId=str(b.event_id,128),orderId=str(b.order_id,128),eventType=str(b.event_type,40);
  const buyerId=str(b.buyer_id,64),sellerId=str(b.seller_id,64),listingId=str(b.listing_id,64)||null;
  const orderType=str(b.order_type,20),financialStatus=str(b.financial_status,40);
  if(eventId.length<12||!orderId||!UUID.test(buyerId)||!UUID.test(sellerId)||buyerId===sellerId||!["goods","freelance"].includes(orderType)||!["order.created","payment.confirmed","delivery.accepted","order.disputed","order.refunded","order.cancelled","order.completed"].includes(eventType))return fail("Invalid marketplace order event");
  const status=financialStatus||"pending";
  if(!/^[a-z_]{3,40}$/.test(status))return fail("Invalid financial status");
  let receiptCreated=false;
  try{
   const receipt=await env.DB.prepare("INSERT OR IGNORE INTO marketplace_order_event_receipts(event_id,order_id,event_type) VALUES(?,?,?)").bind(eventId,orderId,eventType).run();
   receiptCreated=receipt.meta.changes>0;
   if(!receiptCreated)return json({success:true,duplicate:true});
   await env.DB.prepare("INSERT INTO marketplace_order_workflows(order_id,buyer_id,seller_id,listing_id,order_type,financial_status,workflow_status) VALUES(?,?,?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET financial_status=excluded.financial_status,workflow_status=CASE WHEN marketplace_order_workflows.workflow_status='disputed' THEN 'disputed' WHEN excluded.workflow_status IN ('accepted','disputed','completed','refunded','cancelled') THEN excluded.workflow_status ELSE marketplace_order_workflows.workflow_status END,updated_at="+NOW)
     .bind(orderId,buyerId,sellerId,listingId,orderType,status,eventType==="delivery.accepted"?"accepted":eventType==="order.disputed"?"disputed":eventType==="order.completed"?"completed":eventType==="order.refunded"?"refunded":eventType==="order.cancelled"?"cancelled":"in_progress").run();
   if(eventType==="delivery.accepted"){
    await env.DB.prepare("UPDATE marketplace_order_deliveries SET status='accepted' WHERE id=(SELECT id FROM marketplace_order_deliveries WHERE order_id=? AND status='submitted' ORDER BY version DESC LIMIT 1)").bind(orderId).run();
   }
   if(listingId&&orderType==="goods"&&(eventType==="payment.confirmed"||eventType==="order.completed")){
    await env.DB.prepare("UPDATE marketplace_listings SET sale_state='sold',sold_at=COALESCE(sold_at,"+NOW+"),purge_after=COALESCE(purge_after,strftime('%Y-%m-%dT%H:%M:%fZ','now','+15 days')) WHERE id=? AND seller_id=? AND listing_type='product' AND sale_state='available' AND deleted_at IS NULL").bind(listingId,sellerId).run();
    await env.DB.prepare("UPDATE video_assets SET retention_expires_at=(SELECT purge_after FROM marketplace_listings WHERE id=?) WHERE purpose='listing' AND related_id=? AND deleted_at IS NULL").bind(listingId,listingId).run();
   }
   if(eventType==="order.disputed"){
    await env.DB.prepare("UPDATE video_assets SET retention_expires_at=NULL WHERE purpose='delivery' AND related_id=? AND deleted_at IS NULL").bind(orderId).run();
    await env.DB.prepare("UPDATE video_cleanup_jobs SET status='failed',last_error='Retention paused because the order is disputed',updated_at="+NOW+" WHERE video_id IN (SELECT video_id FROM marketplace_order_delivery_videos WHERE order_id=?) AND status<>'completed'").bind(orderId).run();
   }
   if(eventType==="delivery.accepted"||eventType==="order.completed")await scheduleDeliveryVideoDeletion(env,orderId);
   return json({success:true});
  }catch{
   if(receiptCreated)await env.DB.prepare("DELETE FROM marketplace_order_event_receipts WHERE event_id=?").bind(eventId).run().catch(()=>undefined);
   return fail("Could not synchronize marketplace order event",503);
  }
 }
 const route=path.match(/^\/api\/market\/orders\/([^/]+)(?:\/(delivery|revision|accept|review|chat|trust))?$/);
 if(!route)return null;
 if(!user)return fail("Unauthorized",401);
 const orderId=decodeURIComponent(route[1]),action=route[2]||"";
 const order=await orderFor(env,orderId,user);
 if(!order)return fail("Order not found",404);
 const isBuyer=order.buyer_id===user.id,isSeller=order.seller_id===user.id;
 if(!action&&method==="GET"){
  const deliveries=await env.DB.prepare("SELECT id,version,delivery_note,delivery_links_json,status,ai_disclosure,created_at FROM marketplace_order_deliveries WHERE order_id=? ORDER BY version DESC").bind(orderId).all<Record<string,unknown>>();
  const data=await Promise.all(deliveries.results.map(async d=>{
   const videos=await env.DB.prepare("SELECT v.id,v.duration_seconds,v.status FROM marketplace_order_delivery_videos dv JOIN video_assets v ON v.id=dv.video_id WHERE dv.delivery_id=? AND v.deleted_at IS NULL").bind(d.id).all<Record<string,unknown>>();
   return {...d,files:await filesFor(env,url.origin,String(d.id)),videos:videos.results.map(v=>({...v,playlist_url:"/api/video-assets/"+v.id+"/playlist"}))};
  }));
  const review=await env.DB.prepare("SELECT rating,communication_rating,quality_rating,timeliness_rating,review_text,created_at FROM marketplace_order_reviews WHERE order_id=?").bind(orderId).first();
  return json({success:true,data:{...order,deliveries:data,review}});
 }
 if(action==="delivery"&&method==="POST"){
  if(!isSeller)return fail("Only the seller can submit delivery",403);
  if(!["hold","paid","in_progress","pending"].includes(String(order.financial_status)))return fail("This order is not in a deliverable financial state",409);
  const b=await readBody(req);if(!b)return fail("Valid JSON body required");
  const note=str(b.delivery_note,5000),urls=Array.isArray(b.attachment_urls)?b.attachment_urls.filter((v):v is string=>typeof v==="string").slice(0,10):[];
  const videoIds=Array.isArray(b.video_ids)?[...new Set(b.video_ids.filter((v):v is string=>typeof v==="string"))].slice(0,5):[];
  const links=Array.isArray(b.delivery_links)?b.delivery_links.filter((v):v is string=>typeof v==="string"&&/^https:\/\//i.test(v)).slice(0,5):[];
  const disclosure=str(b.ai_disclosure,32)||"unknown";
  if(!note&&!urls.length&&!links.length&&!videoIds.length)return fail("Add delivery notes, files, videos or links");
  if(!["human_created","ai_assisted","primarily_ai_generated","unknown"].includes(disclosure))return fail("Invalid AI disclosure");
  const current=await env.DB.prepare("SELECT COALESCE(MAX(version),0) AS version FROM marketplace_order_deliveries WHERE order_id=?").bind(orderId).first<{version:number}>();
  const version=Number(current?.version||0)+1,id=uuid(),statements:D1PreparedStatement[]=[];
  const fileData:Array<{key:string;name:string;mime:string;size:number}>=[];
  for(const value of urls){
   const key=await extractMediaKey(value,env,url);if(!key||!key.startsWith("marketplace/"+user.id+"/"))return fail("A delivery attachment is invalid or expired");
   const obj=await env.MEDIA_BUCKET?.head(key);
   if(!obj||obj.customMetadata?.ownerId!==user.id||!obj.customMetadata?.purpose?.includes("document"))return fail("Delivery file not found or not owned by seller",404);
   const used=await env.DB.prepare("SELECT 1 FROM marketplace_order_delivery_files WHERE r2_object_key=?").bind(key).first();if(used)return fail("This file was already submitted; upload it again",409);
   fileData.push({key,name:String(obj.customMetadata?.originalName||"Attachment"),mime:String(obj.httpMetadata?.contentType||"application/octet-stream"),size:obj.size});
  }
  for(const videoId of videoIds){
   const video=await env.DB.prepare("SELECT id,duration_seconds FROM video_assets WHERE id=? AND owner_id=? AND purpose='delivery' AND related_id=? AND status='ready' AND deleted_at IS NULL AND duration_seconds<=180").bind(videoId,user.id,orderId).first<{id:string;duration_seconds:number}>();
   if(!video)return fail("A delivery video is not processed, owned by you, or exceeds the 3-minute limit",409);
   const used=await env.DB.prepare("SELECT 1 FROM marketplace_order_delivery_videos WHERE video_id=?").bind(videoId).first();
   if(used)return fail("A delivery video can only be submitted once",409);
  }
  statements.push(env.DB.prepare("INSERT INTO marketplace_order_deliveries(id,order_id,seller_id,version,delivery_note,delivery_links_json,ai_disclosure) VALUES(?,?,?,?,?,?,?)").bind(id,orderId,user.id,version,note,JSON.stringify(links),disclosure));
  for(const f of fileData)statements.push(env.DB.prepare("INSERT INTO marketplace_order_delivery_files(id,delivery_id,order_id,owner_id,r2_object_key,original_name,mime_type,file_size_bytes) VALUES(?,?,?,?,?,?,?,?)").bind(uuid(),id,orderId,user.id,f.key,f.name,f.mime,f.size));
  for(const videoId of videoIds)statements.push(env.DB.prepare("INSERT INTO marketplace_order_delivery_videos(delivery_id,order_id,video_id,owner_id) VALUES(?,?,?,?)").bind(id,orderId,videoId,user.id));
  statements.push(env.DB.prepare("UPDATE marketplace_order_deliveries SET status='superseded' WHERE order_id=? AND id<>? AND status IN ('submitted','revision_requested')").bind(orderId,id));
  statements.push(env.DB.prepare("UPDATE marketplace_order_workflows SET workflow_status='delivered',updated_at="+NOW+" WHERE order_id=?").bind(orderId));
  await env.DB.batch(statements);
  return json({success:true,data:{id,version,status:"submitted"}},201);
 }
 if(action==="revision"&&method==="POST"){
  if(!isBuyer)return fail("Only the buyer can request a revision",403);
  const b=await readBody(req);if(!b)return fail("Valid JSON body required");
  const reason=str(b.reason,2000);if(reason.length<10)return fail("Please explain the requested changes (at least 10 characters)");
  const latest=await env.DB.prepare("SELECT id FROM marketplace_order_deliveries WHERE order_id=? AND status='submitted' ORDER BY version DESC LIMIT 1").bind(orderId).first<{id:string}>();
  if(!latest)return fail("There is no delivery awaiting review",409);
  await env.DB.batch([
   env.DB.prepare("UPDATE marketplace_order_deliveries SET status='revision_requested' WHERE id=?").bind(latest.id),
   env.DB.prepare("UPDATE marketplace_order_workflows SET workflow_status='revision_requested',updated_at="+NOW+" WHERE order_id=?").bind(orderId),
   env.DB.prepare("INSERT INTO marketplace_trust_disclosures(id,order_id,user_id,content_kind,content_purpose,ai_disclosure,notes) VALUES(?,?,?,'text','other','unknown',?)").bind(uuid(),orderId,user.id,"Buyer revision request: "+reason)
  ]);
  return json({success:true,status:"revision_requested"});
 }
 if(action==="accept"&&method==="POST"){
  if(!isBuyer)return fail("Only the buyer can accept delivery",403);
  const latest=await env.DB.prepare("SELECT id FROM marketplace_order_deliveries WHERE order_id=? AND status='submitted' ORDER BY version DESC LIMIT 1").bind(orderId).first<{id:string}>();
  if(!latest)return fail("There is no delivery awaiting acceptance",409);
  // Acceptance is recorded in D1 only. The financial worker remains solely responsible for releasing escrow.
  await env.DB.batch([
   env.DB.prepare("UPDATE marketplace_order_deliveries SET status='accepted' WHERE id=?").bind(latest.id),
   env.DB.prepare("UPDATE marketplace_order_workflows SET workflow_status='accepted',updated_at="+NOW+" WHERE order_id=?").bind(orderId)
  ]);
  await scheduleDeliveryVideoDeletion(env,orderId);
  return json({success:true,status:"accepted",financial_action_required:true,message:"Delivery accepted. Financial settlement remains with the payment service."});
 }
 if(action==="review"&&method==="POST"){
  if(!isBuyer)return fail("Only the buyer can review this order",403);
  if(order.financial_status!=="released"&&order.financial_status!=="completed")return fail("Reviews are available after the financial order is completed",409);
  const b=await readBody(req);if(!b)return fail("Valid JSON body required");
  const rating=Number(b.rating),communication=b.communication_rating==null?null:Number(b.communication_rating),quality=b.quality_rating==null?null:Number(b.quality_rating),timeliness=b.timeliness_rating==null?null:Number(b.timeliness_rating),reviewText=str(b.review_text,2000);
  if(!Number.isInteger(rating)||rating<1||rating>5||[communication,quality,timeliness].some(v=>v!==null&&(!Number.isInteger(v)||v<1||v>5)))return fail("Ratings must be whole numbers from 1 to 5");
  try{
   await env.DB.prepare("INSERT INTO marketplace_order_reviews(id,order_id,listing_id,buyer_id,seller_id,rating,communication_rating,quality_rating,timeliness_rating,review_text) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .bind(uuid(),orderId,order.listing_id,user.id,order.seller_id,rating,communication,quality,timeliness,reviewText).run();
   return json({success:true},201);
  }catch{return fail("A review already exists for this order or could not be saved",409);}
 }
 if(action==="chat"&&method==="POST"){
  const b=await readBody(req);if(!b)return fail("Valid JSON body required");
  const threadId=str(b.thread_id,64);if(!threadId)return fail("A chat thread is required");
  const members=await env.DB.prepare("SELECT COUNT(*) AS total FROM chat_thread_members WHERE thread_id=? AND user_id IN (?,?) AND left_at IS NULL").bind(threadId,order.buyer_id,order.seller_id).first<{total:number}>();
  if(Number(members?.total)!==2)return fail("The order chat must include both buyer and seller",403);
  await env.DB.prepare("INSERT INTO marketplace_order_chat_links(order_id,thread_id,linked_by) VALUES(?,?,?) ON CONFLICT(order_id) DO UPDATE SET thread_id=excluded.thread_id,linked_by=excluded.linked_by").bind(orderId,threadId,user.id).run();
  await env.DB.prepare("UPDATE marketplace_order_workflows SET chat_thread_id=?,updated_at="+NOW+" WHERE order_id=?").bind(threadId,orderId).run();
  return json({success:true,thread_id:threadId});
 }
 if(action==="trust"&&method==="POST"){
  const b=await readBody(req);if(!b)return fail("Valid JSON body required");
  const kind=str(b.content_kind,20),purpose=str(b.content_purpose,40),disclosure=str(b.ai_disclosure,32)||"unknown",notes=str(b.notes,1000);
  if(!["text","image","document","delivery"].includes(kind)||!["product_presentation","actual_product_photo","proof_of_condition","proof_of_shipment","freelance_work","other"].includes(purpose)||!["human_created","ai_assisted","primarily_ai_generated","unknown"].includes(disclosure))return fail("Invalid authenticity disclosure");
  if((purpose==="proof_of_condition"||purpose==="proof_of_shipment")&&disclosure==="primarily_ai_generated")return fail("AI-generated imagery cannot be submitted as genuine proof of item condition or shipment");
  await env.DB.prepare("INSERT INTO marketplace_trust_disclosures(id,order_id,listing_id,user_id,content_kind,content_purpose,ai_disclosure,notes) VALUES(?,?,?,?,?,?,?,?)").bind(uuid(),orderId,order.listing_id,user.id,kind,purpose,disclosure,notes).run();
  return json({success:true,review_required:false},201);
 }
 return fail("Method not allowed",405);
}

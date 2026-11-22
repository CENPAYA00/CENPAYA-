import type { Env, User } from "./types.js";
import { uuid, constantTimeEqual } from "./security.js";
import { extractMediaKey, hydratePosts, resolveMediaUrl } from "./media.js";
type RouteContext = { url: URL; path: string; method: string; user: User | null };
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const fail=(message:string,status=400)=>json({success:false,error:message},status);
const str=(v:unknown,max=500)=>typeof v==="string"?v.trim().slice(0,max):"";
const jsonArray=(value:unknown):unknown[]=>{if(Array.isArray(value))return value;if(typeof value!=="string"||!value)return[];try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[];}catch{return[];}};
async function body(request:Request):Promise<Record<string,unknown>|null>{
  const type=request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if(type!=="application/json")return null;
  const length=Number(request.headers.get("Content-Length")||0);if(length>64_000)return null;
  try{const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>64_000)return null;const value:unknown=JSON.parse(raw);return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;}catch{return null;}
}

export async function handleMarketplaceRoutes(request:Request,env:Env,context:RouteContext):Promise<Response|null>{
  const {url,path,method,user}=context;
  const internalListingQuote=path.match(/^\/internal\/v1\/market\/listings\/([^/]+)\/quote$/);
  if(internalListingQuote&&method==="GET"){
    const configuredSecret=env.D1_INTERNAL_CALL_SECRET||"";
    const suppliedSecret=request.headers.get("X-CenPaya-Internal-Secret")||"";
    if(!configuredSecret||!constantTimeEqual(suppliedSecret,configuredSecret))return fail("Unauthorized",401);
    const row=await env.DB.prepare("SELECT * FROM public_marketplace_search WHERE listing_id=?").bind(decodeURIComponent(internalListingQuote[1])).first<Record<string,unknown>>();
    if(!row)return fail("Listing not found",404);
    const data={...row,listing_id:row.listing_id||row.id,id:row.listing_id||row.id,title:row.product_title||row.title,price:row.product_price??row.price_amount??row.price,seller_id:row.seller_id||row.merchant_id,images:row.images||(row.image_url?[row.image_url]:[]),currency_code:row.currency_code||row.currency||"XAF"};
    return json({success:true,data});
  }
  const publicListing=path.match(/^\/api\/market\/listings\/([^/]+)$/);
  if(publicListing&&method==="GET"){
    const viewerId=user?.id||null;
    const row=await env.DB.prepare(`SELECT l.*,u.username AS merchant_name,u.display_name AS merchant_display_name,u.avatar_url AS merchant_avatar_url,u.is_premium AS merchant_is_premium,c.name AS category,
      (SELECT AVG(r.rating) FROM marketplace_reviews r WHERE r.listing_id=l.id AND r.status='published') AS rating,
      (SELECT COUNT(*) FROM marketplace_reviews r WHERE r.listing_id=l.id AND r.status='published') AS reviews_count,
      (SELECT COUNT(*) FROM marketplace_order_projections o WHERE o.listing_id=l.id) AS orders_count
      FROM marketplace_listings l JOIN users u ON u.id=l.seller_id JOIN marketplace_categories c ON c.id=l.category_id
      WHERE l.id=? AND l.deleted_at IS NULL AND ((l.status='active' AND l.moderation_status='approved' AND u.account_status='active' AND u.banned=0 AND u.deleted_at IS NULL
        AND (l.hide_from_friends=0 OR ? IS NULL OR NOT EXISTS(SELECT 1 FROM friendships fr WHERE (fr.user_a_id=? AND fr.user_b_id=l.seller_id) OR (fr.user_a_id=l.seller_id AND fr.user_b_id=?)))
        AND (? IS NULL OR NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=? AND b.blocked_id=l.seller_id) OR (b.blocker_id=l.seller_id AND b.blocked_id=?)))) OR l.seller_id=?)`)
      .bind(decodeURIComponent(publicListing[1]),viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,user?.id||"").first<Record<string,unknown>>();
    if(!row)return fail("Listing not found",404);
    const images=(await Promise.all(jsonArray(row.images_json).map(value=>resolveMediaUrl(value,env,url.origin)))).filter((value):value is string=>!!value);
    const documents=(await Promise.all(jsonArray(row.documents_json).map(value=>resolveMediaUrl(value,env,url.origin)))).filter((value):value is string=>!!value);
    const data={...row,id:row.id,listing_id:row.id,title:row.title,price:row.price_amount,starting_price:row.price_amount,images,documents,thumbnail_url:images[0]||null,seller_id:row.seller_id,delivery_days:row.estimated_delivery_days};
    return json({success:true,data});
  }
  if(publicListing&&method==="DELETE"){
    if(!user)return fail("Unauthorized",401);
    const result=await env.DB.prepare("UPDATE marketplace_listings SET status='removed',deleted_at="+NOW+" WHERE id=? AND seller_id=? AND deleted_at IS NULL").bind(decodeURIComponent(publicListing[1]),user.id).run();
    return result.meta.changes?json({success:true}):fail("Listing not found",404);
  }
  const listingPackages=path.match(/^\/api\/market\/listings\/([^/]+)\/packages$/);
  if(listingPackages&&method==="GET"){
    const row=await env.DB.prepare("SELECT id FROM marketplace_listings WHERE id=? AND deleted_at IS NULL AND (status='active' OR seller_id=?)").bind(decodeURIComponent(listingPackages[1]),user?.id||"").first();
    if(!row)return fail("Listing not found",404);
    // The exported D1 schema has no service-package table. Never fabricate package rows.
    return json({success:true,data:[]});
  }
  if((path==="/api/market/my-listings"||path==="/api/market/my-services")&&method==="GET"){
    if(!user)return fail("Unauthorized",401);
    const type=path.endsWith("my-services")?"service":"product";
    const rows=await env.DB.prepare(`SELECT l.id,l.seller_id,l.category_id,l.title,l.description,l.listing_type,l.condition,l.price_type,l.price_amount,l.currency_code,l.country_code,l.region,l.city,l.status,l.published_at,l.created_at,l.updated_at,l.price_is_range,l.price_min,l.price_max,l.estimated_delivery_days,l.images_json,l.documents_json,c.name AS category
      FROM marketplace_listings l JOIN marketplace_categories c ON c.id=l.category_id
      WHERE l.seller_id=? AND l.listing_type=? AND l.deleted_at IS NULL ORDER BY l.created_at DESC LIMIT 100`).bind(user.id,type).all();
    const data=await Promise.all(rows.results.map(async(row:any)=>{
      const images=(await Promise.all(jsonArray(row.images_json).map(value=>resolveMediaUrl(value,env,url.origin)))).filter((value):value is string=>!!value);
      const documents=(await Promise.all(jsonArray(row.documents_json).map(value=>resolveMediaUrl(value,env,url.origin)))).filter((value):value is string=>!!value);
      return {...row,price:row.price_amount,starting_price:row.price_amount,images,documents};
    }));
    return json({success:true,data});
  }
  if(path==="/api/market/config"&&method==="GET"){
    const country=str(url.searchParams.get("country"),2).toUpperCase();
    const row=country?await env.DB.prepare("SELECT country_code,currency_code,phone_prefix FROM supported_countries WHERE country_code=? AND status='active'").bind(country).first():null;
    return json({success:true,data:row||null});
  }
  if(path==="/api/feed"&&method==="GET"){
    const limit=Math.min(Math.max(Number(url.searchParams.get("limit")||20),1),50);
    const offset=Math.min(Math.max(Number(url.searchParams.get("offset")||0),0),5000);
    const before=url.searchParams.get("before");
    const viewerId=user?.id||null;
    const rows=await env.DB.prepare(`SELECT p.*,
      u.username,u.display_name,u.avatar_url,
      (SELECT COUNT(*) FROM post_reactions r WHERE r.post_id=p.id) AS likes_count,
      (SELECT COUNT(*) FROM post_comments c WHERE c.post_id=p.id AND c.status='published' AND c.deleted_at IS NULL) AS comments_count,
      CASE WHEN ? IS NOT NULL AND EXISTS(SELECT 1 FROM post_reactions r WHERE r.post_id=p.id AND r.user_id=?) THEN 1 ELSE 0 END AS is_liked,
      CASE WHEN ? IS NOT NULL AND EXISTS(SELECT 1 FROM post_bookmarks b WHERE b.post_id=p.id AND b.user_id=?) THEN 1 ELSE 0 END AS is_saved,
      CASE WHEN ? IS NOT NULL AND EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id=? AND f.following_id=p.author_id) THEN 1 ELSE 0 END AS is_following_author
      FROM posts p JOIN users u ON u.id=p.author_id
      WHERE p.status='published' AND p.deleted_at IS NULL
      AND u.account_status='active' AND u.banned=0 AND u.deleted_at IS NULL
      AND (p.visibility='public' OR p.author_id=? OR
        (p.visibility='followers' AND ? IS NOT NULL AND EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id=? AND f.following_id=p.author_id)) OR
        (p.visibility='friends' AND ? IS NOT NULL AND EXISTS(SELECT 1 FROM friendships fr WHERE (fr.user_a_id=? AND fr.user_b_id=p.author_id) OR (fr.user_a_id=p.author_id AND fr.user_b_id=?))))
      AND (? IS NULL OR NOT EXISTS(SELECT 1 FROM user_feed_post_preferences fp WHERE fp.user_id=? AND fp.post_id=p.id AND fp.preference='not_interested'))
      AND (? IS NULL OR NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=? AND b.blocked_id=p.author_id) OR (b.blocker_id=p.author_id AND b.blocked_id=?)))
      ${before?"AND p.created_at < ?":""}
      ORDER BY COALESCE(p.published_at,p.created_at) DESC LIMIT ? OFFSET ?`)
      .bind(viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,...(before?[before]:[]),limit,offset).all();
    return json({success:true,data:await hydratePosts(env,url.origin,rows.results as Array<Record<string,unknown>>)});
  }
  if(path==="/api/posts"&&method==="POST"){
    if(!user)return fail("Unauthorized",401);
    const b=await body(request);if(!b)return fail("Valid JSON body required");
    const content=str(b.content,10000),visibility=str(b.visibility,20)||"public";
    const mediaInput=Array.isArray(b.media_urls)?b.media_urls:(typeof b.image_url==="string"?b.image_url.split(","):[]);
    const mediaUrls=mediaInput.filter((value):value is string=>typeof value==="string"&&value.length<=2048).slice(0,10);
    if(!content&&!mediaUrls.length)return fail("Write something or add a photo");
    if(!["public","followers","friends","private"].includes(visibility))return fail("Invalid post visibility");
    if(mediaInput.length>10)return fail("A post can contain up to 10 images");
    if(mediaUrls.length&&(!env.MEDIA_BUCKET||(env.MEDIA_URL_SIGNING_SECRET||"").length<32))return fail("R2 media storage is not configured",503);
    const id=uuid();
    const backgroundId=str(b.background_id,40)||null;
    if(backgroundId&&!/^[a-z0-9_-]{1,40}$/i.test(backgroundId))return fail("Invalid post background");
    const feeling=str(b.feeling,100)||null,feelingEmoji=str(b.feeling_emoji,24)||null;
    const feelingKind=str(b.feeling_kind,20)||null;
    if(feelingKind&&!["feeling","activity"].includes(feelingKind))return fail("Invalid feeling type");
    const mediaStatements: D1PreparedStatement[] = [];
    for(let index=0;index<mediaUrls.length;index++){
      const key=await extractMediaKey(mediaUrls[index],env,url);
      if(!key||!key.startsWith(["posts",user.id,""].join("/")))return fail("A post image upload is invalid or expired");
      const object=await env.MEDIA_BUCKET!.head(key);
      const mime=object?.httpMetadata?.contentType||"";
      if(!object||object.customMetadata?.ownerId!==user.id||!mime.startsWith("image/"))return fail("Uploaded post image not found or not owned by this account",404);
      mediaStatements.push(env.DB.prepare("INSERT INTO post_media(id,post_id,media_type,r2_object_key,mime_type,file_size_bytes,position) VALUES(?,?,'image',?,?,?,?)")
        .bind(uuid(),id,key,mime,object.size,index));
    }
    const rawTagged=Array.isArray(b.tagged_user_ids)?b.tagged_user_ids:[];
    if(rawTagged.length>20)return fail("You can tag up to 20 people in one post");
    const taggedIds=[...new Set(rawTagged.filter((value):value is string=>typeof value==="string").map(value=>value.trim()))].filter(value=>value&&value!==user.id);
    const tagStatements: D1PreparedStatement[] = [];
    for(const targetId of taggedIds){
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId))return fail("Invalid tagged user");
      const target=await env.DB.prepare("SELECT id FROM users WHERE id=? AND account_status='active' AND banned=0 AND deleted_at IS NULL").bind(targetId).first();
      if(!target)return fail("A tagged user was not found",404);
      const blocked=await env.DB.prepare("SELECT 1 FROM user_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)").bind(user.id,targetId,targetId,user.id).first();
      if(blocked)return fail("You cannot tag a user who has blocked you or whom you blocked",403);
      const settings=await env.DB.prepare("SELECT tagging_audience,tagging_visibility FROM user_privacy_settings WHERE user_id=?").bind(targetId).first<{tagging_audience:string;tagging_visibility:string}>();
      const audience=settings?.tagging_audience||"everyone",legacy=settings?.tagging_visibility||"everyone";
      if(audience==="nobody"||legacy==="nobody")return fail("A tagged user does not allow tagging",403);
      if(audience==="following"){
        const follows=await env.DB.prepare("SELECT 1 FROM user_follows WHERE follower_id=? AND following_id=?").bind(user.id,targetId).first();
        if(!follows)return fail("You must follow a tagged user before tagging them",403);
      }
      if(legacy==="friends"){
        const [a,bUser]=[user.id,targetId].sort();
        const friends=await env.DB.prepare("SELECT 1 FROM friendships WHERE user_a_id=? AND user_b_id=?").bind(a,bUser).first();
        if(!friends)return fail("Only friends can tag this user",403);
      }
      tagStatements.push(env.DB.prepare("INSERT INTO post_tagged_users(id,post_id,tagged_user_id,tagged_by_user_id) VALUES(?,?,?,?)").bind(uuid(),id,targetId,user.id));
      tagStatements.push(env.DB.prepare("INSERT INTO notifications(id,recipient_id,actor_id,notification_type,entity_type,entity_id,title,body,link_url) VALUES(?,?,?,'system','post',?,'You were tagged in a post',?,?)")
        .bind(uuid(),targetId,user.id,id,user.display_name+" tagged you in a post.","/post/"+id));
    }
    const postType=mediaUrls.length?"image":"text";
    const postStatement=env.DB.prepare("INSERT INTO posts(id,author_id,content,post_type,visibility,status,published_at,background_id,feeling,feeling_emoji,feeling_kind) VALUES(?,?,?,?,?,'published',"+NOW+",?,?,?,?)")
      .bind(id,user.id,content||null,postType,visibility,backgroundId,feeling,feelingEmoji,feelingKind);
    await env.DB.batch([postStatement,...mediaStatements,...tagStatements]);
    return json({success:true,id},201);
  }
  if(path==="/api/market/categories"&&method==="GET"){
    const rows=await env.DB.prepare("SELECT id,parent_id,name,slug,description,category_type,category_type AS listing_type,position,icon,section FROM marketplace_categories WHERE status='active' ORDER BY position,name").all();
    return json({success:true,data:rows.results});
  }
  if(path==="/api/market/search"&&method==="GET"){
    const q=str(url.searchParams.get("q"),100).replace(/[%_]/g,""),category=str(url.searchParams.get("category_id"),64),country=str(url.searchParams.get("country"),2).toUpperCase(),listingType=str(url.searchParams.get("type"),20);
    const limit=Math.min(Math.max(Number(url.searchParams.get("limit")||24),1),50),offset=Math.max(Number(url.searchParams.get("offset")||0),0);
    const where:string[]=["l.status='active'","l.deleted_at IS NULL","l.moderation_status='approved'","u.account_status='active'","u.banned=0","u.deleted_at IS NULL"];const values:unknown[]=[];
    if(q){where.push("s.product_title LIKE ?");values.push("%"+q+"%");}
    if(category){where.push("s.category_id=?");values.push(category);}
    if(country){where.push("s.country_code=?");values.push(country);}
    if(listingType==="product"||listingType==="service"){where.push("s.listing_type=?");values.push(listingType);}
    const viewerId=user?.id||null;
    where.push("(l.hide_from_friends=0 OR ? IS NULL OR NOT EXISTS(SELECT 1 FROM friendships fr WHERE (fr.user_a_id=? AND fr.user_b_id=l.seller_id) OR (fr.user_a_id=l.seller_id AND fr.user_b_id=?)))");values.push(viewerId,viewerId,viewerId);
    where.push("(? IS NULL OR NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=? AND b.blocked_id=l.seller_id) OR (b.blocker_id=l.seller_id AND b.blocked_id=?)))");values.push(viewerId,viewerId,viewerId);
    const rows=await env.DB.prepare("SELECT s.*,l.seller_id,l.description,l.price_type,l.price_is_range,l.price_min,l.price_max,l.images_json,l.documents_json,l.estimated_delivery_days,u.avatar_url AS seller_avatar_url,u.is_premium AS seller_is_premium FROM public_marketplace_search s JOIN marketplace_listings l ON l.id=s.listing_id JOIN users u ON u.id=l.seller_id WHERE "+where.join(" AND ")+" ORDER BY s.is_boosted DESC,s.published_date DESC LIMIT ? OFFSET ?").bind(...values,limit,offset).all();
    const data=await Promise.all(rows.results.map(async(row:any)=>{
      const images=(await Promise.all(jsonArray(row.images_json).map(value=>resolveMediaUrl(value,env,url.origin)))).filter((value):value is string=>!!value);
      const documents=(await Promise.all(jsonArray(row.documents_json).map(value=>resolveMediaUrl(value,env,url.origin)))).filter((value):value is string=>!!value);
      return {...row,images,documents};
    }));
    return json({success:true,data});
  }
  if(path==="/api/market/listings"&&method==="POST"){
    if(!user)return fail("Unauthorized",401);
    const b=await body(request);if(!b)return fail("Valid JSON body required");
    const title=str(b.title,160),description=str(b.description,10000),category=str(b.category_id,64),type=str(b.listing_type,30),country=str(b.country_code,2).toUpperCase();
    const priceType=str(b.price_type,20)||"fixed",priceAmount=b.price_amount,currency=str(b.currency_code,3).toUpperCase();
    if(!title||!description||!category||! /^[A-Z]{2}$/.test(country)||!["product","service"].includes(type))return fail("Title, description, category, country and valid listing type required");
    if(!["fixed","negotiable","contact"].includes(priceType))return fail("Invalid price type");
    if(priceType!=="contact"&&(!Number.isSafeInteger(priceAmount)||Number(priceAmount)<0||! /^[A-Z]{3}$/.test(currency)))return fail("Fixed or negotiable listings require a non-negative integer price and three-letter currency");
    const cat=await env.DB.prepare("SELECT id,category_type FROM marketplace_categories WHERE (id=? OR lower(name)=lower(?) OR lower(slug)=lower(?)) AND status='active' LIMIT 1").bind(category,category,category).first<{id:string;category_type:string}>();
    if(!cat)return fail("Category not found",404);
    if(cat.category_type!=="both"&&cat.category_type!==type)return fail("Listing type does not match category",400);
    const id=uuid();
    const priceIsRange=b.price_is_range===true;
    const priceMin=priceIsRange?Number(b.price_min??priceAmount):Number(priceAmount);
    const priceMax=priceIsRange?Number(b.price_max??priceMin):Number(priceAmount);
    if(priceIsRange&&(!Number.isSafeInteger(priceMin)||!Number.isSafeInteger(priceMax)||priceMin<0||priceMax<priceMin))return fail("Invalid price range");
    const requestedDeliveryDays=Number(b.delivery_days??3);
    const deliveryDays=Number.isFinite(requestedDeliveryDays)?Math.min(Math.max(Math.floor(requestedDeliveryDays),1),365):3;
    if(priceIsRange&&priceType!=="negotiable")return fail("Price ranges require negotiable pricing");
    const region=str(b.region,100)||null,city=str(b.city,100)||null;
    const availability=str(b.availability,40)||null;
    const deliveryRequired=b.delivery_required===true||Number(b.delivery_required)===1?1:0;
    const hideFromFriends=b.hide_from_friends===true||Number(b.hide_from_friends)===1?1:0;
    const imageUrls=jsonArray(b.images_json).filter((x):x is string=>typeof x==="string"&&x.length<=2048).slice(0,10);
    const documentUrls=jsonArray(b.documents_json).filter((x):x is string=>typeof x==="string"&&x.length<=2048).slice(0,5);
    if((imageUrls.length||documentUrls.length)&&(!env.MEDIA_BUCKET||(env.MEDIA_URL_SIGNING_SECRET||"").length<32))return fail("R2 media storage is not configured",503);
    const imageKeys:string[]=[],documentKeys:string[]=[];
    for(const value of imageUrls){
      const key=await extractMediaKey(value,env,url);
      const expectedPrefix=["marketplace",user.id,type==="service"?"services-images":"listings-images",""].join("/");
      if(!key||!key.startsWith(expectedPrefix))return fail("An image upload is invalid or expired");
      imageKeys.push(key);
    }
    for(const value of documentUrls){
      const key=await extractMediaKey(value,env,url);
      const expectedPrefix=["marketplace",user.id,type==="service"?"services-documents":"listings-documents",""].join("/");
      if(!key||!key.startsWith(expectedPrefix))return fail("A document upload is invalid or expired");
      documentKeys.push(key);
    }
    const mediaStatements: D1PreparedStatement[] = [];
    for(let index=0;index<imageKeys.length;index++){
      const key=imageKeys[index];
      const object=await env.MEDIA_BUCKET!.head(key);
      if(!object||object.customMetadata?.ownerId!==user.id)return fail("Uploaded image not found or not owned by this account",404);
      mediaStatements.push(env.DB.prepare("INSERT INTO marketplace_listing_media(id,listing_id,r2_object_key,mime_type,file_size_bytes,position) VALUES(?,?,?,?,?,?)")
        .bind(uuid(),id,key,object.httpMetadata?.contentType||"application/octet-stream",object.size,index));
    }
    for(const key of documentKeys){
      const object=await env.MEDIA_BUCKET!.head(key);
      if(!object||object.customMetadata?.ownerId!==user.id)return fail("Uploaded document not found or not owned by this account",404);
    }
    const listingStatement=env.DB.prepare("INSERT INTO marketplace_listings(id,seller_id,category_id,title,description,listing_type,price_type,price_amount,currency_code,country_code,region,city,status,published_at,delivery_required,availability,hide_from_friends,price_is_range,price_min,price_max,images_json,documents_json,estimated_delivery_days) VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'active',"+NOW+",?,?,?,?,?,?,?,?,?)")
      .bind(id,user.id,cat.id,title,description,type,priceType,priceType==="contact"?null:priceIsRange?priceMin:Number(priceAmount),priceType==="contact"?null:currency,country,region,city,deliveryRequired,availability,hideFromFriends,priceIsRange?1:0,priceIsRange?priceMin:null,priceIsRange?priceMax:null,JSON.stringify(imageKeys),JSON.stringify(documentKeys),deliveryDays);
    await env.DB.batch([listingStatement,...mediaStatements]);
    return json({success:true,id,status:"active"},201);
  }

  return null;
}

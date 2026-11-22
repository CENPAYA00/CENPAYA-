import type { Env, User } from "./types.js";
import { uuid, constantTimeEqual } from "./security.js";
import { handleSearchRoute } from "./search.js";
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
  const searchResponse=await handleSearchRoute(request,env);
  if(searchResponse)return searchResponse;
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
    const row=await env.DB.prepare(`SELECT l.*,u.username AS merchant_name,u.display_name AS merchant_display_name,u.avatar_url AS merchant_avatar_url,u.is_premium AS merchant_is_premium,c.name AS category,
      (SELECT AVG(r.rating) FROM marketplace_reviews r WHERE r.listing_id=l.id AND r.status='published') AS rating,
      (SELECT COUNT(*) FROM marketplace_reviews r WHERE r.listing_id=l.id AND r.status='published') AS reviews_count,
      (SELECT COUNT(*) FROM marketplace_order_projections o WHERE o.listing_id=l.id) AS orders_count
      FROM marketplace_listings l JOIN users u ON u.id=l.seller_id JOIN marketplace_categories c ON c.id=l.category_id
      WHERE l.id=? AND l.deleted_at IS NULL AND ((l.status='active' AND l.moderation_status='approved' AND u.account_status='active' AND u.banned=0 AND u.deleted_at IS NULL) OR l.seller_id=?)`)
      .bind(decodeURIComponent(publicListing[1]),user?.id||"").first<Record<string,unknown>>();
    if(!row)return fail("Listing not found",404);
    const images=jsonArray(row.images_json),documents=jsonArray(row.documents_json);
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
    return json({success:true,data:rows.results.map((row:any)=>({...row,price:row.price_amount,starting_price:row.price_amount,images:jsonArray(row.images_json),documents:jsonArray(row.documents_json)}))});
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
    const rows=await env.DB.prepare(`SELECT p.id,p.author_id,p.content,p.post_type,p.visibility,p.published_at,p.created_at,
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
      ${before?"AND p.created_at < ?":""}
      ORDER BY COALESCE(p.published_at,p.created_at) DESC LIMIT ? OFFSET ?`)
      .bind(viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,...(before?[before]:[]),limit,offset).all();
    return json({success:true,data:rows.results});
  }
  if(path==="/api/posts"&&method==="POST"){
    if(!user)return fail("Unauthorized",401);
    const b=await body(request);if(!b)return fail("Valid JSON body required");
    const content=str(b.content,10000),visibility=str(b.visibility,20)||"public",postType=str(b.post_type,30)||"text";
    if(!content||!["public","followers","friends","private"].includes(visibility)||!["text","image","video","mixed"].includes(postType))return fail("Invalid post content or type");
    const id=uuid();
    await env.DB.prepare("INSERT INTO posts(id,author_id,content,post_type,visibility,status,published_at) VALUES(?,?,?,?,?,'published',"+NOW+")").bind(id,user.id,content,postType,visibility).run();
    return json({success:true,id},201);
  }
  if(path==="/api/market/categories"&&method==="GET"){
    const rows=await env.DB.prepare("SELECT id,parent_id,name,slug,description,category_type,position,icon,section FROM marketplace_categories WHERE status='active' ORDER BY position,name").all();
    return json({success:true,data:rows.results});
  }
  if(path==="/api/market/search"&&method==="GET"){
    const q=str(url.searchParams.get("q"),100).replace(/[%_]/g,""),category=str(url.searchParams.get("category_id"),64),country=str(url.searchParams.get("country"),2).toUpperCase();
    const limit=Math.min(Math.max(Number(url.searchParams.get("limit")||24),1),50),offset=Math.max(Number(url.searchParams.get("offset")||0),0);
    const where:string[]=["l.status='active'","l.deleted_at IS NULL","l.moderation_status='approved'","u.account_status='active'","u.banned=0","u.deleted_at IS NULL"];const values:unknown[]=[];
    if(q){where.push("s.product_title LIKE ?");values.push("%"+q+"%");}
    if(category){where.push("s.category_id=?");values.push(category);}
    if(country){where.push("s.country_code=?");values.push(country);}
    const rows=await env.DB.prepare("SELECT s.*,l.seller_id,l.description,l.price_type,l.price_is_range,l.price_min,l.price_max,l.images_json,l.documents_json,l.estimated_delivery_days,u.avatar_url AS seller_avatar_url,u.is_premium AS seller_is_premium FROM public_marketplace_search s JOIN marketplace_listings l ON l.id=s.listing_id JOIN users u ON u.id=l.seller_id WHERE "+where.join(" AND ")+" ORDER BY s.is_boosted DESC,s.published_date DESC LIMIT ? OFFSET ?").bind(...values,limit,offset).all();
    return json({success:true,data:rows.results.map((row:any)=>({...row,images:jsonArray(row.images_json),documents:jsonArray(row.documents_json)}))});
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
    const deliveryDays=Math.min(Math.max(Number(b.delivery_days||3),1),365);
    const images=jsonArray(b.images_json).filter((x):x is string=>typeof x==="string"&&x.length<=2048).slice(0,10);
    const documents=jsonArray(b.documents_json).filter((x):x is string=>typeof x==="string"&&x.length<=2048).slice(0,5);
    await env.DB.prepare("INSERT INTO marketplace_listings(id,seller_id,category_id,title,description,listing_type,price_type,price_amount,currency_code,country_code,status,price_is_range,price_min,price_max,images_json,documents_json,estimated_delivery_days) VALUES(?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?,?,?)")
      .bind(id,user.id,cat.id,title,description,type,priceType,priceType==="contact"?null:priceIsRange?priceMin:Number(priceAmount),priceType==="contact"?null:currency,country,priceIsRange?1:0,priceIsRange?priceMin:null,priceIsRange?priceMax:null,JSON.stringify(images),JSON.stringify(documents),deliveryDays).run();
    return json({success:true,id,status:"draft"},201);
  }

  return null;
}

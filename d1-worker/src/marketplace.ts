import type { Env, User } from "./types.js";
import { uuid, constantTimeEqual } from "./security.js";
import { handleSearchRoute } from "./search.js";
type RouteContext = { url: URL; path: string; method: string; user: User | null };
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const fail=(message:string,status=400)=>json({success:false,error:message},status);
const str=(v:unknown,max=500)=>typeof v==="string"?v.trim().slice(0,max):"";
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
    const row=await env.DB.prepare("SELECT * FROM public_marketplace_search WHERE listing_id=?").bind(publicListing[1]).first<Record<string,unknown>>();
    if(!row)return fail("Listing not found",404);
    const data={...row,listing_id:row.listing_id||row.id,id:row.listing_id||row.id,title:row.product_title||row.title,price:row.product_price??row.price_amount??row.price,seller_id:row.seller_id||row.merchant_id,images:row.images||(row.image_url?[row.image_url]:[])};
    return json({success:true,data});
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
      ${before?"AND p.created_at < ?":""}
      ORDER BY COALESCE(p.published_at,p.created_at) DESC LIMIT ? OFFSET ?`)
      .bind(viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,...(before?[before]:[]),limit,offset).all();
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
    const where:string[]=[];const values:unknown[]=[];
    if(q){where.push("product_title LIKE ?");values.push("%"+q+"%");}
    if(category){where.push("category_id=?");values.push(category);}
    if(country){where.push("country_code=?");values.push(country);}
    const rows=await env.DB.prepare("SELECT * FROM public_marketplace_search "+(where.length?"WHERE "+where.join(" AND "):"")+" ORDER BY is_boosted DESC,published_date DESC LIMIT ? OFFSET ?").bind(...values,limit,offset).all();
    return json({success:true,data:rows.results});
  }
  if(path==="/api/market/listings"&&method==="POST"){
    if(!user)return fail("Unauthorized",401);
    const b=await body(request);if(!b)return fail("Valid JSON body required");
    const title=str(b.title,160),description=str(b.description,10000),category=str(b.category_id,64),type=str(b.listing_type,30),country=str(b.country_code,2).toUpperCase();
    const priceType=str(b.price_type,20)||"fixed",priceAmount=b.price_amount,currency=str(b.currency_code,3).toUpperCase();
    if(!title||!description||!category||! /^[A-Z]{2}$/.test(country)||!["product","service"].includes(type))return fail("Title, description, category, country and valid listing type required");
    if(!["fixed","negotiable","contact"].includes(priceType))return fail("Invalid price type");
    if(priceType!=="contact"&&(!Number.isSafeInteger(priceAmount)||Number(priceAmount)<0||! /^[A-Z]{3}$/.test(currency)))return fail("Fixed or negotiable listings require a non-negative integer price and three-letter currency");
    const cat=await env.DB.prepare("SELECT id,category_type FROM marketplace_categories WHERE id=? AND status='active'").bind(category).first<{id:string;category_type:string}>();
    if(!cat)return fail("Category not found",404);
    if(cat.category_type!=="both"&&cat.category_type!==type)return fail("Listing type does not match category",400);
    const id=uuid();
    await env.DB.prepare("INSERT INTO marketplace_listings(id,seller_id,category_id,title,description,listing_type,price_type,price_amount,currency_code,country_code,status) VALUES(?,?,?,?,?,?,?,?,?,?,'draft')")
      .bind(id,user.id,category,title,description,type,priceType,priceType==="contact"?null:Number(priceAmount),priceType==="contact"?null:currency,country).run();
    return json({success:true,id,status:"draft"},201);
  }

  return null;
}

import type { Env } from "./types.js";
import { digest, cacheGet, cachePut } from "./security.js";
import { hydratePosts, resolveMediaUrl } from "./media.js";

type SearchHit = {
  id: string; kind: string; title: string; subtitle: string; cover: string | null;
  meta: string; is_demo: boolean; score: unknown; snippet: string;
};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"},
});
const fail=(message:string,status=400)=>json({success:false,error:message},status);
const asRecord=(value:unknown):Record<string,unknown> =>
  value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const firstString=(...values:unknown[]):string=>{
  const value=values.find(item=>typeof item==="string"&&item.length>0);
  return typeof value==="string"?value:"";
};
const str=(value:unknown,max=200)=>typeof value==="string"?value.trim().slice(0,max):"";

async function fallbackSearch(env:Env,url:URL,q:string,kind:string,limit:number,viewerId:string|null):Promise<SearchHit[]>{
  const term="%"+q.replace(/[%_]/g,"")+"%",results:SearchHit[]=[];
  if(kind==="home"){
    const rows=await env.DB.prepare(`SELECT p.*,u.username,u.display_name,u.avatar_url,u.is_demo
      FROM posts p JOIN users u ON u.id=p.author_id
      WHERE p.status='published' AND p.deleted_at IS NULL AND p.visibility='public'
      AND u.account_status='active' AND u.banned=0 AND u.deleted_at IS NULL
      AND (p.content LIKE ? OR u.username LIKE ? OR u.display_name LIKE ?)
      ORDER BY COALESCE(p.published_at,p.created_at) DESC LIMIT ?`).bind(term,term,term,limit).all<Record<string,unknown>>();
    const posts=await hydratePosts(env,url.origin,rows.results);
    for(const post of posts){
      const content=firstString(post.content,"Post");
      const image=firstString(typeof post.image_url==="string"?post.image_url.split(",")[0]:"");
      results.push({id:String(post.id),kind:"post",title:content.slice(0,100),subtitle:firstString(post.username?"@"+String(post.username):"",post.display_name),cover:image||null,meta:post.created_at?new Date(String(post.created_at)).toLocaleDateString():"",is_demo:post.is_demo===true||post.is_demo===1,score:null,snippet:content.slice(0,320)});
    }
  }else{
    const listingType=kind==="services"?"service":"product";
    const rows=await env.DB.prepare(`SELECT l.id AS listing_id,l.title AS product_title,l.description,l.price_amount,l.currency_code,l.listing_type,l.images_json,l.city,l.country_code,
      COALESCE(l.published_at,l.created_at) AS published_date,u.username AS merchant_name,u.is_demo
      FROM marketplace_listings l JOIN users u ON u.id=l.seller_id
      WHERE l.status='active' AND l.deleted_at IS NULL AND l.moderation_status='approved'
      AND u.account_status='active' AND u.banned=0 AND u.deleted_at IS NULL AND l.listing_type=?
      AND (l.hide_from_friends=0 OR ? IS NULL OR NOT EXISTS(SELECT 1 FROM friendships fr WHERE (fr.user_a_id=? AND fr.user_b_id=l.seller_id) OR (fr.user_a_id=l.seller_id AND fr.user_b_id=?)))
      AND (l.title LIKE ? OR l.description LIKE ? OR u.username LIKE ?)
      ORDER BY (l.boosted_until IS NOT NULL AND l.boosted_until > strftime('%Y-%m-%dT%H:%M:%fZ','now')) DESC,COALESCE(l.published_at,l.created_at) DESC LIMIT ?`)
      .bind(listingType,viewerId,viewerId,viewerId,term,term,term,limit).all<Record<string,unknown>>();
    for(const row of rows.results){
      let keys:string[]=[];
      if(typeof row.images_json==="string"){try{const parsed:unknown=JSON.parse(row.images_json);if(Array.isArray(parsed))keys=parsed.filter((value):value is string=>typeof value==="string");}catch{}}
      const images=await Promise.all(keys.map(value=>resolveMediaUrl(value,env,url.origin)));
      const cover=images.find((value):value is string=>!!value)||null;
      const price=row.price_amount??null,currency=firstString(row.currency_code,"XAF");
      results.push({id:String(row.listing_id),kind:listingType==="service"?"service":"listing",
        title:firstString(row.product_title,"Marketplace item"),subtitle:firstString(row.merchant_name?"@"+String(row.merchant_name):"",row.city,row.country_code),
        cover,meta:price===null?"":Number(price).toLocaleString()+" "+currency,is_demo:row.is_demo===true||row.is_demo===1,
        score:null,snippet:firstString(row.description).slice(0,320)});
    }
  }
  return results;
}

export async function handleSearchRoute(request:Request,env:Env,viewerId:string|null=null):Promise<Response|null>{
  const url=new URL(request.url);
  if(url.pathname.replace(/\/$/,"")!=="/api/search"||request.method.toUpperCase()!=="GET")return null;
  const q=str(url.searchParams.get("q"),200),kind=str(url.searchParams.get("type"),20)||"all";
  const limit=Math.min(Math.max(Number(url.searchParams.get("limit")||30),1),50);
  if(!q)return json({success:true,data:[]});
  const cacheKey="search:"+await digest(kind+":"+q.toLowerCase()+":"+limit+":"+(viewerId||"anonymous"));
  const cached=await cacheGet(env,cacheKey);
  if(cached)return json({success:true,data:cached,source:"cache"});
  const ai=env.AI,aiSearchName=env.AI_SEARCH_NAME;
  if(!ai||!aiSearchName){
    const fallback=await fallbackSearch(env,url,q,kind,limit,viewerId);
    await cachePut(env,cacheKey,fallback,60);
    return json({success:true,data:fallback,source:"d1-fallback"});
  }
  let raw:unknown;
  try{raw=await ai.autorag(aiSearchName).search({query:q,rewrite_query:true,max_num_results:limit});}
  catch{
    const fallback=await fallbackSearch(env,url,q,kind,limit,viewerId);
    await cachePut(env,cacheKey,fallback,60);
    return json({success:true,data:fallback,source:"d1-fallback"});
  }
  const root=asRecord(raw),hits=asRecord(root.hits);
  const rawResults=Array.isArray(root.data)?root.data:Array.isArray(root.results)?root.results:Array.isArray(hits.hits)?hits.hits:[];
  const normalized:SearchHit[]=rawResults.map((rawItem:unknown)=>{
    const item=asRecord(rawItem),metadata=asRecord(item.metadata??item.attributes??item.meta??item._source);
    const content=firstString(item.content,item.text,item.snippet,metadata.content);
    const rawKind=firstString(metadata.kind,metadata.entity_type,metadata.type,"post").toLowerCase();
    const entityKind=rawKind.includes("listing")?"listing":rawKind.includes("service")?"service":rawKind.includes("post")?"post":rawKind;
    const cover=firstString(metadata.cover_url,metadata.image_url,metadata.thumbnail_url)||null;
    return {
      id:firstString(metadata.id,metadata.entity_id,item.id,item._id),kind:entityKind,
      title:firstString(metadata.title,metadata.name,content.slice(0,100),"Search result"),
      subtitle:firstString(metadata.subtitle,metadata.username,metadata.location),cover,
      meta:firstString(metadata.meta),is_demo:metadata.is_demo===true||metadata.is_demo===1,
      score:item.score??item._score??null,snippet:content.slice(0,320),
    };
  }).filter(item=>item.id.length>0&&(kind==="all"||item.kind===kind||
    (kind==="market"&&item.kind==="listing")||(kind==="services"&&item.kind==="service")||
    (kind==="home"&&item.kind==="post")));
  const ids=[...new Set(normalized.map(item=>item.id))].slice(0,limit);
  if(!ids.length){const fallback=await fallbackSearch(env,url,q,kind,limit,viewerId);await cachePut(env,cacheKey,fallback,60);return json({success:true,data:fallback,source:"d1-fallback"});}
  const placeholders=ids.map(()=>"?").join(",");
  let verified:SearchHit[]=[];
  const hitMap=new Map(normalized.map(item=>[item.id,item]));
  if(kind==="post"||kind==="home"){
    const rows=await env.DB.prepare(`SELECT p.id,p.content,p.post_type,p.created_at,p.author_id,u.username,u.display_name,u.avatar_url
      FROM posts p JOIN users u ON u.id=p.author_id
      WHERE p.id IN (${placeholders}) AND p.status='published' AND p.deleted_at IS NULL AND p.visibility='public'
      AND u.account_status='active' AND u.banned=0 AND u.deleted_at IS NULL`).bind(...ids).all();
    verified=(rows.results as Array<Record<string,unknown>>).map(row=>{
      const hit=hitMap.get(String(row.id)),content=firstString(row.content,hit?.title,"Post");
      return {id:String(row.id),kind:"post",title:content.slice(0,100),
        subtitle:firstString(row.username?"@"+String(row.username):"",hit?.subtitle),cover:hit?.cover??null,
        meta:row.created_at?new Date(String(row.created_at)).toLocaleDateString():"",
        is_demo:hit?.is_demo??false,score:hit?.score??null,snippet:hit?.snippet??""};
    });
  }else{
    const rows=await env.DB.prepare(`SELECT s.* FROM public_marketplace_search s JOIN marketplace_listings l ON l.id=s.listing_id WHERE s.listing_id IN (${placeholders}) AND (l.hide_from_friends=0 OR ? IS NULL OR NOT EXISTS(SELECT 1 FROM friendships fr WHERE (fr.user_a_id=? AND fr.user_b_id=l.seller_id) OR (fr.user_a_id=l.seller_id AND fr.user_b_id=?)))`).bind(...ids,viewerId,viewerId,viewerId).all();
    verified=(rows.results as Array<Record<string,unknown>>).map(row=>{
      const hit=hitMap.get(String(row.listing_id)),listingType=firstString(row.listing_type,hit?.kind,"listing").toLowerCase();
      const entityKind=listingType.includes("service")?"service":"listing";
      let images:string[]=[];
      if(Array.isArray(row.images))images=row.images.filter((value):value is string=>typeof value==="string");
      else if(typeof row.images==="string"){
        try{const parsed:unknown=JSON.parse(row.images);images=Array.isArray(parsed)?parsed.filter((value):value is string=>typeof value==="string"):row.images.split(",");}
        catch{images=row.images.split(",");}
      }
      const price=row.price_amount??row.price??null,currency=firstString(row.currency_code,"XAF");
      return {id:String(row.listing_id),kind:entityKind,
        title:firstString(row.product_title,row.title,hit?.title,"Marketplace item"),
        subtitle:firstString(row.location_city,row.location_region,row.country_code,hit?.subtitle),
        cover:firstString(row.image_url,images[0],hit?.cover)||null,
        meta:price===null?firstString(hit?.meta):`${Number(price).toLocaleString()} ${currency}`,
        is_demo:row.is_demo===true||row.is_demo===1||hit?.is_demo===true,
        score:hit?.score??null,snippet:hit?.snippet??""};
    }).filter(item=>kind==="all"||kind==="market"||(kind==="services"&&item.kind==="service")||
      (kind==="listing"&&item.kind==="listing")||(kind==="service"&&item.kind==="service"));
  }
  if(!verified.length){const fallback=await fallbackSearch(env,url,q,kind,limit,viewerId);await cachePut(env,cacheKey,fallback,60);return json({success:true,data:fallback,source:"d1-fallback"});}
  await cachePut(env,cacheKey,verified,60);
  return json({success:true,data:verified,source:"ai-search"});
}

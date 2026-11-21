import type { Env } from "./types.js";
import { digest, cacheGet, cachePut } from "./security.js";

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

export async function handleSearchRoute(request:Request,env:Env):Promise<Response|null>{
  const url=new URL(request.url);
  if(url.pathname.replace(/\/$/,"")!=="/api/search"||request.method.toUpperCase()!=="GET")return null;
  const q=str(url.searchParams.get("q"),200),kind=str(url.searchParams.get("type"),20)||"all";
  const limit=Math.min(Math.max(Number(url.searchParams.get("limit")||30),1),50);
  if(!q)return json({success:true,data:[]});
  if(!env.AI||!env.AI_SEARCH_NAME)return fail("Cloudflare AI Search is not configured on this Worker",503);
  const cacheKey="search:"+await digest(kind+":"+q.toLowerCase()+":"+limit);
  const cached=await cacheGet(env,cacheKey);
  if(cached)return json({success:true,data:cached,source:"cache"});
  const raw=await env.AI.autorag(env.AI_SEARCH_NAME).search({query:q,rewrite_query:true,max_num_results:limit});
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
  if(!ids.length)return json({success:true,data:[],source:"ai-search"});
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
    const rows=await env.DB.prepare(`SELECT * FROM public_marketplace_search WHERE listing_id IN (${placeholders})`).bind(...ids).all();
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
  await cachePut(env,cacheKey,verified,60);
  return json({success:true,data:verified,source:"ai-search"});
}

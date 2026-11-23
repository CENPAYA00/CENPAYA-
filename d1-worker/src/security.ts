import type { Env } from "./types.js";

export const uuid=()=>crypto.randomUUID();
export async function digest(value:string):Promise<string>{
  const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
export async function hmac(value:string,secret:string):Promise<string>{
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value));
  return [...new Uint8Array(sig)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
export async function passwordHash(password:string):Promise<string>{
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:600000,hash:"SHA-256"},key,256);
  const enc=(a:Uint8Array)=>btoa(String.fromCharCode(...a)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
  return "pbkdf2-sha256$600000$"+enc(salt)+"$"+enc(new Uint8Array(bits));
}
export async function verifyPassword(password:string,stored:string):Promise<boolean>{
  try{
    const [kind,rounds,salt64,hash64]=stored.split("$"); const n=Number(rounds);
    if(kind!=="pbkdf2-sha256"||!Number.isInteger(n)||n<600000||n>1000000)return false;
    const dec=(s:string)=>{const b64=s.replace(/-/g,"+").replace(/_/g,"/");return Uint8Array.from(atob(b64+"=".repeat((4-b64.length%4)%4)),c=>c.charCodeAt(0));};
    const salt=dec(salt64),expected=dec(hash64);
    if(salt.length!==16||expected.length!==32)return false;
    const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
    const bits=new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:n,hash:"SHA-256"},key,256));
    let diff=0; for(let i=0;i<32;i++)diff|=bits[i]^expected[i]; return diff===0;
  }catch{return false;}
}
export async function randomToken(bytes=32):Promise<string>{
  const data=crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
}
export function constantTimeEqual(left:string,right:string):boolean{
  const a=new TextEncoder().encode(left),b=new TextEncoder().encode(right);
  let diff=a.length^b.length;
  const length=Math.max(a.length,b.length);
  for(let i=0;i<length;i++)diff|=(a[i]||0)^(b[i]||0);
  return diff===0;
}
export function base64Url(bytes:Uint8Array):string{
  return btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
}
export async function signD1IdentityAssertion(userId:string,secret:string):Promise<string>{
  if(secret.length<32)throw new Error("Identity signing secret is not configured securely");
  const now=Math.floor(Date.now()/1000);
  const header=base64Url(new TextEncoder().encode(JSON.stringify({alg:"HS256",typ:"JWT"})));
  const payload=base64Url(new TextEncoder().encode(JSON.stringify({
    iss:"cenpaya-d1-worker",aud:"cenpaya-supabase-worker",sub:userId,
    iat:now,exp:now+120,jti:await randomToken(24)
  })));
  const input=header+"."+payload;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(input)));
  return input+"."+base64Url(signature);
}
export async function sha256Base64Url(value:string):Promise<string>{
  const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
  return btoa(String.fromCharCode(...hash)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
}
export async function cacheGet(env:Env,key:string):Promise<unknown|null>{
  if(!env.CACHE)return null;
  try{const value=await env.CACHE.get(key,"json");return value??null;}catch{return null;}
}
export async function cachePut(env:Env,key:string,value:unknown,ttl=300):Promise<void>{
  if(!env.CACHE)return;
  try{await env.CACHE.put(key,JSON.stringify(value),{expirationTtl:ttl});}catch{/* cache failures never block D1 reads */}
}

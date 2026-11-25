type JsonObject = Record<string, unknown>;
export type DynamicAdapter = JsonObject & { base_url: string; topup: JsonObject; payout?: JsonObject; status: JsonObject };
const ownObject=(v:unknown):JsonObject=>v&&typeof v==="object"&&!Array.isArray(v)?v as JsonObject:{};
const pathValue=(value:unknown,path:unknown):unknown=>{
 if(typeof path!=="string"||!path||path.length>160)return undefined;
 return path.split(".").reduce<unknown>((v,k)=>ownObject(v)[k],value);
};
const render=(value:unknown,ctx:Record<string,string>):unknown=>{
 if(typeof value==="string")return value.replace(/\{\{([a-z_]+)\}\}/g,(_m,k:string)=>ctx[k]??"");
 if(Array.isArray(value))return value.map(v=>render(v,ctx));
 if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value as JsonObject).map(([k,v])=>[k,render(v,ctx)]));
 return value;
};
const safeUrl=(base:string,path:string):string=>{
 const root=new URL(base);
 if(root.protocol!=="https:"||root.username||root.password||(root.port&&root.port!=="443")||
   /^(localhost|.*\.localhost|.*\.local)$/i.test(root.hostname)||
   /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(root.hostname)||
   root.hostname.includes(":")||/^\d{1,3}(?:\.\d{1,3}){3}$/.test(root.hostname))
  throw new Error("adapter_url_not_allowed");
 if(!path.startsWith("/")||path.startsWith("//")||path.length>500)throw new Error("adapter_path_invalid");
 const url=new URL(path,root);if(url.origin!==root.origin)throw new Error("adapter_origin_mismatch");return url.toString();
};
export function validateDynamicAdapter(v:unknown):DynamicAdapter{
 const c=ownObject(v),base=typeof c.base_url==="string"?c.base_url:"",topup=ownObject(c.topup),status=ownObject(c.status);
 if(!base||!topup.method||!topup.path||!topup.reference_path||!status.method||!status.path||!status.status_path||!status.amount_path||!status.currency_path)throw new Error("adapter_config_incomplete");
 const map=ownObject(status.status_map);if(!["success","failed","pending"].every(k=>Array.isArray(map[k])&&(map[k] as unknown[]).length>0))throw new Error("adapter_status_map_incomplete");
 safeUrl(base,"/");if(typeof c.sandbox_base_url==="string"&&c.sandbox_base_url)safeUrl(c.sandbox_base_url,"/");
 for(const op of [topup,status,...(c.payout?[ownObject(c.payout)]:[])])if(!["GET","POST","PUT"].includes(String(op.method).toUpperCase())||typeof op.path!=="string"||(op.headers!==undefined&&Object.keys(ownObject(op.headers)).length>20))throw new Error("adapter_operation_invalid");else safeUrl(base,String(op.path).replace(/\{\{reference\}\}/g,"reference"));
 return c as DynamicAdapter;
}
async function call(adapter:DynamicAdapter,operation:JsonObject,credentials:JsonObject,ctx:Record<string,string>):Promise<JsonObject>{
 const url=safeUrl(adapter.base_url,String(render(operation.path,ctx)));
 const fullCtx={...ctx,...Object.fromEntries(Object.entries(credentials).filter(([k])=>k!=="__adapter_config").map(([k,v])=>["credential_"+k,String(v)]))};
 const headers:Record<string,string>={"Accept":"application/json","Content-Type":"application/json"};
 for(const [k,v] of Object.entries(ownObject(operation.headers))){if(!/^[A-Za-z0-9-]{1,64}$/.test(k))throw new Error("adapter_header_invalid");headers[k]=String(render(v,fullCtx));}
 const method=String(operation.method).toUpperCase(),init:RequestInit={method,headers,redirect:"manual",signal:AbortSignal.timeout(12000)};
 if(method!=="GET")init.body=JSON.stringify(render(operation.body??{},fullCtx));
 const response=await fetch(url,init);if(response.status>=300&&response.status<400)throw new Error("adapter_redirect_rejected");
 let data:JsonObject={};try{data=ownObject(JSON.parse(await response.text()));}catch{throw new Error("adapter_response_invalid");}
 if(!response.ok)throw new Error("provider_rejected_"+response.status);return data;
}
export async function dynamicTopup(adapterValue:unknown,credentials:JsonObject,ctx:Record<string,string>){
 const a=validateDynamicAdapter(adapterValue),data=await call(a,a.topup,credentials,ctx),ref=pathValue(data,a.topup.reference_path),checkout=a.topup.checkout_url_path?pathValue(data,a.topup.checkout_url_path):null;
 if(typeof ref!=="string"&&typeof ref!=="number")throw new Error("provider_reference_missing");
 return {reference:String(ref),checkoutUrl:typeof checkout==="string"&&checkout.startsWith("https://")?checkout:null};
}
export async function dynamicPayout(adapterValue:unknown,credentials:JsonObject,ctx:Record<string,string>):Promise<string>{
 const a=validateDynamicAdapter(adapterValue);if(!a.payout)throw new Error("provider_payout_not_configured");
 const data=await call(a,ownObject(a.payout),credentials,ctx),ref=pathValue(data,a.payout.reference_path);
 if(typeof ref!=="string"&&typeof ref!=="number")throw new Error("provider_reference_missing");return String(ref);
}
export async function dynamicStatus(adapterValue:unknown,credentials:JsonObject,ctx:Record<string,string>){
 const a=validateDynamicAdapter(adapterValue),data=await call(a,a.status,credentials,ctx),raw=String(pathValue(data,a.status.status_path)??"").toUpperCase(),map=ownObject(a.status.status_map);
 const success=Array.isArray(map.success)?map.success.map(String).map(x=>x.toUpperCase()):[],failed=Array.isArray(map.failed)?map.failed.map(String).map(x=>x.toUpperCase()):[],pending=Array.isArray(map.pending)?map.pending.map(String).map(x=>x.toUpperCase()):[];
 const status=success.includes(raw)?"SUCCESSFUL":failed.includes(raw)?"FAILED":pending.includes(raw)?"PENDING":"",amount=Number(pathValue(data,a.status.amount_path)),currency=String(pathValue(data,a.status.currency_path)??"").toUpperCase();
 if(!status||!Number.isFinite(amount)||!currency)throw new Error("provider_status_invalid");return {status,amount,currency};
}
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { d1Request } from '../lib/d1Api';
import { getCachedUser } from '../lib/cache';
import CommentsSheet from '../components/CommentsSheet';
import { Heart, MessageCircle, RefreshCw, Star, UserPlus } from 'lucide-react';
declare global { interface Window { Hls?: any } }
type Reel = {
 video_id:string; post_id:string; author_id:string; content:string; username:string; display_name:string;
 playlist_url:string; duration_seconds:number|null; likes_count:number; comments_count:number;
 is_liked:number|boolean; is_following_author:number|boolean; average_rating:number|null;
 ratings_count:number; views_count:number; viewer_rating:number|null;
};
let loader:Promise<void>|null=null;
function loadHls(){if(window.Hls)return Promise.resolve();if(!loader)loader=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';script.onload=()=>resolve();script.onerror=()=>reject(new Error('HLS player unavailable'));document.head.appendChild(script);});return loader;}
export default function Reels(){
 const navigate=useNavigate(),[items,setItems]=useState<Reel[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[meId,setMeId]=useState<string|null>(null),[commentPost,setCommentPost]=useState<string|null>(null);
 const refs=useRef<Record<string,HTMLVideoElement|null>>({}),lastWatch=useRef<Record<string,number>>({});
 const load=async()=>{setLoading(true);setError('');try{const result=await d1Request<{data:Reel[]}>('/api/reels?limit=20');setItems(result.data||[]);}catch(e:any){setError(e.message||'Could not load videos');}finally{setLoading(false);}};
 useEffect(()=>{getCachedUser().then(user=>setMeId(user?.id||null)).catch(()=>setMeId(null));void load();},[]);
 useEffect(()=>{let alive=true;const instances:any[]=[];for(const item of items){const element=refs.current[item.video_id];if(!element)continue;if(element.canPlayType('application/vnd.apple.mpegurl')){element.src=item.playlist_url;continue;}loadHls().then(()=>{if(!alive||!window.Hls?.isSupported())return;const hls=new window.Hls({enableWorker:true});hls.loadSource(item.playlist_url);hls.attachMedia(element);instances.push(hls);}).catch((e:any)=>setError(e.message||'Video playback unavailable'));}return()=>{alive=false;instances.forEach(x=>x.destroy());};},[items]);
 const like=async(item:Reel)=>{const next=!Boolean(item.is_liked);setItems(p=>p.map(v=>v.video_id===item.video_id?{...v,is_liked:next,likes_count:Math.max(0,v.likes_count+(next?1:-1))}:v));try{await d1Request('/api/posts/'+encodeURIComponent(item.post_id)+'/like',{method:next?'POST':'DELETE'});}catch(e:any){setItems(p=>p.map(v=>v.video_id===item.video_id?{...v,is_liked:!next,likes_count:Math.max(0,v.likes_count+(next?-1:1))}:v));setError(e.message||'Could not update like');}};
 const follow=async(item:Reel)=>{try{const r=await d1Request<{following?:boolean}>('/api/profiles/'+encodeURIComponent(item.author_id)+'/follow',{method:item.is_following_author?'DELETE':'POST'});setItems(p=>p.map(v=>v.author_id===item.author_id?{...v,is_following_author:!!r.following}:v));}catch(e:any){setError(e.message||'Could not update follow');}};
 const rate=async(item:Reel,stars:number)=>{try{const r=await d1Request<{data:{ratings_count:number;average_rating:number;viewer_rating:number}}>('/api/videos/'+encodeURIComponent(item.video_id)+'/rating',{method:'POST',body:JSON.stringify({stars})});setItems(p=>p.map(v=>v.video_id===item.video_id?{...v,...r.data}:v));}catch(e:any){setError(e.message||'Could not save rating');}};
 const track= (item:Reel,complete=false)=>{const now=Date.now();if(!complete&&now-(lastWatch.current[item.video_id]||0)<5000)return;lastWatch.current[item.video_id]=now;void d1Request('/api/feed/events',{method:'POST',body:JSON.stringify({post_id:item.post_id,event_type:complete?'video_complete':'video_watch',watch_ms:complete?Math.min(300000,Math.round((refs.current[item.video_id]?.duration||0)*1000)):5000,completed:complete,source:'videos'})}).catch(()=>undefined);};
 if(loading)return <div className="p-6 text-center text-xs text-gray-500">Loading videos…</div>;
 return <div className="px-3 py-3 pb-24"><div className="flex justify-between items-center mb-3"><h1 className="text-base font-bold text-navy dark:text-white">Videos</h1><button onClick={()=>void load()} aria-label="Refresh videos" className="text-accent"><RefreshCw size={16}/></button></div>
 {error&&<p role="status" className="text-xs text-red-500 mb-3">{error}</p>}{!items.length&&!error&&<div className="text-center py-16 text-xs text-gray-500">No published videos yet.</div>}
 <div className="space-y-4">{items.map(item=><article key={item.video_id} className="rounded-2xl overflow-hidden bg-black text-white">
 <video ref={el=>{refs.current[item.video_id]=el;}} controls playsInline preload="metadata" className="w-full max-h-[72vh] aspect-[9/16] object-contain bg-black" onPlay={()=>track(item)} onTimeUpdate={()=>track(item)} onEnded={()=>track(item,true)}/>
 <div className="p-3"><div className="flex items-center justify-between gap-2"><button onClick={()=>navigate('/seller/'+encodeURIComponent(item.author_id))} className="text-xs font-bold">@{item.username||item.display_name||'Cenpaya user'}</button>{meId&&meId!==item.author_id&&<button onClick={()=>void follow(item)} className="rounded-lg bg-white/15 px-3 py-1.5 text-[10px] font-bold flex items-center gap-1"><UserPlus size={12}/>{item.is_following_author?'Following':'Follow'}</button>}</div>
 {item.content&&<p className="text-xs mt-2 whitespace-pre-wrap">{item.content}</p>}
 <div className="flex items-center gap-4 mt-3 border-t border-white/15 pt-2"><button onClick={()=>void like(item)} className={`flex items-center gap-1.5 text-xs font-bold ${item.is_liked?'text-pink-400':'text-white'}`}><Heart size={16} fill={item.is_liked?'currentColor':'none'}/>{item.likes_count||0} Like</button><button onClick={()=>setCommentPost(item.post_id)} className="flex items-center gap-1.5 text-xs font-bold"><MessageCircle size={16}/>{item.comments_count||0} Comment</button></div>
 <div className="mt-3 flex items-center justify-between gap-2"><div className="flex items-center gap-1">{[1,2,3,4,5].map(star=><button key={star} aria-label={`Rate ${star} out of 5 stars`} onClick={()=>void rate(item,star)} className={star<=Number(item.viewer_rating||0)?'text-amber-400':'text-white/50'}><Star size={17} fill={star<=Number(item.viewer_rating||0)?'currentColor':'none'}/></button>)}</div><span className="text-[10px] text-white/70">{item.views_count||0} views · {Number(item.average_rating||0).toFixed(1)} / 5 · {item.ratings_count||0} ratings</span></div>
 </div></article>)}</div>
 <CommentsSheet postId={commentPost} me={meId} onClose={()=>setCommentPost(null)} onCommentAdded={()=>setItems(p=>p.map(item=>item.post_id===commentPost?{...item,comments_count:item.comments_count+1}:item))}/>
 </div>;
}

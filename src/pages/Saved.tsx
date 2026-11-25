import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bookmark, FolderPlus, Folder, Pencil, Trash2, Video } from 'lucide-react';
import { useI18n } from '../contexts/i18n';
import FeedPostCard from '../components/FeedPostCard';
import { d1Request } from '../lib/d1Api';

type SavedFolder = { id: string; name: string; item_count: number };
export default function Saved() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [posts, setPosts] = useState<any[]>([]);
  const [folders, setFolders] = useState<SavedFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadFolders = useCallback(async () => {
    const r = await d1Request<{data:SavedFolder[]}>('/api/saved/folders');
    setFolders(r.data || []);
  }, []);
  const loadPosts = useCallback(async (folderId: string | null) => {
    setLoading(true); setError('');
    try {
      const r = await d1Request<{data:any[]}>(folderId ? `/api/saved/folders/${encodeURIComponent(folderId)}/posts` : '/api/posts/saved');
      setPosts(r.data || []);
    } catch (e:any) { setError(e.message || 'Could not load saved posts'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void Promise.all([loadFolders(),loadPosts(null)]).catch((e:any)=>setError(e.message || 'Could not load saved content')); }, [loadFolders,loadPosts]);
  const selectFolder = (id:string|null) => { setActiveFolder(id); void loadPosts(id); };
  const createFolder = async () => {
    const name = window.prompt('Name your saved folder');
    if (!name?.trim()) return;
    try { const r=await d1Request<{data:SavedFolder}>('/api/saved/folders',{method:'POST',body:JSON.stringify({name:name.trim()})}); await loadFolders(); selectFolder(r.data.id); }
    catch(e:any){setError(e.message || 'Could not create folder');}
  };
  const renameFolder = async () => {
    const folder=folders.find(f=>f.id===activeFolder); if(!folder)return;
    const name=window.prompt('Rename folder',folder.name); if(!name?.trim())return;
    try{await d1Request('/api/saved/folders/'+encodeURIComponent(folder.id),{method:'PATCH',body:JSON.stringify({name:name.trim()})});await loadFolders();}
    catch(e:any){setError(e.message || 'Could not rename folder');}
  };
  const deleteFolder = async () => {
    const folder=folders.find(f=>f.id===activeFolder); if(!folder)return;
    if(!window.confirm(`Delete "${folder.name}"? The posts and videos will remain in All saved.`))return;
    try{await d1Request('/api/saved/folders/'+encodeURIComponent(folder.id),{method:'DELETE'});setActiveFolder(null);await Promise.all([loadFolders(),loadPosts(null)]);}
    catch(e:any){setError(e.message || 'Could not delete folder');}
  };
  const addToFolder = async (postId:string,folderId:string) => {
    try{await d1Request('/api/posts/'+encodeURIComponent(postId)+'/save',{method:'POST',body:JSON.stringify({folder_id:folderId})});await loadFolders();if(activeFolder)await loadPosts(activeFolder);}
    catch(e:any){setError(e.message || 'Could not add to folder');}
  };
  const removeFromFolder = async (postId:string) => {
    if(!activeFolder)return;
    try{await d1Request('/api/posts/'+encodeURIComponent(postId)+'/save',{method:'DELETE',body:JSON.stringify({folder_id:activeFolder})});await Promise.all([loadFolders(),loadPosts(activeFolder)]);}
    catch(e:any){setError(e.message || 'Could not remove from folder');}
  };
  if (loading && !posts.length) return <div className="p-4 text-center text-xs">Loading saved content...</div>;
  return <div className="px-3 py-3 pb-24">
    <div className="flex items-center gap-2 mb-3"><button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button><h1 className="text-base font-bold text-navy dark:text-white">{t('saved')}</h1><button onClick={()=>void createFolder()} className="ml-auto flex items-center gap-1 rounded-xl bg-brand/10 text-brand px-3 py-2 text-xs font-bold"><FolderPlus size={15}/> New folder</button></div>
    <div className="flex gap-2 overflow-x-auto pb-3">
      <button onClick={()=>selectFolder(null)} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold ${!activeFolder?'bg-brand text-white':'bg-white dark:bg-darkcard text-navy dark:text-white'}`}><Bookmark size={13} className="inline mr-1"/>All saved</button>
      {folders.map(folder=><button key={folder.id} onClick={()=>selectFolder(folder.id)} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold ${activeFolder===folder.id?'bg-brand text-white':'bg-white dark:bg-darkcard text-navy dark:text-white'}`}><Folder size={13} className="inline mr-1"/>{folder.name} ({folder.item_count})</button>)}
    </div>
    {activeFolder&&<div className="flex items-center justify-end gap-2 pb-3"><button onClick={()=>void renameFolder()} className="text-xs text-brand font-bold flex items-center gap-1"><Pencil size={13}/> Rename</button><button onClick={()=>void deleteFolder()} className="text-xs text-red-500 font-bold flex items-center gap-1"><Trash2 size={13}/> Delete folder</button></div>}
    {error&&<p role="status" className="text-xs text-red-500 mb-3">{error}</p>}
    {!loading&&posts.length===0&&<div className="bg-white dark:bg-darkcard rounded-2xl p-8 text-center shadow-sm"><Bookmark size={28} className="mx-auto text-gray-400 mb-2" /><p className="text-xs text-gray-500">{activeFolder?'This folder is empty':'No saved posts or videos yet'}</p></div>}
    {posts.map(post=><div key={post.id} className="mb-3">
      <FeedPostCard post={post} readOnly={true}/>
      {activeFolder ? <button onClick={()=>void removeFromFolder(post.id)} className="w-full -mt-2 mb-3 rounded-xl border border-gray-200 dark:border-darkline py-2 text-xs font-bold text-red-500">Remove from this folder</button> :
        folders.length>0 && <div className="flex items-center gap-2 -mt-2 mb-3 rounded-xl bg-white dark:bg-darkcard border border-gray-100 dark:border-darkline p-2"><Folder size={14} className="text-brand"/><span className="text-[11px] text-gray-500 flex-1">Add post or video to folder</span><select aria-label="Choose saved folder" defaultValue="" onChange={e=>{if(e.target.value)void addToFolder(post.id,e.target.value);e.target.value='';}} className="max-w-[48%] rounded-lg bg-offwhite dark:bg-darkbg px-2 py-2 text-xs"><option value="" disabled>Choose folder</option>{folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>}
    </div>)}
    {loading&&<p className="text-center text-xs text-gray-500">Loading…</p>}
  </div>;
}

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useLang, setLang } from '../lib/language';
import { ArrowLeft } from 'lucide-react';

export default function Legal() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [lang] = useLang();
  const [doc, setDoc] = useState<any>(null);
  const [version, setVersion] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!slug) return;

      setLoading(true);

      // 1. Find the document
      const { data: docData } = await supabase
        .from('legal_documents')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      if (!docData) {
        setDoc(null);
        setLoading(false);
        return;
      }

      setDoc(docData);

      // 2. Pick the version based on selected language
      const versionLabel = lang === 'fr' ? 'v1.0-fr' : 'v1.0';

      let { data: v } = await supabase
        .from('legal_document_versions')
        .select('*')
        .eq('document_id', docData.id)
        .eq('version_label', versionLabel)
        .maybeSingle();

      // 3. Fallback to English if French is missing
      if (!v && lang === 'fr') {
        const fallback = await supabase
          .from('legal_document_versions')
          .select('*')
          .eq('document_id', docData.id)
          .eq('version_label', 'v1.0')
          .maybeSingle();
        v = fallback.data;
      }

      setVersion(v);
      setLoading(false);
    };
    load();
  }, [slug, lang]);

  if (loading) {
    return (
      <div className="px-3 py-3 pb-20">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-3 animate-pulse"></div>
        <div className="h-40 bg-gray-200 rounded-xl animate-pulse"></div>
      </div>
    );
  }

  if (!doc || !version) {
    return (
      <div className="px-3 py-3 pb-20">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-brand text-xs font-bold mb-3">
          <ArrowLeft size={14} /> Back
        </button>
        <div className="bg-white p-4 rounded-xl shadow-sm text-center text-xs text-gray-500">
          Document not found.
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-3 pb-20">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-brand text-xs font-bold">
          <ArrowLeft size={14} /> Back
        </button>

        {/* EN / FR toggle */}
        <div className="flex bg-white rounded-full shadow-sm overflow-hidden border border-gray-100">
          <button
            onClick={() => setLang('en')}
            className={`px-3 py-1 text-[10px] font-bold ${lang === 'en' ? 'bg-accent text-white' : 'text-gray-500'}`}
          >
            EN
          </button>
          <button
            onClick={() => setLang('fr')}
            className={`px-3 py-1 text-[10px] font-bold ${lang === 'fr' ? 'bg-accent text-white' : 'text-gray-500'}`}
          >
            FR
          </button>
        </div>
      </div>

      {/* Document */}
      <div className="bg-white p-4 rounded-xl shadow-sm">
        <h1 className="text-base font-bold text-navy mb-1">{doc.title}</h1>
        {doc.description && (
          <p className="text-[10px] text-gray-500 mb-2">{doc.description}</p>
        )}
        <p className="text-[10px] text-gray-400 mb-4">
          Version {version.version_label} • Effective {new Date(version.effective_from).toLocaleDateString()}
        </p>

        <div className="text-[12px] text-gray-700 whitespace-pre-wrap leading-relaxed">
          {version.body_markdown}
        </div>
      </div>

      {/* Footer note */}
      <p className="text-[10px] text-gray-400 text-center mt-4">
        CenPaya is a registered social commerce platform for the CEMAC region.
      </p>
    </div>
  );
        }

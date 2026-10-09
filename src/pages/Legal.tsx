import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getLatestLegalVersion, LegalDocumentWithVersion } from '../utils/getLatestLegalVersion';

export default function Legal() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<LegalDocumentWithVersion | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      if (!slug) return;
      const result = await getLatestLegalVersion(slug);
      setData(result);
      setLoading(false);
    };
    fetch();
  }, [slug]);

  if (loading) return <div className="p-4 text-center">Loading...</div>;

  if (!data || !data.version) {
    return (
      <div className="p-4 bg-offwhite min-h-screen">
        <button onClick={() => navigate(-1)} className="text-navy font-bold mb-4">← Back</button>
        <div className="bg-white p-6 rounded-2xl shadow-sm text-center text-gray-500">
          Document not found.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-offwhite min-h-screen">
      <button onClick={() => navigate(-1)} className="text-navy font-bold mb-4">← Back</button>
      <div className="bg-white p-6 rounded-2xl shadow-sm">
        <h1 className="text-2xl font-bold text-navy mb-2">{data.document.title}</h1>
        {data.document.description && (
          <p className="text-sm text-gray-500 mb-4">{data.document.description}</p>
        )}
        <p className="text-xs text-gray-400 mb-4">
          Version {data.version.version_label} • Effective {new Date(data.version.effective_from).toLocaleDateString()}
        </p>
        <div className="prose prose-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
          {data.version.body_markdown}
        </div>
      </div>
    </div>
  );
}
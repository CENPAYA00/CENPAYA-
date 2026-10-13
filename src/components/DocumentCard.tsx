import { FileText, ExternalLink, File } from 'lucide-react';

type Props = {
  url: string;
  name?: string;
};

function kind(url: string): { label: string; color: string; Icon: typeof FileText } {
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.pdf'))                return { label: 'PDF',  color: 'bg-red-500',    Icon: FileText };
  if (lower.endsWith('.doc') || lower.endsWith('.docx')) return { label: 'DOC',  color: 'bg-blue-500',   Icon: FileText };
  if (lower.endsWith('.ppt') || lower.endsWith('.pptx')) return { label: 'PPT',  color: 'bg-orange-500', Icon: FileText };
  if (lower.endsWith('.xls') || lower.endsWith('.xlsx')) return { label: 'XLS',  color: 'bg-green-600',  Icon: FileText };
  return { label: 'FILE', color: 'bg-gray-600', Icon: File };
}

export default function DocumentCard({ url, name }: Props) {
  const { label, color, Icon } = kind(url);
  const filename = name || decodeURIComponent(url.split('/').pop() || 'Document');

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 bg-gray-50 dark:bg-darkbg rounded-xl p-3 mb-2 border border-gray-100 dark:border-darkline active:bg-gray-100"
    >
      <div className={`w-10 h-10 ${color} rounded-lg flex items-center justify-center text-white shrink-0`}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold text-navy dark:text-white truncate">{filename}</p>
        <p className="text-[9px] text-gray-500">{label} document</p>
      </div>
      <ExternalLink size={14} className="text-gray-400 shrink-0" />
    </a>
  );
}

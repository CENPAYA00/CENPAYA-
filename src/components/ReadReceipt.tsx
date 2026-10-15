import { Check, CheckCheck } from 'lucide-react';

export default function ReadReceipt({ delivered, read }: { delivered: boolean; read: boolean }) {
  if (read) return <CheckCheck size={11} className="text-blue-400" />;
  if (delivered) return <CheckCheck size={11} className="opacity-60" />;
  return <Check size={11} className="opacity-60" />;
}

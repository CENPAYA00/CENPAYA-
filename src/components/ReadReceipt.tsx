import { Check, CheckCheck } from 'lucide-react';

export default function ReadReceipt({ delivered, read }: { delivered: boolean; read: boolean }) {
  // 2 Green Ticks = The other user has read the message
  if (read) {
    return <CheckCheck size={15} className="text-[#34D399]" strokeWidth={2.5} />;
  }
  
  // 1 Grey Tick = Message sent and delivered, but not read yet
  return <Check size={15} className="text-gray-400 dark:text-gray-500" strokeWidth={2.5} />;
}

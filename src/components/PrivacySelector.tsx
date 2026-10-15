import { Globe, Users, Lock, Check } from 'lucide-react';

export type PostPrivacy = 'public' | 'followers' | 'private';

const OPTIONS: { key: PostPrivacy; label: string; sub: string; icon: any }[] = [
  { key: 'public',    label: 'Public',          sub: 'Anyone can see this post',              icon: Globe },
  { key: 'followers', label: 'Followers only',  sub: 'Only your followers can see this post', icon: Users },
  { key: 'private',   label: 'Only me',         sub: 'Only you can see this post',            icon: Lock },
];

export default function PrivacySelector({
  value, onChange,
}: { value: PostPrivacy; onChange: (p: PostPrivacy) => void }) {
  return (
    <div className="space-y-2">
      {OPTIONS.map(o => {
        const Icon = o.icon;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={`w-full p-3 rounded-xl border-2 flex items-center gap-3 text-left ${
              value === o.key ? 'border-accent bg-accent/5' : 'border-gray-200 dark:border-darkline'
            }`}
          >
            <Icon size={16} className="text-accent shrink-0" />
            <div className="flex-1">
              <p className="text-[12px] font-bold text-navy dark:text-white">{o.label}</p>
              <p className="text-[10px] text-gray-500">{o.sub}</p>
            </div>
            {value === o.key && <Check size={16} className="text-accent" />}
          </button>
        );
      })}
    </div>
  );
}

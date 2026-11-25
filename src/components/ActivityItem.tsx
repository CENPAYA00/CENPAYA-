import { ACTIVITY_ACTIONS, ActivityActionKey } from '../constants/activityActions';

export default function ActivityItem({
  action, meta, createdAt,
}: { action: string; meta: any; createdAt: string }) {
  const def = ACTIVITY_ACTIONS[action as ActivityActionKey];
  const Icon = def?.icon;
  const label = def?.label || action;

  const time = new Date(createdAt).toLocaleString();
  const detail = meta && typeof meta === 'object'
    ? Object.entries(meta)
        .filter(([_, v]) => v !== null && v !== undefined && v !== '')
        .slice(0, 2)
        .map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`)
        .join(' • ')
    : '';

  return (
    <div className="flex items-start gap-3 p-3 bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-2">
      <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-accent shrink-0">
        {Icon ? <Icon size={15} /> : '•'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold text-navy dark:text-white">{label}</p>
        {detail && <p className="text-[10px] text-gray-500 mt-0.5 truncate">{detail}</p>}
        <p className="text-[9px] text-gray-400 mt-1">{time}</p>
      </div>
    </div>
  );
}

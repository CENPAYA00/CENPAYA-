import { ArrowLeft, ChevronRight, Check } from 'lucide-react';

type Category = {
  id: string;
  slug: string;
  display_name: string;
  icon: string | null;
  listing_type: string;
  section: string;
  display_order: number;
};

type Availability = 'single' | 'in_stock';

export function Field({
  label, value, onClick, accent,
}: { label: string; value: string; onClick: () => void; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-200 dark:border-darkline bg-white dark:bg-darkcard text-left cursor-pointer"
    >
      <div>
        <p className="text-[10px] text-gray-500 dark:text-gray-400">{label}</p>
        <p className={`text-[13px] font-bold ${accent ? 'text-accent' : 'text-navy dark:text-white'}`}>
          {value}
        </p>
      </div>
      <ChevronRight size={16} className="text-gray-400" />
    </button>
  );
}

export function ToggleRow({
  label, value, onChange,
}: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl border border-gray-200 dark:border-darkline bg-white dark:bg-darkcard">
      <p className="text-[12px] text-navy dark:text-white">{label}</p>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
          value ? 'bg-accent' : 'bg-gray-300 dark:bg-darkline'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
            value ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </div>
  );
}

export function BottomSheet({
  title, onClose, children,
}: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-h-[80vh] bg-white dark:bg-darkcard rounded-t-2xl overflow-y-auto animate-slide-up"
      >
        <div className="sticky top-0 bg-white dark:bg-darkcard p-3 flex items-center gap-3 border-b border-gray-100 dark:border-darkline">
          <button onClick={onClose} className="cursor-pointer"><ArrowLeft size={18} /></button>
          <p className="flex-1 text-center text-[13px] font-bold text-navy dark:text-white">{title}</p>
          <div className="w-[18px]" />
        </div>
        {children}
      </div>
    </div>
  );
}

export function ListingCategoryPicker({
  sections, selectedId, onSelect, onClose,
}: {
  sections: Record<string, Category[]>;
  selectedId?: string;
  onSelect: (c: Category) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet title="Change Category" onClose={onClose}>
      {Object.entries(sections).map(([section, items]) => (
        <div key={section}>
          <p className="px-4 pt-4 pb-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            {section === 'physical' ? 'Products' : section}
          </p>
          {items.map(c => (
            <button
              key={c.id}
              onClick={() => onSelect(c)}
              className="w-full px-4 py-3 flex items-center gap-3 border-b border-gray-100 dark:border-darkline text-left cursor-pointer"
            >
              <span className="flex-1 text-[13px] text-navy dark:text-white">
                {c.display_name}
              </span>
              {selectedId === c.id && <Check size={16} className="text-accent" />}
            </button>
          ))}
        </div>
      ))}
    </BottomSheet>
  );
}

export function ListingAvailabilityPicker({
  value, onChange, onClose,
}: {
  value: Availability;
  onChange: (v: Availability) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet title="Choose availability" onClose={onClose}>
      <button
        onClick={() => onChange('single')}
        className="w-full px-4 py-3 flex items-start gap-3 border-b border-gray-100 dark:border-darkline text-left cursor-pointer"
      >
        <div className="flex-1">
          <p className="text-[13px] font-bold text-navy dark:text-white">List as Single Item</p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            If you're selling one item, show "Only one" on your listing.
          </p>
        </div>
        {value === 'single' && <Check size={16} className="text-accent mt-1" />}
      </button>
      <button
        onClick={() => onChange('in_stock')}
        className="w-full px-4 py-3 flex items-start gap-3 text-left cursor-pointer"
      >
        <div className="flex-1">
          <p className="text-[13px] font-bold text-navy dark:text-white">List as In Stock</p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            If you're selling more than one item, show "In Stock" on your listing.
          </p>
        </div>
        {value === 'in_stock' && <Check size={16} className="text-accent mt-1" />}
      </button>
    </BottomSheet>
  );
    }

import { BACKGROUNDS, backgroundStyle } from '../lib/postBackgrounds';

type Props = {
  selectedId: string;
  onSelect: (id: string) => void;
};

export default function PostBackgroundPicker({ selectedId, onSelect }: Props) {
  return (
    <div className="border-t border-gray-100 bg-white">
      <div className="flex gap-2 px-3 py-3 overflow-x-auto">
        {BACKGROUNDS.map(bg => {
          const isActive = bg.id === selectedId;
          return (
            <button
              key={bg.id}
              onClick={() => onSelect(bg.id)}
              aria-label={bg.label}
              style={backgroundStyle(bg)}
              className={`w-10 h-10 rounded-full shrink-0 transition-all ${bg.bgClass} ${
                isActive
                  ? 'ring-2 ring-[#1877F2] ring-offset-2 ring-offset-white scale-105'
                  : 'active:scale-95'
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}

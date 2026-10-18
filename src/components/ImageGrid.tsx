import React from 'react';

export default function ImageGrid({ images, onOpenImage }: { images: string[]; onOpenImage?: (index: number) => void }) {
  if (!images || images.length === 0) return null;
  const imgs = images.slice(0, 4);
  const extra = images.length - 4;

  const gridClass = 
    imgs.length === 1 ? 'grid-cols-1' : 
    imgs.length === 2 ? 'grid-cols-2' : 
    imgs.length === 3 ? 'grid-cols-2 grid-rows-2' : 
    'grid-cols-2';

  return (
    <div className={`grid gap-0.5 bg-gray-100 dark:bg-darkline ${gridClass}`}>
      {imgs.map((url, i) => (
        <button
          key={i}
          onClick={(e) => { e.stopPropagation(); onOpenImage?.(i); }}
          className={`relative overflow-hidden bg-gray-100 ${
            imgs.length === 1 ? 'aspect-[4/3]' :
            imgs.length === 3 && i === 0 ? 'row-span-2 min-h-[300px]' :
            'aspect-square'
          }`}
        >
          <img src={url} alt="" className="w-full h-full object-cover" loading={i === 0 ? 'eager' : 'lazy'} decoding="async" />
          {i === 3 && extra > 0 && (
            <div className="absolute inset-0 bg-black/55 flex items-center justify-center text-white font-bold text-3xl">
              +{extra}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

import React from 'react';

export default function ImageGrid({ images }: { images: string[] }) {
  if (!images || images.length === 0) return null;

  if (images.length === 1) {
    return (
      <div className="w-full">
        <img src={images[0]} alt="" className="w-full max-h-[500px] object-cover" />
      </div>
    );
  }

  if (images.length === 2) {
    return (
      <div className="grid grid-cols-2 gap-0.5">
        {images.map((url, i) => (
          <img key={i} src={url} alt="" className="w-full aspect-square object-cover" />
        ))}
      </div>
    );
  }

  if (images.length === 3) {
    return (
      <div className="grid grid-cols-2 gap-0.5">
        <img src={images[0]} alt="" className="w-full h-full object-cover row-span-2" />
        <img src={images[1]} alt="" className="w-full aspect-square object-cover" />
        <img src={images[2]} alt="" className="w-full aspect-square object-cover" />
      </div>
    );
  }

  // 4 or more images
  return (
    <div className="grid grid-cols-3 gap-0.5">
      {images.slice(0, 9).map((url, i) => (
        <div key={i} className="relative aspect-square">
          <img src={url} alt="" className="w-full h-full object-cover" />
          {i === 8 && images.length > 9 && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-bold text-xl">
              +{images.length - 9}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

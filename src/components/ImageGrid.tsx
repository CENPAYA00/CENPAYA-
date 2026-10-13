import { useState } from 'react';
import ImageViewer from './ImageViewer';

type Props = {
  images: string[];
};

export default function ImageGrid({ images }: Props) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [startIndex, setStartIndex] = useState(0);

  if (images.length === 0) return null;

  const open = (i: number) => {
    setStartIndex(i);
    setViewerOpen(true);
  };

  return (
    <>
      {images.length === 1 && (
        <button onClick={() => open(0)} className="w-full block">
          <img src={images[0]} alt="" className="w-full h-auto bg-gray-100 dark:bg-darkbg" loading="lazy" />
        </button>
      )}

      {images.length === 2 && (
        <div className="grid grid-cols-2 gap-0.5">
          {images.map((src, i) => (
            <button key={i} onClick={() => open(i)} className="aspect-square overflow-hidden bg-gray-100 dark:bg-darkbg">
              <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {images.length === 3 && (
        <div className="grid grid-cols-3 gap-0.5">
          {images.map((src, i) => (
            <button key={i} onClick={() => open(i)} className="aspect-square overflow-hidden bg-gray-100 dark:bg-darkbg">
              <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {images.length >= 4 && (
        <div className="grid grid-cols-2 gap-0.5">
          <button onClick={() => open(0)} className="aspect-square overflow-hidden bg-gray-100 dark:bg-darkbg">
            <img src={images[0]} alt="" className="w-full h-full object-cover" loading="lazy" />
          </button>
          <div className="grid grid-rows-3 gap-0.5 aspect-square">
            {images.slice(1, 4).map((src, i) => (
              <button
                key={i}
                onClick={() => open(i + 1)}
                className="relative overflow-hidden bg-gray-100 dark:bg-darkbg"
              >
                <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />
                {i === 2 && images.length > 4 && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-lg font-bold">
                    +{images.length - 4}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {viewerOpen && (
        <ImageViewer
          images={images}
          startIndex={startIndex}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </>
  );
}

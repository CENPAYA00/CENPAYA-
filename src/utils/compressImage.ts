/**
 * Compress an image file using raw <canvas> — no npm dependency.
 * Targets: max 800px on the longest side, output quality tuned to land under 150KB.
 */

const MAX_DIMENSION = 800;
const TARGET_BYTES = 150 * 1024; // 150 KB

export async function compressImage(
  file: File,
  opts?: { maxDimension?: number; targetBytes?: number }
): Promise<File> {
  const maxDim = opts?.maxDimension ?? MAX_DIMENSION;
  const targetBytes = opts?.targetBytes ?? TARGET_BYTES;

  // Skip non-images
  if (!file.type.startsWith('image/')) return file;

  // SVG: never rasterize (loses vector), just return
  if (file.type === 'image/svg+xml') return file;

  // GIF: canvas would flatten animation — return untouched
  if (file.type === 'image/gif') return file;

  const bitmap = await loadBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxDim);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;

  // Preserve transparency for PNG; JPEG has no alpha
  const outputType: 'image/jpeg' | 'image/webp' | 'image/png' =
    file.type === 'image/png' ? 'image/webp' : 'image/jpeg';

  ctx.drawImage(bitmap as any, 0, 0, width, height);

  // Try decreasing quality until it fits, floor 0.4
  let quality = 0.85;
  let blob: Blob | null = null;
  while (quality >= 0.4) {
    blob = await canvasToBlob(canvas, outputType, quality);
    if (blob && blob.size <= targetBytes) break;
    quality -= 0.1;
  }

  if (!blob) return file;

  const ext = outputType === 'image/webp' ? 'webp' : 'jpg';
  const newName = replaceExt(file.name, ext);
  return new File([blob], newName, { type: outputType, lastModified: Date.now() });
}

function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    return createImageBitmap(file).catch(() => loadImageFallback(file));
  }
  return loadImageFallback(file);
}

function loadImageFallback(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

function fitWithin(w: number, h: number, max: number) {
  if (w <= max && h <= max) return { width: w, height: h };
  const ratio = w > h ? max / w : max / h;
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}

function replaceExt(name: string, ext: string) {
  const base = name.replace(/\.[^.]+$/, '');
  return `${base}.${ext}`;
}

/** Convenience: compress an array in parallel. */
export async function compressImages(files: File[]): Promise<File[]> {
  return Promise.all(files.map(f => compressImage(f)));
}

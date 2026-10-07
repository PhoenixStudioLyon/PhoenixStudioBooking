import { useEffect, useRef, useState } from 'react';
import { LuImagePlus, LuX, LuChevronLeft, LuChevronRight } from 'react-icons/lu';
import { api } from '../api.js';

export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif';
const MAX_SIDE = 2000;

// Big phone photos are scaled down to MAX_SIDE px (JPEG) before upload to keep the database small.
// GIFs and pictures the browser can't decode (e.g. HEIC outside Safari) are sent as they are.
export async function shrinkImage(file) {
  if (file.type === 'image/gif' || file.size < 600 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // transparent PNG areas become white instead of black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

// Picks image files out of a paste / drop / file-input event
export const imageFiles = (list) => Array.from(list || []).filter((f) => f.type.startsWith('image/'));

// Photo thumbnails. Each photo is { id } (saved) or { key, url } (not uploaded yet).
export function PhotoGrid({ photos, onRemove, onAdd, busy }) {
  const input = useRef(null);
  const [open, setOpen] = useState(null);
  const src = (p) => p.url || api.photoUrl(p.id);
  return (
    <div className="photo-grid">
      {photos.map((p, i) => (
        <div className="photo-thumb" key={p.id || p.key}>
          <button type="button" className="photo-open" onClick={() => setOpen(i)} aria-label="View photo">
            <img src={src(p)} alt={p.name || 'Photo'} loading="lazy" />
          </button>
          {onRemove && (
            <button type="button" className="photo-remove" onClick={() => onRemove(p)} aria-label="Remove photo"><LuX /></button>
          )}
        </div>
      ))}
      {onAdd && <>
        <button type="button" className="photo-add" onClick={() => input.current.click()} disabled={busy}>
          <LuImagePlus /><span>{busy ? 'Uploading…' : 'Add photo'}</span>
        </button>
        <input ref={input} type="file" accept={PHOTO_ACCEPT} multiple hidden
          onChange={(e) => { onAdd(imageFiles(e.target.files)); e.target.value = ''; }} />
      </>}
      {open != null && photos[open] && (
        <PhotoViewer photos={photos} index={open} src={src} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

function PhotoViewer({ photos, index, src, onIndex, onClose }) {
  const n = photos.length;
  useEffect(() => {
    const on = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'ArrowLeft') onIndex((index - 1 + n) % n);
      if (e.key === 'ArrowRight') onIndex((index + 1) % n);
    };
    window.addEventListener('keydown', on, true); // capture: Escape closes the viewer, not the modal under it
    return () => window.removeEventListener('keydown', on, true);
  }, [index, n, onIndex, onClose]);
  return (
    <div className="photo-viewer" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <img src={src(photos[index])} alt={photos[index].name || 'Photo'} />
      <button type="button" className="pv-btn pv-close" onClick={onClose} aria-label="Close"><LuX /></button>
      {n > 1 && <>
        <button type="button" className="pv-btn pv-prev" onClick={() => onIndex((index - 1 + n) % n)} aria-label="Previous"><LuChevronLeft /></button>
        <button type="button" className="pv-btn pv-next" onClick={() => onIndex((index + 1) % n)} aria-label="Next"><LuChevronRight /></button>
      </>}
    </div>
  );
}

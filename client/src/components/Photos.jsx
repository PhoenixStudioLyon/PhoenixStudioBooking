import { useEffect, useRef, useState } from 'react';
import { LuImagePlus, LuX, LuChevronLeft, LuChevronRight } from 'react-icons/lu';
import { api } from '../api.js';

export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif';
const MAX_SIDE = 2000;
const THUMB_SIDE = 240; // preview size for the photo squares (shown at 96px, sharp on phone screens)

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

// Small JPEG preview from a file or an already loaded <img>. Returns null if the browser can't read the picture.
export async function makeThumb(source) {
  try {
    const bmp = source instanceof HTMLImageElement ? source : await createImageBitmap(source, { imageOrientation: 'from-image' });
    const w = bmp.naturalWidth || bmp.width, h = bmp.naturalHeight || bmp.height;
    if (!w || !h) return null;
    const scale = Math.min(1, THUMB_SIDE / Math.min(w, h)); // the square crops the long side, so size by the short one
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    if (bmp.close) bmp.close();
    return await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.8));
  } catch {
    return null;
  }
}

// Uploads a photo (scaled down) and its preview
export async function uploadPhoto(bookingId, file) {
  const photo = await shrinkImage(file);
  const saved = await api.uploadPhoto(bookingId, photo);
  const thumb = await makeThumb(photo);
  if (thumb) await api.uploadThumb(saved.id, thumb).catch(() => {}); // without a preview the full photo is shown
  return saved;
}

// Picks image files out of a paste / drop / file-input event
export const imageFiles = (list) => Array.from(list || []).filter((f) => f.type.startsWith('image/'));

// Photo squares. Each photo is { id, has_thumb } (saved) or { key, url } (not uploaded yet).
// The squares load the small preview; the full photo is only loaded in the viewer.
// backfill: when allowed to edit, photos uploaded before previews existed get one the first time they're shown.
const backfilled = new Set();
export function PhotoGrid({ photos, onRemove, onAdd, busy, backfill = false }) {
  const input = useRef(null);
  const [open, setOpen] = useState(null);
  const src = (p) => p.url || api.photoUrl(p.id);
  const thumbSrc = (p) => p.url || (p.has_thumb ? api.thumbUrl(p.id) : api.photoUrl(p.id));
  const makeMissingThumb = async (p, img) => {
    if (!backfill || !p.id || p.has_thumb || backfilled.has(p.id)) return;
    backfilled.add(p.id);
    const thumb = await makeThumb(img);
    if (thumb) api.uploadThumb(p.id, thumb).catch(() => {});
  };
  return (
    <div className="photo-grid">
      {photos.map((p, i) => (
        <div className="photo-thumb" key={p.id || p.key}>
          <button type="button" className="photo-open" onClick={() => setOpen(i)} aria-label="View photo">
            <img src={thumbSrc(p)} alt={p.name || 'Photo'} loading="lazy" onLoad={(e) => makeMissingThumb(p, e.currentTarget)} />
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

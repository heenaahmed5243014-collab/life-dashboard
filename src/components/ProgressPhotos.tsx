// Progress photos inside Body progress: private, shrunk on the phone before upload,
// shown as a strip of dates. Tap one to see it bigger, compare with your first, or delete it.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { shortDate, today } from '../dates';
import { useToast } from '../toast';
import type { ProgressPhoto } from '../types';

/** Shrink a photo to at most 1400px on the long side, as a JPEG. */
async function shrink(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error('Could not read that photo'))), 'image/jpeg', 0.85));
}

function useUrl(path: string | undefined): string | null {
  const store = useStore();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (path) store.photoUrl(path).then((u) => live && setUrl(u), () => {});
    return () => { live = false; };
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  return url;
}

function Thumb({ p, onOpen }: { p: ProgressPhoto; onOpen: () => void }) {
  const url = useUrl(p.path);
  return (
    <button type="button" className="pp-thumb" onClick={onOpen} aria-label={`Progress photo from ${shortDate(p.day)}`}>
      {url ? <img src={url} alt="" /> : <span className="pp-wait" />}
      <span className="pp-date">{shortDate(p.day)}</span>
    </button>
  );
}

function Viewer({ p, first, onClose }: { p: ProgressPhoto; first: ProgressPhoto; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [compare, setCompare] = useState(false);
  const url = useUrl(p.path);
  const firstUrl = useUrl(compare ? first.path : undefined);
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet pp-sheet" role="dialog" aria-modal="true" aria-label="Progress photo">
        <div className="sheet-head"><h2 className="sheet-title">{shortDate(p.day)}</h2><button type="button" className="link-btn" onClick={onClose}>Close</button></div>
        <div className={compare ? 'pp-compare' : 'pp-single'}>
          {compare && <figure><img src={firstUrl ?? undefined} alt={`First photo, ${shortDate(first.day)}`} /><figcaption>{shortDate(first.day)}</figcaption></figure>}
          <figure><img src={url ?? undefined} alt={`Photo from ${shortDate(p.day)}`} />{compare && <figcaption>{shortDate(p.day)}</figcaption>}</figure>
        </div>
        <div className="row">
          {first.id !== p.id && <button type="button" className="btn small" onClick={() => setCompare(!compare)}>{compare ? 'Just this one' : 'Compare with my first'}</button>}
          <button type="button" className="btn small" onClick={() => { if (confirm('Delete this photo? This can’t be undone.')) { store.removePhoto(p); toast({ message: 'Photo deleted' }); onClose(); } }}>Delete</button>
        </div>
      </div>
    </div>
  );
}

export default function ProgressPhotos() {
  const store = useStore();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<ProgressPhoto | null>(null);
  const photos = store.photos;

  if (store.db17 === false) return <p className="note">Progress photos need database update 17. Ask Claude for the link.</p>;

  const add = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      await store.addPhoto(await shrink(file), today());
      toast({ message: 'Progress photo saved privately 📸' });
    } catch (e) {
      toast({ message: `Couldn’t save that photo. ${(e as Error).message}`.slice(0, 140) });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="pp">
      <div className="between"><span className="eyebrow">📸 Progress photos</span>{photos.length > 0 && <span className="note">{photos.length} saved</span>}</div>
      <div className="pp-strip">
        <button type="button" className="pp-add" onClick={() => input.current?.click()} disabled={busy}>{busy ? 'Saving…' : '+ Add'}</button>
        {[...photos].reverse().map((p) => <Thumb key={p.id} p={p} onOpen={() => setOpen(p)} />)}
      </div>
      {photos.length === 0 && <p className="note">Same spot, same light, once a week. Only you can see them.</p>}
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => add(e.target.files?.[0])} />
      {open && <Viewer p={open} first={photos[0]} onClose={() => setOpen(null)} />}
    </div>
  );
}

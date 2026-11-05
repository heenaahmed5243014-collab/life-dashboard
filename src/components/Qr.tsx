// QR code screenshots for returns: add, show full-screen, replace or remove.
import { useEffect, useRef, useState } from 'react';
import type { Task } from '../types';
import { useStore } from '../store';
import { useToast } from '../toast';
import { Close } from '../icons';

const MAX_MB = 10;

/** A button that picks an image (camera roll or files) and saves it as this return's QR code. */
export function QrUpload({ task, label = 'Add QR code screenshot' }: { task: Task; label?: string }) {
  const store = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast({ message: 'That isn’t an image. Choose a screenshot.' });
    if (file.size > MAX_MB * 1024 * 1024) return toast({ message: `That image is over ${MAX_MB} MB.` });
    setBusy(true);
    try {
      await store.uploadQr(task, file);
      toast({ message: 'QR code saved' });
    } catch {
      toast({ message: 'Couldn’t save that screenshot. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <label className={`qr-upload${busy ? ' busy' : ''}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>
      {busy ? 'Saving…' : label}
      <input ref={input} type="file" accept="image/*" disabled={busy} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
    </label>
  );
}

/** Loads a stored QR screenshot as an image link (links last an hour). */
export function useQrUrl(path: string | null): string | null {
  const store = useStore();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (path) store.qrUrl(path).then((u) => live && setUrl(u), () => live && setUrl(null));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  return url;
}

export function QrThumb({ task }: { task: Task }) {
  const url = useQrUrl(task.qr_path);
  return url ? <img className="qr-thumb" src={url} alt={`QR code for ${task.title}`} /> : <span className="qr-thumb placeholder" aria-hidden="true">QR</span>;
}

/** Full-screen, bright white view to show at the counter. */
export function QrViewer({ task, onClose, onDone }: { task: Task; onClose: () => void; onDone: () => void }) {
  const url = useQrUrl(task.qr_path);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="qr-viewer" role="dialog" aria-modal="true" aria-label={`QR code for ${task.title}`}>
      <button type="button" className="round-btn qr-close" onClick={onClose} aria-label="Close"><Close /></button>
      {task.drop_off && <span className="eyebrow">{task.drop_off}</span>}
      <h2 className="h2 qr-title">{task.title}</h2>
      {url ? <img src={url} alt={`QR code for ${task.title}`} className="qr-big" /> : <div className="qr-big loading">Loading…</div>}
      <p className="note">Turn your screen brightness up and show this at the counter.</p>
      <div className="qr-actions">
        <button type="button" className="btn" onClick={onDone}>Dropped off ✓</button>
        <button type="button" className="btn primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

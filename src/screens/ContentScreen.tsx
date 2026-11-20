// Content: plan each client's posts. Three tabs:
//  • Calendar — a month of posts per client. Upload your own pictures, drag a post to another day.
//  • Feed — how the client's Instagram grid will look. Drag one square onto another to swap them.
//  • Clients — onboarding checklist for each new client, with what to do next.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { go } from '../router';
import Nav from '../components/Nav';
import { useToast } from '../toast';
import { addDays, parseDay, shortDate, today, weekday, WEEKDAY_LETTER, type Day } from '../dates';
import { callAgent } from '../agent';
import { CLIENT_COLOURS, ONBOARDING, onboardingProgress, shrink } from '../onboarding';
import type { Client, ContentPost, PostKind, PostStatus } from '../types';

type Tab = 'calendar' | 'feed' | 'clients';
const TABS: { key: Tab; label: string }[] = [{ key: 'calendar', label: 'Calendar' }, { key: 'feed', label: 'Feed' }, { key: 'clients', label: 'Clients' }];

export const KINDS: { key: PostKind; emoji: string; label: string }[] = [
  { key: 'post', emoji: '🖼️', label: 'Post' }, { key: 'carousel', emoji: '🎠', label: 'Carousel' }, { key: 'reel', emoji: '🎬', label: 'Reel' }, { key: 'story', emoji: '⭕', label: 'Story' },
];
export const STATUSES: { key: PostStatus; label: string }[] = [
  { key: 'idea', label: 'Idea' }, { key: 'draft', label: 'Draft' }, { key: 'approved', label: 'Approved' }, { key: 'scheduled', label: 'Scheduled' }, { key: 'posted', label: 'Posted' },
];
const PLATFORMS = ['Instagram', 'TikTok', 'Facebook', 'LinkedIn'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CLIENT_KEY = 'ld:content-client';

/* ---------- pictures ---------- */

const urlCache = new Map<string, string>();
function usePic(path: string | null): string | null {
  const store = useStore();
  const [url, setUrl] = useState<string | null>(path ? urlCache.get(path) ?? null : null);
  useEffect(() => {
    let live = true;
    if (!path) { setUrl(null); return; }
    const hit = urlCache.get(path);
    if (hit) { setUrl(hit); return; }
    store.contentUrl(path).then((u) => { urlCache.set(path, u); if (live) setUrl(u); }, () => {});
    return () => { live = false; };
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  return url;
}

function Pic({ p, client, label = false }: { p: ContentPost; client?: Client; label?: boolean }) {
  const url = usePic(p.image_path);
  const kind = KINDS.find((k) => k.key === p.kind)!;
  if (url) return <img src={url} alt="" draggable={false} />;
  return (
    <span className="cp-ph" style={{ ['--cc' as string]: client?.color ?? '#1C1C1C' }}>
      <span aria-hidden="true">{kind.emoji}</span>
      {label && p.caption && <small>{p.caption.slice(0, 48)}</small>}
    </span>
  );
}

/* ---------- drag a post onto a day (calendar) or onto another square (feed) ---------- */

let suppressClick = false;
/** Mouse: press and move. Finger: press and hold for a moment, then move. Drop targets carry data-drop="…". */
function dragHandlers(id: string, onDrop: (id: string, target: string) => void) {
  return {
    onClickCapture: (e: React.MouseEvent) => { if (suppressClick) { e.preventDefault(); e.stopPropagation(); } },
    onContextMenu: (e: React.MouseEvent) => { if ((e.nativeEvent as PointerEvent).pointerType !== 'mouse') e.preventDefault(); },
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const el = e.currentTarget;
      const touch = e.pointerType !== 'mouse';
      const sx = e.clientX, sy = e.clientY;
      let active = false, ghost: HTMLElement | null = null, target: string | null = null, offX = 0, offY = 0;
      let timer = 0;
      const mark = (t: Element | null) => {
        document.querySelectorAll('.drop-over').forEach((n) => n.classList.remove('drop-over'));
        t?.classList.add('drop-over');
      };
      const activate = (x: number, y: number) => {
        active = true;
        const r = el.getBoundingClientRect();
        offX = x - r.left; offY = y - r.top;
        ghost = el.cloneNode(true) as HTMLElement;
        Object.assign(ghost.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, zIndex: '80', pointerEvents: 'none', opacity: '0.9', transform: 'scale(1.08)', boxShadow: '0 16px 32px rgba(0,0,0,0.25)', transition: 'none' });
        document.body.appendChild(ghost);
        el.classList.add('cp-lifted');
        document.body.classList.add('cp-dragging');
        navigator.vibrate?.(10);
      };
      const move = (ev: PointerEvent) => {
        const dist = Math.hypot(ev.clientX - sx, ev.clientY - sy);
        if (!active) {
          if (touch) { if (dist > 8) end(); return; } // finger moved before the hold: it's a scroll
          if (dist > 6) activate(ev.clientX, ev.clientY); else return;
        }
        ghost!.style.left = `${ev.clientX - offX}px`;
        ghost!.style.top = `${ev.clientY - offY}px`;
        const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-drop]') ?? null;
        target = hit?.dataset.drop ?? null;
        mark(hit);
        if (ev.clientY < 70) scrollBy(0, -12); else if (ev.clientY > innerHeight - 110) scrollBy(0, 12);
      };
      const stopScroll = (ev: TouchEvent) => { if (active) ev.preventDefault(); };
      const end = () => {
        clearTimeout(timer);
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
        removeEventListener('pointercancel', end);
        document.removeEventListener('touchmove', stopScroll);
        mark(null);
        ghost?.remove();
        el.classList.remove('cp-lifted');
        document.body.classList.remove('cp-dragging');
      };
      const up = () => {
        const was = active;
        end();
        if (was) {
          suppressClick = true;
          setTimeout(() => { suppressClick = false; }, 60);
          if (target) onDrop(id, target);
        }
      };
      if (touch) timer = window.setTimeout(() => activate(sx, sy), 280);
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      addEventListener('pointercancel', end);
      document.addEventListener('touchmove', stopScroll, { passive: false });
    },
  };
}

/* ---------- the post editor ---------- */

type Draft = Omit<ContentPost, 'id' | 'image_path'> & { id?: string; image_path: string | null };

function PostSheet({ start, clients, onClose }: { start: Draft; clients: Client[]; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [d, setD] = useState<Draft>(start);
  const [image, setImage] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [agentBusy, setAgentBusy] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const saved = usePic(d.image_path);
  const client = clients.find((c) => c.id === d.client_id);
  const set = (c: Partial<Draft>) => setD((x) => ({ ...x, ...c }));
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    try {
      const b = await shrink(f);
      setImage(b);
      setPreview(URL.createObjectURL(b));
    } catch (e) { toast({ message: (e as Error).message }); }
  };
  const save = async () => {
    setBusy(true);
    try {
      const { id, image_path: _p, ...fields } = d;
      if (id) {
        const orig = store.posts.find((p) => p.id === id)!;
        store.updatePost(id, fields);
        if (image) await store.setPostImage(orig, image);
      } else {
        await store.addPost(fields, image ?? undefined);
      }
      onClose();
    } catch (e) {
      toast({ message: `Couldn’t save the picture. ${(e as Error).message}`.slice(0, 140) });
    } finally { setBusy(false); }
  };
  const askAgent = async () => {
    setAgentBusy(true); setSuggestion('');
    try {
      const r = await callAgent<{ output: string }>({ mode: 'smm', agent: 'captions', client: client?.name ?? '', title: `${KINDS.find((k) => k.key === d.kind)!.label} for ${shortDate(d.day)}`, platform: d.platform, brief: [d.caption, client?.notes].filter(Boolean).join('\n\n') || 'A post for this client' });
      setSuggestion(r.output);
    } catch (e) { toast({ message: (e as Error).message }); } finally { setAgentBusy(false); }
  };
  const remove = () => {
    if (!d.id || !confirm('Delete this post and its picture?')) return;
    store.deletePost(store.posts.find((p) => p.id === d.id)!);
    toast({ message: 'Post deleted' });
    onClose();
  };
  const shown = preview ?? saved;

  return createPortal(
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet cp-sheet" role="dialog" aria-modal="true" aria-label={d.id ? 'Edit post' : 'New post'}>
        <div className="sheet-head"><h2 className="sheet-title">{d.id ? 'Edit post' : 'New post'}</h2><button type="button" className="link-btn" onClick={onClose}>Cancel</button></div>
        <div className="cp-edit">
          <button type="button" className={`cp-drop${shown ? ' has' : ''}`} onClick={() => file.current?.click()}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void pick(e.dataTransfer.files[0]); }}>
            {shown ? <img src={shown} alt="Post picture" /> : <span><b>📷 Upload picture</b><small>From your camera roll or computer</small></span>}
            {shown && <span className="cp-change">Change</span>}
          </button>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
          <div className="cp-fields">
            <span className="eyebrow">Client</span>
            <div className="chip-scroll">
              {clients.map((c) => (
                <button key={c.id} type="button" className={d.client_id === c.id ? 'chip on' : 'chip'} onClick={() => set({ client_id: c.id })}>
                  <i className="cp-dot" style={{ background: c.color }} />{c.name}
                </button>
              ))}
            </div>
            <div className="cp-when">
              <label><span className="eyebrow">Day</span><input type="date" className="step-input" value={d.day} onChange={(e) => e.target.value && set({ day: e.target.value as Day })} /></label>
              <label><span className="eyebrow">Time</span><input type="time" className="step-input" value={d.time ?? ''} onChange={(e) => set({ time: e.target.value || null })} /></label>
            </div>
            <span className="eyebrow">Type</span>
            <div className="segmented" role="radiogroup" aria-label="Type">
              {KINDS.map((k) => <button key={k.key} type="button" role="radio" aria-checked={d.kind === k.key} className={d.kind === k.key ? 'seg on' : 'seg'} onClick={() => set({ kind: k.key })}>{k.emoji} {k.label}</button>)}
            </div>
            <span className="eyebrow">Where</span>
            <div className="chip-scroll">
              {PLATFORMS.map((p) => <button key={p} type="button" className={d.platform === p ? 'chip on' : 'chip'} onClick={() => set({ platform: p })}>{p}</button>)}
            </div>
            <span className="eyebrow">Stage</span>
            <div className="chip-scroll cp-stages">
              {STATUSES.map((s) => <button key={s.key} type="button" className={`chip st-${s.key}${d.status === s.key ? ' on' : ''}`} onClick={() => set({ status: s.key })}>{s.label}</button>)}
            </div>
            <div className="between"><span className="eyebrow">Caption</span><span className="note">{d.caption.length}/2200</span></div>
            <textarea className="smm-brief" rows={4} maxLength={4000} placeholder="Caption, or a few words about the post" value={d.caption} onChange={(e) => set({ caption: e.target.value })} />
            <button type="button" className="btn small" onClick={askAgent} disabled={agentBusy}>{agentBusy ? 'Writing…' : '✍️ Ask the caption agent'}</button>
            {suggestion && (
              <div className="cp-suggest">
                <pre>{suggestion}</pre>
                <div className="row"><button type="button" className="btn small" onClick={() => { set({ caption: suggestion }); setSuggestion(''); }}>Use this</button><button type="button" className="link-btn" onClick={() => setSuggestion('')}>Dismiss</button></div>
              </div>
            )}
          </div>
        </div>
        <div className="row cp-actions">
          <button type="button" className="btn primary" onClick={save} disabled={busy || !d.client_id}>{busy ? 'Saving…' : 'Save'}</button>
          {d.id && <button type="button" className="btn small" onClick={remove}>Delete</button>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ---------- calendar ---------- */

function monthGrid(year: number, month: number): Day[] {
  const first = `${year}-${String(month + 1).padStart(2, '0')}-01` as Day;
  const startDay = addDays(first, -weekday(first));
  const days: Day[] = [];
  for (let i = 0; i < 42; i++) days.push(addDays(startDay, i));
  // Drop the last week if it's entirely next month
  return parseDay(days[35]).getMonth() !== month ? days.slice(0, 35) : days;
}

function Calendar({ posts, clients, clientFor, onOpen, onNew }: { posts: ContentPost[]; clients: Client[]; clientFor: (p: ContentPost) => Client | undefined; onOpen: (p: ContentPost) => void; onNew: (day: Day, files?: FileList) => void }) {
  const store = useStore();
  const toast = useToast();
  const now = today();
  const [ym, setYm] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [dayOpen, setDayOpen] = useState<Day | null>(null);
  const days = monthGrid(ym.y, ym.m);
  const shift = (n: number) => setYm(({ y, m }) => { const t = new Date(y, m + n, 1); return { y: t.getFullYear(), m: t.getMonth() }; });
  const byDay = (d: Day) => posts.filter((p) => p.day === d).sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'));
  const drop = (id: string, target: string) => {
    const p = store.posts.find((x) => x.id === id);
    if (!p || p.day === target) return;
    store.updatePost(id, { day: target as Day });
    toast({ message: `Moved to ${shortDate(target as Day)}`, undo: () => store.updatePost(id, { day: p.day }) });
  };
  const inMonth = posts.filter((p) => parseDay(p.day).getMonth() === ym.m && parseDay(p.day).getFullYear() === ym.y).sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? '').localeCompare(b.time ?? ''));
  const needs = inMonth.filter((p) => p.status !== 'posted' && !p.image_path).length;

  return (
    <>
      <section className="card cp-cal">
        <div className="cp-cal-head">
          <button type="button" className="round-btn" aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
          <h2 className="h2">{MONTHS[ym.m]} {ym.y}</h2>
          <button type="button" className="round-btn" aria-label="Next month" onClick={() => shift(1)}>›</button>
        </div>
        <div className="cp-grid" role="grid" aria-label={`${MONTHS[ym.m]} content calendar`}>
          {WEEKDAY_LETTER.map((l, i) => <span key={i} className="cp-wd" aria-hidden="true">{l}</span>)}
          {days.map((d) => {
            const list = byDay(d);
            const out = parseDay(d).getMonth() !== ym.m;
            return (
              <div key={d} role="gridcell" data-drop={d} className={`cp-day${out ? ' out' : ''}${d === now ? ' now' : ''}${d < now ? ' past' : ''}`}
                onClick={() => setDayOpen(d)}
                onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.currentTarget.classList.add('drop-over'); } }}
                onDragLeave={(e) => e.currentTarget.classList.remove('drop-over')}
                onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('drop-over'); if (e.dataTransfer.files.length) onNew(d, e.dataTransfer.files); }}>
                <span className="cp-num">{parseDay(d).getDate()}</span>
                <span className="cp-thumbs">
                  {list.slice(0, 4).map((p) => (
                    <button key={p.id} type="button" className={`cp-thumb st-${p.status}`} style={{ ['--cc' as string]: clientFor(p)?.color ?? '#1C1C1C' }}
                      aria-label={`${clientFor(p)?.name ?? ''} ${p.kind}: ${p.caption || 'no caption'} (${p.status})`}
                      onClick={(e) => { e.stopPropagation(); onOpen(p); }} {...dragHandlers(p.id, drop)}>
                      <Pic p={p} client={clientFor(p)} />
                    </button>
                  ))}
                  {list.length > 4 && <span className="cp-more">+{list.length - 4}</span>}
                </span>
              </div>
            );
          })}
        </div>
        <p className="note cp-tip">Tap a day to add a post. Drag a post to another day{matchMedia('(pointer: coarse)').matches ? ' (press and hold first)' : ', or drop pictures from your computer onto a day'}.</p>
      </section>

      <section className="card">
        <div className="between">
          <span className="eyebrow">{MONTHS[ym.m]}: {inMonth.length} post{inMonth.length === 1 ? '' : 's'}</span>
          {needs > 0 && <span className="tag t-amber">{needs} need a picture</span>}
        </div>
        {inMonth.length === 0 && <p className="note">Nothing planned this month yet. {clients.length ? 'Tap a day above to start.' : 'Add a client first in the Clients tab.'}</p>}
        <ul className="cp-list">
          {inMonth.map((p) => {
            const c = clientFor(p);
            return (
              <li key={p.id}>
                <button type="button" className="cp-row" onClick={() => onOpen(p)}>
                  <span className="cp-row-pic"><Pic p={p} client={c} /></span>
                  <span className="cp-row-main">
                    <b>{p.caption || `${KINDS.find((k) => k.key === p.kind)!.label} (no caption yet)`}</b>
                    <span className="note">{shortDate(p.day)}{p.time ? ` · ${p.time}` : ''} · {c?.name ?? 'No client'} · {p.platform}</span>
                  </span>
                  <span className={`cp-status st-${p.status}`}>{STATUSES.find((s) => s.key === p.status)!.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {dayOpen && createPortal(
        <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && setDayOpen(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label={shortDate(dayOpen)}>
            <div className="sheet-head"><h2 className="sheet-title">{shortDate(dayOpen)}</h2><button type="button" className="link-btn" onClick={() => setDayOpen(null)}>Close</button></div>
            <ul className="cp-list">
              {byDay(dayOpen).map((p) => (
                <li key={p.id}>
                  <button type="button" className="cp-row" onClick={() => { setDayOpen(null); onOpen(p); }}>
                    <span className="cp-row-pic"><Pic p={p} client={clientFor(p)} /></span>
                    <span className="cp-row-main"><b>{p.caption || 'No caption yet'}</b><span className="note">{p.time ?? 'Any time'} · {clientFor(p)?.name ?? 'No client'}</span></span>
                    <span className={`cp-status st-${p.status}`}>{STATUSES.find((s) => s.key === p.status)!.label}</span>
                  </button>
                </li>
              ))}
            </ul>
            {byDay(dayOpen).length === 0 && <p className="note">Nothing planned for this day.</p>}
            <div className="row">
              <button type="button" className="btn primary small" onClick={() => { const d = dayOpen; setDayOpen(null); onNew(d); }} disabled={!clients.length}>+ Add a post</button>
              <UploadButton label="📷 Add pictures" onFiles={(f) => { const d = dayOpen; setDayOpen(null); onNew(d, f); }} disabled={!clients.length} />
            </div>
            {!clients.length && <p className="note">Add a client in the Clients tab first.</p>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function UploadButton({ label, onFiles, disabled }: { label: string; onFiles: (f: FileList) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="btn small" onClick={() => input.current?.click()} disabled={disabled}>{label}</button>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = ''; }} />
    </>
  );
}

/* ---------- feed preview ---------- */

function Feed({ client, posts, onOpen, onUpload }: { client: Client; posts: ContentPost[]; onOpen: (p: ContentPost) => void; onUpload: (f: FileList) => void }) {
  const store = useStore();
  const toast = useToast();
  const now = today();
  const grid = posts.filter((p) => p.client_id === client.id && p.kind !== 'story').sort((a, b) => b.day.localeCompare(a.day) || (b.time ?? '').localeCompare(a.time ?? ''));
  const posted = grid.filter((p) => p.status === 'posted').length;
  /** Drag a square to a new spot: the planned posts in between shift along, and each keeps the date of the spot it lands in. */
  const reorder = (id: string, target: string) => {
    const planned = grid.filter((p) => p.status !== 'posted');
    const from = planned.findIndex((p) => p.id === id), to = planned.findIndex((p) => p.id === target);
    if (from < 0 || to < 0) { toast({ message: 'Posted ones stay where they are. Move the planned ones around them.' }); return; }
    if (from === to) return;
    const slots = planned.map((p) => ({ day: p.day, time: p.time }));
    const order = [...planned];
    order.splice(to, 0, order.splice(from, 1)[0]);
    const changes = order.map((p, k) => ({ p, slot: slots[k] })).filter(({ p, slot }) => p.day !== slot.day || p.time !== slot.time);
    changes.forEach(({ p, slot }) => store.updatePost(p.id, slot));
    toast({ message: 'Feed rearranged', undo: () => changes.forEach(({ p }) => store.updatePost(p.id, { day: p.day, time: p.time })) });
  };
  return (
    <section className="card cp-feed">
      <div className="cp-profile">
        <span className="cp-avatar" style={{ background: client.color }}>{client.name.slice(0, 1)}</span>
        <span className="cp-profile-main">
          <b>{client.handle || client.name}</b>
          <span className="note">{posted} posted · {grid.length - posted} planned</span>
        </span>
        <UploadButton label="📷 Add pictures" onFiles={onUpload} />
      </div>
      {grid.length === 0 ? (
        <p className="note">Upload pictures to see how {client.name}’s grid will look. Each one goes on the next free day as a draft.</p>
      ) : (
        <div className="cp-feed-grid"
          onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) onUpload(e.dataTransfer.files); }}>
          {grid.map((p) => (
            <button key={p.id} type="button" data-drop={p.id} className={`cp-tile${p.status === 'posted' ? ' locked' : ' planned'}`} onClick={() => onOpen(p)} {...dragHandlers(p.id, reorder)}
              aria-label={`${p.caption || p.kind}, ${shortDate(p.day)}, ${p.status}`}>
              <Pic p={p} client={client} label />
              {p.kind !== 'post' && <span className="cp-kind" aria-hidden="true">{KINDS.find((k) => k.key === p.kind)!.emoji}</span>}
              {p.status !== 'posted' && <span className={`cp-tile-date${p.day < now ? ' late' : ''}`}>{shortDate(p.day)}</span>}
            </button>
          ))}
        </div>
      )}
      <p className="note cp-tip">Newest first, like Instagram. {matchMedia('(pointer: coarse)').matches ? 'Press and hold a square, then drag it' : 'Drag a square'} to a new spot and the rest shift along; dates follow the order. Dashed squares are planned, solid ones are already posted. {matchMedia('(pointer: coarse)').matches ? '' : 'Drop pictures from your computer here to add them. '}Stories don’t show on the grid.</p>
    </section>
  );
}

/* ---------- clients and onboarding ---------- */

function ClientCard({ c, onFeed }: { c: Client; onFeed: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const pr = onboardingProgress(c);
  const tick = (key: string, on: boolean) => store.updateClient(c.id, { checklist: { ...c.checklist, [key]: on } });
  const upcoming = store.posts.filter((p) => p.client_id === c.id && p.day >= today() && p.status !== 'posted').length;
  return (
    <li className="card cl-card" style={{ ['--cc' as string]: c.color }}>
      <button type="button" className="cl-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="cp-avatar" style={{ background: c.color }}>{c.name.slice(0, 1)}</span>
        <span className="cl-main">
          <b>{c.name}</b>
          <span className="note">{c.handle ? `${c.handle} · ` : ''}{pr.next ? `Next: ${pr.next.label}` : 'Onboarded 🎉'}{upcoming ? ` · ${upcoming} planned` : ''}</span>
          <span className="cl-bar"><i style={{ width: `${(pr.done / pr.total) * 100}%` }} /></span>
        </span>
        <span className="cl-count">{pr.done}/{pr.total}</span>
      </button>
      {!open && pr.next && (
        <button type="button" className="cl-next" onClick={() => { tick(pr.next!.key, true); toast({ message: `${pr.next!.emoji} ${pr.next!.label} done for ${c.name}`, undo: () => tick(pr.next!.key, false) }); }}>
          <span className="cl-box" aria-hidden="true" />{pr.next.emoji} {pr.next.label}<small>{pr.next.hint}</small>
        </button>
      )}
      {open && (
        <div className="cl-body">
          <ul className="cl-steps">
            {ONBOARDING.map((s) => (
              <li key={s.key}>
                <label className={c.checklist[s.key] ? 'cl-step done' : 'cl-step'}>
                  <input type="checkbox" checked={!!c.checklist[s.key]} onChange={(e) => tick(s.key, e.target.checked)} />
                  <span><b>{s.emoji} {s.label}</b><small>{s.hint}</small></span>
                </label>
              </li>
            ))}
          </ul>
          <span className="eyebrow">Notes</span>
          <textarea className="smm-brief" rows={3} placeholder="Tone of voice, what they love, what to avoid, posting days…" defaultValue={c.notes} onBlur={(e) => e.target.value !== c.notes && store.updateClient(c.id, { notes: e.target.value.slice(0, 4000) })} />
          <p className="note">The caption agent reads these notes.</p>
          <span className="eyebrow">Colour</span>
          <div className="cl-colours">
            {CLIENT_COLOURS.map((col) => <button key={col} type="button" aria-label={`Colour ${col}`} aria-pressed={c.color === col} className={c.color === col ? 'on' : ''} style={{ background: col }} onClick={() => store.updateClient(c.id, { color: col })} />)}
          </div>
          <div className="row">
            <button type="button" className="btn small" onClick={onFeed}>See their feed</button>
            <button type="button" className="btn small" onClick={() => { store.updateClient(c.id, { archived: true }); toast({ message: `${c.name} archived`, undo: () => store.updateClient(c.id, { archived: false }) }); }}>Archive</button>
            <button type="button" className="link-btn" onClick={() => { if (confirm(`Delete ${c.name}, their posts and pictures? This can’t be undone.`)) store.deleteClient(c.id); }}>Delete</button>
          </div>
        </div>
      )}
    </li>
  );
}

function Clients({ clients, onFeed }: { clients: Client[]; onFeed: (id: string) => void }) {
  const store = useStore();
  const [adding, setAdding] = useState(clients.length === 0);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [color, setColor] = useState(CLIENT_COLOURS[clients.length % CLIENT_COLOURS.length]);
  const archived = store.clients.filter((c) => c.archived);
  const leads = (store.leads ?? []).filter((l) => !store.clients.some((c) => c.name.toLowerCase() === l.name.toLowerCase()));
  const add = () => {
    if (!name.trim()) return;
    store.addClient({ name: name.trim().slice(0, 80), handle: handle.trim().slice(0, 60), color });
    setName(''); setHandle(''); setAdding(false);
  };
  const sorted = [...clients].sort((a, b) => onboardingProgress(a).done - onboardingProgress(b).done);
  return (
    <>
      {adding ? (
        <section className="card cl-add">
          <h2 className="h2">New client</h2>
          <input className="step-input" placeholder="Business name" list="cl-leads" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <datalist id="cl-leads">{leads.map((l) => <option key={l.id} value={l.name} />)}</datalist>
          <input className="step-input" placeholder="@instagram handle (optional)" value={handle} onChange={(e) => setHandle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <div className="cl-colours">
            {CLIENT_COLOURS.map((col) => <button key={col} type="button" aria-label={`Colour ${col}`} aria-pressed={color === col} className={color === col ? 'on' : ''} style={{ background: col }} onClick={() => setColor(col)} />)}
          </div>
          <div className="row">
            <button type="button" className="btn primary small" onClick={add} disabled={!name.trim()}>Add client</button>
            {clients.length > 0 && <button type="button" className="btn small" onClick={() => setAdding(false)}>Cancel</button>}
          </div>
        </section>
      ) : (
        <button type="button" className="btn cl-new" onClick={() => setAdding(true)}>+ New client</button>
      )}
      <ul className="cl-list">{sorted.map((c) => <ClientCard key={c.id} c={c} onFeed={() => onFeed(c.id)} />)}</ul>
      {archived.length > 0 && (
        <details className="card cl-archived">
          <summary>{archived.length} archived</summary>
          {archived.map((c) => (
            <div key={c.id} className="between"><span>{c.name}</span><button type="button" className="link-btn" onClick={() => store.updateClient(c.id, { archived: false })}>Bring back</button></div>
          ))}
        </details>
      )}
    </>
  );
}

/* ---------- the screen ---------- */

export default function ContentScreen({ tab: rawTab }: { tab?: string }) {
  const store = useStore();
  const toast = useToast();
  const tab: Tab = TABS.some((t) => t.key === rawTab) ? (rawTab as Tab) : 'calendar';
  const clients = store.clients.filter((c) => !c.archived);
  const [pick, setPick] = useState<string>(() => { try { return localStorage.getItem(CLIENT_KEY) ?? 'all'; } catch { return 'all'; } });
  const choose = (id: string) => { setPick(id); try { localStorage.setItem(CLIENT_KEY, id); } catch { /* ignore */ } };
  const selected = clients.find((c) => c.id === pick) ?? null;
  const [editing, setEditing] = useState<Draft | null>(null);
  const [uploading, setUploading] = useState(0);
  const clientFor = (p: ContentPost) => store.clients.find((c) => c.id === p.client_id);
  const live = new Set(clients.map((c) => c.id));
  const posts = store.posts.filter((p) => (selected ? p.client_id === selected.id : !p.client_id || live.has(p.client_id)));

  const blank = (day: Day): Draft => ({ client_id: selected?.id ?? clients[0]?.id ?? null, day, time: null, platform: 'Instagram', kind: 'post', caption: '', status: 'draft', image_path: null });

  /** Several pictures at once: one draft post each. On a day from the calendar, they all go on that day; otherwise on the next free days. */
  const bulk = async (files: FileList, client: Client | null, day?: Day) => {
    const c = client ?? clients[0];
    if (!c) return;
    const list = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, 30);
    setUploading(list.length);
    const taken = new Set(store.posts.filter((p) => p.client_id === c.id && p.kind !== 'story').map((p) => p.day));
    let next = addDays(today(), 1);
    let saved = 0;
    for (const f of list) {
      let d = day;
      if (!d) { while (taken.has(next)) next = addDays(next, 1); d = next; taken.add(next); }
      try {
        await store.addPost({ client_id: c.id, day: d, time: null, platform: 'Instagram', kind: 'post', caption: '', status: 'draft' }, await shrink(f));
        saved++;
      } catch (e) { toast({ message: `Couldn’t upload ${f.name}. ${(e as Error).message}`.slice(0, 140) }); }
      setUploading((n) => n - 1);
    }
    setUploading(0);
    if (saved) toast({ message: `${saved} picture${saved === 1 ? '' : 's'} added for ${c.name} 📷` });
  };

  const onNew = (day: Day, files?: FileList) => {
    if (!clients.length) { toast({ message: 'Add a client first' }); go('/content/clients', true); return; }
    if (!files) { setEditing(blank(day)); return; }
    void bulk(files, selected, day);
  };

  let body: ReactNode;
  if (tab === 'clients') body = <Clients clients={clients} onFeed={(id) => { choose(id); go('/content/feed', true); }} />;
  else if (tab === 'feed') {
    const c = selected ?? clients[0];
    body = c ? <Feed client={c} posts={store.posts} onOpen={(p) => setEditing(p)} onUpload={(f) => void bulk(f, c)} /> : <EmptyClients />;
  } else body = <Calendar posts={posts} clients={clients} clientFor={clientFor} onOpen={(p) => setEditing(p)} onNew={onNew} />;

  return (
    <>
      <main className="page content-page">
        <header className="page-head">
          <h1 className="h1">Content</h1>
          <p className="muted lead">Onboard clients, plan their feed, and keep every post in one calendar.</p>
        </header>

        {store.smmReady === false && (
          <section className="card note-card"><p className="note">This tab needs database update 18 before it can save anything. Ask Claude for the link, or paste <b>supabase/18-smm-email.sql</b> into the Supabase SQL Editor and press Run.</p></section>
        )}

        <div className="segmented area-tabs" role="tablist" aria-label="Content view">
          {TABS.map((t) => <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'seg on' : 'seg'} onClick={() => go(t.key === 'calendar' ? '/content' : `/content/${t.key}`, true)}>{t.label}</button>)}
        </div>

        {tab !== 'clients' && clients.length > 0 && (
          <div className="chip-scroll cp-clients" role="radiogroup" aria-label="Client">
            {tab === 'calendar' && <button type="button" role="radio" aria-checked={!selected} className={!selected ? 'chip on' : 'chip'} onClick={() => choose('all')}>All clients</button>}
            {clients.map((c) => {
              const on = selected ? selected.id === c.id : tab === 'feed' && c.id === clients[0].id;
              return <button key={c.id} type="button" role="radio" aria-checked={on} className={on ? 'chip on' : 'chip'} onClick={() => choose(c.id)}><i className="cp-dot" style={{ background: c.color }} />{c.name}</button>;
            })}
          </div>
        )}

        {uploading > 0 && <p className="note cp-uploading" role="status">Uploading {uploading} picture{uploading === 1 ? '' : 's'}…</p>}
        {body}
      </main>
      {tab !== 'clients' && clients.length > 0 && (
        <button type="button" className="fab" aria-label="Add a post" onClick={() => setEditing(blank(addDays(today(), 1)))}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      )}
      {editing && <PostSheet start={editing} clients={clients} onClose={() => setEditing(null)} />}
      <Nav current="content" />
    </>
  );
}

function EmptyClients() {
  return (
    <section className="empty">
      <p className="empty-title">No clients yet.</p>
      <p className="muted">Add your first client to start their onboarding and plan their feed.</p>
      <button type="button" className="btn primary small" onClick={() => go('/content/clients', true)}>Add a client</button>
    </section>
  );
}

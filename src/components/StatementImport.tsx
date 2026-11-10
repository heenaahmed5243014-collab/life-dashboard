// Upload a statement to fill in your budget: a CSV is read on your phone; screenshots and PDFs are
// read by Claude (sent, not kept). You check the list, then add the payments you want.
import { useRef, useState } from 'react';
import { useStore } from '../store';
import { readPayments } from '../statement';
import { readPaymentsWithClaude } from '../statementAi';
import { guessCategory } from '../budget';
import { shortDate, today } from '../dates';
import { useToast } from '../toast';

interface Row { key: string; date: string; desc: string; amount: number; category: string; on: boolean; dup: boolean }
const money = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const importKey = (date: string, amount: number, desc: string) => `${date}|${amount.toFixed(2)}|${desc.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40)}`;

export default function StatementImport({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const keys = store.budgets.map((b) => b.key);
  const known = new Set(store.spends.map((s) => s.import_key).filter(Boolean));

  const pick = async (list: FileList | null) => {
    const files = list ? [...list] : [];
    if (!files.length) return;
    setBusy(true); setProblem(null);
    try {
      const isCsv = (f: File) => /\.csv$/i.test(f.name) || /csv|comma-separated/.test(f.type);
      let found: { date: string; desc: string; amount: number; category: string }[];
      if (files.every(isCsv)) {
        found = readPayments(await files[0].text()).map((p) => ({ date: p.date, desc: p.desc, amount: p.amount, category: guessCategory(`${p.desc} ${p.bankCategory}`, keys) }));
      } else {
        found = (await readPaymentsWithClaude(files.filter((f) => !isCsv(f)), store.budgets.map((b) => ({ key: b.key, name: b.name })))).map((p) => ({ date: p.date, desc: p.description, amount: p.amount, category: keys.includes(p.category) ? p.category : 'other' }));
      }
      const now = today();
      setRows(found.filter((p) => p.date <= now).map((p) => {
        const key = importKey(p.date, p.amount, p.desc);
        const dup = known.has(key);
        return { key, ...p, on: !dup && p.category !== 'other', dup };
      }).sort((a, b) => b.date.localeCompare(a.date)));
      if (!found.length) setProblem('No payments found in that file.');
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Couldn’t read that file.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const picked = (rows ?? []).filter((r) => r.on && !r.dup);
  const add = () => {
    const added = store.addSpends(picked.map((r) => ({ day: r.date, amount: r.amount, category: r.category, note: r.desc.slice(0, 120), source: 'statement' as const, import_key: r.key })));
    toast({ message: `${added.length} payment${added.length === 1 ? '' : 's'} added to your budget` });
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet import-sheet" role="dialog" aria-modal="true" aria-label="Upload a statement">
        <div className="sheet-head"><h2 className="sheet-title">Upload a statement</h2><button type="button" className="link-btn" onClick={onClose}>Close</button></div>
        <input ref={input} id="bud-file" type="file" multiple accept="image/*,.pdf,application/pdf,.csv,text/csv" className="visually-hidden" onChange={(e) => void pick(e.target.files)} />
        {!rows && !busy && (
          <>
            <p className="note">A screenshot or photo of your banking app’s payments (up to 4), a PDF, or a CSV. You’ll check the list before anything is added, and payments you’ve already added are skipped.</p>
            <label htmlFor="bud-file" className="btn primary bud-upload">Choose statement</label>
            <p className="note">CSV files are read on your phone. Pictures and PDFs are read by Claude and not kept.</p>
          </>
        )}
        {busy && <p className="note" role="status">Reading your payments…</p>}
        {problem && <p className="note warn-text">{problem}</p>}
        {rows && (
          <>
            <p className="note">{rows.length} payments found. Untick any you don’t want, and change categories if needed.</p>
            <ul className="import-list">
              {rows.map((r, i) => (
                <li key={r.key + i} className={r.dup ? 'dup' : ''}>
                  <input type="checkbox" aria-label={`Add ${r.desc}`} checked={r.on && !r.dup} disabled={r.dup} onChange={() => setRows(rows.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} />
                  <span className="imp-main"><b>{r.desc}</b><small>{shortDate(r.date)}{r.dup ? ' · already added' : ''}</small></span>
                  <select className="select small-select" aria-label={`Category for ${r.desc}`} value={r.category} disabled={r.dup} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, category: e.target.value, on: e.target.value !== 'other' || x.on } : x)))}>
                    {store.budgets.map((b) => <option key={b.key} value={b.key}>{b.emoji} {b.name}</option>)}
                    <option value="other">Other</option>
                  </select>
                  <span className="spend-amt">{money(r.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="row">
              <button type="button" className="btn primary" disabled={!picked.length} onClick={add}>Add {picked.length} payment{picked.length === 1 ? '' : 's'}</button>
              <label htmlFor="bud-file" className="btn small">Another file</label>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

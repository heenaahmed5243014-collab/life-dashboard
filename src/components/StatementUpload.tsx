// "Upload a statement": a CSV is read on the phone; photos, screenshots and PDFs are read by
// Claude (sent, not stored). Shows a summary and saves only the closing balance to the account you pick.
import { useRef, useState } from 'react';
import { useStore } from '../store';
import { readStatement, type StatementSummary } from '../statement';
import { readStatementWithClaude } from '../statementAi';
import { shortDate, today } from '../dates';
import { useToast } from '../toast';
import type { Account } from '../types';

const money = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthOf = (d: string) => `${d.slice(0, 7)}-01`;

/** Best guess at which account a statement belongs to. */
function guessAccount(accounts: Account[], fileName: string): Account | undefined {
  const n = fileName.toLowerCase();
  return accounts.find((a) => a.name.toLowerCase().split(/\s+/).some((w) => w.length > 3 && n.includes(w)))
    ?? accounts.find((a) => /current/i.test(a.name))
    ?? accounts.find((a) => !a.is_debt);
}

export default function StatementUpload({ accounts }: { accounts: Account[] }) {
  const store = useStore();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [s, setS] = useState<StatementSummary | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [account, setAccount] = useState('');
  const [closing, setClosing] = useState('');
  const [busy, setBusy] = useState(false);
  const [viaClaude, setViaClaude] = useState(false);

  const pick = async (list: FileList | null) => {
    setProblem(null);
    const files = list ? [...list] : [];
    if (!files.length) return;
    const isCsv = (f: File) => /\.csv$/i.test(f.name) || /csv|comma-separated/.test(f.type);
    setBusy(true);
    try {
      let sum: StatementSummary;
      let named: string | null = null;
      if (files.every(isCsv)) {
        sum = readStatement(await files[0].text());
        setViaClaude(false);
      } else {
        const ai = await readStatementWithClaude(files.filter((f) => !isCsv(f)), accounts.map((a) => a.name));
        sum = ai;
        named = ai.account;
        setViaClaude(true);
      }
      setS(sum);
      const a = (named && accounts.find((x) => x.name === named)) || guessAccount(accounts, files[0].name);
      setAccount(a?.id ?? accounts[0]?.id ?? '');
      setClosing(sum.closing !== null ? String(Math.abs(sum.closing)) : '');
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Couldn’t read that file.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const save = () => {
    if (!s) return;
    const a = accounts.find((x) => x.id === account);
    const amount = Math.abs(Number(closing.replace(/[£,\s]/g, '')));
    if (!a || !closing.trim() || !Number.isFinite(amount)) {
      toast({ message: 'Pick the account and check the closing balance' });
      return;
    }
    const day = s.to > today() ? today() : s.to;
    store.setBalance({ account_id: a.id, month: monthOf(day), amount: Math.round(amount * 100) / 100, recorded_on: day });
    toast({ message: `${a.name} updated to ${money(amount)} (${shortDate(day)})` });
    setS(null);
  };

  return (
    <div className="stmt">
      <input ref={input} type="file" accept="image/*,.pdf,application/pdf,.csv,text/csv,text/comma-separated-values,application/vnd.ms-excel" multiple className="visually-hidden" id="stmt-file" onChange={(e) => void pick(e.target.files)} />
      {busy && <p className="note" role="status">Reading your statement…</p>}
      {!s && !busy && (
        <label htmlFor="stmt-file" className="btn small stmt-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M12 18v-6M9 15l3-3 3 3" /></svg>
          Upload a statement
        </label>
      )}
      {!s && !busy && <p className="note stmt-hint">A screenshot or photo of your banking app, a PDF, or a CSV. Up to 4 pictures at once.</p>}
      {problem && <p className="note warn-text">{problem}</p>}
      {s && (
        <div className="stmt-card stack">
          <div className="between"><span className="eyebrow">Statement {shortDate(s.from)} – {shortDate(s.to)}</span><span className="count">{s.count} payments</span></div>
          <div className="stmt-flow">
            <span><span className="note">Money in</span><b className="t-in">{money(s.moneyIn)}</b></span>
            <span><span className="note">Money out</span><b>{money(s.moneyOut)}</b></span>
          </div>
          {s.top.length > 0 && (
            <div>
              <span className="note">Biggest spending{s.topBy === 'category' ? ' by category' : ''}</span>
              <ul className="stmt-top">{s.top.map((t) => <li key={t.name}><span>{t.name === t.name.toUpperCase() ? t.name.toLowerCase() : t.name}</span><span>{money(t.amount)}</span></li>)}</ul>
            </div>
          )}
          <label className="money-row">
            <span className="money-name">Which account?</span>
            <select className="select small-select" aria-label="Account" value={account} onChange={(e) => setAccount(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="money-row">
            <span className="money-name">Closing balance</span>
            <span className="money-input"><span aria-hidden="true">£</span><input inputMode="decimal" aria-label="Closing balance" value={closing} placeholder="0.00" onChange={(e) => setClosing(e.target.value)} /></span>
          </label>
          {s.closing === null && <p className="note">{viaClaude ? 'No balance was visible, so type it from your banking app.' : 'This file doesn’t include balances, so type the closing balance from your banking app.'}</p>}
          <p className="note">{viaClaude ? 'Read by Claude: double-check the balance before saving. Only the closing balance is saved; the picture isn’t kept.' : 'Only the closing balance is saved. The payments stay on your phone.'}</p>
          <div className="row">
            <button type="button" className="btn primary small" onClick={save}>Save balance</button>
            <button type="button" className="btn small" onClick={() => setS(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

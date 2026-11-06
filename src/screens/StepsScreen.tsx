// How to send steps from Apple Health with an iPhone Shortcut. No passwords: a private
// link code that can only save step counts.
import { useEffect, useState } from 'react';
import { useStore } from '../store';
import Header from '../components/Header';
import { useToast } from '../toast';

const SB_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'https://your-project.supabase.co';
const SB_KEY = (import.meta.env.VITE_SUPABASE_KEY as string | undefined) ?? 'your-publishable-key';

function Copy({ label, value }: { label: string; value: string }) {
  const toast = useToast();
  return (
    <div className="copy-row">
      <span className="eyebrow">{label}</span>
      <code className="copy-value">{value}</code>
      <button
        type="button"
        className="btn small"
        onClick={() => navigator.clipboard?.writeText(value).then(() => toast({ message: `${label} copied` }), () => toast({ message: 'Couldn’t copy. Press and hold the text instead.' }))}
      >
        Copy
      </button>
    </div>
  );
}

export default function StepsScreen() {
  const store = useStore();
  const toast = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const last = [...store.steps].reverse().find((s) => s.source === 'apple health');

  useEffect(() => {
    store.stepLink(false).then(setCode, (e: Error) => setProblem(/does not exist|schema|function/i.test(e.message) ? 'Your database needs update 9 first.' : 'Couldn’t load your link code. Check your connection.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renew = () => {
    if (!confirm('Make a new link code? The old one stops working, so you’ll need to paste the new one into your Shortcut.')) return;
    store.stepLink(true).then((c) => { setCode(c); toast({ message: 'New link code made' }); }, () => toast({ message: 'Couldn’t make a new code. Try again online.' }));
  };

  return (
    <>
      <Header title="Steps from Apple Health" />
      <main className="page page-form steps-setup">
        <p className="sub">
          An iPhone Shortcut reads today’s steps from Health and sends the number here every evening. It ticks your 10k chunks too.
          {last ? ` Last received: ${last.count.toLocaleString('en-GB')} steps on ${last.day}.` : ''}
        </p>
        {problem && <p className="note warn-text">{problem}</p>}

        <section className="card stack">
          <span className="eyebrow">You’ll paste these 3 things</span>
          <Copy label="Web address" value={`${SB_URL}/rest/v1/rpc/log_steps`} />
          <Copy label="Key" value={SB_KEY} />
          {code ? <Copy label="Your link code" value={code} /> : !problem && <p className="note">Loading your link code…</p>}
          <p className="note">The link code can only save step counts. Keep it to yourself anyway. If you ever share it by mistake, make a new one below.</p>
        </section>

        <section className="card stack">
          <span className="eyebrow">Set up the Shortcut (about 5 minutes, once)</span>
          <ol className="steps-list">
            <li>Open the <b>Shortcuts</b> app → <b>Automation</b> tab → <b>+</b> → <b>Time of Day</b>. Pick <b>10:30 pm</b>, <b>Daily</b>, and choose <b>Run Immediately</b>. Tap <b>Next</b> → <b>New Blank Automation</b>.</li>
            <li>Add the action <b>Find Health Samples</b>. Set Type to <b>Steps</b>, tap <b>Add Filter</b> so it says <b>Start Date is Today</b>, then under <b>Group By</b> choose <b>Day</b>.</li>
            <li>Add <b>Get Details of Health Sample</b> and choose <b>Value</b>.</li>
            <li>Add <b>Get Contents of URL</b>. Paste the <b>web address</b>. Tap the arrow to show more:
              <ul>
                <li>Method: <b>POST</b></li>
                <li>Headers: add <b>apikey</b> = paste the <b>key</b>, and <b>Content-Type</b> = <b>application/json</b></li>
                <li>Request Body: <b>JSON</b>. Add a <b>Text</b> field called <b>p_token</b> = paste <b>your link code</b>. Add a <b>Number</b> field called <b>p_steps</b> and pick <b>Value</b> from the suggestions above the keyboard.</li>
              </ul>
            </li>
            <li>Tap <b>Done</b>. To test it now, open the automation and tap the play button, then come back here and pull the page down. Today’s steps should appear on the Today screen.</li>
          </ol>
          <p className="note">The first time it runs, your iPhone asks to allow access to Health steps. Tap <b>Allow</b>. You can also add a second automation at lunchtime if you like seeing progress during the day.</p>
        </section>

        <button type="button" className="link-btn quiet" onClick={renew}>Make a new link code</button>
      </main>
    </>
  );
}

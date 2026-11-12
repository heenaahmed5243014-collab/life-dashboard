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
          An iPhone Shortcut reads today’s steps from Health and sends them here in the morning, afternoon and at night, so your steps dial fills up through the day. It ticks your 10k chunks too.
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
          <span className="eyebrow">Part 1 · Make the “Send steps” shortcut (about 5 minutes, once)</span>
          <ol className="steps-list">
            <li>Open the <b>Shortcuts</b> app → <b>Shortcuts</b> tab → <b>+</b>. Tap the name at the top and call it <b>Send steps</b>.</li>
            <li>Add the action <b>Find Health Samples</b>. Set Type to <b>Steps</b>, tap <b>Add Filter</b> so it says <b>Start Date is Today</b>, then under <b>Group By</b> choose <b>Day</b>.</li>
            <li>Add <b>Get Details of Health Sample</b> and choose <b>Value</b>.</li>
            <li>Add <b>Get Contents of URL</b>. Paste the <b>web address</b>. Tap the arrow to show more:
              <ul>
                <li>Method: <b>POST</b></li>
                <li>Headers: add <b>apikey</b> = paste the <b>key</b>, and <b>Content-Type</b> = <b>application/json</b></li>
                <li>Request Body: <b>JSON</b>. Add a <b>Text</b> field called <b>p_token</b> = paste <b>your link code</b>. Add a <b>Number</b> field called <b>p_steps</b> and pick <b>Value</b> from the suggestions above the keyboard.</li>
              </ul>
            </li>
            <li>Tap <b>Done</b>, then tap the shortcut once to test it. Come back here and pull the page down: today’s steps should appear on the dial.</li>
          </ol>
          <span className="eyebrow">Part 2 · Run it three times a day (1 minute each)</span>
          <ol className="steps-list">
            <li>Go to the <b>Automation</b> tab → <b>+</b> → <b>Time of Day</b>. Pick <b>11:45 am</b>, <b>Daily</b>, and <b>Run Immediately</b>. Tap <b>Next</b>.</li>
            <li>Choose <b>Send steps</b> from the list (or add the action <b>Run Shortcut</b> and pick <b>Send steps</b>). Tap <b>Done</b>.</li>
            <li>Do the same twice more for <b>4:45 pm</b> and <b>10:30 pm</b>. Each one only has that single step, so it’s quick.</li>
          </ol>
          <p className="note">Each run is saved as your morning, afternoon or night reading. Want it more often? Add more times; the latest one in each part of the day is kept. Already made the old version inside an automation? Keep it, make the <b>Send steps</b> shortcut, and use it for the other times.</p>
          <p className="note">The first time it runs, your iPhone asks to allow access to Health steps. Tap <b>Allow</b>.</p>
        </section>

        <button type="button" className="link-btn quiet" onClick={renew}>Make a new link code</button>
      </main>
    </>
  );
}

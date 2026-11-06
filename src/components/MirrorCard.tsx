// Mirror work: 2 minutes with an affirmation, on days the Mirror work routine is on.
import { useState } from 'react';
import { daysBetween } from '../dates';

const AFFIRM = [
  'I am allowed to take up space.',
  'I don’t have to do everything today. I just have to do the next thing.',
  'My brain works differently, and that is a strength.',
  'I am proud of how far I’ve come.',
  'I can be myself and still be loved.',
  'Rest is productive too.',
  'I keep promises to myself.',
  'I am becoming the person I want to be, one day at a time.',
  'I am safe to open up to good people.',
  'I am capable, creative and worth investing in.',
];

export default function MirrorCard({ day }: { day: string }) {
  const [extra, setExtra] = useState(0);
  const base = Math.abs(daysBetween('2026-01-01', day));
  return (
    <div className="card violet-card">
      <span className="eyebrow">Mirror work · 2 minutes</span>
      <blockquote className="affirm">{AFFIRM[(base + extra) % AFFIRM.length]}</blockquote>
      <p className="note">Look yourself in the eye and say it out loud three times.</p>
      <div className="row"><button type="button" className="btn small ghost" onClick={() => setExtra((n) => n + 1)}>Another one</button></div>
    </div>
  );
}

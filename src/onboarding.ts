// The steps for bringing on a new social media client, in order.
import type { Client } from './types';

export const ONBOARDING: { key: string; emoji: string; label: string; hint: string }[] = [
  { key: 'call', emoji: '📞', label: 'Discovery call', hint: 'Goals, audience, what they post now, budget' },
  { key: 'proposal', emoji: '📝', label: 'Proposal sent', hint: 'Package, price, number of posts a month' },
  { key: 'contract', emoji: '✍️', label: 'Contract signed', hint: 'Scope, approval rules, notice period' },
  { key: 'deposit', emoji: '💷', label: 'Deposit paid', hint: 'First month or 50% before any work' },
  { key: 'questionnaire', emoji: '📋', label: 'Brand questionnaire', hint: 'Tone of voice, words to avoid, competitors' },
  { key: 'logins', emoji: '🔑', label: 'Account access', hint: 'Meta Business Suite / TikTok access, not passwords' },
  { key: 'assets', emoji: '🎨', label: 'Brand assets', hint: 'Logo, fonts, colours, existing photos' },
  { key: 'pillars', emoji: '🧱', label: 'Content pillars', hint: '3 to 5 themes every post fits into' },
  { key: 'shoot', emoji: '📸', label: 'Kick-off shoot', hint: 'First batch of photos and reels' },
  { key: 'approved', emoji: '✅', label: 'First month approved', hint: 'Client signs off the calendar' },
];

export function onboardingProgress(c: Client) {
  const done = ONBOARDING.filter((s) => c.checklist[s.key]).length;
  const next = ONBOARDING.find((s) => !c.checklist[s.key]) ?? null;
  return { done, total: ONBOARDING.length, next };
}

export const CLIENT_COLOURS = ['#FF4F8B', '#FF8A3D', '#3FA34D', '#4F7CFF', '#9B5CFF', '#1C1C1C'];

/** Shrink a picture to at most `max` px on the long side, as a JPEG. */
export async function shrink(file: Blob, max = 1600): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; // see-through pictures get a white background, not black
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error('Could not read that picture'))), 'image/jpeg', 0.86));
}

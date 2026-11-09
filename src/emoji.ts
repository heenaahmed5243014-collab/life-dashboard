// A fun emoji for each task, so lists are easier to scan. Picked from the task's words,
// then its group or area. A chosen emoji (task.icon) always wins.
import type { Task } from './types';

const RULES: [RegExp, string][] = [
  [/\b(return|refund|exchange|send back|parcel|post office|inpost|label)\b/i, '📦'],
  [/\b(photo|photos|shoot|camera|gallery|cull|edit(ing)? .*photo|wedding)\b/i, '📸'],
  [/\b(video|reel|tiktok|film|vlog)\b/i, '🎬'],
  [/\b(post|instagram|social|caption|content|canva)\b/i, '📱'],
  [/\b(website|portfolio|domain|site)\b/i, '🌐'],
  [/\b(invoice|pay|bill|rent|bank|money|tax|refund|budget|isa|savings?)\b/i, '💷'],
  [/\b(interview|practice|prep)\b/i, '🎤'],
  [/\b(apply|application|cv|cover letter|job|recruiter|linkedin|role)\b/i, '🎯'],
  [/\b(email|reply|inbox|message|text|whatsapp|dm)\b/i, '✉️'],
  [/\b(call|ring|phone|zoom|meeting|catch ?up)\b/i, '📞'],
  [/\b(gym|workout|weights|legs|arms|cardio|pilates|barre|yoga|run|running)\b/i, '🏋️'],
  [/\b(swim|swimming|pool)\b/i, '🏊'],
  [/\b(walk|steps|walking pad)\b/i, '🚶'],
  [/\b(doctor|gp|dentist|hospital|appointment|laser|prescription|pharmacy)\b/i, '🩺'],
  [/\b(clean|tidy|laundry|wash|hoover|declutter|bins?)\b/i, '🧽'],
  [/\b(shop|shopping|buy|order|basket|groceries|tesco|amazon)\b/i, '🛍️'],
  [/\b(cook|dinner|lunch|meal|recipe|bake)\b/i, '🍳'],
  [/\b(water|drink)\b/i, '💧'],
  [/\b(book|read|reading|library)\b/i, '📚'],
  [/\b(study|learn|course|exam|theory test|revise|revision)\b/i, '🧠'],
  [/\b(car|drive|driving|mot|petrol|oyster|train|travel|flight|holiday|trip)\b/i, '🚗'],
  [/\b(birthday|gift|present|party|celebrate)\b/i, '🎁'],
  [/\b(plan|planner|organise|organize|schedule|set up)\b/i, '🗓️'],
  [/\b(write|blog|notes?|journal)\b/i, '✍️'],
  [/\b(fun night|cinema|film night|date|friends?|family|mum|dad|sister|brother)\b/i, '💗'],
  [/\b(hair|nails|lashes|brows|skin|spa|beauty)\b/i, '💅'],
  [/\b(watch|earrings|hoops|jewellery|clothes|outfit|dress|trainers|shoes)\b/i, '👗'],
  [/\b(sleep|rest|nap|bed)\b/i, '😴'],
  [/\b(mirror|affirmation|meditat|breathe|therapy)\b/i, '🪞'],
  [/\b(form|forms|paperwork|admin|document|passport|visa|council)\b/i, '📋'],
  [/\b(fix|repair|install|build)\b/i, '🔧'],
  [/\b(event|photo booth|popcorn|mocktail|candy)\b/i, '🎉'],
];
const AREA: Record<string, string> = {
  Work: '💼', 'Job search': '🎯', 'Made in Heaven Visuals': '📸', 'Side ideas': '💡', 'Personal & home': '🏡', Inbox: '📥',
};
const KIND: Record<string, string> = { idea: '💡', goal: '🌟', project: '🗂️', note: '📝' };

export const EMOJI_CHOICES = ['✅', '📦', '📸', '🎬', '📱', '🌐', '💷', '🎯', '🎤', '✉️', '📞', '🏋️', '🏊', '🚶', '🩺', '🧽', '🛍️', '🍳', '💧', '📚', '🧠', '🚗', '🎁', '🗓️', '✍️', '💗', '💅', '👗', '😴', '🪞', '📋', '🔧', '🎉', '💼', '💡', '🌟', '🏡', '🔥', '⭐', '🌸'];

export function guessEmoji(title: string, areaName?: string, kind?: string): string {
  if (kind && KIND[kind] && kind !== 'project') return KIND[kind];
  for (const [re, e] of RULES) if (re.test(title)) return e;
  if (kind === 'project') return KIND.project;
  return (areaName && AREA[areaName]) || '✨';
}

export function taskEmoji(t: Task, areaName?: string): string {
  return t.icon || guessEmoji(t.title, areaName, t.kind);
}

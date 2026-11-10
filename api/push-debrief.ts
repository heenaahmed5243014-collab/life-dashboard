// POST /api/push-debrief
// Called every 15 minutes by the database's timer (with its private password). Sends any morning
// debriefs that are due. Nothing is stored here.
import { json, rpc, sendAll, type PushRow } from './_push.js';

export async function POST(req: Request): Promise<Response> {
  const secret = req.headers.get('x-cron-secret');
  if (!secret) return json(401, { error: 'not_allowed' });
  let rows: PushRow[];
  try {
    rows = await rpc<PushRow[]>('debrief_due', { p_secret: secret });
  } catch (e) {
    return json(/Not allowed/.test((e as Error).message) ? 401 : 502, { error: 'database', detail: (e as Error).message.slice(0, 160) });
  }
  const result = await sendAll(rows);
  for (const endpoint of result.expired) await rpc('drop_push_endpoint', { p_secret: secret, p_endpoint: endpoint }).catch(() => {});
  return json(200, { due: rows.length, ...result });
}

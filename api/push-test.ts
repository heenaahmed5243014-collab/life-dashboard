// POST /api/push-test
// "Send a test" from the app: sends today's debrief to the signed-in person's own devices.
import { json, rpc, sendAll, type PushRow } from './_push.js';

export async function POST(req: Request): Promise<Response> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'not_signed_in' });
  let rows: PushRow[];
  try {
    rows = await rpc<PushRow[]>('debrief_test', {}, token);
  } catch (e) {
    const msg = (e as Error).message;
    return json(/does not exist|404/.test(msg) ? 503 : /Not signed in|401|JWT/.test(msg) ? 401 : 502, { error: 'database', detail: msg.slice(0, 160) });
  }
  if (!rows.length) return json(404, { error: 'no_devices' });
  const result = await sendAll(rows);
  return json(200, result);
}

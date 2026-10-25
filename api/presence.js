// Online count: each open page sends a heartbeat every ~25s; "online" = heartbeats in the last 45s.
import { pipeline, K } from '../lib/redis.js';
import { handler, send, readSession, authorOf } from '../lib/util.js';

export default handler(async (req, res, body) => {
  const sid = readSession(body);
  const tab = String(body.tab || '').slice(0, 12).replace(/[^a-z0-9]/gi, '');
  const member = authorOf(sid) + (tab ? ':' + tab : '');
  const now = Date.now();
  if (body.leave) {
    await pipeline([['ZREM', K.online, member]]);
    return send(res, 200, { ok: true });
  }
  const r = await pipeline([
    ['ZADD', K.online, String(now), member],
    ['ZREMRANGEBYSCORE', K.online, '-inf', String(now - 120000)],
    ['ZCOUNT', K.online, String(now - 45000), '+inf']
  ]);
  send(res, 200, { online: Number(r[2] || 0) });
});

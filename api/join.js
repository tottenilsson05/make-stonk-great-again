// Join the movement. One signature per browser session (server-enforced) and at most
// 3 new signatures per network per day. This limits casual duplicates; it does not
// prove that every signature is a unique person.
import { pipeline, K } from '../lib/redis.js';
import { handler, send, readSession, authorOf, ipHashOf, clientIp, newId, rateLimit, httpError, parse, publicSupporter } from '../lib/util.js';

const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

export default handler(async (req, res, body) => {
  if (req.method === 'GET') {
    const sid = String(req.query?.sid || '');
    readSession({ sid });
    const [raw] = await pipeline([['HGET', K.supMsg, authorOf(sid)]]);
    const rec = parse(raw);
    return send(res, 200, { mine: rec ? publicSupporter(rec) : null });
  }
  const sid = readSession(body);
  const au = authorOf(sid), ip = ipHashOf(clientIp(req));
  const [raw] = await pipeline([['HGET', K.supMsg, au]]);
  const existing = parse(raw);

  if (body.action === 'remove') {
    if (!existing) return send(res, 200, { mine: null });
    const r = await pipeline([['HDEL', K.supMsg, au], ['ZREM', K.supIdx, au], ['INCR', K.v], ['ZCARD', K.supIdx]]);
    return send(res, 200, { mine: null, v: r[2], count: r[3] });
  }

  let handle = String(body.handle || '').trim().replace(/^@/, '');
  const anon = !!body.anon || !handle;
  if (anon) handle = '';
  else if (!HANDLE_RE.test(handle)) throw httpError(400, 'X usernames use letters, numbers and underscores, up to 15 characters.');

  await rateLimit([{ key: K.rl('join', 'a', au), windowMs: 10000, max: 3, message: 'One moment, then try again.' }]);
  if (!existing) {
    const [banned] = await pipeline([['SISMEMBER', K.bans, ip]]);
    if (banned) throw httpError(403, 'Signing is blocked from your network.');
    await rateLimit([{ key: K.rl('join', 'ip', ip), windowMs: 86400000, max: 3, message: 'Your network has already added several signatures today.' }]);
  }
  const rec = existing ? { ...existing, handle, anon } : { id: newId(), t: Date.now(), handle, anon, ip };
  const cmds = [['HSET', K.supMsg, au, JSON.stringify(rec)]];
  if (!existing) cmds.push(['ZADD', K.supIdx, 'NX', String(rec.t), au]);
  cmds.push(['INCR', K.v], ['ZCARD', K.supIdx]);
  const r = await pipeline(cmds);
  send(res, existing ? 200 : 201, { mine: publicSupporter(rec), created: !existing, v: r[r.length - 2], count: r[r.length - 1] });
}, ['GET', 'POST']);

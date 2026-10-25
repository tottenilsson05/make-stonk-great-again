// Community reports: each session can report a post once; 3 reports hide it automatically.
import { pipeline, K } from '../lib/redis.js';
import { handler, send, readSession, authorOf, rateLimit, httpError } from '../lib/util.js';
import { getPost, savePost } from '../lib/posts.js';

const HIDE_AT = 3;

export default handler(async (req, res, body) => {
  const sid = readSession(body);
  const type = body.type === 'wall' ? 'wall' : body.type === 'chat' ? 'chat' : null;
  if (!type) throw httpError(400, 'Unknown message type.');
  const au = authorOf(sid);
  await rateLimit([{ key: K.rl('report', au), windowMs: 3600000, max: 30, message: 'You have sent a lot of reports. Try again later.' }]);
  const rec = await getPost(type, body.id);
  if (rec.au === au) throw httpError(400, 'You cannot report your own message.');
  const [added] = await pipeline([['SADD', K.reports(type, rec.id), au], ['EXPIRE', K.reports(type, rec.id), '2592000']]);
  if (!added) return send(res, 200, { ok: true, already: true });
  rec.r = (rec.r || 0) + 1;
  if (rec.r >= HIDE_AT) rec.h = 1;
  const v = await savePost(type, rec);
  send(res, 200, { ok: true, hidden: !!rec.h, v });
});

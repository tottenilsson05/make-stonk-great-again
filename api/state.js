// Full shared snapshot: latest chat, guestbook and supporters plus counters.
// Requested as /api/state?v=<version>; each version is cached at the edge so
// thousands of visitors cost one database read per change.
import { pipeline, K, redisConfigured } from '../lib/redis.js';
import { handler, send, parse, publicPost, publicSupporter } from '../lib/util.js';

export default handler(async (req, res) => {
  if (!redisConfigured()) return send(res, 503, { error: 'Database is not connected yet.' }, 'no-store');
  const now = Date.now();
  const [v, chatIds, wallIds, supAuthors, supCount, chatTotal, wallTotal, online] = await pipeline([
    ['GET', K.v],
    ['ZRANGE', K.chatIdx, '0', '79', 'REV'],
    ['ZRANGE', K.wallIdx, '0', '19', 'REV'],
    ['ZRANGE', K.supIdx, '0', '11', 'REV'],
    ['ZCARD', K.supIdx],
    ['GET', K.chatTotal],
    ['GET', K.wallTotal],
    ['ZCOUNT', K.online, String(now - 45000), '+inf']
  ]);
  const cmds = [];
  if (chatIds.length) cmds.push(['HMGET', K.chatMsg, ...chatIds]);
  if (wallIds.length) cmds.push(['HMGET', K.wallMsg, ...wallIds]);
  if (supAuthors.length) cmds.push(['HMGET', K.supMsg, ...supAuthors]);
  const out = cmds.length ? await pipeline(cmds) : [];
  let i = 0;
  const chat = chatIds.length ? out[i++].map(parse).filter(Boolean).map(publicPost) : [];
  const wall = wallIds.length ? out[i++].map(parse).filter(Boolean).map(publicPost) : [];
  const sups = supAuthors.length ? out[i++].map(parse).filter(Boolean).map(publicSupporter) : [];
  const versioned = /^\d+$/.test(String(req.query?.v || ''));
  send(res, 200, {
    v: Number(v || 0), now, online: Number(online || 0),
    counts: { supporters: Number(supCount || 0), messages: Number(chatTotal || 0), wall: Number(wallTotal || 0) },
    chat, wall, supporters: sups
  }, versioned ? 'public, max-age=0, s-maxage=300' : 'public, max-age=0, s-maxage=1, stale-while-revalidate=2');
}, ['GET']);

// Shared logic for the live chat and the guestbook wall.
import { pipeline, K } from './redis.js';
import { authorOf, ipHashOf, clientIp, newId, cleanText, cleanNick, spamReason, rateLimit, assertNotBanned, httpError, sha, parse, publicPost } from './util.js';

export const KINDS = {
  chat: {
    msg: K.chatMsg, idx: K.chatIdx, total: K.chatTotal, min: 1, max: 240, keep: 1500, prune: 300,
    limits: (au, ip) => [
      { key: K.rl('chat', 'a', au), windowMs: 2500, max: 1, message: 'Slow down a little. One message every few seconds.' },
      { key: K.rl('chat', 'a30', au), windowMs: 30000, max: 6, message: 'That is a lot of messages. Take a 30 second breather.' },
      { key: K.rl('chat', 'ip', ip), windowMs: 60000, max: 20, message: 'Too many messages from your network. Try again in a minute.' }
    ]
  },
  wall: {
    msg: K.wallMsg, idx: K.wallIdx, total: K.wallTotal, min: 4, max: 280, keep: 5000, prune: 500,
    limits: (au, ip) => [
      { key: K.rl('wall', 'a', au), windowMs: 45000, max: 1, message: 'You can sign the guestbook once every 45 seconds.' },
      { key: K.rl('wall', 'ip', ip), windowMs: 86400000, max: 8, message: 'Your network has signed the guestbook a lot today. Try again tomorrow.' }
    ]
  }
};

export async function createPost(kind, req, body) {
  const cfg = KINDS[kind];
  const sid = String(body.sid || '');
  const au = authorOf(sid), ip = ipHashOf(clientIp(req));
  const anon = !!body.anon;
  const nick = cleanNick(body.nick, anon);
  const text = cleanText(body.text, cfg.max);
  if (text.length < cfg.min) throw httpError(400, kind === 'wall' ? 'Write at least a few words.' : 'Type a message first.');
  const spam = spamReason(text);
  if (spam) throw httpError(400, spam);
  await assertNotBanned(au, ip);
  await rateLimit(cfg.limits(au, ip));
  const dupKey = K.rl(kind, 'dup', au);
  const textHash = sha(text.toLowerCase()).slice(0, 16);
  const [prev] = await pipeline([['GET', dupKey]]);
  if (prev === textHash) throw httpError(409, 'You just sent that.');

  const t = Date.now(), id = newId();
  const [n] = await pipeline([['INCR', cfg.total]]);
  const rec = { id, t, nick, anon, body: text, r: 0, h: 0, n, au, ip };
  const res = await pipeline([
    ['HSET', cfg.msg, id, JSON.stringify(rec)],
    ['ZADD', cfg.idx, String(t), id],
    ['SET', dupKey, textHash, 'EX', '90'],
    ['HSET', K.authorIp, au, ip],
    ['INCR', K.v],
    ['ZCARD', cfg.idx]
  ]);
  const v = res[4], count = res[5];
  if (count > cfg.keep) await prune(cfg);
  return { post: publicPost(rec), v };
}

async function prune(cfg) {
  const [ids] = await pipeline([['ZRANGE', cfg.idx, '0', String(cfg.prune - 1)]]);
  if (!ids?.length) return;
  await pipeline([['ZREM', cfg.idx, ...ids], ['HDEL', cfg.msg, ...ids]]);
}

export async function getPost(kind, id) {
  if (!/^[a-f0-9]{16}$/.test(String(id || ''))) throw httpError(400, 'Unknown message.');
  const [raw] = await pipeline([['HGET', KINDS[kind].msg, id]]);
  const rec = parse(raw);
  if (!rec) throw httpError(404, 'That message no longer exists.');
  return rec;
}

export async function savePost(kind, rec) {
  const res = await pipeline([['HSET', KINDS[kind].msg, rec.id, JSON.stringify(rec)], ['INCR', K.v]]);
  return res[1];
}

export async function deletePost(kind, id) {
  const cfg = KINDS[kind];
  const res = await pipeline([['ZREM', cfg.idx, id], ['HDEL', cfg.msg, id], ['INCR', K.v]]);
  return res[2];
}

export async function deleteOwn(kind, body) {
  const rec = await getPost(kind, body.id);
  if (rec.au !== authorOf(String(body.sid || ''))) throw httpError(403, 'You can only delete your own messages.');
  return { v: await deletePost(kind, rec.id) };
}

export async function listPosts(kind, { before, limit }) {
  const cfg = KINDS[kind];
  const max = before ? `(${Number(before)}` : '+inf';
  const [ids] = await pipeline([['ZRANGE', cfg.idx, max, '-inf', 'BYSCORE', 'REV', 'LIMIT', '0', String(limit)]]);
  if (!ids?.length) return [];
  const [raws] = await pipeline([['HMGET', cfg.msg, ...ids]]);
  return raws.map(parse).filter(Boolean).map(publicPost);
}

import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { pipeline, K } from './redis.js';

const SALT = process.env.MSGA_SALT || 'msga-dev-salt';

export const sha = s => createHash('sha256').update(s).digest('hex');

// Public, non-reversible id for a browser session. The raw session id never leaves the server.
export const authorOf = sid => sha(`${SALT}|a|${sid}`).slice(0, 12);
export const ipHashOf = ip => sha(`${SALT}|ip|${ip}`).slice(0, 16);

export function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || String(req.headers['x-real-ip'] || '') || 'unknown';
}

export const newId = () => randomUUID().replace(/-/g, '').slice(0, 16);

const SID_RE = /^[a-f0-9-]{20,64}$/i;
export function readSession(body) {
  const sid = String(body?.sid || '');
  if (!SID_RE.test(sid)) throw httpError(400, 'Missing session. Reload the page and try again.');
  return sid;
}

export function httpError(status, message, extra) {
  return Object.assign(new Error(message), { status, extra });
}

// Strip control / invisible characters and collapse whitespace.
export function cleanText(s, max) {
  return String(s ?? '')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F​-‏‪-‮⁠-⁤﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const LINK_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|xyz|fun|io|net|org|gg|lol|app|co|me|ly|sh|so|to|ai|world|site|link|click|online|top)\b|t\.me\/|discord\.gg|bit\.ly)/i;
export function spamReason(text) {
  if (LINK_RE.test(text)) return 'Links are switched off to keep scam links out.';
  if (/(.)\1{11,}/u.test(text)) return 'Too many repeated characters.';
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length > 30 && letters === letters.toUpperCase()) return 'Please don’t shout in all caps.';
  if (/\b(seed phrase|private key|send (me )?\d+ ?sol|airdrop claim|double your)\b/i.test(text)) return 'That looks like a scam message.';
  return null;
}

export function cleanNick(nick, anon) {
  if (anon) return 'Anonymous';
  const n = String(nick || '').replace(/[^\w .\-]/g, '').trim().slice(0, 20);
  if (n.length < 2) throw httpError(400, 'Pick a nickname (2 to 20 letters) or post anonymously.');
  return n;
}

// Rate limit helpers built on SET NX PX and INCR+EXPIRE, all in one pipeline.
// rules: [{key, windowMs, max}] -> throws 429 with a friendly message on the first rule that trips.
export async function rateLimit(rules) {
  const cmds = [];
  for (const r of rules) {
    cmds.push(['SET', r.key, '0', 'PX', String(r.windowMs), 'NX']); // start window once
    cmds.push(['INCR', r.key]);                                       // INCR keeps the TTL
  }
  const res = await pipeline(cmds);
  rules.forEach((r, i) => {
    if (res[i * 2 + 1] > r.max) throw httpError(429, r.message || 'Slow down a little and try again.');
  });
}

export async function assertNotBanned(author, ipHash) {
  const [a, b] = await pipeline([['SISMEMBER', K.bans, author], ['SISMEMBER', K.bans, ipHash]]);
  if (a || b) throw httpError(403, 'A moderator has muted you here.');
}

export function isAdmin(req) {
  const want = process.env.MSGA_ADMIN_TOKEN;
  const got = String(req.headers['x-admin-token'] || '');
  if (!want || want.length < 12 || !got) return false;
  const a = Buffer.from(sha(want)), b = Buffer.from(sha(got));
  return timingSafeEqual(a, b);
}

export function send(res, status, data, cache = 'no-store') {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  res.end(JSON.stringify(data));
}

export function handler(fn, methods = ['POST']) {
  return async (req, res) => {
    try {
      if (!methods.includes(req.method)) return send(res, 405, { error: 'Method not allowed' });
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
      await fn(req, res, body || {});
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      send(res, status, { error: status >= 500 ? 'Something went wrong on the server. Try again in a moment.' : e.message, ...(e.extra || {}) });
    }
  };
}

// Public shape of a chat / guestbook record. Author tag and IP hash stay server-side;
// hidden posts keep their slot but lose their text.
export function publicPost(p) {
  return { id: p.id, t: p.t, nick: p.nick, anon: !!p.anon, body: p.h ? null : p.body, r: p.r || 0, h: p.h ? 1 : 0, n: p.n };
}
export const publicSupporter = s => ({ id: s.id, t: s.t, handle: s.anon ? '' : (s.handle || ''), anon: !!s.anon || !s.handle });

export const parse = s => { try { return s ? JSON.parse(s) : null } catch { return null } };

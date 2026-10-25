// Local test: runs every API handler against an in-memory Upstash-compatible mock.
// Usage: node scripts/test-api.mjs
import http from 'node:http';
import assert from 'node:assert/strict';

// ---- tiny in-memory Redis over the Upstash REST /pipeline protocol ----
const db = new Map(); const ttl = new Map();
const now = () => Date.now();
const alive = k => { if (ttl.has(k) && ttl.get(k) <= now()) { db.delete(k); ttl.delete(k) } return db.has(k) };
const get = (k, d) => alive(k) ? db.get(k) : d;
const zset = k => { if (!alive(k)) db.set(k, new Map()); return db.get(k) };
const hash = k => { if (!alive(k)) db.set(k, new Map()); return db.get(k) };
const set_ = k => { if (!alive(k)) db.set(k, new Set()); return db.get(k) };
const sortedZ = k => [...zset(k).entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
const bound = (s, inf) => s === '+inf' ? Infinity : s === '-inf' ? -Infinity : s.startsWith('(') ? { ex: Number(s.slice(1)) } : Number(s);
const inMin = (x, b) => typeof b === 'object' ? x > b.ex : x >= b;
const inMax = (x, b) => typeof b === 'object' ? x < b.ex : x <= b;
function run([c, ...a]) {
  c = c.toUpperCase();
  switch (c) {
    case 'PING': return 'PONG';
    case 'GET': return get(a[0], null);
    case 'SET': {
      const [k, v, ...o] = a; const nx = o.includes('NX');
      if (nx && alive(k)) return null;
      db.set(k, String(v)); ttl.delete(k);
      const px = o.indexOf('PX'), ex = o.indexOf('EX');
      if (px >= 0) ttl.set(k, now() + Number(o[px + 1])); if (ex >= 0) ttl.set(k, now() + Number(o[ex + 1]) * 1000);
      return 'OK';
    }
    case 'INCR': { const v = Number(get(a[0], 0)) + 1; db.set(a[0], String(v)); return v }
    case 'EXPIRE': if (alive(a[0])) { ttl.set(a[0], now() + Number(a[1]) * 1000); return 1 } return 0;
    case 'HSET': hash(a[0]).set(a[1], a[2]); return 1;
    case 'HGET': return alive(a[0]) ? (db.get(a[0]).get(a[1]) ?? null) : null;
    case 'HMGET': return a.slice(1).map(f => alive(a[0]) ? (db.get(a[0]).get(f) ?? null) : null);
    case 'HDEL': return a.slice(1).filter(f => alive(a[0]) && db.get(a[0]).delete(f)).length;
    case 'SADD': { const s = set_(a[0]); let n = 0; for (const m of a.slice(1)) if (!s.has(m)) { s.add(m); n++ } return n }
    case 'SISMEMBER': return alive(a[0]) && db.get(a[0]).has(a[1]) ? 1 : 0;
    case 'ZADD': { const nx = a[1] === 'NX'; const [k, sc, m] = nx ? [a[0], a[2], a[3]] : a; const z = zset(k); if (nx && z.has(m)) return 0; const isNew = !z.has(m); z.set(m, Number(sc)); return isNew ? 1 : 0 }
    case 'ZREM': return a.slice(1).filter(m => alive(a[0]) && db.get(a[0]).delete(m)).length;
    case 'ZCARD': return alive(a[0]) ? db.get(a[0]).size : 0;
    case 'ZCOUNT': { const lo = bound(a[1]), hi = bound(a[2]); return sortedZ(a[0]).filter(([, s]) => inMin(s, lo) && inMax(s, hi)).length }
    case 'ZREMRANGEBYSCORE': { const lo = bound(a[1]), hi = bound(a[2]); let n = 0; for (const [m, s] of sortedZ(a[0])) if (inMin(s, lo) && inMax(s, hi)) { zset(a[0]).delete(m); n++ } return n }
    case 'ZRANGE': {
      const [k, x, y, ...o] = a; const rev = o.includes('REV'), byscore = o.includes('BYSCORE');
      let items = sortedZ(k);
      if (byscore) {
        const hi = bound(rev ? x : y), lo = bound(rev ? y : x);
        items = items.filter(([, s]) => inMin(s, lo) && inMax(s, hi)); if (rev) items.reverse();
        const li = o.indexOf('LIMIT'); if (li >= 0) items = items.slice(Number(o[li + 1]), Number(o[li + 1]) + Number(o[li + 2]));
        return items.map(([m]) => m);
      }
      if (rev) items.reverse();
      const s = Number(x), e = Number(y) < 0 ? items.length + Number(y) : Number(y);
      return items.slice(s, e + 1).map(([m]) => m);
    }
    default: throw new Error('mock: unsupported ' + c);
  }
}
const server = http.createServer((req, res) => {
  let b = ''; req.on('data', d => b += d); req.on('end', () => {
    assert.equal(req.headers.authorization, 'Bearer test-token');
    const out = JSON.parse(b).map(cmd => { try { return { result: run(cmd) } } catch (e) { return { error: e.message } } });
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(out));
  });
});
await new Promise(r => server.listen(0, r));
process.env.KV_REST_API_URL = `http://127.0.0.1:${server.address().port}`;
process.env.KV_REST_API_TOKEN = 'test-token';
process.env.MSGA_SALT = 'salt-for-tests';
process.env.MSGA_ADMIN_TOKEN = 'admin-token-for-tests-123';

// ---- fake req/res ----
let ipCounter = 1;
async function call(name, { method = 'POST', body, query = {}, ip, headers = {} } = {}) {
  const mod = await import(`../api/${name}.js`);
  const req = { method, body, query, headers: { 'x-forwarded-for': ip || '10.0.0.1', ...headers } };
  let status = 200, data = '', hdr = {};
  const res = { set statusCode(s) { status = s }, setHeader(k, v) { hdr[k.toLowerCase()] = v }, end(d) { data = d } };
  await mod.default(req, res);
  return { status, json: JSON.parse(data), headers: hdr };
}
const sid = n => `0000000000000000000000000000000${n}`.slice(-32).replace(/^0/, 'a');
const A = sid(1), B = sid(2), C = sid(3), D = sid(4);
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++ };

// health
let r = await call('health', { method: 'GET' });
ok(r.status === 200 && r.json.db === 'connected', 'health');

// chat
r = await call('chat', { body: { sid: A, nick: 'trencher', text: 'gm trenches 🚀' } });
ok(r.status === 201 && r.json.post.body === 'gm trenches 🚀' && !('au' in r.json.post) && !('ip' in r.json.post), 'chat post, private fields stripped');
const chatId = r.json.post.id;
r = await call('chat', { body: { sid: A, nick: 'trencher', text: 'second fast' } });
ok(r.status === 429, 'chat rate limit');
r = await call('chat', { body: { sid: B, nick: 'x', text: 'hi' } });
ok(r.status === 400, 'nick too short');
r = await call('chat', { body: { sid: B, anon: true, text: 'check www.scam.xyz now' } });
ok(r.status === 400 && /Links/.test(r.json.error), 'links blocked');
r = await call('chat', { body: { sid: B, anon: true, text: 'anon hello' } });
ok(r.status === 201 && r.json.post.nick === 'Anonymous', 'anonymous chat');
r = await call('chat', { body: { nick: 'abc', text: 'no sid' } });
ok(r.status === 400, 'session required');

// state + version
r = await call('v', { method: 'GET' });
const v1 = r.json.v; ok(v1 >= 2 && r.json.messages === 2, 'version + counts');
ok(/s-maxage=1/.test(r.headers['cache-control']), 'v is edge cached briefly');
r = await call('state', { method: 'GET', query: { v: String(v1) } });
ok(r.json.chat.length === 2 && r.json.chat[0].body === 'anon hello', 'state newest first');
ok(/s-maxage=300/.test(r.headers['cache-control']), 'versioned state cached');

// reports: 3 different sessions hide the message
for (const [s, ip] of [[B, '1.1.1.1'], [C, '2.2.2.2'], [D, '3.3.3.3']]) await call('report', { body: { sid: s, type: 'chat', id: chatId }, ip });
r = await call('report', { body: { sid: B, type: 'chat', id: chatId } });
ok(r.json.already === true, 'one report per session');
r = await call('report', { body: { sid: A, type: 'chat', id: chatId } });
ok(r.status === 400, 'cannot report own message');
r = await call('state', { method: 'GET' });
const hidden = r.json.chat.find(m => m.id === chatId);
ok(hidden.h === 1 && hidden.body === null && hidden.r === 3, 'auto-hidden after 3 reports');

// delete own / not others
r = await call('chat', { body: { sid: C, action: 'delete', id: chatId } });
ok(r.status === 403, 'cannot delete others');
r = await call('chat', { body: { sid: A, action: 'delete', id: chatId } });
ok(r.status === 200, 'delete own');

// guestbook
r = await call('wall', { body: { sid: A, nick: 'trencher', text: 'I want the trenches to feel fun again.' } });
ok(r.status === 201 && r.json.post.n === 1, 'wall post numbered');
r = await call('wall', { body: { sid: A, nick: 'trencher', text: 'Another one right away' } });
ok(r.status === 429, 'wall rate limit');
r = await call('wall', { body: { sid: B, anon: true, text: 'hey' } });
ok(r.status === 400, 'wall minimum length');
r = await call('wall', { method: 'GET', query: { before: String(Date.now() + 1000) } });
ok(r.json.posts.length === 1, 'wall pagination');

// supporters
r = await call('join', { body: { sid: A, handle: '@stonker_1' } });
ok(r.status === 201 && r.json.mine.handle === 'stonker_1' && r.json.count === 1, 'join');
r = await call('join', { body: { sid: A, handle: 'renamed' } });
ok(r.status === 200 && r.json.count === 1 && r.json.mine.handle === 'renamed', 'rejoin updates, no duplicate');
r = await call('join', { body: { sid: B, handle: 'bad handle!' } });
ok(r.status === 400, 'handle validated');
for (const s of [B, C]) { r = await call('join', { body: { sid: s, anon: true }, ip: '9.9.9.9' }); }
r = await call('join', { body: { sid: D, anon: true }, ip: '9.9.9.9' });
ok(r.status === 201, 'third from same network allowed');
r = await call('join', { body: { sid: sid(5), anon: true }, ip: '9.9.9.9' });
ok(r.status === 429, 'fourth from same network blocked');
r = await call('join', { method: 'GET', query: { sid: A } });
ok(r.json.mine?.handle === 'renamed' && !('ip' in r.json.mine), 'read own signature');
r = await call('state', { method: 'GET' });
ok(r.json.counts.supporters === 4 && r.json.supporters.every(s => !('ip' in s)), 'supporter count + no private fields');
r = await call('join', { body: { sid: D, action: 'remove' } });
ok(r.json.count === 3, 'remove signature');

// presence
await call('presence', { body: { sid: A, tab: 't1' } });
r = await call('presence', { body: { sid: B, tab: 't2' } });
ok(r.json.online === 2, 'presence count');
await call('presence', { body: { sid: B, tab: 't2', leave: true } });
r = await call('v', { method: 'GET' });
ok(r.json.online === 1, 'leave removes presence');

// moderation
r = await call('admin', { body: { action: 'check' }, headers: { 'x-admin-token': 'wrong-token-xxxx' } });
ok(r.status === 401, 'bad admin key rejected');
const H = { 'x-admin-token': 'admin-token-for-tests-123' };
r = await call('admin', { body: { action: 'check' }, headers: H });
ok(r.status === 200, 'admin key accepted');
r = await call('chat', { body: { sid: C, nick: 'spammer', text: 'buy my bags' }, ip: '7.7.7.7' });
const spamId = r.json.post.id;
r = await call('admin', { body: { action: 'ban', type: 'chat', id: spamId }, headers: H });
ok(r.status === 200, 'ban');
r = await call('chat', { body: { sid: sid(6), nick: 'newacct', text: 'still here' }, ip: '7.7.7.7' });
ok(r.status === 403, 'banned network cannot post');
r = await call('admin', { body: { action: 'unhide', type: 'chat', id: spamId }, headers: H });
r = await call('state', { method: 'GET' });
ok(r.json.chat.find(m => m.id === spamId).h === 0, 'unhide');

console.log(`All ${pass} API checks passed.`);
server.close();

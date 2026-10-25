// Minimal Upstash Redis REST client (no dependencies).
// Works with the env vars the Vercel Upstash / KV integration injects.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const redisConfigured = () => Boolean(URL_ && TOKEN);

export async function pipeline(commands) {
  if (!redisConfigured()) throw Object.assign(new Error('Database is not connected'), { status: 503 });
  const r = await fetch(`${URL_}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands)
  });
  if (!r.ok) throw Object.assign(new Error(`Redis error ${r.status}`), { status: 502 });
  const out = await r.json();
  return out.map(x => {
    if (x.error) throw Object.assign(new Error(x.error), { status: 502 });
    return x.result;
  });
}

export async function cmd(...args) {
  const [res] = await pipeline([args]);
  return res;
}

// Namespaced keys
export const K = {
  v: 'msga:v',                         // global data version, bumped on every write
  chatMsg: 'msga:chat:msg',            // hash id -> json
  chatIdx: 'msga:chat:idx',            // zset id by ts
  chatTotal: 'msga:chat:total',        // all-time message count
  wallMsg: 'msga:wall:msg',
  wallIdx: 'msga:wall:idx',
  wallTotal: 'msga:wall:total',
  supMsg: 'msga:sup:msg',              // hash author -> json
  supIdx: 'msga:sup:idx',              // zset author by ts
  online: 'msga:online',               // zset author by last heartbeat ms
  bans: 'msga:bans',                   // set of banned author tags and ip hashes
  authorIp: 'msga:authorip',           // hash author -> ip hash (for bans)
  reports: (type, id) => `msga:rep:${type}:${id}`,
  rl: (...parts) => `msga:rl:${parts.join(':')}`
};

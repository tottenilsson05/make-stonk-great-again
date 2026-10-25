// Tiny, CDN-cached heartbeat of the shared state. Clients poll this; when `v` changes they fetch /api/state.
import { pipeline, K, redisConfigured } from '../lib/redis.js';
import { handler, send } from '../lib/util.js';

export default handler(async (req, res) => {
  if (!redisConfigured()) return send(res, 503, { error: 'Database is not connected yet.' }, 'no-store');
  const now = Date.now();
  const [v, online, supporters, messages, wall] = await pipeline([
    ['GET', K.v],
    ['ZCOUNT', K.online, String(now - 45000), '+inf'],
    ['ZCARD', K.supIdx],
    ['GET', K.chatTotal],
    ['GET', K.wallTotal]
  ]);
  send(res, 200, {
    v: Number(v || 0), online: Number(online || 0), supporters: Number(supporters || 0),
    messages: Number(messages || 0), wall: Number(wall || 0), now
  }, 'public, max-age=0, s-maxage=1, stale-while-revalidate=2');
}, ['GET']);

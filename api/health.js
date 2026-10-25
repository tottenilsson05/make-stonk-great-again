// Deployment check: confirms the database connection without exposing anything.
import { cmd, redisConfigured } from '../lib/redis.js';
import { handler, send } from '../lib/util.js';

export default handler(async (req, res) => {
  if (!redisConfigured()) return send(res, 503, { ok: false, db: 'not connected', moderation: !!process.env.MSGA_ADMIN_TOKEN });
  const pong = await cmd('PING');
  send(res, 200, { ok: pong === 'PONG', db: 'connected', moderation: !!process.env.MSGA_ADMIN_TOKEN, salt: !!process.env.MSGA_SALT });
}, ['GET']);

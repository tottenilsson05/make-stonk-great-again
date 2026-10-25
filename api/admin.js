// Moderation. Requires the X-Admin-Token header to match the MSGA_ADMIN_TOKEN env var
// (set it yourself in Vercel > Project > Settings > Environment Variables).
import { pipeline, K } from '../lib/redis.js';
import { handler, send, isAdmin, httpError, rateLimit, ipHashOf, clientIp } from '../lib/util.js';
import { getPost, savePost, deletePost } from '../lib/posts.js';

export default handler(async (req, res, body) => {
  if (!process.env.MSGA_ADMIN_TOKEN) throw httpError(503, 'Moderation is not set up yet. Add MSGA_ADMIN_TOKEN in Vercel.');
  if (!isAdmin(req)) {
    await rateLimit([{ key: K.rl('adminfail', ipHashOf(clientIp(req))), windowMs: 900000, max: 10, message: 'Too many wrong moderator keys. Wait 15 minutes.' }]);
    throw httpError(401, 'That moderator key is not right.');
  }
  const action = String(body.action || '');
  if (action === 'check') return send(res, 200, { ok: true });

  const type = body.type === 'wall' ? 'wall' : 'chat';
  const rec = await getPost(type, body.id);
  if (action === 'hide' || action === 'unhide') {
    rec.h = action === 'hide' ? 1 : 0;
    if (action === 'unhide') rec.r = 0;
    return send(res, 200, { ok: true, v: await savePost(type, rec) });
  }
  if (action === 'delete') return send(res, 200, { ok: true, v: await deletePost(type, rec.id) });
  if (action === 'ban') {
    const cmds = [['SADD', K.bans, rec.au]];
    if (rec.ip) cmds.push(['SADD', K.bans, rec.ip]);
    await pipeline(cmds);
    rec.h = 1;
    return send(res, 200, { ok: true, v: await savePost(type, rec) });
  }
  throw httpError(400, 'Unknown action.');
});

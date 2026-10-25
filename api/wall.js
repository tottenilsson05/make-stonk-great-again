// Guestbook: POST to sign or delete your own entry, GET ?before=<ms> to page older entries.
import { handler, send, readSession } from '../lib/util.js';
import { createPost, deleteOwn, listPosts } from '../lib/posts.js';

export default handler(async (req, res, body) => {
  if (req.method === 'GET') {
    const before = Number(req.query?.before);
    if (!before) return send(res, 400, { error: 'Missing before.' });
    const posts = await listPosts('wall', { before, limit: 20 });
    return send(res, 200, { posts }, 'public, max-age=0, s-maxage=10, stale-while-revalidate=30');
  }
  readSession(body);
  if (body.action === 'delete') return send(res, 200, await deleteOwn('wall', body));
  send(res, 201, await createPost('wall', req, body));
}, ['GET', 'POST']);

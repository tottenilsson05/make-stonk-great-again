import { handler, send, readSession } from '../lib/util.js';
import { createPost, deleteOwn } from '../lib/posts.js';

export default handler(async (req, res, body) => {
  readSession(body);
  if (body.action === 'delete') return send(res, 200, await deleteOwn('chat', body));
  send(res, 201, await createPost('chat', req, body));
});

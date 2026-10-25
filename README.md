# Make Stonk Great Again

Community movement site: boot-up intro, Windows XP desktop homepage, live Trench Chat,
live supporter counter, a public guestbook and a PFP generator.

Independent community project. Not operated by or affiliated with Stonk.

## How it works

```
public/            static site (served as-is, no build step)
  index.html
  css/site.css
  js/config.js     <- links, logos, contract address, launch date (edit this)
  js/app.js        intro, desktop, taskbar, notifications, PFP studio
  js/live.js       live layer: chat, guestbook, supporters, presence, moderation
  js/motion.js     dock, scroll reveals, parallax, magnetic hover
  assets/          artwork + layers cut from the original images
api/               Vercel Functions (Node, zero dependencies)
lib/               shared server code (Redis client, validation, rate limits)
scripts/test-api.mjs   tests every endpoint against an in-memory database
```

**Shared data** lives in Upstash Redis (Vercel Marketplace). Every visitor sees the same state:

- Pages poll `/api/v` every 2.5 s. It is edge-cached for 1 s, so 1 or 1,000 visitors cost the
  database about the same. When the version number changes, the page pulls `/api/state?v=N`
  (cached per version). Your own actions show instantly; everyone else sees them within ~2 s.
- Tabs in the background slow down to every 20 s and catch up immediately when you come back.
  Lost connections retry with backoff and resync automatically.
- Online count: each open page sends a heartbeat every 25 s; "online" = heartbeats in the last 45 s.

**Protections (server-side)**

| Feature | Limits |
|---|---|
| Chat | 240 chars, 1 msg / 2.5 s and 6 / 30 s per browser, 20 / min per network, no repeats, links blocked |
| Guestbook | 4-280 chars, 1 entry / 45 s per browser, 8 / day per network, links blocked |
| Supporters | 1 signature per browser (editable / removable), max 3 new per network per day |
| Reports | 1 per person per post; 3 reports hide a post automatically |
| Moderation | community-driven: 3 reports hide a post automatically |

Signatures count browsers within those limits. They are **not** verified unique people.
IP addresses are never stored, only salted hashes used for limits and bans.

## Environment variables (Vercel > Project > Settings > Environment Variables)

| Name | Set by | Purpose |
|---|---|---|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) | Added automatically when you connect the Upstash Redis store to the project | Database |
| `MSGA_SALT` | Already set on the project | Hashing secret for session and network ids |
| `MSGA_ADMIN_TOKEN` | Optional, not set | Enables /api/admin (hide/delete/ban). Without it moderation is community reports only |

After changing environment variables, redeploy (Deployments > ... > Redeploy).

Check the setup any time at `/api/health`.

## Editing

- Links, contract address, launch date and logo files: `public/js/config.js`.
- Official logos: download from each platform's brand kit into `public/assets/logos/` and set the
  paths in `CONFIG.logos`. Until then the buttons show a dashed LOGO placeholder.

Every push to `main` deploys to production automatically.

## Local test

```
node scripts/test-api.mjs
```

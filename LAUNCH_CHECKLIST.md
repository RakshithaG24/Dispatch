# Launch checklist

The product must not go live until every item here is done.

## Built into the project

- [x] Favicon: `frontend/public/favicon.svg`, plus `favicon.ico`, `apple-touch-icon.png`, 192 and 512 pixel icons and a web manifest, all linked from `frontend/index.html`
- [x] Privacy Policy page at `/privacy`
- [x] Terms and Conditions page at `/terms`
- [x] Both legal pages linked from the footer on every page and from the sign-in screen
- [x] No "made with" badge, watermark, tracking script or third-party widget in the page
- [x] No stock or generated photos, no fake reviews, counters or metrics. Every number on screen comes from the database.
- [x] No icon libraries, no emoji, no cursor effects, no scroll animation

## You must do before launch

- [ ] **Connect a custom domain.** This cannot be done from inside the code. Steps:
  1. Deploy the API, worker and built frontend (see "Deploying" below).
  2. At your registrar or DNS host add an `A` record (or `CNAME` if your host gives a hostname) for `app.yourdomain.com` pointing at the server.
  3. Terminate HTTPS. With Caddy this is automatic; with nginx use Certbot.
  4. Set `APP_URL=https://app.yourdomain.com` and `API_URL=https://app.yourdomain.com` in `backend/.env`.
  5. Add `https://app.yourdomain.com/api/auth/google/callback` to the Google OAuth client and `https://app.yourdomain.com/api/slack/callback` to the Slack app.
  6. Publish the Google OAuth consent screen (move it out of Testing) and add your Privacy Policy and Terms URLs to it.
- [ ] Fill in `frontend/.env`: `VITE_COMPANY_NAME`, `VITE_CONTACT_EMAIL`, `VITE_COMPANY_ADDRESS`, then rebuild the frontend. The legal pages show these values.
- [ ] Have a lawyer review the Privacy Policy and Terms for your jurisdiction. They are accurate to how the code behaves, but they are a starting draft, not legal advice.
- [ ] Set a long random `JWT_SECRET` and `NODE_ENV=production` (this turns on secure cookies).
- [ ] Use a managed Postgres and Redis with backups. Keep Redis append-only persistence on.
- [ ] Decide whether to keep Ethereal. It captures mail and never reaches real inboxes. For real delivery, replace the sender rows with real SMTP credentials and encrypt the stored passwords.

## Deploying (single server example)

```bash
cd frontend && npm ci && npm run build
cd ../backend && npm ci && npm run build
NODE_ENV=production node dist/server.js          # API and static frontend
NODE_ENV=production node dist/worker.js          # worker, run under systemd or pm2
```

Example Caddyfile (HTTPS and certificate renewal are automatic):

```
app.yourdomain.com {
    reverse_proxy localhost:4000
}
```

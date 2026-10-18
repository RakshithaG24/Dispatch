# Dispatch

A production-style email scheduler and dashboard. Express and TypeScript API, BullMQ delayed jobs on Redis, Postgres for state, Elasticsearch for search, Ethereal for fake SMTP, and a React dashboard.

Two companion documents:

- `PROJECT_GUIDE.md` explains every file, every function and how each feature works.
- `LAUNCH_CHECKLIST.md` lists what must be done before going live (custom domain, legal details, OAuth for production).

## Contents

1. Requirements
2. Run it locally
3. Environment variables
4. Setting up Ethereal
5. Setting up Google login
6. Setting up Slack alerts
7. Architecture
8. Rate limiting, delay and concurrency
9. Behaviour under load
10. Features mapped to the assignment
11. Hard constraints
12. Assumptions and trade-offs
13. What was tested

## 1. Requirements

- Node.js 20 or newer
- Docker Desktop (recommended) to run Postgres, Redis and Elasticsearch. You can use local installs instead; only the connection URLs matter.
- A Google Cloud OAuth client (free) for login
- A Slack app (free) for the Connect Slack button

## 2. Run it locally

Open three terminals in the project folder.

**Terminal 1: infrastructure**

```bash
docker compose up -d
```

Wait about 30 seconds for Elasticsearch to start. Check with `docker compose ps`.

**Terminal 2: backend API and worker**

```bash
cd backend
cp .env.example .env        # then edit .env, see section 3
npm install
npm run seed:senders        # creates Ethereal sender accounts and prints their logins
npm run dev                 # API on http://localhost:4000
```

Open a second shell in `backend` and start the worker. It is a separate process on purpose, so it can be stopped and started independently of the API:

```bash
npm run dev:worker
```

**Terminal 3: frontend**

```bash
cd frontend
cp .env.example .env
npm install
npm run dev                 # http://localhost:5173
```

Open http://localhost:5173 and click Continue with Google.

Useful addresses once running:

| What | Where |
| --- | --- |
| Dashboard | http://localhost:5173 |
| Live BullMQ dashboard (sign in first) | http://localhost:4000/admin/queues |
| Health check | http://localhost:4000/api/health |

### Production build

```bash
cd frontend && npm run build
cd ../backend && npm run build && npm start        # API, also serves frontend/dist
npm run start:worker                               # in a second process
```

When `frontend/dist` exists the API serves it, so one process can answer on a single domain.

## 3. Environment variables

Backend, in `backend/.env`:

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | API port | 4000 |
| `APP_URL` | Where the React app lives (used for post-login redirects) | http://localhost:5173 |
| `API_URL` | Public URL of the API (used to build OAuth callbacks) | http://localhost:4000 |
| `JWT_SECRET` | Signs session cookies. Use a long random string | required |
| `DATABASE_URL` | Postgres connection | matches docker-compose |
| `REDIS_URL` | Redis connection | redis://localhost:6379 |
| `ELASTICSEARCH_URL` | Elasticsearch connection | http://localhost:9200 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth | required for login |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | Slack OAuth | required for Connect Slack |
| `WORKER_CONCURRENCY` | Jobs one worker runs in parallel | 5 |
| `MIN_DELAY_BETWEEN_EMAILS_MS` | Minimum gap between sends from one sender | 2000 |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | Hard hourly ceiling per sender | 200 |
| `MAX_ATTEMPTS` | Send attempts before an email is marked failed | 3 |
| `ETHEREAL_ACCOUNTS` | Sender accounts created automatically | 3 |

Generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

Frontend, in `frontend/.env`: `VITE_COMPANY_NAME`, `VITE_CONTACT_EMAIL`, `VITE_COMPANY_ADDRESS`. They fill in the Privacy Policy, Terms and footer.

## 4. Setting up Ethereal

Ethereal is a free fake SMTP service. There is nothing to sign up for.

1. Run `npm run seed:senders` in `backend`. It calls Ethereal's account API and stores the credentials in the `senders` table. It prints each address and password.
2. Log in at https://ethereal.email/login with any printed address to see every message that sender delivered.
3. In the dashboard, each sent row has a "View in Ethereal" link to the exact message.

Changing `ETHEREAL_ACCOUNTS` and running the command again adds more senders. Emails in a batch are spread across senders in round-robin order, and rate limits apply per sender.

## 5. Setting up Google login

1. Go to https://console.cloud.google.com, create a project, then open APIs and Services, OAuth consent screen, and configure it (External, add yourself as a test user).
2. Credentials, Create Credentials, OAuth client ID, type Web application.
3. Authorized redirect URI: `http://localhost:4000/api/auth/google/callback`
4. Copy the client ID and secret into `backend/.env`.

## 6. Setting up Slack alerts

1. Go to https://api.slack.com/apps and create an app from scratch in your workspace.
2. Open Incoming Webhooks and switch it on.
3. Open OAuth and Permissions. Under Redirect URLs add `${API_URL}/api/slack/callback`. Slack may refuse a plain `http://localhost` URL. If it does, run a tunnel such as `ngrok http 4000`, set `API_URL` in `backend/.env` to the https tunnel address, and use that address for the callback.
4. Under Basic Information copy the Client ID and Client Secret into `backend/.env`.
5. In the dashboard click Connect Slack, pick a channel, approve. The backend stores the webhook for your user.
6. Click Send test message to confirm. The live alert fires the moment a sender's hourly limit is hit.

If Slack is not connected, limit hits skip notification silently. If you connect later, the next limit hit notifies without any redeploy. Disconnecting deletes the stored webhook.

To demonstrate a live alert quickly, schedule a batch of 5 or more recipients with Hourly limit set to 2.

## 7. Architecture

```
Browser (React)
   |  cookie session
   v
Express API  ---------------->  Postgres  (source of truth: users, batches, emails, senders)
   |   \
   |    \--> Elasticsearch   (search index, best effort)
   |
   +--> BullMQ queue "email-send"  --->  Redis  (delayed jobs, rate limit counters)
                                             ^
Worker process(es)  -------------------------+
   |  1. reserve a send slot in Redis (Lua)
   |  2. claim the row in Postgres
   |  3. send via Ethereal SMTP
   |  4. record result, update index, alert Slack on limit hit
```

### How scheduling works

`POST /api/emails/schedule` validates the payload, removes duplicate recipients, and assigns each recipient a sender (round robin) and a send time of `start + index * delay`. One Postgres transaction writes the batch and every email row. After commit, each email becomes a BullMQ delayed job whose `jobId` equals the email id. No cron library or OS cron is used anywhere; the only timer is BullMQ's own delayed set in Redis.

### How persistence on restart is handled

- Postgres holds every email and its status. Redis holds the delayed jobs, and Redis is configured with append-only persistence in `docker-compose.yml`.
- Stopping the API or the worker loses nothing. Delayed jobs stay in Redis. A worker that starts later picks up anything that became due while it was down.
- On boot, the API and the worker run a reconciler: every email still `scheduled` in Postgres is re-added as a job. Adding an id that already exists is a no-op, so this never duplicates. This also repairs a crash between the Postgres commit and the queue write, and a complete Redis data loss.
- Nothing restarts from scratch because each email is its own job with its own state.

### How duplicates are prevented (idempotency)

Four layers:

1. Job id equals email id, so one email can only exist once in the queue.
2. The schedule endpoint accepts an `Idempotency-Key` header. A repeated request returns the original batch. The dashboard sends one key per open compose dialog.
3. `UNIQUE (batch_id, recipient)` blocks duplicate recipients inside a batch.
4. Before sending, the worker runs a guarded `UPDATE ... WHERE status = 'scheduled'`. Only one worker can win it. Emails already `sent` or `failed` are skipped, so a re-delivered job is harmless. The Message-ID is derived from the email id as a final marker.

## 8. Rate limiting, delay and concurrency

**Concurrency.** `WORKER_CONCURRENCY` sets how many jobs one worker runs in parallel (default 5). You can run several worker processes. Every shared decision lives in Redis or Postgres, never in process memory, so parallel work is safe.

**Delay between emails.** The default is `MIN_DELAY_BETWEEN_EMAILS_MS=2000`, a minimum of 2 seconds between two sends from the same sender account. A batch can ask for a longer delay in the compose form; the server uses the larger of the two.

**Emails per hour.** `MAX_EMAILS_PER_HOUR_PER_SENDER=200` is the global ceiling per sender per clock hour. A batch can request a lower limit, never a higher one; the dashboard tells you when the server lowered or raised a value.

**How it is enforced.** Before sending, a worker calls a Redis Lua script (`backend/src/queue/rateLimiter.ts`) that runs atomically:

1. Take the later of "now" and the sender's next free slot.
2. If that clock hour already holds `limit` sends, move to the start of the next hour and check again.
3. Increment that hour's counter (key `rl:count:<sender>:<hour>`), set the sender's next free slot to `slot + gap`, and return the slot.

If the slot is in the future, the worker calls `moveToDelayed` on the job and the job waits in BullMQ; it is never dropped and never marked failed. Because the script hands out slots one after another, queued emails keep their relative order and wake at distinct times instead of all at once.

When a limit pushes an email to a later hour, the dashboard shows "Deferred: hourly limit" and the new time, and one Slack message is posted per sender per hour window.

**Trade-offs.** A reserved slot is consumed even if the send later fails, which errs on the side of staying under the limit. The limit applies per sender, so total throughput scales with the number of senders.

## 9. Behaviour under load

With 1000 or more emails due at the same moment:

- Scheduling inserts all rows in one statement and adds jobs in chunks of 500, so the API call returns quickly.
- When the jobs become due, the workers process at most `WORKER_CONCURRENCY` at a time per worker. Each reserves a slot in Redis.
- Each sender releases at most one email per gap and at most `limit` per hour. Everything beyond that is moved to the delayed set at its reserved time, hours ahead if needed. For example, 1000 emails over 3 senders with a limit of 200 per hour finish within two clock hours when started at the top of an hour: at most 600 in the first hour (200 per sender) and the remaining 400 in the next.
- Nothing is dropped. The queue and the table both show exactly what is waiting and until when.

## 10. Features mapped to the assignment

**Backend**

| Requirement | Where |
| --- | --- |
| Accept scheduling requests via API | `routes/emails.ts`, `services/emails.ts` (`scheduleBatch`) |
| Store in Postgres | `db/schema.sql`, `services/emails.ts` |
| BullMQ delayed jobs, no cron | `queue/queue.ts` |
| Multiple senders via Ethereal | `services/senders.ts`, `services/mailer.ts` |
| Elasticsearch search | `services/search.ts`, `GET /api/emails?q=` |
| Live BullMQ dashboard | `app.ts`, mounted at `/admin/queues` |
| Persistence across restarts | `reconcileQueue` in `services/emails.ts`, Redis AOF |
| No duplicates | Section 7, "How duplicates are prevented" |
| Worker concurrency | `WORKER_CONCURRENCY`, `workers/emailWorker.ts` |
| Delay between sends | `MIN_DELAY_BETWEEN_EMAILS_MS`, `queue/rateLimiter.ts` |
| Hourly limit, multi-worker safe | `queue/rateLimiter.ts` (Redis Lua) |
| Slack alert on limit hit, OAuth | `services/slack.ts`, `routes/slack.ts` |
| Connect and disconnect handling | `services/slack.ts` (`disconnect`, `notifyRateLimitHit`) |

**Frontend**

| Requirement | Where |
| --- | --- |
| Google login | `routes/auth.ts`, `pages/Login.tsx` |
| Header with name, email, avatar, logout | `components/Header.tsx`, `components/Avatar.tsx` |
| Scheduled and Sent tabs | `pages/Dashboard.tsx`, `components/EmailList.tsx` |
| Compose New Email with CSV upload and counts | `components/ComposeModal.tsx`, `lib/emails.ts` |
| Start time, delay, hourly limit | `components/ComposeModal.tsx` |
| Loading, empty and error states | `components/ui/DataTable.tsx`, `hooks/useToast.tsx` |
| Reusable components, typed API | `components/ui/*`, `api/types.ts` |
| Privacy Policy and Terms pages | `pages/Privacy.tsx`, `pages/Terms.tsx` |

## 11. Hard constraints

- No cron of any kind. Scheduling is BullMQ delayed jobs. The only `setInterval` in the repository is the dashboard's 5 second refresh in the browser.
- Persistent across restarts, verified by killing the worker process with `kill -9` (section 13).
- Idempotent sends, see section 7.

## 12. Assumptions and trade-offs

- **Figma.** The assignment links a Figma file but the link was not included in the document I received, so the interface follows the brief: header, two tabs, a Compose button and a modal. Adjust spacing and colours in `tailwind.config.js` once you compare against the design.
- **At-least-once edge case.** If a worker dies after the SMTP server accepts a message but before Postgres records it, the email can be sent once more after a five minute claim timeout. Exactly-once delivery across SMTP and a database is not possible without provider-side deduplication; the stable Message-ID makes such a duplicate identifiable.
- **Elasticsearch is best effort.** Postgres is authoritative. If Elasticsearch is down, writes continue and search falls back to a Postgres `ILIKE` query. Re-indexing happens as emails change state.
- **Delay is per sender.** The minimum gap is enforced per sender account because that is where provider throttling applies. Scheduled times in a batch are spaced by the chosen delay as well.
- **Hour windows are clock hours in UTC.** The limit resets at the top of each hour, not on a rolling 60 minute window.
- **Redis keys are not cluster-slot aware.** The Lua script builds hour-window keys dynamically, so it targets a single Redis, which is what this project uses.
- **Sender passwords** for Ethereal are stored in plain text in Postgres. They are throwaway test credentials. Encrypt them before pointing this at real SMTP.
- **Message bodies** are sent as plain text. No templating or HTML yet.
- **Slack** uses an incoming webhook (`incoming-webhook` scope), which posts to the channel chosen during authorization.

## 13. What was tested

Against real Redis and Postgres, with a local SMTP server standing in for Ethereal (the build environment cannot reach the internet):

- Hourly limit of 3 across 2 senders with 8 recipients: 6 sent, 2 moved to the next hour, 2 delayed jobs in Redis, none lost.
- Gap between sends from one sender never below the configured minimum.
- Repeating a request with the same `Idempotency-Key` returned the original batch.
- Worker process killed with SIGKILL while emails were still in the future: rows stayed `scheduled`, jobs stayed in Redis, nothing sent while down; after restart every overdue email was sent exactly once.
- Redis wiped completely: the reconciler recreated the owed jobs from Postgres.
- A duplicate job for an already sent email was skipped.
- API: 401 without session, validation errors, search fallback, Bull Board blocked when signed out.
- Slack: no connection means silent skip; once connected, five limit hits produced one message.
- Frontend: TypeScript strict build passes, production bundle builds, API serves it.

Not exercised here: real Google and Slack OAuth round trips (they need your credentials), real Elasticsearch, Docker Compose, and Ethereal itself. Those paths are written to each provider's documented API; test them with your own keys using the steps above.

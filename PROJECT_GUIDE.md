# Project guide

This document explains every file in the project, every function inside it, and how the features work end to end. Read the "Life of one email" section first; the rest is reference.

## Contents

1. Folder map
2. Life of one email
3. HTTP API reference
4. Database tables
5. Backend, file by file
6. Frontend, file by file
7. Where to change common things

## 1. Folder map

```
dispatch/
  docker-compose.yml        Postgres, Redis (persistent), Elasticsearch for local use
  README.md                 Setup, architecture, rate limiting, assumptions
  PROJECT_GUIDE.md          This file
  LAUNCH_CHECKLIST.md       Custom domain and pre-launch tasks
  .gitignore
  backend/                  Express API, BullMQ worker, scheduling logic
    package.json            Scripts and dependencies
    tsconfig.json           Strict TypeScript, CommonJS output to dist/
    .env.example            Every setting with comments
    scripts/copy-assets.mjs Copies schema.sql into dist/ during build
    src/                    Source, described in section 5
  frontend/                 React dashboard
    index.html              Page shell, favicon and manifest links
    public/                 Favicon, icons, web manifest
    src/                    Source, described in section 6
```

## 2. Life of one email

1. **Compose.** In the dashboard the user fills the form and uploads a CSV. `lib/emails.ts` finds addresses with a pattern and removes duplicates. The count shown is that result.
2. **Schedule.** The browser calls `POST /api/emails/schedule` with a fresh `Idempotency-Key`. `routes/emails.ts` validates the body with `schemas.ts` and calls `scheduleBatch`.
3. **Store.** `scheduleBatch` clamps the hourly limit to `MAX_EMAILS_PER_HOUR_PER_SENDER`, clamps the delay to at least `MIN_DELAY_BETWEEN_EMAILS_MS`, assigns senders round robin, gives recipient number `i` the time `start + i * delay`, and inserts the batch and all email rows in one transaction.
4. **Queue.** `enqueueEmails` adds one BullMQ delayed job per email. The job id is the email id. The email is also indexed into Elasticsearch.
5. **Wake up.** At the scheduled time BullMQ hands the job to `processEmail` in a worker process.
6. **Guard 1, terminal check.** If the row is already `sent` or `failed`, return. This neutralises duplicate deliveries.
7. **Guard 2, slot reservation.** `reserveSendSlot` runs the Lua script in Redis. It returns the earliest time this sender may send, honouring the minimum gap and the hourly limit. If that time is later than now, the row is marked deferred, the job is moved back into the delayed set for that time, and the worker moves on. If the limit was the reason, `notifyRateLimitHit` posts to Slack once per sender per hour.
8. **Guard 3, claim.** `claimEmail` flips `scheduled` to `processing` with a single guarded UPDATE. Only one worker can win.
9. **Send.** `sendEmail` sends through the sender's Ethereal SMTP account and returns the message id and a preview URL.
10. **Record.** `markSent` stores the result. On failure, `markRetry` returns the row to `scheduled` and BullMQ retries with exponential backoff; after the last attempt `markFailed` stores the error.
11. **Display.** The dashboard polls every 5 seconds and moves the row from Scheduled to Sent.

If the machine restarts at any point: Postgres still has every row and Redis still has the delayed jobs. On boot `reconcileQueue` re-adds any `scheduled` row whose job is missing.

## 3. HTTP API reference

All routes except health and the OAuth redirects require the session cookie.

| Method and path | Purpose |
| --- | --- |
| `GET /api/health` | Reports Postgres, Redis and Elasticsearch reachability |
| `GET /api/auth/google` | Starts Google login |
| `GET /api/auth/google/callback` | Finishes Google login, sets the session cookie, redirects to `/dashboard` |
| `GET /api/auth/me` | Returns the signed-in user (name, email, avatar) |
| `POST /api/auth/logout` | Clears the session cookie |
| `POST /api/emails/schedule` | Schedules a batch. Body: `subject`, `body`, `recipients[]`, `startTime` (ISO), `delaySeconds`, `hourlyLimit`. Optional header `Idempotency-Key`. Returns 202, or 200 with `duplicate: true` when repeated |
| `GET /api/emails?group=scheduled\|sent&page=&pageSize=&q=` | Lists a tab. `q` uses Elasticsearch |
| `GET /api/emails/counts` | Counts for the two tabs |
| `GET /api/slack/status` | Whether Slack is configured and connected |
| `GET /api/slack/connect` | Starts Slack OAuth |
| `GET /api/slack/callback` | Finishes Slack OAuth and stores the webhook |
| `POST /api/slack/test` | Sends a test message to the connected channel |
| `DELETE /api/slack` | Disconnects Slack |
| `GET /admin/queues` | Live BullMQ dashboard (sign-in required) |

Example with curl, using your browser's session cookie value:

```bash
curl -X POST http://localhost:4000/api/emails/schedule \
  -H "Content-Type: application/json" -H "Cookie: session=<value>" \
  -H "Idempotency-Key: demo-1" \
  -d '{"subject":"Hello","body":"Test","recipients":["a@example.com","b@example.com"],
       "startTime":"2026-10-18T12:00:00Z","delaySeconds":5,"hourlyLimit":100}'
```

## 4. Database tables

| Table | Holds |
| --- | --- |
| `users` | One row per Google account |
| `senders` | Ethereal SMTP accounts used to send |
| `batches` | One row per Schedule click: subject, body, start, delay, limit, total, idempotency key |
| `emails` | One row per recipient. Status is `scheduled`, `processing`, `sent` or `failed`. Also stores scheduled and processed times, attempts, last error, message id, preview URL, deferral reason, and the limit and gap that applied |
| `slack_connections` | One webhook per user |

`emails.seq` is a serial number that preserves insertion order across a batch. `UNIQUE (batch_id, recipient)` and `UNIQUE (user_id, idempotency_key)` enforce idempotency in the database itself.

## 5. Backend, file by file

All paths are under `backend/`.

### Root files

- `package.json`: scripts are `dev` (API with reload), `dev:worker` (worker with reload), `build`, `start`, `start:worker`, `migrate`, `seed:senders`, `typecheck`.
- `tsconfig.json`: strict mode, compiles `src/` to `dist/`.
- `.env.example`: every setting, documented.
- `scripts/copy-assets.mjs`: after `tsc`, copies `schema.sql` into `dist/db/` because the compiler ignores non-TypeScript files.

### `src/config.ts`

Reads and validates environment variables once with zod. If anything is missing or malformed the process prints the problem and exits. Exports:

- `config`: typed settings used everywhere else. Nothing else touches `process.env`.
- `isProd`: true when `NODE_ENV=production`.
- `googleRedirectUri`, `slackRedirectUri`: OAuth callback URLs built from `API_URL`.

### `src/logger.ts`

- `log.info`, `log.warn`, `log.error`: write one JSON line with time, level, message and optional fields. Easy to ship to any log tool.
- `errorMessage(err)`: turns an unknown thrown value into a string.

### `src/redis.ts`

- `createRedis()`: makes an ioredis connection with `maxRetriesPerRequest: null`, which BullMQ requires for workers.
- `redis`: the shared connection used by the queue, the rate limiter and Slack deduplication.

### `src/types.ts`

Shared TypeScript types: `EmailStatus`, `DeferReason`, `UserRow`, `SenderRow`, `EmailRow`, `EmailDto` (what the frontend and Elasticsearch see), `EmailGroup`, and `EmailJobData` (`emailId`, plus `slotAt` once a rate limit slot is reserved).

### `src/db/schema.sql`

Creates the five tables and indexes with `IF NOT EXISTS`, so it is safe to run repeatedly. Key choices: statuses are constrained by a CHECK, and indexes cover the two dashboard queries (by user, status and time).

### `src/db/pool.ts`

- `pool`: the pg connection pool.
- `query(text, params)`: runs a statement and returns rows.
- `withTransaction(fn)`: runs `fn` between BEGIN and COMMIT, and rolls back if it throws.

### `src/db/migrate.ts`

- `migrate()`: takes a Postgres advisory lock (so the API and worker do not race when they boot together), runs `schema.sql`, releases the lock. Runs automatically at boot and can be run alone with `npm run migrate`.

### `src/queue/queue.ts`

- `EMAIL_QUEUE`: the queue name.
- `emailQueue`: the BullMQ queue. Defaults: attempts from `MAX_ATTEMPTS`, exponential backoff starting at 5 seconds, completed jobs removed after an hour, failed jobs kept so they stay visible in Bull Board.
- `buildJob(emailId, scheduledAt)`: builds the job definition. `jobId` equals the email id (first idempotency layer) and `delay` is the milliseconds until the send time.
- `enqueueEmails(items)`: adds jobs in chunks of 500 using `addBulk`.

### `src/queue/rateLimiter.ts`

- `RESERVE_SCRIPT`: the Lua program that runs atomically in Redis. It finds the first moment this sender may send, skipping full hours, increments that hour's counter, and moves the sender's next free time forward by the gap. Returns the slot and whether an hour was full.
- `reserveSendSlot({senderId, now, gapMs, hourlyLimit})`: calls the script and returns `{ slotAt, hitHourlyLimit }`.
- `hourWindowStart(epochMs)`: start of the clock hour containing a timestamp. Used to deduplicate Slack alerts per hour.

### `src/services/senders.ts`

- `listSenders()`: all sender rows.
- `getSender(id)`: one sender or undefined.
- `ensureSenders(count)`: creates Ethereal test accounts until `count` exist.
- `ensureSendersSafe()`: same, but logs a warning instead of throwing when Ethereal is unreachable, so the server still starts.

### `src/services/mailer.ts`

- `transportFor(sender)` (internal): creates and caches one pooled nodemailer transport per sender.
- `sendEmail(email, sender)`: sends the message as plain text from the sender. Sets `Message-ID` to `<emailId@dispatch.local>`. Returns the message id and the Ethereal preview URL.

### `src/services/search.ts`

- `ensureIndex()`: creates the Elasticsearch index with explicit mappings if missing.
- `toDto(row)`: converts a database row (joined with the sender email) to the public shape.
- `indexEmails(rows)`: bulk-indexes rows in chunks of 1000. Logs failures; never throws.
- `syncEmail(id)`: reloads one email from Postgres and re-indexes it. Called after every state change.
- `syncBatch(batchId)`: indexes every email of a batch after scheduling.
- `searchEmails(params)`: filters by user and status, then matches the text against recipient, subject and body with fuzziness, plus a substring match on the recipient. Returns the page and total.
- `elasticsearchHealthy()`: used by the health endpoint.

### `src/services/emails.ts`

The heart of scheduling.

- `scheduleBatch(input)`: described in "Life of one email", steps 3 and 4. Also handles a repeated idempotency key by returning the existing batch after making sure its jobs exist, and handles two simultaneous requests with the same key.
- `listEmails(params)`: returns one tab. Uses Elasticsearch when there is a search term and falls back to Postgres `ILIKE` if it fails. Scheduled sorts by time ascending, sent sorts by time descending.
- `countEmails(userId)`: counts per tab from one grouped query.
- `getEmailForSend(id)`: loads a row for the worker.
- `claimEmail(id)`: the guarded UPDATE that gives one worker ownership. Also allows reclaiming a row stuck in `processing` for over five minutes after a crash.
- `markSent`, `markRetry`, `markFailed`: final state transitions.
- `markDeferred(id, slotAt, reason)`: records that the limiter moved this email, and updates the time shown in the dashboard.
- `reconcileQueue(batchId?)`: pages through every `scheduled` row and re-adds its job. Safe to repeat because adding an existing job id does nothing.

### `src/services/slack.ts`

- `slackConfigured()`: true if both Slack credentials are set.
- `buildAuthorizeUrl(userId)`: builds Slack's authorize URL with a signed ten minute `state` containing the user id.
- `userIdFromState(state)`: verifies the state token and returns the user id.
- `completeOAuth(userId, code)`: exchanges the code with Slack, receives the incoming webhook URL and channel, and stores them.
- `getConnection(userId)`, `disconnect(userId)`: read and delete the stored webhook.
- `postToWebhook(conn, text)` (internal): posts a message. If Slack replies 404 or 410, the webhook was revoked, so the connection is deleted.
- `sendTestMessage(userId)`: posts a test message and returns whether Slack accepted it.
- `notifyRateLimitHit(params)`: posts the limit alert. Does nothing if the user has no connection. Uses a Redis `SET NX` key so one alert is sent per user, sender and hour. Never throws.

### `src/middleware/auth.ts`

- `setSessionCookie(res, userId)`: signs a seven day JWT and sets it as an HTTP-only, SameSite=Lax cookie (secure in production).
- `loadUser(req)`: reads the cookie, verifies it, loads the user.
- `requireAuth`: Express middleware that returns 401 when there is no valid session.

### `src/middleware/errors.ts`

- `HttpError(status, message)`: throw it anywhere to produce a clean JSON error.
- `errorHandler`: turns zod validation errors into 400, `HttpError` into its status, and anything else into a generic 500 while logging the detail.

### `src/schemas.ts`

- `scheduleSchema`: validates the schedule body (subject, body, up to 10,000 valid emails, ISO start time with offset, delay 0 to 86,400 seconds, hourly limit 1 to 100,000).
- `listSchema`: validates the list query (group, page, page size up to 100, search text).

### `src/routes/auth.ts`

- `GET /google`: sets a random state cookie and redirects to Google.
- `GET /google/callback`: checks the state, exchanges the code for a token, fetches the profile, upserts the user, sets the session and redirects to the dashboard.
- `GET /me`, `POST /logout`.

### `src/routes/slack.ts`

- `GET /callback`: public (Slack redirects here), authenticates through the signed state, then redirects back with `?slack=connected|denied|error`.
- After that, all routes need a session: `GET /status`, `GET /connect`, `DELETE /`, `POST /test`.

### `src/routes/emails.ts`

- `POST /schedule`: validates, reads the `Idempotency-Key` header, calls `scheduleBatch`.
- `GET /counts`, `GET /`: tab counts and the paged list.

### `src/workers/emailWorker.ts`

- `processEmail(job, token)`: implements steps 5 to 10 of "Life of one email". Uses `DelayedError` after `moveToDelayed` so BullMQ treats a deferral as neither success nor failure.
- `startEmailWorker()`: creates the BullMQ worker with `WORKER_CONCURRENCY`, attaches logging handlers.

### `src/scripts/seedSenders.ts`

Runs the migration, creates Ethereal accounts up to `ETHEREAL_ACCOUNTS`, and prints each address and password.

### `src/app.ts`

- `createApp()`: builds the Express app. Adds security headers, JSON parsing, cookies, the health route, the three routers, the Bull Board dashboard (behind `requireAuth`), and, if `frontend/dist` exists, serves the built frontend with a fallback to `index.html` so client routes like `/privacy` work on refresh.

### `src/server.ts`

Boot order: migrate, ensure senders, ensure the search index, reconcile the queue, listen.

### `src/worker.ts`

Boot order: migrate, ensure the search index, reconcile the queue, start the worker. On SIGINT or SIGTERM it closes the worker, letting in-flight sends finish.

## 6. Frontend, file by file

All paths are under `frontend/`.

### Root files

- `package.json`: `dev`, `build`, `preview`, `typecheck`.
- `vite.config.ts`: dev server on 5173, proxies `/api` and `/admin` to the backend so the session cookie works on one origin.
- `tailwind.config.js`: the palette (warm paper background, near-black ink, forest green accent), IBM Plex fonts, 4px corner radius. There are no gradients and no fully rounded buttons.
- `postcss.config.js`, `tsconfig.json`: build configuration.
- `index.html`: title, description, favicon, apple touch icon and manifest links. No third-party scripts.
- `.env.example`: company name, contact email and address for the legal pages.
- `public/favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `site.webmanifest`: the site icon set.

### `src/main.tsx`

Mounts React with the router, toast provider and auth provider.

### `src/App.tsx`

Route table: `/` sign-in, `/dashboard`, `/privacy`, `/terms`, and a not-found page.

### `src/index.css`

Loads the fonts from the installed packages (no external font requests), Tailwind layers, a keyboard focus outline, and a reduced-motion rule that disables animation for people who ask for it.

### `src/config/site.ts`

`site`: product name, company name, contact email, address and the legal "last updated" date. Read from `VITE_*` variables.

### `src/api/types.ts`

TypeScript interfaces for every API response and request: `User`, `EmailItem`, `EmailPage`, `EmailCounts`, `ScheduleInput`, `ScheduleResult`, `SlackStatus`.

### `src/api/client.ts`

- `ApiError`: error with an HTTP status.
- `request(path, init)` (internal): fetch wrapper that sends the cookie, parses JSON, and converts error responses into `ApiError` with the server's message.
- `api`: one method per endpoint (`me`, `logout`, `listEmails`, `counts`, `schedule`, `slackStatus`, `slackDisconnect`, `slackTest`).
- `errorText(err)`: safe message for toasts.

### `src/lib/emails.ts`

- `extractEmails(text)`: finds every address with a pattern, lowercases, removes duplicates, and reports how many duplicates were removed. Works for any CSV layout.

### `src/lib/format.ts`

- `formatDateTime(iso)`: locale-aware date and time.
- `toLocalInputValue(date)`: formats a date for the datetime-local input.
- `pluralize(count, singular, plural)`: "1 email", "2 emails".

### `src/hooks/useAuth.tsx`

- `AuthProvider`: asks the server who is signed in once at startup.
- `useAuth()`: returns `user`, `loading`, `logout`.

### `src/hooks/useToast.tsx`

- `ToastProvider`: renders a stack of messages that disappear after six seconds, announced to screen readers.
- `useToast()`: `success`, `error`, `info`.

### `src/hooks/usePolling.ts`

- `usePolling(fetcher, deps, intervalMs)`: fetches immediately and then every 5 seconds. Shows the loading state only for the first response after inputs change, keeps old data during background refreshes, aborts stale requests, and returns `data`, `loading`, `error`, `reload`.

### `src/hooks/useDebounce.ts`

- `useDebounce(value, delay)`: delays search text so the server is queried after typing pauses.

### `src/components/ui/`

Reusable building blocks with no business logic.

- `Button.tsx`: primary, secondary and danger variants, `loading` state.
- `Field.tsx`: `Input` and `Textarea` with label, hint, error text and ARIA wiring.
- `Modal.tsx`: dialog with Escape to close, focus trap, focus restore and background scroll lock.
- `Badge.tsx`: small status label in four tones.
- `Tabs.tsx`: accessible tab bar with optional counts.
- `DataTable.tsx`: generic table that renders loading, error and empty states.
- `Pagination.tsx`: Previous and Next with a range label.
- `Spinner.tsx`: CSS loading indicator.

### `src/components/`

- `Avatar.tsx`: shows the Google picture, or initials if it is missing or fails to load.
- `Header.tsx`: product name, and when signed in the user's name, email, avatar and a Log out button.
- `Footer.tsx`: company, Privacy Policy, Terms and Conditions, Contact.
- `Layout.tsx`: header, page content, footer.
- `StatusBadge.tsx`: `describeStatus` maps backend state to wording such as "Deferred: hourly limit"; `StatusBadge` renders it.
- `EmailList.tsx`: one component for both tabs. Holds the column definitions, empty copy and polling; `EmailList` renders the table and pagination.
- `SlackPanel.tsx`: shows Slack state and offers Connect Slack, Send test message and Disconnect.
- `ComposeModal.tsx`: the compose form. Handles file upload and counting, validation, the idempotency key, submission, and messages when the server adjusted the delay or limit.
- `LegalPage.tsx`: shared layout for the two legal pages.

### `src/pages/`

- `Login.tsx`: explains what the product does, the Continue with Google link, the three-step description, links to the legal pages. Redirects to the dashboard if already signed in.
- `Dashboard.tsx`: title, Compose New Email button, Slack panel, tabs with live counts, search box and the list. Shows a toast after Slack redirects back.
- `Privacy.tsx`, `Terms.tsx`: the policy texts. Edit the `sections` arrays to change wording.
- `NotFound.tsx`: unknown address.

## 7. Where to change common things

| I want to | Change |
| --- | --- |
| Raise or lower the hourly ceiling | `MAX_EMAILS_PER_HOUR_PER_SENDER` in `backend/.env` |
| Change the minimum gap between sends | `MIN_DELAY_BETWEEN_EMAILS_MS` |
| Run more sends in parallel | `WORKER_CONCURRENCY`, or start more worker processes |
| Add more sender accounts | Raise `ETHEREAL_ACCOUNTS`, run `npm run seed:senders` |
| Change colours or fonts | `frontend/tailwind.config.js` |
| Edit legal wording | `frontend/src/pages/Privacy.tsx` and `Terms.tsx` |
| Change company details on the legal pages | `frontend/.env`, then rebuild |
| Change retry behaviour | `MAX_ATTEMPTS`, and the `backoff` setting in `queue/queue.ts` |

Build a full-stack web app called **NEXUS** — a WhatsApp bulk messaging platform. AWS/Docker ready.

---

## TECH STACK
- **Backend:** Node.js + Express + TypeScript, whatsapp-web.js, Prisma + PostgreSQL (SQLite dev fallback), Bull + Redis, Socket.IO, Winston
- **Frontend:** React + TypeScript + Vite, Tailwind CSS + tailwindcss-rtl, Framer Motion, Zustand, TanStack Query v5, react-i18next
- **Deploy:** Docker + docker-compose, Nginx reverse proxy, Let's Encrypt SSL, AWS EC2 (t3.medium min)

---

## PROJECT STRUCTURE
```
nexus/
├── backend/src/
│   ├── controllers/
│   ├── services/         # whatsapp, contact, list, campaign, status, grammar, media, toneTransformers
│   ├── queues/           # message.queue.ts, statusScheduler.queue.ts
│   ├── middleware/        # auth, upload (Multer), rateLimit
│   ├── routes/
│   └── prisma/
├── frontend/src/
│   ├── pages/            # Login, Dashboard, Connect, Contacts, Lists, Campaigns, Status, Settings
│   ├── components/       # shared components
│   ├── locales/          # tr/, en/, ar/ translation.json
│   └── utils/            # toneTransformers.ts
├── docker-compose.yml
├── docker-compose.prod.yml
└── nginx/nginx.conf
```

---

## PRISMA SCHEMA — All Models
```
User               id, email, password(bcrypt), name, createdAt
RefreshToken       id, token, userId, expiresAt
WhatsAppSession    id, userId, sessionData(AES-256 encrypted), status, connectedAt
Contact            id, waId, name, pushName, isGroup, profilePicUrl, isMyContact, lastSeen, userId
List               id, name, description, userId
ListContact        listId, contactId (join table)
Campaign           id, name, message, mediaUrl, mediaType, status(DRAFT|QUEUED|RUNNING|PAUSED|COMPLETED|FAILED),
                   targetType(LIST|MANUAL), targetListId, minDelay(2000), maxDelay(4000),
                   sentCount, failedCount, totalCount, scheduledAt, startedAt, completedAt, userId
CampaignContact    id, campaignId, contactId, status, sentAt, error
StatusPost         id, userId, content, mediaUrl, mediaType, backgroundColor,
                   status(DRAFT|SCHEDULED|PUBLISHED|FAILED), publishedAt, scheduledAt
StatusSchedule     id, userId, statusPostId(FK), frequency(ONCE|DAILY|WEEKLY|CUSTOM_INTERVAL),
                   intervalMinutes, startAt, endAt, lastRunAt, nextRunAt, isActive
```

---

## WHATSAPP INTEGRATION
Each user gets their own whatsapp-web.js session (multi-session). Sessions saved to `./sessions/{userId}/` encrypted with AES-256.

**Session flow:** Login → /connect page → QR via Socket.IO → scan → `whatsapp:ready` event → redirect dashboard. Auto-reconnect with exponential backoff (max 5 retries).

**Endpoints:**
```
POST   /api/whatsapp/init          → Start session, stream QR
GET    /api/whatsapp/status        → DISCONNECTED | QR_READY | CONNECTED
DELETE /api/whatsapp/disconnect
GET    /api/contacts/sync          → Fetch all WA contacts, upsert DB
GET    /api/contacts               → Paginated (filter: all/saved/unsaved)
GET    /api/groups                 → User's WA groups
```

**Puppeteer setup:** node:20-alpine + Chromium deps, `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`

---

## CONTACT LISTS
```
POST   /api/lists
GET    /api/lists
GET    /api/lists/:id
PATCH  /api/lists/:id
DELETE /api/lists/:id
POST   /api/lists/:id/members      → Add contacts/groups
DELETE /api/lists/:id/members      → Remove members
```

---

## MEDIA ATTACHMENTS
- Types: image/jpeg, image/png, image/webp, video/mp4 — max 16MB
- **Multer** for upload, **MediaService** abstracts local (`./uploads/{userId}/{campaignId}/`) vs S3 via `STORAGE_DRIVER=local|s3`
- Queue sends: image/video → `new MessageMedia(mimetype, base64, filename)`, no media → plain `sendMessage`
- Campaign model has `mediaUrl`, `mediaType` fields
- Campaign list cards show 📎 badge if media attached

---

## CAMPAIGN / BULK MESSAGING ENGINE
```
POST   /api/campaigns              → multipart/form-data
GET    /api/campaigns
GET    /api/campaigns/:id
POST   /api/campaigns/:id/start
POST   /api/campaigns/:id/pause
POST   /api/campaigns/:id/resume
DELETE /api/campaigns/:id
GET    /api/campaigns/:id/media    → signed URL / stream
```

**Bull queue logic:** Each recipient = 1 job. Random delay `Math.random()*(maxDelay-minDelay)+minDelay` ms between jobs. Retry 3x on failure (10s delay), then mark FAILED. Emit `campaign:progress { campaignId, sent, failed, total, percent, currentRecipient }` via Socket.IO.

**Anti-spam:** Max 200 msgs/campaign, max 1 running campaign/user, warn if list >100. Optional invisible unicode variation selectors toggle.

---

## WHATSAPP STATUS PUBLISHER
```
POST   /api/status/posts
GET    /api/status/posts
DELETE /api/status/posts/:id
POST   /api/status/posts/:id/publish  → immediate
POST   /api/status/schedules          → { statusPostId, frequency, intervalMinutes, startAt, endAt }
GET    /api/status/schedules
PATCH  /api/status/schedules/:id      → toggle isActive, update interval
DELETE /api/status/schedules/:id
```

**Publish logic:** Text → `client.setStatus(text)` (139 char limit). Media → `client.sendMessage('status@broadcast', media, {caption})`. Add UI warning about WA privacy settings.

**Scheduler (Bull cron):** Checks every minute, enforces 30-min minimum between auto-posts, emits `status:published`. Calculates `nextRunAt` from frequency/intervalMinutes.

---

## AUTHENTICATION & SECURITY
- JWT access (15min) + refresh (7d) in httpOnly cookies
- bcrypt salt 12, Helmet.js, Zod validation on all routes
- Rate limits: auth 10/15min, API 100/min, campaign start 5/hr, grammar 60/min
- CORS via `ALLOWED_ORIGINS` env var

---

## i18n — Turkish 🇹🇷 | English 🇬🇧 | Arabic 🇸🇦
Library: `react-i18next` + `i18next-browser-languagedetector`. Persisted in `localStorage('nexus_lang')`, default `tr`.

**Arabic RTL:** `document.documentElement.dir='rtl'`, font "Cairo" (Google Fonts) via `[lang="ar"]`. Use `tailwindcss-rtl` plugin. Sidebar flips right, chevrons `scaleX(-1)`, Framer Motion slide directions reversed.

**`<LanguageSwitcher />`** in Sidebar footer: 🇹🇷 Türkçe | 🇬🇧 English | 🇸🇦 العربية — animated dropdown, instant switch.

**Translation keys to implement in all 3 locale files:**
`nav`, `dashboard.stats`, `campaigns.status`, `campaigns.form`, `status.compose`, `status.schedule`, `status.frequencies`, `contacts`, `lists`, `settings`, `auth`, `grammar.types`, `tone`, `common`, `errors`

---

## GRAMMAR CHECKER (No AI — fully local)
Packages: `nspell` + `wordlist-english` (backend only)

```
POST /api/grammar/check
Body:     { text: string, language: "tr"|"en"|"ar" }
Response: { issues: [{ type, word, offset, length, suggestions[], message }] }
```

**Rules:**

| Scope | Rules |
|---|---|
| All languages | Double spaces, repeated words, excessive punctuation (!!!), ALL CAPS words, missing space after . or ,, missing sentence-end punctuation |
| English | nspell misspellings (top 5 suggestions), your/you're its/it's their/there, common typos map |
| Turkish | 100+ hardcoded common typo dict, missing chars (ı ü ö ğ ş ç detection) |
| Arabic | Letter confusion patterns, mixed Arabic+Latin in same word |

**`<GrammarChecker />`** component: Debounced 800ms, transparent overlay with underlines (red=error, yellow=style), issue count badge, collapsible panel with [✓ Apply] [✗ Ignore] per issue. Auto language from i18n. Used in Campaign composer + Status composer.

---

## TONE ADJUSTER (No AI — pure functions)
Appears (slide-up, Framer Motion) below textarea when text >20 chars.

Implement in `frontend/src/utils/toneTransformers.ts` AND `backend/src/utils/toneTransformers.ts` as pure functions:

**1. 📢 FORMAL** — Expand contractions (50+ map: don't→do not, can't→cannot, I'm→I am…), replace slang (btw→by the way, asap→as soon as possible, wanna→want to, gonna→going to), replace casual openers (hey/hi→Hello), capitalize sentences, remove excessive punctuation.

**2. 😊 FRIENDLY** — Collapse to contractions (do not→don't), replace formal openers (Dear Sir→Hey!), soften imperatives (Send me→Could you send me), replace however→but / therefore→so / regarding→about, append 😊 if no closer.

**3. ⚡ URGENT** — Prefix "URGENT: ", append "⚠️ Time-sensitive — please respond today.", uppercase action words (REVIEW CONFIRM SEND CALL APPROVE), replace ? with ?! in urgent sentences, add 🚨 emoji if none.

**4. 🤝 PERSUASIVE** — Replace buy→get / cost→investment / you should→you'll want to, add social proof opener, append CTA "Don't miss out — reach out today! 👇" if none, replace passive constructions.

**5. 💎 PROFESSIONAL** — Apply FORMAL rules + replace I think→I believe / I want→I would like, replace emoji with text (😊→"" 👍→"Noted."), add "Best regards," sign-off if missing.

**`<ToneAdjuster />`** component: 5 icon+label buttons (i18n translated), on click: apply transform instantly, store prev in `useRef`, show "Undo" for 5s. Changed words flash yellow (`tone-changed` keyframe fades 1.5s). Show "N adjustments made • Undo" count.

---

## FRONTEND DESIGN
**Dark, premium, Linear.app aesthetic.**

CSS variables: `--bg-primary:#0A0A0F`, `--bg-secondary:#111118`, `--bg-card:#16161F`, `--border:#1E1E2E`, `--accent:#6C63FF`, `--accent-glow:rgba(108,99,255,0.15)`, `--success:#22C55E`, `--warning:#F59E0B`, `--danger:#EF4444`, `--text-primary:#F0F0FF`, `--text-muted:#6B6B8A`

Fonts: Display "Syne", Body "DM Sans", Arabic "Cairo", Mono "JetBrains Mono"

**Pages:** Login · Dashboard (stats row, WA status badge, recent campaigns, activity feed) · Connect (QR pulse animation, steps, confetti on success) · Contacts (tabs: All/Contacts/Groups, react-window virtualized list, multi-select → Add to List) · Lists (grid cards, New List modal, detail drawer) · Campaigns (tab bar, full-page form with all sub-components, detail with live progress + per-recipient log + CSV export) · Status (two-column: compose left, schedules+history right) · Settings

**Shared components:** `<Sidebar />` (collapsible, LanguageSwitcher at bottom) · `<StatusBadge />` · `<EmptyState />` · `<ConfirmModal />` · `<Toast />` · `<ProgressRing />` · `<GrammarChecker />` · `<ToneAdjuster />` · `<MediaUploadZone />` (drag-drop, thumbnail preview, progress bar, shared by Campaigns + Status)

---

## SOCKET.IO EVENTS
```
Namespace /whatsapp:  whatsapp:qr {base64}, whatsapp:ready {phone,name,pic}, whatsapp:disconnected {reason}
Namespace /campaigns: campaign:progress {campaignId,sent,failed,total,percent,currentName}, campaign:completed, campaign:error
Namespace /status:    status:published {scheduleId,publishedAt}
```

---

## .env.example
```
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173
DATABASE_URL=postgresql://user:pass@localhost:5432/nexus
JWT_ACCESS_SECRET=min_32_chars
JWT_REFRESH_SECRET=min_32_chars
SESSION_ENCRYPTION_KEY=32_hex_chars   # openssl rand -hex 32
REDIS_URL=redis://localhost:6379
STORAGE_DRIVER=local
UPLOADS_DIR=./uploads
MAX_MEDIA_SIZE_MB=16
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=eu-west-1
S3_BUCKET_NAME=nexus-media
S3_SIGNED_URL_EXPIRES=3600
STATUS_MIN_INTERVAL_MINUTES=30
```

---

## DOCKER & DEPLOYMENT
- **docker-compose.yml (dev):** services: backend, frontend, postgres, redis. Volumes: postgres_data, redis_data, ./sessions, ./uploads
- **docker-compose.prod.yml:** + nginx + certbot (Let's Encrypt). EBS persistent volumes for sessions/uploads.
- **nginx.conf:** Proxy `/api/*` and `/socket.io/*` → backend:3001 (WebSocket upgrade headers), serve frontend static, SSL termination, gzip on.
- **AWS EC2:** t3.medium min. Security Group: ports 22, 80, 443.

---

## PACKAGES
**Backend:** express typescript ts-node prisma @prisma/client whatsapp-web.js qrcode socket.io bull ioredis jsonwebtoken bcrypt helmet cors express-rate-limit zod multer @aws-sdk/client-s3 winston morgan nspell wordlist-english dotenv uuid

**Frontend:** react react-dom typescript vite tailwindcss tailwindcss-rtl framer-motion zustand axios @tanstack/react-query react-i18next i18next i18next-browser-languagedetector socket.io-client react-window react-router-dom react-dropzone react-datepicker emoji-mart canvas-confetti react-hot-toast

**Dev:** eslint prettier husky jest vitest @types/*

---

## ADDITIONAL
- Global Express error handler: `{ success: false, error: { code, message } }`
- React Error Boundary on each page
- Winston logging (console dev / file prod)
- Jest unit tests for queue logic, grammar rules, all 5 tone transformers
- ESLint + Prettier + Husky pre-commit hooks, TypeScript strict mode
- README with ASCII architecture diagram, local setup, AWS deploy guide, env docs

---

## BUILD ORDER
1. Monorepo init + install packages
2. Prisma schema → migrate
3. Auth system (JWT, bcrypt, refresh tokens)
4. WhatsApp service (session, QR, sync)
5. Media service (Multer + S3 abstraction)
6. Campaign queue (Bull, delays, Socket.IO progress)
7. Status service + scheduler queue
8. Grammar service (nspell + rule-based)
9. Tone transformer utils (both backend + frontend)
10. All Express routes + Zod validation
11. Socket.IO namespaces
12. i18n setup + all 3 translation JSON files (tr/en/ar)
13. Zustand stores + React Query
14. Shared components (Sidebar, Toast, Modal, ProgressRing)
15. GrammarChecker + ToneAdjuster + MediaUploadZone + LanguageSwitcher
16. All pages (Login → Dashboard → Connect → Contacts → Lists → Campaigns → Status → Settings)
17. Docker files + nginx.conf
18. Tests + README

**Generate ALL files completely. Do not stub, skip, or summarize any file. Every component, service, route, translation key, and config must be fully implemented.**

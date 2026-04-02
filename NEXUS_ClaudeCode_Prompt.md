# NEXUS — Claude Code Full Build Prompt
> Copy everything below this line and paste it directly into Claude Code.

---

```
Build a full-stack web application called "NEXUS" — a WhatsApp bulk messaging
platform with status publishing, grammar checking, and tone adjustment.
Deploy-ready for AWS (EC2 + optional RDS). Below is the complete specification.

═══════════════════════════════════════════
## TECH STACK
═══════════════════════════════════════════
Backend:  Node.js + Express + TypeScript
WA Layer: whatsapp-web.js (Puppeteer-based, headless Chrome)
Database: PostgreSQL (via Prisma ORM) — use SQLite for local dev fallback
Auth:     JWT (access + refresh tokens), bcrypt password hashing
Queue:    Bull + Redis — for message scheduling & delay management
Frontend: React + TypeScript + Vite
Styling:  Tailwind CSS + Framer Motion
State:    Zustand
HTTP:     Axios + React Query (TanStack Query v5)
Deploy:   Docker + docker-compose (AWS EC2 ready)

═══════════════════════════════════════════
## PROJECT STRUCTURE
═══════════════════════════════════════════
nexus/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── services/
│   │   │   ├── whatsapp.service.ts
│   │   │   ├── contact.service.ts
│   │   │   ├── list.service.ts
│   │   │   ├── campaign.service.ts
│   │   │   ├── status.service.ts
│   │   │   ├── grammar.service.ts
│   │   │   ├── media.service.ts
│   │   │   └── toneTransformers.ts
│   │   ├── queues/
│   │   │   ├── message.queue.ts
│   │   │   └── statusScheduler.queue.ts
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts
│   │   │   ├── upload.middleware.ts
│   │   │   └── rateLimit.middleware.ts
│   │   ├── routes/
│   │   ├── prisma/
│   │   └── utils/
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Contacts.tsx
│   │   │   ├── Lists.tsx
│   │   │   ├── Campaigns.tsx
│   │   │   ├── Status.tsx
│   │   │   └── Settings.tsx
│   │   ├── components/
│   │   ├── locales/
│   │   │   ├── tr/translation.json
│   │   │   ├── en/translation.json
│   │   │   └── ar/translation.json
│   │   ├── utils/
│   │   │   └── toneTransformers.ts
│   │   ├── stores/
│   │   └── hooks/
├── docker-compose.yml
├── docker-compose.prod.yml
└── nginx/
    └── nginx.conf

═══════════════════════════════════════════
## WHATSAPP INTEGRATION (whatsapp-web.js)
═══════════════════════════════════════════
Each registered user gets their OWN WhatsApp session (multi-session support).

Session lifecycle:
1. User registers/logs in to NEXUS
2. User navigates to "Connect WhatsApp" page
3. Backend generates a QR code via whatsapp-web.js
4. Frontend displays QR in real-time using Socket.IO
5. User scans QR with their phone
6. On successful auth: session saved to ./sessions/{userId}/
7. WebSocket emits "whatsapp:ready" event → frontend updates status to ✅ Connected
8. On disconnect: auto-reconnect with exponential backoff (max 5 retries)

Session management endpoints:
POST   /api/whatsapp/init          → Start session, return QR stream
GET    /api/whatsapp/status        → DISCONNECTED | QR_READY | CONNECTED
DELETE /api/whatsapp/disconnect    → Logout & destroy session
GET    /api/whatsapp/qr            → Get current QR as base64 PNG

Contact sync:
GET    /api/contacts/sync          → Fetch all contacts from WA, upsert to DB
GET    /api/contacts               → Paginated list (filter: all/saved/unsaved)
GET    /api/groups                 → All WA groups the user is a member of

Contact model (Prisma):
- id, waId (phone/group id), name, pushName, isGroup
- profilePicUrl, isMyContact, lastSeen
- userId (FK), createdAt, updatedAt

═══════════════════════════════════════════
## CONTACT LISTS
═══════════════════════════════════════════
Users create named lists mixing contacts + groups freely.

List endpoints:
POST   /api/lists              → Create list {name, description, contactIds[]}
GET    /api/lists              → All lists with member count
GET    /api/lists/:id          → List details + members
PATCH  /api/lists/:id          → Update name/description/members
DELETE /api/lists/:id
POST   /api/lists/:id/members  → Add contacts/groups to list
DELETE /api/lists/:id/members  → Remove from list

═══════════════════════════════════════════
## MEDIA ATTACHMENTS IN BULK CAMPAIGNS
═══════════════════════════════════════════
Users can attach ONE media file per campaign (image or video).
Supported types: image/jpeg, image/png, image/webp, video/mp4
Max file size: 16MB (WhatsApp limit)

Backend:
- Add Multer middleware for multipart/form-data on campaign creation
- Store uploaded files in ./uploads/{userId}/{campaignId}/ locally (dev)
  or AWS S3 (prod) — use a MediaStorage service that abstracts both,
  switching via STORAGE_DRIVER env var ("local" | "s3")
- Add mediaUrl and mediaType fields to Campaign Prisma model
- In message.queue.ts: detect mediaType and call correct method:
    • image → client.sendMessage(chatId, new MessageMedia(mimetype, base64, filename))
    • video → same, but with sendVideoAsGif: false in options
    • if no media → plain text sendMessage as before
- Add GET /api/campaigns/:id/media → stream / signed URL for preview
- Add DELETE to clean up media files when campaign is deleted

Frontend:
- In the New Campaign form, add a drag-and-drop media upload zone
  below the message textarea:
  • Dashed border dropzone with upload icon
  • On file select: show thumbnail (image) or video player (video)
    with file name + size
  • "Remove" × button on the preview
  • Animated upload progress bar (XHR with onUploadProgress)
  • Show friendly error for unsupported types or oversized files
- In Campaign detail page: show the attached media in the header area
- In campaign list cards: add a 📎 icon badge if campaign has media

═══════════════════════════════════════════
## CAMPAIGN / BULK MESSAGING ENGINE
═══════════════════════════════════════════
Campaign model:
- id, name, message (text), mediaUrl (optional), mediaType (optional)
- status: DRAFT | QUEUED | RUNNING | PAUSED | COMPLETED | FAILED
- targetType: LIST | MANUAL_SELECTION
- targetListId / targetContactIds[]
- minDelay (default 2000ms), maxDelay (default 4000ms)
- sentCount, failedCount, totalCount
- scheduledAt (optional), startedAt, completedAt

Campaign endpoints:
POST   /api/campaigns              → Create campaign (multipart/form-data)
GET    /api/campaigns              → All campaigns with stats
GET    /api/campaigns/:id          → Campaign detail + per-message logs
POST   /api/campaigns/:id/start    → Enqueue campaign
POST   /api/campaigns/:id/pause    → Pause mid-run
POST   /api/campaigns/:id/resume   → Resume paused
DELETE /api/campaigns/:id

Message Queue logic (Bull):
- Each recipient = one job in the queue
- Between each job: random delay between minDelay and maxDelay ms
  (Math.random() * (maxDelay - minDelay) + minDelay)
- On job success: update MessageLog status to SENT
- On job failure: retry up to 3x with 10s delay, then mark FAILED
- Emit real-time progress via Socket.IO:
  { campaignId, sent, failed, total, percent, currentRecipient }

Anti-spam safeguards:
- Hard cap: max 200 messages per campaign run
- Hard cap: max 1 campaign running per user at a time
- Warn user if list > 100 recipients
- Option to randomize message slightly (invisible unicode variation
  selectors) — configurable toggle per campaign

═══════════════════════════════════════════
## WHATSAPP STATUS (STORY) PUBLISHER
═══════════════════════════════════════════
Users can publish WhatsApp Status updates — text, image, or video —
either immediately or on a recurring/scheduled basis.

Data model (new Prisma models):
  StatusPost:
    id, userId, content (text), mediaUrl, mediaType,
    backgroundColor (hex, for text statuses),
    status: DRAFT | SCHEDULED | PUBLISHED | FAILED,
    publishedAt, scheduledAt, createdAt

  StatusSchedule (for recurring auto-posts):
    id, userId, statusPostId (template FK),
    frequency: ONCE | DAILY | WEEKLY | CUSTOM_INTERVAL,
    intervalMinutes (for CUSTOM_INTERVAL),
    startAt, endAt (optional), lastRunAt, nextRunAt,
    isActive (boolean)

Backend endpoints:
POST   /api/status/posts              → Create status post
GET    /api/status/posts              → All posts with status
DELETE /api/status/posts/:id
POST   /api/status/posts/:id/publish  → Publish immediately
POST   /api/status/schedules          → Create recurring schedule
GET    /api/status/schedules          → List active schedules
PATCH  /api/status/schedules/:id      → Toggle active, update interval
DELETE /api/status/schedules/:id

WhatsApp publishing logic (whatsapp.service.ts):
  async publishStatus(userId, post):
    • Text only:   client.setStatus(text)  [139 char WA limit]
    • With media:  client.sendMessage('status@broadcast', media,
                     { caption: post.content })
  Add UI warning that WA Status privacy must be set to "My Contacts"+

Scheduling engine (Bull cron jobs):
  - statusScheduler queue: checks every minute for due StatusSchedules
  - On trigger: clone template StatusPost, publish it, update
    lastRunAt + calculate nextRunAt based on frequency/intervalMinutes
  - Emit Socket.IO event: status:published { scheduleId, publishedAt }
  - Enforce minimum 30-minute interval between auto-posts
  - Warn user in UI if interval is set below 30 minutes

Frontend — new page /status (two-column layout):
  LEFT PANEL — "Compose Status":
    • Toggle: Text Status / Media Status
    • Text mode:
        - Large textarea (139 char counter, color warning at 120+)
        - Color palette (8 preset background colors as circular swatches)
        - Live preview updates as user types
    • Media mode:
        - Same drag-drop upload component as campaigns
        - Caption field
    • Publish options:
        ○ "Publish Now" primary button
        ○ "Schedule" → opens scheduling drawer:
            - Frequency selector: Once / Daily / Weekly / Every N minutes
            - Date+time picker for start date
            - Optional end date
            - "Activate Schedule" button

  RIGHT PANEL — "Schedules & History":
    • Active Schedules:
        - frequency badge, next run countdown timer (useInterval hook),
          pause/resume toggle, delete button
    • Published History table:
        - Post preview, published time, type badge, status badge
        - Sorted by most recent

═══════════════════════════════════════════
## AUTHENTICATION & SECURITY
═══════════════════════════════════════════
- JWT access token (15min) + refresh token (7 days) in httpOnly cookies
- Passwords: bcrypt with salt rounds 12
- Rate limiting:
    • Auth routes:      10 req / 15min per IP
    • API routes:       100 req / min per user
    • Campaign start:   5 req / hour per user
    • Grammar check:    60 req / min per user
- Helmet.js for HTTP security headers
- CORS: configurable via .env ALLOWED_ORIGINS
- Input validation: Zod schemas on all routes
- SQL injection: fully prevented by Prisma
- Session files encrypted at rest (AES-256 via crypto module)
  key stored in .env as SESSION_ENCRYPTION_KEY

═══════════════════════════════════════════
## INTERNATIONALIZATION (i18n)
   Languages: Turkish 🇹🇷 | English 🇬🇧 | Arabic 🇸🇦
═══════════════════════════════════════════
Library: react-i18next + i18next + i18next-browser-languagedetector

File structure:
  frontend/src/locales/
    tr/translation.json    (Turkish — default)
    en/translation.json    (English)
    ar/translation.json    (Arabic — RTL)

Configuration:
  - Detect language from localStorage key "nexus_lang", fallback "tr"
  - On Arabic: document.documentElement.dir = "rtl", lang = "ar"
  - On TR/EN:  document.documentElement.dir = "ltr"
  - Persist selection in localStorage

Translation coverage — translate EVERY user-facing string:
  All nav labels, page titles, button text, form labels, placeholders,
  error messages, success toasts, empty states, modal titles, table
  headers, status badge labels, tooltips, onboarding/QR instructions

RTL-specific CSS:
  - Sidebar: positioned right instead of left
  - Directional icons (chevrons): scaleX(-1) where needed
  - Text alignment: right
  - Use logical CSS properties (padding-inline-start, etc.)
  - Framer Motion slide animations: reverse X direction in RTL
  Use tailwindcss-rtl plugin OR [dir="rtl"] selectors — pick one, be consistent.

<LanguageSwitcher /> component:
  - Compact flag+label dropdown in Sidebar footer (above user avatar)
  - Shows: 🇹🇷 Türkçe | 🇬🇧 English | 🇸🇦 العربية
  - Animated dropdown, instant switch with no page reload
  - Selected language highlighted with accent color

Arabic font:
  Import "Cairo" from Google Fonts.
  Apply: [lang="ar"] { font-family: 'Cairo', sans-serif; }
  Keep Syne/DM Sans for TR and EN.

Full translation JSON keys to implement (create all three files):
  {
    "nav":       { "dashboard", "contacts", "lists", "campaigns",
                   "status", "settings", "connect" },
    "dashboard": { "title", "stats": { "contacts", "lists",
                   "campaignsSent", "successRate" }, "recentCampaigns",
                   "activityFeed" },
    "campaigns": { "new", "title", "status": { "draft", "queued",
                   "running", "paused", "completed", "failed" },
                   "form": { "name", "target", "message", "media",
                   "delay", "antiSpam", "schedule" } },
    "status":    { "compose", "schedule", "history", "publishNow",
                   "frequencies": { "once", "daily", "weekly", "custom" } },
    "contacts":  { "title", "sync", "tabs": { "all", "contacts", "groups" } },
    "lists":     { "title", "new", "members", "lastUsed" },
    "settings":  { "profile", "whatsapp", "notifications", "dangerZone" },
    "auth":      { "login", "logout", "email", "password", "connect" },
    "grammar":   { "check", "issues", "noIssues", "apply", "ignore",
                   "types": { "spelling", "style", "punctuation", "repetition" } },
    "tone":      { "adjust", "formal", "friendly", "urgent",
                   "persuasive", "professional", "adjustments", "undo" },
    "common":    { "save", "cancel", "delete", "confirm", "loading",
                   "error", "success", "empty", "search", "filter",
                   "export", "upload", "remove", "pause", "resume" },
    "errors":    { "required", "maxSize", "unsupportedType",
                   "sessionExpired", "whatsappDisconnected" }
  }

═══════════════════════════════════════════
## SERVER-SIDE GRAMMAR CHECKER
   (No AI / No external API — fully local)
═══════════════════════════════════════════
Packages: nspell + wordlist-english (backend only)

Endpoint:
  POST /api/grammar/check
  Body:     { text: string, language: "tr" | "en" | "ar" }
  Response: {
    issues: Array<{
      type: "spelling" | "style" | "punctuation" | "repetition",
      word: string,
      offset: number,       ← character index in original text
      length: number,
      suggestions: string[],
      message: string       ← localized description
    }>
  }

Grammar rules engine (grammar.service.ts):

  UNIVERSAL rules (all languages):
    ✓ Double/triple spaces → suggest single space
    ✓ Repeated consecutive words ("the the") → flag repetition
    ✓ Excessive punctuation (!!!  ???  ...) → style warning
    ✓ ALL CAPS word (non-acronym, >3 chars) → style warning
    ✓ Missing space after comma or period
    ✓ Leading/trailing whitespace in sentences
    ✓ Sentence doesn't end with . ! ?

  ENGLISH-specific (nspell):
    ✓ Misspelled words → top 5 suggestions from nspell
    ✓ Common contraction errors (your/you're, its/it's,
      their/there/they're) — hardcoded pattern list
    ✓ Common typos map (teh→the, recieve→receive, etc.)

  TURKISH-specific (rule-based only):
    ✓ Common typos dict (100+ common TR mistakes hardcoded)
    ✓ Double letters pattern list (merhba→merhaba)
    ✓ Missing Turkish chars detection
      (i→ı, u→ü, o→ö, g→ğ, s→ş, c→ç when word looks like mangled TR)

  ARABIC-specific (rule-based only):
    ✓ Common letter confusion patterns
    ✓ Mixed Arabic+Latin characters in same word
    ✓ Missing Tashkeel (flag as info only)

Frontend — <GrammarChecker /> component:
  - Wraps the message textarea in Campaign composer + Status composer
  - Debounced check: fires 800ms after user stops typing
  - Checking state: subtle spinning indicator on textarea border
  - Issue underlines via transparent overlay div (same font/size,
    absolutely positioned): red for errors, yellow for style warnings
  - Issue count badge below textarea:
      "3 issues found" (red) | "✓ No issues" (green)
  - Collapsible issues panel below textarea:
      Each issue card:
        [TYPE BADGE] "word" → suggestion1, suggestion2, suggestion3
        Short message description
        [✓ Apply] — auto-replaces in textarea
        [✗ Ignore] — dismisses issue
  - "Check Grammar" manual trigger button
  - Language auto-matched to current UI language (i18n)
  - Rate limit: 60 req/min per user (backend enforced)

═══════════════════════════════════════════
## MESSAGE TONE ADJUSTER
   (No AI — rule-based text transformation)
═══════════════════════════════════════════
Appears below the message textarea once text length > 20 chars.
Animated slide-up entrance (Framer Motion).
Works in BOTH Campaign composer AND Status composer.

Available tone presets — implement as pure deterministic functions:

  1. 📢 FORMAL
     - Replace contractions → full forms (50+ pairs hardcoded map):
       don't→do not, can't→cannot, won't→will not, I'm→I am,
       I've→I have, I'll→I will, I'd→I would, it's→it is,
       they're→they are, we're→we are, you're→you are,
       hasn't→has not, haven't→have not, wasn't→was not, etc.
     - Replace casual openers (hey/hi/yo) → "Dear" / "Hello"
     - Add "Dear [recipient]," prefix if no greeting detected
     - Replace wanna→want to, gonna→going to, gotta→have to
     - Replace slang: btw→by the way, asap→as soon as possible,
       fyi→for your information, tbh→to be honest, lol→(remove),
       omg→(remove), ngl→not going to lie
     - Add period to sentences lacking ending punctuation
     - Remove excessive punctuation (!!→!, ???→?)
     - Capitalize first letter of each sentence

  2. 😊 FRIENDLY
     - Replace formal openers ("Dear Sir"/"To whom it may concern")
       → "Hey!" / "Hi there!"
     - Replace however→but, therefore→so, consequently→so,
       regarding→about, furthermore→also, nevertheless→still
     - Expand to contractions (do not→don't, cannot→can't)
     - Soften imperatives: "Send me"→"Could you send me"
     - Replace I require→I need, I request→I'd like,
       I am writing to inform you→(remove phrase)
     - Add friendly closer if text ends without one → append "😊"
     - Remove overly formal sign-offs, replace with "Talk soon!"

  3. ⚡ URGENT
     - Add "URGENT: " prefix if not present
     - Replace please respond→please respond IMMEDIATELY
     - Replace when you can→as soon as possible
     - Replace if possible→immediately
     - Append "⚠️ Time-sensitive — please respond today." if no
       urgency phrase exists
     - Uppercase key action words: REVIEW, CONFIRM, SEND, CALL,
       APPROVE, SIGN, COMPLETE (detect and uppercase them)
     - Replace single ? with ?! in urgent-context sentences
     - Add 🚨 emoji at start if no emoji present

  4. 🤝 PERSUASIVE
     - Add social proof opener if none:
       "Many of our clients have found that..."
     - Replace you should→you'll want to,
       you need to→you'll benefit from,
       you must→you'll want to
     - Replace buy→get, cost→investment, price→value, cheap→affordable
     - Replace passive constructions where detectable:
       it can be seen→you can see, it is known→we know,
       it has been found→we've found
     - Add benefit framing: prepend "This will help you..."
       if message lacks a benefit statement
     - Append CTA if none: "Don't miss out — reach out today! 👇"

  5. 💎 PROFESSIONAL
     - Apply FORMAL rules first (see above)
     - Replace I think→I believe, I want→I would like,
       I need→I require, I'll→I will
     - Replace casual greetings → "Good day,"
     - Replace emoji with text: 😊→"", 👍→"Noted.", 🙏→"Thank you."
     - Remove double exclamation marks (!!→!)
     - Add professional sign-off if missing:
       "Best regards," or "Kind regards,"
     - Ensure proper sentence capitalization throughout

Implementation files:
  frontend/src/utils/toneTransformers.ts
    - Export: applyFormalTone, applyFriendlyTone, applyUrgentTone,
              applyPersuasiveTone, applyProfessionalTone
    - Each: pure function (text: string) → string
    - Chain rules in sequence, return transformed text
    - Handle edge cases: empty string, text < 10 chars

  backend/src/utils/toneTransformers.ts
    - Mirror of frontend file (same pure functions, server-side use)

<ToneAdjuster /> component:
  - Slide-up entrance animation on appearance
  - Row of 5 tone buttons: icon + translated label
  - On click:
      1. Apply transformation instantly to textarea content
      2. Show "Undo" button for 5 seconds (store prev text in useRef)
      3. Highlight active tone button with accent color + glow
      4. Flash animation on changed words ('tone-changed' CSS class:
         yellow highlight that fades out over 1.5s via keyframes)
  - Below buttons: "12 adjustments made • Undo" in muted text
  - All labels translated via i18n (tr/en/ar)

═══════════════════════════════════════════
## FRONTEND — NEXUS UI/UX
═══════════════════════════════════════════
Design language: Dark-first, premium, minimal but data-rich.
Think Linear.app meets a messaging ops platform.

Color palette (CSS variables):
  --bg-primary:    #0A0A0F
  --bg-secondary:  #111118
  --bg-card:       #16161F
  --border:        #1E1E2E
  --accent:        #6C63FF
  --accent-glow:   rgba(108,99,255,0.15)
  --success:       #22C55E
  --warning:       #F59E0B
  --danger:        #EF4444
  --text-primary:  #F0F0FF
  --text-muted:    #6B6B8A

Typography:
  Display: "Syne" (Google Fonts) — bold, geometric
  Body:    "DM Sans" — clean, readable
  Arabic:  "Cairo" (Google Fonts) — applied via [lang="ar"]
  Mono:    "JetBrains Mono" — for IDs, numbers, timestamps

Animations: Framer Motion throughout
  - Page transitions: fade + slide up (0.3s ease)
  - Card hover: subtle translateY(-2px) + border glow
  - Campaign progress bar: smooth animated width
  - QR code: pulse animation while waiting for scan
  - Toast notifications: slide in from top-right
  - ToneAdjuster: slide-up entrance
  - Tone word changes: yellow highlight fade-out keyframe
  - RTL: reverse X direction on all slide animations

Pages & Components:

1. /login
   Centered card, NEXUS wordmark in Syne font,
   email + password fields, "Connect WhatsApp after login" hint.
   Language switcher visible on login page too.

2. /dashboard
   Top stats row: Total Contacts | Total Lists | Campaigns Sent | Success Rate
   WhatsApp Status badge (CONNECTED ✅ / DISCONNECTED ⚠️) + "Reconnect" CTA
   Recent campaigns table with status badges
   Activity feed (last 10 message events, real-time via Socket.IO)

3. /connect
   Large QR code display with animated pulsing border while pending
   Step-by-step instructions panel (translated via i18n)
   Auto-refreshes QR every 60s
   On successful connect: confetti animation + redirect to dashboard

4. /contacts
   Tab bar: All | Contacts | Groups
   Search + filter bar
   Virtualized list (react-window) for performance with 1000s of entries
   Contact card: avatar (initials fallback), name, phone, group badge
   "Sync Contacts" button with loading spinner
   Multi-select checkboxes → "Add to List" bulk action

5. /lists
   Grid of list cards: name, count, last used date, quick-action buttons
   "New List" modal: name, description, searchable contact picker
   List detail drawer: member table + add/remove actions

6. /campaigns
   Tab bar: All | Draft | Running | Completed
   "New Campaign" full-page form:
     - Campaign name
     - Target: select list OR manually pick contacts
     - Message composer (textarea + emoji picker + char count)
       ↳ <GrammarChecker /> wrapping textarea
       ↳ <ToneAdjuster /> below textarea (appears at 20+ chars)
     - Media upload zone (drag-drop, image/video, 16MB max)
       ↳ Thumbnail preview with remove button
       ↳ Animated upload progress bar
     - Delay settings: dual-handle range slider (2–10s)
     - Anti-spam options toggle (message variation)
     - Schedule toggle (datetime picker for future send)
   Campaign detail page:
     - Attached media shown in header area
     - Real-time progress bar: sent / failed / pending counts
     - Per-recipient log table: name, status, timestamp, error
     - Pause / Resume / Cancel actions
     - Export logs as CSV button

7. /status (two-column layout)
   LEFT — Compose Status:
     • Text / Media toggle
     • Text mode: textarea (139 char counter), 8 color swatches,
       live mobile-style preview card
     • Media mode: drag-drop upload + caption field
     • <GrammarChecker /> on text area
     • <ToneAdjuster /> on text area
     • "Publish Now" + "Schedule" drawer:
         Frequency / date+time / end date / "Activate Schedule"
   RIGHT — Schedules & History:
     • Active schedules: badge, next-run countdown, toggle, delete
     • Published history table: preview, time, type, status

8. /settings
   Profile (name, email, change password)
   WhatsApp session management
   Notification preferences
   Danger zone: Delete account

Shared components:
  <Sidebar />          — collapsible, icon+label nav, NEXUS logo,
                         user avatar + <LanguageSwitcher /> at bottom
  <LanguageSwitcher /> — flag+label dropdown: 🇹🇷 🇬🇧 🇸🇦, instant switch
  <StatusBadge />      — colored pill for campaign/connection status
  <EmptyState />       — illustrated empty states per section
  <ConfirmModal />     — reusable destructive action confirmation
  <Toast />            — top-right notifications (success/error/info)
  <ProgressRing />     — circular progress for campaign stats
  <GrammarChecker />   — wraps any textarea, debounced, overlay underlines
  <ToneAdjuster />     — 5-preset tone toolbar, slide-up, undo support
  <MediaUploadZone />  — shared drag-drop component for campaigns + status

═══════════════════════════════════════════
## REAL-TIME (Socket.IO)
═══════════════════════════════════════════
Namespaces:
  /whatsapp  → QR updates, connection status
  /campaigns → Live campaign progress
  /status    → Status publish events

Events emitted by server:
  whatsapp:qr           { qr: base64String }
  whatsapp:ready        { phone, name, profilePic }
  whatsapp:disconnected { reason }
  campaign:progress     { campaignId, sent, failed, total, percent, currentName }
  campaign:completed    { campaignId, stats }
  campaign:error        { campaignId, error }
  status:published      { scheduleId, publishedAt }

═══════════════════════════════════════════
## DATABASE SCHEMA (Prisma)
═══════════════════════════════════════════
Models (all with userId FK for multi-tenant isolation):
  User              — id, email, password, name, createdAt
  RefreshToken      — id, token, userId, expiresAt
  WhatsAppSession   — id, userId, sessionData (encrypted), status, connectedAt
  Contact           — id, waId, name, pushName, isGroup, profilePicUrl,
                      isMyContact, lastSeen, userId
  List              — id, name, description, userId, createdAt
  ListContact       — id, listId, contactId (join table)
  Campaign          — id, name, message, mediaUrl, mediaType, status,
                      targetType, targetListId, minDelay, maxDelay,
                      sentCount, failedCount, totalCount,
                      scheduledAt, startedAt, completedAt, userId
  CampaignContact   — id, campaignId, contactId, status, sentAt, error
  StatusPost        — id, userId, content, mediaUrl, mediaType,
                      backgroundColor, status, publishedAt, scheduledAt
  StatusSchedule    — id, userId, statusPostId, frequency,
                      intervalMinutes, startAt, endAt,
                      lastRunAt, nextRunAt, isActive

═══════════════════════════════════════════
## PACKAGES TO INSTALL
═══════════════════════════════════════════
Backend:
  express, typescript, ts-node, prisma, @prisma/client,
  whatsapp-web.js, qrcode, socket.io, bull, ioredis,
  jsonwebtoken, bcrypt, helmet, cors, express-rate-limit,
  zod, multer, @aws-sdk/client-s3, winston, morgan,
  nspell, wordlist-english, dotenv, uuid

Frontend:
  react, react-dom, typescript, vite,
  tailwindcss, tailwindcss-rtl, framer-motion,
  zustand, axios, @tanstack/react-query,
  react-i18next, i18next, i18next-browser-languagedetector,
  socket.io-client, react-window, react-router-dom,
  react-dropzone, react-datepicker, emoji-mart,
  canvas-confetti, react-hot-toast

Dev:
  eslint, prettier, husky, jest, vitest, @types/*

═══════════════════════════════════════════
## ENVIRONMENT VARIABLES (.env.example)
═══════════════════════════════════════════
# App
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/nexus

# Auth
JWT_ACCESS_SECRET=change_me_access_secret_min_32_chars
JWT_REFRESH_SECRET=change_me_refresh_secret_min_32_chars
SESSION_ENCRYPTION_KEY=change_me_32_char_hex_key

# Redis
REDIS_URL=redis://localhost:6379

# Media Storage
STORAGE_DRIVER=local
UPLOADS_DIR=./uploads
MAX_MEDIA_SIZE_MB=16

# AWS S3 (if STORAGE_DRIVER=s3)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=eu-west-1
S3_BUCKET_NAME=nexus-media
S3_SIGNED_URL_EXPIRES=3600

# WhatsApp Status
STATUS_MIN_INTERVAL_MINUTES=30

═══════════════════════════════════════════
## DOCKER & AWS DEPLOYMENT
═══════════════════════════════════════════
docker-compose.yml (dev):
  services: backend, frontend, postgres, redis
  volumes: postgres_data, redis_data, ./sessions, ./uploads

docker-compose.prod.yml (AWS EC2):
  services: backend, frontend (nginx), postgres, redis,
            nginx (reverse proxy), certbot (Let's Encrypt SSL)
  - Reverse proxy: /api/* and /socket.io/* → backend:3001
  - Frontend static files served from nginx
  - WebSocket upgrade headers for Socket.IO
  - Sessions + uploads volumes → EBS persistent storage
  - Health checks on all services
  - Gzip compression enabled

Dockerfile.backend:
  - Base: node:20-alpine
  - Install Chromium + all Puppeteer dependencies
  - Set PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
  - Non-root user for security

Dockerfile.frontend:
  - Stage 1: node:20-alpine (build)
  - Stage 2: nginx:alpine (serve)

nginx.conf:
  - Proxy /api/* → backend:3001
  - Proxy /socket.io/* → backend:3001 (with upgrade headers)
  - Serve /usr/share/nginx/html for frontend
  - SSL termination with Let's Encrypt certs
  - Gzip on

AWS EC2 recommended:
  Instance:      t3.medium minimum (2 vCPU, 4GB RAM — Puppeteer needs RAM)
  Storage:       20GB EBS gp3 (root) + separate EBS for sessions/uploads
  Security Group: inbound 22 (SSH), 80 (HTTP), 443 (HTTPS)
  Tip: Generate SESSION_ENCRYPTION_KEY with: openssl rand -hex 32

═══════════════════════════════════════════
## ADDITIONAL REQUIREMENTS
═══════════════════════════════════════════
1. README.md with:
   - Architecture diagram (ASCII)
   - Local dev setup (docker-compose up --build)
   - AWS EC2 deployment guide (step by step)
   - Environment variables documentation
   - Feature list with descriptions

2. Error handling:
   - Global Express error handler: consistent JSON format
     { success: false, error: { code, message, details? } }
   - Frontend: React Error Boundary on each page
   - All async ops: try/catch with proper error propagation

3. Logging:
   - Winston: info/warn/error levels
   - Dev: console output | Prod: file output (logs/app.log)
   - Request logging via morgan

4. Testing:
   - Backend: Jest unit tests for campaign queue logic,
     grammar rules, and tone transformer functions
   - Frontend: Vitest smoke tests for main components
   - Test tone transformers exhaustively (all 5 presets)

5. Code quality:
   - ESLint + Prettier for both frontend and backend
   - Husky pre-commit hooks
   - TypeScript strict mode enabled everywhere

═══════════════════════════════════════════
## BUILD ORDER (follow this sequence)
═══════════════════════════════════════════
1. Initialize monorepo structure and install all packages
2. Prisma schema with all models → run prisma migrate
3. Backend: auth system (register, login, JWT, refresh)
4. Backend: WhatsApp service (session, QR, contacts sync)
5. Backend: Media service (Multer, local/S3 abstraction)
6. Backend: Campaign queue (Bull, delays, progress events)
7. Backend: Status service + statusScheduler queue
8. Backend: Grammar service (nspell + rule-based)
9. Backend: Tone transformer utils
10. Backend: All Express routes + Zod validation
11. Backend: Socket.IO namespaces and event emitters
12. Frontend: i18n setup + all three translation JSON files
13. Frontend: Zustand stores + React Query setup
14. Frontend: Shared components (Sidebar, Toast, Modal, etc.)
15. Frontend: <GrammarChecker /> and <ToneAdjuster /> components
16. Frontend: <MediaUploadZone /> component
17. Frontend: <LanguageSwitcher /> component
18. Frontend: Login page
19. Frontend: Dashboard page
20. Frontend: Connect (QR) page
21. Frontend: Contacts page
22. Frontend: Lists page
23. Frontend: Campaigns page (with all sub-components)
24. Frontend: Status page
25. Frontend: Settings page
26. Docker: Dockerfile.backend, Dockerfile.frontend
27. Docker: docker-compose.yml, docker-compose.prod.yml
28. Nginx: nginx.conf
29. Tests: Jest backend, Vitest frontend
30. README.md with full documentation

Generate ALL files completely. Do not skip, stub, or summarize any file.
Every component, service, route, translation key, and configuration
must be fully implemented and production-ready.
```

# NEXUS — WhatsApp Bulk Messaging Platform

A full-stack, production-ready WhatsApp bulk messaging SaaS with real-time progress tracking, contact management, and scheduled status publishing.

---

## Features

- **Multi-session WhatsApp** — Connect multiple WhatsApp accounts via QR code
- **Bulk Campaigns** — Send to contact lists with anti-spam random delays (3–8s), max 200 messages/campaign
- **Real-time Progress** — Socket.IO-powered live campaign tracking
- **Status Publishing** — Schedule WhatsApp status updates (once, daily, weekly, custom interval)
- **Contact Management** — Sync contacts from WhatsApp, organize into lists
- **Grammar Checker** — Local spell/style checker for English, Turkish, Arabic
- **Media Support** — Attach images, videos, documents (up to 16 MB)
- **i18n** — Turkish, English, Arabic with RTL support
- **Dark Premium UI** — Linear.app-inspired design system

---

## Tech Stack

| Layer     | Technology                                         |
|-----------|---------------------------------------------------|
| Backend   | Node.js, Express, TypeScript, Prisma, PostgreSQL  |
| Queue     | Bull + Redis                                      |
| Real-time | Socket.IO                                         |
| WhatsApp  | whatsapp-web.js                                   |
| Frontend  | React, Vite, TypeScript, Tailwind CSS             |
| State     | Zustand + TanStack Query v5                       |
| Deploy    | Docker, Nginx, AWS EC2                            |

---

## Quick Start (Development)

### Prerequisites
- Docker + Docker Compose
- Node.js 20+ (for local dev)

### 1. Clone & configure

```bash
cd nexus
cp .env.example .env
# Edit .env — set strong JWT_SECRET, JWT_REFRESH_SECRET, SESSION_ENCRYPTION_KEY
```

### 2. Start with Docker Compose

```bash
docker-compose up --build
```

Services:
| Service  | URL                    |
|----------|------------------------|
| Frontend | http://localhost:5173  |
| Backend  | http://localhost:3000  |
| Postgres | localhost:5432         |
| Redis    | localhost:6379         |

### 3. Local development (without Docker)

```bash
# Backend
cd backend
npm install
npx prisma migrate dev
npm run dev

# Frontend (new terminal)
cd ../frontend
npm install
npm run dev
```

---

## Environment Variables

| Variable                | Required | Description                                     |
|-------------------------|----------|-------------------------------------------------|
| `DATABASE_URL`          | ✅       | PostgreSQL connection string                    |
| `REDIS_URL`             | ✅       | Redis connection string                         |
| `JWT_SECRET`            | ✅       | Access token secret (64+ chars)                 |
| `JWT_REFRESH_SECRET`    | ✅       | Refresh token secret (64+ chars)                |
| `SESSION_ENCRYPTION_KEY`| ✅       | 64 hex chars (32 bytes) for AES-256            |
| `STORAGE_PROVIDER`      | ❌       | `local` (default) or `s3`                      |
| `AWS_ACCESS_KEY_ID`     | ❌       | Required if STORAGE_PROVIDER=s3                 |
| `AWS_SECRET_ACCESS_KEY` | ❌       | Required if STORAGE_PROVIDER=s3                 |
| `AWS_REGION`            | ❌       | S3 region (default: us-east-1)                  |
| `AWS_S3_BUCKET`         | ❌       | S3 bucket name                                  |
| `CORS_ORIGIN`           | ❌       | Comma-separated allowed origins                 |
| `PORT`                  | ❌       | Backend port (default: 3000)                    |

---

## Production Deployment (AWS EC2)

### Prerequisites
- EC2 instance: t3.medium minimum (2 vCPU, 4 GB RAM)
- Docker + Docker Compose installed
- Domain name pointed at the instance IP

### Steps

```bash
# 1. SSH into EC2
ssh ec2-user@your-instance-ip

# 2. Clone repo
git clone <your-repo> nexus && cd nexus

# 3. Create production .env
cp .env.example .env.prod
# Fill in all required values with strong secrets
# Set DOMAIN=your-domain.com

# 4. Initial SSL certificate
docker-compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot --webroot-path /var/www/certbot \
  -d your-domain.com \
  --email your@email.com --agree-tos --no-eff-email

# 5. Start production stack
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d

# 6. Verify
curl https://your-domain.com/api/health
```

---

## API Endpoints

### Auth
| Method | Path                | Description           |
|--------|---------------------|-----------------------|
| POST   | /api/auth/register  | Create account        |
| POST   | /api/auth/login     | Login                 |
| POST   | /api/auth/refresh   | Refresh access token  |
| POST   | /api/auth/logout    | Logout                |

### WhatsApp
| Method | Path                      | Description            |
|--------|---------------------------|------------------------|
| POST   | /api/whatsapp/init        | Initialize session     |
| GET    | /api/whatsapp/sessions    | List sessions          |
| POST   | /api/whatsapp/disconnect  | Disconnect session     |
| POST   | /api/whatsapp/sync-contacts | Sync contacts         |
| GET    | /api/whatsapp/groups      | List groups            |

### Campaigns
| Method | Path                        | Description          |
|--------|-----------------------------|----------------------|
| GET    | /api/campaigns              | List campaigns       |
| POST   | /api/campaigns              | Create campaign      |
| POST   | /api/campaigns/:id/start    | Start campaign       |
| POST   | /api/campaigns/:id/pause    | Pause campaign       |
| POST   | /api/campaigns/:id/resume   | Resume campaign      |
| GET    | /api/campaigns/:id/progress | Get progress         |
| DELETE | /api/campaigns/:id          | Delete campaign      |

### Grammar
| Method | Path               | Description                     |
|--------|--------------------|----------------------------------|
| POST   | /api/grammar/check | Check text (lang: en/tr/ar)     |

---

## Socket.IO Events

### `/whatsapp` namespace
| Event         | Direction      | Payload                                |
|---------------|----------------|----------------------------------------|
| `qr`          | server → client | `{ sessionId, qr }`                   |
| `ready`       | server → client | `{ sessionId, phoneNumber, displayName }` |
| `disconnected`| server → client | `{ sessionId, reason }`               |

### `/campaigns` namespace
| Event      | Direction      | Payload                                         |
|------------|----------------|-------------------------------------------------|
| `join`     | client → server | `campaignId`                                   |
| `progress` | server → client | `{ campaignId, sentCount, failedCount, percent }` |
| `complete` | server → client | `{ campaignId, sentCount, failedCount, totalCount }` |

---

## Running Tests

```bash
cd backend
npm test
# or with coverage
npm run test:coverage
```

---

## Project Structure

```
nexus/
├── backend/          # Express + TypeScript API
│   ├── src/
│   │   ├── auth/         # JWT authentication
│   │   ├── whatsapp/     # WhatsApp session management
│   │   ├── campaigns/    # Bulk messaging queue
│   │   ├── status/       # Status post scheduler
│   │   ├── grammar/      # Grammar checking
│   │   ├── media/        # File uploads
│   │   ├── socket/       # Socket.IO namespaces
│   │   └── middleware/   # Auth, rate-limit, error
│   └── prisma/           # Database schema & migrations
├── frontend/         # React + Vite SPA
│   └── src/
│       ├── pages/        # 8 application pages
│       ├── components/   # Shared + feature components
│       ├── stores/       # Zustand state
│       ├── hooks/        # React Query wrappers
│       └── locales/      # TR/EN/AR translations
├── docker-compose.yml       # Development stack
├── docker-compose.prod.yml  # Production stack
└── nginx.conf               # Reverse proxy + SSL
```

---

## License

MIT

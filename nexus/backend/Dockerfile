# ── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

RUN npm run prisma:generate
RUN npm run build

# ── Stage 2: Runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Chromium for whatsapp-web.js puppeteer
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist         ./dist
COPY --from=builder /app/prisma       ./prisma
COPY --from=builder /app/src          ./src
COPY --from=builder /app/tsconfig.json ./
COPY package.json ./

RUN mkdir -p sessions uploads logs

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]

# ── Build stage ──────────────────────────────────────────────
FROM node:20 AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── Runtime stage ────────────────────────────────────────────
FROM node:20-alpine AS runtime

RUN addgroup -S asec && adduser -S asec -G asec

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

USER asec

ENTRYPOINT ["node", "dist/index.js"]

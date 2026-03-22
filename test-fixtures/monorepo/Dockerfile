FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY turbo.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/
RUN npm ci --ignore-scripts
COPY packages/ ./packages/
RUN npx turbo run build

FROM node:22-alpine AS api
WORKDIR /app
RUN addgroup -g 1001 appgroup && adduser -u 1001 -G appgroup -s /bin/sh -D appuser
COPY --from=builder /app/packages/api/dist ./dist
COPY --from=builder /app/packages/api/package.json ./
COPY --from=builder /app/packages/shared/dist ./node_modules/@acme/shared/dist
COPY --from=builder /app/packages/shared/package.json ./node_modules/@acme/shared/
RUN npm ci --omit=dev --ignore-scripts 2>/dev/null || true
USER appuser
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1
CMD ["node", "dist/index.js"]

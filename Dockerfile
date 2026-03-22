# ---------------------------------------------------------------------------
# AugmentaSec CLI — multi-stage Docker build (ASEC-144)
# ---------------------------------------------------------------------------

# Stage 1: install dependencies & build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package manifests first for better layer caching
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Prune dev dependencies
RUN npm ci --omit=dev

# Stage 2: production image
FROM node:20-alpine AS production

# Security: non-root user
RUN addgroup -g 1001 -S asec && \
    adduser -u 1001 -S asec -G asec

WORKDIR /app

# Copy built artifacts and production dependencies
COPY --from=builder --chown=asec:asec /app/dist ./dist
COPY --from=builder --chown=asec:asec /app/node_modules ./node_modules
COPY --from=builder --chown=asec:asec /app/package.json ./

# Switch to non-root user
USER asec

# Default working directory for scanned projects (mount point)
VOLUME ["/workspace"]
WORKDIR /workspace

ENTRYPOINT ["node", "/app/dist/index.js"]
CMD ["--help"]

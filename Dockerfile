# HEXHOLD — game server + built client in one image.
#
# The server is bundled to a single ESM file so the runtime image carries no
# node_modules at all: it is Node, one .mjs, and the static client.

# --- build ------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Install with the lockfile only, so this layer caches across source changes.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build && npm run build:server

# --- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0 \
    CLIENT_DIR=/app/client

# Run as a non-root user.
RUN addgroup -S hexhold && adduser -S hexhold -G hexhold

COPY --from=build --chown=hexhold:hexhold /app/dist-server/index.mjs ./server/index.mjs
COPY --from=build --chown=hexhold:hexhold /app/dist ./client

USER hexhold
EXPOSE 3001

# The orchestrator gets a real readiness signal, not a guess.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.mjs"]

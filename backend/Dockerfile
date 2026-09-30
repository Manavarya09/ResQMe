# ResQMe API + realtime + responder dashboard.
# Build from the repository root so the dashboard is included:
#   docker build -f backend/Dockerfile -t resqme-backend .
FROM node:22-alpine AS deps
WORKDIR /srv/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production PORT=4100
WORKDIR /srv/backend
COPY --from=deps /srv/backend/node_modules ./node_modules
COPY backend/package.json ./
COPY backend/src ./src
COPY backend/db ./db
COPY backend/scripts ./scripts
COPY dashboard /srv/dashboard
USER node
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4100/health >/dev/null || exit 1
CMD ["node", "src/server.js"]

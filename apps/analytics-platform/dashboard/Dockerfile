FROM node:20-bookworm-slim AS base

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM deps AS builder
ARG NEXT_PUBLIC_ANALYTICS_BASE
ENV NEXT_PUBLIC_ANALYTICS_BASE=${NEXT_PUBLIC_ANALYTICS_BASE}
COPY . .
RUN npm run build

FROM base AS runner
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/public ./public
COPY --from=builder /app/pages ./pages
COPY --from=builder /app/components ./components
COPY --from=builder /app/context ./context
COPY --from=builder /app/hooks ./hooks
COPY --from=builder /app/styles ./styles
COPY --from=builder /app/utils ./utils
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/jsconfig.json ./jsconfig.json
COPY --from=builder /app/.next ./.next

EXPOSE 3001

CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3001"]

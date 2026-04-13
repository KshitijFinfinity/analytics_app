FROM node:20-bookworm-slim AS base

WORKDIR /app
ENV NODE_ENV=production

FROM base AS deps
COPY package*.json ./
RUN npm ci --omit=dev

FROM base AS runner
ENV PORT=4001

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 4001

CMD ["npm", "start"]

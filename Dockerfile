FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci --legacy-peer-deps

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json .npmrc ./
COPY --from=deps /app/node_modules ./node_modules
RUN npm prune --omit=dev --legacy-peer-deps

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./next.config.mjs

EXPOSE 8080
CMD ["sh", "-c", "npx next start -p ${PORT:-8080}"]

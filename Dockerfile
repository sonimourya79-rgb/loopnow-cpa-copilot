# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma client codegen needs the schema present but NOT a live database —
# it only reads prisma/schema.prisma, never connects at generate time.
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
# The seed script (run at startup, see docker-entrypoint.sh) imports the
# GIFI catalogue straight from src/lib/rules — the standalone Next build has
# no reason to trace a file nothing in the server imports at runtime, so it
# has to be copied here explicitly.
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
# The Prisma CLI (needed at container startup to run `migrate deploy`) pulls
# in its own dependency tree (@prisma/config, jiti, etc.) that Next's
# standalone tracer has no reason to include — it only traces what the
# NEXT SERVER itself imports. Copying the full builder node_modules here,
# rather than cherry-picking prisma-related folders, avoids chasing each
# transitive dependency one MODULE_NOT_FOUND at a time.
COPY --from=builder /app/node_modules ./node_modules
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]

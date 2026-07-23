FROM node:22.14.0-bookworm-slim AS dependencies
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM dependencies AS builder
ARG NEXT_PUBLIC_GIT_SHA=unknown
ARG NEXT_PUBLIC_BUILD_TIME=unknown
ENV MAINLAND_RUNTIME=1
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_GIT_SHA=$NEXT_PUBLIC_GIT_SHA
ENV NEXT_PUBLIC_BUILD_TIME=$NEXT_PUBLIC_BUILD_TIME
COPY . .
RUN pnpm run build
RUN pnpm prune --prod

FROM node:22.14.0-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV MAINLAND_RUNTIME=1
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/api ./api
COPY --from=builder --chown=nextjs:nodejs /app/data ./data
COPY --from=builder --chown=nextjs:nodejs /app/server ./server
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/patientIntentCatalog.js ./src/lib/patientIntentCatalog.js
COPY --from=builder --chown=nextjs:nodejs /app/scripts/healthcheck-mainland.mjs ./scripts/healthcheck-mainland.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/mainland-safe-llm-mock.mjs ./scripts/mainland-safe-llm-mock.mjs
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=8s --start-period=30s --retries=3 \
  CMD ["node", "scripts/healthcheck-mainland.mjs", "--base-url=http://127.0.0.1:3000", "--shallow"]
CMD ["node", "server/mainlandServer.js"]

# syntax=docker/dockerfile:1
FROM node:24-slim AS build
WORKDIR /repo
RUN npm install -g pnpm@11.9.0
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:24-slim
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=8080 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 8080
CMD ["node", "apps/web/server.js"]

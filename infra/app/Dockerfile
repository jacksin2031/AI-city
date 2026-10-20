FROM node:24.18.0-bookworm-slim
ENV PNPM_HOME=/opt/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app
COPY --chown=node:node . .
RUN pnpm install --frozen-lockfile && pnpm build && chown -R node:node /app /opt/pnpm
USER node
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "scripts/start-remote.mjs"]

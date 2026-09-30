FROM node:20.19-bookworm-slim AS build

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY nest-cli.json prisma.config.ts tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
COPY src ./src

RUN pnpm build && pnpm prune --prod

FROM node:20.19-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

RUN groupadd --system app && useradd --system --gid app --home-dir /app app

COPY --from=build --chown=app:app /app/package.json ./package.json
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist

USER app
EXPOSE 3000
CMD ["node", "dist/main.js"]

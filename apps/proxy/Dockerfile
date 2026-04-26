FROM node:24-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/proxy ./apps/proxy
COPY packages/core ./packages/core
COPY packages/presets ./packages/presets

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @chaos-internet-simulator/proxy build

EXPOSE 8080 8081

CMD ["pnpm", "--filter", "@chaos-internet-simulator/proxy", "start"]

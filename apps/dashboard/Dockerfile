FROM node:24-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/dashboard ./apps/dashboard

RUN pnpm install --no-frozen-lockfile

EXPOSE 3000

CMD ["pnpm", "--filter", "@chaos-internet-simulator/dashboard", "dev"]

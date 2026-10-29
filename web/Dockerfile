FROM node:22-slim

# pnpm fijo con corepack; la versión coincide con la que generó pnpm-lock.yaml.
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

WORKDIR /srv/web
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 5173
# Reinstala si cambió el lockfile: node_modules vive en un volumen propio (binarios de Linux).
CMD ["sh", "-c", "pnpm install --frozen-lockfile && pnpm dev"]

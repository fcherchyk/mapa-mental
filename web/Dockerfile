FROM node:22-slim

# pnpm pinned with corepack; the version matches the one that generated pnpm-lock.yaml.
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate
# Fixed store: without it pnpm picks another one at startup (./web is a bind mount, another disk)
# and wants to rebuild node_modules. CI=true lets it reinstall without asking if the lockfile changes.
ENV npm_config_store_dir=/pnpm-store
ENV CI=true

WORKDIR /srv/web
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 5173
# Reinstalls if the lockfile changed: node_modules lives in its own volume (Linux binaries).
CMD ["sh", "-c", "pnpm install --frozen-lockfile && pnpm dev"]

FROM node:22-slim

# pnpm fijo con corepack; la versión coincide con la que generó pnpm-lock.yaml.
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate
# Store fijo: sin esto pnpm elige otro al arrancar (./web es un bind mount, otro disco) y quiere
# rehacer node_modules. CI=true deja que reinstale sin pedir confirmación si cambia el lockfile.
ENV npm_config_store_dir=/pnpm-store
ENV CI=true

WORKDIR /srv/web
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 5173
# Reinstala si cambió el lockfile: node_modules vive en un volumen propio (binarios de Linux).
CMD ["sh", "-c", "pnpm install --frozen-lockfile && pnpm dev"]

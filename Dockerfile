# syntax=docker/dockerfile:1
# CastKit server (Inkcast image mode + Slatecast browser mode).
#
# The server renders with headless Chromium (Playwright), so the image bundles a
# Chromium build. Runtime is the esbuild bundle run with plain `node` (never tsx
# in prod — locked decision); `pnpm build` also copies the font TTFs next to the
# bundle, where the render engine resolves them by path.

FROM node:26-slim AS base
WORKDIR /app

# Link the GHCR package to the repo.
LABEL org.opencontainers.image.source="https://github.com/Sawtaytoes/castkit"

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV NODE_ENV=production
ENV TZ=America/Chicago

RUN npm install --global --force --allow-scripts=pnpm pnpm@12.9.1

# --- Dependency layer (only manifests, so source edits don't bust the install) ---
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/slatecast/package.json packages/slatecast/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/views/package.json packages/views/package.json
COPY packages/render/package.json packages/render/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/web/package.json packages/web/package.json
COPY packages/admin/package.json packages/admin/package.json

RUN --mount=type=cache,id=castkit-pnpm,target=/pnpm/store,sharing=locked pnpm install --prod=false --frozen-lockfile --store-dir /pnpm/store

# Chromium + its system libraries for the render engine.
RUN pnpm exec playwright install --with-deps chromium
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv && rm -rf /var/lib/apt/lists/*

# Managed native stream workers ship in the same app image. Python uses its
# pinned browser build; connection files and credentials remain private mounts.
COPY device-client/remote-display/requirements.txt /tmp/worker-requirements.txt
RUN python3 -m venv /opt/castkit-worker && /opt/castkit-worker/bin/pip install --no-cache-dir -r /tmp/worker-requirements.txt && /opt/castkit-worker/bin/python -m playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

# --- Source + bundle ---
COPY . .
RUN pnpm build

# HTTP API port (override with PORT).
EXPOSE 8788

# Config comes from the environment (see .env.example). Mount a .env or pass
# -e vars; nothing house-specific is baked into the image.
CMD ["pnpm", "--filter", "@castkit/server", "start:prod"]

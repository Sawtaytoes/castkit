# syntax=docker/dockerfile:1
# CastKit server (Inkcast image mode + Slatecast browser mode).
#
# The server renders with headless Chromium (Playwright), so the image bundles a
# Chromium build. Runtime is the esbuild bundle run with plain `node` (never tsx
# in prod — locked decision); `pnpm build` also copies the font TTFs next to the
# bundle, where the render engine resolves them by path.
#
# Stages, slowest-changing first, so a lockfile or source change reuses the
# system packages and both browser downloads:
#   system                   Node, pnpm, apt packages, and the Python stream
#                            worker with its own Chromium.
#   playwright-version       Reads the Node Playwright version from the lockfile.
#   runtime-base             system + the Chromium that version of Playwright uses.
#   build                    Every dependency, then `pnpm build`.
#   production-dependencies  Production dependencies only.
#   runtime                  runtime-base + production dependencies + source + build.

FROM node:26-slim AS system
WORKDIR /app

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV NODE_ENV=production
ENV TZ=America/Chicago

RUN npm install --global --force --allow-scripts=pnpm pnpm@12.9.1

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libjemalloc2 python3 python3-venv tini && rm -rf /var/lib/apt/lists/*

# Managed native stream workers ship in the same app image. Python uses its
# pinned browser build; connection files and credentials remain private mounts.
COPY device-client/remote-display/requirements.txt /tmp/worker-requirements.txt
RUN python3 -m venv /opt/castkit-worker && /opt/castkit-worker/bin/pip install --no-cache-dir -r /tmp/worker-requirements.txt && /opt/castkit-worker/bin/python -m playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

# --- The one Playwright version the lockfile resolves ---
# This stage reruns on every lockfile change, but its output is one short file.
# The COPY below is keyed on that file's content, so the Chromium download
# after it reruns only when the Playwright version itself changes.
FROM system AS playwright-version
COPY pnpm-lock.yaml ./
RUN sed -n 's/^  playwright@\([0-9][^:(]*\):$/\1/p' pnpm-lock.yaml | sort -u > /playwright-version \
  && test "$(wc -l < /playwright-version)" = 1 \
  || { echo "expected exactly one playwright version in pnpm-lock.yaml, found: $(tr '\n' ' ' < /playwright-version)"; exit 1; }

FROM system AS runtime-base
# Link the GHCR package to the repo.
LABEL org.opencontainers.image.source="https://github.com/Sawtaytoes/castkit"
# Chromium + its system libraries for the render engine, at the exact revision
# the installed `playwright` package expects. The runtime stage checks that.
COPY --from=playwright-version /playwright-version /tmp/playwright-version
RUN npx --yes "playwright@$(cat /tmp/playwright-version)" install --with-deps chromium && rm -rf /var/lib/apt/lists/* /root/.npm

# --- Dependency manifests (shared by the two install stages) ---
FROM system AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# `patchedDependencies` in pnpm-workspace.yaml: the install applies these.
COPY patches patches
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/slatecast/package.json packages/slatecast/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/views/package.json packages/views/package.json
COPY packages/render/package.json packages/render/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/web/package.json packages/web/package.json
COPY packages/admin/package.json packages/admin/package.json

# --- Build: every dependency, then the bundle and both SPAs ---
FROM manifests AS build
RUN --mount=type=cache,id=castkit-pnpm,target=/pnpm/store,sharing=locked pnpm install --prod=false --frozen-lockfile --store-dir /pnpm/store
COPY . .
RUN pnpm build

# --- Production dependencies only ---
# The bundle inlines everything except the native and browser packages it
# leaves external (see scripts/build-server.mjs), so the runtime needs only
# these, not the build, test, lint, and Storybook tooling.
FROM manifests AS production-dependencies
RUN --mount=type=cache,id=castkit-pnpm,target=/pnpm/store,sharing=locked pnpm install --prod --frozen-lockfile --store-dir /pnpm/store

FROM runtime-base AS runtime
COPY --from=production-dependencies /app /app
COPY . .
COPY --from=build /app/packages/server/dist packages/server/dist

# The server's Chromium must be the revision its `playwright` package expects;
# fail the build, not the first render.
RUN node -e "const { existsSync } = require('node:fs'); const { chromium } = require('playwright'); const path = chromium.executablePath(); if (!existsSync(path)) { console.error('missing Playwright Chromium at ' + path); process.exit(1) }"

# HTTP API port (override with PORT).
EXPOSE 8788

# Config comes from the environment (see .env.example). Mount a .env or pass
# -e vars; nothing house-specific is baked into the image.
# PID 1 reaps orphaned browser descendants. Node directly receives termination
# and stops managed workers before the server closes.
WORKDIR /app/packages/server
ENTRYPOINT ["/usr/bin/tini", "-g", "--"]
# jemalloc for the node server only. With Satori, node itself handles the
# supersampled rasters (3200x2400 for a 1600x1200 panel) in sharp's and resvg's
# native threads, and glibc kept ~17 per-thread arenas of freed memory (~230 MiB)
# that it never returned. jemalloc returning dirty pages after 1 s settled at
# 193 MiB against glibc's 433 MiB with the same peak
# (docs/2026-10-13-server-memory-by-engine.md). The server removes LD_PRELOAD and
# MALLOC_CONF from its own environment at start, so Chromium and the Python
# stream workers keep their normal allocators.
CMD ["env", "LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2", "MALLOC_CONF=background_thread:true,dirty_decay_ms:1000,muzzy_decay_ms:0", "node", "--enable-source-maps", "dist/index.js"]

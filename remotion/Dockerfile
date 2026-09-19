# The render server as a container, so Export works the same everywhere and can be deployed.
#
# WHY THIS EXISTS. Running the render server natively on the host only works on Docker Desktop:
# on Linux `host.docker.internal` resolves to the bridge gateway (172.17.0.1), the server binds
# 127.0.0.1, and the API's every render request is refused — Export just says "renderer isn't
# running". Putting it on the compose network removes the host from the path entirely.
#
# Build context is the REPO ROOT, not this folder: the composition imports the editor's real
# CaptionRenderer from apps/web/src, which is the whole point (one renderer, no drift).
#   docker compose --profile export build render
FROM node:24-bookworm-slim

# Chrome's runtime libraries, from Remotion's own recipe (https://www.remotion.dev/docs/docker).
# That page is explicit that Alpine is NOT supported ("unsupported Libc symbols"), hence Debian.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 libxrandr2 \
      libxkbcommon-dev libxfixes3 libxcomposite1 libxdamage1 \
      libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2 \
# This product captions HINGLISH. The base image ships no Devanagari face, so without
# fonts-noto-core every Hindi-script word exports as tofu boxes, and without the emoji font
# "put a fire emoji on that word" renders nothing. Neither shows up in a Latin-only test.
      fonts-noto-core fonts-noto-color-emoji \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

# Manifests first so a source edit does not re-run the install layer.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY remotion/package.json remotion/
RUN npm ci --no-audit --fund=false

# Chrome at BUILD time — left to first boot it is a ~110 MB download in front of the first export,
# which is exactly when someone is demoing. Placed before the source copies so editing the server
# does not re-download it. (`npx remotion` is not on the hoisted workspace path; this is the same
# call the server makes on boot.)
RUN node -e "import('@remotion/renderer').then((m) => m.ensureBrowser())"

# Only what the bundle actually reaches: the composition, the shared schema, and the editor's
# caption code. Not the editor app, not the API.
COPY packages/shared packages/shared
COPY apps/web/tsconfig.json apps/web/tsconfig.app.json apps/web/
COPY apps/web/src apps/web/src
COPY remotion remotion


# Safe here in a way it is not on a laptop: the container's own network is the boundary, and
# compose publishes this port on 127.0.0.1 only. Never publish it on 0.0.0.0.
ENV RENDER_HOST=0.0.0.0
EXPOSE 3100
CMD ["node", "remotion/server/index.mjs"]

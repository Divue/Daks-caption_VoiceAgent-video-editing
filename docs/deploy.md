# Deploy — live URL

Ship It track needs a public URL. Day 1 that means the editor only: Amplify Hosting
serves `apps/web` from `master`. The API (App Runner) and Remotion Lambda get wired in
later — nothing in the frontend needs them to render the landing page and editor shell.

## What is deployed

| Piece | Service | Source | Status |
| --- | --- | --- | --- |
| React editor + landing page | Amplify Hosting | `master`, built by `amplify.yml` | live |
| FastAPI pipeline | App Runner | `services/api` | not yet |
| Remotion export | Lambda | `remotion/` | not yet |

## Build spec

`amplify.yml` at the repo root. It installs at the root (the web app is an npm
workspace that depends on `@captions/shared`, so `npm ci` inside `apps/web` would
fail), pins Node 22 for Vite 8, and publishes `apps/web/dist`.

## One-time setup in the Amplify console

1. AWS console → **Amplify** → **Create new app** → **Deploy your app** → **GitHub**.
2. Authorize AWS Amplify on GitHub. Grant it access to
   `sept1st2c/Daks-caption_VoiceAgent-video-editing` (only this repo is enough).
3. Repository: that repo. Branch: **`master`**. Leave "monorepo" unchecked — the build
   spec already handles the workspace layout from the root.
4. App settings: Amplify detects `amplify.yml` and shows it. Do not override the build
   commands. Build image can stay on the default Amazon Linux 2023.
5. No environment variables yet. When the API goes up, add `VITE_API_URL` here and
   redeploy.
6. **Save and deploy.** First build takes ~3–5 min.
7. The URL appears on the branch card: `https://master.<app-id>.amplifyapp.com`.

## SPA rewrite (needed for `/editor`)

`apps/web/src/router.tsx` uses the history API, so a direct load of
`https://.../editor` hits S3 for a file that does not exist and 404s. Amplify usually
adds the SPA rule itself — verify it under **Hosting → Rewrites and redirects**:

| Source | Target | Type |
| --- | --- | --- |
| `</^[^.]+$\|\.(?!(css\|gif\|ico\|jpg\|js\|png\|txt\|svg\|woff\|woff2\|ttf\|map\|json\|webp)$)([^.]+$)/>` | `/index.html` | 200 (Rewrite) |

If it is missing, add it manually. Test by opening `/editor` directly in a new tab.

## After setup

Every push to `master` redeploys automatically. Feature branches are not connected, so
a push to `p1-pipeline` etc. does not trigger a build. The lead's 1pm and 9pm merges to
`master` are what update the live site.

## Known limitations

- Landing page and editor render against the fixture only; upload, agent and export are
  not connected to any backend yet.
- No custom domain. The `amplifyapp.com` URL is what gets submitted.
- No auth in front of the site (deliberate — out of MVP scope).

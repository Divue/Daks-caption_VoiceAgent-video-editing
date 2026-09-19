# remotion — owner P2

The caption composition and the local render server that turn a saved Project into an MP4.
This is what the editor's **Export** button runs.

## Run it

```bash
npm install                      # once, at the repo root
npm run render-server -w @captions/remotion
```

First start downloads Remotion's headless Chrome (~110 MB) and bundles the composition (about a
minute); later starts take ~20 s. The server listens on `http://127.0.0.1:3100`. The API (in Docker)
reaches it as `http://host.docker.internal:3100` — override with `RENDER_SERVICE_URL` in `.env`.
If it is not running, Export says so and how to start it.

## How an export flows

```
Editor "Export" -> POST /projects/{id}/render        (services/api/app/routers/render.py)
   API probes the source's frame rate and sends { saved project, presigned videoUrl, fps }
   -> render server (server/index.mjs) renders with Remotion, one at a time
Editor polls GET /projects/{id}/render/{renderId}
   when done the API moves the MP4 to S3 and returns a save-as (Content-Disposition) link
```

The API is stateless; the render server owns render state (in memory, files in `out/renders/`), so
restarting it loses in-flight renders and the editor reports "failed — export again".

## Why the export matches the editor

`src/CaptionVideo.tsx` is not a second implementation of the captions. It calls the same functions the
editor calls, in the same order — `deriveBlocks` -> `resolveEmphasis` -> `resolvePreset`
(`apps/web/src/lib/resolve-preset.ts`) — and renders the **same `CaptionRenderer` component** the
preview uses, imported from `apps/web/src` through a webpack alias (`@`). The editor's clock is
`video.currentTime`; the export's is the frame being rendered, so a frame is a pure function of its
number. Change how captions look and both change together.

Two things could still make them drift, and `npm run check -w @captions/remotion` guards both:
- `CaptionRenderer` uses Tailwind classes, and this bundle has none — `src/caption-utilities.css` is the
  hand-written subset. The check fails if the renderer starts using a class that is not defined there.
- The fonts. The export loads the same Google Fonts link as `apps/web/index.html`; the check fails if they differ.

## Limits (real ones)

- **Only the SAVED project is exported.** Session-only tweaks in the style panel (glow layers, stretch,
  align — anything not stored in `Project.presetOverride`) live in the browser tab and are not rendered.
- **Fonts come from Google at render time.** An offline machine would fall back to a default font.
- **One render at a time** (a Chromium render needs 1-2 GB). Requests queue.
- Output is H.264 + AAC at the **source's resolution and frame rate**, limited-range BT.709. Odd source
  dimensions are rounded down to even (H.264 requires it).
- Renders take roughly the length of the clip up to about 7x it, depending on resolution (a 21 s 720p clip
  ~35 s; a 17 s 1440p clip ~2 min on a 20-core laptop).
- No cancel button, no cloud/Lambda rendering, no SRT export. Not built.

## License

Remotion is free for individuals and companies of up to 3 people; a team of 4 or more needs a paid
company license (<https://www.remotion.dev/license>). The team chose Remotion in CLAUDE.md; this needs a
decision before any real launch.

## Files

| Path | What it is |
| --- | --- |
| `src/CaptionVideo.tsx`, `src/Root.tsx`, `src/index.ts` | the composition (size, fps and length come from the project) |
| `src/fonts.ts`, `src/caption-utilities.css` | font loading and the CSS subset |
| `server/index.mjs`, `server/bundle.mjs` | the render server and the one-time bundling |
| `scripts/check.mjs` | the drift guard (`npm run check`) |
| `scripts/still.mjs` | render one frame of a real project to look at (`npm run still -- <projectId> <timeMs>`) |

# Phase 19 — Export: render the captioned video and download it Audit

## Status
Implemented and verified end to end **through the real UI in a real Chrome**: click Export -> live progress -> "Your video is ready"
-> a save-as download link -> the MP4 downloaded and inspected from the outside. Two real projects exported (a 21 s 720p portrait clip
and your own 17.8 s 2560x1440 stereo upload). Not verified: see "Unverified". The changes cross three owners' folders (P1 API, P2
`remotion/`, P3 `apps/web`); nothing is committed or pushed. One change alters how the **editor preview** looks (word spacing, below).

## Objective
The header's Export button called `POST /projects/{id}/render`, a hard-coded 501 stub. `remotion/` was a README. Make Export produce a real
MP4 of the source video with the editor's captions and the original audio, and let the user download it. Decisions taken with the repo
owner: Remotion, run as a **native Node render server on the dev machine** (not Docker); flag the Remotion license.

## Implementation
- **Composition** (`remotion/src`): the source video plus captions, sized from the project (width, height, duration) and the source's frame
  rate. It is **not a second implementation of the captions**: it calls `deriveBlocks -> resolveEmphasis -> resolvePreset` exactly as the editor
  does and renders the **same `CaptionRenderer` component**, imported from `apps/web/src` through a webpack alias. The clock is the frame number,
  so output is independent of machine speed (the caption code has no CSS animation or timers).
- **`apps/web/src/lib/resolve-preset.ts`**: the preset-override merge, previously an inline `useMemo` only the editor could call, extracted into a
  pure function used by both. Verified identical to the original inline code on all 49 preset x override pairs.
- **Render server** (`remotion/server/index.mjs`): `POST/GET/DELETE /renders`, `/renders/:id/file`, `/health`. One render at a time (a Chromium
  render needs 1-2 GB), queued; 15-minute timeout; presigned-URL signatures redacted from every log and error; loopback-only by default; the
  request's `videoUrl` must be http(s). H.264, CRF 18, `yuv420p`, BT.709, JPEG quality 95, source audio kept.
- **API** (`services/api/app/routers/render.py`, replaces the 501 stub): thin and stateless. Probes the source's real frame rate with ffprobe (falls
  back to 30), sends the SAVED project and a presigned `videoUrl` to the render server, polls it, and on completion streams the MP4 to S3
  (`renders/{id}.mp4`, idempotent, serialised per render) and returns a presigned **save-as** link (`s3.presigned_download` sends
  `Content-Disposition: attachment`, because browsers ignore the `download` attribute on cross-origin links). A delivered render is answered from S3
  alone. Render ids must be 12 hex characters; a render belonging to another project is a 404; a render the server forgot is `failed`, not a 500;
  server down is a `503 render_unavailable` that says how to start it.
- **Editor** (`ExportButton.tsx`, `lib/export.ts`): a small popover with a real progress bar, Download, Export again, Try again. The flow is a pure state
  machine (progress never goes backwards; one failed poll is tolerated, three in a row fail it; a "done" with no link is a failure; a second
  click while rendering starts nothing; a link older than 45 min is refreshed before it is handed out).
- **Drift guards** (`remotion/scripts/check.mjs`): fails if `CaptionRenderer` uses a CSS class the export's hand-written stylesheet lacks, or if the
  export's Google Fonts link differs from `apps/web/index.html`. Both proven to fail on deliberately bad input.

## Files
New: `remotion/{package.json, src/*, server/*, scripts/*}`, `apps/web/src/{components/layout/ExportButton.tsx, lib/export.ts, lib/resolve-preset.ts}`,
`services/api/tests/test_render.py`, this audit. Modified: `remotion/README.md`, `apps/web/src/{lib/api.ts, components/layout/AppHeader.tsx,
components/preview/CaptionRenderer.tsx, state/preset-override-context.tsx}`, `apps/web/scripts/check-agent-apply.ts`,
`services/api/{app/routers/render.py, app/s3.py, README.md, tests/test_seams_and_cost_routes.py}`, `docker-compose.yml` (`extra_hosts`),
`.env.example` (`RENDER_SERVICE_URL`), `package-lock.json`. **Not touched:** `packages/shared`, the schema.

## Verification (measured)
| What | Result |
|---|---|
| Portrait 478x850 25 fps clip, direct to the render server | 21 s clip in ~30-36 s; H.264 478x850 **25/1**, `yuv420p`, `tv`, BT.709; AAC; 21.160 s vs 21.170 s source |
| Real upload 2560x1440, 14.985 fps, stereo, through the UI | ~2 min 6 s; **same resolution and fps**; duration 17.771 s vs 17.777 s; AAC 2ch 48 kHz; **loudness identical to the source** (mean -15.6 dB, peak -0.0 dB); 27.4 MB |
| The download link | 200, `video/mp4`, `Content-Disposition: attachment; filename="<id>-captioned.mp4"` |
| Frames from the exported files | italic/serif lines, coloured words, the big emphasis face ("SHOW", "TECHNICAL BACKGROUND") and per-preset fonts all present, matching the editor |
| Render server stopped, click Export | within 1 s: "The render server isn't running. Start it with `npm run render-server` in the remotion/ folder…" + Try again |
| API | pytest **127 passed** (95 before + 32 new, incl. a real fake-render-server HTTP test); 8 agent modules and the worker tests pass |
| Web | `tsc -b` clean; build succeeds; `check:agent` **135** ok / 0 failures (107 at the end of phase 18, so **28 new here**: 23 export-flow, 5 preset-resolution); lint clean for every file touched (the remaining warnings are pre-existing) |

## Defects found by testing the real thing (and fixed)
1. **Words ran together in the export ("Hellogoodmorning").** The gap between words was `0.28em`, and `em` resolved against the caption row's own font size, which
   nothing set (the browser default, 16 px). Words scale with the frame width; their gap did not, so on a 2560 px frame it was a sliver. **The editor has the
   same latent bug on large previews.** Fixed in the shared `CaptionRenderer` (the row now takes the caption's base size), verified: gap/text = 0.28 at frame
   widths 224, 640 and 1120 px, and the re-exported video reads correctly. **This changes the editor preview slightly** (word spacing on small previews grows
   from a fixed 4.5 px to 28% of the text size). P3 should look at it.
2. **Wrong colour tags.** The first export was `yuvj420p`, full-range, SD colour matrix. Now `yuv420p`, limited range, BT.709 (measured).
3. **Wrong frame rate.** A fixed 30 fps resampled a 25 fps clip; the API now probes and passes the real rate (measured 25/1 and 15000/1001 preserved).
4. **A request made while the server was still bundling failed instantly** ("still starting"); it now waits in the queue.
5. **`download` attribute would have been ignored** (cross-origin S3), so "Download" would have played the video in a tab; fixed with a `Content-Disposition` presign.

## Deviations / mistakes made along the way
1. I wrote that `/health` would answer immediately during start-up. It does not: webpack bundles in the same process and blocks the event loop for ~20-40 s.
   The comment was corrected; requests queue and start when ready.
2. My first look at a screenshot of the editor suggested the video was drawn at a fraction of its box. Measuring the DOM showed the frame and video both fill
   640x360 at 2560x1440 intrinsic size: it was a headless screenshot artifact, not a layout bug.
3. A `REMOTION_BROWSER_EXECUTABLE` setting was read but never passed to the renderer; wired through.

## Unverified / Untestable
1. **Odd-sized sources** (dimensions are rounded down to even for H.264): implemented, never exercised.
2. **Emoji in captions** use the render machine's emoji font; not compared against the editor.
3. **Offline / missing Google Fonts:** the export would fall back to a default font; not tried.
4. **A 60 s clip** (the API's cap): render time and memory unmeasured; extrapolating from 2 min for 18 s at 1440p suggests ~7 minutes, near the 15-minute timeout for very large files.
5. **Memory pressure:** Chromium with 2 render workers used no more than the ~2.5 GB free here, but nothing measured what the OS did under real pressure.
6. **Playback of the exported MP4 in other players/browsers** (frames were decoded with ffmpeg only) and an actual click-to-save in a headed browser (the link's headers were verified).
7. **Windows-only run.** Linux/macOS untested (the compose `extra_hosts` line is for Linux but was not run there). Docker packaging of the render server: not built.
8. **Visual fidelity is by eye**, not pixel-diffed against the editor.

## Blocked / Out of scope
Cloud/Lambda rendering, cancel button, SRT export, queue persistence across restarts, auth on the render endpoints (the render server is loopback-only and unauthenticated by design here).

## Security
`videoUrl` is fetched by Chromium on the render machine: the server accepts only http(s) and binds to 127.0.0.1 by default, but a caller who can reach it can make it
fetch a URL and burn CPU; it has no auth (documented). The API only forwards a presigned URL it minted itself. Presigned signatures are redacted from render-server
logs and errors. No secrets added. `RENDER_HOST=0.0.0.0` would expose the server to the LAN; the default does not.

## License flag (needs the lead)
Remotion is free for individuals and companies of up to 3 people; a team of 4 or more needs a paid company license. CLAUDE.md mandates Remotion; this is recorded
here and in `remotion/README.md` so it is decided before any real launch, not discovered after.

## Git / Change Scope
Branch `p3-agent-talk-edit` @ `3eb69df`. `git status` reviewed: only the files above. Nothing committed or pushed. Test artifacts: two exported videos on S3 under
`p4/projects/0f23a00eed5f/renders/` (54.9 MB) and two small files in `remotion/out/renders/` (git-ignored); nothing deleted.

## Next Steps
1. **P3** reviews `CaptionRenderer.tsx` (word-gap change), `preset-override-context.tsx`, `AppHeader.tsx`, `ExportButton.tsx`; **P1** reviews `render.py`, `s3.py`, compose, README; **P2** owns `remotion/`.
2. The lead decides the Remotion license question.
3. Try a 60 s clip and an odd-sized source; measure render time and memory (owner: whoever demos).
4. If exports must run off your laptop: package `remotion/server` as a container (Chromium + Node) or move to Remotion Lambda (owner: P1/P2).

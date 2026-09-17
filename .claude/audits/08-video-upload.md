# Video Upload Flow

## Status
Completed

## Commit
`860ab9f` — "feat: add video upload flow" (no body recorded)

## Objective
Let the user load a local video file into the editor.

## What was implemented
- `UploadDropzone`: drag-and-drop area plus a hidden `<input type="file"
  accept="video/*">` triggered by a "Browse files" button. Rejects non-video
  files (checks `file.type.startsWith('video/')`).
- `readVideoMetadata`: loads the file into an off-DOM `<video>` element
  (`preload="metadata"`) to read real `videoWidth`/`videoHeight`/`duration`,
  with an 8-second timeout guard against files that never fire
  `loadedmetadata`.
- On success, revokes the previous object URL if one existed
  (`project.videoUrl.startsWith('blob:')`), then dispatches `SET_PROJECT`
  with a new `Project`: new `id` (`crypto.randomUUID()`), the new
  `videoUrl`/`width`/`height`/`durationMs`, and **`words: []`,
  `overlays: []`** — i.e. a full reset, not a merge.

## Files created
`apps/web/src/components/upload/UploadDropzone.tsx`.

## Files modified
`apps/web/src/App.tsx` (mounts `UploadDropzone`).

## Why we chose this approach
Uploading a genuinely different video invalidates any existing transcript
(the words belong to the old video's audio) — resetting `words`/`overlays`
avoids showing stale captions against new footage. Reading metadata via a
real `<video>` element gives accurate dimensions/duration without a backend
round-trip, which matters for the player aspect ratio (milestone 09) and
future transcription requests.

## Alternatives considered
No alternative was formally documented.

## Important constraints
This is a **local-only** replacement of the project's video reference. It
does not upload anything to S3 or any backend, and does not trigger
transcription, vision, or audio analysis — those are P1's pipeline, not yet
wired from `apps/web`.

## Integration boundary
Dispatches `SET_PROJECT` (milestone 02's reducer, still schema-validated).
The resulting empty `words`/`overlays` is the exact point where a real
upload-to-pipeline integration (P1) would need to hook in: upload the file,
await the pipeline's transcript, then dispatch `SET_PROJECT` (or a new
action) with the real words instead of `[]`.

## Decisions future developers must preserve
- Keep revoking the previous blob URL on replacement, to avoid leaking
  object URLs.
- Keep the video-type check and the metadata-read timeout guard.
- When wiring the real backend upload, preserve the "new video invalidates
  old words/overlays" behavior unless product requirements change.

## Verification
"Not verified from repository history" — no test or explicit verification
notes recorded in this commit message.

## Known limitations / deferred work
No upload progress UI (there is nothing to upload to yet). No file-size
limit enforced. No backend call — see Important constraints.

## Future integration
P1's `services/api` pipeline is the intended target for the actual file
upload and transcript generation; this component currently only proves out
the local file-handling and metadata-extraction UX ahead of that
integration.

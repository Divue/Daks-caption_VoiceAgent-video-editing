# Talk-and-Edit Phase 6 — you could not actually hang up

## Status
Fixed and verified in headless Chromium against the running stack, with the LiveKit server itself
as ground truth for "is anyone still connected". The failing case was reproduced against the OLD
code as a control before the fix was trusted. **Not verified:** a real microphone in a real
browser, where the permission prompt makes the race window far wider than headless can.

## Objective
Reported by the repo owner: "there's still nowhere to disconnect from the voice agent." An earlier
phase had checked that the button's label toggled Start → Stop → Start and declared it fixed. The
label was never the problem.

## Implementation

### What was actually wrong
Starting voice is a chain of awaits: mic permission → token from the API → WebRTC `room.connect`
→ enable the mic. `stop()` only closed whatever existed *at that moment*, then set the UI to idle.
A click during the chain — exactly when someone clicks again, because the button looked the same —
left `start()` running. Three ways that leaked a live microphone behind a button saying
"Start voice input":

1. **Stop during permission or the token fetch** → no room existed yet to close → `start()` went on
   to connect a LiveKit room with the mic enabled. Confirmed on the server: a room with a connected
   user and agent, left over from a real session.
2. **Stop during `room.connect`** → the connect failed because stop had closed the room → `start()`
   read that as "LiveKit unavailable" and **fell back to browser speech recognition** — mic live
   again, sending speech to the agent.
3. **A late `Disconnected` event** from a replaced room, or a late `onend` from a replaced browser
   recogniser, reset the UI to idle *after a new session had started*, orphaning that one too.

In every case clicking the button again started a SECOND session; the first was unreachable.

And separately, nothing on screen said "click here to hang up": the live button showed the same
microphone glyph as the idle one, distinguished only by a fill and a pulse.

### The fix
- **Session token.** `start()` claims a session number; `stop()` bumps it. After every await,
  `start()` checks it still owns the session and, if not, tears down what it built and returns
  `'cancelled'`. A start overtaken by stop never falls back to anything.
- **Stale handlers are ignored.** LiveKit and browser-recogniser callbacks check they belong to the
  current room/recogniser before touching state or submitting speech.
- **Starting twice is stopping the first** — never two sessions.
- **A `connecting` state**, so the multi-second start is visible and cancellable.
- **Hanging up is obvious and available three ways:** the mic button shows a stop square whenever
  the mic is open (including while the agent is working); a "Stop listening · Esc" button sits in
  the status line whenever the mic is on, even while the line is showing the agent's work or an
  interim transcript; and Esc stops from anywhere, including mid-connect.

## Files Created
- This audit.

## Files Modified
Structural:
- `apps/web/src/hooks/useVoiceInput.ts` — session token, stale-handler guards, `connecting`.
- `apps/web/src/components/agent/MicButton.tsx` — stop square while live; connecting spinner.

Additive:
- `apps/web/src/App.tsx` — one `micIsOn` definition shared by button, link and Esc; Esc handler;
  `'cancelled'` start result logs nothing.
- `apps/web/src/components/agent/AgentCommandBar.tsx` — always-visible "Stop listening · Esc".
- `apps/web/src/components/agent/AgentActivityPanel.tsx` — "Connecting the microphone…" headline.
- `apps/web/src/hooks/useAgentActivity.ts` — `MicStatus` gains `connecting`.

## Files Intentionally Untouched
- `services/voice-agent/` — the worker already leaves when the user does (verified in phase 2:
  "closing agent session due to participant disconnect"). The leak was entirely client-side.
- `services/api/app/agent/livekit_token.py` — minting a token is not where the race is.
- `useAgentCommand.ts` — stopping the mic deliberately does not cancel a turn in flight.

## Architecture
```
start()  ── session = ++n ── await permission ── still n? ── await token ── still n?
                                                  │                          │
stop()   ── n++ ── close room/recogniser ── idle  └── no → return 'cancelled' (never fall back)
```
NEW: the session counter and the `connecting` state. REUSED: LiveKit's `disconnect()` (which stops
local tracks), the existing transcript and interim plumbing.

## Interfaces / Contracts
- `MicStatus` gains `'connecting'`.
- `VoiceStartResult` gains `'cancelled'` (a start overtaken by stop).
- `AgentCommandBar` gains a required `onStopMic` prop.
- Keyboard: Esc ends a voice session whenever one is open or connecting.

## Ownership
All changes are in `apps/web/**` — P3, in lane. No backend, schema or voice-worker change.

## Validation
- A cancelled start never reaches the browser-speech fallback.
- `stop()` is idempotent and safe during any stage of `start()`.
- The Stop button and Esc are only offered when there is something to stop.

## Security
Privacy-relevant, which is why it matters beyond UX: before this, the UI could say the microphone
was off while audio was still being captured and streamed to LiveKit and AWS Transcribe. After the
fix, "off" on screen means off on the server — checked against the LiveKit server's own participant
list, not against the button.

## Testing
- Web: `tsc -b` clean, `check:agent` + `check:captions` pass (72 assertions), `npm run build`
  clean, oxlint 19 (unchanged baseline).
- Backend untouched and re-run anyway: agent suite **324 checks**, pytest **95 passed**.

## Live Verification
Headless Chromium with a fake microphone, LiveKit dev server as ground truth
(`list_rooms` + `list_participants` via `livekit-api`), and browser speech recognisers counted by
wrapping `webkitSpeechRecognition`:
- **Timing sweep**, stop at 0/20/60/120/250/500/1000 ms after start: 0 rooms and 0 live recognisers
  left in every case. Before the fix, 0 ms and 20 ms left a live browser recogniser, with the log
  reading "Voice input stopped → Listening (browser speech recognition)".
- **Realistic timing** (token fetch slowed to 1.5 s): stop during the fetch and during the connect
  both leave nothing connected.
- **Control:** the same "stop during token fetch" test against the previous hook → **1 room still
  connected**, button reading "Start voice input". The fixed hook → 0. The test detects the bug.
- "Stop listening" link visible while live and ends the session; Esc ends it both while live and
  while connecting; the live icon is `lucide-square`.

## Unverified / Untestable
1. A real microphone in a real browser. The permission prompt can take seconds, so the real window
   is much wider than headless — the realistic-timing test approximates it, not reproduces it.
2. Browser speech recognition actually transcribing. Headless starts the recogniser but hears
   nothing; the test only counts starts and stops.
3. The "stop during connect" leak specifically in the OLD code reproduced at 0–20 ms (fallback path)
   but not at 1.7 s under slowed timing; both paths are exercised by the fixed code's tests.

## Integration Status
Voice start/stop, connecting state, Stop link, Esc: connected and browser-verified against the
LiveKit server. Spoken use: not verified.

## Dependencies / Blockers
None.

## Deviations
- The phase-4 audit said the mic "toggles fine (you hit the pre-fix build)". That was wrong: it
  checked the label, and the label was never the bug. Corrected here rather than rewritten there.
- Escape was added as a global shortcut while the mic is on. It is not bound otherwise.

## Git / Change Scope
Branch `p3-agent-talk-edit`, on top of `d5a6e08`. `git diff --stat` before commit: exactly the six
source files listed above plus this audit and `INDEX.md`; no unrelated files.

## Next Steps
1. Click the mic, then click it again before it finishes connecting, in a real browser — then check
   the tab's own recording indicator goes away (owner: whoever demos).
2. Consider a visible browser-level indicator check in the demo script — the tab's red recording
   dot is the ground truth a user trusts most.

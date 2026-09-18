# 16 — Editor UI critique, and what to do about it

**Method:** a full screenshot of `/editor` in fixture mode at 1516×784, judged against what this
product actually is. **Date:** 2026-09-18. **Status:** critique written first, fixes tracked in §4.

Read `DESIGN.md` for the design language. This document is allowed to go past it where the
language and the product disagree — DESIGN.md is a teardown of a *marketing site*, and an editor
is not a marketing site.

---

## 1. The one thing that explains most of the ugliness

**We are not a video editor, and the UI keeps pretending we are.**

`CLAUDE.md` cuts general video editing from scope explicitly: no cuts, no object tracking, no
Step Functions. The nouns in this product are exactly four — **the frame, the caption blocks, the
style, the agent**. There are no clips, no layers, no tracks.

Yet the bottom third of the screen is a Premiere impression: a Video 1 track, an Audio 1 track, a
per-track mute/lock/visibility column, and an eight-button editing toolbar (scissors, split, link,
shuffle, wand, file, music, speed). **Every one of those controls is inert.** They do nothing and
will never do anything, because the features they imply are out of scope.

That is the source of the "AI generated" read the whole screen has. It is not the colour or the
spacing. It is that the interface is describing a product we are not building, so none of it means
anything, and meaningless UI always looks generic — there is no idea in it to look at.

Everything in §2 is downstream of this.

---

## 2. The verdict, element by element

Severity: **F** = delete or rebuild, **D** = bad, fix properly, **C** = mediocre, worth a pass.

### The timeline strip — the worst area on screen

| # | Element | Grade | The charge |
|---|---|---|---|
| 1 | Editing toolbar (8 icons) | **F** | Scissors, split, link, shuffle, wand, file, music, gauge. All inert, all the same visual weight, no labels, no grouping. It is a picture of a toolbar. Delete it. |
| 2 | `Video 1` / `Audio 1` tracks | **F** | Two empty coloured bars with a label and nothing in them — no waveform, no thumbnails, no clips, and never will be. They exist to make the app look like an NLE. Delete them. |
| 3 | Track header column | **F** | `⋮⋮ T C. 🔊 🔒 👁` — six glyphs in 110px, four of them inert, and the track name truncated to **"C."**, **"V."**, **"A."**, which is not a name, it is a typo. |
| 4 | Time ruler | **D** | `00:00.000 00:00.500 00:01.000 …` — 24 labels, millisecond precision, every half second. Nobody editing captions needs `.000`. It is the single densest, noisiest thing on screen and it is labelling the least interesting axis. |
| 5 | Caption chips | **D** | Identical amber rectangles with a 1px border, evenly sized, sorted left to right. They look like toolbar buttons from 1998, and — the real failure — **they carry none of the information the product is about.** You cannot see tone or emphasis in the one view that shows the whole video. |
| 6 | Zoom slider | **C** | A slider plus two magnifier buttons for a control nobody will touch twice, with an **orange** thumb pulling the eye to the least important widget in the frame. |

### Colour

| # | Element | Grade | The charge |
|---|---|---|---|
| 7 | Orange everywhere | **D** | Export, CC, mic, send, zoom thumb, playhead, every caption chip, every emphasis pill, the sidebar mark, the header stripe, the transport fill. When the accent is on everything it accents nothing, and the screen reads as "a theme" rather than as a tool. Orange should mark **the playhead, the primary action, and the current selection.** That is all. |
| 8 | Caption chips + emphasis pills sharing orange | **D** | Two unrelated meanings, one colour. |

### The right-hand style panel

| # | Element | Grade | The charge |
|---|---|---|---|
| 9 | Weight segmented control | **D** | Six options — Light / Regular / Semi / Bold / Extra / Black — in ~35px each. Unreadable, and untappable on anything but a mouse. |
| 10 | Label hierarchy | **D** | `TEXT` (section) and `Font family` / `Weight` / `Face` / `Size` (fields) are nearly the same size and weight, so a long panel reads as one undifferentiated list. Sections do not group; they just occur. |
| 11 | Scope tabs | **C** | "All captions / This word" is the most important control in the panel — it decides what a drag will change — and it is a small grey box-in-box that looks like a segmented filter. |

### Everything else

| # | Element | Grade | The charge |
|---|---|---|---|
| 12 | Video stage framing | **C** | A rounded card, inside it a dark well, inside that a rounded video frame. Three nested containers around the one thing the user is actually looking at. |
| 13 | Left nav rail | **C** | 176px, permanently, for Home / Projects / Templates — all inert — plus Editor, which is where you already are. |
| 14 | Caption list rows | **C** | Single-word blocks ("ho", "mila", "yaar") each take a full 32px row with ~80% of the width empty. |
| 15 | My legend | **D** | `word emphasised TONE per line` crammed under the search box reads as debug output. The right fix is a list that does not need a legend. |
| 16 | Agent suggestions | **C** | "Add a zoom effect", "Change to karaoke style" — neither exists. Suggesting features we do not have is the same sin as §1, in miniature. |

---

## 3. What to do instead

### 3.1 Replace the timeline with a **caption ribbon**

> **Revised after review.** The first cut of this deleted the video and audio lanes outright. That
> over-read the brief: "that area looks ugly" meant fix it, not remove it, and an editor with no
> lanes at all reads as missing rather than focused. The lanes are back. What stayed deleted is the
> part that was actually ugly — the eight inert toolbar buttons and the mute/lock/visibility gutter
> that squeezed the lane names down to "C." / "V." / "A.".

One strip whose top lane does the real work: *where are the captions, what tone are they, and where
is the playhead.* Below it, the video and audio the captions sit on.

- **Three lanes**, named in full, with no inert per-track controls.
- **Blocks as segments** positioned by time, showing their text, sized by duration.
- **Tone is the segment's colour** — a muted tint, not a badge: neutral reads as plain surface,
  angry and excited get a low-saturation wash. Now the whole video's emotional shape is legible
  at a glance, which is the actual product pitch.
- **Emphasis is visible in the segment** — the emphasised word rendered brighter/heavier inside it.
- **Adaptive ruler**: `0:05` / `0:10`, spaced by whatever keeps labels ~90px apart at the current
  zoom. Never milliseconds.
- **The playhead is the only orange thing in the strip.**

This is smaller, more honest, and tells the user something the caption list cannot: the *rhythm* of
the video. It is also less code.

### 3.2 Spend the reclaimed vertical space on the frame

The stage is the product. Drop one layer of framing, let the frame grow.

### 3.3 Put orange on a budget

Three uses: **playhead, primary action, current selection.** Everything else becomes the warm
neutral scale. Emphasis in the caption list becomes weight + a white chip, not an orange one —
which also fixes §8, since then only one thing in the list is coloured: tone.

### 3.4 Give the style panel a real hierarchy

Section headers get the eyebrow treatment and a rule; field labels drop to muted 11px. The weight
control becomes a dropdown (six items is a list, not a segmented control). The scope switch becomes
a full-width two-up control at the very top, visually louder than anything below it.

### 3.5 Collapse the nav rail to icons

56px, icons only, tooltips. It is navigation for a product with one page.

---

## 4. Fixes applied

Tracked here so the next session can see what was taken and what was left.

- [x] 3.1 caption ribbon is the top lane; video/audio lanes kept but rebuilt; toolbar and the
      mute/lock/visibility gutter deleted
- [x] 3.2 stage framing reduced, frame grows
- [x] 3.3 orange budget
- [x] 3.4 style panel hierarchy + weight dropdown + scope switch
- [x] 3.5 nav rail to icons
- [x] §15 legend deleted (the ribbon and the list carry their own meaning)
- [x] §16 agent suggestions replaced with things this app can actually do (emphasis, shake,
      preset switch, size/position) — the old set offered a zoom effect and a karaoke style
- [x] §2.4 ruler timecode: `00:00.500` -> `0:00`, ticks spaced 96px instead of 64px
- [x] §2.16 CC toggle off the accent colour

**Not done:** the caption list's single-word rows (§2.14) still take a full row each. Fixing that
means variable row heights or a denser layout, and the list is also the click target for seeking —
worth its own pass rather than a squeeze here.

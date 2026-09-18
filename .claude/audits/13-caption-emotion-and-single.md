# 13 — Editable caption emotion + `Word.single` (P3, with a schema change)

**Area:** `packages/shared/src/{project,blocks}.ts`, `services/api/app/{schema.py,routers/projects.py}`,
`apps/web/src/{App.tsx,lib/emotion.ts,hooks/useWordPatch.ts,state/word-patch-context.tsx,
components/transcript/CaptionList.tsx,components/inspector/WordInspector.tsx,components/ui/dropdown-menu.tsx}`.
**Status:** built; `apps/web` typechecks, builds and lints clean; 54/54 API tests pass on moto.
Block grouping verified by direct execution against `demo-project.json` (below). **Not run against
the live API.** **Branch:** `p3-editor`. **Date:** 2026-09-18.

## 1. What shipped

Three edits, all reaching the stored Project:

| feature | where | what it writes |
|---|---|---|
| line emotion | tone badge in the captions panel, now a menu | `emotion` on **every word** of the block |
| word emotion | chevron menu on each word; also the inspector | `emotion` on one word |
| Single | same chevron menu; also an inspector switch | `single: true` on one word |

## 2. The schema change (lead-approved this session)

`Word.single?: boolean` — `project.ts` and `schema.py` changed together, plus the API's `WordPatch`
(which is `extra="forbid"`, so the field had to be added there or every PATCH carrying it would 422).

**It is grouping, not style.** `lib/caption-style.ts` does not read it; `deriveBlocks` does. A style
override could not express it: `Style` has no notion of which words share a block.

Optional, like `emoji` — absent and `false` mean the same. The editor sends `null` to turn it off, so
the key is removed rather than accumulating `"single": false`. That matters because `GET /projects/{id}`
dumps with `exclude_none` and the zod schema's `.optional()` **rejects** an explicit null; a test pins
`"null" not in body.text`.

## 3. `deriveBlocks` rule 4

A block now also breaks when the word is `single`, or the previous word was — fencing it on both sides,
so it lands in a block of exactly one and its neighbours regroup without it. `CaptionBlock` gained
`isSingle`, which exists for one reason: **`mergeShortBlocks` must never merge a single block.** Most
single-word blocks are under `MIN_BLOCK_MS` (250 ms), so without the guard the merge pass would silently
undo the feature for exactly the short words a user is most likely to pull out.

Measured against `demo-project.json` (`maxWords: 4`, merge on), `*` = `isSingle`:

```
baseline       [Hello] [bhai log kaise ho] [aaj ek banda mila] ...
single=w3      [Hello] [bhai] *[log] [kaise ho] [aaj ek banda mila] ...
short single   same, with w3 shortened to 80 ms — survives the merge pass
w3=angry       [Hello] [bhai] [log] [kaise ho] ...      (split, not marked single)
toggled off    byte-identical to baseline
```

**P2:** `deriveBlocks` is the shared grouping function your composition imports, so rule 4 arrives for
free — but `CaptionBlock` now has `isSingle`, and a single word's block is one word wide.

## 4. Why word emotion splits the line (decision, not a bug)

Rule 3 has always broken a block on a tone change, so a block's tone is uniform *by construction*.
Setting one word of "oh my god" to angry therefore yields `[oh my] [god]`, and the row numbers shift.
The alternative — dropping rule 3 so a line can hold mixed tones — was considered and rejected this
session: it changes what P2 renders from and leaves `CaptionBlock.tone` meaningless. The list re-flowing
as you edit is the honest view of a derived grouping.

## 5. Writes are now serialised (this is load-bearing)

Setting a line's emotion is N PATCHes; there is no bulk endpoint. `version` is one counter the server
bumps per write, and each write must carry the version the previous one returned.

`useWordPatchState` now puts **every** word write through one promise queue, threading `version` through
a ref (a queued write needs a value no render has published yet). The previous code aborted the in-flight
request instead — which does **not** cancel the server-side write, only the client's knowledge of the new
version, so the next write 409'd. That was reachable before this feature by typing in the inspector's
text field; line emotion makes it the normal path.

The queue's guarantee is per hook **instance**, so the hook is mounted once by `WordPatchProvider`
(`state/word-patch-context.tsx`) and shared. Two callers (`WordInspector`, `CaptionList`) each calling
the hook would be two queues racing each other back into the same 409s.

On any failure the chain stops and refetches: a multi-word edit can fail halfway, and the server is the
only honest answer about which words actually changed.

## 6. Not done

- **No bulk endpoint.** A 5-word line is 5 sequential round trips. `patchWords` is the one call site to
  swap if P1 lands `PATCH /projects/{id}/words`.
- **The text input still PATCHes per keystroke.** The queue makes it correct, not cheap; it wants a
  debounce (see the integration review's Blocker 4).
- **`Word.style` clearing is still broken** and untouched here — `StyleOverrideFields` emits `undefined`
  for a removed key, which `JSON.stringify` drops, so the server never sees the removal. Separate fix.
- **Undo/redo is still local-only**, so Ctrl+Z on a line emotion reverts the editor and not the server.
- **`single` is not rendered differently by the preview** beyond being its own block — no separate
  animation or placement. P2 may want one.

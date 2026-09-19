import type { LayerItem } from '@captions/shared'

/**
 * Everything about media layers that is arithmetic rather than UI: what is on screen at a time,
 * where it sits in the frame, and how trim / split / move change an item.
 *
 * Pure and dependency-free on purpose. The editor preview, the Remotion export and the tests all
 * import THIS, so the three can never disagree about where a sticker is or which frame of a clip
 * shows. The agent's Python tools implement the same rules (services/api/app/agent/tools/
 * layer_tools.py) and are tested against the same cases.
 *
 * The model (see `LayerItem` in packages/shared/src/project.ts): placement in OUTPUT time
 * (startMs..endMs), source trim in SOURCE time (trimStartMs), transform in FRAME space.
 */

/** A new image stays up this long unless the user drags it longer. */
export const DEFAULT_IMAGE_MS = 3000
/** No item may be shorter than this: a sliver is invisible on the timeline and impossible to grab. */
export const MIN_ITEM_MS = 100

export type LayerTrack = LayerItem['track']

export function itemDuration(item: LayerItem): number {
  return item.endMs - item.startMs
}

/**
 * Items on screen at `timeMs`, in DRAWING order: track 1 before track 2 (so 2 is on top), and
 * within a track, list order. End-exclusive, matching how captions treat `endMs`.
 */
export function activeLayerItems(items: readonly LayerItem[] | undefined, timeMs: number): LayerItem[] {
  return (items ?? [])
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.startMs <= timeMs && timeMs < item.endMs)
    .sort((a, b) => a.item.track - b.item.track || a.index - b.index)
    .map(({ item }) => item)
}

/** The moment of the SOURCE a video item shows at output time `timeMs`. */
export function sourceTimeMs(item: LayerItem, timeMs: number): number {
  return item.trimStartMs + Math.max(0, timeMs - item.startMs)
}

export interface LayerBox {
  left: number
  top: number
  width: number
  height: number
  rotation: number
  opacity: number
}

/**
 * The item's box in pixels inside a frame of `frameWidth` × `frameHeight`. `x`/`y` are the
 * CENTRE; the height comes from the source's own aspect, so an item can be scaled but never
 * stretched out of shape.
 */
export function layerBox(item: LayerItem, frameWidth: number, frameHeight: number): LayerBox {
  const width = (item.width / 100) * frameWidth
  const height = width / item.aspect
  return {
    left: (item.x / 100) * frameWidth - width / 2,
    top: (item.y / 100) * frameHeight - height / 2,
    width,
    height,
    rotation: item.rotation,
    opacity: item.opacity,
  }
}

/** The same box as a CSS style — one definition for the preview and the export. */
export function layerBoxStyle(item: LayerItem, frameWidth: number, frameHeight: number) {
  const box = layerBox(item, frameWidth, frameHeight)
  return {
    position: 'absolute' as const,
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    opacity: box.opacity,
    transform: box.rotation ? `rotate(${box.rotation}deg)` : undefined,
    transformOrigin: 'center center',
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** The ranges the schema allows, so every UI and agent write lands inside them. */
export function clampTransform(item: LayerItem): LayerItem {
  return {
    ...item,
    x: clamp(item.x, -50, 150),
    y: clamp(item.y, -50, 150),
    width: clamp(item.width, 1, 400),
    rotation: clamp(item.rotation, -360, 360),
    opacity: clamp(item.opacity, 0, 1),
  }
}

/** The latest a video item's placement may end, given how much source is left after its trim. */
function sourceLimitEnd(item: LayerItem): number {
  if (item.kind !== 'video' || item.sourceDurationMs === undefined) return Number.POSITIVE_INFINITY
  return item.startMs + (item.sourceDurationMs - item.trimStartMs)
}

/**
 * Slide the whole item along the timeline. Its length and its trim are untouched — moving a clip
 * never changes WHICH part of it plays.
 */
export function moveItemTo(item: LayerItem, startMs: number, projectDurationMs: number): LayerItem {
  const length = itemDuration(item)
  const start = Math.round(clamp(startMs, 0, Math.max(0, projectDurationMs - length)))
  return { ...item, startMs: start, endMs: start + length }
}

/**
 * Drag the LEFT edge to `startMs`. For a video this also moves the source in-point by the same
 * amount — the frame under the right edge stays put, which is what a trim handle means in every
 * editor. It cannot pull in source that is not there (trimStartMs never goes below 0).
 */
export function trimItemStart(item: LayerItem, startMs: number): LayerItem {
  let start = Math.round(clamp(startMs, 0, item.endMs - MIN_ITEM_MS))
  if (item.kind === 'video') start = Math.max(start, item.startMs - item.trimStartMs)
  const delta = start - item.startMs
  return {
    ...item,
    startMs: start,
    trimStartMs: item.kind === 'video' ? item.trimStartMs + delta : item.trimStartMs,
  }
}

/** Drag the RIGHT edge to `endMs`. A video cannot run past the end of its own source. */
export function trimItemEnd(item: LayerItem, endMs: number, projectDurationMs: number): LayerItem {
  const max = Math.min(projectDurationMs, sourceLimitEnd(item))
  return { ...item, endMs: Math.round(clamp(endMs, item.startMs + MIN_ITEM_MS, max)) }
}

/**
 * Cut an item in two at `atMs` (output time). Both halves share the source: the second starts
 * where the first stops, and for a video its trim advances by exactly the first half's length,
 * so playback across the cut is seamless until one half is moved. Returns null when the cut
 * would leave a half shorter than MIN_ITEM_MS — the editor refuses rather than making a sliver.
 */
export function splitItem(item: LayerItem, atMs: number, newId: string): [LayerItem, LayerItem] | null {
  const at = Math.round(atMs)
  if (at - item.startMs < MIN_ITEM_MS || item.endMs - at < MIN_ITEM_MS) return null
  const first: LayerItem = { ...item, endMs: at }
  const second: LayerItem = {
    ...item,
    id: newId,
    startMs: at,
    trimStartMs: item.kind === 'video' ? item.trimStartMs + (at - item.startMs) : item.trimStartMs,
  }
  return [first, second]
}

/** `L1`, `L2`, … — short, stable, and readable in the activity log and by the agent. */
export function nextLayerId(items: readonly LayerItem[] | undefined): string {
  const used = (items ?? []).map((item) => Number(/^L(\d+)$/.exec(item.id)?.[1] ?? 0))
  return `L${Math.max(0, ...used) + 1}`
}

function overlaps(items: readonly LayerItem[], track: LayerTrack, startMs: number, endMs: number) {
  return items.some((item) => item.track === track && item.startMs < endMs && startMs < item.endMs)
}

export interface NewLayerMedia {
  mediaId: string
  kind: LayerItem['kind']
  name?: string
  aspect: number
  sourceDurationMs?: number
}

/**
 * A freshly uploaded file, placed at the playhead. It goes on track 1 unless something is already
 * there at that time, then track 2 — the way a second clip dropped on a busy timeline stacks on
 * top instead of silently covering the first. Sized to be clearly visible but obviously an
 * overlay: an image a third of the frame wide, a video just under half.
 */
export function newLayerItem(
  media: NewLayerMedia,
  existing: readonly LayerItem[] | undefined,
  playheadMs: number,
  projectDurationMs: number,
): LayerItem {
  const items = existing ?? []
  const wanted = media.kind === 'video' ? (media.sourceDurationMs ?? DEFAULT_IMAGE_MS) : DEFAULT_IMAGE_MS
  const startMs = Math.round(clamp(playheadMs, 0, Math.max(0, projectDurationMs - MIN_ITEM_MS)))
  const endMs = Math.round(Math.min(projectDurationMs, startMs + wanted))
  const track: LayerTrack = overlaps(items, 1, startMs, endMs) && !overlaps(items, 2, startMs, endMs) ? 2 : 1
  return {
    id: nextLayerId(items),
    track,
    kind: media.kind,
    mediaId: media.mediaId,
    ...(media.name ? { name: media.name.slice(0, 120) } : {}),
    startMs,
    endMs: Math.max(endMs, startMs + MIN_ITEM_MS),
    trimStartMs: 0,
    ...(media.sourceDurationMs ? { sourceDurationMs: Math.round(media.sourceDurationMs) } : {}),
    x: 50,
    y: 40,
    width: media.kind === 'video' ? 45 : 33,
    aspect: media.aspect,
    rotation: 0,
    opacity: 1,
    muted: true,
  }
}

/** Replace one item by id; every other item is returned untouched and in place. */
export function replaceItem(items: readonly LayerItem[], next: LayerItem): LayerItem[] {
  return items.map((item) => (item.id === next.id ? next : item))
}

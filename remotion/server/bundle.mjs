import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundle } from '@remotion/bundler'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(HERE, '..')
/** The editor's source. The composition imports the REAL caption renderer from here, not a copy. */
export const WEB_SRC = path.resolve(ROOT, '../apps/web/src')

/**
 * Bundles the composition. Done once at server start and reused by every render, because bundling
 * (webpack over the editor's caption code) is by far the slowest part and never changes between renders.
 */
export async function bundleComposition(onProgress = () => {}) {
  return bundle({
    entryPoint: path.join(ROOT, 'src/index.ts'),
    outDir: path.join(ROOT, 'out/bundle'),
    onProgress,
    // `@/…` is how the editor's own files import each other; without this alias the caption renderer
    // (and everything it pulls in) would not resolve here.
    webpackOverride: (config) => ({
      ...config,
      resolve: { ...config.resolve, alias: { ...(config.resolve?.alias ?? {}), '@': WEB_SRC } },
    }),
  })
}

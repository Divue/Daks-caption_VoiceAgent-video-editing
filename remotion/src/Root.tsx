import { Composition } from 'remotion'
import { Project } from '@captions/shared'
import demoProject from '@captions/shared/fixtures/demo-project.json'
import { CaptionVideo } from './CaptionVideo'
import type { CaptionVideoProps } from './CaptionVideo'

export const COMPOSITION_ID = 'CaptionVideo'

/** Only used when the composition is opened without props; every real render passes its own. */
const placeholder: CaptionVideoProps = { project: demoProject, videoUrl: '', fps: 30 }

export function Root() {
  return (
    <Composition
      id={COMPOSITION_ID}
      component={CaptionVideo}
      defaultProps={placeholder}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={30}
      // The size, frame rate and length are the SOURCE VIDEO's, not constants: a 16:9 clip must export
      // as 16:9 and a 25 fps clip as 25 fps. Everything is taken from the props of the render.
      calculateMetadata={({ props }) => {
        const project = Project.parse(props.project)
        const fps = props.fps > 0 ? props.fps : 30
        // H.264 needs even dimensions; a source that probes as 479 px wide would otherwise fail the whole
        // render. Rounding DOWN costs at most one black pixel column/row.
        const even = (n: number) => Math.max(2, n - (n % 2))
        return {
          width: even(project.width),
          height: even(project.height),
          fps,
          durationInFrames: Math.max(1, Math.round((project.durationMs / 1000) * fps)),
        }
      }}
    />
  )
}

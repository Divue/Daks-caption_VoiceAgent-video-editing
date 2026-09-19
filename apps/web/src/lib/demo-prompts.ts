// The eleven demo commands, mirrored from `services/api/scripts/agent_demo.py`.
//
// That script is the integration test for the agent's tool SELECTION: every command below has
// been run for real against Bedrock and checked against what the agent must actually DO. So the
// strings here are transcribed character for character from `PROMPTS` in that file — a reworded
// prompt is an untested prompt, and the demo stops being a demo of something that works.
//
// KEEP IN SYNC. If `agent_demo.py` gains, loses or edits a prompt, this file changes in the same
// PR. `scripts/check-agent-apply.ts` asserts the shape of this list (eleven entries, non-empty,
// unique, exactly one refusal) so a half-done edit fails the check rather than shipping quietly.
//
// Prompt 11 is a DELIBERATE REFUSAL. Cutting and transitions are out of scope, and the agent is
// expected to answer `status="unsupported"`. It is in the list because a demo that only shows
// successes hides the failure mode — but the UI must label it as a refusal and never present it
// as a capability we have.
//
// Prompt 5 ("make that line angry") is the deixis case: it only means anything when the editor
// sends the block under the playhead along with the command, which `App` already does.

export interface DemoPrompt {
  /** Prompt number in `agent_demo.py`, kept so the two lists can be compared by eye. */
  n: number
  title: string
  /** The exact tested input. Copy it verbatim; do not reword. */
  command: string
  /** Why the prompt is in the demo — what it proves about the agent. */
  why: string
  tags: string[]
}

/** The tag `agent_demo.py` puts on the prompt that must be refused. */
export const REFUSAL_TAG = 'honesty'

export const DEMO_PROMPTS: DemoPrompt[] = [
  {
    n: 1,
    title: 'Restyle everything',
    command: 'make all the captions yellow',
    why:
      'The simplest possible win, and it proves the plural tool surface: 16 words ' +
      'change in ONE tool call and ONE bulk write, not 16 round trips.',
    tags: ['style', 'bulk'],
  },
  {
    n: 2,
    title: 'Switch the look',
    command: 'switch to the Chamak preset',
    why: 'One project-level patch. Shows the whole caption look changing at once.',
    tags: ['preset'],
  },
  {
    n: 3,
    title: 'Find a word by what it says',
    command: 'make the word bekaar red',
    why:
      'The agent has to resolve text to a word id with find_words — it is never ' +
      'allowed to guess or count. Exactly one word should change.',
    tags: ['resolve'],
  },
  {
    n: 4,
    title: 'Emoji on a word',
    command: 'put a fire emoji on the word bekaar',
    why: 'A per-word field that is not style. Also the first thing a creator asks for.',
    tags: ['emoji'],
  },
  {
    n: 5,
    title: "Deixis — 'that line'",
    command: 'make that line angry',
    why:
      "THE voice moment. 'That line' means nothing without context, so the editor " +
      'sends the block under the playhead already resolved to word ids. The agent ' +
      'never counts lines — they re-split as soon as a tone changes.',
    tags: ['deixis', 'emotion'],
  },
  {
    n: 6,
    title: 'Fix the sync',
    command: 'the captions are running early, push them 200 milliseconds later',
    why:
      'Timing across the whole transcript. A real complaint about real reels, and ' +
      'one tool call moves every word without touching their durations.',
    tags: ['timing'],
  },
  {
    n: 7,
    title: 'Turn a layer off',
    command: 'stop making things red',
    why:
      'The right answer is the emotion LAYER toggle, not repainting words one by ' +
      'one. Tests whether the agent reaches for the project-level switch.',
    tags: ['settings'],
  },
  {
    n: 8,
    title: 'Reason about the audio',
    command: 'emphasise the loudest word in every line',
    why:
      'Uses the prosody signals the pipeline measured (loudness, pitch, duration), ' +
      'with the same stress formula the renderer uses. Note: on this fixture the ' +
      'pipeline already emphasised every peak, so the honest answer is to say so ' +
      'rather than emit patches that change nothing.',
    tags: ['prosody'],
  },
  {
    n: 9,
    title: 'Reshape the captions',
    command: 'fewer words per line — show two at a time',
    why:
      'wordsPerLine is a PRESET field, not a word field. Impossible until we stored ' +
      'preset overrides on the Project; one integer that changes the whole shape of ' +
      'the output.',
    tags: ['preset-override'],
  },
  {
    n: 10,
    title: 'The distinction that matters',
    command: 'make the emphasised words bigger and put them in Anton',
    why:
      "The hardest one. 'Make EVERY word Anton' is a per-word style write; 'make the " +
      "EMPHASISED words Anton' is a conditional rule that also applies to words that " +
      'are not emphasised yet. Getting this wrong looks right on screen and is wrong ' +
      'on the next word the pipeline promotes.',
    tags: ['preset-override', 'hard'],
  },
  {
    n: 11,
    title: 'Saying no',
    command: 'cut the first two seconds of the video and add a whoosh transition',
    why:
      'Cutting and transitions are out of scope. The agent must refuse rather than ' +
      'approximate it with a tool that does something else. A demo without this is ' +
      'a demo that hides the failure mode.',
    tags: [REFUSAL_TAG],
  },
]

/** True for the prompt the agent is supposed to refuse. Never chip it as if it will work. */
export function isRefusalPrompt(prompt: DemoPrompt): boolean {
  return prompt.tags.includes(REFUSAL_TAG)
}

/**
 * The three shown inline in the command bar. One tone edit that needs the playhead (the voice
 * moment), one whole-look change, one that reshapes the output — three different capability
 * classes, short enough to sit on one line. The rest are one click away, and the refusal is
 * deliberately not among them.
 */
export const DEFAULT_CHIP_NUMBERS = [5, 2, 9] as const

export const DEFAULT_CHIPS: DemoPrompt[] = DEFAULT_CHIP_NUMBERS.map((n) => {
  const prompt = DEMO_PROMPTS.find((p) => p.n === n)
  if (!prompt) throw new Error(`demo-prompts: no prompt ${n}`)
  return prompt
})

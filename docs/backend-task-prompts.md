# Backend Task Prompts

Use these prompts one at a time with Claude Code. Do not paste the next task until the previous task is implemented, tested, and documented.

The backend lives in `services/api`. The shared data contract lives in `packages/shared/src/project.ts` and is mirrored by `services/api/app/schema.py`.

## Global Prompt Prefix

Paste this before every backend task:

```text
Read `CLAUDE.md`, `.claude/rules.md`, `README.md`, `services/api/README.md`, `packages/shared/src/project.ts`, and `services/api/app/schema.py`.

You are working only in `services/api` unless I explicitly approve another folder.

Build one thing only. Before coding, explain:
1. What files you will edit.
2. What behavior you will add.
3. What test or command will prove it works.

After coding, run the test/check. If it fails, fix it before moving on.

Rules:
- Maintain docs for every change.
- Keep every file under 800 lines.
- Keep route handlers thin and reusable logic in modules.
- Return/validate the shared Project schema whenever project data is involved.
- Do not edit `packages/shared` unless I explicitly ask.
```

## Task 1: FastAPI App Skeleton

```text
Create the minimal FastAPI backend skeleton.

Requirements:
- Add `app/main.py`.
- Add a `GET /health` endpoint returning `{ "ok": true, "service": "api" }`.
- Add a simple app factory if useful, but keep it readable.
- Add tests for `/health`.
- Add pytest/httpx or FastAPI TestClient dependencies if needed.
- Update `services/api/README.md` with setup and test commands.

Verification:
- Run the backend test suite.
- Also show the command to run the API locally with uvicorn.

Stop after this task is complete and tested.
```

## Task 2: Demo Project Endpoint

```text
Add a read-only endpoint that returns the demo project fixture.

Requirements:
- Add `GET /projects/demo`.
- Load `packages/shared/fixtures/demo-project.json`.
- Validate it with `Project` from `app/schema.py` before returning.
- Keep fixture-loading logic reusable in a service module, not inside the route handler.
- Add tests proving `/projects/demo` returns valid Project JSON.
- Update backend docs with the route.

Verification:
- Run all backend tests.
- Confirm the response validates against the Pydantic Project model.

Stop after this task is complete and tested.
```

## Task 3: Project Validation Service

```text
Create reusable project validation/building helpers.

Requirements:
- Add a service module for project validation.
- Provide a function that accepts raw dict data and returns a validated `Project`.
- Add clear errors for invalid project data.
- Add tests with:
  - the valid demo fixture
  - at least one invalid fixture case
- Do not change the shared schema.
- Update docs describing where validation lives.

Verification:
- Run all backend tests.

Stop after this task is complete and tested.
```

## Task 4: Local Upload Endpoint Returning Demo Project

```text
Add a first upload endpoint without real processing yet.

Requirements:
- Add `POST /projects/upload`.
- Accept one uploaded video file.
- Validate content type or extension for common video files: mp4, mov, webm.
- Save the file under a local ignored storage path inside `services/api/storage/uploads`.
- Return a validated Project JSON for now, using the demo fixture, but set `videoUrl` to the saved local file path or local URL placeholder.
- Keep file saving in a reusable media service.
- Add API tests for successful upload and invalid file type.
- Update `.gitignore` if needed so uploaded media is not committed.
- Update docs with the endpoint behavior and current limitation.

Verification:
- Run all backend tests.
- Manually confirm a test upload writes a file to the ignored storage path if the test uses real temp storage.

Stop after this task is complete and tested.
```

## Task 5: Media Metadata Helper

```text
Add media metadata extraction.

Requirements:
- Create a media helper that can read video duration, width, and height.
- Prefer `ffprobe` through a small wrapper.
- If ffprobe is missing, fail with a clear error message.
- Add tests for command parsing or wrapper behavior using mocks, so tests do not require a real video yet.
- Do not wire this into upload processing until the helper is tested.
- Update docs with the ffmpeg/ffprobe requirement.

Verification:
- Run all backend tests.

Stop after this task is complete and tested.
```

## Task 6: Audio Extraction Helper

```text
Add audio extraction from video.

Requirements:
- Create a helper that calls ffmpeg to extract mono 16kHz wav audio.
- Function shape should be reusable: input video path, output audio path.
- Add tests using mocks for subprocess behavior.
- Return clear errors when ffmpeg fails.
- Do not add transcription yet.
- Update docs with the generated audio path and requirement.

Verification:
- Run all backend tests.

Stop after this task is complete and tested.
```

## Task 7: Transcription Interface With Fake Provider

```text
Create the transcription abstraction but use a fake provider first.

Requirements:
- Add a transcription module with a provider interface.
- Define a normalized word timestamp object: text, startMs, endMs.
- Implement a fake provider that returns a small fixed Hinglish transcript.
- Add tests for normalized timestamps.
- Do not call AWS yet.
- Update docs explaining fake provider and future AWS Transcribe provider.

Verification:
- Run all backend tests.

Stop after this task is complete and tested.
```

## Task 8: Project Builder From Transcript

```text
Build a valid Project JSON from transcript words.

Requirements:
- Add a project builder module.
- Input: project id, videoUrl, durationMs, width, height, transcript words.
- Output: validated `Project`.
- Default preset: `kathmandu`.
- Default settings: emojis true, emotionLayer true.
- For each word, set emphasis false, emotion neutral, stretch 1.
- Generate stable word ids like `w1`, `w2`.
- Add tests that output validates against `Project`.
- Update docs.

Verification:
- Run all backend tests.

Stop after this task is complete and tested.
```

## Task 9: Wire Upload To Fake Pipeline

```text
Wire upload into a fake end-to-end pipeline.

Requirements:
- `POST /projects/upload` should save the video, get metadata if available, use fake transcription, build a validated Project, and return it.
- If metadata extraction is not possible in tests, use controlled fallback values only in test/fake mode.
- Keep orchestration in a pipeline service, not the route handler.
- Add tests for the endpoint using the fake provider.
- Update docs with the current fake-pipeline behavior.

Verification:
- Run all backend tests.

Stop after this task is complete and tested.
```

## Task 10: Prosody Signal Module

```text
Add the prosody analysis module.

Requirements:
- Create a module that calculates or assigns per-word `loudnessZ`, `pitchZ`, and `durationRatio`.
- For the first version, make the algorithm testable and allow a fake/deterministic path.
- Add pure unit tests for durationRatio and z-score behavior.
- Do not require real audio in the main test suite unless a tiny committed fixture exists.
- Update docs with the first-version detection rules.

Verification:
- Run all backend tests.

Stop after this task is complete and tested.
```

## Task 11: Emotion And Emphasis Tagging

```text
Add rule-based emotion and emphasis tagging.

Requirements:
- Use signals to set:
  - stretch from durationRatio
  - emphasis from loudnessZ or pitchZ
  - angry from loudnessZ and pitchZ thresholds
  - excited for stretched/high-pitch words if appropriate
- Keep thresholds configurable constants.
- Cap angry phrases conservatively for MVP if implemented.
- Add unit tests for neutral, emphasis, angry, excited, and stretch cases.
- Update docs with thresholds and limitations.

Verification:
- Run all backend tests.

Stop after this task is complete and tested.
```

## Task 12: AWS Transcribe Provider Stub

```text
Add an AWS Transcribe provider module behind the existing transcription interface.

Requirements:
- Do not make it the default provider yet.
- Read required config from environment variables.
- Keep AWS-specific code isolated.
- Add tests using mocks, not real AWS calls.
- Document required env vars and current status.
- Keep fake provider as the default for local tests.

Verification:
- Run all backend tests.

Stop after this task is complete and tested.
```

## Task 13: Storage Abstraction

```text
Add a storage abstraction for local files now and S3 later.

Requirements:
- Define a storage interface for saving uploaded media and returning a URL/key.
- Implement local storage.
- Add an S3 class stub only if useful, but do not require AWS in tests.
- Update upload pipeline to use the storage abstraction.
- Add tests for local storage.
- Update docs.

Verification:
- Run all backend tests.

Stop after this task is complete and tested.
```

## Task 14: Project Persistence

```text
Add project persistence abstraction.

Requirements:
- Define a repository interface for saving and loading Project JSON.
- Implement local JSON persistence first.
- Add `GET /projects/{project_id}`.
- Ensure loaded projects validate against `Project`.
- Add tests for save/load and endpoint behavior.
- Document local persistence and future DynamoDB swap.

Verification:
- Run all backend tests.

Stop after this task is complete and tested.
```

## Task 15: Agent Patch Models

```text
Start the voice-agent backend with typed patch models only.

Requirements:
- Work inside `services/api/app/agent`.
- Define typed patch models for:
  - update word style/emotion
  - apply preset
  - add overlay
- Add validation against existing `Project` schema.
- Add tests for valid and invalid patches.
- Do not call Bedrock yet.
- Update docs for agent patch format.

Verification:
- Run all backend tests.

Stop after this task is complete and tested.
```

## Task 16: Agent Tools Without LLM

```text
Implement deterministic agent tools without Bedrock.

Requirements:
- Implement:
  - get_timeline
  - find_words
  - update_style
  - apply_preset
  - add_overlay
- Tools should operate on a Project and return an updated validated Project or patch result.
- Add tests using the demo fixture.
- Keep all tool functions reusable and independent from FastAPI.
- Update docs.

Verification:
- Run all backend tests.

Stop after this task is complete and tested.
```

## Task 17: Agent Command Endpoint With Typed Commands

```text
Add a non-LLM agent endpoint that accepts typed command JSON.

Requirements:
- Add `POST /agent/command`.
- Input includes project JSON and a typed command.
- Apply deterministic tools from the previous task.
- Return updated validated Project plus a step log.
- Add endpoint tests.
- Update docs with example requests.

Verification:
- Run all backend tests.

Stop after this task is complete and tested.
```

## Task 18: Bedrock Tool Loop

```text
Add Bedrock Converse integration behind the agent command interface.

Requirements:
- Keep Bedrock optional and disabled in tests.
- Read model/region config from environment variables.
- Wrap transcript/project context as data, not instructions.
- Only allow known tool calls.
- Validate every tool call before applying it.
- Return a step log.
- Add mocked tests for tool-call handling.
- Update docs with env vars, safety rules, and limitations.

Verification:
- Run all backend tests.

Stop after this task is complete and tested.
```

## Task 19: Vision Placement Stub

```text
Add locate-in-frame interface and deterministic fallback.

Requirements:
- Define `locate_in_frame(t, description)` interface.
- Implement a fake deterministic provider for demo/testing.
- Prepare a Rekognition provider stub without requiring AWS in tests.
- Wire it to `add_overlay` flow where possible.
- Add tests.
- Update docs.

Verification:
- Run all backend tests.

Stop after this task is complete and tested.
```

## Task 20: Backend Readiness Pass

```text
Do a backend readiness pass.

Requirements:
- Review all files for the 800-line limit.
- Ensure modules are reusable and route handlers are thin.
- Ensure every endpoint is documented in `services/api/README.md`.
- Ensure all project outputs validate against `Project`.
- Add any missing tests for current behavior.
- Do not add new product features in this task.

Verification:
- Run all backend tests.
- Report remaining gaps and next recommended backend work.

Stop after this task is complete and tested.
```

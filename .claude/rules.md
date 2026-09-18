# Claude Code Rules

These rules apply to every Claude Code session in this repo.

## Start Of Every Task
- Read `CLAUDE.md`, `README.md`, and the folder README for the area you are editing.
- If the task touches project data, read `packages/shared/src/project.ts` and `services/api/app/schema.py`.
- State the exact task you are doing, the files you expect to edit, and the test you will run before moving on.
- Work only inside the folder owned by the task unless the human explicitly approves otherwise.

## Build One Thing At A Time
- Implement exactly one small feature per task.
- Do not begin the next feature until the current feature has been tested.
- If a test fails, fix the current feature before continuing.
- Keep changes easy to review: no broad refactors during feature work.

## Code Quality
- Keep files under 800 lines. If a file is approaching that limit, split reusable logic into focused modules.
- Prefer small reusable functions and service modules over long route handlers.
- Keep route files thin: validate input, call service logic, return response.
- Keep business logic out of `main.py`.
- Add types everywhere practical.
- Avoid hidden global state except app configuration.
- Use clear names that match the project language: `Project`, `Word`, `Overlay`, `Preset`, `prosody`, `transcription`, `agent`.

## Backend Rules
- The backend must return data that validates against `services/api/app/schema.py`.
- The source of truth for project data is the shared `Project` JSON contract.
- Times are integers in milliseconds.
- Positions `x` and `y` are percentages from 0 to 100.
- Do not invent response shapes if a `Project` or documented DTO can be used.
- Add tests for every backend module or endpoint before moving to the next task.
- Use the fixture at `packages/shared/fixtures/demo-project.json` before real video data.

## Docs
- Every feature must update docs in the same task.
- For backend work, keep `services/api/README.md` current.
- If adding setup, commands, env vars, routes, or known limitations, document them.
- If adding a new module, briefly document its responsibility.

## Testing Gate
Before saying a task is done, run the smallest useful verification:

- Unit tests for pure logic.
- API tests for endpoints.
- Schema validation for generated project JSON.
- Manual command only when automation is not available yet.

Report:

- What changed.
- What tests ran.
- What still does not exist.

## Safety
- Do not edit `packages/shared` unless the task is explicitly a schema/fixture task.
- Do not add auth, accounts, Step Functions, object tracking, or general video editing for MVP.
- Do not commit secrets, `.env`, media uploads, generated videos, or virtual environments.
- If a schema change seems necessary, stop and ask the human.

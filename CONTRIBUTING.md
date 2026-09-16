# Contributing to Invis

Welcome. Useful contributions include accessibility improvements, recording reliability, transcription providers, better meeting analysis, documentation, and tests that catch real user problems.

## Get started

1. Fork the repository once published and clone your fork.
2. Install Node.js 22.12+ and run `npm ci`.
3. Run `npm start`. Use local recording or import a synthetic transcript; an API key is optional for development.
4. Create a focused branch, make your change, and run `npm test` and `npm run check`.
5. Open a pull request describing the user-facing change, how it was verified, and any limitations. Add screenshots for interface changes.

For a substantial feature, open a feature request first so the scope and integration points can be discussed. Small fixes can go straight to a pull request.

## Project conventions

- Keep Electron privileges in the main process, exposed through narrow preload methods. Never enable Node integration in the renderer.
- Use `textContent` or DOM construction for user and AI text. Do not inject HTML from a transcript or model.
- Keep audio source identity separate from speaker identity. A microphone or system audio track does not identify a person.
- Preserve the original transcript when adding summaries or polished writing. Do not invent owners, deadlines, or meeting outcomes.
- Validate persisted input, constrain file paths, and keep API keys out of logs, renderer state, fixtures, screenshots, and commits.
- Use synthetic meeting content for tests. Avoid adding personal viva materials, recordings, API keys, exports, or local settings to the repository.
- Prefer small modules and provider adapters. New integrations should document their data flow and failure behavior.

## Verification

Unit and integration tests use fake provider responses and temporary directories. They must not spend API credits or require credentials. Manually verify relevant UI flows, keyboard access, empty states, permission denials, and cancellation. For recording work, check stop/restart, device disconnection, final transcription, playback, and reopening after a restart.

Use `INVIS_DATA_DIR=/path/to/temporary-directory npm start` for an isolated library. Use `npm run build:dir` to check packaging after dependency or entry-point changes. Platform-specific behavior should be tested on the affected OS.

## Review and community

Be respectful, describe reproducible problems, and critique the work rather than the person. Maintainers can ask for changes or decline a feature that does not fit the product. Contributions are provided under the repository's MIT license. Do not include work you do not have the right to share.

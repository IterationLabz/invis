# Invis Viva

An optional presentation and Q&A workspace. Run `npm run viva` from the repository; `npm start` opens the meeting workspace.

## Personalize

Follow the root README to create your own `system-prompt.local.md`. Add verified source facts in `viva/context.local.md` and optional rehearsal notes in `viva/presentation-script.local.md`. These files are ignored by Git. Restart the app after editing rehearsal materials. No personal context or preset persona is included.

An optional PDF can be placed at `resources/viva/presentation.pdf` for local use. PDFs are not bundled in public packages. The app does not extract PDF text; add relevant facts to your local context file.

## Use

Configure your Gemini API key in Settings. Presentation mode captures speech without automatic answers; switch to Q&A to generate answers from the selected audio source. Use headphones when capturing meeting audio. Command+B toggles visibility. Stop listening before leaving; export the session to keep its transcript and suggestions.

Audio and context used for AI features are sent to Gemini. Transcripts and notes stay in memory unless exported. Content protection does not guarantee invisibility in screen sharing. Obtain participants' permission before recording and follow the rules of your session.

## Checks

`npm run test:viva` runs offline tests. `npm run check:viva` makes live Gemini requests using your configured key. `node viva/check-audio.js` sends synthetic speech for a live transcription check on macOS. Live checks can incur provider charges.

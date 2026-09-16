# Architecture

Invis is a local Electron application. The public meeting app has no backend and does not depend on the legacy native addons.

| Module | Responsibility |
| --- | --- |
| `meetings/main.js` | Window lifecycle, trusted IPC, permissions, recording orchestration, secure settings, dialogs, and AI operations |
| `meetings/dock.js` | Floating control window, validated dock IPC, placement and collapsed bounds |
| `meetings/dock-renderer.js` | Dictation/meeting/AI actions, actual audio levels, timer, and recording feedback |
| `meetings/visibility.js` | Shared transparency and Command+B visibility for dock and workspace |
| `meetings/preload.js` | Explicit context-isolated bridge; no raw filesystem or arbitrary IPC access |
| `meetings/renderer.js` | Library, meeting tabs, audio devices, capture lifecycle, and rendering |
| `meetings/audio-worklet.js` | Converts captured audio to mono 16 kHz PCM packets |
| `meetings/recording.js` | Incremental WAV writer with recoverable headers |
| `meetings/store.js` | Local meeting CRUD, atomic JSON replacement, transcript limits, path validation, and exports |
| `meetings/provider.js` | Grounded requests, response validation, and Gemini generation adapter |
| `shared/transcriber.js` | Gemini live transcription, reconnect/renewal, source ordering, and capture finalization |
| `shared/defaults.js` | Model defaults shared with the existing viva workspace |

## Data flow

The floating strip has its own restricted preload bridge. It can request fixed actions and read recording status; it cannot read transcripts, access keys, or use the workspace’s privileged IPC. Command+B shows only the strip, and hides both windows when either is visible. The full workspace opens through an explicit dock action.

A deliberate recording action asks the OS for the selected audio inputs. The renderer passes audio-only streams to an AudioWorklet, which sends 100 ms PCM packets through the preload bridge. The main process writes one WAV per source and optionally streams those packets to Gemini. Video from the display picker is never connected to storage or an AI request.

Final transcript entries are saved immediately. Temporary transcript hypotheses remain UI-only. Stop sends an audio-stream-end event and waits briefly for final provider text before closing streams and recording files. A network failure stops transcription while local audio continues, with a visible error. A crash leaves playable WAV chunks, and startup recovers recording metadata.

Each meeting is a versioned JSON document with its own UUID. It references recordings by UUID, not arbitrary paths. Writes use a temporary sibling file and atomic rename. Unreadable documents are left intact and reported rather than silently deleted. On this initial version, large transcripts are bounded to one million characters and a single WAV to 1 GiB.

Analysis and chat run in the main process against a snapshot of one selected meeting. Transcript entries have stable evidence labels `[T1]`, `[T2]`, and so on; late-arriving audio does not renumber existing evidence. Results are merged into the latest document so recording updates are not overwritten. Responses are validated, source text is treated as data, and cancellation cannot save a stale result. The renderer displays model text as text.

## Extension points

To add a provider, implement a generation adapter with the same `generate` contract and a transcription adapter emitting `partial`, `transcript`, and `failure`. Keep provider credentials in the main process. Add contract tests for parsing, cancellation, and errors that must not expose secrets.

Future schema changes should introduce an explicit migration from `version: 1`, preserving original transcripts and existing audio. Add fixture-based migration tests before changing disk structure. A future local model should work through the same adapter interfaces rather than a separate UI.

## Packaging boundaries

`meetings/builder.json` is the default packaging allowlist. It includes `meetings/`, `shared/`, and package metadata. It excludes tests, personal viva sources, PDFs, backup files, native overlay code, and generated exports. `viva/builder.json` remains a separate optional legacy build.

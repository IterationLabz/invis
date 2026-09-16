# Security and privacy

Do not post API keys, private transcripts, personal recordings, or exploit details containing private data in public issues. Report security bugs through the repository host's private vulnerability reporting feature when enabled. Until a private reporting channel is configured, do not publish sensitive details; contact a maintainer privately through their published contact method.

The following protections describe the default meeting workspace. Its renderer is sandboxed with context isolation and no Node integration. The preload bridge exposes fixed methods. Main-process IPC validates the originating window and frame URL. Navigation and new windows are blocked. A restrictive content security policy permits only local app assets and the recording playback scheme.

API keys entered in Settings use Electron secure storage and are never returned to the renderer. Environment credentials remain in the main process. Gemini provider errors are normalized so credential-bearing URLs and raw response bodies are not displayed. Recording data stays local unless live transcription is selected. AI operations send meeting context to Gemini.

Local JSON and WAV files are not encrypted at rest. OS account security, backups, and disk encryption remain important. Exported files are independent copies. Meeting deletion does not remove exports or data previously sent to a provider.

## Legacy code limitations

The root-level legacy overlay is retained as historical source, is excluded from the default meeting package, and requires unpublished local modules to run. It does not meet the protections above: it exposes API keys to its renderer, renders messages as HTML, and uses predictable credential encryption with a plaintext fallback. Do not use it with credentials or untrusted content. These paths require security work before they can be supported publicly. The optional viva workspace also contains a reader for the older credential store; newly saved viva keys use Electron secure storage.

Maintainers should configure a private reporting channel and establish signing and distribution credentials. A successful local package build is not a signed or notarized release.

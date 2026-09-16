# Invis

<p align="center">
  <img src="resources/icons/invis.iconset/icon_512x512.png" alt="Invis app logo" width="160" height="160">
</p>

A calm, open-source voice workspace for being more present in conversations. Record meetings, keep searchable transcripts, find decisions and next steps, and ask questions grounded in what was actually said.

## Download Invis v1.0.0

[Download for macOS Apple Silicon (.dmg)](https://github.com/IterationLabz/invis/releases/download/v1.0.0/Invis-1.0.0-mac-arm64.dmg) · [All release files and checksums](https://github.com/IterationLabz/invis/releases/latest)

For Macs with an Apple M-series chip running **macOS 13 or newer**. Open the DMG, drag **Invis** to **Applications**, then launch it. Node.js and npm are not needed for the downloaded app. Press **Command+B** to reveal the floating controls, open the workspace, and configure your own Gemini key in **Settings**. See steps 2–5 below for first-use setup and an audio check.

This initial build is **unsigned and not notarized**; macOS may block opening it. It is an early release, not a signed production installer. Windows, Linux, and Intel Mac installers are not included in this release; use the source instructions below on those platforms. Download the ZIP if you prefer an app archive, and use the published SHA-256 checksums to verify downloads.

## What you can do

- **Meetings:** create and rename sessions, record microphone and meeting audio, and browse a searchable local library.
- **Transcripts:** transcribe live with Gemini or import TXT, Markdown, VTT, and SRT transcripts. Copy and export transcripts with their original wording.
- **Analysis:** generate a summary, decisions, action items with owners and deadlines when stated, and open questions. AI cites transcript entries and leaves missing information unspecified.
- **Ask AI:** ask follow-up questions about the selected meeting, with saved conversation history. Drafting an email never sends it.
- **Dictation:** record a voice note, polish its transcript, and copy the writing into another app.
- **Recordings:** play and export separate microphone and meeting WAV tracks. Audio is written incrementally, with recovery after an interrupted session.

This is a desktop foundation, not full feature parity with a commercial dictation product. System-wide text insertion, automatic speaker identification, calendar integrations, audio-file transcription, cloud sync, and a local/offline speech model are not implemented. Imported transcript timestamps and speaker labels are preserved as text.

## First-time setup

### 1. Install and launch

Download the macOS installer above, open it, and drag **Invis** into **Applications**. Launch Invis from Applications. No terminal commands or Node.js installation are needed for the downloaded app. AI features require an internet connection; local recording and transcript imports work offline.

If you want to run from source, follow [Development](#development). The default meeting workspace needs no native-addon rebuild. Windows and Linux still need platform testing.

### 2. Open the workspace

**Invis starts hidden.** Press **Command+B** on macOS or **Ctrl+B** on Windows/Linux to reveal the floating controls, then click the **workspace** icon to open your library. An empty library on first launch is expected.

### 3. Connect AI, or start without it

Open **Settings**, enter your own Gemini API key, and click **Save settings**. Your key needs access to the selected answer and live transcription models. Keep the defaults initially; if a model is unavailable for your account, enter a supported model ID for that operation. Gemini features require internet access and may incur provider charges.

To try Invis without a key, create a meeting and turn off **Live transcription** before recording. You can record, play back audio, import transcripts, write notes, and export locally. AI analysis, writing polish, and Ask AI require a key. Offline audio is saved as a recording; it is not automatically transcribed later.

### 4. Add your own prompt

This step is optional. Downloaded apps work without a custom prompt. For source checkouts, copy `system-prompt.example.md` to `system-prompt.local.md` in the repository root and write your instructions below the comment. Packaged apps currently require a launch environment setting to use a custom prompt; there is no prompt editor in Settings. See [Write your own system prompt](#write-your-own-system-prompt) for both options. Add meeting-specific context in Notes instead if you prefer to stay in the app.

### 5. Check your audio before a real meeting

1. Click **New meeting** and name it “Audio check”.
2. Select **Microphone** and choose the input device you actually use. Start recording and grant the requested microphone permission.
3. Speak for a few seconds and check that the microphone meter moves. With **Live transcription** enabled, check that words appear in **Transcript**.
4. Stop recording, open **Recordings**, and play the microphone track to confirm it is audible.
5. If you need other participants' audio, make a second test with **Meeting audio** selected. Choose a source in the sharing picker and enable audio sharing if offered. Play some audio and check its meter and saved track too.

Use headphones to reduce echo and duplicate speech. When changing OS permissions, quit and reopen Invis if the change does not take effect. Confirm both audio sources work before relying on them in a meeting.

## Everyday controls

The app starts hidden. Press **Command+B** on macOS (**Ctrl+B** on Windows/Linux) to show the floating control strip or hide both windows. From the strip, **Voice** starts a dictation, **Record meeting** opens source selection, **Ask AI** opens meeting questions, and the **workspace** icon opens your library. During recording, the strip shows real audio levels and elapsed time; the checkmark stops and saves. Drag the top grip to reposition it, or collapse it to a slim edge handle. The workspace's **Mini** button returns to the strip.

Use the header's **Transparency** slider to adjust both windows; the setting is saved across launches. Command+B restores a readable 20% transparency if the window was set to 95–100%. The window floats above other apps, and on macOS it is hidden from the Dock. Hiding does not stop an active recording; **Quit** stops and saves it before exiting. If the global shortcut is unavailable, Invis reports the problem and exits rather than leaving an inaccessible window running.

Content protection is enabled where supported. Some capture systems, including macOS ScreenCaptureKit, can still capture protected windows; this is not a guarantee of invisibility in screen sharing.

Open **Settings** and add your own Gemini API key to enable live transcription, analysis, and Ask AI. Alternatively, launch with `GEMINI_API_KEY` set in your shell environment. `.env` files are ignored but are not automatically loaded. Keys entered in Settings are encrypted using Electron's OS-backed secure storage. The default models are `gemini-3.5-flash` and `gemini-3.5-transcribe-live`; both can be changed in Settings.

Recording locally, importing transcripts, taking notes, and exporting do not require an API key. For an offline recording, leave **Live transcription** unchecked. The interface starts with an empty library; there are no invented meetings or simulated AI results.

## Write your own system prompt

Copy `system-prompt.example.md` to `system-prompt.local.md` in the repository root, then write your instructions below its comment. The local file is ignored by Git. There is no preset persona; without a custom prompt, AI features use only the app's task and response-format instructions.

Describe the assistant's purpose, preferred language, tone, answer length, and how to handle missing information. For meetings, ask it to cite transcript evidence, separate suggestions from confirmed decisions, and leave unknown owners or deadlines unspecified. Avoid putting API keys, passwords, or private personal details in prompts. Prompt contents are sent to the AI provider when you use AI features.

For example, you could write: “Help me review my meeting notes. Answer in concise English, cite the transcript, distinguish proposals from decisions, and say when information is missing.” This is an optional example, not a built-in prompt.

For packaged apps, set `INVIS_SYSTEM_PROMPT_FILE` to the absolute path of your Markdown prompt before launching the app from that environment. Custom prompts are not bundled. The meeting and viva workspaces load the prompt for each AI request. The legacy ChatHelper loads it on startup; its separate browser renderer has an empty system-message placeholder in `renderer.js`.

Viva users can add source facts in `viva/context.local.md` and rehearsal notes in `viva/presentation-script.local.md`. Both are ignored by Git. Meeting users can add session-specific facts in Notes. Required JSON fields remain controlled by the app so responses display correctly.

## A meeting from start to finish

1. Create a meeting and give it a title. Add an agenda or context in **Notes**, then click **Save notes**.
2. Let participants know, choose microphone and/or meeting audio, and start recording. Live transcription sends the selected audio to Gemini when enabled.
3. Stop to finish transcription and save the audio. Playback and WAV export are under Recordings.
4. Analyze the transcript for a summary, decisions, action items, and open questions.
5. Use Ask AI for follow-ups, then export Markdown or JSON.

Meeting audio depends on your OS, Electron support, and permissions. If a sharing picker provides no audio track, use a loopback input device. Microphone recording is independent of display capture. Windows and Linux build targets are configured but need platform testing.

## Other ways to use Invis

- **Already have a transcript?** Open a meeting, go to **Transcript**, and choose **Import file** or **Paste transcript**. Supported file types are TXT, Markdown, VTT, and SRT. Then use **Analyze meeting** or **Ask AI** if a key is configured.
- **Want to dictate a note?** Open **Dictation**, create a session, record your microphone with live transcription enabled, and stop when finished. Use **Polish writing**, then **Copy writing** to paste the result into another app. Invis does not insert text into other apps automatically.
- **Want to ask a follow-up?** Select a meeting with a transcript or saved notes, open **Ask AI**, enter a question, and click **Ask AI**. Review the answer against the source before using it.
- **Finished for the day?** Stop recording, export any copies you need, and click **Quit**. Meetings remain in your local library. **Hide** only changes visibility and does not stop recording.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| No window after launching | Press Command+B / Ctrl+B. If the terminal reports that the shortcut is unavailable, close the conflicting app or release that shortcut, then relaunch Invis. |
| Microphone meter stays flat | Select the correct input, check that it is not muted, and allow microphone access in your OS privacy settings. Restart Invis after changing permissions. |
| Meeting audio is silent | Confirm the selected source is playing audio and that the sharing picker supplied an audio track. If unsupported, select an installed loopback input as the microphone source. Invis does not install a loopback driver. |
| Audio records but no words appear | Enable Live transcription and verify your key, internet connection, and transcription model. Local recording alone does not produce text. |
| Key rejected, model unavailable, or quota error | Check the key and model IDs in Settings, and verify provider access and quota. For rate limits, wait before retrying. You can turn off live transcription and continue recording locally. |
| Analysis or Ask AI asks for context | Import or record a transcript, or add Notes and click Save notes. Make sure you have selected the intended meeting. |
| Custom prompt seems ignored | Check the filename is exactly `system-prompt.local.md`, place it beside `package.json`, and write instructions outside the HTML comment. Packaged apps need `INVIS_SYSTEM_PROMPT_FILE` set in their launch environment. |
| A `.env` file has no effect | Invis does not load `.env` files automatically. Enter your key in Settings or set the environment variable before launching. |
| Window is too transparent | Press Command+B / Ctrl+B to restore visibility if it is nearly invisible, then lower the Transparency slider. |

If the issue continues, open a bug report with your OS, Node.js version, the action that failed, and the error message. Remove API keys and private meeting content before sharing logs or screenshots.

## Data and privacy

Meeting JSON and WAV files live under `meetings/` inside Electron's user-data directory (on macOS, `~/Library/Application Support/Invis`). Settings are stored next to that directory. Recordings and transcripts are ordinary local files protected by filesystem permissions, not encrypted at rest. Choose **Delete meeting** to remove that meeting and its audio from the library and disk; exported copies remain where you saved them.

There is no Invis server or telemetry. Live transcription sends audio to Google's Gemini API. Analysis, writing polish, and Ask AI send the selected meeting's transcript and notes; Ask AI also sends recent questions and answers from that meeting. The provider's data terms and usage charges apply. No screen video is stored or sent. `INVIS_DATA_DIR` can point to a separate local data directory for development and tests.

## Development

Install Node.js 22.12 or newer with npm. Clone this repository and open a terminal in its root directory.

```sh
npm ci               # Install dependencies
npm start            # Launch from source
npm test              # Meeting, provider, recording, and existing viva regression tests
npm run check         # JavaScript syntax validation
npm run build:dir     # Build an unpacked desktop app for the current platform
npm run build         # Package the current platform target
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [ARCHITECTURE.md](ARCHITECTURE.md), and [SECURITY.md](SECURITY.md). Use the issue templates for a bug or feature proposal. The package uses an explicit allowlist so personal PDFs, test fixtures, exports, credentials, and legacy overlay code are not shipped with the meeting app.

The optional presentation workspace is available through `npm run viva` and `npm run test:viva`. It ships with empty personal-context templates. The legacy overlay's `npm run start:legacy` command is for private local checkouts only: it depends on an unpublished invisibility module and will not run from the public source alone. Its native addons require a separate macOS toolchain and `npm run rebuild:legacy`. The default meeting app does not load those addons. For public release, follow [OPEN_SOURCE_RELEASE.md](OPEN_SOURCE_RELEASE.md); the existing Git history contains private author metadata and old source snapshots.

## License

[MIT](LICENSE). Contributions are welcome under the same license.

## Authors

- [@iNotSoCrisp](https://github.com/iNotSoCrisp)
- [@mrgear111](https://github.com/mrgear111)
- [@NssGourav](https://github.com/NssGourav)

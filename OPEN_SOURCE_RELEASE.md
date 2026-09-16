# Public release

The current source uses generic templates. Existing Git history still contains personal author names, email addresses and earlier source snapshots. Ignoring or deleting a file does not remove it from old commits. Do not publish this repository's existing history as a sanitized release.

## Prepare a fresh publication

The private invisibility module (`window-privacy.js` and `native/window_privacy.mm`) stays local. `.gitignore` excludes it from a new repository, and `.gitattributes` excludes it from source archives. Do not force-add either file. Ignoring a file does not remove it from an existing Git index or history; always inspect the files staged in the new repository before committing.

The default meeting app does not require this module. The legacy overlay imports it and is not a self-contained public application without the private files. Standard Electron content protection and hide/show controls in the meeting and viva workspaces remain public.

1. Review `git status --short` and `git diff`, including untracked source files. Stage only the reviewed public source; do not force-add ignored files.
2. Inspect the staged tree for secrets and personal content, then commit the sanitized source locally.
3. Export that commit with `git archive HEAD` into a new, empty directory outside this checkout. An archive excludes `.git` and untracked local data. Inspect the exported files before proceeding.
4. Initialize a new Git repository in that directory. Configure a public-safe author name and email before the first commit, and retain applicable license notices and required attribution.
5. Run `npm ci`, `npm test`, `npm run check` and `npm run build:dir` in the clean checkout. Inspect the resulting application contents. Configure private vulnerability reporting and review dependency advisories before release.
6. Publish the new repository only after reviewing its files and author metadata. Do not copy the old `.git` directory or push old branches/tags.

Personal PDFs, slide decks, local prompts, recordings, exports, credentials and development backups are excluded from public packages. Existing local build output may contain older personal materials: rebuild from the sanitized checkout and distribute only the new artifacts.

If credentials were ever published, revoke them with the provider; removing source files or history does not revoke a key. Signing, notarization and platform-specific release testing remain separate release tasks.

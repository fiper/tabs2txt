# Tabs to TXT

A Firefox extension that writes the URLs of your open tabs to timestamped `.txt` files, on a schedule you choose. One file per window, no account, no server, nothing leaves the machine.

```
tab-backups/window1_2026-09-18_14-03-27.txt
tab-backups/window2_2026-09-18_14-03-27.txt
```

```text
# Tabs to TXT — saved 2026-09-18 14:03:27
# Window 1 of 2 — 3 tabs

https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions
https://github.com/mozilla/web-ext
https://news.ycombinator.com/
```

> Español: la guía paso a paso para construir y publicar este proyecto está en [`docs/GUIA-ES.md`](docs/GUIA-ES.md).

## Why

Session managers keep your tabs inside the browser. This one keeps them as plain text on disk, so a backup is grep-able, diff-able, syncable, and readable in ten years without Firefox.

## What it does

- Writes one `.txt` per open window, named `window1_YYYY-MM-DD_HH-MM-SS.txt`.
- Runs on a timer you set, from 1 minute to 24 hours.
- Saves into a folder of your choice inside the browser's download directory.
- Everything is configured in `about:addons`. The toolbar button holds a single switch: pause or resume.
- Optionally skips a run when no tab changed, so an idle browser stops producing identical files.
- Optionally keeps its own files out of the Downloads list, so the panel stays usable.
- Ignores tab groups on purpose: the unit is the window.

## Install

### From a release

1. Download `tabs_to_txt-<version>.zip` from [Releases](../../releases).
2. Open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick the zip.

A temporary add-on is removed when Firefox closes. For a permanent install the package has to be signed by Mozilla, either through [addons.mozilla.org](https://addons.mozilla.org) or with `web-ext sign`.

### From source

```bash
git clone https://github.com/YOUR_USER/tabs-to-txt.git
cd tabs-to-txt
npm install
npm start          # opens a clean Firefox profile with the extension loaded
```

## Before the first run

Firefox has to be allowed to save files without asking:

**Settings → General → Downloads** → choose **Save files to …** (not _Always ask you where to save files_). The folder picked there is the root that the extension's folder setting is relative to.

## Settings

| Setting                    | Default       | Notes                                                                |
| -------------------------- | ------------- | -------------------------------------------------------------------- |
| Save every                 | 15 minutes    | 1–1440. The countdown restarts whenever you save the settings.       |
| Folder                     | `tab-backups` | Relative to the browser's download directory. Nested paths are fine. |
| File name starts with      | `window`      | The window number and timestamp are appended.                        |
| Write a header             | on            | Two `#` comment lines with the date and window number.               |
| Write tab titles           | off           | Each title goes on a `#` line above its URL.                         |
| Skip unchanged runs        | on            | Compares the whole snapshot against the previous one.                |
| Include private windows    | off           | Also needs _Run in Private Windows_ enabled for the extension.       |
| Keep out of Downloads list | on            | Removes the download entry, never the file.                          |

Only `http`, `https`, `ftp` and `file` URLs are saved. `about:`, `moz-extension:` and similar internal pages are skipped.

## Limitations worth knowing

- **The target folder lives inside the download directory.** The WebExtensions `downloads` API rejects absolute paths and `..`, so an extension cannot write to an arbitrary location. To land the files elsewhere, put a symlink inside the download folder and point the setting at it:

  ```bash
  # macOS / Linux
  ln -s /mnt/backups/firefox ~/Downloads/tab-backups
  ```

  ```bat
  :: Windows, in an elevated prompt
  mklink /D "%USERPROFILE%\Downloads\tab-backups" "D:\backups\firefox"
  ```

- **Alarms are approximate.** Firefox may fire the timer late if the browser is busy or the machine was asleep, and the timer is recreated on each browser start.
- **Window numbering is not stable.** The browser reports windows in an order that can change between runs, so `window1` in one file set is not necessarily the same window as `window1` in the next.

## Privacy

The extension reads tab URLs and titles, writes them to disk, and stores its settings in `browser.storage.local`. There is no network code, no telemetry, and no remote endpoint. The manifest declares `data_collection_permissions: { required: ["none"] }`.

## Development

```bash
npm start        # run in a temporary Firefox profile
npm test         # unit tests for the naming/path logic
npm run lint     # eslint + prettier + addons-linter
npm run build    # dist/tabs_to_txt-<version>.zip
npm run icons    # regenerate src/icons from tools/make-icons.py
```

Layout:

```
src/
  manifest.json
  background/background.js   scheduling, writing files, badge state
  common/settings.js         defaults, storage access, validation
  common/naming.js           timestamps, path sanitising, file bodies (pure, tested)
  common/tabs.js             the window/tab snapshot
  popup/                     the pause/resume switch
  options/                   every setting, embedded in about:addons
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/); releases and the changelog are generated by release-please. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)

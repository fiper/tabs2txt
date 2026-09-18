# Contributing

Thanks for taking the time. Bug reports, small fixes and documentation changes are all welcome.

## Getting set up

```bash
git clone https://github.com/YOUR_USER/tabs-to-txt.git
cd tabs-to-txt
npm install        # also installs the git hooks
npm start          # launches Firefox with the extension loaded
```

`npm start` uses [web-ext](https://github.com/mozilla/web-ext): it opens a temporary profile and reloads the extension when you save a file. To use your own profile instead, go to `about:debugging` → **This Firefox** → **Load Temporary Add-on** and pick `src/manifest.json`.

Requirements: Node 20+, Firefox 140+, and Python with Pillow only if you need to regenerate the icons.

## Checks

Run these before opening a pull request; CI runs the same set.

```bash
npm test         # unit tests for src/common/naming.js
npm run lint     # eslint, prettier, and the AMO addons-linter
npm run build    # produces dist/tabs_to_txt-<version>.zip
```

The git hooks installed by `npm install` run `lint-staged` and the tests on commit, and validate the commit message.

## Where things live

Keep `src/` limited to what ships in the package. Tests, tooling and docs live outside it.

Business logic that does not need a browser API belongs in `src/common/naming.js` so it can be unit tested. Anything touching `browser.*` belongs in the background script or in a page script.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), validated by commitlint:

```
feat: let the user pick the file name prefix
fix: stop the alarm from drifting when the event page wakes up
docs: explain the symlink workaround for custom folders
chore(deps): bump web-ext to 8.4.0
```

The type decides the next version number, so it matters: `fix` bumps the patch, `feat` the minor, and `!` or a `BREAKING CHANGE` footer the major.

## Pull requests

- One topic per pull request.
- Fill in the checklist in the template, including which Firefox version you tested on.
- Update the README when you change behaviour or add a setting.
- Do not edit `CHANGELOG.md` or the version fields by hand; release-please owns both.

## Releases

Maintainers only. Merging to `main` makes release-please open a release pull request. Merging that pull request tags the release, writes the changelog and attaches the built package.

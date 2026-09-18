# Security policy

## Supported versions

The latest release is the only supported version. Report against `main` or the most recent tag.

## Reporting a vulnerability

Do not open a public issue.

Use GitHub's private reporting — **Security → Report a vulnerability** on this repository — or email YOUR_EMAIL.

Please include:

- what an attacker can do, and what they need in order to do it;
- the steps to reproduce it, with your Firefox and extension versions;
- the affected file or function, if you have already located it.

You can expect an acknowledgement within a week and an assessment within two. If the report is valid, a fix ships in the next release and the advisory credits you unless you ask otherwise. Please give the fix a chance to ship before publishing details.

## Scope

This extension reads tab URLs and titles, writes text files through the `downloads` API, and stores settings in `browser.storage.local`. It makes no network requests. Reports that are especially relevant:

- a path that escapes the download directory despite `sanitizeFolder()`;
- tab data reaching anything other than the local file it is meant for;
- private-window tabs being written when the setting is off.

Out of scope: the browser's own behaviour, the requirement that Firefox be configured not to ask where to save each file, and anything that depends on an attacker already controlling the machine.

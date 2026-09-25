# Plugin installation preview

These screenshots use a synthetic package and the real management application.
The browser test signs in, uploads a package, reviews its metadata, installs it,
and removes the unused package. No application restart occurs.

- [Upload or npm package](installer-upload.png)
- [Package review](installer-review.png)
- [Installed package](installed-plugin.png)

Run `yarn e2e e2e/pluginManagement.spec.ts` to repeat the flow.

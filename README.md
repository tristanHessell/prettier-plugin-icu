# prettier-plugin-icu

A Prettier 3 plugin that formats ICU message syntax in `FormattedMessage`
`defaultMessage`/`message` props and `defaultMessage` descriptors, including
descriptors passed to `intl.formatMessage()` or `intl.formattedMessage()`.
Messages are parsed with FormatJS; invalid messages and unrelated source are
left alone.

Run `git commit` without a message to write a Conventional Commit interactively.
To provide a message directly, use `git commit -m "type: description"`.

## Releasing

Run `npm version <version> --no-git-tag-version` to update `package.json` and
`package-lock.json`, then merge that change. Publish a GitHub Release from that
commit with a matching `v<version>` tag (for example, `v1.2.3`). The Publish
workflow checks the package and publishes that version to npm.

Before the first release, configure npm trusted publishing for this repository:

1. Make sure the `prettier-plugin-icu` package name is available and set up your
   npm account.
2. In the package's npm settings, add a GitHub Actions trusted publisher for
   this repository and the `publish.yml` workflow. Allow direct publishing with
   `npm publish`.
3. Publish a GitHub Release with a tag matching the version in `package.json`.

The workflow uses npm's OIDC trusted publishing and provenance; no npm token
needs to be stored in GitHub.

```js
import prettier from "prettier";
import icu from "prettier-plugin-icu";

const output = await prettier.format(source, {
  filepath: "messages.tsx",
  plugins: [icu],
});
```

The plugin wraps Prettier's built-in Babel and TypeScript parsers, so use the
normal `babel` or `typescript` parser selected by the file extension.

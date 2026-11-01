# prettier-plugin-icu

A Prettier 3 plugin that formats ICU message syntax in `FormattedMessage`
`defaultMessage`/`message` props and `defaultMessage` descriptors, including
descriptors passed to `intl.formatMessage()` or `intl.formattedMessage()`.
Messages are parsed with FormatJS; invalid messages and unrelated source are
left alone.

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

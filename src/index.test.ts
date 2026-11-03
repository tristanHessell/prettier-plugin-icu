import { describe, expect, it } from "vitest";
import prettier from "prettier";
import { parse as parseJavaScript } from "@babel/parser";
import { parse as parseIcu } from "@formatjs/icu-messageformat-parser";
import plugin from "./index.js";

async function format(code: string, filepath: string) {
  return prettier.format(code, {
    filepath,
    plugins: [plugin],
  });
}

describe("ICU message formatting", () => {
  it("formats FormattedMessage defaultMessage values in JSX", async () => {
    const result = await format(
      'const message = <FormattedMessage defaultMessage="{count, plural, one {one item} other {# items}}" />;',
      "example.jsx",
    );

    expect(result).toContain(
      'defaultMessage="{count, plural,\n  one   {one item}\n  other {# items}\n}"',
    );
  });

  it("uses the source indentation for multiline JSX messages", async () => {
    const result = await format(
      `function Example() {
  return (
      <FormattedMessage
        defaultMessage="{count, plural, one {# card} other {# cards}}"
      />
  );
}`,
      "example.jsx",
    );

    expect(result).toContain(
      'defaultMessage="{count, plural,\n          one   {# card}\n          other {# cards}\n        }"',
    );
  });

  it("aligns select and plural option blocks", async () => {
    const result = await format(
      'intl.formatMessage({ defaultMessage: "{name}, {count, plural, one {# point} other {# points}}" });',
      "example.js",
    );

    expect(result).toContain(
      "defaultMessage: `{name}, {count, plural,\n  one   {# point}\n  other {# points}\n}`",
    );
  });

  it.each([
    { options: { useTabs: true }, indentation: "\t" },
    { options: { tabWidth: 4 }, indentation: "    " },
  ])(
    "uses the configured indentation unit",
    async ({ options, indentation }) => {
      const result = await prettier.format(
        'intl.formatMessage({ defaultMessage: "{count, plural, one {one} other {#}}" });',
        { filepath: "example.js", plugins: [plugin], ...options },
      );

      expect(result).toContain(
        `plural,\n${indentation}one   {one}\n${indentation}other {#}\n}`,
      );
    },
  );

  it("formats FormattedMessage defaultMessage values without changing to template strings", async () => {
    const result = await format(
      "const message = <FormattedMessage defaultMessage='{count, plural, one {one item} other {# items}}' />;",
      "example.jsx",
    );

    expect(result).toContain(
      'defaultMessage="{count, plural,\n  one   {one item}\n  other {# items}\n}"',
    );
  });

  it("uses the configured JSX quote delimiter for FormattedMessage values", async () => {
    const result = await prettier.format(
      'const message = <FormattedMessage defaultMessage="{count, plural, one {one} other {#}}" />;',
      {
        filepath: "example.jsx",
        plugins: [plugin],
        jsxSingleQuote: true,
      },
    );

    expect(result).toContain(
      "defaultMessage='{count, plural,\n  one   {one}\n  other {#}\n}'",
    );
  });

  it("preserves apostrophes in FormattedMessage values", async () => {
    const result = await format(
      `<FormattedMessage defaultMessage="{name}'s hand" id="hand.playerTitle" values={{ name: ownerName }} />`,
      "example.jsx",
    );

    expect(result).toContain(`defaultMessage="{name}'s hand"`);
  });

  it("preserves quoted content in FormattedMessage attributes", async () => {
    const result = await format(
      'const message = <FormattedMessage defaultMessage="{name, select, other {say &quot;hi&quot; &amp; welcome}}" />;',
      "example.jsx",
    );

    expect(result).toContain(
      `defaultMessage='{name, select,\n  other {say "hi" &amp; welcome}\n}'`,
    );
  });

  it("formats expression-valued FormattedMessage props", async () => {
    const result = await format(
      'const message = <FormattedMessage defaultMessage={"{count, plural, one {one} other {#}}" } />;',
      "example.jsx",
    );

    expect(result).toContain(
      'defaultMessage={"{count, plural,\\n  one   {one}\\n  other {#}\\n}"}',
    );
  });

  it("formats message descriptors passed to intl.formatMessage", async () => {
    const result = await format(
      'intl.formatMessage({ defaultMessage: "{gender, select, male {He} female {She} other {They}}" });',
      "example.js",
    );

    expect(result).toContain(
      "defaultMessage: `{gender, select,\n  male   {He}\n  female {She}\n  other  {They}\n}`",
    );
  });

  it("uses the source indentation for formatted message descriptors", async () => {
    const result = await format(
      `intl.formatMessage({
          defaultMessage: '{name}, {type, select, computer {AI} other {human}}',
          id: 'player.avatar.label',
        });`,
      "example.js",
    );

    expect(result).toContain(
      "defaultMessage: `{name}, {type, select,\n            computer {AI}\n            other    {human}\n          }`",
    );
  });

  it("normalizes indentation in already multiline message descriptors", async () => {
    const source = `function Example() {
  if (true) {
    if (true) {
      return [
        {
          defaultMessage: \`{name}, {type, select,
            computer {AI}
            other    {human}
     }\`,
          id: 'player.avatar.label',
        },
      ];
    }
  }
}`;
    const result = await format(source, "example.js");

    expect(result).toContain(
      "defaultMessage: `{name}, {type, select,\n            computer {AI}\n            other    {human}\n          }`",
    );
    expect(await format(result, "example.js")).toBe(result);
  });

  it("formats direct intl.formattedMessage strings in TypeScript", async () => {
    const result = await format(
      'intl.formattedMessage("{count, plural, one {one} other {#}}");',
      "example.ts",
    );

    expect(result).toContain(
      "intl.formattedMessage(`{count, plural,\n  one   {one}\n  other {#}\n}`)",
    );
  });

  it("uses the source indentation for direct intl.formattedMessage strings", async () => {
    const result = await format(
      `function Example() {
  return intl.formattedMessage("{count, plural, one {one} other {#}}");
}`,
      "example.ts",
    );

    expect(result).toContain(
      "intl.formattedMessage(`{count, plural,\n    one   {one}\n    other {#}\n  }`)",
    );
  });

  it("uses the TypeScript parser when no filepath is provided", async () => {
    const result = await prettier.format(
      'const message: string = intl.formatMessage({ defaultMessage: "{count, plural, one {one} other {#}}" });',
      { parser: "typescript", plugins: [plugin] },
    );

    expect(result).toContain(
      "defaultMessage: `{count, plural,\n  one   {one}\n  other {#}\n}`",
    );
  });

  it("leaves ordinary text and invalid ICU messages unchanged", async () => {
    const result = await format(
      'const text = "hello"; const message = <FormattedMessage defaultMessage="{count, plural, one {item}}" />;',
      "example.jsx",
    );

    expect(result).toContain('const text = "hello"');
    expect(result).toContain('defaultMessage="{count, plural, one {item}}"');
  });

  it("escapes template interpolation and is idempotent", async () => {
    const once = await format(
      'intl.formatMessage({ defaultMessage: "{count, plural, one {${value}} other {#}}" });',
      "example.js",
    );
    const twice = await format(once, "example.js");

    expect(once).toContain("\\${value}");
    expect(twice).toBe(once);
  });

  it("preserves literal braces and number skeletons", async () => {
    const message =
      "{n, plural, one {'{name}' has one} other {# items for {name}}} {v, number, ::currency/USD}";
    const result = await format(
      `intl.formatMessage({ defaultMessage: ${JSON.stringify(message)} });`,
      "example.js",
    );
    const statement = parseJavaScript(result).program.body[0];
    if (statement.type !== "ExpressionStatement")
      throw new Error("Expected an expression");
    const call = statement.expression;
    if (call.type !== "CallExpression") throw new Error("Expected a call");
    const descriptor = call.arguments[0];
    if (!descriptor || descriptor.type !== "ObjectExpression")
      throw new Error("Expected a message descriptor");
    const property = descriptor.properties[0];
    if (
      property?.type !== "ObjectProperty" ||
      property.value.type !== "TemplateLiteral"
    )
      throw new Error("Expected a formatted template literal");
    const formattedMessage = property.value.quasis[0].value.cooked;

    expect(parseIcu(formattedMessage ?? "")).toEqual(parseIcu(message));
  });
});

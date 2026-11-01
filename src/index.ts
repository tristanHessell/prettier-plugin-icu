import * as sourceParser from "@babel/parser";
import {
  parse,
  TYPE,
  type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";
import babel from "prettier/plugins/babel";
import typescript from "prettier/plugins/typescript";
import type { Parser, ParserOptions } from "prettier";

type Node = {
  type?: string;
  start?: number;
  end?: number;
  [key: string]: unknown;
};

function formatLiteral(value: string, inPlural: boolean): string {
  return value
    .replaceAll("'", "''")
    .replaceAll("{", "'{'")
    .replaceAll("}", "'}'")
    .replaceAll("<", "'<'")
    .replaceAll(">", "'>'")
    .replaceAll("#", inPlural ? "'#'" : "#");
}

function formatStyle(style: unknown): string {
  if (typeof style === "string") return style;
  if (
    style &&
    typeof style === "object" &&
    "tokens" in style &&
    Array.isArray(style.tokens)
  ) {
    const tokens = style.tokens as { stem: string; options: string[] }[];
    return `::${tokens
      .map(
        ({ stem, options }) =>
          `${stem}${options.length ? `/${options.join("/")}` : ""}`,
      )
      .join(" ")}`;
  }
  throw new Error("Unsupported FormatJS style node");
}

function formatElements(
  elements: MessageFormatElement[],
  indent = 0,
  inPlural = false,
): string {
  return elements
    .map((element) => {
      switch (element.type) {
        case TYPE.literal:
          return formatLiteral(element.value, inPlural);
        case TYPE.argument:
          return `{${element.value}}`;
        case TYPE.number:
        case TYPE.date:
        case TYPE.time: {
          const type =
            element.type === TYPE.number
              ? "number"
              : element.type === TYPE.date
                ? "date"
                : "time";
          return `{${element.value}, ${type}${element.style ? `, ${formatStyle(element.style)}` : ""}}`;
        }
        case TYPE.pound:
          return "#";
        case TYPE.tag:
          return `<${element.value}>${formatElements(element.children, indent, inPlural)}</${element.value}>`;
        case TYPE.select:
        case TYPE.plural: {
          const type =
            element.type === TYPE.select
              ? "select"
              : element.pluralType === "ordinal"
                ? "selectordinal"
                : "plural";
          const offset =
            element.type === TYPE.plural && element.offset
              ? ` offset:${element.offset}`
              : "";
          const pad = " ".repeat(indent);
          const branchIndent = indent + 2;
          const branches = Object.entries(element.options).map(
            ([selector, option]) =>
              `${" ".repeat(branchIndent)}${selector} {${formatElements(option.value, branchIndent + 2, inPlural || element.type === TYPE.plural)}}`,
          );
          return `{${element.value}, ${type},${offset}\n${branches.join("\n")}\n${pad}}`;
        }
      }
    })
    .join("");
}

function staticString(node: Node): string | undefined {
  if (node.type === "StringLiteral" && typeof node.value === "string")
    return node.value;
  if (
    node.type === "TemplateLiteral" &&
    Array.isArray(node.expressions) &&
    node.expressions.length === 0 &&
    Array.isArray(node.quasis)
  ) {
    const quasi = node.quasis[0] as Node | undefined;
    const value = quasi?.value as { cooked?: unknown } | undefined;
    return typeof value?.cooked === "string" ? value.cooked : undefined;
  }
}

function propertyName(node: Node): string | undefined {
  if (node.type === "Identifier" || node.type === "JSXIdentifier") {
    return typeof node.name === "string" ? node.name : undefined;
  }
  if (node.type === "StringLiteral")
    return typeof node.value === "string" ? node.value : undefined;
}

function formatSource(
  source: string,
  filepath: string | undefined,
  parser: unknown,
): string {
  let ast: Node;
  try {
    const isTypeScript =
      parser === "typescript" ||
      parser === "babel-ts" ||
      /\.(?:ts|tsx|mts|cts)$/.test(filepath ?? "");
    ast = parseSource(source, isTypeScript);
  } catch {
    return source;
  }

  const candidates = new Map<string, { node: Node; jsxAttribute: boolean }>();
  const add = (value: unknown, jsxAttribute = false) => {
    if (value && typeof value === "object") {
      const node = value as Node;
      if (
        staticString(node) !== undefined &&
        node.start !== undefined &&
        node.end !== undefined
      ) {
        candidates.set(`${node.start}:${node.end}`, { node, jsxAttribute });
      }
    }
  };

  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as Node;

    if (node.type === "JSXOpeningElement" && Array.isArray(node.attributes)) {
      const name = node.name as Node;
      if (name.type === "JSXIdentifier" && name.name === "FormattedMessage") {
        for (const attr of node.attributes as Node[]) {
          if (
            attr.type === "JSXAttribute" &&
            ["defaultMessage", "message"].includes(
              propertyName(attr.name as Node) ?? "",
            )
          ) {
            const value = attr.value as Node;
            const isExpression = value.type === "JSXExpressionContainer";
            add(isExpression ? value.expression : value, !isExpression);
          }
        }
      }
    }

    if (
      node.type === "ObjectProperty" &&
      propertyName(node.key as Node) === "defaultMessage"
    ) {
      add(node.value);
    }

    if (node.type === "CallExpression") {
      const callee = node.callee as Node;
      const method =
        callee.type === "MemberExpression"
          ? propertyName(callee.property as Node)
          : "";
      if (["formatMessage", "formattedMessage"].includes(method ?? "")) {
        const args = node.arguments as Node[];
        if (
          args?.[0]?.type === "StringLiteral" ||
          args?.[0]?.type === "TemplateLiteral"
        )
          add(args[0]);
      }
    }

    for (const [key, child] of Object.entries(node)) {
      if (!["loc", "tokens", "comments", "extra"].includes(key)) visit(child);
    }
  };
  visit(ast);

  const edits: { start: number; end: number; text: string }[] = [];
  for (const { node, jsxAttribute } of candidates.values()) {
    const message = staticString(node);
    if (message === undefined) continue;
    let elements: MessageFormatElement[];
    try {
      elements = parse(message);
    } catch {
      continue;
    }
    const formatted = formatElements(elements);
    if (formatted !== message) {
      edits.push({
        start: node.start!,
        end: node.end!,
        text: `${jsxAttribute ? "{" : ""}\`${formatted
          .replaceAll("\\", "\\\\")
          .replaceAll("`", "\\`")
          .replaceAll("${", "\\${")
          .replaceAll("\r", "\\r")}\`${jsxAttribute ? "}" : ""}`,
      });
    }
  }

  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  }
  return source;
}

function parseSource(source: string, isTypeScript: boolean): Node {
  return babelParser(source, isTypeScript) as Node;
}

function babelParser(source: string, isTypeScript: boolean): unknown {
  // Preprocessing runs before Prettier builds its AST, so scan the source separately.
  return sourceParser.parse(source, {
    sourceType: "unambiguous",
    plugins: [
      ...(isTypeScript ? ["typescript" as const] : []),
      "jsx",
      "decorators-legacy",
    ],
  });
}

const preprocess = (text: string, options: ParserOptions) =>
  formatSource(text, options.filepath, options.parser);

function withPreprocess(parser: Parser): Parser {
  return { ...parser, preprocess };
}

export const parsers = {
  ...Object.fromEntries(
    Object.entries(babel.parsers).map(([name, parser]) => [
      name,
      withPreprocess(parser),
    ]),
  ),
  ...Object.fromEntries(
    Object.entries(typescript.parsers).map(([name, parser]) => [
      name,
      withPreprocess(parser),
    ]),
  ),
};

export default { parsers };

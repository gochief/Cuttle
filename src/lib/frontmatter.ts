import { parseDocument } from "yaml";
export function parseFrontmatter(text: string) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return {
    doc: parseDocument(match?.[1] || ""),
    body: match ? text.slice(match[0].length) : text,
  };
}

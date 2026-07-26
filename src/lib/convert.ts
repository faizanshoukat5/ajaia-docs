import { marked } from "marked";
import TurndownService from "turndown";
import { htmlToPlainText, sanitizeDocumentHtml } from "./sanitize";

/**
 * Format conversions in both directions.
 *
 * Import:  markdown/plain text -> HTML  (then always sanitized)
 * Export:  HTML -> markdown / plain text
 *
 * .docx import lives in `src/server/import.ts` because mammoth is server-only.
 */

/** Markdown -> sanitized document HTML. */
export function markdownToHtml(markdown: string): string {
  const raw = marked.parse(markdown, {
    async: false,
    gfm: true,
    breaks: false,
  }) as string;
  // marked will happily emit raw HTML embedded in the markdown, so sanitizing
  // afterwards is what makes this safe — not marked's own escaping.
  return sanitizeDocumentHtml(raw);
}

/**
 * Plain text -> sanitized document HTML.
 *
 * Blank-line-separated blocks become paragraphs and single newlines become hard
 * breaks, which is what a user importing a .txt file expects to see.
 */
export function plainTextToHtml(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n");
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  if (paragraphs.length === 0) return sanitizeDocumentHtml("");

  const html = paragraphs
    .map((block) => `<p>${block.split("\n").map(escapeHtml).join("<br />")}</p>`)
    .join("");
  return sanitizeDocumentHtml(html);
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let turndown: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (turndown) return turndown;
  turndown = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
  });
  // Turndown has no default handling for <u>, and markdown has no underline
  // syntax, so preserve the intent as inline HTML rather than dropping it.
  turndown.addRule("underline", {
    filter: ["u"],
    replacement: (content) => (content.trim() ? `<u>${content}</u>` : ""),
  });
  turndown.addRule("strikethrough", {
    filter: ["s", "del"],
    replacement: (content) => (content.trim() ? `~~${content}~~` : ""),
  });
  return turndown;
}

/** Document HTML -> Markdown, for the export flow. */
export function htmlToMarkdown(html: string): string {
  return getTurndown().turndown(html).trim();
}

/** Document HTML -> plain text, for the .txt export flow. */
export function htmlToText(html: string): string {
  return htmlToPlainText(html);
}

/**
 * Characters that must not reach a Content-Disposition filename: Unicode
 * "other" (control/format/surrogate) plus the set Windows and POSIX reject.
 *
 * Written as \p{C} rather than a hex range so the source stays plain ASCII.
 */
const UNSAFE_FILENAME_CHARS = /[\p{C}<>:"/\\|?*]+/gu;

/**
 * Builds a filesystem-safe download name from a document title. Unicode letters
 * are preserved; only genuinely unsafe characters are folded to a separator.
 * Falls back to `document` when nothing usable remains.
 */
export function toFilename(title: string, extension: string): string {
  const base = title
    .normalize("NFC")
    .replace(UNSAFE_FILENAME_CHARS, " ")
    .replace(/\s+/g, "-")
    // No leading/trailing dots or dashes — ".." and "-x" are both trouble.
    .replace(/^[-.]+/, "")
    .replace(/[-.]+$/, "")
    .slice(0, 80);
  const safe = base.length > 0 ? base : "document";
  return `${safe}.${extension}`;
}

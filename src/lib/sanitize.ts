import sanitizeHtml from "sanitize-html";

/**
 * The trust boundary for document content.
 *
 * Two untrusted sources produce HTML that we store and later render with
 * `dangerouslySetInnerHTML` / inject into the editor:
 *
 *   1. The browser editor (a client can PATCH any string it likes — TipTap being
 *      well-behaved is not a security property).
 *   2. Imported .docx / .md files, converted to HTML by mammoth / marked.
 *
 * Both go through `sanitizeDocumentHtml` on the *server* before they are ever
 * written. Sanitizing on write rather than on read means stored data is always
 * safe, so a future surface that forgets to sanitize cannot reintroduce the hole.
 *
 * The allowlist is intentionally the exact set of nodes the editor can produce —
 * no wider. Notably absent: <img>, <table>, <style>, <script>, <iframe>, inline
 * `style` attributes and all event handlers.
 */

/** Tags the editor can produce, and therefore the only tags we persist. */
const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "h1",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "a",
  "hr",
] as const;

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...ALLOWED_TAGS],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    // TipTap's code block writes `class="language-*"`. Harmless (we control the
    // stylesheet) and dropping it would lose the language on round-trip.
    code: ["class"],
    pre: ["class"],
  },
  // Anything not listed here — including `javascript:` and `data:` — is dropped.
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href"],
  // A protocol-relative `//evil.com` href is not a scheme match, so block it.
  allowProtocolRelative: false,
  // Drop the *content* of these, not just the tags, so `<script>alert(1)</script>`
  // does not leave `alert(1)` behind as visible text.
  nonTextTags: ["script", "style", "textarea", "option", "noscript"],
  // Discard comments; `<!--[if IE]>` conditional comments are an XSS vector in
  // older engines and mammoth/Word HTML is full of them.
  allowedIframeHostnames: [],
  transformTags: {
    // Any link that survives must be safe to click from a shared document.
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...(attribs.href ? { href: attribs.href } : {}),
        ...(attribs.title ? { title: attribs.title } : {}),
        target: "_blank",
        rel: "noopener noreferrer nofollow",
      },
    }),
    // Word exports h4-h6; the editor only offers three levels, so fold the rest
    // down to h3 instead of silently deleting the heading.
    h4: "h3",
    h5: "h3",
    h6: "h3",
    // Normalize legacy presentational tags onto the ones the editor understands.
    strike: "s",
    div: "p",
  },
};

/**
 * Sanitizes untrusted document HTML. Always returns a string that is safe to
 * render. An empty/whitespace-only result normalizes to a single empty paragraph
 * so the editor and the reader agree on what "empty" looks like.
 */
export function sanitizeDocumentHtml(input: string): string {
  const cleaned = sanitizeHtml(input, SANITIZE_OPTIONS).trim();
  if (cleaned.length === 0) return EMPTY_DOCUMENT_HTML;
  return cleaned;
}

export const EMPTY_DOCUMENT_HTML = "<p></p>";

/**
 * True when the document has no user-visible content. Used to decide whether an
 * import should replace the body or append to it, and to render list previews.
 */
export function isEmptyDocumentHtml(html: string): boolean {
  return htmlToPlainText(html).trim().length === 0;
}

const BLOCK_CLOSE_RE = /<\/(p|h1|h2|h3|h4|h5|h6|li|blockquote|pre|div|tr)\s*>/gi;
const BR_RE = /<br\s*\/?>/gi;
const TAG_RE = /<[^>]*>/g;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Decodes the entity set our own sanitizer can emit. Not a general HTML parser. */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith("#")) {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/**
 * Flattens document HTML to plain text, preserving block boundaries as newlines.
 *
 * Stored on every write as `documents.content_text` so list previews and search
 * never parse markup at read time.
 */
export function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(BR_RE, "\n")
    // Keep the closing tag in place but mark the boundary after it.
    .replace(BLOCK_CLOSE_RE, (m) => `${m}\n`);

  const stripped = withBreaks.replace(TAG_RE, "");
  return (
    decodeEntities(stripped)
      // Collapse runs of spaces/tabs but never across a newline.
      .replace(/[^\S\n]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** First `limit` characters of the body, for list-row previews. */
export function excerpt(plainText: string, limit = 160): string {
  const oneLine = plainText.replace(/\s+/g, " ").trim();
  if (oneLine.length <= limit) return oneLine;
  return `${oneLine.slice(0, limit).trimEnd()}…`;
}

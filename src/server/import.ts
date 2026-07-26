import path from "node:path";
import mammoth from "mammoth";
import { badRequest, payloadTooLarge, unsupportedMediaType } from "@/lib/errors";
import {
  MAX_DOCUMENT_BYTES,
  MAX_UPLOAD_BYTES,
  SUPPORTED_IMPORT_EXTENSIONS,
} from "@/lib/limits";
import { markdownToHtml, plainTextToHtml } from "@/lib/convert";
import { EMPTY_DOCUMENT_HTML, sanitizeDocumentHtml } from "@/lib/sanitize";

/**
 * Turns an uploaded file into sanitized document HTML.
 *
 * Dispatch is on file *extension*, not the browser-supplied MIME type: browsers
 * disagree on the type for .md (text/markdown, text/plain, or empty string) and
 * the header is client-controlled anyway. The extension picks the parser, and
 * every parser's output goes through the same sanitizer — so a mislabelled file
 * can at worst be parsed as the wrong text format, never escalate.
 */

export type ImportKind = "txt" | "markdown" | "docx";

export interface ParsedImport {
  html: string;
  /** Title inferred from the content, falling back to the filename. */
  suggestedTitle: string;
  kind: ImportKind;
  /** Non-fatal parser notes, surfaced to the user after a successful import. */
  warnings: string[];
}

function classify(filename: string): ImportKind {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".txt":
      return "txt";
    case ".md":
    case ".markdown":
      return "markdown";
    case ".docx":
      return "docx";
    default:
      throw unsupportedMediaType(
        `${ext || "That file type"} is not supported. Upload one of: ${SUPPORTED_IMPORT_EXTENSIONS.join(", ")}.`,
      );
  }
}

/** ZIP local-file-header magic. A .docx is a zip, so this catches renamed files. */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

function looksLikeZip(buffer: Buffer): boolean {
  if (buffer.length < ZIP_MAGIC.length) return false;
  return ZIP_MAGIC.every((byte, i) => buffer[i] === byte);
}

const UTF8_BOM = "\uFEFF";

/**
 * Decodes a text upload, stripping a leading BOM.
 *
 * A .txt/.md file containing NUL bytes is almost certainly binary with the wrong
 * extension. Decoding it would yield a document full of replacement characters,
 * so a clear error is the better outcome.
 */
function decodeText(buffer: Buffer, filename: string): string {
  let text = buffer.toString("utf8");
  if (text.startsWith(UTF8_BOM)) text = text.slice(UTF8_BOM.length);

  if (text.includes("\u0000")) {
    throw badRequest(
      `${filename} does not look like a text file. If it is a Word document, save it as .docx and try again.`,
    );
  }
  return text;
}

async function parseDocx(
  buffer: Buffer,
  filename: string,
): Promise<{ html: string; warnings: string[] }> {
  if (!looksLikeZip(buffer)) {
    throw badRequest(
      `${filename} is not a valid .docx file. Legacy .doc files are not supported - re-save it as .docx.`,
    );
  }

  let result: Awaited<ReturnType<typeof mammoth.convertToHtml>>;
  try {
    result = await mammoth.convertToHtml({ buffer });
  } catch (error) {
    // mammoth throws on structurally broken archives. That is user error, not a bug.
    const detail = error instanceof Error ? error.message : "unknown error";
    throw badRequest(`Could not read ${filename}: ${detail}`);
  }

  const warnings = result.messages
    .filter((m) => m.type === "warning")
    .map((m) => m.message)
    // Word emits one warning per unhandled style; a few carry the signal, the
    // rest is noise in the UI.
    .slice(0, 5);

  return { html: result.value, warnings };
}

/**
 * Derives a document title: the first heading in the converted HTML, else the
 * first non-empty paragraph, else the filename. Word and markdown documents
 * nearly always open with their own title, so reusing it beats showing
 * "notes.docx" as the document name.
 */
export function inferTitle(html: string, filename: string): string {
  const heading = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(html);
  const paragraph = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  const candidate = heading?.[1] ?? paragraph?.[1] ?? "";

  const text = candidate
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // &amp; last, so "&amp;lt;" does not become "<".
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length > 0) return text.slice(0, 120);

  const stem = path.basename(filename, path.extname(filename)).trim();
  return stem.length > 0 ? stem : "Imported document";
}

/**
 * Validates and parses an uploaded file. Throws an `AppError` carrying a
 * user-readable message on every rejection path.
 */
export async function parseUpload(file: File): Promise<ParsedImport> {
  const filename = file.name || "upload";

  if (file.size === 0) {
    throw badRequest(`${filename} is empty.`);
  }
  // Checked before reading the body, so an oversized file is rejected without
  // buffering all of it.
  if (file.size > MAX_UPLOAD_BYTES) {
    throw payloadTooLarge(
      `${filename} is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`,
    );
  }

  const kind = classify(filename);
  const buffer = Buffer.from(await file.arrayBuffer());

  // `file.size` is client-reported; re-check what we actually received.
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw payloadTooLarge(
      `${filename} is larger than the ${formatBytes(MAX_UPLOAD_BYTES)} limit.`,
    );
  }

  let rawHtml: string;
  let warnings: string[] = [];

  switch (kind) {
    case "txt":
      rawHtml = plainTextToHtml(decodeText(buffer, filename));
      break;
    case "markdown":
      rawHtml = markdownToHtml(decodeText(buffer, filename));
      break;
    case "docx": {
      const parsed = await parseDocx(buffer, filename);
      rawHtml = parsed.html;
      warnings = parsed.warnings;
      break;
    }
  }

  const html = sanitizeDocumentHtml(rawHtml);

  // A legal 5 MB .docx of prose can still exceed the per-document storage cap.
  // Fail with the real reason rather than a generic validation error.
  if (Buffer.byteLength(html, "utf8") > MAX_DOCUMENT_BYTES) {
    throw payloadTooLarge(
      `The content of ${filename} exceeds the ${formatBytes(MAX_DOCUMENT_BYTES)} per-document limit.`,
    );
  }

  if (html === EMPTY_DOCUMENT_HTML) {
    throw badRequest(`${filename} did not contain any text we could import.`);
  }

  return { html, suggestedTitle: inferTitle(html, filename), kind, warnings };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

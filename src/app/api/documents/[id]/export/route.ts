import { getDb } from "@/db/client";
import { handleRoute } from "@/lib/errors";
import { htmlToMarkdown, htmlToText, toFilename } from "@/lib/convert";
import { exportFormatSchema, parseOrThrow } from "@/lib/validation";
import { loadDocumentForUser } from "@/server/documents";
import { requireUser } from "@/server/session";

type Params = { params: Promise<{ id: string }> };

const CONTENT_TYPES = {
  md: "text/markdown; charset=utf-8",
  html: "text/html; charset=utf-8",
  txt: "text/plain; charset=utf-8",
} as const;

/**
 * Download a document as Markdown, HTML or plain text.
 *
 * PDF was deliberately left out: it needs a headless browser or a PDF library,
 * which is a disproportionate dependency for this timebox. The browser's own
 * print-to-PDF covers the same need from the editor view.
 */
export async function GET(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id } = await params;

    const url = new URL(request.url);
    const format = parseOrThrow(exportFormatSchema, url.searchParams.get("format") ?? "md");

    const { doc } = loadDocumentForUser(getDb(), id, user.id);

    // Most documents open with their own <h1> — imported ones always do, because
    // the importer derives the title from that heading. Prepending the title
    // unconditionally would print it twice, so only add it when the body has no
    // heading of its own to lead with.
    const hasOwnHeading = /^\s*<h1[\s>]/i.test(doc.contentHtml);

    let body: string;
    switch (format) {
      case "md": {
        const content = htmlToMarkdown(doc.contentHtml);
        body = hasOwnHeading ? `${content}\n` : `# ${doc.title}\n\n${content}\n`;
        break;
      }
      case "txt": {
        const content = htmlToText(doc.contentHtml);
        body = hasOwnHeading ? `${content}\n` : `${doc.title}\n\n${content}\n`;
        break;
      }
      case "html":
        body = standaloneHtml(doc.title, doc.contentHtml, hasOwnHeading);
        break;
    }

    const filename = toFilename(doc.title, format);
    return new Response(body, {
      headers: {
        "content-type": CONTENT_TYPES[format],
        // `filename*` carries the UTF-8 name; the plain `filename` is an ASCII
        // fallback for older clients.
        "content-disposition": `attachment; filename="${asciiFallback(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "cache-control": "no-store",
      },
    });
  });
}

function asciiFallback(filename: string): string {
  return filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
}

/** Wraps the stored fragment in a minimal, self-contained HTML document. */
function standaloneHtml(title: string, contentHtml: string, hasOwnHeading: boolean): string {
  const escapedTitle = title
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapedTitle}</title>
<style>
  body { max-width: 46rem; margin: 3rem auto; padding: 0 1.5rem;
         font: 16px/1.7 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         color: #1f2328; }
  h1, h2, h3 { line-height: 1.25; margin: 1.8em 0 0.6em; }
  blockquote { margin: 1.2em 0; padding-left: 1em; border-left: 3px solid #d0d7de; color: #57606a; }
  pre { background: #f6f8fa; padding: 1em; border-radius: 6px; overflow-x: auto; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
  a { color: #0969da; }
</style>
</head>
<body>
${hasOwnHeading ? "" : `<h1>${escapedTitle}</h1>\n`}${contentHtml}
</body>
</html>
`;
}

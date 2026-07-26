import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { badRequest, forbidden, handleRoute, unsupportedMediaType } from "@/lib/errors";
import { canImportInto } from "@/lib/permissions";
import { EMPTY_DOCUMENT_HTML, isEmptyDocumentHtml } from "@/lib/sanitize";
import { importTargetSchema, parseOrThrow } from "@/lib/validation";
import { createDocument, loadDocumentForUser, updateDocument } from "@/server/documents";
import { parseUpload } from "@/server/import";
import { requireUser } from "@/server/session";

/**
 * Upload a .txt / .md / .docx file and turn it into document content.
 *
 * Three modes, because the same parser serves two genuinely different product
 * moments — starting from an existing file, and pulling a file into a draft:
 *
 *   new-document  create a new document from the file (the list-page flow)
 *   append        add the file's content after what is already in a document
 *   replace       overwrite a document's content with the file's
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser();

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw unsupportedMediaType("Upload the file as multipart/form-data.");
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw badRequest("That upload was not readable. Try selecting the file again.");
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      throw badRequest("No file was attached to the request.");
    }

    const target = parseOrThrow(importTargetSchema, {
      mode: form.get("mode") ?? "new-document",
      documentId: form.get("documentId") ?? undefined,
    });

    const parsed = await parseUpload(file);
    const db = getDb();

    if (target.mode === "new-document") {
      const doc = createDocument(db, user.id, {
        title: parsed.suggestedTitle,
        contentHtml: parsed.html,
        versionLabel: `Imported from ${file.name}`,
      });

      return NextResponse.json(
        {
          document: { id: doc.id, title: doc.title },
          mode: target.mode,
          kind: parsed.kind,
          warnings: parsed.warnings,
        },
        { status: 201 },
      );
    }

    if (!target.documentId) {
      throw badRequest("A documentId is required when importing into an existing document.");
    }

    const { doc, role } = loadDocumentForUser(db, target.documentId, user.id);
    if (!canImportInto(role)) {
      throw forbidden("You have view-only access to this document.");
    }

    const nextHtml =
      target.mode === "replace" || isEmptyDocumentHtml(doc.contentHtml)
        ? parsed.html
        : // Append after the existing body. Both sides are already sanitized, and
          // the result is sanitized again on write.
          `${doc.contentHtml === EMPTY_DOCUMENT_HTML ? "" : doc.contentHtml}${parsed.html}`;

    const { doc: updated } = updateDocument(db, target.documentId, user, {
      contentHtml: nextHtml,
      baseRevision: doc.revision,
    });

    return NextResponse.json({
      document: { id: updated.id, title: updated.title, revision: updated.revision },
      contentHtml: updated.contentHtml,
      mode: target.mode,
      kind: parsed.kind,
      warnings: parsed.warnings,
    });
  });
}

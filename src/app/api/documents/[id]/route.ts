import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { handleRoute } from "@/lib/errors";
import { canEdit, canManageSharing } from "@/lib/permissions";
import { parseJsonBody, updateDocumentSchema } from "@/lib/validation";
import { deleteDocument, loadDocumentForUser, updateDocument } from "@/server/documents";
import { requireUser } from "@/server/session";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id } = await params;
    const { doc, role, owner, shares } = loadDocumentForUser(getDb(), id, user.id);

    return NextResponse.json({
      document: doc,
      role,
      owner,
      // Only the owner can act on the collaborator list, but everyone with access
      // can see who else is on the document.
      shares,
      can: { edit: canEdit(role), manageSharing: canManageSharing(role) },
    });
  });
}

/** Rename and/or replace content. Used by autosave and the title field. */
export async function PATCH(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(request, updateDocumentSchema);

    const { doc, concurrentEdit } = updateDocument(getDb(), id, user, body);

    return NextResponse.json({
      document: {
        id: doc.id,
        title: doc.title,
        updatedAt: doc.updatedAt,
        revision: doc.revision,
      },
      concurrentEdit,
    });
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id } = await params;
    deleteDocument(getDb(), id, user.id);
    return NextResponse.json({ ok: true });
  });
}

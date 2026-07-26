import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { handleRoute } from "@/lib/errors";
import { parseJsonBody, updateShareSchema } from "@/lib/validation";
import { removeShare, updateShareRole } from "@/server/shares";
import { requireUser } from "@/server/session";

type Params = { params: Promise<{ id: string; userId: string }> };

/** Change a collaborator's role between viewer and editor. */
export async function PATCH(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id, userId } = await params;
    const { role } = await parseJsonBody(request, updateShareSchema);

    return NextResponse.json({ share: updateShareRole(getDb(), id, user.id, userId, role) });
  });
}

/** Revoke access. */
export async function DELETE(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id, userId } = await params;
    removeShare(getDb(), id, user.id, userId);
    return NextResponse.json({ ok: true });
  });
}

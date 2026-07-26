import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { handleRoute } from "@/lib/errors";
import { getVersion, restoreVersion } from "@/server/versions";
import { requireUser } from "@/server/session";

type Params = { params: Promise<{ id: string; versionId: string }> };

/** One snapshot's content, for the history preview pane. */
export async function GET(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id, versionId } = await params;
    const version = getVersion(getDb(), id, versionId, user.id);

    return NextResponse.json({
      version: {
        id: version.id,
        title: version.title,
        contentHtml: version.contentHtml,
        createdAt: version.createdAt,
        label: version.label,
      },
    });
  });
}

/**
 * Restore this snapshot. Written forward as a new revision — the current content
 * is snapshotted first, so restoring is itself undoable.
 */
export async function POST(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id, versionId } = await params;
    const doc = restoreVersion(getDb(), id, versionId, user);

    return NextResponse.json({
      document: {
        id: doc.id,
        title: doc.title,
        contentHtml: doc.contentHtml,
        updatedAt: doc.updatedAt,
        revision: doc.revision,
      },
    });
  });
}

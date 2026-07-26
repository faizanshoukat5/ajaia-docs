import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { handleRoute } from "@/lib/errors";
import { listVersions } from "@/server/versions";
import { requireUser } from "@/server/session";

type Params = { params: Promise<{ id: string }> };

/** Snapshot metadata for a document, newest first. Bodies are fetched per version. */
export async function GET(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id } = await params;
    return NextResponse.json({ versions: listVersions(getDb(), id, user.id) });
  });
}

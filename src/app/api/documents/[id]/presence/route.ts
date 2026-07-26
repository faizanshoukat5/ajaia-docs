import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { handleRoute } from "@/lib/errors";
import { clearPresence, listPresence, recordPresence } from "@/server/presence";
import { requireUser } from "@/server/session";

type Params = { params: Promise<{ id: string }> };

/**
 * Heartbeat. Records that the caller is viewing the document and returns everyone
 * currently on it, so the client needs one request per interval rather than two.
 */
export async function POST(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id } = await params;
    const db = getDb();

    recordPresence(db, id, user.id);
    return NextResponse.json({ viewers: listPresence(db, id, user.id) });
  });
}

/** Read-only presence, without registering the caller. */
export async function GET(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id } = await params;
    return NextResponse.json({ viewers: listPresence(getDb(), id, user.id) });
  });
}

/** Called on navigate-away so the avatar clears without waiting for the TTL. */
export async function DELETE(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id } = await params;
    clearPresence(getDb(), id, user.id);
    return NextResponse.json({ ok: true });
  });
}

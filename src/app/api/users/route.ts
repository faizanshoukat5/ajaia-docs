import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { handleRoute } from "@/lib/errors";
import { listShareableUsers } from "@/server/shares";
import { requireUser } from "@/server/session";

/**
 * Accounts the caller can share with. Powers the suggestion list in the share
 * dialog, which is what makes the seeded-account flow quick to demo.
 *
 * A real product would scope this to the caller's organization rather than
 * exposing every account; noted in ARCHITECTURE.md.
 */
export async function GET() {
  return handleRoute(async () => {
    const user = await requireUser();
    return NextResponse.json({ users: listShareableUsers(getDb(), user.id) });
  });
}

import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { handleRoute } from "@/lib/errors";
import { parseJsonBody, shareSchema } from "@/lib/validation";
import { addShare, listShares } from "@/server/shares";
import { requireUser } from "@/server/session";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id } = await params;
    return NextResponse.json({ shares: listShares(getDb(), id, user.id) });
  });
}

/** Grant access. Re-posting an existing collaborator changes their role. */
export async function POST(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(request, shareSchema);

    const share = addShare(getDb(), id, user.id, body);
    return NextResponse.json({ share }, { status: 201 });
  });
}

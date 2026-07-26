import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { handleRoute } from "@/lib/errors";
import { createDocumentSchema, parseJsonBody } from "@/lib/validation";
import { createDocument, listDocumentsForUser } from "@/server/documents";
import { requireUser } from "@/server/session";

/** Documents the caller owns, plus documents shared with them. */
export async function GET() {
  return handleRoute(async () => {
    const user = await requireUser();
    return NextResponse.json(listDocumentsForUser(getDb(), user.id));
  });
}

/** Create an empty document owned by the caller. */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser();
    // A body is optional here: "New document" sends none.
    const contentType = request.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? await parseJsonBody(request, createDocumentSchema)
      : {};

    const doc = createDocument(getDb(), user.id, { title: body.title });
    return NextResponse.json({ document: doc }, { status: 201 });
  });
}

import { notFound, redirect } from "next/navigation";
import { DocumentEditor } from "@/components/DocumentEditor";
import { getDb } from "@/db/client";
import { AppError } from "@/lib/errors";
import { loadDocumentForUser } from "@/server/documents";
import { getCurrentUser } from "@/server/session";

/**
 * The editor route. Authorization happens here, on the server, before any content
 * is sent — a user without access gets Next's 404 page and never receives the
 * document body.
 */
export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;

  let loaded: ReturnType<typeof loadDocumentForUser>;
  try {
    loaded = loadDocumentForUser(getDb(), id, user.id);
  } catch (error) {
    // `loadDocumentForUser` raises the same 404 for "missing" and "no access".
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }

  const { doc, role, owner, shares } = loaded;

  return (
    <DocumentEditor
      user={user}
      document={{
        id: doc.id,
        title: doc.title,
        contentHtml: doc.contentHtml,
        revision: doc.revision,
        updatedAt: doc.updatedAt,
      }}
      role={role}
      owner={owner}
      shares={shares}
    />
  );
}

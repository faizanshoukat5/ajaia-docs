import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { DocumentsView } from "@/components/DocumentsView";
import { getDb } from "@/db/client";
import { listDocumentsForUser } from "@/server/documents";
import { getCurrentUser } from "@/server/session";

/**
 * The document list. Rendered on the server so the first paint already has the
 * data — no loading spinner on the primary surface. Subsequent mutations are
 * handled by the client component, which calls `router.refresh()` to re-run this.
 */
export default async function DocumentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { owned, shared } = listDocumentsForUser(getDb(), user.id);

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <DocumentsView owned={owned} shared={shared} />
      </main>
    </>
  );
}

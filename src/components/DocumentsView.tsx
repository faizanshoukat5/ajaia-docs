"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FilePlus2, Upload, Users } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { SUPPORTED_IMPORT_ACCEPT, SUPPORTED_IMPORT_EXTENSIONS } from "@/lib/limits";
import { roleLabel } from "@/lib/permissions";
import { avatarColor, initials, relativeTime } from "@/lib/time";
import type { DocumentSummary } from "@/server/documents";

type Tab = "owned" | "shared";

/**
 * The document list, split into "My documents" and "Shared with me".
 *
 * Two tabs rather than one list with a badge: the distinction the brief asks for
 * should be structural, not something you have to scan for. Each row still shows
 * its role and owner so the information is not only in the tab.
 */
export function DocumentsView({
  owned,
  shared,
}: {
  owned: DocumentSummary[];
  shared: DocumentSummary[];
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>(owned.length === 0 && shared.length > 0 ? "shared" : "owned");
  const [busy, setBusy] = useState<null | "create" | "import">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Rendered once on mount so every row formats against the same instant.
  const [now] = useState(() => Date.now());

  const documents = tab === "owned" ? owned : shared;

  async function createDocument() {
    setBusy("create");
    setError(null);
    try {
      const { document } = await apiFetch<{ document: { id: string } }>("/api/documents", {
        method: "POST",
      });
      router.push(`/documents/${document.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the document.");
      setBusy(null);
    }
  }

  async function importFile(file: File) {
    setBusy("import");
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", "new-document");

      const result = await apiFetch<{
        document: { id: string };
        warnings: string[];
      }>("/api/imports", { method: "POST", body: form });

      if (result.warnings.length > 0) {
        // Warnings are non-fatal (unsupported Word styles, usually). Stash them so
        // the user learns something was dropped without blocking the navigation.
        sessionStorage.setItem(
          `import-warnings:${result.document.id}`,
          JSON.stringify(result.warnings),
        );
      }
      router.push(`/documents/${result.document.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import that file.");
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Documents</h1>

        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept={SUPPORTED_IMPORT_ACCEPT}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Reset first so selecting the same file twice re-fires onChange.
              event.target.value = "";
              if (file) void importFile(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm font-medium transition hover:bg-[var(--color-canvas)] disabled:opacity-50"
          >
            <Upload size={15} aria-hidden="true" />
            {busy === "import" ? "Importing…" : "Import a file"}
          </button>
          <button
            type="button"
            onClick={() => void createDocument()}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white transition hover:brightness-95 disabled:opacity-50"
          >
            <FilePlus2 size={15} aria-hidden="true" />
            {busy === "create" ? "Creating…" : "New document"}
          </button>
        </div>
      </div>

      <p className="mt-1.5 text-xs text-[var(--color-muted)]">
        Import supports {SUPPORTED_IMPORT_EXTENSIONS.join(", ")} — each becomes a new editable
        document.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p>
      )}

      <nav className="mt-6 flex gap-1 border-b border-[var(--color-line)]" aria-label="Document lists">
        <TabButton active={tab === "owned"} onClick={() => setTab("owned")} count={owned.length}>
          My documents
        </TabButton>
        <TabButton active={tab === "shared"} onClick={() => setTab("shared")} count={shared.length}>
          Shared with me
        </TabButton>
      </nav>

      {documents.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <ul className="mt-4 space-y-2">
          {documents.map((doc) => (
            <li key={doc.id}>
              <a
                href={`/documents/${doc.id}`}
                className="block rounded-xl border border-[var(--color-line)] bg-white p-4 transition hover:border-[var(--color-accent)] hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{doc.title}</h2>
                  <span className="shrink-0 rounded-full bg-[var(--color-canvas)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-muted)]">
                    {roleLabel(doc.role)}
                  </span>
                </div>

                {doc.preview && (
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[var(--color-muted)]">
                    {doc.preview}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-muted)]">
                  {doc.role !== "owner" && (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-semibold text-white"
                        style={{ backgroundColor: avatarColor(doc.owner.id) }}
                      >
                        {initials(doc.owner.name)}
                      </span>
                      Owned by {doc.owner.name}
                    </span>
                  )}
                  <span>
                    Edited {relativeTime(doc.updatedAt, now)}
                    {doc.lastEditedBy ? ` by ${doc.lastEditedBy}` : ""}
                  </span>
                  {doc.collaboratorCount > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Users size={11} aria-hidden="true" />
                      {doc.collaboratorCount}{" "}
                      {doc.collaboratorCount === 1 ? "collaborator" : "collaborators"}
                    </span>
                  )}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
        active
          ? "border-[var(--color-accent)] text-[var(--color-accent)]"
          : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-ink)]"
      }`}
    >
      {children}
      <span className="ml-1.5 text-xs opacity-70">{count}</span>
    </button>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-[var(--color-line)] bg-white p-10 text-center">
      <p className="text-sm font-medium">
        {tab === "owned" ? "No documents yet" : "Nothing shared with you yet"}
      </p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-[var(--color-muted)]">
        {tab === "owned"
          ? "Create a blank document, or import a .txt, .md or .docx file to start from something you already have."
          : "When someone shares a document with you, it will appear here with the access level they granted."}
      </p>
    </div>
  );
}

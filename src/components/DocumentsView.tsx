"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Clock, FilePlus2, FileText, Inbox, Search, Upload, Users, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { SUPPORTED_IMPORT_ACCEPT, SUPPORTED_IMPORT_EXTENSIONS } from "@/lib/limits";
import { roleLabel } from "@/lib/permissions";
import { avatarColor, initials, relativeTime } from "@/lib/time";
import type { DocumentSummary } from "@/server/documents";

type Tab = "owned" | "shared";

/**
 * The document list, split into "My documents" and "Shared with me".
 *
 * A segmented control rather than one list with a badge: the distinction the
 * brief asks for should be structural, not something you have to scan for. Each
 * card still shows its role and owner so the information is not only in the tab.
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
  const [query, setQuery] = useState("");
  // Rendered once on mount so every row formats against the same instant.
  const [now] = useState(() => Date.now());

  const documents = tab === "owned" ? owned : shared;

  // Client-side filter over title, preview and owner — the whole list is already
  // here from the server render, so there is nothing to round-trip for.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter(
      (doc) =>
        doc.title.toLowerCase().includes(q) ||
        doc.preview.toLowerCase().includes(q) ||
        doc.owner.name.toLowerCase().includes(q),
    );
  }, [documents, query]);

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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
          <p className="mt-1 text-sm text-muted">
            Import supports {SUPPORTED_IMPORT_EXTENSIONS.join(", ")} — each becomes a new
            editable document.
          </p>
        </div>

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
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2 text-sm font-medium shadow-xs transition hover:border-line-strong hover:bg-surface-2 disabled:opacity-50"
          >
            <Upload size={15} aria-hidden="true" />
            {busy === "import" ? "Importing…" : "Import a file"}
          </button>
          <button
            type="button"
            onClick={() => void createDocument()}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-sm font-medium text-on-accent shadow-sm transition hover:bg-accent-hover active:scale-[0.98] disabled:opacity-50"
          >
            <FilePlus2 size={15} aria-hidden="true" />
            {busy === "create" ? "Creating…" : "New document"}
          </button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-danger/20 bg-danger-soft px-3.5 py-2.5 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        {/* Segmented control */}
        <div
          className="inline-flex rounded-xl border border-line bg-surface-2 p-1"
          role="tablist"
          aria-label="Document lists"
        >
          <SegmentButton
            active={tab === "owned"}
            onClick={() => setTab("owned")}
            count={owned.length}
          >
            My documents
          </SegmentButton>
          <SegmentButton
            active={tab === "shared"}
            onClick={() => setTab("shared")}
            count={shared.length}
          >
            Shared with me
          </SegmentButton>
        </div>

        <label className="relative block w-full max-w-xs">
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search documents…"
            aria-label="Search documents"
            className="w-full rounded-xl border border-line bg-surface py-2 pl-8 pr-8 text-sm outline-none transition placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent-ring"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-faint transition hover:bg-surface-2 hover:text-ink"
            >
              <X size={13} aria-hidden="true" />
            </button>
          )}
        </label>
      </div>

      {filtered.length === 0 ? (
        query.trim() ? (
          <NoMatches query={query} onClear={() => setQuery("")} />
        ) : (
          <EmptyState tab={tab} />
        )
      ) : (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((doc, index) => (
            <li key={doc.id} className="animate-rise-in" style={{ animationDelay: `${Math.min(index * 30, 240)}ms` }}>
              <a
                href={`/documents/${doc.id}`}
                className="group flex h-full flex-col rounded-2xl border border-line bg-surface p-4 shadow-xs transition hover:-translate-y-0.5 hover:border-accent-ring hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent transition group-hover:scale-105">
                    <FileText size={16} aria-hidden="true" />
                  </span>
                  <RoleBadge role={doc.role} />
                </div>

                <h2 className="mt-3 truncate text-sm font-semibold tracking-tight">{doc.title}</h2>

                <p className="mt-1 line-clamp-2 min-h-[2.1rem] text-xs leading-relaxed text-muted">
                  {doc.preview || "Empty document"}
                </p>

                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-3 text-[11px] text-muted">
                  {doc.role !== "owner" && (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className="flex h-4.5 w-4.5 items-center justify-center rounded-full text-[8px] font-semibold text-white"
                        style={{ backgroundColor: avatarColor(doc.owner.id) }}
                      >
                        {initials(doc.owner.name)}
                      </span>
                      {doc.owner.name}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Clock size={11} aria-hidden="true" />
                    {relativeTime(doc.updatedAt, now)}
                    {doc.lastEditedBy ? ` · ${doc.lastEditedBy}` : ""}
                  </span>
                  {doc.collaboratorCount > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Users size={11} aria-hidden="true" />
                      {doc.collaboratorCount}
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

function RoleBadge({ role }: { role: DocumentSummary["role"] }) {
  const styles =
    role === "owner"
      ? "bg-accent-soft text-accent"
      : role === "editor"
        ? "bg-success-soft text-success"
        : "bg-surface-2 text-muted";
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${styles}`}
    >
      {roleLabel(role)}
    </span>
  );
}

function SegmentButton({
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
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-surface text-ink shadow-sm"
          : "text-muted hover:text-ink"
      }`}
    >
      {children}
      <span
        className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
          active ? "bg-accent-soft text-accent" : "bg-surface-3 text-muted"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function NoMatches({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="animate-fade-in mt-5 flex flex-col items-center rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-faint">
        <Search size={20} aria-hidden="true" />
      </span>
      <p className="mt-4 text-sm font-semibold">No documents match “{query.trim()}”</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-2 text-xs font-medium text-accent transition hover:text-accent-hover"
      >
        Clear search
      </button>
    </div>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  return (
    <div className="animate-fade-in mt-5 flex flex-col items-center rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-faint">
        {tab === "owned" ? (
          <FileText size={20} aria-hidden="true" />
        ) : (
          <Inbox size={20} aria-hidden="true" />
        )}
      </span>
      <p className="mt-4 text-sm font-semibold">
        {tab === "owned" ? "No documents yet" : "Nothing shared with you yet"}
      </p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted">
        {tab === "owned"
          ? "Create a blank document, or import a .txt, .md or .docx file to start from something you already have."
          : "When someone shares a document with you, it will appear here with the access level they granted."}
      </p>
    </div>
  );
}

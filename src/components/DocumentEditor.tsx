"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CloudOff,
  Download,
  History,
  Loader2,
  Trash2,
  Upload,
  UserPlus,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { SUPPORTED_IMPORT_ACCEPT, SUPPORTED_IMPORT_EXTENSIONS } from "@/lib/limits";
import { roleLabel, type AccessRole } from "@/lib/permissions";
import { relativeTime } from "@/lib/time";
import { AppHeader } from "./AppHeader";
import { EditorToolbar } from "./EditorToolbar";
import { HistoryPanel } from "./HistoryPanel";
import { Modal } from "./Modal";
import { PresenceBar } from "./PresenceBar";
import { ShareDialog, type ShareEntry } from "./ShareDialog";
import { useAutosave } from "./useAutosave";
import type { SessionUser } from "@/server/session";

interface DocumentPayload {
  id: string;
  title: string;
  contentHtml: string;
  revision: number;
  updatedAt: number;
}

/**
 * The editor surface.
 *
 * Content saves are debounced and driven by `useAutosave`; TipTap owns the
 * document state while it is being edited. The initial HTML comes from the server
 * render, so the document is on screen before any JavaScript-initiated fetch.
 */
export function DocumentEditor({
  user,
  document: initialDocument,
  role,
  owner,
  shares: initialShares,
}: {
  user: SessionUser;
  document: DocumentPayload;
  role: AccessRole;
  owner: { id: string; name: string; email: string };
  shares: ShareEntry[];
}) {
  const router = useRouter();
  const canEdit = role === "owner" || role === "editor";
  const isOwner = role === "owner";

  const [title, setTitle] = useState(initialDocument.title);
  const [shares, setShares] = useState(initialShares);
  const [shareOpen, setShareOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const fileInput = useRef<HTMLInputElement>(null);

  const save = useAutosave(initialDocument.id, initialDocument.revision);

  const editor = useEditor({
    // Required with the App Router: rendering the editor during SSR would produce
    // markup React then has to reconcile against a ProseMirror-managed DOM.
    immediatelyRender: false,
    editable: canEdit,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          // Mirrors the server sanitizer's allowlist so the editor cannot create a
          // link the server would then strip.
          protocols: ["http", "https", "mailto"],
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        },
      }),
      Placeholder.configure({ placeholder: "Start writing, or import a file…" }),
    ],
    content: initialDocument.contentHtml,
    editorProps: {
      attributes: {
        class: "doc-body min-h-[60vh] outline-none",
        "aria-label": "Document body",
      },
    },
    onUpdate({ editor: instance }) {
      save.queue({ contentHtml: instance.getHTML() });
    },
  });

  // Keep the read-only state in sync if the role ever changes under us.
  useEffect(() => {
    editor?.setEditable(canEdit);
  }, [editor, canEdit]);

  // Refresh the "last saved" wording without re-rendering on every tick.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Warnings from an import that happened on the list page, handed over via
  // sessionStorage because the navigation is a fresh page load.
  useEffect(() => {
    const key = `import-warnings:${initialDocument.id}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    sessionStorage.removeItem(key);
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setImportWarnings(parsed.map(String));
    } catch {
      // Malformed value in sessionStorage is not worth surfacing.
    }
  }, [initialDocument.id]);

  const onTitleChange = useCallback(
    (value: string) => {
      setTitle(value);
      // An empty title would fail validation; hold the save until it is non-empty
      // rather than showing an error while the user is mid-retype.
      if (value.trim().length > 0) save.queue({ title: value });
    },
    [save],
  );

  async function importIntoDocument(file: File, mode: "append" | "replace") {
    setImporting(true);
    setActionError(null);
    setImportWarnings([]);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", mode);
      form.append("documentId", initialDocument.id);

      const result = await apiFetch<{
        document: { revision: number };
        contentHtml: string;
        warnings: string[];
      }>("/api/imports", { method: "POST", body: form });

      // The server is authoritative on the merged result, so take its HTML rather
      // than splicing locally and hoping the two agree.
      editor?.commands.setContent(result.contentHtml, { emitUpdate: false });
      save.setRevision(result.document.revision);
      setImportWarnings(result.warnings);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not import that file.");
    } finally {
      setImporting(false);
    }
  }

  async function deleteDocument() {
    setActionError(null);
    try {
      await apiFetch(`/api/documents/${initialDocument.id}`, { method: "DELETE" });
      router.push("/documents");
      router.refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not delete the document.");
      setDeleteOpen(false);
    }
  }

  return (
    <>
      <AppHeader user={user}>
        <div className="flex min-w-0 items-center gap-2">
          <a
            href="/documents"
            aria-label="Back to documents"
            className="shrink-0 rounded-md p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-canvas)]"
          >
            <ArrowLeft size={16} aria-hidden="true" />
          </a>

          <input
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            onBlur={() => {
              // Restore the persisted title if the field was left blank.
              if (title.trim().length === 0) setTitle(initialDocument.title);
            }}
            readOnly={!canEdit}
            aria-label="Document title"
            className="min-w-0 flex-1 truncate rounded-md border border-transparent px-2 py-1 text-sm font-medium outline-none transition hover:border-[var(--color-line)] focus:border-[var(--color-accent)] read-only:hover:border-transparent"
          />

          <SaveIndicator
            status={save.status}
            lastSavedAt={save.lastSavedAt ?? initialDocument.updatedAt}
            now={now}
            canEdit={canEdit}
          />
        </div>
      </AppHeader>

      <main className="mx-auto max-w-4xl px-4 py-6">
        <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--color-muted)] ring-1 ring-[var(--color-line)]">
              {roleLabel(role)}
              {!isOwner && ` · ${owner.name}`}
            </span>
            <PresenceBar documentId={initialDocument.id} />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <input
              ref={fileInput}
              type="file"
              accept={SUPPORTED_IMPORT_ACCEPT}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                const replace = window.confirm(
                  `Import "${file.name}".\n\nOK — replace everything in this document.\nCancel — add it to the end instead.`,
                );
                void importIntoDocument(file, replace ? "replace" : "append");
              }}
            />

            {canEdit && (
              <ToolbarAction
                onClick={() => fileInput.current?.click()}
                disabled={importing}
                icon={<Upload size={14} aria-hidden="true" />}
              >
                {importing ? "Importing…" : "Import"}
              </ToolbarAction>
            )}

            <ToolbarAction
              onClick={() => setHistoryOpen(true)}
              icon={<History size={14} aria-hidden="true" />}
            >
              History
            </ToolbarAction>

            <ExportMenu documentId={initialDocument.id} />

            {isOwner && (
              <ToolbarAction
                onClick={() => setShareOpen(true)}
                icon={<UserPlus size={14} aria-hidden="true" />}
                primary
              >
                Share{shares.length > 0 ? ` (${shares.length})` : ""}
              </ToolbarAction>
            )}

            {isOwner && (
              <ToolbarAction
                onClick={() => setDeleteOpen(true)}
                icon={<Trash2 size={14} aria-hidden="true" />}
                danger
              >
                Delete
              </ToolbarAction>
            )}
          </div>
        </div>

        {!canEdit && (
          <p className="no-print mb-3 rounded-lg bg-[var(--color-accent-soft)] px-3 py-2 text-xs text-[#174ea6]">
            You have view-only access to this document. {owner.name} can give you edit access.
          </p>
        )}

        {save.concurrentEdit && (
          <Banner tone="warning" onDismiss={save.dismissConcurrentEdit}>
            <strong className="font-semibold">{save.concurrentEdit.by}</strong> edited this
            document while you were writing. Your version is what is saved now — theirs is kept in{" "}
            <button
              type="button"
              className="underline"
              onClick={() => {
                save.dismissConcurrentEdit();
                setHistoryOpen(true);
              }}
            >
              version history
            </button>
            .
          </Banner>
        )}

        {save.status === "error" && save.error && (
          <Banner tone="error">
            {save.error}{" "}
            <button type="button" className="underline" onClick={() => void save.flush()}>
              Retry now
            </button>
          </Banner>
        )}

        {actionError && (
          <Banner tone="error" onDismiss={() => setActionError(null)}>
            {actionError}
          </Banner>
        )}

        {importWarnings.length > 0 && (
          <Banner tone="warning" onDismiss={() => setImportWarnings([])}>
            <span className="font-semibold">Imported with some formatting dropped:</span>
            <ul className="mt-1 list-disc pl-5">
              {importWarnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </Banner>
        )}

        <div className="doc-page overflow-hidden rounded-xl border border-[var(--color-line)] bg-white shadow-sm">
          {canEdit && editor && <EditorToolbar editor={editor} />}
          <div className="px-6 py-8 sm:px-12 sm:py-10">
            {editor ? (
              <EditorContent editor={editor} />
            ) : (
              // Server-rendered fallback: the document is readable before TipTap
              // mounts, instead of a blank flash.
              <div
                className="doc-body"
                dangerouslySetInnerHTML={{ __html: initialDocument.contentHtml }}
              />
            )}
          </div>
        </div>

        <p className="no-print mt-3 text-center text-[11px] text-[var(--color-muted)]">
          Changes save automatically. Supported imports: {SUPPORTED_IMPORT_EXTENSIONS.join(", ")}.
        </p>
      </main>

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        documentId={initialDocument.id}
        ownerName={owner.name}
        shares={shares}
        onSharesChange={setShares}
      />

      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        documentId={initialDocument.id}
        canRestore={canEdit}
        onRestored={(doc) => {
          setTitle(doc.title);
          editor?.commands.setContent(doc.contentHtml, { emitUpdate: false });
          save.setRevision(doc.revision);
        }}
      />

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this document?"
        description="This removes it for everyone it is shared with, along with its version history. It cannot be undone."
      >
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setDeleteOpen(false)}
            className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm font-medium transition hover:bg-[var(--color-canvas)]"
          >
            Keep it
          </button>
          <button
            type="button"
            onClick={() => void deleteDocument()}
            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700"
          >
            Delete permanently
          </button>
        </div>
      </Modal>
    </>
  );
}

function SaveIndicator({
  status,
  lastSavedAt,
  now,
  canEdit,
}: {
  status: ReturnType<typeof useAutosave>["status"];
  lastSavedAt: number;
  now: number;
  canEdit: boolean;
}) {
  if (!canEdit) return null;

  const base = "flex shrink-0 items-center gap-1.5 text-[11px]";

  if (status === "saving") {
    return (
      <span className={`${base} text-[var(--color-muted)]`} aria-live="polite">
        <Loader2 size={12} className="animate-spin" aria-hidden="true" />
        <span className="hidden sm:inline">Saving…</span>
      </span>
    );
  }
  if (status === "dirty") {
    return (
      <span className={`${base} text-[var(--color-muted)]`}>
        <span className="hidden sm:inline">Unsaved changes</span>
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className={`${base} text-red-600`} aria-live="polite">
        <CloudOff size={12} aria-hidden="true" />
        <span className="hidden sm:inline">Not saved</span>
      </span>
    );
  }
  return (
    <span className={`${base} text-[var(--color-muted)]`} aria-live="polite">
      <Check size={12} aria-hidden="true" />
      <span className="hidden sm:inline">Saved {relativeTime(lastSavedAt, now)}</span>
    </span>
  );
}

function ExportMenu({ documentId }: { documentId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative">
      <ToolbarAction
        onClick={() => setOpen((value) => !value)}
        icon={<Download size={14} aria-hidden="true" />}
      >
        Export
      </ToolbarAction>
      {open && (
        <>
          {/* Click-outside layer; simpler and more reliable than a document listener. */}
          <span
            className="fixed inset-0 z-10"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <span className="absolute right-0 top-full z-20 mt-1 block w-40 overflow-hidden rounded-lg border border-[var(--color-line)] bg-white py-1 shadow-lg">
            {(
              [
                ["md", "Markdown (.md)"],
                ["html", "HTML (.html)"],
                ["txt", "Plain text (.txt)"],
              ] as const
            ).map(([format, label]) => (
              <a
                key={format}
                href={`/api/documents/${documentId}/export?format=${format}`}
                onClick={() => setOpen(false)}
                className="block px-3 py-1.5 text-xs transition hover:bg-[var(--color-canvas)]"
              >
                {label}
              </a>
            ))}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                window.print();
              }}
              className="block w-full px-3 py-1.5 text-left text-xs transition hover:bg-[var(--color-canvas)]"
            >
              Print / PDF
            </button>
          </span>
        </>
      )}
    </span>
  );
}

function ToolbarAction({
  onClick,
  icon,
  children,
  disabled,
  primary,
  danger,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  const tone = primary
    ? "bg-[var(--color-accent)] text-white border-transparent hover:brightness-95"
    : danger
      ? "bg-white text-red-600 border-[var(--color-line)] hover:bg-red-50"
      : "bg-white text-[var(--color-ink)] border-[var(--color-line)] hover:bg-[var(--color-canvas)]";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-50 ${tone}`}
    >
      {icon}
      {children}
    </button>
  );
}

function Banner({
  tone,
  children,
  onDismiss,
}: {
  tone: "warning" | "error";
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  const styles =
    tone === "error" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-900";

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`no-print mb-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${styles}`}
    >
      <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 font-medium underline"
          aria-label="Dismiss"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

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
  Eye,
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
  // A picked file awaiting the append/replace decision in a dialog.
  const [pendingImport, setPendingImport] = useState<File | null>(null);
  const [wordStats, setWordStats] = useState<{ words: number; chars: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const fileInput = useRef<HTMLInputElement>(null);

  // Viewers get an inert hook: nothing queues, nothing flushes, no phantom saves.
  const save = useAutosave(initialDocument.id, initialDocument.revision, canEdit);

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
      // Guarded by role: a read-only view must never turn a DOM mutation (browser
      // extensions can cause one) into a save attempt.
      if (canEdit) save.queue({ contentHtml: instance.getHTML() });
    },
  });

  // Live word/character count, recomputed on every content change.
  useEffect(() => {
    if (!editor) return;
    const compute = () => {
      const text = editor.getText();
      setWordStats({
        words: text.split(/\s+/).filter(Boolean).length,
        chars: text.replace(/\s/g, "").length,
      });
    };
    compute();
    editor.on("update", compute);
    return () => {
      editor.off("update", compute);
    };
  }, [editor]);

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
            className="shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-ink"
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
            className="min-w-0 flex-1 truncate rounded-lg border border-transparent px-2 py-1 text-sm font-medium outline-none transition hover:border-line focus:border-accent focus:ring-2 focus:ring-accent-ring read-only:hover:border-transparent"
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
        <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                isOwner
                  ? "bg-accent-soft text-accent"
                  : role === "editor"
                    ? "bg-success-soft text-success"
                    : "bg-surface-2 text-muted ring-1 ring-line"
              }`}
            >
              {!canEdit && <Eye size={11} aria-hidden="true" />}
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
                // The append/replace choice happens in a proper dialog, not a
                // window.confirm whose OK/Cancel labels can't say what they do.
                if (file) setPendingImport(file);
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
          <p className="no-print mb-3 flex items-center gap-2 rounded-xl border border-accent-ring bg-accent-soft px-3.5 py-2.5 text-xs text-accent">
            <Eye size={13} className="shrink-0" aria-hidden="true" />
            You have view-only access to this document. {owner.name} can give you edit access.
          </p>
        )}

        {save.concurrentEdit && (
          <Banner tone="warning" onDismiss={save.dismissConcurrentEdit}>
            <strong className="font-semibold">{save.concurrentEdit.by}</strong> edited this
            document while you were writing. Your version is what is saved now — theirs is kept in{" "}
            <button
              type="button"
              className="underline underline-offset-2"
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
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => void save.flush()}
            >
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

        {/* No overflow-hidden here: it would break the toolbar's position:sticky. */}
        <div className="doc-page rounded-2xl border border-line bg-surface shadow-sm">
          {canEdit && editor && <EditorToolbar editor={editor} />}
          <div className="px-6 py-8 sm:px-14 sm:py-12">
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

        <div className="no-print mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-faint">
          <span>
            {wordStats
              ? `${wordStats.words.toLocaleString()} ${wordStats.words === 1 ? "word" : "words"} · ${wordStats.chars.toLocaleString()} characters · ~${Math.max(1, Math.round(wordStats.words / 200))} min read`
              : " "}
          </span>
          <span>
            {canEdit
              ? `Changes save automatically. Imports: ${SUPPORTED_IMPORT_EXTENSIONS.join(", ")}.`
              : "Read-only view."}
          </span>
        </div>
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
        open={pendingImport !== null}
        onClose={() => setPendingImport(null)}
        title={pendingImport ? `Import “${pendingImport.name}”` : "Import"}
        description="Add the file's content to the end of this document, or replace everything that is here now. A snapshot of the current content is kept in version history either way."
      >
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setPendingImport(null)}
            className="rounded-xl border border-line px-3.5 py-2 text-sm font-medium transition hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              const file = pendingImport;
              setPendingImport(null);
              if (file) void importIntoDocument(file, "append");
            }}
            className="rounded-xl border border-line px-3.5 py-2 text-sm font-medium transition hover:bg-surface-2"
          >
            Add to end
          </button>
          <button
            type="button"
            onClick={() => {
              const file = pendingImport;
              setPendingImport(null);
              if (file) void importIntoDocument(file, "replace");
            }}
            className="rounded-xl bg-accent px-3.5 py-2 text-sm font-medium text-on-accent shadow-sm transition hover:bg-accent-hover"
          >
            Replace document
          </button>
        </div>
      </Modal>

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
            className="rounded-xl border border-line px-3.5 py-2 text-sm font-medium transition hover:bg-surface-2"
          >
            Keep it
          </button>
          <button
            type="button"
            onClick={() => void deleteDocument()}
            className="rounded-xl bg-danger px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-danger-hover"
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

  const base =
    "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium";

  if (status === "saving") {
    return (
      <span className={`${base} bg-surface-2 text-muted`} aria-live="polite">
        <Loader2 size={11} className="animate-spin" aria-hidden="true" />
        <span className="hidden sm:inline">Saving…</span>
      </span>
    );
  }
  if (status === "dirty") {
    return (
      <span className={`${base} bg-warning-soft text-warning`}>
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-current"
        />
        <span className="hidden sm:inline">Unsaved changes</span>
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className={`${base} bg-danger-soft text-danger`} aria-live="polite">
        <CloudOff size={11} aria-hidden="true" />
        <span className="hidden sm:inline">Not saved</span>
      </span>
    );
  }
  return (
    <span className={`${base} bg-success-soft text-success`} aria-live="polite">
      <Check size={11} aria-hidden="true" />
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
          <span className="animate-pop-in absolute right-0 top-full z-20 mt-1.5 block w-44 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg">
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
                className="block px-3.5 py-2 text-xs font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink"
              >
                {label}
              </a>
            ))}
            <span aria-hidden="true" className="my-1 block h-px bg-line" />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                window.print();
              }}
              className="block w-full px-3.5 py-2 text-left text-xs font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink"
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
    ? "bg-accent text-on-accent border-transparent shadow-sm hover:bg-accent-hover"
    : danger
      ? "bg-surface text-danger border-line hover:border-danger/30 hover:bg-danger-soft"
      : "bg-surface text-ink-2 border-line shadow-xs hover:border-line-strong hover:bg-surface-2 hover:text-ink";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition active:scale-[0.97] disabled:opacity-50 ${tone}`}
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
    tone === "error"
      ? "border-danger/20 bg-danger-soft text-danger"
      : "border-warning/20 bg-warning-soft text-warning";

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`no-print animate-fade-in mb-3 flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-xs ${styles}`}
    >
      <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 font-medium underline underline-offset-2"
          aria-label="Dismiss"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

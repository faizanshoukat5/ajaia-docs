"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { absoluteDateTime, relativeTime } from "@/lib/time";
import { Modal } from "./Modal";

interface VersionSummary {
  id: string;
  title: string;
  createdAt: number;
  authorName: string | null;
  label: string | null;
  size: number;
}

/**
 * Version history: pick a snapshot, preview it, restore it.
 *
 * Restoring writes the old content forward as a new revision rather than
 * rewinding, so the pre-restore state is itself snapshotted and nothing in
 * history is ever destroyed.
 */
export function HistoryPanel({
  open,
  onClose,
  documentId,
  canRestore,
  onRestored,
}: {
  open: boolean;
  onClose: () => void;
  documentId: string;
  canRestore: boolean;
  onRestored: (doc: { title: string; contentHtml: string; revision: number }) => void;
}) {
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    setError(null);
    setSelected(null);
    setPreview(null);

    let cancelled = false;
    void apiFetch<{ versions: VersionSummary[] }>(`/api/documents/${documentId}/versions`)
      .then((result) => {
        if (!cancelled) setVersions(result.versions);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setVersions([]);
          setError(err instanceof Error ? err.message : "Could not load history.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, documentId]);

  async function select(versionId: string) {
    setSelected(versionId);
    setPreview(null);
    setError(null);
    try {
      const result = await apiFetch<{ version: { contentHtml: string } }>(
        `/api/documents/${documentId}/versions/${versionId}`,
      );
      setPreview(result.version.contentHtml);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load that version.");
    }
  }

  async function restore(versionId: string) {
    setRestoring(true);
    setError(null);
    try {
      const result = await apiFetch<{
        document: { title: string; contentHtml: string; revision: number };
      }>(`/api/documents/${documentId}/versions/${versionId}`, { method: "POST" });
      onRestored(result.document);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore that version.");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Version history"
      description="Snapshots are taken automatically as the document changes, at most once a minute."
      width="46rem"
    >
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger"
        >
          {error}
        </p>
      )}

      {versions === null ? (
        <p className="py-8 text-center text-xs text-muted">Loading history…</p>
      ) : versions.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted">
          No earlier versions yet. One is kept the first time you edit this document.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[15rem_1fr]">
          <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
            {versions.map((version) => (
              <li key={version.id}>
                <button
                  type="button"
                  onClick={() => void select(version.id)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                    selected === version.id
                      ? "border-accent bg-accent-soft shadow-xs"
                      : "border-line hover:border-line-strong hover:bg-surface-2"
                  }`}
                >
                  <span className="block text-xs font-semibold">
                    {relativeTime(version.createdAt, now)}
                  </span>
                  <span className="block text-[11px] text-muted">
                    {absoluteDateTime(version.createdAt)}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted">
                    {version.authorName ?? "Unknown"} · {version.size} chars
                  </span>
                  {version.label && (
                    <span className="mt-1.5 inline-block rounded-md bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium text-warning">
                      {version.label}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          <div className="min-w-0">
            {selected === null ? (
              <p className="flex h-full min-h-40 items-center justify-center rounded-xl border border-dashed border-line-strong px-4 text-center text-xs text-muted">
                Select a version to preview it.
              </p>
            ) : (
              <>
                <div
                  className="doc-body max-h-72 overflow-y-auto rounded-xl border border-line bg-surface-2 p-4 text-sm"
                  // Content is sanitized on write by the server, so what is stored
                  // is already constrained to the editor's tag allowlist.
                  dangerouslySetInnerHTML={{ __html: preview ?? "<p>Loading…</p>" }}
                />
                {canRestore && (
                  <button
                    type="button"
                    onClick={() => void restore(selected)}
                    disabled={restoring || preview === null}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-sm font-medium text-on-accent shadow-sm transition hover:bg-accent-hover active:scale-[0.98] disabled:opacity-50"
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                    {restoring ? "Restoring…" : "Restore this version"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

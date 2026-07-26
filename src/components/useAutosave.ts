"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api-client";
import { AUTOSAVE_DEBOUNCE_MS } from "@/lib/limits";

export type SaveStatus = "saved" | "dirty" | "saving" | "error";

export interface ConcurrentEdit {
  by: string;
  at: number;
}

interface PatchResponse {
  document: { id: string; title: string; updatedAt: number; revision: number };
  concurrentEdit?: ConcurrentEdit;
}

interface Draft {
  title?: string;
  contentHtml?: string;
}

/**
 * Debounced autosave for a single document.
 *
 * Design notes:
 *  - One in-flight request at a time. Edits made during a save are coalesced into
 *    a single follow-up rather than queued per keystroke, so a fast typist
 *    produces a steady trickle of writes instead of a pile-up.
 *  - `baseRevision` is sent with every write so the server can tell us when
 *    somebody else saved in between. The server accepts the write either way (and
 *    snapshots what it replaced) — we just surface it.
 *  - A failed save keeps the draft dirty and retries on the next edit, so a
 *    dropped connection does not silently discard work.
 */
export function useAutosave(documentId: string, initialRevision: number) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [concurrentEdit, setConcurrentEdit] = useState<ConcurrentEdit | null>(null);

  const revision = useRef(initialRevision);
  const pending = useRef<Draft>({});
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read by the beforeunload handler, which must not re-subscribe on every edit.
  const hasPending = useRef(false);

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inFlight.current) return; // the in-flight save's tail will pick this up
    const draft = pending.current;
    if (draft.title === undefined && draft.contentHtml === undefined) return;

    pending.current = {};
    hasPending.current = false;
    inFlight.current = true;
    setStatus("saving");
    setError(null);

    try {
      const result = await apiFetch<PatchResponse>(`/api/documents/${documentId}`, {
        method: "PATCH",
        body: JSON.stringify({ ...draft, baseRevision: revision.current }),
      });
      revision.current = result.document.revision;
      setLastSavedAt(result.document.updatedAt);
      if (result.concurrentEdit) setConcurrentEdit(result.concurrentEdit);
      inFlight.current = false;

      // Anything typed while that request was open.
      if (pending.current.title !== undefined || pending.current.contentHtml !== undefined) {
        await flush();
      } else {
        setStatus("saved");
      }
    } catch (err) {
      inFlight.current = false;
      // Put the draft back so the next edit (or retry) still carries it.
      pending.current = { ...draft, ...pending.current };
      hasPending.current = true;
      setStatus("error");
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not save your changes. They are still here — we will retry.",
      );
    }
  }, [documentId]);

  const queue = useCallback(
    (draft: Draft) => {
      pending.current = { ...pending.current, ...draft };
      hasPending.current = true;
      setStatus("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), AUTOSAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  /** Ctrl/Cmd+S saves now instead of letting the browser try to save the page. */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void flush();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [flush]);

  /**
   * Best-effort save when the tab goes away. `keepalive` lets the request outlive
   * the page; a normal fetch would be cancelled on unload. This is why the
   * debounce can be as long as it is without risking the last few seconds of work.
   */
  useEffect(() => {
    function persistNow() {
      if (!hasPending.current) return;
      const draft = pending.current;
      void fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...draft, baseRevision: revision.current }),
        keepalive: true,
      });
    }

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") persistNow();
    }

    window.addEventListener("beforeunload", persistNow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", persistNow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [documentId]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /** After a restore, the server's revision has moved on without an edit here. */
  const setRevision = useCallback((next: number) => {
    revision.current = next;
  }, []);

  return {
    status,
    error,
    lastSavedAt,
    concurrentEdit,
    dismissConcurrentEdit: () => setConcurrentEdit(null),
    queue,
    flush,
    setRevision,
    currentRevision: () => revision.current,
  };
}

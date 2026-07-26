"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { PRESENCE_HEARTBEAT_MS } from "@/lib/limits";
import { avatarColor, initials } from "@/lib/time";

interface Viewer {
  id: string;
  name: string;
  isSelf: boolean;
  lastSeenAt: number;
}

/**
 * "Who else is here" avatars, driven by a polled heartbeat.
 *
 * Polling rather than a socket is a deliberate scope cut: it gives a real,
 * useful signal with no stateful server, so it deploys anywhere the rest of the
 * app does. The cost is up to one interval of staleness, which is fine for
 * presence and would not be fine for cursors — hence no cursors.
 */
export function PresenceBar({ documentId }: { documentId: string }) {
  const [viewers, setViewers] = useState<Viewer[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function beat() {
      try {
        const result = await apiFetch<{ viewers: Viewer[] }>(
          `/api/documents/${documentId}/presence`,
          { method: "POST" },
        );
        if (!cancelled) setViewers(result.viewers);
      } catch {
        // Presence is decoration. A failed heartbeat must never surface an error
        // over the document the user is trying to write.
      }
    }

    void beat();
    const interval = setInterval(() => void beat(), PRESENCE_HEARTBEAT_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      // Clear the row on navigate-away so the avatar disappears immediately for
      // everyone else instead of lingering for a TTL.
      void fetch(`/api/documents/${documentId}/presence`, {
        method: "DELETE",
        keepalive: true,
      });
    };
  }, [documentId]);

  const others = viewers.filter((v) => !v.isSelf);
  if (others.length === 0) return null;

  return (
    <div
      className="animate-fade-in flex items-center gap-2 rounded-full bg-surface-2 py-1 pl-2.5 pr-1.5 ring-1 ring-line"
      title={`${others.map((v) => v.name).join(", ")} also here`}
    >
      <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
      </span>
      <span className="hidden text-[11px] font-medium text-muted sm:inline">Also here</span>
      <div className="flex -space-x-1.5">
        {others.slice(0, 4).map((viewer) => (
          <span
            key={viewer.id}
            className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-semibold text-white ring-2 ring-surface"
            style={{ backgroundColor: avatarColor(viewer.id) }}
            title={viewer.name}
          >
            {initials(viewer.name)}
          </span>
        ))}
        {others.length > 4 && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-faint text-[9px] font-semibold text-white ring-2 ring-surface">
            +{others.length - 4}
          </span>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { SHARE_ROLES, type ShareRole } from "@/lib/permissions";
import { avatarColor, initials } from "@/lib/time";
import { Modal } from "./Modal";

export interface ShareEntry {
  userId: string;
  role: ShareRole;
  name: string;
  email: string;
}

interface KnownUser {
  id: string;
  name: string;
  email: string;
}

const ROLE_COPY: Record<ShareRole, string> = {
  viewer: "Can view",
  editor: "Can edit",
};

/**
 * Manage who has access.
 *
 * Owner-only, and the dialog says so rather than showing disabled controls to
 * everyone else. Existing collaborators are listed with their role so revoking or
 * changing access is one interaction, not a separate screen.
 */
export function ShareDialog({
  open,
  onClose,
  documentId,
  ownerName,
  shares,
  onSharesChange,
}: {
  open: boolean;
  onClose: () => void;
  documentId: string;
  ownerName: string;
  shares: ShareEntry[];
  onSharesChange: (shares: ShareEntry[]) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("editor");
  const [known, setKnown] = useState<KnownUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Load the suggestion list once the dialog is actually opened.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void apiFetch<{ users: KnownUser[] }>("/api/users")
      .then((result) => {
        if (!cancelled) setKnown(result.users);
      })
      .catch(() => {
        // Suggestions are a convenience; typing an address still works.
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function grant(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ share: ShareEntry }>(
        `/api/documents/${documentId}/shares`,
        { method: "POST", body: JSON.stringify({ email, role }) },
      );
      // Re-posting an existing collaborator is a role change, so replace by id
      // rather than appending a duplicate row.
      onSharesChange([
        ...shares.filter((s) => s.userId !== result.share.userId),
        result.share,
      ]);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not share the document.");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(userId: string, nextRole: ShareRole) {
    const previous = shares;
    // Optimistic: the row is already on screen and reverting is cheap.
    onSharesChange(shares.map((s) => (s.userId === userId ? { ...s, role: nextRole } : s)));
    try {
      await apiFetch(`/api/documents/${documentId}/shares/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole }),
      });
    } catch (err) {
      onSharesChange(previous);
      setError(err instanceof Error ? err.message : "Could not change that role.");
    }
  }

  async function revoke(userId: string) {
    const previous = shares;
    onSharesChange(shares.filter((s) => s.userId !== userId));
    try {
      await apiFetch(`/api/documents/${documentId}/shares/${userId}`, { method: "DELETE" });
    } catch (err) {
      onSharesChange(previous);
      setError(err instanceof Error ? err.message : "Could not remove that person.");
    }
  }

  const suggestions = known.filter((u) => !shares.some((s) => s.userId === u.id));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share this document"
      description="Sharing works between existing accounts — there is no email invite in this build."
      width="30rem"
    >
      <form onSubmit={grant} className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-xs font-medium text-[var(--color-muted)]">
            Email address
          </span>
          <input
            type="email"
            required
            list="share-suggestions"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="grace@ajaia.test"
            className="w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm outline-none transition focus:border-[var(--color-accent)]"
          />
          <datalist id="share-suggestions">
            {suggestions.map((user) => (
              <option key={user.id} value={user.email}>
                {user.name}
              </option>
            ))}
          </datalist>
        </label>

        <label>
          <span className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Access</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as ShareRole)}
            className="rounded-lg border border-[var(--color-line)] bg-white px-2 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          >
            {SHARE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_COPY[r]}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white transition hover:brightness-95 disabled:opacity-50"
        >
          {busy ? "Sharing…" : "Share"}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      <div className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Who has access
        </h3>
        <ul className="mt-2 divide-y divide-[var(--color-line)]">
          <li className="flex items-center gap-3 py-2.5">
            <Avatar seed={ownerName} name={ownerName} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{ownerName}</span>
              <span className="block text-xs text-[var(--color-muted)]">Owner</span>
            </span>
          </li>

          {shares.map((share) => (
            <li key={share.userId} className="flex items-center gap-3 py-2.5">
              <Avatar seed={share.userId} name={share.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{share.name}</span>
                <span className="block truncate text-xs text-[var(--color-muted)]">
                  {share.email}
                </span>
              </span>
              <select
                value={share.role}
                aria-label={`Access level for ${share.name}`}
                onChange={(event) => void changeRole(share.userId, event.target.value as ShareRole)}
                className="rounded-md border border-[var(--color-line)] bg-white px-2 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
              >
                {SHARE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_COPY[r]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void revoke(share.userId)}
                aria-label={`Remove ${share.name}`}
                title={`Remove ${share.name}`}
                className="rounded-md p-1.5 text-[var(--color-muted)] transition hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </li>
          ))}

          {shares.length === 0 && (
            <li className="py-3 text-xs text-[var(--color-muted)]">
              Only you can see this document.
            </li>
          )}
        </ul>
      </div>
    </Modal>
  );
}

function Avatar({ seed, name }: { seed: string; name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ backgroundColor: avatarColor(seed) }}
    >
      {initials(name)}
    </span>
  );
}

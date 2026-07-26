"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * Dialog shell built on the native <dialog> element, so focus trapping, Escape
 * handling, backdrop rendering and the top layer come from the platform instead
 * of being reimplemented.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  width = "28rem",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      // Fires for Escape and for a programmatic close; keeps React state in sync.
      onClose={onClose}
      onClick={(event) => {
        // Clicking the backdrop hits the <dialog> itself, not its content.
        if (event.target === ref.current) onClose();
      }}
      className="m-auto w-[calc(100vw-2rem)] rounded-xl border border-[var(--color-line)] bg-white p-0 shadow-xl backdrop:bg-black/30"
      style={{ maxWidth: width }}
    >
      {open && (
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">{title}</h2>
              {description && (
                <p className="mt-1 text-xs text-[var(--color-muted)]">{description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-m-1 rounded-md p-1 text-[var(--color-muted)] transition hover:bg-[var(--color-canvas)]"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="mt-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

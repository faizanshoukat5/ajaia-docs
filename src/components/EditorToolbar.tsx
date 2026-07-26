"use client";

import type { Editor } from "@tiptap/react";
import { useEffect, useState } from "react";
import {
  Bold,
  Code,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { Modal } from "./Modal";

/**
 * Formatting controls.
 *
 * Deliberately a small, opinionated set — the formats a shared working document
 * actually needs, and exactly the ones the server-side sanitizer allows. Adding a
 * control means widening the allowlist in `src/lib/sanitize.ts` too, which is the
 * intended friction.
 *
 * Every action has a keyboard shortcut via TipTap; the buttons are the
 * discoverable surface for the same commands.
 */
export function EditorToolbar({ editor }: { editor: Editor }) {
  // TipTap mutates the editor in place, so subscribe to its transactions to keep
  // the active/disabled states of these buttons correct.
  const [, forceRender] = useState(0);

  useEffect(() => {
    const update = () => forceRender((n) => n + 1);
    editor.on("transaction", update);
    editor.on("selectionUpdate", update);
    return () => {
      editor.off("transaction", update);
      editor.off("selectionUpdate", update);
    };
  }, [editor]);

  const blockValue = editor.isActive("heading", { level: 1 })
    ? "h1"
    : editor.isActive("heading", { level: 2 })
      ? "h2"
      : editor.isActive("heading", { level: 3 })
        ? "h3"
        : "p";

  function setBlock(value: string) {
    const chain = editor.chain().focus();
    if (value === "p") chain.setParagraph().run();
    else chain.setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 }).run();
  }

  // Link editing happens in a dialog (state below), replacing the earlier
  // window.prompt. ProseMirror keeps the selection while the dialog is open, and
  // `chain().focus()` restores it before the command applies.
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const hasExistingLink = editor.isActive("link");

  function openLinkDialog() {
    const existing = editor.getAttributes("link").href as string | undefined;
    setLinkUrl(existing ?? "https://");
    setLinkError(null);
    setLinkOpen(true);
  }

  function applyLink(event: React.FormEvent) {
    event.preventDefault();
    const url = linkUrl.trim();
    if (url === "") {
      removeLink();
      return;
    }
    // Only http(s) and mailto survive the server sanitizer; reject the rest here
    // so the user finds out immediately rather than after a save.
    if (!/^(https?:|mailto:)/i.test(url)) {
      setLinkError("Links must start with http://, https:// or mailto:");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    setLinkOpen(false);
  }

  function removeLink() {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
  }

  return (
    <div
      className="no-print sticky top-14 z-10 flex flex-wrap items-center gap-0.5 rounded-t-2xl border-b border-line bg-surface/95 px-2.5 py-1.5 backdrop-blur"
      role="toolbar"
      aria-label="Text formatting"
    >
      <select
        value={blockValue}
        onChange={(event) => setBlock(event.target.value)}
        aria-label="Text style"
        className="mr-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs font-medium outline-none transition focus:border-accent"
      >
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>

      <Divider />

      <Button
        label="Bold"
        shortcut="Ctrl+B"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold size={15} aria-hidden="true" />
      </Button>
      <Button
        label="Italic"
        shortcut="Ctrl+I"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic size={15} aria-hidden="true" />
      </Button>
      <Button
        label="Underline"
        shortcut="Ctrl+U"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon size={15} aria-hidden="true" />
      </Button>
      <Button
        label="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough size={15} aria-hidden="true" />
      </Button>

      <Divider />

      <Button
        label="Bulleted list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List size={15} aria-hidden="true" />
      </Button>
      <Button
        label="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered size={15} aria-hidden="true" />
      </Button>
      <Button
        label="Quote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote size={15} aria-hidden="true" />
      </Button>
      <Button
        label="Code block"
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <Code size={15} aria-hidden="true" />
      </Button>
      <Button label="Link" active={hasExistingLink} onClick={openLinkDialog}>
        <Link2 size={15} aria-hidden="true" />
      </Button>

      <Modal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        title={hasExistingLink ? "Edit link" : "Add link"}
        description="Applies to the selected text. http(s) and mailto links only — anything else would be stripped on save."
      >
        <form onSubmit={applyLink} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-2">URL</span>
            <input
              type="text"
              value={linkUrl}
              onChange={(event) => {
                setLinkUrl(event.target.value);
                setLinkError(null);
              }}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- a single-field dialog
              autoFocus
              spellCheck={false}
              placeholder="https://example.com"
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 font-mono text-sm outline-none transition placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent-ring"
            />
          </label>

          {linkError && (
            <p
              role="alert"
              className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger"
            >
              {linkError}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            {hasExistingLink ? (
              <button
                type="button"
                onClick={removeLink}
                className="rounded-xl px-3 py-2 text-sm font-medium text-danger transition hover:bg-danger-soft"
              >
                Remove link
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLinkOpen(false)}
                className="rounded-xl border border-line px-3.5 py-2 text-sm font-medium transition hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-accent px-3.5 py-2 text-sm font-medium text-on-accent shadow-sm transition hover:bg-accent-hover"
              >
                {hasExistingLink ? "Save" : "Add link"}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <Divider />

      <Button
        label="Undo"
        shortcut="Ctrl+Z"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 size={15} aria-hidden="true" />
      </Button>
      <Button
        label="Redo"
        shortcut="Ctrl+Shift+Z"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 size={15} aria-hidden="true" />
      </Button>
    </div>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />;
}

function Button({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      // The toolbar sits outside the editable area; without this, mousedown moves
      // focus out of the document and the command applies to a collapsed selection.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active ?? undefined}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={`rounded-lg p-1.5 transition active:scale-95 disabled:opacity-30 ${
        active
          ? "bg-accent-soft text-accent"
          : "text-ink-2 hover:bg-surface-2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

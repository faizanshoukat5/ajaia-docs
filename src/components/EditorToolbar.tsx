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

  function toggleLink() {
    const existing = editor.getAttributes("link").href as string | undefined;
    // A prompt is the honest choice here: a bespoke link popover is a lot of UI
    // for a secondary action inside a fixed timebox.
    const input = window.prompt("Link URL (leave empty to remove)", existing ?? "https://");
    if (input === null) return;

    const url = input.trim();
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    // Only http(s) and mailto survive the server sanitizer; reject the rest here
    // so the user finds out immediately rather than after a save.
    if (!/^(https?:|mailto:)/i.test(url)) {
      window.alert("Links must start with http://, https:// or mailto:");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div
      className="no-print flex flex-wrap items-center gap-0.5 border-b border-[var(--color-line)] bg-white px-2 py-1.5"
      role="toolbar"
      aria-label="Text formatting"
    >
      <select
        value={blockValue}
        onChange={(event) => setBlock(event.target.value)}
        aria-label="Text style"
        className="mr-1 rounded-md border border-[var(--color-line)] bg-white px-2 py-1 text-xs font-medium outline-none focus:border-[var(--color-accent)]"
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
      <Button label="Link" active={editor.isActive("link")} onClick={toggleLink}>
        <Link2 size={15} aria-hidden="true" />
      </Button>

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
  return <span aria-hidden="true" className="mx-1 h-5 w-px bg-[var(--color-line)]" />;
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
      className={`rounded-md p-1.5 transition disabled:opacity-30 ${
        active
          ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
          : "text-[var(--color-ink)] hover:bg-[var(--color-canvas)]"
      }`}
    >
      {children}
    </button>
  );
}

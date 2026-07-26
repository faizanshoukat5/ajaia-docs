import { describe, expect, it } from "vitest";
import {
  htmlToMarkdown,
  htmlToText,
  markdownToHtml,
  plainTextToHtml,
  toFilename,
} from "@/lib/convert";

describe("markdownToHtml", () => {
  it("converts the formats the editor supports", () => {
    const html = markdownToHtml(
      ["# Title", "", "Some **bold** and _italic_.", "", "- one", "- two", "", "1. first"].join("\n"),
    );
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<ol>");
  });

  it("sanitizes raw HTML embedded in the markdown", () => {
    // marked passes inline HTML straight through, so the sanitizer is what makes
    // importing an untrusted .md file safe.
    const html = markdownToHtml("Hello <script>alert(1)</script> world");
    expect(html).not.toContain("script");
    expect(html).not.toContain("alert");
  });

  it("strips javascript: links written in markdown syntax", () => {
    const html = markdownToHtml("[click](javascript:alert(1))");
    expect(html.toLowerCase()).not.toContain("javascript:");
  });

  it("keeps ordinary links", () => {
    expect(markdownToHtml("[docs](https://example.com)")).toContain("https://example.com");
  });
});

describe("plainTextToHtml", () => {
  it("makes a paragraph per blank-line-separated block", () => {
    expect(plainTextToHtml("one\n\ntwo")).toBe("<p>one</p><p>two</p>");
  });

  it("makes single newlines into hard breaks", () => {
    expect(plainTextToHtml("one\ntwo")).toBe("<p>one<br />two</p>");
  });

  it("escapes HTML in the source text", () => {
    const html = plainTextToHtml("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("normalizes Windows and classic Mac line endings", () => {
    expect(plainTextToHtml("a\r\n\r\nb")).toBe("<p>a</p><p>b</p>");
    expect(plainTextToHtml("a\r\rb")).toBe("<p>a</p><p>b</p>");
  });

  it("collapses whitespace-only input to an empty document", () => {
    expect(plainTextToHtml("   \n\n  ")).toBe("<p></p>");
  });
});

describe("htmlToMarkdown", () => {
  it("round-trips the common formats", () => {
    const md = htmlToMarkdown(
      "<h1>Title</h1><p><strong>bold</strong> and <em>italic</em></p><ul><li>a</li></ul>",
    );
    expect(md).toContain("# Title");
    expect(md).toContain("**bold**");
    expect(md).toContain("_italic_");
    // Turndown pads the marker ("-   a"), which is valid markdown; match the
    // structure rather than its exact spacing.
    expect(md).toMatch(/^-\s+a$/m);
  });

  it("preserves underline as inline HTML, since markdown has no syntax for it", () => {
    expect(htmlToMarkdown("<p><u>underlined</u></p>")).toContain("<u>underlined</u>");
  });

  it("writes strikethrough in GFM syntax", () => {
    expect(htmlToMarkdown("<p><s>gone</s></p>")).toContain("~~gone~~");
  });

  it("fences code blocks", () => {
    expect(htmlToMarkdown("<pre><code>const x = 1;</code></pre>")).toContain("```");
  });
});

describe("htmlToText", () => {
  it("produces readable plain text", () => {
    expect(htmlToText("<h1>T</h1><p>body</p>")).toBe("T\nbody");
  });
});

describe("toFilename", () => {
  it("slugifies a title", () => {
    expect(toFilename("Q3 Product Roadmap", "md")).toBe("Q3-Product-Roadmap.md");
  });

  it("keeps digits — a character-class range bug here once ate them", () => {
    expect(toFilename("2026 Q3 Plan", "md")).toBe("2026-Q3-Plan.md");
  });

  it("strips path separators so the name cannot escape a directory", () => {
    expect(toFilename("../../etc/passwd", "txt")).toBe("etc-passwd.txt");
    expect(toFilename("C:\\Windows\\System32", "txt")).toBe("C-Windows-System32.txt");
  });

  it("removes characters Windows rejects", () => {
    const name = toFilename('a<b>c:d"e|f?g*h', "md");
    for (const ch of ["<", ">", ":", '"', "|", "?", "*"]) {
      expect(name).not.toContain(ch);
    }
  });

  it("preserves non-Latin titles rather than blanking them", () => {
    expect(toFilename("日本語の文書", "md")).toBe("日本語の文書.md");
  });

  it("falls back when nothing usable remains", () => {
    expect(toFilename("///", "md")).toBe("document.md");
    expect(toFilename("", "md")).toBe("document.md");
    expect(toFilename("...", "md")).toBe("document.md");
  });

  it("caps the length", () => {
    expect(toFilename("x".repeat(500), "md").length).toBeLessThanOrEqual(84);
  });
});

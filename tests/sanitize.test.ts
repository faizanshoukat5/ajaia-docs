import { describe, expect, it } from "vitest";
import {
  EMPTY_DOCUMENT_HTML,
  decodeEntities,
  excerpt,
  htmlToPlainText,
  isEmptyDocumentHtml,
  sanitizeDocumentHtml,
} from "@/lib/sanitize";

/**
 * Sanitization is the trust boundary: stored HTML is rendered with
 * `dangerouslySetInnerHTML` and loaded into the editor, so anything that survives
 * this function is executed in another user's browser.
 *
 * These cases are the standard vectors plus the ones specific to our two untrusted
 * sources (a hand-crafted PATCH body, and Word's HTML output).
 */

describe("sanitizeDocumentHtml — XSS", () => {
  it("removes script tags and their contents", () => {
    const result = sanitizeDocumentHtml('<p>hi</p><script>alert("xss")</script>');
    expect(result).not.toContain("script");
    // The body must go too, not just the tags, or it reappears as visible text.
    expect(result).not.toContain("alert");
    expect(result).toContain("<p>hi</p>");
  });

  it("strips inline event handlers", () => {
    const result = sanitizeDocumentHtml('<p onclick="steal()">text</p>');
    expect(result).toBe("<p>text</p>");
  });

  it("rejects javascript: URLs", () => {
    const result = sanitizeDocumentHtml('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain("javascript");
    expect(result).toContain("click");
  });

  it("rejects javascript: URLs obfuscated with entities and whitespace", () => {
    for (const href of [
      "java&#115;cript:alert(1)",
      "  javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "java\tscript:alert(1)",
    ]) {
      const result = sanitizeDocumentHtml(`<a href="${href}">x</a>`);
      expect(result.toLowerCase()).not.toContain("javascript:");
    }
  });

  it("rejects data: URLs", () => {
    const result = sanitizeDocumentHtml(
      '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
    );
    expect(result).not.toContain("data:");
  });

  it("rejects protocol-relative URLs", () => {
    const result = sanitizeDocumentHtml('<a href="//evil.example/steal">x</a>');
    expect(result).not.toContain("evil.example");
  });

  it("removes images, iframes, objects, forms and inputs", () => {
    const result = sanitizeDocumentHtml(
      '<img src=x onerror=alert(1)><iframe src="https://evil.test"></iframe>' +
        '<object data="x"></object><form><input name="pw"></form><p>kept</p>',
    );
    expect(result).toBe("<p>kept</p>");
  });

  it("removes style tags and inline style attributes", () => {
    const result = sanitizeDocumentHtml(
      '<style>body{display:none}</style><p style="position:fixed;top:0">t</p>',
    );
    expect(result).toBe("<p>t</p>");
  });

  it("drops HTML comments, including IE conditional comments from Word", () => {
    const result = sanitizeDocumentHtml("<!--[if IE]><script>bad()</script><![endif]--><p>ok</p>");
    expect(result).not.toContain("bad");
    expect(result).not.toContain("<!--");
  });

  it("does not resurrect markup through double encoding", () => {
    const once = sanitizeDocumentHtml("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
    // Sanitizing the output again must not decode the entities into live markup.
    expect(sanitizeDocumentHtml(once)).not.toContain("<script");
  });
});

describe("sanitizeDocumentHtml — allowlist", () => {
  it("keeps the formatting the editor can produce", () => {
    const html =
      "<h1>T</h1><h2>S</h2><h3>X</h3><p><strong>b</strong><em>i</em><u>u</u><s>s</s></p>" +
      "<ul><li>a</li></ul><ol><li>1</li></ol><blockquote><p>q</p></blockquote>" +
      "<pre><code>code</code></pre><hr />";
    const result = sanitizeDocumentHtml(html);

    for (const tag of ["h1", "h2", "h3", "strong", "em", "u", "s", "ul", "ol", "li", "blockquote", "pre", "code", "hr"]) {
      expect(result).toContain(`<${tag}`);
    }
  });

  it("keeps safe links and forces them to open safely", () => {
    const result = sanitizeDocumentHtml('<a href="https://example.com">x</a>');
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('rel="noopener noreferrer nofollow"');
    expect(result).toContain('target="_blank"');
  });

  it("keeps mailto links", () => {
    expect(sanitizeDocumentHtml('<a href="mailto:a@b.test">m</a>')).toContain("mailto:a@b.test");
  });

  it("folds Word's deeper headings down to h3 instead of discarding them", () => {
    const result = sanitizeDocumentHtml("<h4>Sub</h4><h6>Deeper</h6>");
    expect(result).toBe("<h3>Sub</h3><h3>Deeper</h3>");
  });

  it("normalizes legacy presentational tags", () => {
    expect(sanitizeDocumentHtml("<strike>gone</strike>")).toBe("<s>gone</s>");
    expect(sanitizeDocumentHtml("<div>block</div>")).toBe("<p>block</p>");
  });

  it("keeps the language class on code blocks", () => {
    const result = sanitizeDocumentHtml('<pre><code class="language-ts">x</code></pre>');
    expect(result).toContain('class="language-ts"');
  });

  it("normalizes empty input to a single empty paragraph", () => {
    expect(sanitizeDocumentHtml("")).toBe(EMPTY_DOCUMENT_HTML);
    expect(sanitizeDocumentHtml("   \n  ")).toBe(EMPTY_DOCUMENT_HTML);
    expect(sanitizeDocumentHtml("<script>x</script>")).toBe(EMPTY_DOCUMENT_HTML);
  });

  it("is idempotent — sanitizing twice equals sanitizing once", () => {
    // Content is re-sanitized on every write, so this must hold or documents
    // would drift with each save.
    const inputs = [
      "<p>plain</p>",
      '<a href="https://x.test">link</a>',
      "<h4>folded</h4>",
      "<p>a &amp; b</p>",
      "<ul><li>x</li></ul>",
    ];
    for (const input of inputs) {
      const once = sanitizeDocumentHtml(input);
      expect(sanitizeDocumentHtml(once)).toBe(once);
    }
  });
});

describe("htmlToPlainText", () => {
  it("separates block elements with newlines", () => {
    expect(htmlToPlainText("<p>one</p><p>two</p>")).toBe("one\ntwo");
  });

  it("turns <br> into a newline", () => {
    expect(htmlToPlainText("<p>a<br />b</p>")).toBe("a\nb");
  });

  it("flattens list items onto separate lines", () => {
    expect(htmlToPlainText("<ul><li>a</li><li>b</li></ul>")).toBe("a\nb");
  });

  it("decodes entities", () => {
    expect(htmlToPlainText("<p>Tom &amp; Jerry &lt;3</p>")).toBe("Tom & Jerry <3");
  });

  it("collapses runs of spaces without eating line breaks", () => {
    expect(htmlToPlainText("<p>a    b</p><p>c</p>")).toBe("a b\nc");
  });

  it("returns an empty string for an empty document", () => {
    expect(htmlToPlainText(EMPTY_DOCUMENT_HTML)).toBe("");
  });
});

describe("decodeEntities", () => {
  it("handles named, decimal and hex entities", () => {
    expect(decodeEntities("&amp;&lt;&gt;&quot;&#39;")).toBe("&<>\"'");
    expect(decodeEntities("&#65;&#66;")).toBe("AB");
    expect(decodeEntities("&#x41;&#x42;")).toBe("AB");
  });

  it("leaves unknown entities untouched rather than mangling them", () => {
    expect(decodeEntities("&notanentity;")).toBe("&notanentity;");
  });

  it("ignores out-of-range code points instead of throwing", () => {
    expect(decodeEntities("&#xFFFFFFFF;")).toBe("&#xFFFFFFFF;");
  });
});

describe("isEmptyDocumentHtml", () => {
  it("treats structural-only markup as empty", () => {
    expect(isEmptyDocumentHtml(EMPTY_DOCUMENT_HTML)).toBe(true);
    expect(isEmptyDocumentHtml("<p></p><p>  </p>")).toBe(true);
    expect(isEmptyDocumentHtml("<p>x</p>")).toBe(false);
  });
});

describe("excerpt", () => {
  it("truncates with an ellipsis and collapses whitespace", () => {
    expect(excerpt("a\n\nb")).toBe("a b");
    const long = "x".repeat(200);
    const result = excerpt(long, 20);
    expect(result).toHaveLength(21); // 20 chars + the ellipsis
    expect(result.endsWith("…")).toBe(true);
  });

  it("leaves short text alone", () => {
    expect(excerpt("short", 20)).toBe("short");
  });
});

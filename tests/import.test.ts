import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { MAX_UPLOAD_BYTES } from "@/lib/limits";
import { inferTitle, parseUpload } from "@/server/import";
import { asFile, makeDocx } from "./helpers";

/**
 * The import path takes bytes from an untrusted source and turns them into stored
 * document content, so both the happy paths and every rejection path matter. The
 * .docx cases build a genuine OOXML zip and run it through mammoth for real.
 */

async function expectRejection(file: File, status: number, fragment: string) {
  await expect(parseUpload(file)).rejects.toMatchObject({ status });
  await expect(parseUpload(file)).rejects.toThrow(new RegExp(fragment, "i"));
}

describe("parseUpload — plain text", () => {
  it("imports a .txt file as paragraphs", async () => {
    const result = await parseUpload(asFile("First para.\n\nSecond para.", "notes.txt"));
    expect(result.kind).toBe("txt");
    expect(result.html).toBe("<p>First para.</p><p>Second para.</p>");
  });

  it("uses the first line as the title", async () => {
    const result = await parseUpload(asFile("Meeting notes\n\nBody text", "upload.txt"));
    expect(result.suggestedTitle).toBe("Meeting notes");
  });

  it("strips a UTF-8 BOM instead of leaking it into the first word", async () => {
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("Hello", "utf8")]);
    const result = await parseUpload(asFile(withBom, "bom.txt"));
    expect(result.html).toBe("<p>Hello</p>");
    expect(result.suggestedTitle).toBe("Hello");
  });

  it("escapes HTML in the source", async () => {
    const result = await parseUpload(asFile("<script>alert(1)</script>", "evil.txt"));
    expect(result.html).not.toContain("<script>");
  });
});

describe("parseUpload — markdown", () => {
  it("imports .md with structure intact", async () => {
    const result = await parseUpload(asFile("# Spec\n\n- one\n- two", "spec.md"));
    expect(result.kind).toBe("markdown");
    expect(result.html).toContain("<h1>Spec</h1>");
    expect(result.html).toContain("<li>one</li>");
    expect(result.suggestedTitle).toBe("Spec");
  });

  it("accepts the .markdown extension too", async () => {
    const result = await parseUpload(asFile("# Hi", "readme.markdown"));
    expect(result.kind).toBe("markdown");
  });

  it("sanitizes embedded HTML", async () => {
    const result = await parseUpload(asFile("# Ok\n\n<img src=x onerror=alert(1)>", "x.md"));
    expect(result.html).not.toContain("onerror");
    expect(result.html).not.toContain("<img");
  });
});

describe("parseUpload — docx", () => {
  it("converts a real .docx into document HTML", async () => {
    const docx = await makeDocx([
      { text: "Quarterly Report", style: "Heading1" },
      { text: "This is the body of the report." },
    ]);
    const result = await parseUpload(asFile(docx, "report.docx"));

    expect(result.kind).toBe("docx");
    expect(result.html).toContain("Quarterly Report");
    expect(result.html).toContain("This is the body of the report.");
    expect(result.suggestedTitle).toBe("Quarterly Report");
  });

  it("escapes text that looks like markup inside the document", async () => {
    const docx = await makeDocx([{ text: "<script>alert(1)</script>" }]);
    const result = await parseUpload(asFile(docx, "sneaky.docx"));
    expect(result.html).not.toContain("<script");
  });

  it("rejects a renamed non-zip file with an actionable message", async () => {
    // The classic user error: renaming a legacy .doc to .docx.
    await expectRejection(asFile("this is not a zip", "legacy.docx"), 400, "not a valid .docx");
  });

  it("rejects a corrupt zip rather than throwing an unhandled error", async () => {
    const brokenZip = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from("garbage that is not a real archive"),
    ]);
    await expect(parseUpload(asFile(brokenZip, "broken.docx"))).rejects.toBeInstanceOf(AppError);
  });
});

describe("parseUpload — rejections", () => {
  it("rejects unsupported extensions and names the supported ones", async () => {
    await expectRejection(asFile("data", "photo.png"), 415, "not supported");
  });

  it("rejects a file with no extension", async () => {
    await expectRejection(asFile("data", "README"), 415, "not supported");
  });

  it("rejects .pdf explicitly, since it is the most likely wrong guess", async () => {
    await expectRejection(asFile("%PDF-1.4", "doc.pdf"), 415, "not supported");
  });

  it("rejects an empty file", async () => {
    await expectRejection(asFile("", "empty.txt"), 400, "empty");
  });

  it("rejects a file that is only whitespace", async () => {
    await expectRejection(asFile("   \n\n  ", "blank.txt"), 400, "did not contain any text");
  });

  it("rejects binary content disguised as .txt", async () => {
    const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a, 0x0a, 0x00]);
    await expectRejection(asFile(binary, "image.txt"), 400, "does not look like a text file");
  });

  it("rejects an upload over the size limit", async () => {
    const tooBig = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0x61);
    await expectRejection(asFile(tooBig, "huge.txt"), 413, "limit");
  });

  it("is case-insensitive about extensions", async () => {
    const result = await parseUpload(asFile("Hello", "NOTES.TXT"));
    expect(result.kind).toBe("txt");
  });
});

describe("inferTitle", () => {
  it("prefers a heading over a paragraph, wherever the heading appears", () => {
    expect(inferTitle("<h1>Real Title</h1><p>intro</p>", "f.md")).toBe("Real Title");
    // Word documents often open with a subtitle or date line before the heading,
    // so the heading still wins even when it is not the first node.
    expect(inferTitle("<p>intro</p><h1>Real Title</h1>", "f.md")).toBe("Real Title");
  });

  it("falls back to the first paragraph", () => {
    expect(inferTitle("<p>Just a line</p>", "f.md")).toBe("Just a line");
  });

  it("falls back to the filename stem when there is no text", () => {
    expect(inferTitle("<hr />", "my-notes.docx")).toBe("my-notes");
  });

  it("decodes entities without producing markup", () => {
    expect(inferTitle("<h1>Tom &amp; Jerry</h1>", "f.md")).toBe("Tom & Jerry");
    // Double-encoded input must not decode into a tag.
    expect(inferTitle("<h1>&amp;lt;b&amp;gt;</h1>", "f.md")).toBe("&lt;b&gt;");
  });

  it("caps very long titles", () => {
    expect(inferTitle(`<h1>${"x".repeat(500)}</h1>`, "f.md")).toHaveLength(120);
  });
});

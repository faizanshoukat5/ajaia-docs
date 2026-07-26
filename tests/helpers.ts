import JSZip from "jszip";
import { createDb, type Db } from "@/db/client";
import { users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { hashPassword } from "@/lib/password";
import type { SessionUser } from "@/server/session";

/**
 * Shared test scaffolding.
 *
 * Every DB-backed suite gets a fresh in-memory database built from the real
 * migration files, so the tests exercise the same schema the app runs against
 * rather than a hand-maintained fixture.
 */

export function testDb(): Db {
  return createDb(":memory:").db;
}

let userCounter = 0;

export function makeUser(db: Db, name: string): SessionUser {
  userCounter += 1;
  const user = {
    id: newId(),
    // Unique per call so the lower(email) index never collides across a suite.
    email: `${name.toLowerCase().replace(/\s+/g, ".")}.${userCounter}@test.local`,
    name,
    // A fixed cheap hash: these tests never verify passwords, and scrypt at real
    // parameters would dominate the suite's runtime.
    passwordHash: "scrypt$2$1$1$c2FsdA$aGFzaA",
    createdAt: Date.now(),
  };
  db.insert(users).values(user).run();
  return { id: user.id, email: user.email, name: user.name };
}

/** A real scrypt hash, for the one suite that actually verifies passwords. */
export function realHash(password: string): string {
  return hashPassword(password);
}

/**
 * Builds a minimal but genuinely valid .docx (an OOXML zip) so the import tests
 * drive mammoth for real instead of mocking it.
 */
export async function makeDocx(paragraphs: Array<{ text: string; style?: string }>): Promise<Buffer> {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );

  const body = paragraphs
    .map(({ text, style }) => {
      const props = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
      const escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<w:p>${props}<w:r><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
    })
    .join("");

  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}</w:body>
</w:document>`,
  );

  return zip.generateAsync({ type: "nodebuffer" });
}

/** Wraps bytes in a `File`, which is what the import route receives. */
export function asFile(bytes: Buffer | string, filename: string): File {
  const data = typeof bytes === "string" ? Buffer.from(bytes, "utf8") : bytes;
  return new File([new Uint8Array(data)], filename);
}

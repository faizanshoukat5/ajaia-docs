import { z } from "zod";
import { badRequest } from "./errors";
import { MAX_DOCUMENT_BYTES, MAX_TITLE_LENGTH, MIN_PASSWORD_LENGTH } from "./limits";
import { SHARE_ROLES } from "./permissions";

/**
 * Request-shape validation. Every route parses its input through one of these
 * before touching the database, so handlers can assume well-formed data.
 */

export const titleSchema = z
  .string()
  .trim()
  .min(1, "Give the document a title.")
  .max(MAX_TITLE_LENGTH, `Titles are limited to ${MAX_TITLE_LENGTH} characters.`);

export const documentHtmlSchema = z
  .string()
  // Byte length, not character length: a 1 MB cap that counts UTF-16 units would
  // let a document of astral-plane characters through at twice the intended size.
  .refine(
    (html) => Buffer.byteLength(html, "utf8") <= MAX_DOCUMENT_BYTES,
    `Documents are limited to ${Math.round(MAX_DOCUMENT_BYTES / 1024)} KB of content.`,
  );

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter an email address.")
  .max(254)
  .pipe(z.email("Enter a valid email address."))
  // Normalize once, here, so callers never compare raw casing.
  .transform((value) => value.toLowerCase());

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export const signupSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1, "Enter your name.").max(80),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    .max(200),
});

export const createDocumentSchema = z.object({
  title: titleSchema.optional(),
});

export const updateDocumentSchema = z
  .object({
    title: titleSchema.optional(),
    contentHtml: documentHtmlSchema.optional(),
    /**
     * The revision the client believed it was editing. Optional — omitting it
     * means "I accept whatever is there" — but the editor always sends it so the
     * server can flag a concurrent write.
     */
    baseRevision: z.number().int().nonnegative().optional(),
  })
  .refine(
    (body) => body.title !== undefined || body.contentHtml !== undefined,
    "Nothing to update.",
  );

export const shareSchema = z.object({
  email: emailSchema,
  role: z.enum(SHARE_ROLES),
});

export const updateShareSchema = z.object({
  role: z.enum(SHARE_ROLES),
});

export const importTargetSchema = z.object({
  /** Where the parsed file content should land. */
  mode: z.enum(["new-document", "append", "replace"]),
  /** Required when mode is append/replace. */
  documentId: z.string().trim().min(1).max(64).optional(),
});

export const exportFormatSchema = z.enum(["md", "html", "txt"]);

/**
 * Parses `input` or throws a 400 whose message is the first field error, which is
 * what the client surfaces in the inline error slot.
 */
export function parseOrThrow<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const first = result.error.issues[0];
  const message = first?.message ?? "That request was not valid.";
  throw badRequest(message, {
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  });
}

/** Reads and parses a JSON body, turning malformed JSON into a 400. */
export async function parseJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.output<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw badRequest("Expected a JSON request body.");
  }
  return parseOrThrow(schema, raw);
}

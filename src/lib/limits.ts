/**
 * Every hard limit in the product, in one place, so the UI copy, the validation
 * layer and the README can all cite the same numbers.
 */

/** Largest upload accepted by the import endpoint. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

/** Largest document body we will store, measured on the sanitized HTML. */
export const MAX_DOCUMENT_BYTES = 1024 * 1024; // 1 MB

export const MAX_TITLE_LENGTH = 200;
export const MIN_PASSWORD_LENGTH = 6;

/** Snapshots retained per document; older ones are pruned on write. */
export const MAX_VERSIONS_PER_DOCUMENT = 30;

/**
 * Do not snapshot more than once per minute per document. Autosave fires every
 * ~900 ms while typing; without this the history would be pure noise.
 */
export const VERSION_MIN_INTERVAL_MS = 60 * 1000;

/** A presence heartbeat older than this means the user is no longer viewing. */
export const PRESENCE_TTL_MS = 30 * 1000;

/** How often the client re-sends its heartbeat / re-polls collaborators. */
export const PRESENCE_HEARTBEAT_MS = 10 * 1000;

/** Autosave debounce. Long enough to batch typing, short enough to feel safe. */
export const AUTOSAVE_DEBOUNCE_MS = 900;

/** File extensions the import flow accepts, surfaced verbatim in the UI. */
export const SUPPORTED_IMPORT_EXTENSIONS = [".txt", ".md", ".markdown", ".docx"] as const;

export const SUPPORTED_IMPORT_ACCEPT = SUPPORTED_IMPORT_EXTENSIONS.join(",");

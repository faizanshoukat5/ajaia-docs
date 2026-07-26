-- 0001_init.sql — initial schema for Ajaia Docs.
--
-- Written by hand rather than generated so the storage contract is readable in
-- one file. `src/db/schema.ts` mirrors this and `tests/schema.test.ts` asserts
-- the two have not drifted.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

-- Emails are compared case-insensitively everywhere (login, share-by-email), so
-- enforce uniqueness on the normalized form.
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TABLE documents (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  content_html  TEXT NOT NULL,
  -- Plain-text projection of content_html. Kept alongside the HTML so list
  -- previews and search never have to parse markup at read time.
  content_text  TEXT NOT NULL,
  owner_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  updated_by_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  -- Monotonic per-document counter. The client sends the revision it based its
  -- edit on; the server uses it to detect a concurrent write (see
  -- src/server/documents.ts) rather than to reject one.
  revision      INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX documents_owner_idx ON documents (owner_id, updated_at DESC);

CREATE TABLE document_shares (
  document_id TEXT NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- 'viewer' | 'editor'. Owner access is implied by documents.owner_id and is
  -- never stored here.
  role        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  created_by_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (document_id, user_id)
);

CREATE INDEX document_shares_user_idx ON document_shares (user_id, created_at DESC);

CREATE TABLE document_versions (
  id           TEXT PRIMARY KEY,
  document_id  TEXT NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  content_html TEXT NOT NULL,
  -- Who authored the content being snapshotted (not who triggered the snapshot).
  author_id    TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at   INTEGER NOT NULL,
  -- Human label, e.g. 'Imported from notes.docx' or 'Restored from 3 Jul 14:02'.
  label        TEXT
);

CREATE INDEX document_versions_doc_idx ON document_versions (document_id, created_at DESC);

-- Coarse "who has this document open" signal, refreshed by a client heartbeat.
-- Deliberately a table and not a socket: see ARCHITECTURE.md.
CREATE TABLE document_presence (
  document_id TEXT NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (document_id, user_id)
);

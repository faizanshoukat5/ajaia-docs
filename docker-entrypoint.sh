#!/bin/sh
# Container entrypoint.
#
# Hosts mount the persistent volume at runtime, *after* the image is built, and
# the mount arrives owned by root. The app runs as the unprivileged `node` user,
# so it could not open the database file inside that mount.
#
# So: start as root, take ownership of the database directory, then drop
# privileges before exec'ing the server. This is the same pattern the official
# Postgres and Redis images use, and it keeps the runtime process non-root.
set -e

# Next.js' standalone server binds to $HOSTNAME, and Docker sets that to the
# container ID — so the server would listen only on the container's own address
# and the platform's router would get connection refused (502). Bind to all
# interfaces instead.
export HOSTNAME=0.0.0.0

DB_DIR=$(dirname "${DATABASE_PATH:-/data/ajaia.db}")
mkdir -p "$DB_DIR"

if [ "$(id -u)" = "0" ]; then
  chown -R node:node "$DB_DIR" || true
  exec gosu node "$@"
fi

exec "$@"

import os
import sqlite3
import hashlib
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Iterator

PI_DATA_DIR = os.path.expanduser("~/.pi/data/memory")


def _ensure_dir(path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)


def project_db_path(project_path: str) -> str:
    abs_path = os.path.abspath(project_path)
    h = hashlib.sha256(abs_path.encode("utf-8")).hexdigest()[:16]
    name = os.path.basename(abs_path) or "project"
    return os.path.join(PI_DATA_DIR, "projects", f"{h}-{name}", "memory.db")


def global_db_path() -> str:
    return os.path.join(PI_DATA_DIR, "global", "memory.db")


@contextmanager
def open_db(path: str) -> Iterator[sqlite3.Connection]:
    _ensure_dir(path)
    conn = sqlite3.connect(path)
    try:
        conn.execute("PRAGMA foreign_keys = ON;")
        yield conn
        conn.commit()
    finally:
        conn.close()


def _get_schema_version(conn: sqlite3.Connection) -> int | None:
    cur = conn.cursor()
    cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version';"
    )
    row = cur.fetchone()
    if not row:
        return None
    cur.execute("SELECT version FROM schema_version LIMIT 1;")
    row = cur.fetchone()
    return int(row[0]) if row else None


def migrate_project_db(conn: sqlite3.Connection) -> list[int]:
    """Apply migrations to a project DB. Returns list of applied versions."""
    applied: list[int] = []
    cur = conn.cursor()

    version = _get_schema_version(conn)
    if version is None:
        cur.execute(
            "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);"
        )
        version = 0

    # Migration 1: initial schema for project_records + FTS
    if version < 1:
        cur.executescript(
            """
            CREATE TABLE IF NOT EXISTS project_records (
              id TEXT PRIMARY KEY,
              description TEXT NOT NULL,
              created_at TEXT NOT NULL,
              git_branch TEXT,
              git_commit TEXT,
              files_json TEXT,
              content TEXT,
              type TEXT NOT NULL,
              metadata_json TEXT
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS project_records_fts USING fts5(
              record_id UNINDEXED,
              description,
              content,
              metadata,
              tokenize = "porter"
            );

            DELETE FROM schema_version;
            INSERT INTO schema_version (version) VALUES (1);
            """
        )
        applied.append(1)
        version = 1

    return applied


def migrate_global_db(conn: sqlite3.Connection) -> list[int]:
    """Apply migrations to the global DB. Returns list of applied versions."""
    applied: list[int] = []
    cur = conn.cursor()

    version = _get_schema_version(conn)
    if version is None:
        cur.execute(
            "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);"
        )
        version = 0

    # Migration 1: initial schema for global_learnings + FTS
    if version < 1:
        cur.executescript(
            """
            CREATE TABLE IF NOT EXISTS global_learnings (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              description TEXT NOT NULL,
              category TEXT NOT NULL,
              tags_json TEXT,
              source_project TEXT,
              created_at TEXT NOT NULL,
              content TEXT
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS global_learnings_fts USING fts5(
              learning_id UNINDEXED,
              description,
              content,
              tags,
              category,
              tokenize = "porter"
            );

            DELETE FROM schema_version;
            INSERT INTO schema_version (version) VALUES (1);
            """
        )
        applied.append(1)
        version = 1

    return applied


def utc_now_iso() -> str:
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )

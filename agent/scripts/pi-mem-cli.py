#!/usr/bin/env python3
import argparse
import json
import os
import sys
import uuid
from typing import Any

from pi_mem_db import (
    project_db_path,
    global_db_path,
    open_db,
    migrate_project_db,
    migrate_global_db,
    utc_now_iso,
)


def print_json(obj: Any, exit_code: int = 0) -> None:
    sys.stdout.write(json.dumps(obj, indent=2, sort_keys=False) + "\n")
    sys.exit(exit_code)


def error(error_code: str, message: str, exit_code: int = 1) -> None:
    print_json({"status": "error", "error": error_code, "message": message}, exit_code)


def resolve_db(scope: str, project_path: str | None) -> str:
    if scope == "global":
        return global_db_path()
    if scope == "project":
        if not project_path:
            error("missing_project_path", "--project-path is required for project scope")
        return project_db_path(project_path)
    error("invalid_scope", f"Invalid scope: {scope}")
    raise AssertionError


def cmd_init(args: argparse.Namespace) -> None:
    db_path = resolve_db(args.scope, args.project_path)
    try:
        with open_db(db_path):
            pass
    except Exception as e:  # noqa: BLE001
        error("init_failed", f"Failed to init DB: {e}")

    print_json({"status": "ok", "scope": args.scope, "database_path": db_path})


def cmd_migrate(args: argparse.Namespace) -> None:
    db_path = resolve_db(args.scope, args.project_path)
    try:
        with open_db(db_path) as conn:
            if args.scope == "project":
                applied = migrate_project_db(conn)
            else:
                applied = migrate_global_db(conn)
    except Exception as e:  # noqa: BLE001
        error("migration_failed", f"Migration failed: {e}")

    print_json({"status": "ok", "migrations_applied": applied})


def cmd_save_project(args: argparse.Namespace) -> None:
    db_path = resolve_db("project", args.project_path)
    description = args.description
    created_at = utc_now_iso()
    record_id = str(uuid.uuid4())
    content = sys.stdin.read() if not sys.stdin.isatty() else ""

    try:
        with open_db(db_path) as conn:
            migrate_project_db(conn)
            cur = conn.cursor()
            metadata = {"type": "session"}
            cur.execute(
                """
                INSERT INTO project_records
                  (id, description, created_at, git_branch, git_commit, files_json, content, type, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record_id,
                    description,
                    created_at,
                    None,
                    None,
                    None,
                    content,
                    "session",
                    json.dumps(metadata),
                ),
            )
            cur.execute(
                """
                INSERT INTO project_records_fts (record_id, description, content, metadata)
                VALUES (?, ?, ?, ?)
                """,
                (
                    record_id,
                    description,
                    content,
                    json.dumps(metadata),
                ),
            )
    except Exception as e:  # noqa: BLE001
        error("save_project_failed", f"Failed to save project session: {e}")

    print_json(
        {
            "status": "ok",
            "session_id": record_id,
            "description": description,
            "files_tracked": 0,
            "chunks_stored": 1 if content else 0,
            "git_branch": None,
            "git_commit": None,
        }
    )


def cmd_save_checkpoint(args: argparse.Namespace) -> None:
    db_path = resolve_db("project", args.project_path)
    description_raw = args.description
    description = f"[CHECKPOINT] {description_raw}"
    created_at = utc_now_iso()
    record_id = str(uuid.uuid4())
    content = sys.stdin.read() if not sys.stdin.isatty() else ""
    resume_context = args.resume_context
    plan_path = args.plan_path
    task_dir = args.task_dir

    metadata: dict[str, Any] = {
        "type": "checkpoint",
        "resume_context": resume_context,
        "plan_path": plan_path,
        "task_dir": task_dir,
        "task_snapshot": None,
    }

    try:
        with open_db(db_path) as conn:
            migrate_project_db(conn)
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO project_records
                  (id, description, created_at, git_branch, git_commit, files_json, content, type, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record_id,
                    description,
                    created_at,
                    None,
                    None,
                    None,
                    content,
                    "checkpoint",
                    json.dumps(metadata),
                ),
            )
            cur.execute(
                """
                INSERT INTO project_records_fts (record_id, description, content, metadata)
                VALUES (?, ?, ?, ?)
                """,
                (
                    record_id,
                    description,
                    content,
                    json.dumps(metadata),
                ),
            )
    except Exception as e:  # noqa: BLE001
        error("save_checkpoint_failed", f"Failed to save checkpoint: {e}")

    print_json(
        {
            "status": "ok",
            "session_id": record_id,
            "description": description,
            "files_tracked": 0,
            "chunks_stored": 1 if content else 0,
            "tasks_snapshot": 0,
            "active_task_ids": [],
            "has_resume_context": bool(resume_context),
            "plan_path": plan_path,
        }
    )


def cmd_save_global(args: argparse.Namespace) -> None:
    db_path = resolve_db("global", None)
    description = args.description
    category = args.category or "general"
    tags = [t.strip() for t in (args.tags or "").split(",") if t.strip()]
    tags_json = json.dumps(tags) if tags else None
    source_project = args.source_project
    created_at = utc_now_iso()
    content = sys.stdin.read() if not sys.stdin.isatty() else ""

    try:
        with open_db(db_path) as conn:
            migrate_global_db(conn)
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO global_learnings
                  (description, category, tags_json, source_project, created_at, content)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    description,
                    category,
                    tags_json,
                    source_project,
                    created_at,
                    content,
                ),
            )
            learning_id = cur.lastrowid
            cur.execute(
                """
                INSERT INTO global_learnings_fts (learning_id, description, content, tags, category)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    learning_id,
                    description,
                    content,
                    " ".join(tags),
                    category,
                ),
            )
    except Exception as e:  # noqa: BLE001
        error("save_global_failed", f"Failed to save global learning: {e}")

    print_json(
        {
            "status": "ok",
            "id": learning_id,
            "description": description,
            "category": category,
            "tags": tags,
        }
    )


def cmd_list(args: argparse.Namespace) -> None:
    db_path = resolve_db(args.scope, args.project_path)
    limit = args.limit

    try:
        with open_db(db_path) as conn:
            cur = conn.cursor()
            if args.scope == "project":
                cur.execute(
                    """
                    SELECT id, description, created_at, type
                    FROM project_records
                    ORDER BY datetime(created_at) DESC
                    LIMIT ?
                    """,
                    (limit,),
                )
                records = [
                    {
                        "id": r[0],
                        "description": r[1],
                        "created_at": r[2],
                        "type": r[3],
                    }
                    for r in cur.fetchall()
                ]
            else:
                cur.execute(
                    """
                    SELECT id, description, category, created_at
                    FROM global_learnings
                    ORDER BY datetime(created_at) DESC
                    LIMIT ?
                    """,
                    (limit,),
                )
                records = [
                    {
                        "id": r[0],
                        "description": r[1],
                        "category": r[2],
                        "created_at": r[3],
                    }
                    for r in cur.fetchall()
                ]
    except Exception as e:  # noqa: BLE001
        error("list_failed", f"Failed to list records: {e}")

    print_json({"status": "ok", "scope": args.scope, "records": records})


def cmd_list_old(args: argparse.Namespace) -> None:
    db_path = resolve_db(args.scope, args.project_path)
    days = args.older_than_days

    try:
        with open_db(db_path) as conn:
            cur = conn.cursor()
            if args.scope == "project":
                cur.execute(
                    """
                    SELECT
                      id,
                      description,
                      created_at,
                      type,
                      CAST((julianday('now') - julianday(created_at)) AS INTEGER) AS age_days
                    FROM project_records
                    WHERE CAST((julianday('now') - julianday(created_at)) AS INTEGER) >= ?
                    ORDER BY created_at ASC
                    """,
                    (days,),
                )
                records = [
                    {
                        "id": r[0],
                        "description": r[1],
                        "created_at": r[2],
                        "type": r[3],
                        "age_days": r[4],
                    }
                    for r in cur.fetchall()
                ]
            else:
                cur.execute(
                    """
                    SELECT
                      id,
                      description,
                      created_at,
                      category,
                      CAST((julianday('now') - julianday(created_at)) AS INTEGER) AS age_days
                    FROM global_learnings
                    WHERE CAST((julianday('now') - julianday(created_at)) AS INTEGER) >= ?
                    ORDER BY created_at ASC
                    """,
                    (days,),
                )
                records = [
                    {
                        "id": r[0],
                        "description": r[1],
                        "created_at": r[2],
                        "category": r[3],
                        "age_days": r[4],
                    }
                    for r in cur.fetchall()
                ]
    except Exception as e:  # noqa: BLE001
        error("list_old_failed", f"Failed to list old records: {e}")

    print_json({"status": "ok", "scope": args.scope, "records": records})


def cmd_search(args: argparse.Namespace) -> None:
    db_path = resolve_db(args.scope, args.project_path)
    query = args.query
    limit = args.limit
    plan_path = args.plan_path

    try:
        with open_db(db_path) as conn:
            cur = conn.cursor()
            if args.scope == "project":
                sql = """
                    SELECT
                      r.id,
                      r.description,
                      r.created_at,
                      r.type,
                      snippet(project_records_fts, 1, '...', '...', 10, 1) AS snippet
                    FROM project_records_fts f
                    JOIN project_records r ON r.id = f.record_id
                    WHERE project_records_fts MATCH ?
                """
                params: list[Any] = [query]
                if plan_path:
                    sql += " AND json_extract(r.metadata_json, '$.plan_path') = ?"
                    params.append(plan_path)
                sql += " ORDER BY datetime(r.created_at) DESC LIMIT ?"
                params.append(limit)
                cur.execute(sql, params)
                records = [
                    {
                        "id": r[0],
                        "description": r[1],
                        "created_at": r[2],
                        "type": r[3],
                        "snippet": r[4],
                    }
                    for r in cur.fetchall()
                ]
            else:
                sql = """
                    SELECT
                      g.id,
                      g.description,
                      g.category,
                      g.created_at,
                      snippet(global_learnings_fts, 1, '...', '...', 10, 1) AS snippet
                    FROM global_learnings_fts f
                    JOIN global_learnings g ON g.id = f.learning_id
                    WHERE global_learnings_fts MATCH ?
                    ORDER BY datetime(g.created_at) DESC
                    LIMIT ?
                """
                cur.execute(sql, (query, limit))
                records = [
                    {
                        "id": r[0],
                        "description": r[1],
                        "category": r[2],
                        "created_at": r[3],
                        "snippet": r[4],
                    }
                    for r in cur.fetchall()
                ]
    except Exception as e:  # noqa: BLE001
        error("search_failed", f"Search failed: {e}")

    print_json({"status": "ok", "scope": args.scope, "query": query, "records": records})


def cmd_show(args: argparse.Namespace) -> None:
    db_path = resolve_db(args.scope, args.project_path)
    rec_id = args.id

    try:
        with open_db(db_path) as conn:
            cur = conn.cursor()
            if args.scope == "project":
                cur.execute(
                    """
                    SELECT id, description, created_at, git_branch, git_commit,
                           files_json, content, type, metadata_json
                    FROM project_records
                    WHERE id = ?
                    """,
                    (rec_id,),
                )
                row = cur.fetchone()
                if not row:
                    error("record_not_found", f"Record not found: {rec_id}")
                files = json.loads(row[5]) if row[5] else []
                metadata = json.loads(row[8]) if row[8] else {}
                result = {
                    "status": "ok",
                    "id": row[0],
                    "description": row[1],
                    "created_at": row[2],
                    "git_branch": row[3],
                    "git_commit": row[4],
                    "files": files,
                    "content": row[6],
                    "metadata": metadata,
                }
            else:
                cur.execute(
                    """
                    SELECT id, description, category, tags_json, source_project, created_at, content
                    FROM global_learnings
                    WHERE id = ?
                    """,
                    (rec_id,),
                )
                row = cur.fetchone()
                if not row:
                    error("record_not_found", f"Record not found: {rec_id}")
                tags = json.loads(row[3]) if row[3] else []
                result = {
                    "status": "ok",
                    "id": row[0],
                    "description": row[1],
                    "category": row[2],
                    "tags": tags,
                    "source_project": row[4],
                    "created_at": row[5],
                    "content": row[6],
                }
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        error("show_failed", f"Failed to show record: {e}")

    print_json(result)


def cmd_delete(args: argparse.Namespace) -> None:
    db_path = resolve_db(args.scope, args.project_path)
    rec_id = args.id

    try:
        with open_db(db_path) as conn:
            cur = conn.cursor()
            if args.scope == "project":
                cur.execute("DELETE FROM project_records WHERE id = ?", (rec_id,))
                cur.execute("DELETE FROM project_records_fts WHERE record_id = ?", (rec_id,))
            else:
                cur.execute("DELETE FROM global_learnings WHERE id = ?", (rec_id,))
                cur.execute("DELETE FROM global_learnings_fts WHERE learning_id = ?", (rec_id,))
            if cur.rowcount == 0:
                error("record_not_found", f"Record not found: {rec_id}")
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        error("delete_failed", f"Failed to delete record: {e}")

    print_json({"status": "ok", "deleted_id": rec_id})


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="pi-mem: memory CLI for pi sessions (project + global)"
    )
    sub = p.add_subparsers(dest="command", required=True)

    sp = sub.add_parser("init", help="initialize database for a scope")
    sp.add_argument("--scope", choices=["project", "global"], required=True)
    sp.add_argument("--project-path")
    sp.set_defaults(func=cmd_init)

    sp = sub.add_parser("migrate", help="run database migrations")
    sp.add_argument("--scope", choices=["project", "global"], required=True)
    sp.add_argument("--project-path")
    sp.set_defaults(func=cmd_migrate)

    sp = sub.add_parser("save-project", help="save a project session")
    sp.add_argument("--project-path", required=True)
    sp.add_argument("--description", required=True)
    sp.set_defaults(func=cmd_save_project)

    sp = sub.add_parser("save-checkpoint", help="save a checkpoint session")
    sp.add_argument("--project-path", required=True)
    sp.add_argument("--description", required=True)
    sp.add_argument("--task-dir")
    sp.add_argument("--resume-context")
    sp.add_argument("--plan-path")
    sp.set_defaults(func=cmd_save_checkpoint)

    sp = sub.add_parser("save-global", help="save a global learning")
    sp.add_argument("--description", required=True)
    sp.add_argument("--category")
    sp.add_argument("--tags")
    sp.add_argument("--source-project")
    sp.set_defaults(func=cmd_save_global)

    sp = sub.add_parser("list", help="list recent records")
    sp.add_argument("--scope", choices=["project", "global"], required=True)
    sp.add_argument("--project-path")
    sp.add_argument("--limit", type=int, default=10)
    sp.set_defaults(func=cmd_list)

    sp = sub.add_parser("list-old", help="list records older than N days")
    sp.add_argument("--scope", choices=["project", "global"], required=True)
    sp.add_argument("--project-path")
    sp.add_argument("--older-than-days", type=int, required=True)
    sp.set_defaults(func=cmd_list_old)

    sp = sub.add_parser("search", help="full-text search records")
    sp.add_argument("--scope", choices=["project", "global"], required=True)
    sp.add_argument("--project-path")
    sp.add_argument("--query", required=True)
    sp.add_argument("--limit", type=int, default=10)
    sp.add_argument("--plan-path")
    sp.set_defaults(func=cmd_search)

    sp = sub.add_parser("show", help="show full details for a record")
    sp.add_argument("--scope", choices=["project", "global"], required=True)
    sp.add_argument("--project-path")
    sp.add_argument("--id", required=True)
    sp.set_defaults(func=cmd_show)

    sp = sub.add_parser("delete", help="delete a record")
    sp.add_argument("--scope", choices=["project", "global"], required=True)
    sp.add_argument("--project-path")
    sp.add_argument("--id", required=True)
    sp.set_defaults(func=cmd_delete)

    return p


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()

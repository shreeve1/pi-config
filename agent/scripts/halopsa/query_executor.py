#!/usr/bin/env python3
"""
Query Executor - CLI orchestrator for Grafana SQL execution

Entry point Claude calls to execute SQL queries against the HaloPSA database
via Grafana and display results as markdown tables.

Usage:
    python3 .claude/skills/report-expert/scripts/query_executor.py "SELECT TOP 5 ..."
    python3 .claude/skills/report-expert/scripts/query_executor.py --file query.sql
    python3 .claude/skills/report-expert/scripts/query_executor.py "SELECT ..." --format csv
    python3 .claude/skills/report-expert/scripts/query_executor.py "SELECT ..." --create-halo-report "Report Name"
"""

import argparse
import csv
import io
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

# Add scripts directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from grafana_client import GrafanaClient, GrafanaConnectionError, GrafanaQueryError, load_env


# Maximum column width before truncation
MAX_COL_WIDTH = 50
# Default row limit
DEFAULT_MAX_ROWS = 100


def format_value(val, max_width: int = MAX_COL_WIDTH) -> str:
    """Format a single cell value for display."""
    if val is None:
        return "NULL"

    # Format datetime values
    if isinstance(val, (int, float)):
        # Check if it looks like an epoch timestamp (ms)
        if isinstance(val, (int, float)) and val > 1_000_000_000_000:
            try:
                dt = datetime.fromtimestamp(val / 1000)
                return dt.strftime("%Y-%m-%d %H:%M")
            except (ValueError, OSError):
                pass
        # Format integers without decimal
        if isinstance(val, float) and val == int(val):
            return str(int(val))
        return str(val)

    s = str(val).strip()

    # Strip HTML tags for cleaner display
    s = re.sub(r'<[^>]+>', '', s)

    # Truncate long values
    if len(s) > max_width:
        s = s[:max_width - 3] + "..."

    # Replace newlines with spaces for table display
    s = s.replace("\n", " ").replace("\r", "")

    return s


def format_markdown_table(rows: list[dict], columns: Optional[list[str]] = None) -> str:
    """
    Format query results as a markdown table.

    Args:
        rows: List of row dicts from Grafana.
        columns: Optional column order. If None, uses dict key order.

    Returns:
        Markdown table string.
    """
    if not rows:
        if columns:
            # Show empty table with headers
            header = "| " + " | ".join(columns) + " |"
            separator = "| " + " | ".join("---" for _ in columns) + " |"
            return f"{header}\n{separator}\n\n*0 rows returned*"
        return "*0 rows returned*"

    # Determine columns from first row if not specified
    if not columns:
        columns = list(rows[0].keys())

    # Format all values
    formatted = []
    for row in rows:
        formatted.append({col: format_value(row.get(col)) for col in columns})

    # Calculate column widths (min 3 for separator)
    widths = {}
    for col in columns:
        widths[col] = max(
            len(col),
            max((len(formatted_row.get(col, "")) for formatted_row in formatted), default=3),
            3
        )

    # Build table
    lines = []

    # Header
    header_cells = [col.ljust(widths[col]) for col in columns]
    lines.append("| " + " | ".join(header_cells) + " |")

    # Separator with alignment (right-align numeric columns)
    sep_cells = []
    for col in columns:
        # Check if column is numeric by sampling first non-null value
        is_numeric = False
        for row in rows[:5]:
            val = row.get(col)
            if val is not None:
                is_numeric = isinstance(val, (int, float))
                break
        if is_numeric:
            sep_cells.append("-" * (widths[col] - 1) + ":")
        else:
            sep_cells.append("-" * widths[col])
    lines.append("| " + " | ".join(sep_cells) + " |")

    # Data rows
    for formatted_row in formatted:
        cells = [formatted_row.get(col, "").ljust(widths[col]) for col in columns]
        lines.append("| " + " | ".join(cells) + " |")

    lines.append(f"\n*{len(rows)} rows returned*")

    return "\n".join(lines)


def format_csv_output(rows: list[dict], columns: Optional[list[str]] = None) -> str:
    """Format query results as CSV."""
    if not rows:
        return ""

    if not columns:
        columns = list(rows[0].keys())

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=columns, extrasaction='ignore')
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue()


def format_json_output(rows: list[dict]) -> str:
    """Format query results as JSON."""
    return json.dumps(rows, indent=2, default=str)


def strip_for_halopsa(sql: str) -> str:
    """
    Strip ORDER BY and inline comments from SQL for HaloPSA report creation.

    HaloPSA wraps queries internally and cannot handle ORDER BY or -- comments.

    Args:
        sql: Original SQL query.

    Returns:
        Cleaned SQL suitable for HaloPSA reports.
    """
    # Remove inline comments
    cleaned = re.sub(r'--[^\n]*', '', sql)

    # Remove ORDER BY clause (but not ORDER BY inside CROSS APPLY / subqueries)
    # Strategy: remove the final ORDER BY that's at the outermost query level
    # We find ORDER BY that isn't inside parentheses
    depth = 0
    order_by_start = None
    i = 0
    upper_sql = cleaned.upper()

    while i < len(cleaned):
        if cleaned[i] == '(':
            depth += 1
        elif cleaned[i] == ')':
            depth -= 1
        elif depth == 0 and upper_sql[i:i+8] == 'ORDER BY':
            order_by_start = i
        i += 1

    if order_by_start is not None:
        cleaned = cleaned[:order_by_start].rstrip()

    # Clean up extra whitespace
    cleaned = re.sub(r'\n\s*\n', '\n', cleaned).strip()

    return cleaned


def create_halo_report(sql: str, report_name: str):
    """
    Create a HaloPSA report via the API after stripping ORDER BY and comments.

    Args:
        sql: SQL query (will be cleaned for HaloPSA compatibility).
        report_name: Name for the HaloPSA report.
    """
    # Import HaloPSA client
    project_root = Path(__file__).parent.parent.parent.parent
    sys.path.insert(0, str(project_root / "scripts" / "api"))
    from halopsa_client import HaloPSAClient

    # Load credentials
    client_id = os.environ.get("HALO_CLIENT_ID", "").strip("\"'")
    client_secret = os.environ.get("HALO_CLIENT_SECRET", "").strip("\"'")
    tenant = os.environ.get("HALO_TENANT_NAME", "").strip("\"'")

    if not all([client_id, client_secret, tenant]):
        print("Error: Missing HaloPSA credentials.", file=sys.stderr)
        print("Required: HALO_CLIENT_ID, HALO_CLIENT_SECRET, HALO_TENANT_NAME", file=sys.stderr)
        sys.exit(1)

    # Clean SQL for HaloPSA
    cleaned_sql = strip_for_halopsa(sql)

    print(f"Creating HaloPSA report: {report_name}")
    print(f"SQL (cleaned for HaloPSA):\n{cleaned_sql}\n")

    client = HaloPSAClient(client_id, client_secret, tenant)
    report_data = {
        "name": report_name,
        "sql": cleaned_sql,
        "group_id": 1,
        "mainentity": "Faults",
        "reporttype": 0,
        "inactive": False,
    }

    result = client.post("Report", [report_data])
    if result:
        report_id = result[0].get("id") if isinstance(result, list) else result.get("id")
        print(f"Report created with ID: {report_id}")
        return report_id
    else:
        print("Failed to create report - no response data", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Execute SQL queries via Grafana and display results"
    )
    parser.add_argument(
        "sql",
        nargs="?",
        help="SQL query to execute (inline string)"
    )
    parser.add_argument(
        "--file",
        help="Read SQL from a file instead of inline"
    )
    parser.add_argument(
        "--datasource",
        choices=["halopsa", "itglue"],
        default="halopsa",
        help="Datasource to query (default: halopsa)"
    )
    parser.add_argument(
        "--format",
        choices=["markdown", "csv", "json"],
        default="markdown",
        help="Output format (default: markdown)"
    )
    parser.add_argument(
        "--max-rows",
        type=int,
        default=DEFAULT_MAX_ROWS,
        help=f"Maximum rows to return (default: {DEFAULT_MAX_ROWS})"
    )
    parser.add_argument(
        "--create-halo-report",
        metavar="NAME",
        help="Create a HaloPSA report instead of just executing. Strips ORDER BY and comments."
    )

    args = parser.parse_args()

    # Get SQL from either inline or file
    sql = args.sql
    if args.file:
        with open(args.file, "r") as f:
            sql = f.read().strip()
    if not sql:
        parser.error("Provide SQL as an argument or via --file")

    # Load environment variables
    load_env()

    # If creating a HaloPSA report, do that and optionally also execute
    if args.create_halo_report:
        create_halo_report(sql, args.create_halo_report)
        return

    # Inject TOP if not present and max_rows is set
    upper_sql = sql.upper().strip()
    if args.max_rows and "TOP " not in upper_sql.split("FROM")[0]:
        # Insert TOP after SELECT (handling SELECT DISTINCT)
        if upper_sql.startswith("SELECT DISTINCT"):
            sql = re.sub(
                r'(?i)^SELECT\s+DISTINCT',
                f'SELECT DISTINCT TOP {args.max_rows}',
                sql,
                count=1
            )
        elif upper_sql.startswith("SELECT"):
            sql = re.sub(
                r'(?i)^SELECT',
                f'SELECT TOP {args.max_rows}',
                sql,
                count=1
            )

    # Execute via Grafana
    try:
        client = GrafanaClient()

        if args.datasource == "itglue":
            # For ITGlue, sql is treated as the endpoint
            rows = client.execute_itglue(sql)
        else:
            rows = client.execute_sql(sql)

    except GrafanaConnectionError as e:
        print(f"Connection error: {e}", file=sys.stderr)
        sys.exit(1)
    except GrafanaQueryError as e:
        print(f"Query error: {e}", file=sys.stderr)
        sys.exit(1)

    # Format output
    if args.format == "csv":
        print(format_csv_output(rows))
    elif args.format == "json":
        print(format_json_output(rows))
    else:
        print(format_markdown_table(rows))


if __name__ == "__main__":
    main()

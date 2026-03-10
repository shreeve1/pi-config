#!/usr/bin/env python3
"""
HaloPSA Report Expert

Expert system for creating, debugging, and optimizing SQL reports in HaloPSA.
Provides column mapping, pattern generation, and debugging assistance.
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Optional

# Try to import yaml, fallback to basic parsing if not available
try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False


class ReportExpert:
    """HaloPSA SQL Report Expert System."""

    def __init__(self, skill_dir: Optional[Path] = None):
        """Initialize the expert with knowledge base."""
        self.skill_dir = skill_dir or Path(__file__).parent.parent
        self.expertise = self._load_expertise()
        self.patterns = self.expertise.get('patterns', {})
        self.gotchas = self.expertise.get('gotchas', [])
        self.tables = self.expertise.get('tables', {})
        self.reference_data = self.expertise.get('reference_data', {})

    def _load_expertise(self) -> dict:
        """Load expertise.yaml mental model."""
        expertise_path = self.skill_dir / 'expertise' / 'expertise.yaml'
        if not expertise_path.exists():
            return {}

        with open(expertise_path, 'r') as f:
            content = f.read()

        if HAS_YAML:
            return yaml.safe_load(content)
        else:
            # Basic YAML parsing for simple structures
            return self._parse_yaml_basic(content)

    def _parse_yaml_basic(self, content: str) -> dict:
        """Basic YAML parsing without PyYAML dependency."""
        result = {}
        # This is a simplified parser - install PyYAML for full support
        lines = content.split('\n')
        current_section = None

        for line in lines:
            if line.startswith('#') or not line.strip():
                continue
            if line.startswith('metadata:'):
                current_section = 'metadata'
                result[current_section] = {}
            elif line.startswith('patterns:'):
                current_section = 'patterns'
                result[current_section] = {}
            elif line.startswith('gotchas:'):
                current_section = 'gotchas'
                result[current_section] = []
            elif line.startswith('tables:'):
                current_section = 'tables'
                result[current_section] = {}
            elif line.startswith('reference_data:'):
                current_section = 'reference_data'
                result[current_section] = {}

        return result

    def get_column_mapping(self, api_field: str) -> Optional[dict]:
        """Get database column for an API field."""
        faults_table = self.tables.get('faults', {})
        columns = faults_table.get('columns', {})

        for db_col, info in columns.items():
            if info.get('api_field') == api_field:
                return {
                    'db_column': db_col,
                    'type': info.get('type'),
                    'description': info.get('description')
                }
        return None

    def get_all_column_mappings(self) -> dict:
        """Get all column mappings as API -> DB dictionary."""
        mappings = {}
        faults_table = self.tables.get('faults', {})
        columns = faults_table.get('columns', {})

        for db_col, info in columns.items():
            api_field = info.get('api_field')
            if api_field:
                mappings[api_field] = {
                    'db_column': db_col,
                    'type': info.get('type'),
                    'description': info.get('description')
                }
        return mappings

    def get_pattern(self, pattern_name: str) -> Optional[dict]:
        """Get a SQL pattern by name."""
        return self.patterns.get(pattern_name)

    def list_patterns(self) -> list:
        """List all available patterns."""
        return [
            {'name': name, 'description': p.get('name', name)}
            for name, p in self.patterns.items()
        ]

    def get_gotchas(self) -> list:
        """Get all known gotchas."""
        return self.gotchas

    def get_status_name(self, status_id: int) -> Optional[str]:
        """Get status name for ID."""
        status = self.reference_data.get('status', {}).get(status_id)
        if status:
            return status.get('name')
        return None

    def get_priority_name(self, priority_id: int) -> Optional[str]:
        """Get priority name for ID."""
        priority = self.reference_data.get('priority', {}).get(priority_id)
        if priority:
            return priority.get('name')
        return None

    def translate_sql(self, sql: str, backend: str = 'halopsa') -> dict:
        """Translate API field names to DB column names in SQL.

        Args:
            sql: SQL query to translate.
            backend: 'grafana' or 'halopsa'. When 'grafana', ORDER BY and
                     comments are not flagged as gotchas.
        """
        mappings = self.get_all_column_mappings()
        issues = []
        translated = sql

        for api_field, info in mappings.items():
            db_col = info['db_column']
            # Check if API field is used in the SQL
            if re.search(rf'\b{api_field}\b', sql, re.IGNORECASE):
                translated = re.sub(
                    rf'\b{api_field}\b',
                    db_col,
                    translated,
                    flags=re.IGNORECASE
                )
                issues.append({
                    'type': 'translated',
                    'api_field': api_field,
                    'db_column': db_col
                })

        # Check for gotchas (only for HaloPSA backend)
        if backend == 'halopsa':
            if 'ORDER BY' in sql.upper():
                issues.append({
                    'type': 'gotcha',
                    'issue': 'ORDER BY clause',
                    'problem': 'HaloPSA wraps queries; ORDER BY causes failure',
                    'solution': 'Remove ORDER BY entirely'
                })

            if '--' in sql:
                issues.append({
                    'type': 'gotcha',
                    'issue': 'Inline comments',
                    'problem': 'SQL parser cannot handle -- comment syntax',
                    'solution': 'Remove all inline comments'
                })

        return {
            'translated_sql': translated,
            'issues': issues
        }

    def validate_sql(self, sql: str, backend: str = 'halopsa') -> dict:
        """Validate SQL for common issues.

        Args:
            sql: SQL query to validate.
            backend: 'grafana' or 'halopsa'. When 'grafana', ORDER BY and
                     inline comments are NOT flagged as errors.
        """
        issues = []

        # ORDER BY and comments are only errors for HaloPSA backend
        if backend == 'halopsa':
            if re.search(r'\bORDER\s+BY\b', sql, re.IGNORECASE):
                issues.append({
                    'severity': 'error',
                    'issue': 'ORDER BY clause detected',
                    'solution': 'Remove ORDER BY - HaloPSA does not support it'
                })

            if '--' in sql:
                issues.append({
                    'severity': 'error',
                    'issue': 'Inline comments detected',
                    'solution': 'Remove all -- comments'
                })

        # Check for API field names that should be DB columns (both backends)
        api_fields = [
            'priority_id', 'ticket_type_id', 'agent_id',
            'client_id', 'status_id', 'summary'
        ]
        for field in api_fields:
            if re.search(rf'\b{field}\b', sql, re.IGNORECASE):
                mapping = self.get_column_mapping(field)
                if mapping:
                    issues.append({
                        'severity': 'warning',
                        'issue': f'API field "{field}" used instead of DB column',
                        'solution': f'Use "{mapping["db_column"]}" instead of "{field}"'
                    })

        # Check for unbracketed view columns (both backends)
        view_columns = ['Ticket ID', 'Start Date', 'End Date', 'Agent', 'Subject']
        for col in view_columns:
            # Check if column is used without brackets
            if re.search(rf'(?<!\[){re.escape(col)}(?!\])', sql):
                issues.append({
                    'severity': 'error',
                    'issue': f'View column "{col}" needs brackets',
                    'solution': f'Use "[{col}]" instead of "{col}"'
                })

        return {
            'valid': len([i for i in issues if i['severity'] == 'error']) == 0,
            'issues': issues
        }

    def generate_base_query(self, include_actions: bool = False,
                            include_appointments: bool = False) -> str:
        """Generate a base ticket query template."""
        query = """SELECT
    f.Faultid AS 'TicketID',
    f.symptom AS 'Subject',
    (SELECT TSTATUSdesc FROM tstatus WHERE TSTATUS = f.status) AS 'Status',
    (SELECT Uname FROM Uname WHERE unum = f.assignedtoint) AS 'Agent',
    CASE f.Slaid
        WHEN 1 THEN 'P1 - Emergency'
        WHEN 2 THEN 'P2 - Quick'
        WHEN 3 THEN 'P3 - Normal'
        WHEN 4 THEN 'P4 - Extended'
        ELSE 'Unknown'
    END AS 'Priority',
    f.whe_ AS 'CreatedDate'
FROM faults f
WHERE f.fdeleted = 0
  AND f.status NOT IN (8, 9)
  AND f.RequestTypeNew NOT IN (5, 20, 22, 26, 30, 50)"""

        if include_actions:
            query = query.replace(
                'FROM faults f',
                '''CROSS APPLY (
    SELECT TOP 1 Whe_ AS LastActionTime
    FROM ACTIONS a WHERE a.Faultid = f.Faultid
    ORDER BY a.actionnumber DESC
) AS LastAction
FROM faults f'''
            )
            query = query.replace(
                "f.whe_ AS 'CreatedDate'",
                """f.whe_ AS 'CreatedDate',
    LastAction.LastActionTime AS 'LastActivity'"""
            )

        return query


def main():
    """Main entry point for CLI."""
    parser = argparse.ArgumentParser(
        description='HaloPSA Report Expert - SQL report assistance'
    )
    subparsers = parser.add_subparsers(dest='command', help='Command to run')

    # Column mapping command
    map_parser = subparsers.add_parser('map', help='Get column mapping')
    map_parser.add_argument('field', help='API field name to map')
    map_parser.add_argument('--json', action='store_true', help='Output as JSON')

    # List patterns command
    subparsers.add_parser('patterns', help='List available patterns')

    # Get pattern command
    pattern_parser = subparsers.add_parser('pattern', help='Get a specific pattern')
    pattern_parser.add_argument('name', help='Pattern name')

    # Validate SQL command
    validate_parser = subparsers.add_parser('validate', help='Validate SQL for issues')
    validate_parser.add_argument('sql', help='SQL query to validate')
    validate_parser.add_argument('--json', action='store_true', help='Output as JSON')
    validate_parser.add_argument('--backend', choices=['grafana', 'halopsa'],
                                 default='halopsa',
                                 help='Backend to validate against (default: halopsa)')

    # Translate SQL command
    translate_parser = subparsers.add_parser('translate', help='Translate API fields to DB columns')
    translate_parser.add_argument('sql', help='SQL query to translate')
    translate_parser.add_argument('--json', action='store_true', help='Output as JSON')
    translate_parser.add_argument('--backend', choices=['grafana', 'halopsa'],
                                 default='halopsa',
                                 help='Backend to translate for (default: halopsa)')

    # Execute SQL command (delegates to query_executor.py)
    execute_parser = subparsers.add_parser('execute', help='Execute SQL via Grafana')
    execute_parser.add_argument('sql', nargs='?', help='SQL query to execute')
    execute_parser.add_argument('--file', help='Read SQL from a file')
    execute_parser.add_argument('--format', choices=['markdown', 'csv', 'json'],
                                default='markdown', help='Output format')
    execute_parser.add_argument('--max-rows', type=int, default=100,
                                help='Max rows to return')
    execute_parser.add_argument('--create-halo-report', metavar='NAME',
                                help='Create a HaloPSA report instead')

    # Generate base query command
    gen_parser = subparsers.add_parser('generate', help='Generate base query template')
    gen_parser.add_argument('--with-actions', action='store_true',
                           help='Include last action date')
    gen_parser.add_argument('--with-appointments', action='store_true',
                           help='Include appointment check')

    # List gotchas command
    subparsers.add_parser('gotchas', help='List known gotchas')

    # Reference command
    ref_parser = subparsers.add_parser('ref', help='Get reference data')
    ref_parser.add_argument('type', choices=['status', 'priority', 'impact', 'all'],
                           help='Reference type')
    ref_parser.add_argument('--id', type=int, help='Specific ID to look up')

    args = parser.parse_args()

    expert = ReportExpert()

    if args.command == 'map':
        result = expert.get_column_mapping(args.field)
        if args.json:
            print(json.dumps(result, indent=2))
        elif result:
            print(f"API Field: {args.field}")
            print(f"DB Column: {result['db_column']}")
            print(f"Type: {result['type']}")
            print(f"Description: {result['description']}")
        else:
            print(f"No mapping found for '{args.field}'")
            sys.exit(1)

    elif args.command == 'patterns':
        patterns = expert.list_patterns()
        print("Available SQL Patterns:")
        print("-" * 40)
        for p in patterns:
            print(f"  {p['name']}: {p['description']}")

    elif args.command == 'pattern':
        pattern = expert.get_pattern(args.name)
        if pattern:
            print(f"Pattern: {pattern.get('name', args.name)}")
            print(f"Description: {pattern.get('description', 'N/A')}")
            print("\nTemplate:")
            print(pattern.get('template', 'N/A'))
        else:
            print(f"Pattern '{args.name}' not found")
            sys.exit(1)

    elif args.command == 'validate':
        result = expert.validate_sql(args.sql, backend=args.backend)
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print(f"Valid: {result['valid']} (backend: {args.backend})")
            if result['issues']:
                print("\nIssues:")
                for issue in result['issues']:
                    print(f"  [{issue['severity'].upper()}] {issue['issue']}")
                    print(f"    Solution: {issue['solution']}")

    elif args.command == 'translate':
        result = expert.translate_sql(args.sql, backend=args.backend)
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print("Translated SQL:")
            print("-" * 40)
            print(result['translated_sql'])
            if result['issues']:
                print("\nChanges/Issues:")
                for issue in result['issues']:
                    if issue['type'] == 'translated':
                        print(f"  {issue['api_field']} -> {issue['db_column']}")
                    else:
                        print(f"  [{issue['issue']}] {issue['solution']}")

    elif args.command == 'execute':
        # Delegate to query_executor.py
        import subprocess
        executor_path = Path(__file__).parent / 'query_executor.py'
        cmd = [sys.executable, str(executor_path)]
        if args.sql:
            cmd.append(args.sql)
        if args.file:
            cmd.extend(['--file', args.file])
        cmd.extend(['--format', args.format])
        cmd.extend(['--max-rows', str(args.max_rows)])
        if args.create_halo_report:
            cmd.extend(['--create-halo-report', args.create_halo_report])
        result = subprocess.run(cmd)
        sys.exit(result.returncode)

    elif args.command == 'generate':
        sql = expert.generate_base_query(
            include_actions=args.with_actions,
            include_appointments=args.with_appointments
        )
        print(sql)

    elif args.command == 'gotchas':
        gotchas = expert.get_gotchas()
        print("Known SQL Gotchas:")
        print("-" * 40)
        for g in gotchas:
            print(f"\n{g['issue']}:")
            print(f"  Problem: {g['problem']}")
            print(f"  Solution: {g['solution']}")

    elif args.command == 'ref':
        if args.type == 'all':
            for ref_type in ['status', 'priority', 'impact']:
                print(f"\n{ref_type.upper()}:")
                data = expert.reference_data.get(ref_type, {})
                for id_val, info in data.items():
                    if isinstance(info, dict):
                        print(f"  {id_val}: {info.get('name', info)}")
                    else:
                        print(f"  {id_val}: {info}")
        else:
            data = expert.reference_data.get(args.type, {})
            if args.id:
                info = data.get(args.id)
                if info:
                    if isinstance(info, dict):
                        print(f"{args.id}: {info.get('name', info)}")
                    else:
                        print(f"{args.id}: {info}")
                else:
                    print(f"ID {args.id} not found in {args.type}")
                    sys.exit(1)
            else:
                print(f"{args.type.upper()}:")
                for id_val, info in data.items():
                    if isinstance(info, dict):
                        print(f"  {id_val}: {info.get('name', info)}")
                    else:
                        print(f"  {id_val}: {info}")

    else:
        parser.print_help()


if __name__ == '__main__':
    main()

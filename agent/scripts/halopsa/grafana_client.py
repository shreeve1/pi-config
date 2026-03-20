#!/usr/bin/env python3
"""
Grafana HTTP Client for HaloPSA SQL Execution

Executes SQL queries against the HaloPSA MSSQL database via Grafana's
datasource proxy API. Also supports ITGlue queries via the Infinity datasource.

Environment Variables:
    GRAFANA_URL: Base URL for Grafana instance (e.g., https://grafana.example.com/)
    GRAFANA_API_TOKEN: Grafana API token with datasource query permissions

Usage:
    from grafana_client import GrafanaClient

    client = GrafanaClient()
    rows = client.execute_sql("SELECT TOP 10 Faultid, symptom FROM faults")
"""

import json
import os
import sys
from datetime import datetime
from typing import Any, Optional


# requests is listed in requirements.txt
import requests
import urllib3

# Suppress InsecureRequestWarning when verify=False
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class GrafanaConnectionError(Exception):
    """Raised when Grafana is unreachable or returns a connection error."""
    pass


class GrafanaQueryError(Exception):
    """Raised when Grafana returns a query error (bad SQL, permissions, etc.)."""
    pass


class GrafanaClient:
    """
    Grafana HTTP client for executing SQL and REST queries via datasource proxy.

    Connects to Grafana's POST /api/ds/query endpoint to run arbitrary SQL
    against the HaloPSA MSSQL database (datasource UID: detepabeay51ca).
    Also supports ITGlue REST queries via the Infinity datasource.

    Attributes:
        url: Grafana base URL
        token: API token for authentication
        verify_ssl: Whether to verify SSL certificates (default: False)
    """

    # Known datasource UIDs
    DATASOURCE_HALOPSA = "detepabeay51ca"
    DATASOURCE_ITGLUE = "infinity"  # Infinity datasource for REST proxying

    def __init__(self, url: Optional[str] = None, token: Optional[str] = None,
                 verify_ssl: bool = False):
        """
        Initialize Grafana client.

        Args:
            url: Grafana base URL. Falls back to GRAFANA_URL env var.
            token: API token. Falls back to GRAFANA_API_TOKEN env var.
            verify_ssl: Whether to verify SSL certs. Default False (matches
                        confirmed curl -sk behavior for self-signed certs).
        """
        self.url = (url or os.environ.get("GRAFANA_URL", "")).rstrip("/")
        self.token = token or os.environ.get("GRAFANA_API_TOKEN", "")
        self.verify_ssl = verify_ssl

        if not self.url:
            raise GrafanaConnectionError(
                "GRAFANA_URL not set. Add it to your .env file or pass url= parameter."
            )
        if not self.token:
            raise GrafanaConnectionError(
                "GRAFANA_API_TOKEN not set. Add it to your .env file or pass token= parameter."
            )

    def _headers(self) -> dict:
        """Build request headers with auth token."""
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def execute_sql(self, sql: str, datasource: str = "halopsa",
                    max_rows: Optional[int] = None) -> list[dict]:
        """
        Execute a SQL query against the HaloPSA MSSQL database via Grafana.

        Args:
            sql: SQL query string (ORDER BY and comments are allowed).
            datasource: Datasource name. Currently only "halopsa" supported.
            max_rows: Optional row limit. If provided and the query doesn't
                      already contain TOP, this is informational only (use
                      TOP in your SQL for actual limiting).

        Returns:
            List of row dicts with column names as keys.

        Raises:
            GrafanaConnectionError: If Grafana is unreachable.
            GrafanaQueryError: If the SQL query fails.
        """
        ds_uid = self.DATASOURCE_HALOPSA

        payload = {
            "queries": [
                {
                    "datasource": {"uid": ds_uid},
                    "rawSql": sql,
                    "format": "table",
                    "refId": "A",
                }
            ],
            "from": "now-1h",
            "to": "now",
        }

        try:
            response = requests.post(
                f"{self.url}/api/ds/query",
                headers=self._headers(),
                json=payload,
                verify=self.verify_ssl,
                timeout=30,
            )
        except requests.ConnectionError as e:
            raise GrafanaConnectionError(
                f"Cannot connect to Grafana at {self.url}: {e}"
            )
        except requests.Timeout:
            raise GrafanaConnectionError(
                f"Grafana request timed out after 30s"
            )

        if response.status_code == 401:
            raise GrafanaConnectionError(
                "Grafana authentication failed. Check GRAFANA_API_TOKEN."
            )
        if response.status_code == 403:
            raise GrafanaConnectionError(
                "Grafana access denied. Token may lack datasource query permissions."
            )
        if response.status_code != 200:
            raise GrafanaQueryError(
                f"Grafana returned HTTP {response.status_code}: {response.text[:500]}"
            )

        data = response.json()
        return self._transform_response(data)

    def execute_itglue(self, endpoint: str, params: Optional[dict] = None) -> list[dict]:
        """
        Execute an ITGlue REST query via the Grafana Infinity datasource.

        The Infinity datasource proxies REST calls with auth headers already
        configured. Uses URL source with JSON parsing.

        Args:
            endpoint: ITGlue API endpoint (e.g., "/organizations", "/contacts").
            params: Optional query parameters (e.g., {"filter[name]": "Acme"}).

        Returns:
            List of row dicts from the ITGlue response.

        Raises:
            GrafanaConnectionError: If Grafana is unreachable.
            GrafanaQueryError: If the ITGlue query fails.
        """
        # Build the full ITGlue URL - Infinity datasource handles auth
        query_string = ""
        if params:
            query_string = "&".join(f"{k}={v}" for k, v in params.items())

        url_path = endpoint.lstrip("/")
        full_url = f"https://api.itglue.com/{url_path}"
        if query_string:
            full_url += f"?{query_string}"

        payload = {
            "queries": [
                {
                    "datasource": {"uid": self.DATASOURCE_ITGLUE},
                    "type": "json",
                    "source": "url",
                    "url": full_url,
                    "url_options": {"method": "GET"},
                    "root_selector": "data",
                    "columns": [],
                    "refId": "A",
                    "format": "table",
                }
            ],
            "from": "now-1h",
            "to": "now",
        }

        try:
            response = requests.post(
                f"{self.url}/api/ds/query",
                headers=self._headers(),
                json=payload,
                verify=self.verify_ssl,
                timeout=30,
            )
        except requests.ConnectionError as e:
            raise GrafanaConnectionError(
                f"Cannot connect to Grafana at {self.url}: {e}"
            )
        except requests.Timeout:
            raise GrafanaConnectionError("Grafana request timed out after 30s")

        if response.status_code != 200:
            raise GrafanaQueryError(
                f"ITGlue query failed - HTTP {response.status_code}: {response.text[:500]}"
            )

        data = response.json()
        return self._transform_response(data)

    def _transform_response(self, data: dict) -> list[dict]:
        """
        Transform Grafana's column-oriented response into row-oriented dicts.

        Grafana returns data in this format:
            {
                "results": {
                    "A": {
                        "frames": [{
                            "schema": {"fields": [{"name": "col1"}, {"name": "col2"}]},
                            "data": {"values": [[val1a, val1b], [val2a, val2b]]}
                        }]
                    }
                }
            }

        This method transposes it into:
            [{"col1": val1a, "col2": val2a}, {"col1": val1b, "col2": val2b}]

        Args:
            data: Raw Grafana API response dict.

        Returns:
            List of row dicts.

        Raises:
            GrafanaQueryError: If the response contains error messages.
        """
        results = data.get("results", {})

        # Check for errors in the response
        for ref_id, result in results.items():
            if "error" in result:
                raise GrafanaQueryError(
                    f"Query error: {result['error']}"
                )

        # Extract frames from refId "A"
        ref_a = results.get("A", {})
        frames = ref_a.get("frames", [])

        if not frames:
            return []

        frame = frames[0]
        schema = frame.get("schema", {})
        frame_data = frame.get("data", {})

        # Get column names from schema
        fields = schema.get("fields", [])
        col_names = [f.get("name", f"col_{i}") for i, f in enumerate(fields)]

        # Get values - column-oriented arrays
        values = frame_data.get("values", [])

        if not values or not values[0]:
            # Query succeeded but returned 0 rows
            return []

        # Transpose: column-oriented -> row-oriented
        num_rows = len(values[0]) if values else 0
        rows = []
        for row_idx in range(num_rows):
            row = {}
            for col_idx, col_name in enumerate(col_names):
                if col_idx < len(values):
                    val = values[col_idx][row_idx] if row_idx < len(values[col_idx]) else None
                    row[col_name] = val
                else:
                    row[col_name] = None
            rows.append(row)

        return rows


def load_env():
    """Load environment variables from .env file."""
    # Walk up to find .env (project root)
    current = os.path.dirname(os.path.abspath(__file__))
    for _ in range(5):
        env_path = os.path.join(current, ".env")
        if os.path.exists(env_path):
            with open(env_path, "r") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, value = line.split("=", 1)
                        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))
            return
        current = os.path.dirname(current)


if __name__ == "__main__":
    # Quick test: run a simple query
    load_env()

    try:
        client = GrafanaClient()
        sql = "SELECT TOP 5 Faultid, symptom FROM faults WHERE fdeleted = 0 ORDER BY Faultid DESC"
        print(f"Executing: {sql}\n")
        rows = client.execute_sql(sql)
        for row in rows:
            print(row)
        print(f"\n{len(rows)} rows returned")
    except (GrafanaConnectionError, GrafanaQueryError) as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

"""
HaloPSA API Client

Core Python client for interacting with the HaloPSA REST API using OAuth 2.0
client credentials flow. Provides authentication management and a generic
request interface for all HaloPSA API endpoints.

Usage:
    from halopsa_client import HaloPSAClient

    client = HaloPSAClient(client_id, client_secret, tenant)
    tickets = client.get("Tickets", params={"count": 100})
    client.patch("Tickets/12345", {"status_id": 5})

Classes:
    HaloPSAAuth: Handles OAuth 2.0 authentication and token management
    HaloPSAClient: Main API client with CRUD operations
"""

import requests
from datetime import datetime, timedelta


class HaloPSAAuth:
    """
    OAuth 2.0 authentication handler for HaloPSA API.

    Manages access token lifecycle including acquisition and automatic refresh.
    Tokens are cached until expiry to minimize authentication requests.

    Attributes:
        client_id (str): OAuth client ID from HaloPSA application
        client_secret (str): OAuth client secret from HaloPSA application
        base_url (str): Base URL for the HaloPSA tenant
        token (str): Current access token (None if not authenticated)
        token_expiry (datetime): Token expiration timestamp
    """

    def __init__(self, client_id, client_secret, tenant):
        self.client_id = client_id
        self.client_secret = client_secret
        self.base_url = f"https://{tenant}.halopsa.com"
        self.token = None
        self.token_expiry = None

    def get_token(self):
        """
        Obtain OAuth 2.0 access token using client credentials flow.

        Returns cached token if still valid, otherwise requests a new token
        from the HaloPSA authentication endpoint.

        Returns:
            str: Valid access token

        Raises:
            Exception: If authentication fails with status code and error details
        """
        if self.token and self.token_expiry > datetime.now():
            return self.token

        auth_url = f"{self.base_url}/auth/token"
        payload = {
            "grant_type": "client_credentials",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "scope": "all"
        }
        headers = {"Content-Type": "application/x-www-form-urlencoded"}

        response = requests.post(auth_url, data=payload, headers=headers)

        if response.status_code == 200:
            token_data = response.json()
            self.token = token_data['access_token']
            expires_in = token_data.get('expires_in', 3600)
            self.token_expiry = datetime.now() + timedelta(seconds=expires_in)
            return self.token
        else:
            raise Exception(f"Authentication failed: {response.status_code}")


class HaloPSAClient:
    """
    Main API client for HaloPSA REST API operations.

    Provides convenience methods for GET, POST, PATCH, and DELETE operations
    with automatic authentication and error handling.

    Attributes:
        auth (HaloPSAAuth): Authentication handler instance
        base_url (str): Base API URL for the tenant

    Example:
        client = HaloPSAClient(client_id, client_secret, "itassurance")

        # Get tickets with filters
        tickets = client.get("Tickets", params={"count": 100, "status_id": 1})

        # Update ticket
        client.patch("Tickets/12345", {"status_id": 5})

        # Create appointment
        appointment = {
            "subject": "Service Call",
            "start_date": "2025-09-15T09:00:00"
        }
        client.post("Appointment", appointment)
    """

    def __init__(self, client_id, client_secret, tenant):
        self.auth = HaloPSAAuth(client_id, client_secret, tenant)
        self.base_url = f"https://{tenant}.halopsa.com/api"

    def _make_request(self, method, endpoint, data=None, params=None):
        """
        Generic request method with authentication.

        Handles token injection, request execution, and response parsing.

        Args:
            method (str): HTTP method (GET, POST, PATCH, DELETE)
            endpoint (str): API endpoint path (e.g., "Tickets" or "Tickets/12345")
            data (dict, optional): JSON payload for POST/PATCH requests
            params (dict, optional): Query parameters for GET requests

        Returns:
            dict or None: Parsed JSON response, or None for 204 No Content

        Raises:
            Exception: If API returns non-success status code with error details
        """
        token = self.auth.get_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        url = f"{self.base_url}/{endpoint}"
        response = requests.request(method, url, headers=headers, json=data, params=params)

        if response.status_code in [200, 201]:
            return response.json()
        elif response.status_code == 204:
            return None
        else:
            raise Exception(f"API Error: {response.status_code} - {response.text}")

    def get(self, endpoint, params=None):
        """
        Perform GET request to retrieve resources.

        Args:
            endpoint (str): API endpoint (e.g., "Tickets", "Tickets/12345")
            params (dict, optional): Query parameters (count, page_no, filters, etc.)

        Returns:
            dict: API response data
        """
        return self._make_request("GET", endpoint, params=params)

    def post(self, endpoint, data):
        """
        Perform POST request to create resources.

        Args:
            endpoint (str): API endpoint (e.g., "Tickets", "Appointment")
            data (dict): Resource data to create

        Returns:
            dict: Created resource data
        """
        return self._make_request("POST", endpoint, data=data)

    def patch(self, endpoint, data):
        """
        Perform PATCH request to update resources.

        Args:
            endpoint (str): API endpoint (e.g., "Tickets/12345")
            data (dict): Fields to update

        Returns:
            dict: Updated resource data
        """
        return self._make_request("PATCH", endpoint, data=data)

    def delete(self, endpoint):
        """
        Perform DELETE request to remove resources.

        Args:
            endpoint (str): API endpoint (e.g., "Tickets/12345")

        Returns:
            dict or None: Deleted resource data or None
        """
        return self._make_request("DELETE", endpoint)

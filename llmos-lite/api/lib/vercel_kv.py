"""
Vercel KV Storage Client

Provides Redis-compatible key-value storage for sessions and metadata.
Uses Vercel KV REST API for serverless functions.

Environment Variables Required:
- KV_REST_API_URL: Your Vercel KV REST API URL
- KV_REST_API_TOKEN: Your Vercel KV REST API token

Setup:
1. Create Vercel KV store in dashboard
2. Add environment variables to Vercel project
3. For local development, create .env.local with these variables
"""

import os
import json
import httpx
from typing import Any, Optional, List
from datetime import datetime


class VercelKV:
    """Client for Vercel KV (Redis) storage"""

    def __init__(
        self,
        url: Optional[str] = None,
        token: Optional[str] = None
    ):
        """
        Initialize Vercel KV client.

        Args:
            url: KV REST API URL (defaults to KV_REST_API_URL env var)
            token: KV REST API token (defaults to KV_REST_API_TOKEN env var)
        """
        self.url = url or os.getenv("KV_REST_API_URL")
        self.token = token or os.getenv("KV_REST_API_TOKEN")

        if not self.url or not self.token:
            raise ValueError(
                "Vercel KV credentials not found. "
                "Set KV_REST_API_URL and KV_REST_API_TOKEN environment variables"
            )

        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }

    async def set(
        self,
        key: str,
        value: Any,
        ex: Optional[int] = None
    ) -> bool:
        """
        Set a key-value pair.

        Args:
            key: Key name
            value: Value (will be JSON serialized)
            ex: Optional expiration in seconds

        Returns:
            True if successful
        """
        async with httpx.AsyncClient() as client:
            # Serialize value if not string
            if not isinstance(value, str):
                value = json.dumps(value)

            data = {"key": key, "value": value}
            if ex:
                data["ex"] = ex

            response = await client.post(
                f"{self.url}/set",
                headers=self.headers,
                json=data
            )

            return response.status_code == 200

    async def get(self, key: str) -> Optional[Any]:
        """
        Get a value by key.

        Args:
            key: Key name

        Returns:
            Value (JSON deserialized) or None if not found
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.url}/get/{key}",
                headers=self.headers
            )

            if response.status_code == 404:
                return None

            if response.status_code != 200:
                raise Exception(f"KV get failed: {response.text}")

            result = response.json()
            value = result.get("result")

            # Try to parse as JSON
            if value and isinstance(value, str):
                try:
                    return json.loads(value)
                except json.JSONDecodeError:
                    return value

            return value

    async def delete(self, key: str) -> bool:
        """
        Delete a key.

        Args:
            key: Key name

        Returns:
            True if successful
        """
        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"{self.url}/delete/{key}",
                headers=self.headers
            )

            return response.status_code == 200

    async def sadd(self, key: str, *members: str) -> int:
        """
        Add members to a set.

        Args:
            key: Set key
            members: Members to add

        Returns:
            Number of members added
        """
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.url}/sadd",
                headers=self.headers,
                json={"key": key, "members": list(members)}
            )

            if response.status_code != 200:
                raise Exception(f"KV sadd failed: {response.text}")

            return response.json().get("result", 0)

    async def smembers(self, key: str) -> List[str]:
        """
        Get all members of a set.

        Args:
            key: Set key

        Returns:
            List of members
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.url}/smembers/{key}",
                headers=self.headers
            )

            if response.status_code == 404:
                return []

            if response.status_code != 200:
                raise Exception(f"KV smembers failed: {response.text}")

            return response.json().get("result", [])

    async def srem(self, key: str, *members: str) -> int:
        """
        Remove members from a set.

        Args:
            key: Set key
            members: Members to remove

        Returns:
            Number of members removed
        """
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.url}/srem",
                headers=self.headers,
                json={"key": key, "members": list(members)}
            )

            if response.status_code != 200:
                raise Exception(f"KV srem failed: {response.text}")

            return response.json().get("result", 0)

    async def rpush(self, key: str, *values: str) -> int:
        """
        Append values to a list.

        Args:
            key: List key
            values: Values to append

        Returns:
            New length of list
        """
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.url}/rpush",
                headers=self.headers,
                json={"key": key, "values": list(values)}
            )

            if response.status_code != 200:
                raise Exception(f"KV rpush failed: {response.text}")

            return response.json().get("result", 0)

    async def lrange(
        self,
        key: str,
        start: int = 0,
        stop: int = -1
    ) -> List[str]:
        """
        Get a range of elements from a list.

        Args:
            key: List key
            start: Start index
            stop: Stop index (-1 for end)

        Returns:
            List of elements
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.url}/lrange/{key}/{start}/{stop}",
                headers=self.headers
            )

            if response.status_code == 404:
                return []

            if response.status_code != 200:
                raise Exception(f"KV lrange failed: {response.text}")

            return response.json().get("result", [])

    async def llen(self, key: str) -> int:
        """
        Get length of a list.

        Args:
            key: List key

        Returns:
            Length of list
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.url}/llen/{key}",
                headers=self.headers
            )

            if response.status_code == 404:
                return 0

            if response.status_code != 200:
                raise Exception(f"KV llen failed: {response.text}")

            return response.json().get("result", 0)


# Global KV client instance
_kv_client: Optional[VercelKV] = None


def get_kv() -> VercelKV:
    """
    Get or create global KV client instance.

    Returns:
        VercelKV instance
    """
    global _kv_client
    if _kv_client is None:
        _kv_client = VercelKV()
    return _kv_client

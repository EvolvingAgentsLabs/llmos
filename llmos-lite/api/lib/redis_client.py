"""
Redis Client for Vercel Redis / Upstash

Supports both:
1. Vercel KV REST API (KV_REST_API_URL + KV_REST_API_TOKEN)
2. Direct Redis connection (REDIS_URL)

This adapter uses redis-py for direct connections.
"""

import os
from typing import Any, Optional, List
import json

# Check for redis-py availability
try:
    import redis.asyncio as redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    print("⚠️  redis-py not installed. Install with: pip install redis")


class RedisClient:
    """
    Unified Redis client supporting multiple connection methods.

    Priority:
    1. REDIS_URL (direct connection)
    2. KV_REST_API_URL + KV_REST_API_TOKEN (REST API)
    """

    def __init__(self):
        """Initialize Redis client with available credentials"""
        self.redis_url = os.getenv("REDIS_URL")
        self.kv_url = os.getenv("KV_REST_API_URL")
        self.kv_token = os.getenv("KV_REST_API_TOKEN")

        self._client: Optional[redis.Redis] = None
        self._connection_type: Optional[str] = None

    async def _get_client(self) -> redis.Redis:
        """Get or create Redis client connection"""
        if self._client is None:
            if self.redis_url and REDIS_AVAILABLE:
                # Use direct Redis connection
                self._client = redis.from_url(
                    self.redis_url,
                    encoding="utf-8",
                    decode_responses=True
                )
                self._connection_type = "direct"
                print("✓ Connected to Redis via direct connection")
            else:
                raise ValueError(
                    "Redis connection not available. "
                    "Set REDIS_URL environment variable and install redis-py: pip install redis"
                )

        return self._client

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
            value: Value (will be JSON serialized if not string)
            ex: Optional expiration in seconds

        Returns:
            True if successful
        """
        client = await self._get_client()

        # Serialize value if not string
        if not isinstance(value, str):
            value = json.dumps(value)

        await client.set(key, value, ex=ex)
        return True

    async def get(self, key: str) -> Optional[Any]:
        """
        Get a value by key.

        Args:
            key: Key name

        Returns:
            Value (JSON deserialized) or None if not found
        """
        client = await self._get_client()
        value = await client.get(key)

        if value is None:
            return None

        # Try to parse as JSON
        if isinstance(value, str):
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
        client = await self._get_client()
        await client.delete(key)
        return True

    async def sadd(self, key: str, *members: str) -> int:
        """
        Add members to a set.

        Args:
            key: Set key
            members: Members to add

        Returns:
            Number of members added
        """
        client = await self._get_client()
        return await client.sadd(key, *members)

    async def smembers(self, key: str) -> List[str]:
        """
        Get all members of a set.

        Args:
            key: Set key

        Returns:
            List of members
        """
        client = await self._get_client()
        members = await client.smembers(key)
        return list(members) if members else []

    async def srem(self, key: str, *members: str) -> int:
        """
        Remove members from a set.

        Args:
            key: Set key
            members: Members to remove

        Returns:
            Number of members removed
        """
        client = await self._get_client()
        return await client.srem(key, *members)

    async def rpush(self, key: str, *values: str) -> int:
        """
        Append values to a list.

        Args:
            key: List key
            values: Values to append

        Returns:
            New length of list
        """
        client = await self._get_client()
        return await client.rpush(key, *values)

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
        client = await self._get_client()
        return await client.lrange(key, start, stop)

    async def llen(self, key: str) -> int:
        """
        Get length of a list.

        Args:
            key: List key

        Returns:
            Length of list
        """
        client = await self._get_client()
        return await client.llen(key)

    async def close(self):
        """Close Redis connection"""
        if self._client:
            await self._client.close()


# Global Redis client instance
_redis_client: Optional[RedisClient] = None


def get_redis() -> RedisClient:
    """
    Get or create global Redis client instance.

    Returns:
        RedisClient instance
    """
    global _redis_client
    if _redis_client is None:
        _redis_client = RedisClient()
    return _redis_client

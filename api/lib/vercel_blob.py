"""
Vercel Blob Storage Client

Provides object storage for files, skills, and artifacts.
Uses Vercel Blob REST API for serverless functions.

Environment Variables Required:
- BLOB_READ_WRITE_TOKEN: Your Vercel Blob read-write token

Setup:
1. Vercel Blob is automatically available in Vercel projects
2. Add BLOB_READ_WRITE_TOKEN to environment variables
3. For local development, create .env.local with this variable
"""

import os
import httpx
from typing import Optional, List, Dict, Any
from dataclasses import dataclass


@dataclass
class BlobObject:
    """Represents a blob object"""
    url: str
    pathname: str
    size: int
    uploaded_at: str
    download_url: str


class VercelBlob:
    """Client for Vercel Blob storage"""

    BASE_URL = "https://blob.vercel-storage.com"

    def __init__(self, token: Optional[str] = None):
        """
        Initialize Vercel Blob client.

        Args:
            token: Blob read-write token (defaults to BLOB_READ_WRITE_TOKEN env var)
        """
        self.token = token or os.getenv("BLOB_READ_WRITE_TOKEN")

        if not self.token:
            raise ValueError(
                "Vercel Blob token not found. "
                "Set BLOB_READ_WRITE_TOKEN environment variable"
            )

        self.headers = {
            "Authorization": f"Bearer {self.token}",
        }

    async def put(
        self,
        pathname: str,
        content: bytes | str,
        content_type: Optional[str] = None
    ) -> BlobObject:
        """
        Upload a file to Blob storage.

        Args:
            pathname: Path for the blob (e.g., 'skills/quantum-vqe.md')
            content: File content (bytes or string)
            content_type: Optional content type (e.g., 'text/markdown')

        Returns:
            BlobObject with URL and metadata
        """
        async with httpx.AsyncClient() as client:
            # Convert string to bytes if needed
            if isinstance(content, str):
                content = content.encode('utf-8')

            headers = {**self.headers}
            if content_type:
                headers["Content-Type"] = content_type

            response = await client.put(
                f"{self.BASE_URL}/{pathname}",
                headers=headers,
                content=content
            )

            if response.status_code not in [200, 201]:
                raise Exception(f"Blob put failed: {response.text}")

            data = response.json()

            return BlobObject(
                url=data["url"],
                pathname=data["pathname"],
                size=data.get("size", len(content)),
                uploaded_at=data.get("uploadedAt", ""),
                download_url=data.get("downloadUrl", data["url"])
            )

    async def get(self, pathname: str) -> Optional[str]:
        """
        Download a file from Blob storage.

        Args:
            pathname: Path of the blob

        Returns:
            File content as string, or None if not found
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.BASE_URL}/{pathname}",
                headers=self.headers
            )

            if response.status_code == 404:
                return None

            if response.status_code != 200:
                raise Exception(f"Blob get failed: {response.text}")

            return response.text

    async def delete(self, pathname: str) -> bool:
        """
        Delete a file from Blob storage.

        Args:
            pathname: Path of the blob

        Returns:
            True if successful
        """
        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"{self.BASE_URL}/{pathname}",
                headers=self.headers
            )

            return response.status_code in [200, 204]

    async def list(
        self,
        prefix: Optional[str] = None,
        limit: int = 1000
    ) -> List[BlobObject]:
        """
        List blobs with optional prefix filter.

        Args:
            prefix: Optional prefix to filter by (e.g., 'skills/')
            limit: Maximum number of results

        Returns:
            List of BlobObject
        """
        async with httpx.AsyncClient() as client:
            params: Dict[str, Any] = {"limit": limit}
            if prefix:
                params["prefix"] = prefix

            response = await client.get(
                f"{self.BASE_URL}",
                headers=self.headers,
                params=params
            )

            if response.status_code != 200:
                raise Exception(f"Blob list failed: {response.text}")

            data = response.json()
            blobs = data.get("blobs", [])

            return [
                BlobObject(
                    url=blob["url"],
                    pathname=blob["pathname"],
                    size=blob.get("size", 0),
                    uploaded_at=blob.get("uploadedAt", ""),
                    download_url=blob.get("downloadUrl", blob["url"])
                )
                for blob in blobs
            ]


# Global Blob client instance
_blob_client: Optional[VercelBlob] = None


def get_blob() -> VercelBlob:
    """
    Get or create global Blob client instance.

    Returns:
        VercelBlob instance
    """
    global _blob_client
    if _blob_client is None:
        _blob_client = VercelBlob()
    return _blob_client

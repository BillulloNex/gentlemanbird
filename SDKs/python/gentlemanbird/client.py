"""
GentlemanBird Python Client

Async HTTP client for the GentlemanBird agent daemon.
Supports session management, navigation, snapshots, actions, and JS execution.

Usage::

    from gentlemanbird import GentlemanBird

    async with GentlemanBird("http://localhost:9333") as gb:
        session = await gb.new_session(headless=True)
        await session.navigate("https://example.com")
        tree = await session.get_tree()
        print(tree.formatted)
        await session.close()
"""

from __future__ import annotations

import json
from typing import Any, Optional

try:
    import aiohttp

    _HAS_AIOHTTP = True
except ImportError:
    _HAS_AIOHTTP = False

import asyncio
import http.client
import urllib.parse

from .models import SessionInfo
from .session import Session


class GentlemanBird:
    """
    Client for the GentlemanBird agent daemon.

    Can be used as an async context manager::

        async with GentlemanBird() as gb:
            session = await gb.new_session()
            ...
    """

    def __init__(self, base_url: str = "http://localhost:9333"):
        self.base_url = base_url.rstrip("/")
        parsed = urllib.parse.urlparse(self.base_url)
        self._host = parsed.hostname or "localhost"
        self._port = parsed.port or 9333
        self._scheme = parsed.scheme or "http"
        self._aio_session: Optional[Any] = None

    async def __aenter__(self) -> "GentlemanBird":
        if _HAS_AIOHTTP:
            self._aio_session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, *args: Any) -> None:
        if self._aio_session:
            await self._aio_session.close()

    # ─── Session management ──────────────────────────────────────────

    async def new_session(
        self,
        headless: bool = True,
        viewport: Optional[dict[str, int]] = None,
    ) -> Session:
        """Create a new browser session."""
        payload: dict[str, Any] = {"headless": headless}
        if viewport:
            payload["viewport"] = viewport
        data = await self._post("/api/v1/sessions", payload)
        info = SessionInfo.from_dict(data)
        return Session(self, info)

    async def list_sessions(self) -> list[SessionInfo]:
        """List all active sessions."""
        data = await self._get("/api/v1/sessions")
        return [SessionInfo.from_dict(s) for s in data.get("sessions", [])]

    async def get_session(self, session_id: str) -> Session:
        """Get an existing session by ID."""
        data = await self._get(f"/api/v1/sessions/{session_id}")
        info = SessionInfo.from_dict(data)
        return Session(self, info)

    async def status(self) -> dict:
        """Get daemon status."""
        return await self._get("/api/v1/status")

    async def health(self) -> dict:
        """Health check."""
        return await self._get("/health")

    # ─── HTTP transport ──────────────────────────────────────────────

    async def _get(self, path: str, raw: bool = False) -> Any:
        return await self._request("GET", path, raw=raw)

    async def _post(self, path: str, body: Optional[dict] = None) -> Any:
        return await self._request("POST", path, body=body)

    async def _delete(self, path: str) -> Any:
        return await self._request("DELETE", path)

    async def _request(
        self,
        method: str,
        path: str,
        body: Optional[dict] = None,
        raw: bool = False,
    ) -> Any:
        """Send an HTTP request to the daemon."""
        if _HAS_AIOHTTP and self._aio_session:
            return await self._request_aiohttp(method, path, body, raw)
        else:
            return await self._request_stdlib(method, path, body, raw)

    async def _request_aiohttp(
        self,
        method: str,
        path: str,
        body: Optional[dict] = None,
        raw: bool = False,
    ) -> Any:
        """Use aiohttp for async HTTP."""
        url = f"{self.base_url}{path}"
        kwargs: dict[str, Any] = {}
        if body is not None:
            kwargs["json"] = body

        async with self._aio_session.request(method, url, **kwargs) as resp:
            if resp.status >= 400:
                text = await resp.text()
                raise GentlemanBirdError(f"HTTP {resp.status}: {text}")
            if raw:
                return await resp.text()
            return await resp.json()

    async def _request_stdlib(
        self,
        method: str,
        path: str,
        body: Optional[dict] = None,
        raw: bool = False,
    ) -> Any:
        """Fallback using stdlib http.client (runs sync in executor)."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self._request_sync, method, path, body, raw
        )

    def _request_sync(
        self,
        method: str,
        path: str,
        body: Optional[dict] = None,
        raw: bool = False,
    ) -> Any:
        """Synchronous HTTP request via stdlib."""
        conn = http.client.HTTPConnection(self._host, self._port, timeout=30)
        headers = {"Content-Type": "application/json"}
        payload = json.dumps(body).encode() if body else None

        try:
            conn.request(method, path, body=payload, headers=headers)
            resp = conn.getresponse()
            data = resp.read().decode()

            if resp.status >= 400:
                raise GentlemanBirdError(f"HTTP {resp.status}: {data}")

            if raw:
                return data
            return json.loads(data)
        finally:
            conn.close()

    def __repr__(self) -> str:
        return f"<GentlemanBird url={self.base_url!r}>"


class GentlemanBirdError(Exception):
    """Error from the GentlemanBird daemon."""

    pass

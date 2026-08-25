"""
GentlemanBird Session — wraps a single browser session with an ergonomic API.
"""

from __future__ import annotations

import base64
from typing import TYPE_CHECKING, Any, Optional

from .models import (
    AXTreeSnapshot,
    ActionResult,
    BoundingBox,
    ElementResult,
    NavigationResult,
    SessionInfo,
)

if TYPE_CHECKING:
    from .client import GentlemanBird


class Session:
    """
    A browser session controlled by the GentlemanBird daemon.

    Usage::

        async with GentlemanBird() as gb:
            session = await gb.new_session(headless=True)
            await session.navigate("https://example.com")
            tree = await session.get_tree()
            print(tree.formatted)
            await session.click(x=100, y=200)
    """

    def __init__(self, client: "GentlemanBird", info: SessionInfo):
        self._client = client
        self.info = info

    @property
    def id(self) -> str:
        return self.info.id

    # ─── Navigation ──────────────────────────────────────────────────

    async def navigate(self, url: str) -> NavigationResult:
        """Navigate to a URL."""
        data = await self._client._post(f"/api/v1/sessions/{self.id}/navigate", {"url": url})
        return NavigationResult(url=data.get("url", ""), title=data.get("title", ""))

    async def back(self) -> None:
        """Go back in history."""
        await self._client._post(f"/api/v1/sessions/{self.id}/back")

    async def forward(self) -> None:
        """Go forward in history."""
        await self._client._post(f"/api/v1/sessions/{self.id}/forward")

    async def refresh(self) -> None:
        """Refresh the page."""
        await self._client._post(f"/api/v1/sessions/{self.id}/refresh")

    # ─── Snapshots ───────────────────────────────────────────────────

    async def get_tree(self, visible_only: bool = True) -> AXTreeSnapshot:
        """
        Get token-optimized accessibility tree.

        Returns a compact representation of interactive and semantic elements
        with integer IDs and bounding boxes.
        """
        params = f"?format=json&visibleOnly={'true' if visible_only else 'false'}"
        data = await self._client._get(f"/api/v1/sessions/{self.id}/snapshot/tree{params}")
        return AXTreeSnapshot.from_dict(data)

    async def screenshot(self) -> bytes:
        """Take a screenshot, returned as PNG bytes."""
        data = await self._client._get(f"/api/v1/sessions/{self.id}/snapshot/screenshot")
        b64 = data.get("screenshot", "")
        return base64.b64decode(b64) if b64 else b""

    async def screenshot_base64(self) -> str:
        """Take a screenshot, returned as base64 string."""
        data = await self._client._get(f"/api/v1/sessions/{self.id}/snapshot/screenshot")
        return data.get("screenshot", "")

    async def get_source(self) -> str:
        """Get page HTML source."""
        data = await self._client._get(
            f"/api/v1/sessions/{self.id}/snapshot/source",
            raw=True,
        )
        return data if isinstance(data, str) else str(data)

    # ─── Actions ─────────────────────────────────────────────────────

    async def click(
        self,
        x: Optional[int] = None,
        y: Optional[int] = None,
        selector: Optional[str] = None,
        element_id: Optional[int] = None,
    ) -> ActionResult:
        """Click at coordinates, a CSS selector, or an AXTree element ID."""
        payload: dict[str, Any] = {"type": "click"}
        if x is not None:
            payload["x"] = x
        if y is not None:
            payload["y"] = y
        if selector:
            payload["selector"] = selector
        if element_id is not None:
            payload["elementId"] = element_id
        data = await self._client._post(f"/api/v1/sessions/{self.id}/action", payload)
        return ActionResult(success=data.get("success", False), detail=data.get("detail"))

    async def type(self, text: str, selector: Optional[str] = None) -> ActionResult:
        """Type text, optionally targeting a CSS selector."""
        payload: dict[str, Any] = {"type": "type", "text": text}
        if selector:
            payload["selector"] = selector
        data = await self._client._post(f"/api/v1/sessions/{self.id}/action", payload)
        return ActionResult(success=data.get("success", False), detail=data.get("detail"))

    async def scroll(self, dy: int = 500, dx: int = 0) -> ActionResult:
        """Scroll the page."""
        data = await self._client._post(
            f"/api/v1/sessions/{self.id}/action",
            {"type": "scroll", "dx": dx, "dy": dy},
        )
        return ActionResult(success=data.get("success", False), detail=data.get("detail"))

    async def press(self, key: str) -> ActionResult:
        """Press a keyboard key (Enter, Tab, Escape, ArrowDown, etc.)."""
        data = await self._client._post(
            f"/api/v1/sessions/{self.id}/action",
            {"type": "press", "key": key},
        )
        return ActionResult(success=data.get("success", False), detail=data.get("detail"))

    async def hover(self, x: int, y: int) -> ActionResult:
        """Hover at coordinates."""
        data = await self._client._post(
            f"/api/v1/sessions/{self.id}/action",
            {"type": "hover", "x": x, "y": y},
        )
        return ActionResult(success=data.get("success", False), detail=data.get("detail"))

    # ─── Elements ────────────────────────────────────────────────────

    async def find(
        self,
        value: str,
        using: str = "css selector",
    ) -> list[ElementResult]:
        """Find elements by CSS selector, XPath, or tag name."""
        data = await self._client._post(
            f"/api/v1/sessions/{self.id}/elements",
            {"using": using, "value": value},
        )
        return [ElementResult.from_dict(e) for e in data.get("elements", [])]

    # ─── JavaScript ──────────────────────────────────────────────────

    async def execute(self, script: str, args: Optional[list] = None) -> Any:
        """Execute JavaScript in the page context."""
        payload: dict[str, Any] = {"script": script}
        if args:
            payload["args"] = args
        data = await self._client._post(f"/api/v1/sessions/{self.id}/execute", payload)
        return data.get("result")

    # ─── Lifecycle ───────────────────────────────────────────────────

    async def close(self) -> None:
        """Destroy this session."""
        await self._client._delete(f"/api/v1/sessions/{self.id}")
        self.info.status = "closed"

    def __repr__(self) -> str:
        return f"<Session id={self.id} url={self.info.url!r} status={self.info.status}>"

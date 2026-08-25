"""
Data models for GentlemanBird Python SDK.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class BoundingBox:
    """Bounding box of a page element."""

    x: int = 0
    y: int = 0
    width: int = 0
    height: int = 0

    @classmethod
    def from_dict(cls, d: dict) -> "BoundingBox":
        return cls(
            x=int(d.get("x", 0)),
            y=int(d.get("y", 0)),
            width=int(d.get("width", 0)),
            height=int(d.get("height", 0)),
        )


@dataclass
class AXElement:
    """A single element in the accessibility tree snapshot."""

    id: int
    role: str
    name: str
    value: Optional[str] = None
    selector: Optional[str] = None
    bounds: Optional[BoundingBox] = None
    interactive: bool = False

    @classmethod
    def from_dict(cls, d: dict) -> "AXElement":
        bounds = BoundingBox.from_dict(d["bounds"]) if "bounds" in d else None
        return cls(
            id=d["id"],
            role=d["role"],
            name=d.get("name", ""),
            value=d.get("value"),
            selector=d.get("selector"),
            bounds=bounds,
            interactive=d.get("interactive", False),
        )


@dataclass
class AXTreeSnapshot:
    """Token-optimized page snapshot with accessibility tree."""

    elements: list[AXElement] = field(default_factory=list)
    formatted: str = ""
    element_count: int = 0
    url: str = ""
    title: str = ""

    @classmethod
    def from_dict(cls, d: dict) -> "AXTreeSnapshot":
        elements = [AXElement.from_dict(e) for e in d.get("elements", [])]
        return cls(
            elements=elements,
            formatted=d.get("formatted", d.get("tree", "")),
            element_count=d.get("elementCount", d.get("element_count", len(elements))),
            url=d.get("url", ""),
            title=d.get("title", ""),
        )


@dataclass
class SessionInfo:
    """Information about a browser session."""

    id: str = ""
    webdriver_session_id: str = ""
    headless: bool = True
    created_at: int = 0
    last_activity: int = 0
    url: str = ""
    title: str = ""
    status: str = "active"

    @classmethod
    def from_dict(cls, d: dict) -> "SessionInfo":
        return cls(
            id=d.get("id", ""),
            webdriver_session_id=d.get("webdriverSessionId", ""),
            headless=d.get("headless", True),
            created_at=d.get("createdAt", 0),
            last_activity=d.get("lastActivity", 0),
            url=d.get("url", ""),
            title=d.get("title", ""),
            status=d.get("status", "active"),
        )


@dataclass
class NavigationResult:
    """Result of a navigation action."""

    url: str = ""
    title: str = ""


@dataclass
class ActionResult:
    """Result of a browser action."""

    success: bool = False
    detail: Optional[str] = None


@dataclass
class ElementResult:
    """A found element with metadata."""

    element_id: str = ""
    text: str = ""
    rect: Optional[BoundingBox] = None

    @classmethod
    def from_dict(cls, d: dict) -> "ElementResult":
        rect = BoundingBox.from_dict(d["rect"]) if "rect" in d else None
        return cls(
            element_id=d.get("elementId", ""),
            text=d.get("text", ""),
            rect=rect,
        )

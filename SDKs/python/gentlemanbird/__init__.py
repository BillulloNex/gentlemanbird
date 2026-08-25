"""
GentlemanBird — Python SDK for the AI Agent's Favorite Browser Engine.

Usage::

    from gentlemanbird import GentlemanBird

    async with GentlemanBird("http://localhost:9333") as browser:
        session = await browser.new_session(headless=True)
        await session.navigate("https://example.com")

        # Token-optimized accessibility tree
        tree = await session.get_tree()
        print(tree.formatted)

        # Screenshot as PNG bytes
        screenshot = await session.screenshot()

        # Actions
        await session.click(x=340, y=580)
        await session.type("Hello world")
        await session.scroll(dy=500)

        # JavaScript execution
        title = await session.execute("return document.title")
"""

from .client import GentlemanBird, GentlemanBirdError
from .session import Session
from .models import (
    AXElement,
    AXTreeSnapshot,
    ActionResult,
    BoundingBox,
    ElementResult,
    NavigationResult,
    SessionInfo,
)

__version__ = "0.1.0"

__all__ = [
    "GentlemanBird",
    "GentlemanBirdError",
    "Session",
    "AXElement",
    "AXTreeSnapshot",
    "ActionResult",
    "BoundingBox",
    "ElementResult",
    "NavigationResult",
    "SessionInfo",
]

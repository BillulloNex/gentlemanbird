"""
Integration tests for GentlemanBird Python SDK.

These tests require the gentlemanbird-daemon to be running on localhost:9333
and a Ladybird build to be available.

Run:
    cd SDKs/python && python -m pytest tests/ -v
    # or: python tests/test_client.py
"""

from __future__ import annotations

import asyncio
import sys


async def test_status():
    """Test daemon status endpoint."""
    from gentlemanbird import GentlemanBird

    async with GentlemanBird() as gb:
        status = await gb.status()
        assert status["daemon"] == "gentlemanbird"
        assert "version" in status
        print(f"  ✓ status: {status}")


async def test_health():
    """Test health check."""
    from gentlemanbird import GentlemanBird

    async with GentlemanBird() as gb:
        health = await gb.health()
        assert health["status"] == "ok"
        print(f"  ✓ health: {health}")


async def test_session_lifecycle():
    """Test creating and destroying a session."""
    from gentlemanbird import GentlemanBird

    async with GentlemanBird() as gb:
        # Create
        session = await gb.new_session(headless=True)
        assert session.id
        assert session.info.status == "active"
        print(f"  ✓ session created: {session.id}")

        # List
        sessions = await gb.list_sessions()
        assert len(sessions) >= 1
        assert any(s.id == session.id for s in sessions)
        print(f"  ✓ session listed: {len(sessions)} active")

        # Destroy
        await session.close()
        assert session.info.status == "closed"
        print(f"  ✓ session closed")


async def test_navigation_and_snapshot():
    """Test navigating to a page and getting a tree snapshot."""
    from gentlemanbird import GentlemanBird

    async with GentlemanBird() as gb:
        session = await gb.new_session(headless=True)

        try:
            # Navigate
            result = await session.navigate("https://example.com")
            print(f"  ✓ navigated to: {result.url}")

            # Get tree
            tree = await session.get_tree()
            print(f"  ✓ tree: {tree.element_count} elements")
            if tree.formatted:
                # Print first 5 lines
                lines = tree.formatted.split("\n")[:5]
                for line in lines:
                    print(f"    {line}")

            # Screenshot
            screenshot = await session.screenshot()
            assert len(screenshot) > 0
            print(f"  ✓ screenshot: {len(screenshot)} bytes")

        finally:
            await session.close()


async def test_actions():
    """Test click, type, scroll actions."""
    from gentlemanbird import GentlemanBird

    async with GentlemanBird() as gb:
        session = await gb.new_session(headless=True)

        try:
            await session.navigate("https://example.com")

            # Scroll
            result = await session.scroll(dy=300)
            assert result.success
            print(f"  ✓ scrolled")

            # Click
            result = await session.click(x=100, y=100)
            assert result.success
            print(f"  ✓ clicked")

        finally:
            await session.close()


async def test_js_execution():
    """Test JavaScript execution."""
    from gentlemanbird import GentlemanBird

    async with GentlemanBird() as gb:
        session = await gb.new_session(headless=True)

        try:
            await session.navigate("https://example.com")

            title = await session.execute("return document.title")
            assert title
            print(f"  ✓ JS execute: title = {title!r}")

            ua = await session.execute("return navigator.userAgent")
            print(f"  ✓ JS execute: UA = {ua!r}")

        finally:
            await session.close()


async def run_all():
    """Run all tests."""
    tests = [
        ("Status", test_status),
        ("Health", test_health),
        ("Session Lifecycle", test_session_lifecycle),
        ("Navigation & Snapshot", test_navigation_and_snapshot),
        ("Actions", test_actions),
        ("JS Execution", test_js_execution),
    ]

    passed = 0
    failed = 0

    for name, test_fn in tests:
        print(f"\n{'─' * 50}")
        print(f"TEST: {name}")
        print(f"{'─' * 50}")
        try:
            await test_fn()
            passed += 1
            print(f"  → PASS ✅")
        except Exception as e:
            failed += 1
            print(f"  → FAIL ❌: {e}")

    print(f"\n{'═' * 50}")
    print(f"Results: {passed} passed, {failed} failed")
    print(f"{'═' * 50}")

    return failed == 0


if __name__ == "__main__":
    success = asyncio.run(run_all())
    sys.exit(0 if success else 1)

#!/usr/bin/env python3
#
# Copyright (c) 2026-present, the Ladybird developers.
#
# SPDX-License-Identifier: BSD-2-Clause
#
# Verifies the ladybird:hideWebdriver capability. It decouples "the WebDriver transport
# is active" from "navigator.webdriver is advertised to page content":
#
#   - default session            -> navigator.webdriver === true  (spec behavior, unchanged)
#   - ladybird:hideWebdriver=true -> navigator.webdriver === false, transport still drives the page

import argparse
import http.client
import json
import os
import socket
import subprocess
import sys
import tempfile
import time

WEBDRIVER_REQUEST_TIMEOUT_SECONDS = 60
PORT_WAIT_TIMEOUT_SECONDS = 30


def unused_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_for_port(port, timeout=PORT_WAIT_TIMEOUT_SECONDS):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) == 0:
                return
        time.sleep(0.05)
    raise RuntimeError(f"WebDriver port {port} did not open within {timeout}s")


def request(webdriver_port, method, path, body=None):
    connection = http.client.HTTPConnection("127.0.0.1", webdriver_port, timeout=WEBDRIVER_REQUEST_TIMEOUT_SECONDS)
    try:
        payload = json.dumps(body) if body is not None else None
        headers = {"Content-Type": "application/json"} if payload is not None else {}
        connection.request(method, path, body=payload, headers=headers)
        response = connection.getresponse()
        raw = response.read().decode("utf-8")
        parsed = json.loads(raw) if raw else {}
        if response.status >= 400:
            raise RuntimeError(f"{method} {path} -> HTTP {response.status}: {raw}")
        return parsed
    finally:
        connection.close()


def create_session(webdriver_port, hide_webdriver):
    always_match = {
        "ladybird:headless": True,
        "pageLoadStrategy": "normal",
    }
    if hide_webdriver:
        always_match["ladybird:hideWebdriver"] = True

    created = request(
        webdriver_port,
        "POST",
        "/session",
        {"capabilities": {"alwaysMatch": always_match}},
    )
    session_id = created.get("value", {}).get("sessionId") or created.get("sessionId")
    if not session_id:
        raise RuntimeError(f"Could not find session id in response: {created}")
    return session_id


def execute_script(webdriver_port, session_id, script):
    result = request(
        webdriver_port,
        "POST",
        f"/session/{session_id}/execute/sync",
        {"script": script, "args": []},
    )
    return result.get("value")


def navigate(webdriver_port, session_id, url):
    request(webdriver_port, "POST", f"/session/{session_id}/url", {"url": url})


def check_navigator_webdriver(webdriver_port, hide_webdriver, expected):
    session_id = create_session(webdriver_port, hide_webdriver)
    label = "ladybird:hideWebdriver=true" if hide_webdriver else "default session"
    try:
        # A real document, so navigator is the page's navigator rather than the initial about:blank.
        navigate(webdriver_port, session_id, "data:text/html,<title>t</title>")

        actual = execute_script(webdriver_port, session_id, "return navigator.webdriver;")
        if actual is not expected:
            raise AssertionError(
                f"[{label}] expected navigator.webdriver === {expected}, got {actual!r}"
            )

        # The transport must remain active in both modes: execute_script only works while the
        # session is driving the page, so a correct return value proves automation is live even
        # when navigator.webdriver is hidden.
        probe = execute_script(webdriver_port, session_id, "return 6 * 7;")
        if probe != 42:
            raise AssertionError(f"[{label}] transport probe failed, expected 42 got {probe!r}")

        print(f"  PASS: {label} -> navigator.webdriver === {actual} (transport active)")
    finally:
        request(webdriver_port, "DELETE", f"/session/{session_id}")


def run_test(webdriver_binary):
    webdriver_port = unused_port()
    stdout = tempfile.TemporaryFile(mode="w+", encoding="utf-8")
    stderr = tempfile.TemporaryFile(mode="w+", encoding="utf-8")

    webdriver = subprocess.Popen(
        [webdriver_binary, "--headless", "-l", "127.0.0.1", "-p", str(webdriver_port)],
        stdout=stdout,
        stderr=stderr,
        text=True,
    )

    failed = False
    try:
        wait_for_port(webdriver_port)
        check_navigator_webdriver(webdriver_port, hide_webdriver=False, expected=True)
        check_navigator_webdriver(webdriver_port, hide_webdriver=True, expected=False)
    except Exception as error:
        failed = True
        print(f"FAILED: {error}", file=sys.stderr)
    finally:
        webdriver.terminate()
        try:
            webdriver.wait(timeout=10)
        except subprocess.TimeoutExpired:
            webdriver.kill()
        if failed:
            stdout.seek(0)
            stderr.seek(0)
            sys.stderr.write("--- WebDriver stdout ---\n" + stdout.read())
            sys.stderr.write("--- WebDriver stderr ---\n" + stderr.read())

    if failed:
        sys.exit(1)
    print("All navigator.webdriver tests passed.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("webdriver_binary")
    args = parser.parse_args()
    run_test(args.webdriver_binary)


if __name__ == "__main__":
    main()

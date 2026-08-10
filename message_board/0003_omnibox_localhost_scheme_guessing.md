# Bug 0003: The Omnibox Cannot Reach a Local Dev Server

- **Number**: 0003
- **Title**: Scheme Guessing Sent `localhost:3000` to HTTPS, `example.com:8080` to the Search Engine, and the Omnibox Remembered the Wreckage
- **Status**: closed
- **Description**: Three independent defects kept a typed `host:port` from loading. Two in `WebView::sanitize_url` — it guessed `https://` for loopback and produced an SSL handshake failure, and it never recognized `host:port` as a host and a port at all, searching for it instead. The third, in `WebView::Omnibox`, learned the failed destination and served it back after the first two were fixed, which is why the fix appeared not to work. All three are fixed and covered by tests.

---

## Chat 1: Root Cause and Fix

- **Date**: 2026-08-10
- **Author**: Claude Code

### TL;DR

Thomas reported `about:error` — *"Failed to load https://localhost:3000/ — Load failed: Request finished with error: SSL handshake failed"* — while trying to open a Next.js dev server. **Nothing was wrong with TLS.** The browser was speaking TLS to a server that only speaks plain HTTP, because the omnibox guessed the wrong scheme.

Investigating that turned up a second, unrelated defect sitting in the same twelve lines: a typed `host:port` never reaches the scheme guess in the first place.

Both were fixed in `Libraries/LibWebView/URL.cpp`. The full suite is green (259/259).

---

### Bug A: Loopback was upgraded to HTTPS

`sanitize_url` guessed `https://` for **every** scheme-less location. Typing `localhost:3000` produced `https://localhost:3000/`, Ladybird sent a TLS ClientHello to a plain-HTTP dev server, and the handshake died.

The error code is what proves the diagnosis rather than merely suggesting it:

```
Services/RequestServer/CURL.cpp:74   CURLE_SSL_CONNECT_ERROR      -> SSLHandshakeFailed
Services/RequestServer/CURL.cpp:76   CURLE_PEER_FAILED_VERIFICATION -> SSLVerificationFailed
```

A self-signed dev certificate — the intuitive first guess — surfaces as `SSLVerificationFailed`. Thomas got `SSLHandshakeFailed`, which is what curl reports when the peer answers a ClientHello with something that is not TLS at all. So the server was never listening for TLS, and the bug had to be upstream of the network layer.

**Fix**: when the scheme is *guessed*, loopback hosts get `http://`. Chrome's HTTPS-Upgrades and Firefox's HTTPS-Only mode both exempt loopback for exactly this reason, and there is no confidentiality to protect on traffic that never leaves the machine. Loopback is defined as the host set from the secure-contexts spec — `localhost`, `*.localhost`, `127.0.0.0/8`, `::1` — reusing the same rule `Web::SecureContexts` already applies.

Two details that are easy to get wrong:

- The location is **re-parsed** with `http://` rather than having its scheme mutated. Swapping the scheme in place would silently break `localhost:443`, because `:443` is elided as the https default port and would come back as port 80.
- `AppendTLD::Yes` (Ctrl+Enter) is left alone, since the host is about to be rewritten into a public `.com` domain anyway.

An explicitly typed `https://localhost:3000` is still honored. Only the *guess* changed.

### Bug B: `host:port` was searched for, not navigated to

A URL scheme may contain dots. So `example.com:8080` is a syntactically valid URL: scheme `example.com`, opaque path `8080`. It parses successfully, which means it never looked like something needing a guessed scheme — and since `example.com` is not in `SUPPORTED_SCHEMES`, it fell through to the search engine.

The old code carried a hand-patched special case for the single most common victim:

```cpp
if (!url.has_value() || url->scheme() == "localhost"sv) {
```

That covered bare `localhost:3000` and nothing else. `example.com:8080`, `dev.localhost:3000`, and every other dotted `host:port` still became a web search.

**Fix**: replace the special case with the general shape it was approximating. A location is treated as a host and a port when its scheme is unsupported, its path is opaque, and that path is *entirely a port number*:

```cpp
if (!url.has_value() || looks_like_host_and_port(*url)) {
```

The "entirely a port number" requirement is what keeps this from over-firing. It is the difference between `example.com:8080` and a genuine unsupported scheme like `mailto:hello@example.com`, and it preserves every existing search-fallback test. Requiring an *opaque* path is what rejects `ftp://example.org:21`, where the `//` means the scheme already parsed a host of its own.

---

### Verification

Unit tests in `Tests/LibWebView/TestWebViewURL.cpp` cover both fixes, including the port-elision trap (`localhost:443`), all four loopback host forms, the non-loopback cases that must stay `https`, and the near-misses that must still reach the search engine (`example.org:80800`, `example.org:8080a`, `mailto:`, `ftp://`).

Seven existing assertions encoded the old behavior and were updated — worth flagging, because a test changing color is normally the signal that something broke:

| Was | Now |
| :--- | :--- |
| `localhost` → `https://localhost/` | `http://localhost/` |
| `localhost:8000` → `https://localhost:8000/` | `http://localhost:8000/` |
| `example.localhost/path` → `https://…` | `http://example.localhost/path` |

One claim was checked rather than assumed, and turned out false: it looked like the old special case should have made `localhost:hello` resolve to a nonsense `file://` URL, since it re-parses to `https://localhost:hello`, fails on the invalid port, and `create_with_url_or_path` falls back to a filesystem path. Restoring the old condition and observing it directly showed a plain search fallback instead. Behavior there is unchanged. **Reconstructing what old code "would have done" by reading it is not evidence — build it and look.**

End-to-end against real servers, headless:

```
$ Ladybird --headless=text "localhost:3000"     # Bug A, Thomas's actual Next.js app
Every visit has a clear way forward.
...Welcome back, Dr. Chen.

$ Ladybird --headless=text "dev.localhost:8080" # Bug B, dotted host:port
host and port navigation works
```

`127.0.0.1:8080` and `localhost:8080` were confirmed the same way. Full suite: **259/259 passed**. (`Wasm` fails unless `LADYBIRD_SOURCE_DIR` is exported — an environment requirement of that test, not a regression. Worth knowing before it wastes someone's afternoon.)

---

### Loose ends, deliberately not fixed

All three are pre-existing, none is a regression from this work, and each is a policy decision rather than a defect:

1. **A bare-word host with a port still searches.** `myserver:8080` now reaches the scheme guess correctly, but `myserver` has no public suffix, so the existing "no public suffix and the scheme was guessed → search" heuristic sends it to the search engine. That heuristic is intentional and tested (`example.def` → search, "Like Firefox or Chrome"). Exempting hosts with an explicit port would fix intranet names — nobody searches for `myserver:8080` — but it would also make selected page text like `note:123` offer "open as URL" from the context menu, since `sanitize_url` backs that too. One line, real trade-off, Thomas's call.

2. **`localhost.` with the trailing root dot searches.** `host_is_loopback` recognizes it, but the public-suffix check downstream does not, and only bare `localhost` is exempted there. Vanishingly rare to type.

3. **A non-loopback host still gets the `https` guess even with a port.** Intended: that is the standard upgrade policy, and we cannot know that some random `host:8080` speaks plain HTTP. Only loopback carries the guarantee.

*Signed by Claude Code*

---

## Chat 2: The Fix Was Live and the Bug Still Reproduced

- **Date**: 2026-08-10
- **Author**: Claude Code

### TL;DR

Thomas reported localhost still failing after Chat 1 shipped, with the same `https://localhost:3000/` error. The scheme fix was live and working. **The omnibox had memorized the broken URL before the fix landed and was serving it back**, bypassing `sanitize_url` entirely.

Root cause of the *persistence*: the omnibox records what an input led to at the moment Enter is pressed — before it knows whether anything loaded. A failed navigation is learned exactly as confidently as a successful one, then ranks first on every later query for that input, forever. **A bug fixed in the URL layer cannot dislodge a wrong answer already cached in the ranking layer.**

Fixed by withholding the lesson until the navigation lands.

---

### How it was found

Worth recording the sequence, because "your fix didn't work" was true from the user's seat and false in the code, and only data settled it.

Ruled out in order:

| Suspect | Verdict |
| :--- | :--- |
| Stale binary / stale `/Applications` copy | No — process started 15:25, dylib with the fix built 15:06 |
| HSTS upgrading loopback | No — `HSTSPolicies` has no localhost/127.x/::1 row |
| Server redirecting to https | No — every hop in the chain is `http` |
| Browsing history | No — zero localhost rows in `History` |
| Session restore on launch | No — the AppKit UI implements none |

That left the omnibox. `History.db`'s **`OmniboxEngagements`** table held it:

```
normalized_input   destination                 explicit  default  time
localhost:3000     https://localhost:3000/     0         1        14:50:35   <- pre-fix, wrong
localhost:3000/    http://localhost:3000/      0         1        14:57:17   <- post-fix, correct
localh             https://localhost:3000/     1         0        15:25:23   <- the screenshot
```

The middle row is the fix demonstrably working. The third row is the failure: typing `localh` autocompleted to the memorized 14:50 destination, `explicit_use_count=1` meaning it was accepted from the popup — and an accepted suggestion navigates to its stored URL without ever consulting `sanitize_url`.

**The timestamps are the whole proof.** Three rows, one table, and the ambiguity collapses.

### The fix

`Omnibox` now holds the engagement instead of recording it:

- `commit_suggestion` / `commit_verbatim` stash it in `m_pending_engagement`.
- `committed_navigation_finished(final_url)` records it, unless the navigation came to rest on `URL::about_error()` — the URL LibWeb gives the browser's own error document (`LocalNavigable.cpp:2284`).
- A newer commit supersedes any pending one; the user has moved on.

Held rather than recorded-then-deleted, so a failed destination is never a suggestion even briefly. A 404 or any error page *the site itself* serves still counts as a successful load, because it is one — only the browser's error document means the destination is unreachable.

Wired in both chromes at the moment loading stops: `TabController.mm` `onLoadFinish`, and `Tab.cpp`'s `on_loading_state_change`.

### Verification

`TestOmnibox`: **54/54**. Five new cases pin the behavior — a failed navigation teaches nothing; a later unrelated load does not retroactively bless it; a superseded commit teaches only the last one; a site's own error page is still learned; a landed navigation is learned exactly once.

Eight existing assertions needed a landing added before them, which is the honest cost of the change: engagement is no longer a synchronous consequence of Enter.

Full suite **259/259**. App rebuilt and synced to `/Applications`.

Thomas's profile also had the two poisoned rows purged (`History.db` backed up first); the correct `http://localhost:3000/` row was left alone.

### The part worth remembering

The scheme fix in Chat 1 was correct, verified, and shipped — and the bug still reproduced, because **a fix upstream of a cache does not invalidate the cache.** Any browser subsystem that learns from user behavior needs to learn only from outcomes it has actually observed, or it will faithfully preserve every bug that ever reached it.

*Signed by Claude Code*

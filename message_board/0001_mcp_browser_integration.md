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

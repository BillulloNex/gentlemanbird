# Project Blueprint: GentlemanBird — The AI Agent's Favorite Browser Engine

## Vision & Objective
Build an ultra-lightweight, high-performance, and stealth-native browser automation platform on top of **Ladybird** designed specifically for AI agents to navigate, observe, and interact with the web just like a human.

By instrumenting the browser directly at the engine level (C++ / `LibWeb`, `LibJS`, `LibGfx`), GentlemanBird eliminates the memory bloat of Chromium while providing native, undetectable stealth and direct LLM-friendly IPC primitives.

---

## Strategic Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    AI Agent Frameworks                     │
│       (Python SDK, Node.js SDK, LangChain, Playwright)      │
└─────────────────────────────┬──────────────────────────────┘
                              │ Agent IPC / WebSocket / gRPC
┌─────────────────────────────▼──────────────────────────────┐
│            GentlemanBird Headless Agent Daemon             │
├────────────────────────────────────────────────────────────┤
│  [Stealth & Anti-Detection Engine]                         │
│  - JA3/JA4 TLS ClientHello Alignment (BoringSSL/OpenSSL)   │
│  - HTTP/2 & HTTP/3 Frame & Header Signature Matching       │
│  - Native Chrome Prototype Chain & `window.chrome` IDL     │
│  - Pure C++ `isTrusted = true` Synthetic Event Dispatcher  │
├────────────────────────────────────────────────────────────┤
│  [AI-Native Observation & Action Primitives]               │
│  - Direct Accessibility Tree & Bounding Box Extractor      │
│  - Zero-Copy Framebuffer / Skia Bitmap to Vision Stream    │
│  - Mutation & Dynamic Network State Streamer               │
├────────────────────────────────────────────────────────────┤
│  [Core Engine: LibWeb, LibJS, LibGfx, RequestServer]       │
└────────────────────────────────────────────────────────────┘
```

---

## Work Item Epics & Agent Task Breakdown

### **Epic 1: Headless Daemon & Agent IPC Protocol**
*Goal: Provide a minimal, high-throughput remote control interface tailored for LLMs.*

- [ ] **Task 1.1: Headless Execution Harness**
  - Implement a dedicated headless runtime mode that bypasses UI/Qt/AppKit window management.
  - Optimize memory usage per instance (< 50MB baseline idle).
- [ ] **Task 1.2: Agent Protocol Server (BiDi / Custom IPC)**
  - Implement a lightweight WebSocket/gRPC control daemon for session management.
  - Implement core automation commands: `Navigate(url)`, `Click(x, y)`, `Type(text)`, `Scroll(dx, dy)`, `CaptureScreenshot()`, `GetSnapshot()`.
- [ ] **Task 1.3: Python & TypeScript Client SDKs**
  - Create developer SDKs for spawning, connecting, and controlling GentlemanBird instances.
  - Provide a drop-in Playwright/Puppeteer adapter or clean async API.

---

### **Epic 2: Anti-Detection & Engine Stealth (The "Not Chrome" Layer)**
*Goal: Match Chrome/Safari signatures natively at the protocol and engine layer without detectable JS shims.*

- [ ] **Task 2.1: TLS ClientHello & Network Fingerprint Matching (JA3/JA4)**
  - Configure the networking/TLS stack to replicate Chrome’s cipher suite ordering, extensions, elliptic curves, and ALPN tokens.
  - Standardize HTTP/2 pseudo-header order (`:method`, `:authority`, `:scheme`, `:path`) and initial `SETTINGS` frame values.
- [ ] **Task 2.2: Native Chrome DOM & Prototype Chain Synthesis**
  - Implement native C++ IDL bindings for `window.chrome` (`app`, `runtime`, `loadTimes`, `csi`).
  - Standardize `navigator.plugins`, `navigator.mimeTypes`, `navigator.languages`, and `navigator.webdriver = undefined`.
  - Ensure property descriptors (`enumerable`, `configurable`, `writable`) and `Function.prototype.toString()` match Chrome native V8 behaviors exactly.
- [ ] **Task 2.3: Hardware & WebGL Profile Spoofing**
  - Expose customizable WebGL vendor/renderer strings (e.g., `ANGLE (Apple, Apple M2...)`).
  - Implement realistic canvas, audio context, and font enumeration characteristics.
- [ ] **Task 2.4: Human-Grade Event Dispatching (`isTrusted = true`)**
  - Implement native input injection directly in `LibWeb`'s event loop so all synthetic mouse, keyboard, and touch events are emitted with `isTrusted = true`.
  - Add optional Bezier curve mouse trajectory smoothing and human typing jitter generator.

---

### **Epic 3: AI-Native Perception & Extraction Primitives**
*Goal: Make the DOM and visual state instant, clean, and token-efficient for LLMs.*

- [ ] **Task 3.1: Token-Optimized Accessibility Tree (AXTree) Extractor**
  - Expose a native C++ method to traverse the accessibility tree and export a filtered, semantic hierarchy (roles, names, states, coordinates, interactivity tags).
  - Strip redundant nodes to save 70-80% of context window tokens compared to raw HTML.
- [ ] **Task 3.2: Direct Interactive Bounding Box Mapping**
  - Automatically calculate and output `[x, y, width, height]` and interactive element IDs for vision/multimodal models (Set-of-Mark style prompting).
- [ ] **Task 3.3: High-Speed Vision Pipeline**
  - Enable zero-copy snapshotting from the compositor/Skia canvas directly into compressed JPEG/WebP or shared memory buffers for local VLM inference.

---

### **Epic 4: Web Platform Compatibility & Challenge Script Hardening**
*Goal: Fix edge-case API gaps in `LibWeb` and `LibJS` so bot challenges and SPAs run cleanly.*

- [ ] **Task 4.1: Anti-Bot Challenge Suite Benchmarking**
  - Create an automated test harness targeting Cloudflare Turnstile, DataDome, Akamai, and Kasada challenge pages.
  - Log and isolate any `LibJS` runtime exceptions or missing Web APIs.
- [ ] **Task 4.2: Web API Gap Filling in `LibWeb`**
  - Identify and implement missing modern Web APIs frequently probed by complex SPAs and challenge scripts (e.g., specific `Intl` formats, `Permissions` queries, `PerformanceObserver` entries).
- [ ] **Task 4.3: Stack Trace & Error Object Conformance**
  - Ensure `Error.stack` formatting in `LibJS` matches the V8 layout expected by obfuscated verification scripts.

---

## Milestones & Delivery Phases

1. **Phase 1 (MVP Sandbox):** Headless daemon + basic IPC (navigate, screenshot, native click/type) + basic tokenized AXTree extraction.
2. **Phase 2 (Stealth Baseline):** TLS JA3/JA4 matching + `window.chrome` & `navigator` IDL parity + C++ `isTrusted` dispatch.
3. **Phase 3 (WAF & Challenge Certification):** Pass Cloudflare Turnstile and DataDome challenges; run benchmark suites against top 100 enterprise SaaS SPAs.
4. **Phase 4 (Scale & SDK Ecosystem):** Multi-tenant session pooling daemon, Python/TypeScript SDKs, and containerized Docker/Firecracker microVM images.

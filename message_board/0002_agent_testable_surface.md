# Proposal 0002: Making Every Feature Agent-Testable

- **Number**: 0002
- **Title**: Closing the Test-Mode Divergence Seams So AI Agents Can Verify Every Feature
- **Status**: open
- **Description**: Analysis of why Ladybird's 8,660-test suite passed a clipboard bug that broke password pasting, the structural cause (fakes substituted at the exact seam under test), and a staged plan to make the untestable surface small, enumerated, and shrinking.

---

## Chat 1: Viability, Difficulty, and Potholes

- **Date**: 2026-08-10
- **Author**: Claude Code

### TL;DR

**Viability: high for the mechanism, but the goal needs restating.** "Every single feature tested by an agent" is not reachable as literally stated — some behavior (GPU rasterization on specific hardware, real network conditions, screen-reader experience, perceived jank) is irreducibly outside an automated harness. The reachable and genuinely valuable version is: **the untestable surface becomes small, written down in a file, and monotonically shrinking** — instead of being discovered when a user can't paste their password.

The good news is that the hard infrastructure already exists in this repo. The suite is fast (258 targets, 125s), fully green, and two of the three techniques this proposal needs already have working precedent in-tree. This is mostly assembly, not invention.

**The core finding**, which reframes the problem:

The clipboard bug (`type == NSPasteboardTypeString` comparing NSString pointers instead of values) was not missed because the UI layer lacks tests. It was missed because **the harness swaps in a fake at precisely the seam where the bug lived.** `Libraries/LibWebView/Application.cpp:1671` provides an in-memory clipboard; `UI/Qt/Application.cpp:811` short-circuits to it under `headless_mode`; and `Tests/LibWeb/test-web/Application.h:19` derives from `WebView::Application` while overriding **zero** clipboard methods.

Net effect: `Tests/LibWeb/Text/input/Editing/clipboard-shortcut-paste.html` — a test named after the broken feature — passes without executing one line of platform clipboard code. That is worse than no coverage, because no coverage is honest, whereas this produced a green checkmark over a broken feature.

There are **29 such `headless_mode` branches** across 8 files in `UI/` and `Libraries/LibWebView/`. Each is a precisely-shaped blind spot. For scale: 60k lines across `UI/AppKit` (10,359), `UI/Qt` (17,583), `LibWebView` (32,086), covered by 16 unit tests total.

**Difficulty: medium overall, front-loaded into scaffolding.**

| Work item | Difficulty | Notes |
| :--- | :--- | :--- |
| AppKit clipboard pilot test | **Medium** | ~80% is the CMake target that doesn't exist yet; the test itself is ~40 lines |
| Contract-test harness (one suite, N backends) | **Medium** | Straightforward once the pilot proves the target works |
| Walking the other 28 divergence sites | **Large but parallel** | Ideal agent work — repetitive, mechanical, independently verifiable |
| Coverage instrumentation + uncovered-function report | **Small–Medium** | Standard `-fprofile-instr-generate`; the reporting glue is the work |
| Test-potency (red-green) enforcement | **Medium** | `Meta/check-test-flakiness.py` already computes new-tests-vs-base-ref; extend it |
| Deleting the fakes entirely | **Not recommended** | Would wreck the 2-minute suite; contract-test them instead |

**Biggest potholes** (detailed in the section below): the one existing UI test is Linux-gated and has never run on macOS; Qt's `offscreen` platform has no working clipboard; and `--rebaseline` will cheerfully enshrine a bug into an expectation file, which is the single sharpest hazard for AI-authored tests.

**None of the potholes are technically impossible, and none currently block starting.** See "Blocker Triage" below — as of 2026-08-10 the only items needing a human decision are scope (upstream-bound vs. personal) and whether to keep the headless fakes.

**Recommendation**: build the clipboard pilot first. We already know the correct answer, so we can *prove the test has power* by checking out `HEAD~` and watching it fail. That single exercise settles the main unknown — whether an AppKit test target is pleasant or painful — before committing to the other 28 sites.

---

### Evidence

Verified against the tree at `62821b296f`:

```
Tests/LibWeb/test-web/Application.h:19    class Application : public WebView::Application
                                          (0 clipboard overrides — inherits the fake)

Libraries/LibWebView/Application.h:199    // FIXME: We should implement UI-agnostic platform
                                          //        APIs to interact with the system clipboard.
Libraries/LibWebView/Application.h:513    Optional<...SystemClipboardItem> m_clipboard;
Libraries/LibWebView/Application.cpp:1671 Vector<...> Application::clipboard_entries() const

UI/Qt/Application.cpp:811                 if (browser_options().headless_mode.has_value())
                                              return WebView::Application::clipboard_entries();

UI/AppKit/Application/Application.mm:213  Application::clipboard_entries()
UI/AppKit/Application/Application.mm:216  auto* paste_board = [NSPasteboard generalPasteboard];
                                          (hardcoded — not injectable)
```

Baseline health, measured on `Build/release`: `258/258 ctest targets pass in 125.38s`; LibWeb alone reports `Pass: 8660, Fail: 0, Skipped: 114, Timeout: 0, Crashed: 0` in 108s. The suite is healthy and fast — this proposal is about *what it does not reach*, not about repairing it.

Test discipline, last 200 commits touching `Libraries/LibWeb`: 66 added tests, 134 did not. Most of the 134 are refactors, which the existing suite legitimately covers.

---

### The Six Mechanisms

#### 1. Verified fakes / contract tests — kills this entire bug class

Don't delete the fakes; they're why the suite runs in two minutes. Make them *provably equivalent*. Define one abstract suite against a `PlatformClipboard` interface and run it three times — against the in-memory fake, against Qt, against AppKit. The fake earns trust only by passing what the real backends pass.

```cpp
// Tests/LibWebView/ClipboardContract.h — one suite, three bindings
void run_clipboard_contract(PlatformClipboard&);
```

This converts the 29 divergence sites from invisible holes into a finite, enumerable backlog — exactly the shape of work an agent can grind through.

#### 2. Offscreen real-toolkit tests — precedent already exists in-tree

`Tests/UI/Qt/TestNativeWindowContainerFocus.cpp` already drives a real `QApplication` headlessly and nobody generalized it:

```cpp
qputenv("QT_QPA_PLATFORM", "offscreen");
static QApplication app(argc, argv);
```

Real toolkit, real events, deterministic, ~1s. The AppKit equivalent hinges on `[NSPasteboard pasteboardWithUniqueName]` — same class and same pasteboard-server round trip that *caused* the bug, but private to the test and isolated from the developer's real clipboard. A test that writes to a unique pasteboard and reads back through the real code path **fails on the old identity comparison and passes on the fix.** No fake can do this, because the bug lived in the round trip.

#### 3. Humble object — shrink the residue until it cannot hold logic

Convert `NSString*` → `StringView` at the outermost edge, then do all MIME mapping in a plain free function in `LibWebView`. The Objective-C residue drops to ~3 lines of pure translation. Note the same three-branch mapping is duplicated in `UI/Qt/Application.cpp` and `UI/AppKit/Application/Application.mm` — duplicated logic across two untested files pointing straight at the shared function that wants to exist.

#### 4. Coverage as the backlog generator — how "every" becomes tractable

You cannot reach "every feature" by inspiration. Build with `-fprofile-instr-generate -fcoverage-mapping`, run the suite, emit uncovered functions in `UI/` and `Libraries/` ranked by size. That is a work queue with a number that goes up. It would have flagged the clipboard code as 0%-covered *before* a user hit it.

#### 5. Test potency — the #1 failure mode of agent-written tests

An agent asked to "add a test" will happily write one that passes vacuously. `--rebaseline` makes this trivial: it records whatever Ladybird currently outputs, **so for a bug fix it enshrines the bug.**

The fix is mechanizable and mostly built. `Meta/check-test-flakiness.py` already computes new-tests-vs-`--base-ref` and runs them repeatedly on PRs. Extend the same machinery: for each newly added test, check out the base ref, build, run it — **assert it fails there.** A test added alongside a fix that already passes before the fix has no power and should block CI. Red-green, enforced by robot. Mutation testing is the general form; this narrow version is cheap and catches the common case.

#### 6. Enforcement

A CI warning on source-without-test won't fix culture alone, but paired with #4 it stops the untested surface from growing while we shrink it.

---

### Potholes

Ordered by how likely they are to derail the work.

**1. The existing UI test precedent is Linux-only and has never run on macOS.**
`Tests/UI/Qt/CMakeLists.txt` opens with `if (NOT LINUX) return()`. So the one piece of prior art is dead code on Thomas's machine. There is no AppKit test target at all — `Tests/UI/CMakeLists.txt` is a single `add_subdirectory(Qt)`. Creating the AppKit target (framework linkage, `ladybird_test()` integration, `.mm` compilation) is the real cost of the pilot, and it is unbudgeted if you assume "there's already a UI test, just copy it."

**2. AppKit pasteboard access requires a window-server session.** *(Not currently active — see Blocker Triage.)*
Upstream CI runs macOS on `["macos-26", "self-hosted"]`. A self-hosted runner invoked over SSH or as a daemon may have no GUI session, in which case `NSPasteboard` fails or hangs rather than returning clean errors. This does **not** apply to this fork today, which has no CI at all and runs tests only on Thomas's Mac (which has a session by definition). It becomes real if CI is enabled on the fork or the work is upstreamed.

**3. Qt's `offscreen` QPA platform has no functioning clipboard.**
The trick that makes `TestNativeWindowContainerFocus` work does *not* extend to clipboard testing. The Qt contract binding will likely need `xvfb-run` on Linux CI, which is a different (and heavier) dependency than the offscreen platform. Budget for it.

**4. ~~`pasteboardWithUniqueName` availability needs confirming.~~ RESOLVED 2026-08-10.**
Confirmed present and undeprecated at `MacOSX.sdk/System/Library/Frameworks/AppKit.framework/Headers/NSPasteboard.h:161`, declared immediately alongside `generalPasteboard`. No fallback needed.

**5. Injecting a pasteboard parameter collides with the virtual override chain.**
`clipboard_entries()` is `virtual` on `WebView::Application` and overridden by both backends. You cannot cleanly add a defaulted parameter to a virtual and keep the override relationship tidy. The right shape is a **non-virtual testable free function** (or a protected seam taking the pasteboard) that the virtual delegates to. Getting this wrong produces a confusing diff that reviewers will push back on.

**6. Contract tests only prove equivalence for behavior somebody wrote down.**
The clipboard bug was in a behavior nobody thought to specify. Contract suites reduce divergence; they do not eliminate the unknown-unknown. This is an argument for pairing them with coverage (#4), which finds unexecuted code regardless of whether anyone imagined the case.

**7. Coverage builds are slow and thrash ccache.**
`Documentation/Testing.md` already warns about this for sanitizers; instrumentation has the same problem. Coverage should be a **separate nightly job** (`nightly-lagom.yml` is the natural host), never part of the PR path.

**8. Potency checking roughly doubles CI time when it triggers.** *(Not currently active — see Blocker Triage.)*
It requires building the base ref. Irrelevant while this fork has no CI; locally it is a manual `git stash` + rebuild, which is cheap given ccache. If CI is later enabled, mitigate by running only when a PR actually adds test files. `check-test-flakiness.py` already runs on a 1200s deadline upstream, so there is a budget precedent to reason from.

**9. Deleting the fakes is the tempting wrong turn.**
Always-real backends would mean every LibWeb test needs a display server and a live clipboard. That trades a 2-minute suite for something far slower and flakier, and would push the whole project toward the failure mode where developers stop running tests locally. Contract-test the fakes; don't remove them.

**10. The meta-pothole: an agent will "verify" against the fake and report success.**
This is precisely what happened here — a green `clipboard-shortcut-paste.html` reads to an agent as proof the feature works. Until #1 and #4 land, **any agent claim of "tested and passing" on UI-layer behavior should be treated as unverified.** Worth stating explicitly in `CLAUDE.md` so it survives context loss between sessions.

**11. macOS-only coverage is single-runner coverage.** *(Not currently active — see Blocker Triage.)*
Upstream, the AppKit path could only ever be exercised on the self-hosted macOS runner, and if that runner degraded, coverage would silently drop with no signal. Not applicable to this fork today. If CI is later enabled, fail loudly rather than skipping when the macOS job cannot run.

---

### Blocker Triage

*Added 2026-08-10 in response to: "are the blockers something you need from me, or technically impossible?"*

**Nothing here is technically impossible.** The eleven potholes sort into three buckets.

**Moot — this fork has no CI.** All 18 workflows in `.github/workflows/` are gated on `if: github.repository == 'LadybirdBrowser/ladybird'`. The remote is `ThomasVuNguyen/gentlemanbird`, so none of them execute. Test running is entirely local. This deactivates potholes **#2, #8, and #11**, all of which assumed upstream's runner fleet. They reactivate if the repository gate is removed or the work is upstreamed.

**Resolved or agent-resolvable — no human input required.** #1 (build the AppKit target), #3 (verify Qt offscreen clipboard empirically), #4 (**resolved** — API confirmed in SDK), #5 (non-virtual seam; standard design call), #6 (mitigated by pairing with coverage), #7 (run coverage as a separate nightly), #9 (recommendation already made: keep the fakes), #10 (a note in `CLAUDE.md`).

**Genuinely needs Thomas — two questions, neither blocking.**

1. **Upstream-bound, or personal?** Highest-leverage answer available. Personal + macOS-first shrinks the plan by roughly two-thirds: no Qt binding, no Linux/xvfb work, no three-way contract suite — just fake-vs-AppKit, and pothole #3 disappears. Upstream-bound makes Qt parity mandatory, since Ladybird's CI is Linux-first and maintainers will not take macOS-only test infrastructure.
2. **Keep the headless fakes?** Recommendation is keep-and-verify. Ratify or overrule.

Work can begin before either is answered: the AppKit test target and the injectable seam are required under every variant. Answering only avoids building Qt scaffolding that may be unwanted.

---

### Proposed Sequence

1. **Pilot**: add an injectable seam for `clipboard_entries()` (AppKit; Qt only if upstream-bound), create `Tests/UI/AppKit/` with a working CMake target, add `TestClipboard.mm` using a unique pasteboard.
2. **Prove potency**: verify the new test fails at `HEAD~` and passes at `HEAD`. If it does not fail at `HEAD~`, the test is worthless and the approach needs rework before scaling.
3. ~~**Verify CI**~~ — dropped; this fork has no CI. Reinstate if the repository gate is ever removed.
4. **Generalize**: extract the contract suite; bind it to fake + AppKit (+ Qt if upstream-bound).
5. **Enumerate**: land the coverage job; publish the uncovered-function report as the standing backlog.
6. **Walk the remaining 28** `headless_mode` sites against that backlog.
7. **Enforce**: extend `check-test-flakiness.py` with the red-green potency assertion.

Steps 1–3 are the decision point. If the macOS test target turns out to be hostile, the fallback is to lean much harder on #3 (humble object) — push essentially all logic out of the platform files so the untestable residue is too thin to hold a bug — and accept that the last inch stays manually reviewed.

### Open Question for Thomas

Do we keep the headless fakes? Contract-testing them is more work than deleting them and always running the real backend, but it is the difference between a 2-minute suite and a much slower one. My recommendation is keep-and-verify, but it is a real trade and it shapes items 1, 4, and 9 above.

*Signed by Claude Code*

---

## Chat 2: Pilot Results — What the Clipboard Fix Actually Taught Us

- **Date**: 2026-08-10
- **Author**: Claude Code

### Decisions taken

Scope is **personal fork, macOS-only** (no Qt binding, no Linux/xvfb work). Headless fakes are **kept and contract-tested**, not deleted. CI is **enabled** — the repo is public, so GitHub-hosted macOS runners are free and unmetered.

### The most important technical finding

The pilot's first design was **wrong, and the red-green check is the only reason we found out.**

The plan was to point `test-web` at a real `NSPasteboard` so the existing clipboard tests would cover the real code. That was built, the tests passed — and they *still passed with the pointer-comparison bug deliberately reintroduced*. A direct probe of `NSPasteboard` explains why:

| How the pasteboard was written | `==` identity | `isEqualToString:` |
| :--- | :--- | :--- |
| Same process, same `NSPasteboard` object | **YES** | YES |
| Same process, freshly obtained `NSPasteboard` | **YES** | YES |
| **Separate process** | **NO** | YES |

`NSPasteboard` hands back the very same `NSString` objects the writing process passed in. Because `test-web` seeds its own clipboard, it compares the global `NSPasteboardType` constants against themselves and the broken comparison succeeds. Only a genuinely foreign writer forces AppKit to reconstruct the types — which is what a real paste does, since the user copied from another application.

So `Tests/UI/AppKit/TestClipboard.mm` re-execs the test binary in a writer mode to populate a private pasteboard from outside the process. **Verified: fails with the old comparison, passes with the fix.**

Two lessons generalize beyond the clipboard:

1. **A real backend is not automatically a real test.** Using the genuine platform object was necessary but nowhere near sufficient; the bug lived in a cross-process property that same-process use cannot reproduce. When replacing a fake, ask what *property* the bug depends on, not just which object.
2. **Potency checking is the load-bearing step, not a formality.** Without it this session would have shipped a test that proved nothing and reported success — the exact failure mode predicted in Chat 1, item 5, reached anyway by the agent that predicted it.

### Landed

- `UI/AppKit/Application/Clipboard.{h,mm}` — pasteboard translation extracted, takes the pasteboard as a parameter, de-duplicates mapping that existed in two places
- `Tests/UI/AppKit/` — the target did not exist; the only prior UI test is Qt-only behind `if (NOT LINUX) return()` and had never run on this machine
- `Tests/LibWeb/test-web/ClipboardMacOS.mm` — test-web on a real private pasteboard. Worth keeping, but per the above it does **not** catch this bug class on its own
- `.github/workflows/fork-ci.yml` — macOS build + test, and fails loudly if `TestClipboard` is not registered
- `Meta/check-test-potency.sh` — the red-green check from Chat 1 item 5, now a script instead of a manual ritual

Full suite: **259/259 passing in 46.8s** on an unloaded machine.

### Pothole updates

- **#1 (no AppKit test target)** — resolved, `Tests/UI/AppKit/` now exists.
- **#2 / #8 / #11 (CI-premised)** — reactivated, since CI is now real. But hosted `macos-26` runners replace upstream's self-hosted fleet, so the "runner may lack a GUI session" concern is now a live question to watch rather than a settled non-issue.
- **#4 (`pasteboardWithUniqueName`)** — confirmed available, in use.
- **NEW: the shared setup action pins Xcode 26.2.** Only the `macos-26` image carries it; the first CI run died on `macos-14`. Keep the plain label — `-large`/`-xlarge` are larger runners, billed even on public repos.
- **NEW: there is no local vcpkg binary cache.** A second build tree (which coverage instrumentation requires) would rebuild every third-party dependency from source. This is the main obstacle to milestone #4 and should be budgeted for, or worked around with `-DVCPKG_INSTALLED_DIR` pointed at the existing tree.

### Where this leaves the initiative

**1 of 29** `headless_mode` divergence sites closed. Still open: the contract-test harness, the coverage backlog generator (see the vcpkg caveat above), and wiring the potency script into CI so it runs on new tests automatically rather than on request.

*Signed by Claude Code*

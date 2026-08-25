/**
 * Session Manager
 *
 * Manages multiple concurrent browser sessions, each backed by its own
 * Ladybird WebDriver connection. Handles lifecycle, health monitoring,
 * and resource cleanup.
 */

import { WebDriverBridge, WebDriverError } from './webdriver_bridge.js';
import { AXElement, AXTreeSnapshot, buildAXWalkerScript, formatAXTree } from './ax_tree.js';
import crypto from 'crypto';

export interface SessionConfig {
  headless?: boolean;
  viewport?: { width: number; height: number };
  capabilities?: Record<string, unknown>;
}

export interface SessionInfo {
  id: string;
  webdriverSessionId: string;
  headless: boolean;
  createdAt: number;
  lastActivity: number;
  url: string;
  title: string;
  status: 'active' | 'crashed' | 'closed';
}

export interface ActionRequest {
  type: 'click' | 'type' | 'scroll' | 'hover' | 'press';
  x?: number;
  y?: number;
  text?: string;
  key?: string;
  dx?: number;
  dy?: number;
  selector?: string;
  elementId?: number;
}

interface ManagedSession {
  info: SessionInfo;
  bridge: WebDriverBridge;
}

const DEFAULT_VIEWPORT = { width: 1280, height: 800 };
const MAX_SESSIONS = parseInt(process.env.GB_MAX_SESSIONS ?? '5', 10);

// Each session uses a separate WebDriver port to allow true parallelism.
// The base port for WebDriver processes (each session increments from here).
const WEBDRIVER_BASE_PORT = parseInt(process.env.GB_WEBDRIVER_BASE_PORT ?? '8100', 10);

export class SessionManager {
  private sessions = new Map<string, ManagedSession>();
  private nextPort = WEBDRIVER_BASE_PORT;

  // ─── Session lifecycle ─────────────────────────────────────────────

  async createSession(config: SessionConfig = {}): Promise<SessionInfo> {
    if (this.sessions.size >= MAX_SESSIONS) {
      throw new Error(`Maximum sessions (${MAX_SESSIONS}) reached. Close an existing session first.`);
    }

    const id = crypto.randomUUID();
    const headless = config.headless ?? true;
    const port = this.nextPort++;

    const bridge = new WebDriverBridge(port);

    // Spawn WebDriver process for this session
    await bridge.spawn(headless);

    // Create the WebDriver session
    const capabilities: Record<string, unknown> = {
      ...config.capabilities,
    };

    // Enable stealth mode by default
    capabilities['ladybird:hideWebdriver'] = true;

    const wdSession = await bridge.createSession(capabilities);

    // Set viewport
    const viewport = config.viewport ?? DEFAULT_VIEWPORT;
    try {
      await bridge.setWindowRect(wdSession.sessionId, viewport.width, viewport.height);
    } catch {
      // Headless mode may not support window rect
    }

    const info: SessionInfo = {
      id,
      webdriverSessionId: wdSession.sessionId,
      headless,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      url: 'about:blank',
      title: '',
      status: 'active',
    };

    this.sessions.set(id, { info, bridge });
    console.error(`[gentlemanbird] Session ${id} created (webdriver=${wdSession.sessionId}, port=${port}, headless=${headless})`);

    return { ...info };
  }

  async destroySession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) throw new SessionNotFoundError(id);

    try {
      await session.bridge.deleteSession(session.info.webdriverSessionId);
    } catch {
      // Best effort cleanup
    }

    session.bridge.kill();
    session.info.status = 'closed';
    this.sessions.delete(id);
    console.error(`[gentlemanbird] Session ${id} destroyed`);
  }

  async destroyAll(): Promise<void> {
    const ids = [...this.sessions.keys()];
    await Promise.allSettled(ids.map((id) => this.destroySession(id)));
  }

  listSessions(): SessionInfo[] {
    return [...this.sessions.values()].map((s) => ({ ...s.info }));
  }

  getSession(id: string): SessionInfo {
    const session = this.sessions.get(id);
    if (!session) throw new SessionNotFoundError(id);
    return { ...session.info };
  }

  // ─── Navigation ────────────────────────────────────────────────────

  async navigate(id: string, url: string): Promise<{ url: string; title: string }> {
    const { bridge, info } = this.getManaged(id);

    await bridge.navigate(info.webdriverSessionId, url);
    // Wait a moment for page load
    await sleep(500);

    const [currentUrl, title] = await Promise.all([
      bridge.getCurrentUrl(info.webdriverSessionId),
      bridge.getTitle(info.webdriverSessionId),
    ]);

    info.url = currentUrl;
    info.title = title;
    info.lastActivity = Date.now();

    return { url: currentUrl, title };
  }

  async back(id: string): Promise<void> {
    const { bridge, info } = this.getManaged(id);
    await bridge.back(info.webdriverSessionId);
    info.lastActivity = Date.now();
  }

  async forward(id: string): Promise<void> {
    const { bridge, info } = this.getManaged(id);
    await bridge.forward(info.webdriverSessionId);
    info.lastActivity = Date.now();
  }

  async refresh(id: string): Promise<void> {
    const { bridge, info } = this.getManaged(id);
    await bridge.refresh(info.webdriverSessionId);
    info.lastActivity = Date.now();
  }

  // ─── Snapshots ─────────────────────────────────────────────────────

  async getAXTree(id: string, visibleOnly: boolean = true): Promise<AXTreeSnapshot> {
    const { bridge, info } = this.getManaged(id);
    const sid = info.webdriverSessionId;

    const script = buildAXWalkerScript(visibleOnly);
    const elements = (await bridge.executeScript(sid, script)) as AXElement[];

    const [url, title] = await Promise.all([
      bridge.getCurrentUrl(sid),
      bridge.getTitle(sid),
    ]);

    info.url = url;
    info.title = title;
    info.lastActivity = Date.now();

    return {
      elements: elements ?? [],
      formatted: formatAXTree(elements ?? []),
      elementCount: elements?.length ?? 0,
      url,
      title,
      timestamp: Date.now(),
    };
  }

  async takeScreenshot(id: string): Promise<string> {
    const { bridge, info } = this.getManaged(id);
    info.lastActivity = Date.now();
    return bridge.takeScreenshot(info.webdriverSessionId);
  }

  async getPageSource(id: string): Promise<string> {
    const { bridge, info } = this.getManaged(id);
    info.lastActivity = Date.now();
    return bridge.getPageSource(info.webdriverSessionId);
  }

  // ─── Actions ───────────────────────────────────────────────────────

  async performAction(id: string, action: ActionRequest): Promise<{ success: boolean; detail?: string }> {
    const { bridge, info } = this.getManaged(id);
    const sid = info.webdriverSessionId;
    info.lastActivity = Date.now();

    switch (action.type) {
      case 'click': {
        if (action.selector) {
          const elemId = await bridge.findElement(sid, 'css selector', action.selector);
          await bridge.clickElement(sid, elemId);
        } else if (action.x !== undefined && action.y !== undefined) {
          // Use WebDriver actions API for coordinate-based click
          await bridge.performActions(sid, [
            {
              type: 'pointer',
              id: 'mouse',
              parameters: { pointerType: 'mouse' },
              actions: [
                { type: 'pointerMove', x: action.x, y: action.y, duration: 100 },
                { type: 'pointerDown', button: 0 },
                { type: 'pointerUp', button: 0 },
              ],
            },
          ]);
        } else if (action.elementId !== undefined) {
          // Find element by AXTree ID via injected script
          const elemSelector = await this.resolveAXElementSelector(sid, bridge, action.elementId);
          if (elemSelector) {
            const elemId = await bridge.findElement(sid, 'css selector', elemSelector);
            await bridge.clickElement(sid, elemId);
          }
        }
        return { success: true };
      }

      case 'type': {
        if (!action.text) return { success: false, detail: 'No text provided' };
        if (action.selector) {
          const elemId = await bridge.findElement(sid, 'css selector', action.selector);
          await bridge.sendKeys(sid, elemId, action.text);
        } else {
          // Type into currently focused element via actions
          await bridge.performActions(sid, [
            {
              type: 'key',
              id: 'keyboard',
              actions: action.text.split('').flatMap((ch) => [
                { type: 'keyDown', value: ch },
                { type: 'keyUp', value: ch },
              ]),
            },
          ]);
        }
        return { success: true };
      }

      case 'scroll': {
        const dx = action.dx ?? 0;
        const dy = action.dy ?? 500;
        await bridge.executeScript(sid, `window.scrollBy(${dx}, ${dy})`);
        return { success: true };
      }

      case 'press': {
        const keyMap: Record<string, string> = {
          Enter: '\uE007', Tab: '\uE004', Escape: '\uE00C',
          ArrowDown: '\uE015', ArrowUp: '\uE013', ArrowLeft: '\uE012',
          ArrowRight: '\uE014', Backspace: '\uE003', Delete: '\uE017',
          Space: ' ',
        };
        const keyVal = keyMap[action.key ?? ''] ?? action.key ?? '';
        await bridge.performActions(sid, [
          {
            type: 'key',
            id: 'keyboard',
            actions: [
              { type: 'keyDown', value: keyVal },
              { type: 'keyUp', value: keyVal },
            ],
          },
        ]);
        return { success: true };
      }

      case 'hover': {
        if (action.x !== undefined && action.y !== undefined) {
          await bridge.performActions(sid, [
            {
              type: 'pointer',
              id: 'mouse',
              parameters: { pointerType: 'mouse' },
              actions: [
                { type: 'pointerMove', x: action.x, y: action.y, duration: 200 },
              ],
            },
          ]);
        }
        return { success: true };
      }

      default:
        return { success: false, detail: `Unknown action type: ${action.type}` };
    }
  }

  // ─── JavaScript execution ─────────────────────────────────────────

  async executeScript(id: string, script: string, args: unknown[] = []): Promise<unknown> {
    const { bridge, info } = this.getManaged(id);
    info.lastActivity = Date.now();
    return bridge.executeScript(info.webdriverSessionId, script, args);
  }

  // ─── Element queries ───────────────────────────────────────────────

  async findElements(
    id: string,
    using: 'css selector' | 'xpath' | 'tag name',
    value: string
  ): Promise<Array<{ elementId: string; text: string; rect: { x: number; y: number; width: number; height: number } }>> {
    const { bridge, info } = this.getManaged(id);
    const sid = info.webdriverSessionId;
    info.lastActivity = Date.now();

    const elementIds = await bridge.findElements(sid, using, value);
    const results = await Promise.all(
      elementIds.map(async (eid) => {
        const [text, rect] = await Promise.all([
          bridge.getElementText(sid, eid).catch(() => ''),
          bridge.getElementRect(sid, eid).catch(() => ({ x: 0, y: 0, width: 0, height: 0 })),
        ]);
        return { elementId: eid, text, rect };
      })
    );

    return results;
  }

  // ─── Internals ─────────────────────────────────────────────────────

  private getManaged(id: string): ManagedSession {
    const session = this.sessions.get(id);
    if (!session) throw new SessionNotFoundError(id);
    if (session.info.status !== 'active') {
      throw new Error(`Session ${id} is ${session.info.status}`);
    }
    return session;
  }

  private async resolveAXElementSelector(
    sid: string,
    bridge: WebDriverBridge,
    axId: number
  ): Promise<string | null> {
    // Re-run the walker and find the element with matching ID, return its selector
    const script = buildAXWalkerScript(false);
    const elements = (await bridge.executeScript(sid, script)) as AXElement[];
    const match = elements?.find((e) => e.id === axId);
    return match?.selector ?? null;
  }
}

// ─── Errors ──────────────────────────────────────────────────────────

export class SessionNotFoundError extends Error {
  constructor(id: string) {
    super(`Session not found: ${id}`);
    this.name = 'SessionNotFoundError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

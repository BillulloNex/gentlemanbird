/**
 * WebDriver HTTP Bridge
 *
 * Thin adapter over Ladybird's WebDriver HTTP protocol.
 * Handles session creation, command dispatch, and process lifecycle.
 * Adapted from ladybird-mcp/webdriver_client.ts with multi-session support.
 */

import http from 'http';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface WebDriverSessionInfo {
  sessionId: string;
  capabilities: Record<string, unknown>;
}

export interface ElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class WebDriverBridge {
  private baseUrl: string;
  private port: number;
  private process: ChildProcess | null = null;

  constructor(port: number = 8000) {
    this.port = port;
    this.baseUrl = `http://127.0.0.1:${port}`;
  }

  // ─── HTTP transport ────────────────────────────────────────────────

  async request(method: string, urlPath: string, body?: unknown): Promise<unknown> {
    const url = new URL(urlPath, this.baseUrl);
    const payload = body ? JSON.stringify(body) : null;

    return new Promise((resolve, reject) => {
      const req = http.request(
        url,
        {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(payload ? { 'Content-Length': String(Buffer.byteLength(payload)) } : {}),
          },
          timeout: 30_000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: string) => (data += chunk));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 400) {
              return reject(new WebDriverError(res.statusCode, data));
            }
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(data);
            }
          });
        }
      );

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('WebDriver request timed out'));
      });
      if (payload) req.write(payload);
      req.end();
    });
  }

  // ─── Process lifecycle ─────────────────────────────────────────────

  async isRunning(): Promise<boolean> {
    try {
      const res = await this.request('GET', '/status') as Record<string, unknown>;
      const value = res?.value as Record<string, unknown> | undefined;
      return value?.ready !== undefined || (res as Record<string, unknown>)?.ready !== undefined;
    } catch {
      return false;
    }
  }

  async spawn(headless: boolean = true): Promise<void> {
    if (await this.isRunning()) return;

    const binaryPath = this.findWebDriverBinary();
    if (!binaryPath) {
      throw new Error(
        'Ladybird WebDriver binary not found. Build Ladybird first or set LADYBIRD_WEBDRIVER_PATH.'
      );
    }

    const args = ['-p', String(this.port)];
    if (headless) args.push('--headless');

    console.error(`[gentlemanbird] Spawning WebDriver on port ${this.port} (headless=${headless}): ${binaryPath}`);

    this.process = spawn(binaryPath, args, {
      detached: true,
      stdio: 'ignore',
    });
    this.process.unref();

    // Wait for readiness
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      if (await this.isRunning()) return;
    }

    throw new Error(`WebDriver failed to start on port ${this.port} within 10s`);
  }

  kill(): void {
    if (this.process) {
      try {
        process.kill(-this.process.pid!, 'SIGTERM');
      } catch {
        // Process may have already exited
      }
      this.process = null;
    }
  }

  private findWebDriverBinary(): string | null {
    const envPath = process.env.LADYBIRD_WEBDRIVER_PATH;
    if (envPath && fs.existsSync(envPath)) return envPath;

    const candidates = [
      path.resolve(__dirname, '../../Build/release/bin/Ladybird.app/Contents/MacOS/WebDriver'),
      path.resolve(__dirname, '../../../Build/release/bin/Ladybird.app/Contents/MacOS/WebDriver'),
      path.resolve(__dirname, '../../../../Build/release/bin/Ladybird.app/Contents/MacOS/WebDriver'),
      '/Applications/Ladybird.app/Contents/MacOS/WebDriver',
    ];

    return candidates.find((p) => fs.existsSync(p)) ?? null;
  }

  // ─── Session commands ──────────────────────────────────────────────

  async createSession(capabilities: Record<string, unknown> = {}): Promise<WebDriverSessionInfo> {
    const res = await this.request('POST', '/session', {
      capabilities: { alwaysMatch: capabilities },
    }) as { value?: WebDriverSessionInfo; sessionId?: string };

    const sessionId = res?.value?.sessionId || res?.sessionId;
    if (!sessionId) {
      throw new Error(`Unexpected session response: ${JSON.stringify(res)}`);
    }

    return {
      sessionId,
      capabilities: (res?.value as unknown as Record<string, unknown>) ?? {},
    };
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      await this.request('DELETE', `/session/${sessionId}`);
    } catch {
      // Session may already be closed
    }
  }

  // ─── Navigation ────────────────────────────────────────────────────

  async navigate(sessionId: string, url: string): Promise<void> {
    await this.request('POST', `/session/${sessionId}/url`, { url });
  }

  async getCurrentUrl(sessionId: string): Promise<string> {
    const res = await this.request('GET', `/session/${sessionId}/url`) as { value?: string };
    return res?.value ?? '';
  }

  async getTitle(sessionId: string): Promise<string> {
    const res = await this.request('GET', `/session/${sessionId}/title`) as { value?: string };
    return res?.value ?? '';
  }

  async back(sessionId: string): Promise<void> {
    await this.request('POST', `/session/${sessionId}/back`, {});
  }

  async forward(sessionId: string): Promise<void> {
    await this.request('POST', `/session/${sessionId}/forward`, {});
  }

  async refresh(sessionId: string): Promise<void> {
    await this.request('POST', `/session/${sessionId}/refresh`, {});
  }

  // ─── Screenshots ──────────────────────────────────────────────────

  async takeScreenshot(sessionId: string): Promise<string> {
    const res = await this.request('GET', `/session/${sessionId}/screenshot`) as { value?: string };
    return res?.value ?? '';
  }

  async takeElementScreenshot(sessionId: string, elementId: string): Promise<string> {
    const res = await this.request('GET', `/session/${sessionId}/element/${elementId}/screenshot`) as { value?: string };
    return res?.value ?? '';
  }

  // ─── Element operations ────────────────────────────────────────────

  async findElement(sessionId: string, using: string, value: string): Promise<string> {
    const res = await this.request('POST', `/session/${sessionId}/element`, { using, value }) as { value?: Record<string, string> };
    const elemObj = res?.value ?? {};
    return elemObj['element-6066-11e4-a52e-4f735466cecf'] ?? Object.values(elemObj)[0] ?? '';
  }

  async findElements(sessionId: string, using: string, value: string): Promise<string[]> {
    const res = await this.request('POST', `/session/${sessionId}/elements`, { using, value }) as { value?: Record<string, string>[] };
    const elems = res?.value ?? [];
    return elems.map((e) => e['element-6066-11e4-a52e-4f735466cecf'] ?? Object.values(e)[0] ?? '');
  }

  async getElementRect(sessionId: string, elementId: string): Promise<ElementRect> {
    const res = await this.request('GET', `/session/${sessionId}/element/${elementId}/rect`) as { value?: ElementRect };
    return res?.value ?? { x: 0, y: 0, width: 0, height: 0 };
  }

  async getElementText(sessionId: string, elementId: string): Promise<string> {
    const res = await this.request('GET', `/session/${sessionId}/element/${elementId}/text`) as { value?: string };
    return res?.value ?? '';
  }

  async clickElement(sessionId: string, elementId: string): Promise<void> {
    await this.request('POST', `/session/${sessionId}/element/${elementId}/click`, {});
  }

  async sendKeys(sessionId: string, elementId: string, text: string): Promise<void> {
    await this.request('POST', `/session/${sessionId}/element/${elementId}/value`, {
      text,
      value: text.split(''),
    });
  }

  // ─── Actions ───────────────────────────────────────────────────────

  async performActions(sessionId: string, actions: unknown): Promise<void> {
    await this.request('POST', `/session/${sessionId}/actions`, { actions });
  }

  async releaseActions(sessionId: string): Promise<void> {
    await this.request('DELETE', `/session/${sessionId}/actions`);
  }

  // ─── JavaScript execution ─────────────────────────────────────────

  async executeScript(sessionId: string, script: string, args: unknown[] = []): Promise<unknown> {
    const res = await this.request('POST', `/session/${sessionId}/execute/sync`, {
      script,
      args,
    }) as { value?: unknown };
    return res?.value;
  }

  async executeAsyncScript(sessionId: string, script: string, args: unknown[] = []): Promise<unknown> {
    const res = await this.request('POST', `/session/${sessionId}/execute/async`, {
      script,
      args,
    }) as { value?: unknown };
    return res?.value;
  }

  // ─── Window management ────────────────────────────────────────────

  async getWindowHandles(sessionId: string): Promise<string[]> {
    const res = await this.request('GET', `/session/${sessionId}/window/handles`) as { value?: string[] };
    return res?.value ?? [];
  }

  async setWindowRect(sessionId: string, width: number, height: number): Promise<void> {
    await this.request('POST', `/session/${sessionId}/window/rect`, { width, height });
  }

  // ─── Cookies ───────────────────────────────────────────────────────

  async getAllCookies(sessionId: string): Promise<unknown[]> {
    const res = await this.request('GET', `/session/${sessionId}/cookie`) as { value?: unknown[] };
    return res?.value ?? [];
  }

  async getPageSource(sessionId: string): Promise<string> {
    const res = await this.request('GET', `/session/${sessionId}/source`) as { value?: string };
    return res?.value ?? '';
  }
}

// ─── Error class ─────────────────────────────────────────────────────

export class WebDriverError extends Error {
  public statusCode: number;
  public responseBody: string;

  constructor(statusCode: number, responseBody: string) {
    let message = `WebDriver error ${statusCode}`;
    try {
      const parsed = JSON.parse(responseBody);
      message = parsed?.value?.message ?? message;
    } catch {
      // Use default message
    }
    super(message);
    this.name = 'WebDriverError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

// ─── Utility ─────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

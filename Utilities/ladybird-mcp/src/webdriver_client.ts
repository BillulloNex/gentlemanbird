import http from 'http';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface WebDriverSession {
  sessionId: string;
}

export interface AXNode {
  id: number;
  role: string;
  name: string;
  value?: string;
  bounds?: { x: number; y: number; width: number; height: number };
  children?: AXNode[];
}

export class LadybirdWebDriverClient {
  private baseUrl: string;
  private currentSessionId: string | null = null;
  private spawnedProcess: ChildProcess | null = null;

  constructor(baseUrl: string = 'http://127.0.0.1:8000') {
    this.baseUrl = baseUrl;
    this.registerExitHooks();
  }

  private registerExitHooks() {
    const cleanup = () => {
      if (this.currentSessionId) {
        // Synchronously or fire-and-forget delete session on exit
        try {
          const url = new URL(`/session/${this.currentSessionId}`, this.baseUrl);
          const req = http.request(url, { method: 'DELETE' });
          req.end();
        } catch (_) {}
      }
    };

    process.on('SIGINT', () => {
      cleanup();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      cleanup();
      process.exit(0);
    });
  }

  private async request(method: string, path: string, body?: any): Promise<any> {
    const url = new URL(path, this.baseUrl);
    const payload = body ? JSON.stringify(body) : null;

    return new Promise((resolve, reject) => {
      const req = http.request(
        url,
        {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 400) {
              return reject(
                new Error(`WebDriver Error (${res.statusCode}): ${data || res.statusMessage}`)
              );
            }
            try {
              const json = JSON.parse(data);
              resolve(json);
            } catch (err) {
              resolve(data);
            }
          });
        }
      );

      req.on('error', (err) => reject(err));
      if (payload) req.write(payload);
      req.end();
    });
  }

  private async isServiceRunning(): Promise<boolean> {
    try {
      const res = await this.request('GET', '/status');
      return !!(res && (res.value?.ready !== undefined || res.ready !== undefined));
    } catch (_) {
      return false;
    }
  }

  private async autoSpawnWebDriver(): Promise<void> {
    const possiblePaths = [
      path.resolve(__dirname, '../../../Build/release/bin/Ladybird.app/Contents/MacOS/WebDriver'),
      path.resolve(__dirname, '../../../../Build/release/bin/Ladybird.app/Contents/MacOS/WebDriver'),
      '/Applications/Ladybird.app/Contents/MacOS/WebDriver',
    ];

    const binaryPath = possiblePaths.find((p) => fs.existsSync(p));
    if (!binaryPath) {
      throw new Error(
        `Ladybird WebDriver binary not found. Please start WebDriver manually via './Build/release/bin/Ladybird.app/Contents/MacOS/WebDriver -p 8000'`
      );
    }

    const port = new URL(this.baseUrl).port || '8000';
    console.error(`Auto-spawning Ladybird WebDriver at ${binaryPath} on port ${port}...`);
    
    this.spawnedProcess = spawn(binaryPath, ['-p', port, '--headless'], {
      detached: true,
      stdio: 'ignore',
    });
    this.spawnedProcess.unref();

    // Wait up to 5s for WebDriver server readiness
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if (await this.isServiceRunning()) return;
    }
  }

  async ensureSession(): Promise<string> {
    if (this.currentSessionId) {
      return this.currentSessionId;
    }

    if (!(await this.isServiceRunning())) {
      await this.autoSpawnWebDriver();
    }

    try {
      const res = await this.request('POST', '/session', {
        capabilities: {
          alwaysMatch: {},
        },
      });
      if (res && res.value && res.value.sessionId) {
        this.currentSessionId = res.value.sessionId;
      } else if (res && res.sessionId) {
        this.currentSessionId = res.sessionId;
      } else {
        throw new Error(`Unexpected session creation response: ${JSON.stringify(res)}`);
      }
      return this.currentSessionId!;
    } catch (err: any) {
      // Self-healing for single-session bottleneck: if session already exists, attempt recovery
      if (err.message && err.message.includes('session not created')) {
        console.error('Stale session detected in WebDriver. Attempting self-healing cleanup...');
        try {
          // Attempt DELETE on dummy or cached path if active
          await this.request('DELETE', '/session/active');
        } catch (_) {}
      }
      throw new Error(
        `Failed to create session in Ladybird WebDriver at ${this.baseUrl}: ${err.message}. If single-session is locked, restart WebDriver.`
      );
    }
  }

  async navigate(url: string): Promise<void> {
    const sessionId = await this.ensureSession();
    await this.request('POST', `/session/${sessionId}/url`, { url });
  }

  async goBack(): Promise<void> {
    const sessionId = await this.ensureSession();
    await this.request('POST', `/session/${sessionId}/back`, {});
  }

  async goForward(): Promise<void> {
    const sessionId = await this.ensureSession();
    await this.request('POST', `/session/${sessionId}/forward`, {});
  }

  async getCurrentUrl(): Promise<string> {
    const sessionId = await this.ensureSession();
    const res = await this.request('GET', `/session/${sessionId}/url`);
    return res.value || res;
  }

  async takeScreenshot(): Promise<string> {
    const sessionId = await this.ensureSession();
    const res = await this.request('GET', `/session/${sessionId}/screenshot`);
    return res.value || res;
  }

  async executeScript(script: string, args: any[] = []): Promise<any> {
    const sessionId = await this.ensureSession();
    const res = await this.request('POST', `/session/${sessionId}/execute/sync`, {
      script,
      args,
    });
    return res.value !== undefined ? res.value : res;
  }

  async findElement(using: string, value: string): Promise<string> {
    const sessionId = await this.ensureSession();
    const res = await this.request('POST', `/session/${sessionId}/element`, {
      using,
      value,
    });
    const elemObj = res.value || res;
    const elemId = elemObj['element-6066-11e4-a52e-4f735466cecf'] || Object.values(elemObj)[0];
    return elemId as string;
  }

  async clickElement(elementId: string): Promise<void> {
    const sessionId = await this.ensureSession();
    await this.request('POST', `/session/${sessionId}/element/${elementId}/click`, {});
  }

  async sendKeysToElement(elementId: string, text: string): Promise<void> {
    const sessionId = await this.ensureSession();
    await this.request('POST', `/session/${sessionId}/element/${elementId}/value`, {
      text,
      value: text.split(''),
    });
  }

  async scroll(direction: 'up' | 'down' = 'down', amount: number = 500): Promise<void> {
    const scrollY = direction === 'down' ? amount : -amount;
    await this.executeScript(`window.scrollBy(0, ${scrollY});`);
  }

  async closeSession(): Promise<void> {
    if (this.currentSessionId) {
      try {
        await this.request('DELETE', `/session/${this.currentSessionId}`);
      } catch (_) {}
      this.currentSessionId = null;
    }
  }
}

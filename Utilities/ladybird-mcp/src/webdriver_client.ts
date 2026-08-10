import http from 'http';

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

  constructor(baseUrl: string = 'http://127.0.0.1:8000') {
    this.baseUrl = baseUrl;
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

  async ensureSession(): Promise<string> {
    if (this.currentSessionId) {
      return this.currentSessionId;
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
      throw new Error(`Failed to connect to Ladybird WebDriver at ${this.baseUrl}: ${err.message}`);
    }
  }

  async navigate(url: string): Promise<void> {
    const sessionId = await this.ensureSession();
    await this.request('POST', `/session/${sessionId}/url`, { url });
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

  async closeSession(): Promise<void> {
    if (this.currentSessionId) {
      try {
        await this.request('DELETE', `/session/${this.currentSessionId}`);
      } catch (_) {}
      this.currentSessionId = null;
    }
  }
}

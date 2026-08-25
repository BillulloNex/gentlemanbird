/**
 * Agent REST API
 *
 * HTTP route handlers for the gentlemanbird daemon.
 * All routes are prefixed with /api/v1/.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { SessionManager, SessionNotFoundError } from './session_manager.js';

type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  body: unknown
) => Promise<void>;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

export class AgentAPI {
  private routes: Route[] = [];

  constructor(private manager: SessionManager) {
    this.registerRoutes();
  }

  // ─── Route registration ────────────────────────────────────────────

  private registerRoutes(): void {
    // Sessions
    this.route('POST', '/api/v1/sessions', this.createSession);
    this.route('GET', '/api/v1/sessions', this.listSessions);
    this.route('GET', '/api/v1/sessions/:id', this.getSession);
    this.route('DELETE', '/api/v1/sessions/:id', this.deleteSession);

    // Navigation
    this.route('POST', '/api/v1/sessions/:id/navigate', this.navigate);
    this.route('POST', '/api/v1/sessions/:id/back', this.goBack);
    this.route('POST', '/api/v1/sessions/:id/forward', this.goForward);
    this.route('POST', '/api/v1/sessions/:id/refresh', this.doRefresh);

    // Snapshots
    this.route('GET', '/api/v1/sessions/:id/snapshot', this.getFullSnapshot);
    this.route('GET', '/api/v1/sessions/:id/snapshot/tree', this.getTree);
    this.route('GET', '/api/v1/sessions/:id/snapshot/screenshot', this.getScreenshot);
    this.route('GET', '/api/v1/sessions/:id/snapshot/source', this.getSource);

    // Actions
    this.route('POST', '/api/v1/sessions/:id/action', this.performAction);

    // Elements
    this.route('POST', '/api/v1/sessions/:id/elements', this.findElements);

    // JS execution
    this.route('POST', '/api/v1/sessions/:id/execute', this.executeScript);

    // Health
    this.route('GET', '/health', this.healthCheck);
    this.route('GET', '/api/v1/status', this.status);
  }

  private route(method: string, path: string, handler: RouteHandler): void {
    const paramNames: string[] = [];
    const pattern = path.replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    this.routes.push({
      method,
      pattern: new RegExp(`^${pattern}$`),
      paramNames,
      handler: handler.bind(this),
    });
  }

  // ─── Request dispatch ──────────────────────────────────────────────

  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const method = req.method ?? 'GET';

    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = url.pathname.match(route.pattern);
      if (!match) continue;

      const params: Record<string, string> = {};
      route.paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });

      const body = await readBody(req);

      try {
        await route.handler(req, res, params, body);
      } catch (err) {
        if (err instanceof SessionNotFoundError) {
          sendJSON(res, 404, { error: err.message });
        } else {
          console.error('[gentlemanbird] API error:', err);
          sendJSON(res, 500, { error: (err as Error).message });
        }
      }
      return true;
    }

    return false; // No route matched
  }

  // ─── Route handlers ────────────────────────────────────────────────

  private async createSession(_req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, body: unknown): Promise<void> {
    const opts = body as Record<string, unknown> ?? {};
    const info = await this.manager.createSession({
      headless: (opts.headless as boolean) ?? true,
      viewport: opts.viewport as { width: number; height: number } | undefined,
      capabilities: opts.capabilities as Record<string, unknown> | undefined,
    });
    sendJSON(res, 201, info);
  }

  private async listSessions(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    sendJSON(res, 200, { sessions: this.manager.listSessions() });
  }

  private async getSession(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> {
    sendJSON(res, 200, this.manager.getSession(params.id));
  }

  private async deleteSession(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> {
    await this.manager.destroySession(params.id);
    sendJSON(res, 200, { deleted: true });
  }

  private async navigate(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>, body: unknown): Promise<void> {
    const { url } = body as { url: string };
    if (!url) {
      sendJSON(res, 400, { error: 'url is required' });
      return;
    }
    const result = await this.manager.navigate(params.id, url);
    sendJSON(res, 200, result);
  }

  private async goBack(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> {
    await this.manager.back(params.id);
    sendJSON(res, 200, { success: true });
  }

  private async goForward(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> {
    await this.manager.forward(params.id);
    sendJSON(res, 200, { success: true });
  }

  private async doRefresh(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> {
    await this.manager.refresh(params.id);
    sendJSON(res, 200, { success: true });
  }

  private async getFullSnapshot(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> {
    const [tree, screenshot] = await Promise.all([
      this.manager.getAXTree(params.id),
      this.manager.takeScreenshot(params.id),
    ]);
    sendJSON(res, 200, {
      tree: tree.formatted,
      elementCount: tree.elementCount,
      screenshot,
      url: tree.url,
      title: tree.title,
    });
  }

  private async getTree(req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const visibleOnly = url.searchParams.get('visibleOnly') !== 'false';
    const format = url.searchParams.get('format') ?? 'text';

    const tree = await this.manager.getAXTree(params.id, visibleOnly);

    if (format === 'json') {
      sendJSON(res, 200, tree);
    } else {
      // Send compact text format by default (most token-efficient)
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(`url: ${tree.url}\ntitle: ${tree.title}\nelements: ${tree.elementCount}\n---\n${tree.formatted}`);
    }
  }

  private async getScreenshot(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> {
    const base64 = await this.manager.takeScreenshot(params.id);
    const url = new URL(_req.url ?? '/', `http://${_req.headers.host}`);
    const format = url.searchParams.get('format');

    if (format === 'binary') {
      const buffer = Buffer.from(base64, 'base64');
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': String(buffer.length),
      });
      res.end(buffer);
    } else {
      sendJSON(res, 200, { screenshot: base64 });
    }
  }

  private async getSource(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> {
    const source = await this.manager.getPageSource(params.id);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(source);
  }

  private async performAction(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>, body: unknown): Promise<void> {
    const action = body as Record<string, unknown>;
    if (!action?.type) {
      sendJSON(res, 400, { error: 'action.type is required' });
      return;
    }
    const result = await this.manager.performAction(params.id, action as any);
    sendJSON(res, 200, result);
  }

  private async findElements(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>, body: unknown): Promise<void> {
    const { using, value } = body as { using: string; value: string };
    if (!using || !value) {
      sendJSON(res, 400, { error: 'using and value are required' });
      return;
    }
    const elements = await this.manager.findElements(params.id, using as any, value);
    sendJSON(res, 200, { elements });
  }

  private async executeScript(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>, body: unknown): Promise<void> {
    const { script, args } = body as { script: string; args?: unknown[] };
    if (!script) {
      sendJSON(res, 400, { error: 'script is required' });
      return;
    }
    const result = await this.manager.executeScript(params.id, script, args);
    sendJSON(res, 200, { result });
  }

  private async healthCheck(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    sendJSON(res, 200, { status: 'ok', sessions: this.manager.listSessions().length });
  }

  private async status(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const sessions = this.manager.listSessions();
    sendJSON(res, 200, {
      daemon: 'gentlemanbird',
      version: '0.1.0',
      sessions: sessions.length,
      maxSessions: MAX_SESSIONS_DISPLAY,
      uptime: process.uptime(),
    });
  }
}

const MAX_SESSIONS_DISPLAY = parseInt(process.env.GB_MAX_SESSIONS ?? '5', 10);

// ─── Helpers ─────────────────────────────────────────────────────────

function sendJSON(res: ServerResponse, statusCode: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(body)),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    if (req.method === 'GET' || req.method === 'DELETE') {
      resolve(null);
      return;
    }

    let data = '';
    req.on('data', (chunk: string) => (data += chunk));
    req.on('end', () => {
      if (!data) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(data);
      }
    });
  });
}

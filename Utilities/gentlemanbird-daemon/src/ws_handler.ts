/**
 * WebSocket Handler
 *
 * Bidirectional WebSocket interface for real-time agent communication.
 * Supports the same operations as the REST API but over a persistent connection.
 */

import { WebSocket } from 'ws';
import { SessionManager, SessionNotFoundError, SessionProfile } from './session_manager.js';

interface WSMessage {
  id?: string | number;       // Request ID for correlation
  method: string;             // e.g. "session.create", "navigate", "snapshot.tree"
  params?: Record<string, unknown>;
}

interface WSResponse {
  id?: string | number;
  method: string;
  result?: unknown;
  error?: { message: string; code?: string };
}

export class WSHandler {
  constructor(private manager: SessionManager) {}

  handleConnection(ws: WebSocket): void {
    console.error('[gentlemanbird] WebSocket client connected');

    ws.on('message', async (data: Buffer) => {
      let msg: WSMessage;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        this.send(ws, { method: 'error', error: { message: 'Invalid JSON' } });
        return;
      }

      try {
        const result = await this.dispatch(msg);
        this.send(ws, { id: msg.id, method: msg.method, result });
      } catch (err) {
        const code = err instanceof SessionNotFoundError ? 'SESSION_NOT_FOUND' : 'INTERNAL_ERROR';
        this.send(ws, {
          id: msg.id,
          method: msg.method,
          error: { message: (err as Error).message, code },
        });
      }
    });

    ws.on('close', () => {
      console.error('[gentlemanbird] WebSocket client disconnected');
    });

    ws.on('error', (err) => {
      console.error('[gentlemanbird] WebSocket error:', err.message);
    });

    // Send welcome message
    this.send(ws, {
      method: 'connected',
      result: { daemon: 'gentlemanbird', version: '0.1.0' },
    });
  }

  // ─── Message dispatch ──────────────────────────────────────────────

  private async dispatch(msg: WSMessage): Promise<unknown> {
    const p = msg.params ?? {};

    switch (msg.method) {
      // Session lifecycle
      case 'session.create':
        return this.manager.createSession({
          headless: p.headless as boolean | undefined,
          viewport: p.viewport as { width: number; height: number } | undefined,
          capabilities: p.capabilities as Record<string, unknown> | undefined,
          profile: p.profile as SessionProfile | undefined,
        });

      case 'session.destroy':
        await this.manager.destroySession(p.id as string);
        return { deleted: true };

      case 'session.list':
        return { sessions: this.manager.listSessions() };

      case 'session.get':
        return this.manager.getSession(p.id as string);

      // Navigation
      case 'navigate':
        return this.manager.navigate(p.id as string, p.url as string);

      case 'back':
        await this.manager.back(p.id as string);
        return { success: true };

      case 'forward':
        await this.manager.forward(p.id as string);
        return { success: true };

      case 'refresh':
        await this.manager.refresh(p.id as string);
        return { success: true };

      // Snapshots
      case 'snapshot.tree': {
        const tree = await this.manager.getAXTree(
          p.id as string,
          (p.visibleOnly as boolean) ?? true
        );
        return p.format === 'json' ? tree : {
          tree: tree.formatted,
          elementCount: tree.elementCount,
          url: tree.url,
          title: tree.title,
        };
      }

      case 'snapshot.screenshot':
        return { screenshot: await this.manager.takeScreenshot(p.id as string) };

      case 'snapshot.full': {
        const [tree, screenshot] = await Promise.all([
          this.manager.getAXTree(p.id as string),
          this.manager.takeScreenshot(p.id as string),
        ]);
        return {
          tree: tree.formatted,
          elementCount: tree.elementCount,
          screenshot,
          url: tree.url,
          title: tree.title,
        };
      }

      case 'snapshot.source':
        return { source: await this.manager.getPageSource(p.id as string) };

      // Actions
      case 'action':
        return this.manager.performAction(p.id as string, {
          type: p.type as any,
          x: p.x as number | undefined,
          y: p.y as number | undefined,
          text: p.text as string | undefined,
          key: p.key as string | undefined,
          dx: p.dx as number | undefined,
          dy: p.dy as number | undefined,
          selector: p.selector as string | undefined,
          elementId: p.elementId as number | undefined,
        });

      // Elements
      case 'elements.find':
        return {
          elements: await this.manager.findElements(
            p.id as string,
            p.using as 'css selector' | 'xpath' | 'tag name',
            p.value as string
          ),
        };

      // JS execution
      case 'execute':
        return {
          result: await this.manager.executeScript(
            p.id as string,
            p.script as string,
            p.args as unknown[] | undefined
          ),
        };

      // Status
      case 'status':
        return {
          daemon: 'gentlemanbird',
          version: '0.1.0',
          sessions: this.manager.listSessions().length,
          uptime: process.uptime(),
        };

      default:
        throw new Error(`Unknown method: ${msg.method}`);
    }
  }

  private send(ws: WebSocket, msg: WSResponse): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}

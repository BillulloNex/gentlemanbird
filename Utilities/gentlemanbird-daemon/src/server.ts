/**
 * GentlemanBird Agent Daemon
 *
 * Headless browser automation daemon for AI agents.
 * Wraps Ladybird's WebDriver with WebSocket + REST APIs,
 * multi-session management, and agent-optimized primitives.
 *
 * Usage:
 *   npx tsx src/server.ts                  # Dev mode
 *   GB_PORT=9333 npx tsx src/server.ts     # Custom port
 *
 * Env vars:
 *   GB_PORT               - HTTP/WS listen port (default: 9333)
 *   GB_HOST               - Listen address (default: 0.0.0.0)
 *   GB_MAX_SESSIONS       - Max concurrent sessions (default: 5)
 *   GB_WEBDRIVER_BASE_PORT - First port for WebDriver processes (default: 8100)
 *   LADYBIRD_WEBDRIVER_PATH - Path to WebDriver binary (auto-detected)
 */

import http from 'http';
import { WebSocketServer } from 'ws';
import { SessionManager } from './session_manager.js';
import { AgentAPI } from './agent_api.js';
import { WSHandler } from './ws_handler.js';

const PORT = parseInt(process.env.GB_PORT ?? '9333', 10);
const HOST = process.env.GB_HOST ?? '0.0.0.0';

async function main(): Promise<void> {
  console.error('╔══════════════════════════════════════════════════╗');
  console.error('║       🎩 GentlemanBird Agent Daemon v0.1.0       ║');
  console.error('║   AI-native browser automation for Ladybird      ║');
  console.error('╚══════════════════════════════════════════════════╝');
  console.error('');

  const manager = new SessionManager();
  const api = new AgentAPI(manager);
  const wsHandler = new WSHandler(manager);

  // HTTP server
  const server = http.createServer(async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      });
      res.end();
      return;
    }

    const handled = await api.handleRequest(req, res);
    if (!handled) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found', path: req.url }));
    }
  });

  // WebSocket server (upgrade on /ws)
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    if (url.pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wsHandler.handleConnection(ws);
      });
    } else {
      socket.destroy();
    }
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.error(`\n[gentlemanbird] Received ${signal}, shutting down...`);
    await manager.destroyAll();
    server.close(() => {
      console.error('[gentlemanbird] Server closed');
      process.exit(0);
    });
    // Force exit after 5s
    setTimeout(() => process.exit(1), 5000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Start listening
  server.listen(PORT, HOST, () => {
    console.error(`[gentlemanbird] REST API:    http://${HOST}:${PORT}/api/v1/`);
    console.error(`[gentlemanbird] WebSocket:   ws://${HOST}:${PORT}/ws`);
    console.error(`[gentlemanbird] Health:      http://${HOST}:${PORT}/health`);
    console.error(`[gentlemanbird] Max sessions: ${process.env.GB_MAX_SESSIONS ?? '5'}`);
    console.error('');
    console.error('[gentlemanbird] Ready for agent connections.');
  });
}

main().catch((err) => {
  console.error('[gentlemanbird] Fatal error:', err);
  process.exit(1);
});

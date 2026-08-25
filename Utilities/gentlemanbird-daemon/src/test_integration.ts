/**
 * Integration Test for GentlemanBird Daemon
 *
 * Tests the REST API without a running Ladybird build.
 * Verifies routing, session management, and error handling.
 *
 * Run: npx tsx src/test_integration.ts
 */

import http from 'http';

const BASE = process.env.GB_TEST_URL ?? 'http://localhost:9333';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function request(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  const url = new URL(path, BASE);
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
        timeout: 10_000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode!, data: parsed });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Tests ────────────────────────────────────────────────────────

async function testHealth(): Promise<void> {
  const { status, data } = await request('GET', '/health');
  assert(status === 200, `Expected 200, got ${status}`);
  assert(data.status === 'ok', `Expected status=ok, got ${data.status}`);
}

async function testStatus(): Promise<void> {
  const { status, data } = await request('GET', '/api/v1/status');
  assert(status === 200, `Expected 200, got ${status}`);
  assert(data.daemon === 'gentlemanbird', `Expected daemon=gentlemanbird`);
  assert(data.version === '0.1.0', `Expected version=0.1.0`);
}

async function testListSessionsEmpty(): Promise<void> {
  const { status, data } = await request('GET', '/api/v1/sessions');
  assert(status === 200, `Expected 200, got ${status}`);
  assert(Array.isArray(data.sessions), 'Expected sessions array');
}

async function testNotFoundRoute(): Promise<void> {
  const { status } = await request('GET', '/api/v1/nonexistent');
  assert(status === 404, `Expected 404, got ${status}`);
}

async function testSessionNotFound(): Promise<void> {
  const { status, data } = await request('GET', '/api/v1/sessions/nonexistent-id');
  assert(status === 404, `Expected 404, got ${status}`);
  assert(data.error?.includes('not found'), `Expected 'not found' error, got: ${data.error}`);
}

async function testMissingUrl(): Promise<void> {
  // This will 404 because the session doesn't exist
  const { status } = await request('POST', '/api/v1/sessions/fake-id/navigate', {});
  assert(status === 404 || status === 400, `Expected 404 or 400, got ${status}`);
}

async function testCORSPreflight(): Promise<void> {
  const url = new URL('/api/v1/sessions', BASE);
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'OPTIONS' }, (res) => {
      try {
        assert(res.statusCode === 204, `Expected 204, got ${res.statusCode}`);
        assert(
          res.headers['access-control-allow-origin'] === '*',
          'Expected CORS header'
        );
        resolve();
      } catch (e) {
        reject(e);
      }
      res.resume();
    });
    req.on('error', reject);
    req.end();
  });
}

// ─── Runner ──────────────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function run(): Promise<void> {
  const tests: Array<[string, () => Promise<void>]> = [
    ['Health check', testHealth],
    ['Status endpoint', testStatus],
    ['List sessions (empty)', testListSessionsEmpty],
    ['404 on unknown route', testNotFoundRoute],
    ['404 on unknown session', testSessionNotFound],
    ['Error on missing url', testMissingUrl],
    ['CORS preflight', testCORSPreflight],
  ];

  const results: TestResult[] = [];

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║     GentlemanBird Daemon Integration Tests       ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  for (const [name, fn] of tests) {
    try {
      await fn();
      results.push({ name, passed: true });
      console.log(`  ✅ ${name}`);
    } catch (err) {
      results.push({ name, passed: false, error: (err as Error).message });
      console.log(`  ❌ ${name}: ${(err as Error).message}`);
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'═'.repeat(50)}\n`);

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Test runner error:', err.message);
  console.error('Is the daemon running? Start it with: npx tsx src/server.ts');
  process.exit(1);
});

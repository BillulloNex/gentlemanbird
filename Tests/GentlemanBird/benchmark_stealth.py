#!/usr/bin/env python3
"""
GentlemanBird Anti-Bot Benchmark Test Harness (Task 4.1)

Tests Ladybird's stealth configuration against public fingerprint analysis sites.
Uses the gentlemanbird Python SDK to drive a headless session and extract results.

Targets:
  - bot.sannysoft.com      — comprehensive browser bot check
  - browserleaks.com/webgl — WebGL fingerprint analysis
  - tls.peet.ws/api/all    — TLS/JA4 fingerprint analysis

Usage:
  python3 benchmark_stealth.py [--daemon-url http://localhost:9333]
"""

import sys
import os
import json
import asyncio
import argparse

# Add the SDK to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'SDKs', 'python'))

from gentlemanbird import GentlemanBird


async def run_benchmark(daemon_url: str = 'http://localhost:9333'):
    """Run the full anti-bot benchmark suite."""

    results = {
        'overall': 'pending',
        'tests': {},
    }

    async with GentlemanBird(base_url=daemon_url) as browser:
        session = await browser.new_session(headless=True)
        print(f"✅ Session created: {session.session_id}")

        # ─── Test 1: TLS Fingerprint (tls.peet.ws) ───────────────────

        print("\n🔍 Test 1: TLS Fingerprint Analysis")
        print("   Target: https://tls.peet.ws/api/all")
        try:
            await session.navigate('https://tls.peet.ws/api/all')
            await asyncio.sleep(3)

            source = await session.execute_js('document.body.innerText')
            try:
                tls_data = json.loads(source.get('value', '{}'))
                ja4 = tls_data.get('ja4', 'N/A')
                ja3 = tls_data.get('ja3', 'N/A')
                tls_version = tls_data.get('tls_version', 'N/A')
                cipher_suites = tls_data.get('cipher_suites', [])
                http_version = tls_data.get('http_version', 'N/A')

                results['tests']['tls'] = {
                    'status': 'pass',
                    'ja4': ja4,
                    'ja3': ja3,
                    'tls_version': tls_version,
                    'http_version': http_version,
                    'cipher_suite_count': len(cipher_suites),
                }
                print(f"   ✅ JA4: {ja4}")
                print(f"   ✅ TLS: {tls_version}")
                print(f"   ✅ HTTP: {http_version}")
                print(f"   ✅ Cipher suites: {len(cipher_suites)}")
            except json.JSONDecodeError:
                results['tests']['tls'] = {'status': 'error', 'reason': 'Could not parse TLS response'}
                print("   ⚠️  Could not parse TLS response")
        except Exception as e:
            results['tests']['tls'] = {'status': 'error', 'reason': str(e)}
            print(f"   ❌ Error: {e}")

        # ─── Test 2: Bot Detection (bot.sannysoft.com) ────────────────

        print("\n🔍 Test 2: Bot Detection Analysis")
        print("   Target: https://bot.sannysoft.com/")
        try:
            await session.navigate('https://bot.sannysoft.com/')
            await asyncio.sleep(5)  # Wait for all JS checks to run

            # Extract results via JS
            check_script = """
            (() => {
                const rows = document.querySelectorAll('table tr');
                const checks = {};
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 2) {
                        const name = cells[0].textContent.trim();
                        const value = cells[1].textContent.trim();
                        const passed = cells[1].classList.contains('failed') ? false : true;
                        checks[name] = { value, passed };
                    }
                });
                return JSON.stringify(checks);
            })()
            """
            check_result = await session.execute_js(check_script)
            try:
                checks = json.loads(check_result.get('value', '{}'))
                passed = sum(1 for c in checks.values() if c.get('passed', False))
                total = len(checks)
                results['tests']['bot_detection'] = {
                    'status': 'pass' if passed == total else 'partial',
                    'passed': passed,
                    'total': total,
                    'checks': checks,
                }
                print(f"   {'✅' if passed == total else '⚠️'} {passed}/{total} checks passed")

                # Print failures
                for name, check in checks.items():
                    if not check.get('passed', True):
                        print(f"   ❌ FAILED: {name} = {check.get('value', '?')}")
            except json.JSONDecodeError:
                results['tests']['bot_detection'] = {'status': 'error', 'reason': 'Could not parse check results'}
                print("   ⚠️  Could not parse check results")
        except Exception as e:
            results['tests']['bot_detection'] = {'status': 'error', 'reason': str(e)}
            print(f"   ❌ Error: {e}")

        # ─── Test 3: WebGL Fingerprint ────────────────────────────────

        print("\n🔍 Test 3: WebGL Fingerprint Analysis")
        try:
            webgl_script = """
            (() => {
                const canvas = document.createElement('canvas');
                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                if (!gl) return JSON.stringify({ error: 'WebGL not supported' });

                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                return JSON.stringify({
                    vendor: gl.getParameter(gl.VENDOR),
                    renderer: gl.getParameter(gl.RENDERER),
                    unmaskedVendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'N/A',
                    unmaskedRenderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'N/A',
                    version: gl.getParameter(gl.VERSION),
                });
            })()
            """
            webgl_result = await session.execute_js(webgl_script)
            try:
                webgl = json.loads(webgl_result.get('value', '{}'))
                vendor = webgl.get('vendor', '?')
                renderer = webgl.get('renderer', '?')
                unmasked_vendor = webgl.get('unmaskedVendor', '?')
                unmasked_renderer = webgl.get('unmaskedRenderer', '?')

                # Check if spoofed values match Chrome expectations
                vendor_ok = vendor == 'WebKit'
                renderer_ok = renderer == 'WebKit WebGL'
                angle_ok = 'ANGLE' in unmasked_renderer

                results['tests']['webgl'] = {
                    'status': 'pass' if (vendor_ok and renderer_ok) else 'fail',
                    'vendor': vendor,
                    'renderer': renderer,
                    'unmaskedVendor': unmasked_vendor,
                    'unmaskedRenderer': unmasked_renderer,
                    'vendor_matches_chrome': vendor_ok,
                    'renderer_matches_chrome': renderer_ok,
                    'angle_string_present': angle_ok,
                }
                print(f"   {'✅' if vendor_ok else '❌'} GL_VENDOR: {vendor}")
                print(f"   {'✅' if renderer_ok else '❌'} GL_RENDERER: {renderer}")
                print(f"   {'✅' if angle_ok else '⚠️'} UNMASKED_RENDERER: {unmasked_renderer}")
            except json.JSONDecodeError:
                results['tests']['webgl'] = {'status': 'error', 'reason': 'Could not parse WebGL data'}
                print("   ⚠️  Could not parse WebGL data")
        except Exception as e:
            results['tests']['webgl'] = {'status': 'error', 'reason': str(e)}
            print(f"   ❌ Error: {e}")

        # ─── Test 4: navigator.webdriver ──────────────────────────────

        print("\n🔍 Test 4: navigator.webdriver")
        try:
            wd_result = await session.execute_js('navigator.webdriver')
            wd_value = wd_result.get('value')
            is_hidden = wd_value is False or wd_value is None
            results['tests']['navigator_webdriver'] = {
                'status': 'pass' if is_hidden else 'fail',
                'value': wd_value,
            }
            print(f"   {'✅' if is_hidden else '❌'} navigator.webdriver = {wd_value}")
        except Exception as e:
            results['tests']['navigator_webdriver'] = {'status': 'error', 'reason': str(e)}
            print(f"   ❌ Error: {e}")

        # ─── Test 5: window.chrome ────────────────────────────────────

        print("\n🔍 Test 5: window.chrome object")
        try:
            chrome_script = """
            (() => {
                const c = window.chrome;
                if (!c) return JSON.stringify({ present: false });
                return JSON.stringify({
                    present: true,
                    hasApp: !!c.app,
                    hasRuntime: !!c.runtime,
                    hasLoadTimes: typeof c.loadTimes === 'function',
                    hasCsi: typeof c.csi === 'function',
                });
            })()
            """
            chrome_result = await session.execute_js(chrome_script)
            try:
                chrome = json.loads(chrome_result.get('value', '{}'))
                present = chrome.get('present', False)
                results['tests']['window_chrome'] = {
                    'status': 'pass' if present else 'fail',
                    **chrome,
                }
                if present:
                    print(f"   ✅ window.chrome exists")
                    print(f"   {'✅' if chrome.get('hasApp') else '❌'} chrome.app")
                    print(f"   {'✅' if chrome.get('hasRuntime') else '❌'} chrome.runtime")
                    print(f"   {'✅' if chrome.get('hasLoadTimes') else '❌'} chrome.loadTimes")
                    print(f"   {'✅' if chrome.get('hasCsi') else '❌'} chrome.csi")
                else:
                    print("   ❌ window.chrome not found")
            except json.JSONDecodeError:
                results['tests']['window_chrome'] = {'status': 'error'}
                print("   ⚠️  Could not parse result")
        except Exception as e:
            results['tests']['window_chrome'] = {'status': 'error', 'reason': str(e)}
            print(f"   ❌ Error: {e}")

        # ─── Summary ─────────────────────────────────────────────────

        await session.close()

    # Score
    total = len(results['tests'])
    passed = sum(1 for t in results['tests'].values() if t.get('status') == 'pass')
    results['overall'] = 'pass' if passed == total else f'{passed}/{total}'

    print(f"\n{'='*60}")
    print(f"  BENCHMARK RESULT: {passed}/{total} tests passed")
    print(f"{'='*60}")

    return results


def main():
    parser = argparse.ArgumentParser(description='GentlemanBird Anti-Bot Benchmark')
    parser.add_argument('--daemon-url', default='http://localhost:9333', help='Daemon URL')
    args = parser.parse_args()

    results = asyncio.run(run_benchmark(args.daemon_url))

    # Write JSON report
    report_path = os.path.join(os.path.dirname(__file__), 'benchmark_results.json')
    with open(report_path, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\nFull report: {report_path}")


if __name__ == '__main__':
    main()

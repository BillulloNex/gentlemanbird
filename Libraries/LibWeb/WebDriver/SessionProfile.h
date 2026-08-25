/*
 * Copyright (c) 2026, GentlemanBird Contributors
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

#pragma once

#include <AK/Optional.h>
#include <AK/String.h>
#include <AK/StringView.h>
#include <LibWeb/Export.h>
#include <LibWeb/WebGL/WebGLProfile.h>

namespace Web::WebDriver {

// A coherent fingerprint identity bundle for a WebDriver session.
//
// When automation sessions need to present a consistent browser identity to
// web pages (e.g., for authorized testing against bot-detection systems),
// every fingerprint vector must tell the same story. This struct bundles
// all identity fields into a single object so they stay internally consistent.
//
// Consumed by:
//   - Navigator::webdriver()      — hide_webdriver
//   - Window (window.chrome)      — enable_chrome_object
//   - WebGLRenderingContextImpl   — webgl_* fields
//
// Passed as the `ladybird:profile` WebDriver capability (JSON object) and
// transmitted to WebContent via `set_session_profile` IPC.

struct WEB_API SessionProfile {

    // ── Identity visibility ──────────────────────────────────────────

    // When true, navigator.webdriver reports false even while driven.
    bool hide_webdriver { false };

    // When true, window.chrome is defined with app/runtime/loadTimes/csi.
    // Defaults to true so Chrome-targeted profiles pass the basic check.
    bool enable_chrome_object { true };

    // ── WebGL fingerprint ────────────────────────────────────────────

    // GL_VENDOR — Chrome returns "WebKit" for the masked vendor.
    String webgl_vendor { String::from_utf8_without_validation(WebGL::WebGLProfile::masked_vendor.bytes()) };

    // GL_RENDERER — Chrome returns "WebKit WebGL" for the masked renderer.
    String webgl_renderer { String::from_utf8_without_validation(WebGL::WebGLProfile::masked_renderer.bytes()) };

    // UNMASKED_VENDOR_WEBGL — ANGLE vendor string.
    String webgl_unmasked_vendor { String::from_utf8_without_validation(WebGL::WebGLProfile::unmasked_vendor.bytes()) };

    // UNMASKED_RENDERER_WEBGL — ANGLE renderer string.
    String webgl_unmasked_renderer { String::from_utf8_without_validation(WebGL::WebGLProfile::unmasked_renderer.bytes()) };

    // ── Convenience: is any spoofing active? ─────────────────────────

    // Returns true if any field differs from a "transparent" (no-spoofing) baseline.
    // Used by engine code to decide whether to consult the profile at all.
    bool is_active() const
    {
        return hide_webdriver || enable_chrome_object;
    }
};

} // namespace Web::WebDriver

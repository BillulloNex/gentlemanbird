/*
 * Copyright (c) 2026, GentlemanBird Contributors
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

#pragma once

#include <AK/StringView.h>

namespace Web::WebGL {

// Chrome-aligned WebGL profile for fingerprint coherence.
//
// When fingerprint-matching mode is active, these strings replace the
// host GPU's real vendor/renderer values so that WebGL fingerprint
// checks see strings consistent with a real Chrome-on-macOS session.
//
// The GL_VENDOR/GL_RENDERER (masked) returns "WebKit"/"WebKit WebGL"
// in Chrome (the spec-mandated strings), while the UNMASKED variants
// (via WEBGL_debug_renderer_info) reveal the ANGLE adapter string.
//
// These defaults correspond to Chrome on an Apple M-series Mac.

struct WebGLProfile {

    // GL_VENDOR — Chrome returns "WebKit" for the masked vendor.
    static constexpr auto masked_vendor = "WebKit"sv;

    // GL_RENDERER — Chrome returns "WebKit WebGL" for the masked renderer.
    static constexpr auto masked_renderer = "WebKit WebGL"sv;

    // UNMASKED_VENDOR_WEBGL — ANGLE's vendor string on Chrome/macOS.
    static constexpr auto unmasked_vendor = "Google Inc. (Apple)"sv;

    // UNMASKED_RENDERER_WEBGL — ANGLE's renderer string for Apple M-series.
    // This matches Chrome 136+ on macOS with Metal backend.
    static constexpr auto unmasked_renderer = "ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)"sv;
};

} // namespace Web::WebGL

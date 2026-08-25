/*
 * Copyright (c) 2026, GentlemanBird Contributors
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

#pragma once

namespace RequestServer {

// Chrome-aligned TLS profile for JA4 fingerprint matching.
//
// These cipher suites and elliptic curves replicate Chrome 136+'s TLS
// ClientHello preferences. The ordering matches Chrome's BoringSSL
// configuration so that JA4 fingerprint hashes (which sort extensions
// and cipher suites) produce values indistinguishable from a real
// Chrome browser.
//
// References:
//   - JA4 specification: https://github.com/FoxIO-LLC/ja4
//   - Chrome cipher preferences: chromium/third_party/boringssl/BUILD.generated.gni
//   - TLS fingerprint validation: https://tls.peet.ws/api/all

struct TLSProfile {

    // TLS 1.3 cipher suites in Chrome's preference order.
    // Chrome always offers all three TLS 1.3 AEAD suites.
    static constexpr char const* tls13_ciphers =
        "TLS_AES_128_GCM_SHA256:"
        "TLS_AES_256_GCM_SHA384:"
        "TLS_CHACHA20_POLY1305_SHA256";

    // TLS 1.2 cipher suites in Chrome's preference order.
    // Chrome prioritizes ECDHE key exchange with AEAD ciphers (GCM, ChaCha20).
    // Non-AEAD and non-PFS suites are excluded to match Chrome's modern posture.
    static constexpr char const* tls12_ciphers =
        "ECDHE-ECDSA-AES128-GCM-SHA256:"
        "ECDHE-RSA-AES128-GCM-SHA256:"
        "ECDHE-ECDSA-AES256-GCM-SHA384:"
        "ECDHE-RSA-AES256-GCM-SHA384:"
        "ECDHE-ECDSA-CHACHA20-POLY1305:"
        "ECDHE-RSA-CHACHA20-POLY1305";

    // Elliptic curve preference order matching Chrome.
    // X25519 is Chrome's primary curve, followed by P-256 and P-384.
    static constexpr char const* ec_curves = "X25519:P-256:P-384";
};

} // namespace RequestServer

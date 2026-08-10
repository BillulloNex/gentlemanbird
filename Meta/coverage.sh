#!/usr/bin/env bash
#
# Copyright (c) 2026, the Ladybird developers.
#
# SPDX-License-Identifier: BSD-2-Clause
#
# Build with source-based coverage instrumentation, run the test suite, and report which code the tests actually
# execute.
#
# The point is to replace intuition with a number. The clipboard bug that motivated this sat in code no test had ever
# executed, and nothing surfaced that -- picking test targets by feel is how a whole UI layer stays uncovered. This
# produces a ranked list of untested files so the backlog is enumerable instead of guessed at.
#
# Note this instruments C++ only; the Rust components are not covered.
#
# KNOWN LIMITATION -- read before trusting a number.
#
# Coverage is only valid for code that runs *in-process* in a test binary. Anything executing in a helper process
# (WebContent above all, so most of LibWeb) is missing entirely, because ProcessManager terminates helpers with
# SIGKILL (Libraries/LibWebView/ProcessManager.cpp) and the profile runtime writes its counters from an atexit
# handler that a SIGKILL never reaches.
#
# Measured: a single passing web test that loads a page and computes styles reports 0.0% of CSS/StyleComputer.cpp.
# So treat LibWeb and other WebContent-resident figures as invalid, not as low. LibWebView and the AK/LibGfx style
# unit tests run in-process and their numbers are real.
#
# Fixing this needs continuous profiling (-fprofile-continuous, the %c pattern), which mmaps counters so they survive
# a SIGKILL, or graceful helper shutdown under coverage. Either way it needs another instrumented rebuild.
#
# Usage:
#   Meta/coverage.sh [--build <dir>] [--filter <regex>] [--skip-build] [--skip-tests]
#
# Example (the UI layer this was written for):
#   Meta/coverage.sh --filter 'UI/AppKit|Libraries/LibWebView'

set -euo pipefail

BUILD_DIR=""
FILTER=""
TESTS_REGEX=""
SKIP_BUILD=0
SKIP_TESTS=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --build)      BUILD_DIR="$2"; shift 2 ;;
        --filter)     FILTER="$2"; shift 2 ;;
        --tests)      TESTS_REGEX="$2"; shift 2 ;;
        --skip-build) SKIP_BUILD=1; shift ;;
        --skip-tests) SKIP_TESTS=1; shift ;;
        -h|--help) sed -n '7,21p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "error: unknown argument '$1'" >&2; exit 2 ;;
    esac
done

LADYBIRD_SOURCE_DIR="${LADYBIRD_SOURCE_DIR:-$(git rev-parse --show-toplevel)}"
export LADYBIRD_SOURCE_DIR
export VCPKG_ROOT="${VCPKG_ROOT:-${LADYBIRD_SOURCE_DIR}/Build/vcpkg}"
BUILD_DIR="${BUILD_DIR:-${LADYBIRD_SOURCE_DIR}/Build/coverage}"
PROFILE_DIR="${BUILD_DIR}/profiles"
PROFDATA="${BUILD_DIR}/coverage.profdata"

cd "${LADYBIRD_SOURCE_DIR}"

LLVM_PROFDATA="$(xcrun --find llvm-profdata 2>/dev/null || command -v llvm-profdata)"
LLVM_COV="$(xcrun --find llvm-cov 2>/dev/null || command -v llvm-cov)"
if [[ -z "${LLVM_PROFDATA}" || -z "${LLVM_COV}" ]]; then
    echo "error: llvm-profdata and llvm-cov are required" >&2
    exit 2
fi

if [[ ${SKIP_BUILD} -eq 0 ]]; then
    # Reuse the release tree's vcpkg_installed. Without it, a fresh build directory rebuilds every third-party
    # dependency from source, since this checkout has no vcpkg binary cache.
    echo "==> Configuring instrumented build in ${BUILD_DIR}"
    cmake --preset Release -B "${BUILD_DIR}" \
        -DVCPKG_INSTALLED_DIR="${LADYBIRD_SOURCE_DIR}/Build/release/vcpkg_installed" \
        -DCMAKE_CXX_FLAGS="-fprofile-instr-generate -fcoverage-mapping" \
        -DCMAKE_EXE_LINKER_FLAGS="-fprofile-instr-generate" \
        -DCMAKE_SHARED_LINKER_FLAGS="-fprofile-instr-generate" > /dev/null

    echo "==> Building (this takes a while)"
    cmake --build "${BUILD_DIR}"
fi

if [[ ${SKIP_TESTS} -eq 0 ]]; then
    echo "==> Running the test suite with profiling enabled"
    rm -rf "${PROFILE_DIR}"
    mkdir -p "${PROFILE_DIR}"

    # Use %m, not %p. Ladybird is multi-process and the suite spawns a helper per test, so %p (one file per process)
    # produces a file per process -- and because LibWeb's counter section is large, each is roughly 35MB. A single
    # measured run reached 19GB across 538 processes before the suite had even worked through LibWeb; extrapolated
    # over the full suite that fills a disk.
    #
    # %m instead keys the file on the binary's signature and merges profiles online, bounding the output to roughly
    # one file per instrumented image.
    CTEST_ARGS=(--test-dir "${BUILD_DIR}" -j"$(sysctl -n hw.ncpu)" --output-on-failure)
    [[ -n "${TESTS_REGEX}" ]] && CTEST_ARGS+=(-R "${TESTS_REGEX}")

    LLVM_PROFILE_FILE="${PROFILE_DIR}/%m.profraw" \
        TESTS_ONLY=1 ctest "${CTEST_ARGS[@]}" || \
        echo "warning: some tests failed; coverage below reflects the run as it happened"
fi

shopt -s nullglob
PROFRAWS=("${PROFILE_DIR}"/*.profraw)
if [[ ${#PROFRAWS[@]} -eq 0 ]]; then
    echo "error: no .profraw files in ${PROFILE_DIR}; was the suite run?" >&2
    exit 1
fi

echo "==> Merging ${#PROFRAWS[@]} raw profiles"
# Pass the inputs via a list file rather than argv. The suite spawns a helper process per test, so this can easily be
# thousands of paths -- well past what a command line will take.
PROFRAW_LIST="${BUILD_DIR}/profraw-list.txt"
printf '%s\n' "${PROFRAWS[@]}" > "${PROFRAW_LIST}"
"${LLVM_PROFDATA}" merge -sparse --input-files="${PROFRAW_LIST}" -o "${PROFDATA}"

# Only real Mach-O images. The bin directory also holds helper scripts (test-css-grammar-parser.py, for one), and a
# single unrecognised object makes llvm-cov abort the whole report rather than skip it.
OBJECTS=()
for binary in "${BUILD_DIR}"/bin/Test* "${BUILD_DIR}"/bin/test-* "${BUILD_DIR}"/lib/*.dylib; do
    [[ -f "${binary}" ]] || continue
    file -b "${binary}" | grep -q "Mach-O" || continue
    OBJECTS+=(-object "${binary}")
done
shopt -u nullglob

if [[ ${#OBJECTS[@]} -eq 0 ]]; then
    echo "error: found no instrumented binaries under ${BUILD_DIR}" >&2
    exit 1
fi

echo
echo "==> Coverage report"
REPORT="${BUILD_DIR}/coverage-report.txt"
# Do not swallow stderr here. llvm-cov fails the entire report on a single bad input, and hiding that produces an
# empty file that looks like "nothing matched the filter" rather than "the report never ran".
if ! "${LLVM_COV}" report "${OBJECTS[@]}" -instr-profile="${PROFDATA}" \
        -ignore-filename-regex='(Build/|vcpkg_installed/|/usr/|Tests/)' > "${REPORT}" 2> "${BUILD_DIR}/coverage-report.err"; then
    echo "error: llvm-cov report failed:" >&2
    grep -v "mismatched data" "${BUILD_DIR}/coverage-report.err" | head -10 >&2
    exit 1
fi

if [[ -n "${FILTER}" ]]; then
    head -2 "${REPORT}"
    grep -E "${FILTER}" "${REPORT}" || echo "(no files matched ${FILTER})"
    echo
    echo "Files matching ${FILTER} with 0% region coverage:"
    grep -E "${FILTER}" "${REPORT}" | awk '$NF == "0.00%" || $(NF-1) == "0.00%" { print "  " $1 }' | head -40
else
    tail -5 "${REPORT}"
fi

echo
echo "Full report: ${REPORT}"
echo "Browse a file: ${LLVM_COV} show <object> -instr-profile=${PROFDATA} <source-file>"

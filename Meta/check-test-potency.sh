#!/usr/bin/env bash
#
# Copyright (c) 2026, the Ladybird developers.
#
# SPDX-License-Identifier: BSD-2-Clause
#
# Check that a test actually detects the bug it claims to cover.
#
# A test that passes both before and after a fix proves nothing, and that failure mode is easy to reach by accident --
# especially with --rebaseline, which records whatever the browser currently prints and will happily enshrine a bug as
# the expected output. The only way to know a regression test has any power is to watch it fail without the fix.
#
# This reverts the given source paths to a base revision, rebuilds, and requires the test to FAIL. Then it restores the
# working tree, rebuilds, and requires the test to PASS.
#
# Two ways to reintroduce the bug:
#
#   --revert <path>   Restore source paths to a base revision. Good when the fix is a self-contained change to files
#                     that already existed.
#
#   --patch <file>    Apply a patch that reintroduces the bug, then reverse it. Use this when the fix came with a
#                     refactor -- if the fix moved code into a new file, reverting the path deletes the file the test
#                     links against and the build simply breaks, telling you nothing.
#
# Usage:
#   Meta/check-test-potency.sh --test <ctest-regex> (--revert <path>... [--base <ref>] | --patch <file>) [--build <dir>]
#
# Example (the AppKit clipboard regression test, reintroducing the pointer comparison it covers):
#   Meta/check-test-potency.sh --test '^TestClipboard$' --patch Meta/potency/clipboard-identity-comparison.patch

set -euo pipefail

TEST_REGEX=""
BASE_REF="HEAD~1"
BUILD_DIR=""
PATCH_FILE=""
REVERT_PATHS=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        --test)   TEST_REGEX="$2"; shift 2 ;;
        --revert) REVERT_PATHS+=("$2"); shift 2 ;;
        --patch)  PATCH_FILE="$2"; shift 2 ;;
        --base)   BASE_REF="$2"; shift 2 ;;
        --build)  BUILD_DIR="$2"; shift 2 ;;
        -h|--help) sed -n '8,31p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "error: unknown argument '$1'" >&2; exit 2 ;;
    esac
done

if [[ -z "${TEST_REGEX}" ]]; then
    echo "error: --test is required (see --help)" >&2
    exit 2
fi

if [[ -n "${PATCH_FILE}" && ${#REVERT_PATHS[@]} -gt 0 ]]; then
    echo "error: --patch and --revert are mutually exclusive" >&2
    exit 2
fi

if [[ -z "${PATCH_FILE}" && ${#REVERT_PATHS[@]} -eq 0 ]]; then
    echo "error: one of --patch or --revert is required (see --help)" >&2
    exit 2
fi

LADYBIRD_SOURCE_DIR="${LADYBIRD_SOURCE_DIR:-$(git rev-parse --show-toplevel)}"
export LADYBIRD_SOURCE_DIR
BUILD_DIR="${BUILD_DIR:-${LADYBIRD_SOURCE_DIR}/Build/release}"

cd "${LADYBIRD_SOURCE_DIR}"

if [[ ! -d "${BUILD_DIR}" ]]; then
    echo "error: build directory '${BUILD_DIR}' does not exist; configure and build first" >&2
    exit 2
fi

# Refuse to touch paths with uncommitted work -- restoring them would mean choosing which version to keep, and getting
# that wrong destroys the user's changes. Untracked files matter too, since restoring uses git clean.
if [[ ${#REVERT_PATHS[@]} -gt 0 ]]; then
    for path in "${REVERT_PATHS[@]}"; do
        if ! git diff --quiet -- "${path}" || ! git diff --cached --quiet -- "${path}"; then
            echo "error: '${path}' has uncommitted changes; commit or stash them first" >&2
            exit 2
        fi
        if [[ -n "$(git ls-files --others --exclude-standard -- "${path}")" ]]; then
            echo "error: '${path}' contains untracked files; remove or commit them first" >&2
            exit 2
        fi
    done

    if ! git rev-parse --verify --quiet "${BASE_REF}" >/dev/null; then
        echo "error: '${BASE_REF}' is not a valid revision" >&2
        exit 2
    fi
fi

if [[ -n "${PATCH_FILE}" ]]; then
    if [[ ! -f "${PATCH_FILE}" ]]; then
        echo "error: patch file '${PATCH_FILE}' does not exist" >&2
        exit 2
    fi
    if ! git apply --check "${PATCH_FILE}" 2>/dev/null; then
        echo "error: '${PATCH_FILE}' does not apply cleanly to the working tree" >&2
        echo "       (it should reintroduce the bug, so it must apply on top of the fix)" >&2
        exit 2
    fi
fi

BUG_INTRODUCED=0

restore_working_tree() {
    [[ ${BUG_INTRODUCED} -eq 1 ]] || return 0
    echo
    if [[ -n "${PATCH_FILE}" ]]; then
        echo "==> Reversing ${PATCH_FILE}"
        git apply -R "${PATCH_FILE}"
        RESTORED_PATHS=($(git apply --numstat "${PATCH_FILE}" | awk '{print $3}'))
    else
        echo "==> Restoring ${REVERT_PATHS[*]} to HEAD"
        git checkout HEAD -- "${REVERT_PATHS[@]}"
        # The base revision may have carried files HEAD no longer has; checkout will not remove those.
        git clean -qfd -- "${REVERT_PATHS[@]}"
        RESTORED_PATHS=("${REVERT_PATHS[@]}")
    fi

    # Rebuild, or the build directory is left holding binaries compiled from the bug. Everything then looks fine --
    # clean tree, green CI, ninja reporting nothing to do -- while the app you run still misbehaves.
    #
    # Touch first. Restoring the source can land in the same second as the build that consumed it, and ninja compares
    # mtimes: equal is not newer, so it would consider the stale objects current and skip the rebuild entirely.
    echo "==> Rebuilding so the build directory matches the restored source"
    touch "${RESTORED_PATHS[@]}" 2>/dev/null || true
    if ! cmake --build "${BUILD_DIR}" > /tmp/potency-restore-build.log 2>&1; then
        echo "error: the restore rebuild failed; ${BUILD_DIR} may hold binaries built from the bug." >&2
        echo "       See /tmp/potency-restore-build.log" >&2
    fi
}
trap restore_working_tree EXIT

introduce_bug() {
    BUG_INTRODUCED=1
    if [[ -n "${PATCH_FILE}" ]]; then
        echo "==> Applying ${PATCH_FILE} to reintroduce the bug, and rebuilding"
        git apply "${PATCH_FILE}"
        return
    fi

    echo "==> Reverting ${REVERT_PATHS[*]} to ${BASE_REF} and rebuilding"
    # `git checkout <ref> -- <path>` restores files that existed at <ref> but leaves files added since then in place.
    # Without removing those, a fix that arrived in a new file survives the revert and the test passes -- which reads
    # as "not potent" when the truth is "not actually reverted".
    local added
    added=$(git diff --name-only --diff-filter=A "${BASE_REF}" -- "${REVERT_PATHS[@]}")
    if [[ -n "${added}" ]]; then
        echo "${added}" | while IFS= read -r file; do
            [[ -n "${file}" ]] && rm -f "${file}"
        done
    fi
    git checkout "${BASE_REF}" -- "${REVERT_PATHS[@]}"
}

build() {
    if ! cmake --build "${BUILD_DIR}" > /tmp/potency-build.log 2>&1; then
        echo "error: build failed; see /tmp/potency-build.log" >&2
        tail -20 /tmp/potency-build.log >&2
        exit 1
    fi
}

run_test() {
    TESTS_ONLY=1 ctest --test-dir "${BUILD_DIR}" -R "${TEST_REGEX}" --output-on-failure > /tmp/potency-test.log 2>&1
}

echo "==> Confirming '${TEST_REGEX}' passes at HEAD"
build
if ! run_test; then
    echo
    echo "FAIL: the test does not pass at HEAD. Fix that before checking potency." >&2
    tail -20 /tmp/potency-test.log >&2
    exit 1
fi
echo "    passes"

echo
introduce_bug
build

if [[ -n "${PATCH_FILE}" ]]; then
    BUG_DESCRIPTION="${PATCH_FILE} applied"
else
    BUG_DESCRIPTION="${REVERT_PATHS[*]} reverted to ${BASE_REF}"
fi

echo "==> Confirming '${TEST_REGEX}' now FAILS"
if run_test; then
    echo
    echo "NOT POTENT: '${TEST_REGEX}' still passes with ${BUG_DESCRIPTION}." >&2
    echo "The test does not exercise the change it is supposed to cover." >&2
    exit 1
fi
echo "    fails as expected"

echo
echo "POTENT: '${TEST_REGEX}' passes at HEAD and fails with ${BUG_DESCRIPTION}."

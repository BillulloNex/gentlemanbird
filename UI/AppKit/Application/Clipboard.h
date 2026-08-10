/*
 * Copyright (c) 2026, the Ladybird developers.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

#pragma once

#include <AK/Utf16String.h>
#include <AK/Vector.h>
#include <LibWeb/Clipboard/SystemClipboard.h>

#import <Cocoa/Cocoa.h>

namespace Ladybird {

// These translate between NSPasteboard contents and the web-facing clipboard representations. They take the pasteboard
// as a parameter rather than reaching for [NSPasteboard generalPasteboard] so that tests can drive them against a
// private pasteboard created with [NSPasteboard pasteboardWithUniqueName], exercising the real pasteboard server round
// trip without disturbing the user's clipboard.

Utf16String clipboard_text_from_pasteboard(NSPasteboard*);
Vector<Web::Clipboard::SystemClipboardRepresentation> clipboard_entries_from_pasteboard(NSPasteboard*);
void write_clipboard_item_to_pasteboard(Web::Clipboard::SystemClipboardItem const&, NSPasteboard*);

}

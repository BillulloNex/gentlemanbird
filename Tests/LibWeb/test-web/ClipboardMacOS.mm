/*
 * Copyright (c) 2026, the Ladybird developers.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

#include "Application.h"

#import <Application/Clipboard.h>

#if !__has_feature(objc_arc)
#    error "This project requires ARC"
#endif

namespace TestWeb {

// The base WebView::Application keeps an in-memory clipboard for headless mode, because headless Qt has no
// QApplication to talk to. That fallback is correct for the product, but it means clipboard tests would only ever
// exercise the fake -- the real pasteboard mapping code would go completely untested.
//
// NSPasteboard is usable without a GUI, so on macOS we can point the test runner at a real pasteboard instead. We use
// a private one from [NSPasteboard pasteboardWithUniqueName] so that tests exercise the genuine pasteboard server
// round trip (including the type deserialization that broke plain-text pasting) without clobbering the clipboard of
// whoever is running the tests.
static NSPasteboard* test_pasteboard()
{
    static NSPasteboard* pasteboard = [NSPasteboard pasteboardWithUniqueName];
    return pasteboard;
}

bool Application::supports_clipboard_type(ClipboardType type) const
{
    return type == ClipboardType::Text;
}

Utf16String Application::clipboard_text(ClipboardType) const
{
    return Ladybird::clipboard_text_from_pasteboard(test_pasteboard());
}

void Application::set_clipboard_text(String text, ClipboardType)
{
    insert_clipboard_item({ { { text.to_byte_string(), "text/plain"_string } } });
}

Vector<Web::Clipboard::SystemClipboardRepresentation> Application::clipboard_entries() const
{
    return Ladybird::clipboard_entries_from_pasteboard(test_pasteboard());
}

void Application::insert_clipboard_item(Web::Clipboard::SystemClipboardItem item)
{
    Ladybird::write_clipboard_item_to_pasteboard(item, test_pasteboard());
}

}

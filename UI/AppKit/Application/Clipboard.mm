/*
 * Copyright (c) 2026, the Ladybird developers.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

#include <Utilities/Conversions.h>

#import <Application/Clipboard.h>

#if !__has_feature(objc_arc)
#    error "This project requires ARC"
#endif

namespace Ladybird {

// https://w3c.github.io/clipboard-apis/#os-specific-well-known-format
static Optional<String> mime_type_for_pasteboard_type(NSPasteboardType type)
{
    // NB: The types reported by the pasteboard are deserialized from the pasteboard server, so they are not the same
    //     objects as the NSPasteboardType constants. They must be compared by value, not by identity.
    if ([type isEqualToString:NSPasteboardTypeString])
        return "text/plain"_string;
    if ([type isEqualToString:NSPasteboardTypeHTML])
        return "text/html"_string;
    if ([type isEqualToString:NSPasteboardTypePNG])
        return "image/png"_string;
    return {};
}

static NSPasteboardType pasteboard_type_for_mime_type(StringView mime_type)
{
    if (mime_type == "text/plain"sv)
        return NSPasteboardTypeString;
    if (mime_type == "text/html"sv)
        return NSPasteboardTypeHTML;
    if (mime_type == "image/png"sv)
        return NSPasteboardTypePNG;
    return nil;
}

Utf16String clipboard_text_from_pasteboard(NSPasteboard* paste_board)
{
    if (auto* contents = [paste_board stringForType:NSPasteboardTypeString])
        return ns_string_to_utf16_string(contents);
    return {};
}

Vector<Web::Clipboard::SystemClipboardRepresentation> clipboard_entries_from_pasteboard(NSPasteboard* paste_board)
{
    Vector<Web::Clipboard::SystemClipboardRepresentation> representations;

    for (NSPasteboardType type : [paste_board types]) {
        auto mime_type = mime_type_for_pasteboard_type(type);
        if (!mime_type.has_value())
            continue;

        auto* contents = [paste_board dataForType:type];
        if (contents == nil)
            continue;

        representations.empend(ns_data_to_string(contents), mime_type.release_value());
    }

    return representations;
}

void write_clipboard_item_to_pasteboard(Web::Clipboard::SystemClipboardItem const& item, NSPasteboard* paste_board)
{
    [paste_board clearContents];

    for (auto const& entry : item.system_clipboard_representations) {
        auto pasteboard_type = pasteboard_type_for_mime_type(entry.mime_type);
        if (pasteboard_type == nil)
            continue;

        [paste_board setData:string_to_ns_data(entry.data)
                     forType:pasteboard_type];
    }
}

}

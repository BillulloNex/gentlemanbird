/*
 * Copyright (c) 2026, the Ladybird developers.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

#include <LibTest/TestCase.h>

#include <LibCore/Process.h>
#include <Utilities/Conversions.h>

#import <Application/Clipboard.h>

#include <mach-o/dyld.h>

#if !__has_feature(objc_arc)
#    error "This project requires ARC"
#endif

// NSPasteboard hands back the very same NSString objects that the writing process passed in, so a test that seeds a
// pasteboard itself would end up comparing the global NSPasteboardType constants against themselves -- and would pass
// even with a broken comparison. Only reading types written by a *different* process forces AppKit to reconstruct
// them, which is the situation a real paste is in: the user copied from another application.
//
// So the plain-text test below re-execs this test binary in a "writer" mode to populate the pasteboard from outside
// this process. The pasteboard name is handed over through the environment, which the child inherits.
static constexpr char const* WRITER_PASTEBOARD_VARIABLE = "LADYBIRD_TEST_CLIPBOARD_WRITER_PASTEBOARD";

static ErrorOr<ByteString> current_executable_path()
{
    u32 length = 0;
    _NSGetExecutablePath(nullptr, &length);

    Vector<char> buffer;
    TRY(buffer.try_resize(length));

    if (_NSGetExecutablePath(buffer.data(), &length) != 0)
        return Error::from_string_literal("Unable to determine the path to the test binary");

    return ByteString { buffer.data() };
}

static ErrorOr<void> seed_pasteboard_from_another_process(NSPasteboard* paste_board)
{
    auto executable = TRY(current_executable_path());
    auto pasteboard_name = Ladybird::ns_string_to_byte_string([paste_board name]);

    if (::setenv(WRITER_PASTEBOARD_VARIABLE, pasteboard_name.characters(), 1) != 0)
        return Error::from_errno(errno);
    ScopeGuard unset_writer_variable { [] { ::unsetenv(WRITER_PASTEBOARD_VARIABLE); } };

    Vector<ByteString> arguments;
    Core::ProcessSpawnOptions options {
        .executable = executable,
        .arguments = arguments,
    };

    auto process = TRY(Core::Process::spawn(options));
    auto exit_code = TRY(process.wait_for_termination());

    if (exit_code != 0)
        return Error::from_string_literal("The clipboard writer process did not exit cleanly");

    return {};
}

TEST_CASE(plain_text_written_by_another_process_is_read_as_text_plain)
{
    @autoreleasepool {
        auto* paste_board = [NSPasteboard pasteboardWithUniqueName];
        MUST(seed_pasteboard_from_another_process(paste_board));

        auto representations = Ladybird::clipboard_entries_from_pasteboard(paste_board);

        // Regression test: this previously compared NSPasteboardType values by pointer identity. Types written by
        // another process come back as distinct NSString objects, so the comparison failed, no representation was
        // produced, and pasting silently did nothing.
        auto plain_text = representations.first_matching([](auto const& representation) {
            return representation.mime_type == "text/plain"sv;
        });

        EXPECT(plain_text.has_value());
        if (!plain_text.has_value())
            return;

        EXPECT_EQ(plain_text->data, "PASTED"sv);
    }
}

TEST_CASE(unknown_pasteboard_types_are_ignored)
{
    @autoreleasepool {
        auto* paste_board = [NSPasteboard pasteboardWithUniqueName];
        [paste_board clearContents];
        [paste_board setData:[@"nope" dataUsingEncoding:NSUTF8StringEncoding]
                     forType:NSPasteboardTypeTabularText];

        auto representations = Ladybird::clipboard_entries_from_pasteboard(paste_board);
        EXPECT(representations.is_empty());
    }
}

TEST_CASE(round_trip_through_the_pasteboard_preserves_representations)
{
    @autoreleasepool {
        auto* paste_board = [NSPasteboard pasteboardWithUniqueName];

        Web::Clipboard::SystemClipboardItem item {
            .system_clipboard_representations = {
                { "plain", "text/plain"_string },
                { "<b>rich</b>", "text/html"_string },
            },
        };
        Ladybird::write_clipboard_item_to_pasteboard(item, paste_board);

        auto representations = Ladybird::clipboard_entries_from_pasteboard(paste_board);
        EXPECT_EQ(representations.size(), 2u);

        auto html = representations.first_matching([](auto const& representation) {
            return representation.mime_type == "text/html"sv;
        });
        EXPECT(html.has_value());
        if (html.has_value())
            EXPECT_EQ(html->data, "<b>rich</b>"sv);

        EXPECT_EQ(Ladybird::clipboard_text_from_pasteboard(paste_board), "plain"_utf16);
    }
}

// LibTest supplies main(), so the writer mode is dispatched from a static initializer that runs before it.
struct WriterMode {
    WriterMode()
    {
        auto const* pasteboard_name = ::getenv(WRITER_PASTEBOARD_VARIABLE);
        if (pasteboard_name == nullptr)
            return;

        @autoreleasepool {
            auto* paste_board = [NSPasteboard pasteboardWithName:Ladybird::string_to_ns_string({ pasteboard_name, strlen(pasteboard_name) })];
            [paste_board clearContents];
            [paste_board setData:[@"PASTED" dataUsingEncoding:NSUTF8StringEncoding]
                         forType:NSPasteboardTypeString];
        }

        exit(0);
    }
};
static WriterMode s_writer_mode;

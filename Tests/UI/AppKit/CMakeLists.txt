if (NOT APPLE)
    return()
endif()

ladybird_test("TestClipboard.mm" UI/AppKit LIBS LibGfx LibWeb)

# Compile the clipboard translation unit directly rather than linking ladybird_impl, which would pull in Metal,
# QuartzCore and the rest of the UI for three functions.
target_sources(TestClipboard PRIVATE
    "${LADYBIRD_SOURCE_DIR}/UI/AppKit/Application/Clipboard.mm"
    "${LADYBIRD_SOURCE_DIR}/UI/AppKit/Utilities/Conversions.mm"
)
target_include_directories(TestClipboard PRIVATE "${LADYBIRD_SOURCE_DIR}/UI/AppKit")
target_compile_options(TestClipboard PRIVATE $<$<COMPILE_LANGUAGE:CXX>:-fobjc-arc>)
target_link_libraries(TestClipboard PRIVATE "-framework Cocoa")

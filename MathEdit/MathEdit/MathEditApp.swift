import SwiftUI

@main
struct MathEditApp: App {
    init() {
        // Initialize RenderService early so MathJax starts loading
        _ = RenderService.shared

        // Prefer tabs over new windows
        NSWindow.allowsAutomaticWindowTabbing = true
    }

    var body: some Scene {
        DocumentGroup(newDocument: { MathEditDocument() }) { file in
            ContentView(document: file.document)
        }
        .commands {
            // Adds View > Toggle Sidebar (⌥⌘S)
            SidebarCommands()

            CommandGroup(after: .newItem) {
                Button("Add Equation") {
                    NotificationCenter.default.post(
                        name: .addEquation,
                        object: nil
                    )
                }
                .keyboardShortcut(";", modifiers: [.command])
            }

            CommandGroup(after: .pasteboard) {
                Button("Copy SVG") {
                    NotificationCenter.default.post(
                        name: .copyEquationSVG,
                        object: nil
                    )
                }
                .keyboardShortcut("c", modifiers: [.command, .shift])
            }

            CommandGroup(after: .importExport) {
                Menu("Export") {
                    Button("Export SVG...") {
                        NotificationCenter.default.post(
                            name: .exportEquationSVG,
                            object: nil
                        )
                    }
                    .keyboardShortcut("e", modifiers: [.command, .shift])

                    Button("Export All SVGs...") {
                        NotificationCenter.default.post(
                            name: .exportAllSVGs,
                            object: nil
                        )
                    }
                    .keyboardShortcut("e", modifiers: [.command, .option, .shift])
                }
            }

            CommandGroup(after: .toolbar) {
                Button("Toggle Tab Bar") {
                    NSApp.keyWindow?.toggleTabBar(nil)
                }
                .keyboardShortcut("t", modifiers: [.command, .shift])

                Divider()

                Button("Increase Editor Font Size") {
                    let currentSize = UserDefaults.standard.integer(forKey: "editorFontSize")
                    let newSize = min((currentSize == 0 ? 14 : currentSize) + 1, 24)
                    UserDefaults.standard.set(newSize, forKey: "editorFontSize")
                }
                .keyboardShortcut("+", modifiers: [.command])

                Button("Decrease Editor Font Size") {
                    let currentSize = UserDefaults.standard.integer(forKey: "editorFontSize")
                    let newSize = max((currentSize == 0 ? 14 : currentSize) - 1, 10)
                    UserDefaults.standard.set(newSize, forKey: "editorFontSize")
                }
                .keyboardShortcut("-", modifiers: [.command])
            }
        }

        #if os(macOS)
        Settings {
            SettingsView()
        }
        #endif
    }
}

// MARK: - Notification Names
extension Notification.Name {
    static let addEquation = Notification.Name("addEquation")
    static let exportEquationSVG = Notification.Name("exportEquationSVG")
    static let exportAllSVGs = Notification.Name("exportAllSVGs")
    static let copyEquationSVG = Notification.Name("copyEquationSVG")
    static let documentImported = Notification.Name("documentImported")
    static let importSvgFromWeb = Notification.Name("importSvgFromWeb")
}

// MARK: - Settings View
struct SettingsView: View {
    var body: some View {
        TabView {
            GeneralSettingsView()
                .tabItem {
                    Label("General", systemImage: "gear")
                }

            EditorSettingsView()
                .tabItem {
                    Label("Editor", systemImage: "pencil")
                }
        }
        .frame(width: 450, height: 250)
    }
}

struct GeneralSettingsView: View {
    @AppStorage("defaultDisplayMode") private var defaultDisplayMode = "block"
    @AppStorage("showEquationInSidebar") private var showEquationInSidebar = false

    var body: some View {
        Form {
            Picker("Default Display Mode", selection: $defaultDisplayMode) {
                Text("Block").tag("block")
                Text("Inline").tag("inline")
            }

            Toggle("Show Equation in Sidebar", isOn: $showEquationInSidebar)
        }
        .padding()
    }
}

struct EditorSettingsView: View {
    @AppStorage("editorFontSize") private var fontSize = 14

    var body: some View {
        Form {
            Stepper("Font Size: \(fontSize)", value: $fontSize, in: 10...24)
        }
        .padding()
    }
}

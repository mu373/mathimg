import SwiftUI
import Sparkle

@main
struct MathEditApp: App {
    @StateObject private var updaterController = UpdaterController()
    @Environment(\.openWindow) private var openWindow

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

            CommandGroup(replacing: .appInfo) {
                Button("About MathEdit") {
                    openWindow(id: "about")
                }
            }

            CommandGroup(after: .appInfo) {
                Button("Check for Updates...") {
                    updaterController.checkForUpdates()
                }
                .disabled(!updaterController.canCheckForUpdates)
            }

            CommandGroup(after: .newItem) {
                Button("Add Equation") {
                    NotificationCenter.default.post(
                        name: .addEquation,
                        object: nil
                    )
                }
                .keyboardShortcut(";", modifiers: [.command])

                Divider()

                Button("Previous Equation") {
                    NotificationCenter.default.post(
                        name: .previousEquation,
                        object: nil
                    )
                }
                .keyboardShortcut(.upArrow, modifiers: [.option])

                Button("Next Equation") {
                    NotificationCenter.default.post(
                        name: .nextEquation,
                        object: nil
                    )
                }
                .keyboardShortcut(.downArrow, modifiers: [.option])
            }

            CommandGroup(after: .pasteboard) {
                Button("Copy SVG") {
                    NotificationCenter.default.post(
                        name: .copyEquationSVG,
                        object: nil
                    )
                }
                .keyboardShortcut("c", modifiers: [.command, .shift])

                Button("Copy PNG") {
                    NotificationCenter.default.post(
                        name: .copyEquationPNG,
                        object: nil
                    )
                }
                .keyboardShortcut("c", modifiers: [.command, .option])

                Button("Copy LaTeX") {
                    NotificationCenter.default.post(
                        name: .copyEquationLaTeX,
                        object: nil
                    )
                }
                .keyboardShortcut("c", modifiers: [.command, .option, .shift])

                Divider()

                Button("Paste SVG") {
                    NotificationCenter.default.post(
                        name: .pasteSVG,
                        object: nil
                    )
                }
                .keyboardShortcut("v", modifiers: [.command, .shift])

                Divider()

                Button("Delete Equation") {
                    NotificationCenter.default.post(
                        name: .deleteEquation,
                        object: nil
                    )
                }
                .keyboardShortcut(.delete, modifiers: [.command, .shift])
            }

            CommandGroup(after: .importExport) {
                Menu("Export") {
                    Button("Export SVG…") {
                        NotificationCenter.default.post(
                            name: .exportEquationSVG,
                            object: nil
                        )
                    }
                    .keyboardShortcut("e", modifiers: [.command, .shift])

                    Button("Export PNG…") {
                        NotificationCenter.default.post(
                            name: .exportEquationPNG,
                            object: nil
                        )
                    }

                    Divider()

                    Button("Export All SVGs…") {
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
            SettingsView(updaterController: updaterController)
        }

        Window("About MathEdit", id: "about") {
            AboutView()
        }
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentSize)
        .commandsRemoved()

        Window("Acknowledgements", id: "acknowledgements") {
            AcknowledgementsView()
        }
        .windowResizability(.contentSize)
        .commandsRemoved()
        #endif
    }
}

// MARK: - Notification Names
extension Notification.Name {
    static let addEquation = Notification.Name("addEquation")
    static let deleteEquation = Notification.Name("deleteEquation")
    static let previousEquation = Notification.Name("previousEquation")
    static let nextEquation = Notification.Name("nextEquation")
    static let moveCursorToLine = Notification.Name("moveCursorToLine")
    static let exportEquationSVG = Notification.Name("exportEquationSVG")
    static let exportEquationPNG = Notification.Name("exportEquationPNG")
    static let exportAllSVGs = Notification.Name("exportAllSVGs")
    static let copyEquationSVG = Notification.Name("copyEquationSVG")
    static let copyEquationPNG = Notification.Name("copyEquationPNG")
    static let copyEquationLaTeX = Notification.Name("copyEquationLaTeX")
    static let pasteSVG = Notification.Name("pasteSVG")
    static let documentImported = Notification.Name("documentImported")
    static let importSvgFromWeb = Notification.Name("importSvgFromWeb")
}

// MARK: - Settings View
struct SettingsView: View {
    @ObservedObject var updaterController: UpdaterController

    var body: some View {
        TabView {
            GeneralSettingsView(updaterController: updaterController)
                .tabItem {
                    Label("General", systemImage: "gear")
                }

            EditorSettingsView()
                .tabItem {
                    Label("Editor", systemImage: "pencil")
                }
        }
        .frame(width: 400, height: 200)
    }
}

struct GeneralSettingsView: View {
    @ObservedObject var updaterController: UpdaterController
    @AppStorage("defaultDisplayMode") private var defaultDisplayMode = "block"
    @AppStorage("showEquationInSidebar") private var showEquationInSidebar = false

    var body: some View {
        Form {
            Picker("Default Display Mode", selection: $defaultDisplayMode) {
                Text("Block").tag("block")
                Text("Inline").tag("inline")
            }
            Toggle("Show Equation in Sidebar", isOn: $showEquationInSidebar)
            Toggle("Automatically Check for Updates", isOn: Binding(
                get: { updaterController.automaticallyChecksForUpdates },
                set: { updaterController.automaticallyChecksForUpdates = $0 }
            ))
        }
        .formStyle(.grouped)
    }
}

struct EditorSettingsView: View {
    @AppStorage("editorFontSize") private var fontSize = 14

    var body: some View {
        Form {
            LabeledContent("Font Size") {
                HStack(spacing: 8) {
                    Text("\(fontSize)pt")
                        .monospacedDigit()
                    Stepper("", value: $fontSize, in: 10...24)
                        .labelsHidden()
                }
            }
        }
        .formStyle(.grouped)
    }
}

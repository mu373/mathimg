import SwiftUI
import WebKit

/// Custom WKWebView that enables standard Edit menu items
class EditableWebView: WKWebView {
    override func validateUserInterfaceItem(_ item: NSValidatedUserInterfaceItem) -> Bool {
        switch item.action {
        case #selector(NSText.copy(_:)),
             #selector(NSText.cut(_:)),
             #selector(NSText.paste(_:)),
             #selector(NSText.selectAll(_:)):
            return true
        default:
            return super.validateUserInterfaceItem(item)
        }
    }
}

struct EditorWebView: NSViewRepresentable {
    @ObservedObject var document: MathEditDocument
    @Binding var selectedEquationId: String?
    @Binding var cursorLine: Int?

    func makeNSView(context: Context) -> EditableWebView {
        let config = WKWebViewConfiguration()

        // Setup message handlers
        let contentController = config.userContentController
        contentController.add(context.coordinator, name: "documentChanged")
        contentController.add(context.coordinator, name: "equationSelected")
        contentController.add(context.coordinator, name: "cursorPositionChanged")
        contentController.add(context.coordinator, name: "requestRender")
        contentController.add(context.coordinator, name: "ready")

        // Allow local file access
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")

        let webView = EditableWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator

        #if DEBUG
        // Enable developer tools in debug builds
        webView.configuration.preferences.setValue(true, forKey: "developerExtrasEnabled")
        #endif

        // Load the bundled web app
        if let htmlURL = Bundle.main.url(forResource: "index", withExtension: "html") {
            webView.loadFileURL(htmlURL, allowingReadAccessTo: Bundle.main.resourceURL!)
        } else {
            // Fallback: show error message
            webView.loadHTMLString("""
                <html>
                <body style="font-family: system-ui; padding: 20px;">
                    <h2>Web assets not found</h2>
                    <p>Please build the web package and copy dist/ to Resources/web/</p>
                </body>
                </html>
            """, baseURL: nil)
        }

        context.coordinator.webView = webView
        return webView
    }

    func updateNSView(_ webView: EditableWebView, context: Context) {
        // Handle selection changes from native sidebar
        if let id = selectedEquationId, id != context.coordinator.lastSelectedId {
            context.coordinator.lastSelectedId = id
            let js = "window.nativeAPI?.setActiveEquation({ equationId: '\(id)' })"
            webView.evaluateJavaScript(js)
        }

        // Sync document changes from Swift to web (e.g., Add Equation)
        context.coordinator.syncDocumentToWeb()
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var parent: EditorWebView
        weak var webView: WKWebView?
        var lastSelectedId: String?
        var lastDocumentContent: String?
        var isReady = false
        private var addEquationObserver: NSObjectProtocol?

        init(_ parent: EditorWebView) {
            self.parent = parent
            super.init()

            // Listen for addEquation notification
            addEquationObserver = NotificationCenter.default.addObserver(
                forName: .addEquation,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.addEquation()
            }
        }

        deinit {
            if let observer = addEquationObserver {
                NotificationCenter.default.removeObserver(observer)
            }
        }

        func addEquation() {
            guard isReady, let webView = webView else { return }
            webView.evaluateJavaScript("window.nativeAPI?.addEquation()")
        }

        func syncDocumentToWeb() {
            guard isReady, let webView = webView else { return }

            let content = parent.document.projectData.document

            // Only sync if content changed from outside (e.g., Add Equation)
            guard content != lastDocumentContent else { return }
            lastDocumentContent = content

            let escapedContent = content
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
                .replacingOccurrences(of: "\n", with: "\\n")

            let js = "window.nativeAPI?.updateDocument?.('\(escapedContent)') || (function() { const store = window.useEditorStore?.getState(); if (store) { store.editorInstance?.setValue('\(escapedContent)'); } })()"
            webView.evaluateJavaScript(js)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            // Web view loaded
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            switch message.name {
            case "ready":
                isReady = true
                // Track initial content
                lastDocumentContent = parent.document.projectData.document
                // Send initial document to web
                sendDocumentToWeb()

            case "documentChanged":
                if let body = message.body as? [String: Any],
                   let document = body["document"] as? String {
                    // Track content to avoid sync loop
                    lastDocumentContent = document
                    parent.document.updateDocument(document)

                    // Parse equations from the message
                    if let equationsData = body["equations"] as? [[String: Any]] {
                        let equations = equationsData.compactMap { parseEquation($0) }
                        let frontmatter = parseFrontmatter(body["frontmatter"] as? [String: Any])
                        parent.document.updateEquations(equations, frontmatter: frontmatter)
                    }
                }

            case "equationSelected":
                if let body = message.body as? [String: Any],
                   let equationId = body["equationId"] as? String {
                    DispatchQueue.main.async {
                        self.lastSelectedId = equationId
                        self.parent.selectedEquationId = equationId
                    }
                }

            case "cursorPositionChanged":
                if let body = message.body as? [String: Any],
                   let line = body["line"] as? Int {
                    DispatchQueue.main.async {
                        // Only update cursor line - selection is handled separately by clicks
                        self.parent.cursorLine = line
                    }
                }

            case "requestRender":
                // Handle render request - for now, use RenderService
                if let body = message.body as? [String: Any],
                   let equationsData = body["equations"] as? [[String: Any]] {
                    let equations = equationsData.compactMap { parseEquation($0) }
                    RenderService.shared.render(equations: equations, document: parent.document)
                }

            default:
                break
            }
        }

        private func sendDocumentToWeb() {
            guard isReady, let webView = webView else { return }

            let document = parent.document.projectData.document
            let preamble = parent.document.projectData.globalPreamble ?? ""

            // Escape for JavaScript
            let escapedDocument = document
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
                .replacingOccurrences(of: "\n", with: "\\n")

            let escapedPreamble = preamble
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
                .replacingOccurrences(of: "\n", with: "\\n")

            let js = """
            window.nativeAPI?.loadDocument({
                document: '\(escapedDocument)',
                globalPreamble: '\(escapedPreamble)'
            })
            """

            webView.evaluateJavaScript(js)
        }

        private func parseEquation(_ dict: [String: Any]) -> Equation? {
            guard let id = dict["id"] as? String,
                  let label = dict["label"] as? String,
                  let latex = dict["latex"] as? String,
                  let startLine = dict["startLine"] as? Int,
                  let endLine = dict["endLine"] as? Int else {
                return nil
            }

            return Equation(
                id: id,
                label: label,
                latex: latex,
                startLine: startLine,
                endLine: endLine,
                color: dict["color"] as? String
            )
        }

        private func parseFrontmatter(_ dict: [String: Any]?) -> DocumentFrontmatter {
            guard let dict = dict else { return DocumentFrontmatter() }
            return DocumentFrontmatter(
                color: dict["color"] as? String,
                colorPresets: dict["colorPresets"] as? [String: String]
            )
        }
    }
}

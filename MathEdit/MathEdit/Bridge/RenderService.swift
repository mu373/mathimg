import Foundation
import WebKit

/// Service that renders LaTeX to SVG using a hidden WKWebView
/// This uses the same MathJax renderer as the web package
final class RenderService: NSObject {
    static let shared = RenderService()

    private var webView: WKWebView?
    private var isReady = false
    private var pendingRenders: [(equations: [Equation], document: MathEditDocument)] = []

    private override init() {
        super.init()
        setupWebView()
    }

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        let contentController = config.userContentController
        contentController.add(self, name: "renderComplete")
        contentController.add(self, name: "rendererReady")

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self

        // Load the renderer HTML
        let html = """
        <!DOCTYPE html>
        <html>
        <head>
            <script>
            // MathJax config MUST be set before loading MathJax
            window.MathJax = {
                startup: {
                    ready: () => {
                        MathJax.startup.defaultReady();
                        window.webkit.messageHandlers.rendererReady.postMessage({});
                    }
                },
                loader: {
                    load: ['[tex]/color', '[tex]/ams', '[tex]/newcommand', '[tex]/configmacros']
                },
                tex: {
                    packages: {'[+]': ['color', 'ams', 'newcommand', 'configmacros']}
                },
                svg: {
                    fontCache: 'none'
                }
            };
            </script>
            <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg-full.js"></script>
            <script>

            async function renderEquation(id, latex, displayMode) {
                try {
                    const node = await MathJax.tex2svgPromise(latex, {
                        display: displayMode === 'block'
                    });
                    // Get the actual SVG element, not the wrapper
                    const svgElement = node.querySelector('svg');
                    if (!svgElement) throw new Error('No SVG generated');
                    const svg = svgElement.outerHTML;
                    window.webkit.messageHandlers.renderComplete.postMessage({
                        id: id,
                        svg: svg,
                        success: true
                    });
                } catch (error) {
                    window.webkit.messageHandlers.renderComplete.postMessage({
                        id: id,
                        error: error.message,
                        success: false
                    });
                }
            }

            function renderAll(equations) {
                // Use non-async wrapper to avoid Promise return
                (async () => {
                    for (const eq of equations) {
                        await renderEquation(eq.id, eq.latex, eq.displayMode || 'block');
                    }
                })();
            }
            </script>
        </head>
        <body></body>
        </html>
        """

        webView.loadHTMLString(html, baseURL: nil)
        self.webView = webView
    }

    func render(equations: [Equation], document: MathEditDocument) {
        if isReady {
            doRender(equations: equations, document: document)
        } else {
            pendingRenders.append((equations, document))
        }
    }

    private func doRender(equations: [Equation], document: MathEditDocument) {
        guard let webView = webView else { return }

        let equationsJSON = equations.map { eq -> [String: Any] in
            // Strip \label{...} from LaTeX as MathJax doesn't understand it
            let cleanLatex = eq.latex.replacingOccurrences(
                of: "\\\\label\\{[^}]*\\}",
                with: "",
                options: .regularExpression
            ).trimmingCharacters(in: .whitespacesAndNewlines)

            return [
                "id": eq.id,
                "latex": cleanLatex,
                "displayMode": "block"
            ]
        }

        guard let jsonData = try? JSONSerialization.data(withJSONObject: equationsJSON),
              let jsonString = String(data: jsonData, encoding: .utf8) else {
            return
        }

        let js = "renderAll(\(jsonString))"
        webView.evaluateJavaScript(js) { result, error in
            if let error = error {
                print("[RenderService] Error: \(error)")
            }
        }

        // Store document reference for callback
        currentDocument = document
    }

    private weak var currentDocument: MathEditDocument?
}

extension RenderService: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Page loaded, wait for MathJax ready
    }
}

extension RenderService: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        switch message.name {
        case "rendererReady":
            isReady = true
            // Process pending renders
            for pending in pendingRenders {
                doRender(equations: pending.equations, document: pending.document)
            }
            pendingRenders.removeAll()

        case "renderComplete":
            if let body = message.body as? [String: Any],
               let id = body["id"] as? String,
               let success = body["success"] as? Bool,
               success,
               let svg = body["svg"] as? String {
                DispatchQueue.main.async {
                    self.currentDocument?.updateRenderedSVG(equationId: id, svg: svg)
                }
            }

        default:
            break
        }
    }
}

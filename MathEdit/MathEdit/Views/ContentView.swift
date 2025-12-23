import SwiftUI

struct ContentView: View {
    @ObservedObject var document: MathEditDocument
    @State private var selectedEquationId: String?
    @State private var cursorLine: Int?
    @State private var columnVisibility: NavigationSplitViewVisibility = .all

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            SidebarView(
                equations: document.equations,
                selectedEquationId: $selectedEquationId,
                cursorLine: cursorLine
            )
            .navigationSplitViewColumnWidth(min: 180, ideal: 220, max: 300)
        } content: {
            EditorWebView(
                document: document,
                selectedEquationId: $selectedEquationId,
                cursorLine: $cursorLine
            )
            .navigationSplitViewColumnWidth(min: 300, ideal: 400)
        } detail: {
            PreviewPane(
                equations: document.equations,
                renderedSVGs: document.renderedSVGs,
                selectedEquationId: $selectedEquationId,
                cursorLine: cursorLine
            )
            .navigationSplitViewColumnWidth(min: 250, ideal: 350)
        }
        .toolbar {
            ToolbarItemGroup(placement: .automatic) {
                Menu {
                    Button("Copy SVG") {
                        copySelectedSVGToClipboard()
                    }
                    .disabled(selectedEquationId == nil)

                    Divider()

                    Button("Export as SVG...") {
                        exportSelectedAsSVG()
                    }
                    .disabled(selectedEquationId == nil)

                    Button("Export All SVGs...") {
                        exportAllSVGs()
                    }
                    .disabled(document.equations.isEmpty)
                } label: {
                    Label("Export", systemImage: "square.and.arrow.up")
                }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .exportEquationSVG)) { _ in
            exportSelectedAsSVG()
        }
        .onReceive(NotificationCenter.default.publisher(for: .exportAllSVGs)) { _ in
            exportAllSVGs()
        }
        .onReceive(NotificationCenter.default.publisher(for: .copyEquationSVG)) { _ in
            copySelectedSVGToClipboard()
        }
    }

    private func deleteSelectedEquation() {
        guard let id = selectedEquationId,
              let equation = document.equations.first(where: { $0.id == id }) else {
            return
        }

        // Remove the equation from document by line range
        var lines = document.projectData.document.components(separatedBy: "\n")
        let startLine = max(0, equation.startLine - 1) // Include preceding separator
        let endLine = min(lines.count - 1, equation.endLine + 1) // Include following separator

        lines.removeSubrange(startLine...endLine)
        document.updateDocument(lines.joined(separator: "\n"))

        selectedEquationId = nil
    }

    private func exportSelectedAsSVG() {
        guard let id = selectedEquationId,
              let svg = document.renderedSVGs[id],
              let equation = document.equations.first(where: { $0.id == id }) else {
            return
        }

        let panel = NSSavePanel()
        panel.allowedContentTypes = [.svg]
        panel.nameFieldStringValue = "\(equation.label).svg"

        if panel.runModal() == .OK, let url = panel.url {
            try? svg.write(to: url, atomically: true, encoding: .utf8)
        }
    }

    private func exportAllSVGs() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.canCreateDirectories = true
        panel.prompt = "Export"

        if panel.runModal() == .OK, let directory = panel.url {
            for equation in document.equations {
                if let svg = document.renderedSVGs[equation.id] {
                    let filename = "\(equation.label.replacingOccurrences(of: ":", with: "_")).svg"
                    let fileURL = directory.appendingPathComponent(filename)
                    try? svg.write(to: fileURL, atomically: true, encoding: .utf8)
                }
            }
        }
    }

    private func copySelectedSVGToClipboard() {
        guard let id = highlightedEquationId,
              let svg = document.renderedSVGs[id] else {
            return
        }

        // Ensure SVG has xmlns
        var fullSVG = svg
        if !fullSVG.contains("xmlns=") {
            fullSVG = fullSVG.replacingOccurrences(
                of: "<svg",
                with: "<svg xmlns=\"http://www.w3.org/2000/svg\""
            )
        }
        fullSVG = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\(fullSVG)"

        guard let svgData = fullSVG.data(using: .utf8) else { return }

        NSPasteboard.general.clearContents()
        // Copy as SVG image type
        NSPasteboard.general.setData(svgData, forType: NSPasteboard.PasteboardType("public.svg-image"))
        // Also copy as plain text fallback
        NSPasteboard.general.setString(fullSVG, forType: .string)
    }

    private var highlightedEquationId: String? {
        guard let line = cursorLine else { return selectedEquationId }
        return document.equations.first { $0.startLine <= line && line <= $0.endLine }?.id ?? selectedEquationId
    }
}

#Preview {
    ContentView(document: MathEditDocument())
}

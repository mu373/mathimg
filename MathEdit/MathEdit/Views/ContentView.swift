import SwiftUI
import UniformTypeIdentifiers

// MARK: - Import Dialog View
struct ImportDialogView: View {
    let duplicateLabel: String
    let existingSvg: String?
    let incomingSvg: String?
    let onCancel: () -> Void
    let onKeepBoth: () -> Void
    let onReplace: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Text("Equation Already Exists")
                .font(.headline)

            Text("\"\(duplicateLabel)\" already exists in this document.")
                .foregroundColor(.secondary)

            HStack(spacing: 24) {
                // Existing equation preview
                VStack(spacing: 8) {
                    Text("Current")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    PreviewBox(svg: existingSvg)
                }

                // Incoming equation preview
                VStack(spacing: 8) {
                    Text("New")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    PreviewBox(svg: incomingSvg)
                }
            }

            HStack(spacing: 12) {
                Button("Cancel", role: .cancel) {
                    onCancel()
                }
                .keyboardShortcut(.escape)

                Button("Keep Both") {
                    onKeepBoth()
                }

                Button("Replace") {
                    onReplace()
                }
                .keyboardShortcut(.return)
            }
            .padding(.top, 8)
        }
        .padding(24)
        .frame(minWidth: 400)
    }
}

struct PreviewBox: View {
    let svg: String?

    var body: some View {
        Group {
            if let svg = svg, let nsImage = svgToImage(svg) {
                Image(nsImage: nsImage)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
            } else {
                Text("Preview unavailable")
                    .foregroundColor(.secondary)
                    .font(.caption)
            }
        }
        .frame(width: 150, height: 80)
        .background(Color(nsColor: .textBackgroundColor))
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color.secondary.opacity(0.3), lineWidth: 1)
        )
    }

    private func svgToImage(_ svg: String) -> NSImage? {
        guard let data = svg.data(using: .utf8) else { return nil }
        return NSImage(data: data)
    }
}

// MARK: - Content View
struct ContentView: View {
    @ObservedObject var document: MathEditDocument
    @State private var selectedEquationId: String?
    @State private var cursorLine: Int?
    @State private var columnVisibility: NavigationSplitViewVisibility = .all
    @State private var isDragging = false
    @State private var showImportDialog = false
    @State private var pendingSvgContent: String?
    @State private var duplicateLabels: [String] = []
    @State private var incomingSvgPreview: String?

    var body: some View {
        ZStack {
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
        .onDrop(of: [.svg, .fileURL], isTargeted: $isDragging) { providers in
            handleDrop(providers: providers)
        }

            // Drag overlay
            if isDragging {
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        VStack(spacing: 12) {
                            Image(systemName: "arrow.down.doc")
                                .font(.system(size: 48))
                            Text("Drop SVG file to import")
                                .font(.headline)
                        }
                        .padding(32)
                        .background(.regularMaterial)
                        .cornerRadius(16)
                        Spacer()
                    }
                    Spacer()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.accentColor.opacity(0.1))
            }
        }
        .sheet(isPresented: $showImportDialog) {
            ImportDialogView(
                duplicateLabel: duplicateLabels.first ?? "",
                existingSvg: existingSvgForDuplicate,
                incomingSvg: incomingSvgPreview,
                onCancel: {
                    showImportDialog = false
                    pendingSvgContent = nil
                    duplicateLabels = []
                    incomingSvgPreview = nil
                },
                onKeepBoth: {
                    if let svg = pendingSvgContent {
                        document.importSvgEquations(svg, overwrite: false, keepBoth: true)
                    }
                    showImportDialog = false
                    pendingSvgContent = nil
                    duplicateLabels = []
                    incomingSvgPreview = nil
                },
                onReplace: {
                    if let svg = pendingSvgContent {
                        document.importSvgEquations(svg, overwrite: true)
                    }
                    showImportDialog = false
                    pendingSvgContent = nil
                    duplicateLabels = []
                    incomingSvgPreview = nil
                }
            )
        }
    }

    /// Get the rendered SVG for the duplicate equation
    private var existingSvgForDuplicate: String? {
        guard let label = duplicateLabels.first,
              let equation = document.equations.first(where: { $0.label == label }) else {
            return nil
        }
        return document.renderedSVGs[equation.id]
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
            let exportSVG = wrapSVGWithMetadata(svg: svg, equation: equation)
            try? exportSVG.write(to: url, atomically: true, encoding: .utf8)
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
                    let exportSVG = wrapSVGWithMetadata(svg: svg, equation: equation)
                    try? exportSVG.write(to: fileURL, atomically: true, encoding: .utf8)
                }
            }
        }
    }

    private func copySelectedSVGToClipboard() {
        guard let id = highlightedEquationId,
              let svg = document.renderedSVGs[id],
              let equation = document.equations.first(where: { $0.id == id }) else {
            return
        }

        let fullSVG = wrapSVGWithMetadata(svg: svg, equation: equation)

        guard let svgData = fullSVG.data(using: .utf8) else { return }

        NSPasteboard.general.clearContents()
        // Copy as SVG image type
        NSPasteboard.general.setData(svgData, forType: NSPasteboard.PasteboardType("public.svg-image"))
        // Also copy as plain text fallback
        NSPasteboard.general.setString(fullSVG, forType: .string)
    }

    /// Wrap raw MathJax SVG with metadata for round-trip import/export
    private func wrapSVGWithMetadata(svg: String, equation: Equation) -> String {
        // Extract dimensions from the SVG
        let widthMatch = svg.range(of: #"width="([^"]+)""#, options: .regularExpression)
        let heightMatch = svg.range(of: #"height="([^"]+)""#, options: .regularExpression)
        let viewBoxMatch = svg.range(of: #"viewBox="([^"]+)""#, options: .regularExpression)

        var width = "100"
        var height = "50"
        var viewBox = "0 0 100 50"

        if let match = widthMatch {
            let fullMatch = String(svg[match])
            if let start = fullMatch.range(of: "=\""), let end = fullMatch.lastIndex(of: "\"") {
                width = String(fullMatch[start.upperBound..<end])
            }
        }
        if let match = heightMatch {
            let fullMatch = String(svg[match])
            if let start = fullMatch.range(of: "=\""), let end = fullMatch.lastIndex(of: "\"") {
                height = String(fullMatch[start.upperBound..<end])
            }
        }
        if let match = viewBoxMatch {
            let fullMatch = String(svg[match])
            if let start = fullMatch.range(of: "=\""), let end = fullMatch.lastIndex(of: "\"") {
                viewBox = String(fullMatch[start.upperBound..<end])
            }
        }

        // Extract inner content from MathJax SVG
        var innerContent = svg
        if let svgTagRange = svg.range(of: "<svg"),
           let svgStart = svg.range(of: ">", range: svgTagRange.upperBound..<svg.endIndex),
           let svgEnd = svg.range(of: "</svg>", options: .backwards) {
            innerContent = String(svg[svgStart.upperBound..<svgEnd.lowerBound])
        }

        // Escape special characters for XML attributes
        let escapedLatex = equation.latex
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&apos;")

        // Create metadata JSON
        let metadata: [String: Any] = [
            "generator": "mathedit-mac",
            "generatorVersion": "0.1.0",
            "generatedAt": ISO8601DateFormatter().string(from: Date()),
            "equations": [[
                "id": equation.id,
                "latex": equation.latex,
                "label": equation.label,
                "displayMode": "block"
            ]]
        ]

        let metadataJSON = (try? JSONSerialization.data(withJSONObject: metadata, options: [.prettyPrinted, .sortedKeys]))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "{}"

        // Escape for XML content
        let escapedMetadata = metadataJSON
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")

        return """
        <?xml version="1.0" encoding="UTF-8"?>
        <svg xmlns="http://www.w3.org/2000/svg"
             width="\(width)"
             height="\(height)"
             viewBox="\(viewBox)">
          <metadata id="latex-equations" data-type="application/json">
        \(escapedMetadata)
          </metadata>
          <g id="\(equation.id)-group"
             data-role="latex-equation"
             data-equation-id="\(equation.id)"
             data-latex="\(escapedLatex)"
             data-display-mode="block">
        \(innerContent)
          </g>
        </svg>
        """
    }

    private var highlightedEquationId: String? {
        guard let line = cursorLine else { return selectedEquationId }
        return document.equations.first { $0.startLine <= line && line <= $0.endLine }?.id ?? selectedEquationId
    }

    private func handleDrop(providers: [NSItemProvider]) -> Bool {
        for provider in providers {
            // Handle SVG files directly
            if provider.hasItemConformingToTypeIdentifier(UTType.svg.identifier) {
                provider.loadDataRepresentation(forTypeIdentifier: UTType.svg.identifier) { data, error in
                    guard let data = data, let svgContent = String(data: data, encoding: .utf8) else { return }
                    DispatchQueue.main.async {
                        processSvgImport(svgContent)
                    }
                }
                return true
            }

            // Handle file URLs (for files dragged from Finder)
            if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
                provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, error in
                    guard let data = item as? Data,
                          let url = URL(dataRepresentation: data, relativeTo: nil),
                          url.pathExtension.lowercased() == "svg",
                          let svgContent = try? String(contentsOf: url, encoding: .utf8) else { return }
                    DispatchQueue.main.async {
                        processSvgImport(svgContent)
                    }
                }
                return true
            }
        }
        return false
    }

    private func processSvgImport(_ svgContent: String) {
        let (hasDuplicates, labels) = document.checkSvgForDuplicates(svgContent)

        if hasDuplicates {
            pendingSvgContent = svgContent
            duplicateLabels = labels
            // Extract the SVG content for preview (the dropped file itself is the rendered SVG)
            incomingSvgPreview = svgContent
            showImportDialog = true
        } else {
            document.importSvgEquations(svgContent)
        }
    }
}

#Preview {
    ContentView(document: MathEditDocument())
}

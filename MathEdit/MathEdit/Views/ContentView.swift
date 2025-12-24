import SwiftUI
import UniformTypeIdentifiers

// MARK: - Drop Zone Overlay (AppKit-based to work over WKWebView)
struct DropZoneOverlay: NSViewRepresentable {
    @Binding var isDragging: Bool
    let onDrop: (String) -> Void

    func makeNSView(context: Context) -> DropZoneNSView {
        let view = DropZoneNSView()
        view.onDragStateChanged = { isDragging in
            DispatchQueue.main.async {
                self.isDragging = isDragging
            }
        }
        view.onFileDrop = onDrop
        return view
    }

    func updateNSView(_ nsView: DropZoneNSView, context: Context) {}
}

class DropZoneNSView: NSView {
    var onDragStateChanged: ((Bool) -> Void)?
    var onFileDrop: ((String) -> Void)?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        registerForDraggedTypes([.fileURL, .init("public.svg-image")])
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        registerForDraggedTypes([.fileURL, .init("public.svg-image")])
    }

    override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
        if hasSVGFile(sender) {
            onDragStateChanged?(true)
            return .copy
        }
        return []
    }

    override func draggingUpdated(_ sender: NSDraggingInfo) -> NSDragOperation {
        return hasSVGFile(sender) ? .copy : []
    }

    override func draggingExited(_ sender: NSDraggingInfo?) {
        onDragStateChanged?(false)
    }

    override func draggingEnded(_ sender: NSDraggingInfo) {
        onDragStateChanged?(false)
    }

    override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
        onDragStateChanged?(false)

        guard let items = sender.draggingPasteboard.pasteboardItems else { return false }

        for item in items {
            // Try file URL first
            if let urlString = item.string(forType: .fileURL),
               let url = URL(string: urlString),
               url.pathExtension.lowercased() == "svg",
               let content = try? String(contentsOf: url, encoding: .utf8) {
                onFileDrop?(content)
                return true
            }

            // Try direct SVG data
            if let svgData = item.data(forType: .init("public.svg-image")),
               let content = String(data: svgData, encoding: .utf8) {
                onFileDrop?(content)
                return true
            }
        }

        return false
    }

    private func hasSVGFile(_ sender: NSDraggingInfo) -> Bool {
        guard let items = sender.draggingPasteboard.pasteboardItems else { return false }
        for item in items {
            if let urlString = item.string(forType: .fileURL),
               let url = URL(string: urlString),
               url.pathExtension.lowercased() == "svg" {
                return true
            }
            if item.data(forType: .init("public.svg-image")) != nil {
                return true
            }
        }
        return false
    }

    // Pass through mouse events so the content beneath remains interactive
    override func hitTest(_ point: NSPoint) -> NSView? {
        return nil
    }
}

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
        .toolbar(id: "main") {
            ToolbarItem(id: "add", placement: .automatic) {
                Button {
                    NotificationCenter.default.post(name: .addEquation, object: nil)
                } label: {
                    Label("Add Equation", systemImage: "plus")
                }
                .help("Add Equation (⌘;)")
            }

            ToolbarItem(id: "delete", placement: .automatic) {
                Button {
                    deleteSelectedEquation()
                } label: {
                    Label("Delete", systemImage: "trash")
                }
                .disabled(highlightedEquationId == nil)
                .help("Delete Equation (⌘⌫)")
            }

            ToolbarItem(id: "export", placement: .automatic) {
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
                .help("Export Options")
            }
        }
        .toolbarRole(.editor)
        .onReceive(NotificationCenter.default.publisher(for: .exportEquationSVG)) { _ in
            exportSelectedAsSVG()
        }
        .onReceive(NotificationCenter.default.publisher(for: .exportAllSVGs)) { _ in
            exportAllSVGs()
        }
        .onReceive(NotificationCenter.default.publisher(for: .copyEquationSVG)) { _ in
            copySelectedSVGToClipboard()
        }
        .onReceive(NotificationCenter.default.publisher(for: .deleteEquation)) { _ in
            deleteSelectedEquation()
        }

            // AppKit-based drop zone overlay (works over WKWebView)
            DropZoneOverlay(isDragging: $isDragging) { svgContent in
                processSvgImport(svgContent)
            }

            // Visual drag overlay
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
                .allowsHitTesting(false)
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
        // Use highlightedEquationId to delete the equation under cursor
        guard let id = highlightedEquationId,
              let equationIndex = document.equations.firstIndex(where: { $0.id == id }) else {
            return
        }

        let equation = document.equations[equationIndex]
        var lines = document.projectData.document.components(separatedBy: "\n")

        // Find the actual range to delete
        var deleteStart = equation.startLine
        var deleteEnd = equation.endLine

        // Check for separator before this equation (skip empty lines)
        var separatorBefore = equation.startLine - 1
        while separatorBefore >= 0 && lines[separatorBefore].trimmingCharacters(in: .whitespaces).isEmpty {
            separatorBefore -= 1
        }
        let hasSeparatorBefore = separatorBefore >= 0 &&
            lines[separatorBefore].trimmingCharacters(in: .whitespaces).hasPrefix("---")

        // Check for separator after this equation (skip empty lines)
        var separatorAfter = equation.endLine + 1
        while separatorAfter < lines.count && lines[separatorAfter].trimmingCharacters(in: .whitespaces).isEmpty {
            separatorAfter += 1
        }
        let hasSeparatorAfter = separatorAfter < lines.count &&
            lines[separatorAfter].trimmingCharacters(in: .whitespaces).hasPrefix("---")

        // Determine what to delete:
        // - If there's a separator before, include it and empty lines up to it
        // - If no separator before but there's one after, include it instead
        // - Include trailing empty lines up to separator/next content
        if hasSeparatorBefore {
            deleteStart = separatorBefore
        }

        // Include empty lines after the equation
        var trailingEmpty = equation.endLine + 1
        while trailingEmpty < lines.count && lines[trailingEmpty].trimmingCharacters(in: .whitespaces).isEmpty {
            trailingEmpty += 1
        }

        // If this is the first equation and there's a separator after, delete it too
        if !hasSeparatorBefore && hasSeparatorAfter {
            deleteEnd = separatorAfter
            // Also include empty lines after the separator
            var afterSep = separatorAfter + 1
            while afterSep < lines.count && lines[afterSep].trimmingCharacters(in: .whitespaces).isEmpty {
                afterSep += 1
            }
            deleteEnd = afterSep - 1
        } else if hasSeparatorBefore {
            // Include empty lines between separator and equation content
            deleteEnd = trailingEmpty - 1
        }

        // Ensure valid range
        deleteStart = max(0, deleteStart)
        deleteEnd = min(lines.count - 1, deleteEnd)

        // Find where the next equation starts (after separator and empty lines)
        var nextContentLine = deleteEnd + 1
        while nextContentLine < lines.count {
            let trimmed = lines[nextContentLine].trimmingCharacters(in: .whitespaces)
            if !trimmed.isEmpty && !trimmed.hasPrefix("---") {
                break
            }
            nextContentLine += 1
        }

        // Calculate target line after deletion
        // The next content will shift up by the number of deleted lines
        let linesDeleted = deleteEnd - deleteStart + 1
        let targetLine: Int
        if nextContentLine < lines.count {
            // There's content after - cursor goes to where it will be after shift
            targetLine = nextContentLine - linesDeleted
        } else if deleteStart > 0 {
            // No content after, go to end of previous equation
            // Find last non-empty line before deleteStart
            var prevContent = deleteStart - 1
            while prevContent >= 0 && lines[prevContent].trimmingCharacters(in: .whitespaces).isEmpty {
                prevContent -= 1
            }
            targetLine = max(0, prevContent)
        } else {
            targetLine = 0
        }

        if deleteStart <= deleteEnd {
            lines.removeSubrange(deleteStart...deleteEnd)
        }

        // Clean up any double empty lines at the edges
        let newDoc = lines.joined(separator: "\n")
            .trimmingCharacters(in: .newlines)
        document.updateDocument(newDoc.isEmpty ? "" : newDoc + "\n")

        // Move cursor to the next equation content
        selectedEquationId = nil
        NotificationCenter.default.post(
            name: .moveCursorToLine,
            object: nil,
            userInfo: ["line": targetLine]
        )
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

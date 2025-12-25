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
        // Ignore drags from within the app (internal drags from preview cells)
        if sender.draggingSource is NSView {
            return []
        }
        if hasExternalSVGFile(sender) {
            onDragStateChanged?(true)
            return .copy
        }
        return []
    }

    override func draggingUpdated(_ sender: NSDraggingInfo) -> NSDragOperation {
        // Ignore drags from within the app
        if sender.draggingSource is NSView {
            return []
        }
        return hasExternalSVGFile(sender) ? .copy : []
    }

    override func draggingExited(_ sender: NSDraggingInfo?) {
        onDragStateChanged?(false)
    }

    override func draggingEnded(_ sender: NSDraggingInfo) {
        onDragStateChanged?(false)
    }

    override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
        onDragStateChanged?(false)

        // Ignore drags from within the app
        if sender.draggingSource is NSView {
            return false
        }

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

    private func hasExternalSVGFile(_ sender: NSDraggingInfo) -> Bool {
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
    let hasExplicitLabel: Bool
    let existingSvg: String?
    let incomingSvg: String?
    let onCancel: () -> Void
    let onKeepBoth: () -> Void
    let onReplace: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Text("Equation Already Exists")
                .font(.headline)

            Text(hasExplicitLabel
                ? "\"\(duplicateLabel)\" already exists in this document."
                : "This equation already exists in this document.")
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

// MARK: - Import Dialog Item
struct ImportDialogItem: Identifiable {
    let id = UUID()
    let info: MathEditDocument.DuplicateInfo
    let incomingSvg: String
    let pendingSvg: String
}

// MARK: - Content View
struct ContentView: View {
    @ObservedObject var document: MathEditDocument
    @State private var selectedEquationId: String?
    @State private var cursorLine: Int?
    @State private var columnVisibility: NavigationSplitViewVisibility = .all
    @State private var isDragging = false
    @State private var importDialogItem: ImportDialogItem?

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
                .help("Delete Equation (⇧⌘⌫)")
            }

            ToolbarItem(id: "export", placement: .automatic) {
                Menu {
                    Button("Copy SVG") {
                        copySelectedSVGToClipboard()
                    }
                    .disabled(highlightedEquationId == nil || document.renderedSVGs[highlightedEquationId ?? ""] == nil)

                    Button("Copy PNG") {
                        copySelectedPNGToClipboard()
                    }
                    .disabled(highlightedEquationId == nil || document.renderedSVGs[highlightedEquationId ?? ""] == nil)

                    Button("Copy LaTeX") {
                        copySelectedLaTeXToClipboard()
                    }
                    .disabled(highlightedEquationId == nil)

                    Divider()

                    Button("Export SVG…") {
                        exportSelectedAsSVG()
                    }
                    .disabled(highlightedEquationId == nil || document.renderedSVGs[highlightedEquationId ?? ""] == nil)

                    Button("Export PNG…") {
                        exportSelectedAsPNG()
                    }
                    .disabled(highlightedEquationId == nil || document.renderedSVGs[highlightedEquationId ?? ""] == nil)

                    Divider()

                    Button("Export All SVGs…") {
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
        .onReceive(NotificationCenter.default.publisher(for: .exportEquationPNG)) { _ in
            exportSelectedAsPNG()
        }
        .onReceive(NotificationCenter.default.publisher(for: .exportAllSVGs)) { _ in
            exportAllSVGs()
        }
        .onReceive(NotificationCenter.default.publisher(for: .copyEquationSVG)) { _ in
            copySelectedSVGToClipboard()
        }
        .onReceive(NotificationCenter.default.publisher(for: .copyEquationPNG)) { _ in
            copySelectedPNGToClipboard()
        }
        .onReceive(NotificationCenter.default.publisher(for: .copyEquationLaTeX)) { _ in
            copySelectedLaTeXToClipboard()
        }
        .onReceive(NotificationCenter.default.publisher(for: .deleteEquation)) { _ in
            deleteSelectedEquation()
        }
        .onReceive(NotificationCenter.default.publisher(for: .pasteSVG)) { _ in
            pasteSVGFromClipboard()
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
        .sheet(item: $importDialogItem) { item in
            ImportDialogView(
                duplicateLabel: item.info.label,
                hasExplicitLabel: item.info.hasExplicitLabel,
                existingSvg: item.info.existingSvg ?? item.incomingSvg,
                incomingSvg: item.incomingSvg,
                onCancel: {
                    importDialogItem = nil
                },
                onKeepBoth: {
                    document.importSvgEquations(item.pendingSvg, overwrite: false, keepBoth: true, insertAfterLine: cursorLine)
                    importDialogItem = nil
                },
                onReplace: {
                    document.importSvgEquations(item.pendingSvg, overwrite: true, insertAfterLine: cursorLine)
                    importDialogItem = nil
                }
            )
        }
    }

    private func deleteSelectedEquation() {
        var lines = document.projectData.document.components(separatedBy: "\n")

        // Try to find equation by ID first
        if let id = highlightedEquationId,
           let equationIndex = document.equations.firstIndex(where: { $0.id == id }) {
            deleteEquationAt(index: equationIndex, lines: &lines)
            return
        }

        // No equation selected - try to delete empty section at cursor
        guard let cursor = cursorLine else { return }
        deleteEmptySectionAtLine(cursor, lines: &lines)
    }

    private func deleteEmptySectionAtLine(_ cursorLine: Int, lines: inout [String]) {
        // Find section boundaries (between --- separators)
        var sectionStart = cursorLine
        var sectionEnd = cursorLine

        // Find start (go backwards to find ---)
        while sectionStart > 0 {
            let trimmed = lines[sectionStart - 1].trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("---") {
                break
            }
            sectionStart -= 1
        }

        // Find end (go forwards to find --- or end of document)
        while sectionEnd < lines.count - 1 {
            let trimmed = lines[sectionEnd + 1].trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("---") {
                break
            }
            sectionEnd += 1
        }

        // Check if section is empty (only whitespace)
        var isEmpty = true
        for i in sectionStart...sectionEnd {
            let trimmed = lines[i].trimmingCharacters(in: .whitespaces)
            if !trimmed.isEmpty && !trimmed.hasPrefix("---") {
                isEmpty = false
                break
            }
        }

        guard isEmpty else { return }

        // Include the separator before if it exists
        var deleteStart = sectionStart
        var deleteEnd = sectionEnd

        if sectionStart > 0 && lines[sectionStart - 1].trimmingCharacters(in: .whitespaces).hasPrefix("---") {
            deleteStart = sectionStart - 1
        }

        // Calculate target line
        let linesDeleted = deleteEnd - deleteStart + 1
        var targetLine = max(0, deleteStart - 1)

        // Find last non-empty line before deleteStart
        while targetLine > 0 && lines[targetLine].trimmingCharacters(in: .whitespaces).isEmpty {
            targetLine -= 1
        }

        if deleteStart <= deleteEnd && deleteEnd < lines.count {
            lines.removeSubrange(deleteStart...deleteEnd)
        }

        // Update document
        let newDocument = lines.joined(separator: "\n")
        document.updateDocument(newDocument)

        // Move cursor
        NotificationCenter.default.post(
            name: .moveCursorToLine,
            object: nil,
            userInfo: ["line": targetLine]
        )
        NotificationCenter.default.post(name: .documentImported, object: nil)
    }

    private func deleteEquationAt(index equationIndex: Int, lines: inout [String]) {
        let equation = document.equations[equationIndex]

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

        let sanitizedLabel = equation.label
            .replacingOccurrences(of: ":", with: "_")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "\\", with: "_")

        let panel = NSSavePanel()
        panel.allowedContentTypes = [.svg]
        panel.nameFieldStringValue = "\(sanitizedLabel).svg"

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
        let sanitizedLabel = equation.label
            .replacingOccurrences(of: ":", with: "_")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "\\", with: "_")

        guard let svgData = fullSVG.data(using: .utf8) else { return }

        // Write to temp file for file-based clipboard
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(sanitizedLabel)
            .appendingPathExtension("svg")
        do {
            try svgData.write(to: tempURL)
            NSPasteboard.general.clearContents()
            NSPasteboard.general.writeObjects([tempURL as NSURL])
        } catch {
            // Fallback: copy as text
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(fullSVG, forType: .string)
        }
    }

    private func copySelectedPNGToClipboard() {
        guard let id = highlightedEquationId,
              let svg = document.renderedSVGs[id],
              let image = createPNGImage(from: svg),
              let tiffData = image.tiffRepresentation,
              let bitmapRep = NSBitmapImageRep(data: tiffData),
              let pngData = bitmapRep.representation(using: .png, properties: [:]) else {
            return
        }

        NSPasteboard.general.clearContents()
        NSPasteboard.general.setData(pngData, forType: .png)
    }

    private func copySelectedLaTeXToClipboard() {
        guard let id = highlightedEquationId,
              let equation = document.equations.first(where: { $0.id == id }) else {
            return
        }

        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(equation.latex, forType: .string)
    }

    private func pasteSVGFromClipboard() {
        let pasteboard = NSPasteboard.general

        guard let items = pasteboard.pasteboardItems else { return }

        for item in items {
            // Try file URL first
            if let urlString = item.string(forType: .fileURL),
               let url = URL(string: urlString),
               url.pathExtension.lowercased() == "svg",
               let content = try? String(contentsOf: url, encoding: .utf8) {
                processSvgImport(content)
                return
            }

            // Try public.svg-image
            if let svgData = item.data(forType: .init("public.svg-image")),
               let content = String(data: svgData, encoding: .utf8) {
                processSvgImport(content)
                return
            }

            // Try plain string that looks like SVG
            if let string = item.string(forType: .string) {
                let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
                if trimmed.hasPrefix("<svg") || trimmed.hasPrefix("<?xml") {
                    processSvgImport(string)
                    return
                }
            }
        }
    }

    private func exportSelectedAsPNG() {
        guard let id = highlightedEquationId,
              let svg = document.renderedSVGs[id],
              let equation = document.equations.first(where: { $0.id == id }),
              let image = createPNGImage(from: svg),
              let tiffData = image.tiffRepresentation,
              let bitmapRep = NSBitmapImageRep(data: tiffData),
              let pngData = bitmapRep.representation(using: .png, properties: [:]) else {
            return
        }

        let sanitizedLabel = equation.label
            .replacingOccurrences(of: ":", with: "_")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "\\", with: "_")

        let panel = NSSavePanel()
        panel.allowedContentTypes = [.png]
        panel.nameFieldStringValue = "\(sanitizedLabel).png"

        if panel.runModal() == .OK, let url = panel.url {
            try? pngData.write(to: url)
        }
    }

    /// Create PNG image from SVG string
    private func createPNGImage(from svg: String) -> NSImage? {
        var svgString = svg
        if !svgString.contains("xmlns=") {
            svgString = svgString.replacingOccurrences(
                of: "<svg",
                with: "<svg xmlns=\"http://www.w3.org/2000/svg\""
            )
        }

        // Convert 'ex' units to 'pt'
        let exToPt: Double = 8.0
        if let pattern = try? NSRegularExpression(pattern: "([0-9.]+)ex", options: []) {
            var result = svgString
            while let match = pattern.firstMatch(in: result, options: [], range: NSRange(result.startIndex..., in: result)) {
                guard let fullRange = Range(match.range, in: result),
                      let numRange = Range(match.range(at: 1), in: result),
                      let value = Double(result[numRange]) else { break }
                result = result.replacingCharacters(in: fullRange, with: String(format: "%.3fpt", value * exToPt))
            }
            svgString = result
        }

        let fullSVG = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\(svgString)"
        guard let data = fullSVG.data(using: .utf8) else { return nil }

        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("svg")

        do {
            try data.write(to: tempURL)
            guard let svgImage = NSImage(contentsOf: tempURL) else {
                try? FileManager.default.removeItem(at: tempURL)
                return nil
            }
            _ = svgImage.tiffRepresentation
            try? FileManager.default.removeItem(at: tempURL)

            let originalSize = svgImage.size
            guard svgImage.isValid && originalSize.width > 1 && originalSize.height > 1 else {
                return nil
            }

            // Scale 3x for high quality
            let scale: CGFloat = 3.0
            let targetSize = NSSize(
                width: originalSize.width * scale,
                height: originalSize.height * scale
            )

            let screenScale = NSScreen.main?.backingScaleFactor ?? 2.0
            let pixelWidth = Int(targetSize.width * screenScale)
            let pixelHeight = Int(targetSize.height * screenScale)

            guard let bitmapRep = NSBitmapImageRep(
                bitmapDataPlanes: nil,
                pixelsWide: pixelWidth,
                pixelsHigh: pixelHeight,
                bitsPerSample: 8,
                samplesPerPixel: 4,
                hasAlpha: true,
                isPlanar: false,
                colorSpaceName: .deviceRGB,
                bytesPerRow: 0,
                bitsPerPixel: 0
            ) else {
                return nil
            }

            bitmapRep.size = targetSize

            NSGraphicsContext.saveGraphicsState()
            guard let context = NSGraphicsContext(bitmapImageRep: bitmapRep) else {
                NSGraphicsContext.restoreGraphicsState()
                return nil
            }
            NSGraphicsContext.current = context
            context.imageInterpolation = .high

            svgImage.draw(
                in: NSRect(origin: .zero, size: targetSize),
                from: NSRect(origin: .zero, size: originalSize),
                operation: .copy,
                fraction: 1.0
            )

            NSGraphicsContext.restoreGraphicsState()

            let scaledImage = NSImage(size: targetSize)
            scaledImage.addRepresentation(bitmapRep)
            return scaledImage
        } catch {
            return nil
        }
    }

    /// Scale a dimension string (e.g., "10.5ex") by a factor
    private func scaleDimension(_ dimension: String, scale: Double) -> String {
        let pattern = #"^([0-9.]+)(ex|pt|px|em)?$"#
        guard let regex = try? NSRegularExpression(pattern: pattern, options: []),
              let match = regex.firstMatch(in: dimension, options: [], range: NSRange(dimension.startIndex..., in: dimension)),
              let numRange = Range(match.range(at: 1), in: dimension),
              let value = Double(dimension[numRange]) else {
            return dimension
        }
        let unit = match.range(at: 2).location != NSNotFound ? String(dimension[Range(match.range(at: 2), in: dimension)!]) : ""
        return String(format: "%.3f", value * scale) + unit
    }

    /// Wrap raw MathJax SVG with metadata for round-trip import/export (scaled 2x)
    private func wrapSVGWithMetadata(svg: String, equation: Equation) -> String {
        let scale = 2.0

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

        // Scale width and height by 2x
        let scaledWidth = scaleDimension(width, scale: scale)
        let scaledHeight = scaleDimension(height, scale: scale)

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
             width="\(scaledWidth)"
             height="\(scaledHeight)"
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
        let (hasDuplicates, duplicates) = document.checkSvgForDuplicates(svgContent)

        if hasDuplicates, let first = duplicates.first {
            // Use sheet(item:) pattern - data is captured immediately
            importDialogItem = ImportDialogItem(
                info: first,
                incomingSvg: svgContent,
                pendingSvg: svgContent
            )
        } else {
            document.importSvgEquations(svgContent, insertAfterLine: cursorLine)
        }
    }
}

#Preview {
    ContentView(document: MathEditDocument())
}

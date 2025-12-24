import SwiftUI
import UniformTypeIdentifiers

// Cache for rendered images to prevent blinking
private class ImageCache {
    static let shared = ImageCache()
    private var cache: [String: NSImage] = [:]
    private var svgHashes: [String: Int] = [:]
    private var lastZoom: CGFloat = 1.0

    private static let baseScale: CGFloat = 1.5

    func image(for key: String, svg: String, zoom: CGFloat) -> NSImage? {
        // Invalidate cache if zoom changed
        if zoom != lastZoom {
            cache.removeAll()
            svgHashes.removeAll()
            lastZoom = zoom
        }

        // Use hash of SVG content to detect changes
        let svgHash = svg.hashValue
        let cacheKey = "\(key)-\(zoom)"

        // Check if SVG content changed for this key
        if let cachedHash = svgHashes[key], cachedHash != svgHash {
            // SVG changed, invalidate this entry
            cache.removeValue(forKey: cacheKey)
        }

        if let cached = cache[cacheKey] {
            return cached
        }

        if let image = Self.createImage(from: svg, zoom: zoom) {
            cache[cacheKey] = image
            svgHashes[key] = svgHash
            return image
        }
        return nil
    }

    func invalidate(for key: String) {
        cache = cache.filter { !$0.key.hasPrefix(key) }
        svgHashes.removeValue(forKey: key)
    }

    func clearAll() {
        cache.removeAll()
        svgHashes.removeAll()
    }

    private static func createImage(from svgString: String, zoom: CGFloat) -> NSImage? {
        var svg = svgString

        // Check for error markers in SVG (MathJax error output)
        if svg.contains("data-mjx-error") || svg.contains("merror") {
            return nil
        }

        if !svg.contains("xmlns=") {
            svg = svg.replacingOccurrences(
                of: "<svg",
                with: "<svg xmlns=\"http://www.w3.org/2000/svg\""
            )
        }

        // Convert 'ex' units to 'pt' for proper NSImage handling
        // MathJax uses 'ex' units which NSImage doesn't handle well
        // 1ex ≈ 8pt for typical math fonts
        let exToPt: Double = 8.0
        if let pattern = try? NSRegularExpression(pattern: "([0-9.]+)ex", options: []) {
            var result = svg
            while let match = pattern.firstMatch(in: result, options: [], range: NSRange(result.startIndex..., in: result)) {
                guard let fullRange = Range(match.range, in: result),
                      let numRange = Range(match.range(at: 1), in: result),
                      let value = Double(result[numRange]) else { break }
                result = result.replacingCharacters(in: fullRange, with: String(format: "%.3fpt", value * exToPt))
            }
            svg = result
        }

        let fullSVG = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\(svg)"
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

            // Force the image to load its data before deleting the file
            _ = svgImage.tiffRepresentation

            try? FileManager.default.removeItem(at: tempURL)

            // Check if image is valid
            let originalSize = svgImage.size
            guard svgImage.isValid && originalSize.width > 1 && originalSize.height > 1 else {
                return nil
            }

            // Calculate target size at the desired scale
            let scale = baseScale * zoom
            let targetSize = NSSize(
                width: originalSize.width * scale,
                height: originalSize.height * scale
            )

            // Account for retina displays
            let screenScale = NSScreen.main?.backingScaleFactor ?? 2.0
            let pixelWidth = Int(targetSize.width * screenScale)
            let pixelHeight = Int(targetSize.height * screenScale)

            // Create a bitmap at the proper resolution for retina displays
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

            bitmapRep.size = targetSize // Set the display size (points, not pixels)

            NSGraphicsContext.saveGraphicsState()
            guard let context = NSGraphicsContext(bitmapImageRep: bitmapRep) else {
                NSGraphicsContext.restoreGraphicsState()
                return nil
            }
            NSGraphicsContext.current = context
            context.imageInterpolation = .high

            // Draw the SVG at the target size (this re-renders the vector at full resolution)
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
}

struct PreviewPane: View {
    let equations: [Equation]
    let renderedSVGs: [String: String]
    @Binding var selectedEquationId: String?
    let cursorLine: Int?
    @State private var zoom: CGFloat = 1.0
    @FocusState private var isFocused: Bool

    private static let zoomLevels: [CGFloat] = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0]

    /// Determine which equation is highlighted based on cursor line
    private var highlightedEquationId: String? {
        guard let line = cursorLine else { return selectedEquationId }
        return equations.first { $0.startLine <= line && line <= $0.endLine }?.id ?? selectedEquationId
    }

    /// Current index of highlighted equation
    private var currentIndex: Int? {
        guard let id = highlightedEquationId else { return nil }
        return equations.firstIndex { $0.id == id }
    }

    var body: some View {
        VStack(spacing: 0) {
            toolbarView
            Divider()
            equationListView
        }
        .background(Color(nsColor: .textBackgroundColor))
        .focusable()
        .focusEffectDisabled()
        .focused($isFocused)
        .onKeyPress(.upArrow) {
            selectPreviousEquation()
            return .handled
        }
        .onKeyPress(.downArrow) {
            selectNextEquation()
            return .handled
        }
    }

    private func selectPreviousEquation() {
        guard !equations.isEmpty else { return }
        if let index = currentIndex, index > 0 {
            selectedEquationId = equations[index - 1].id
        } else if currentIndex == nil {
            selectedEquationId = equations.last?.id
        }
    }

    private func selectNextEquation() {
        guard !equations.isEmpty else { return }
        if let index = currentIndex, index < equations.count - 1 {
            selectedEquationId = equations[index + 1].id
        } else if currentIndex == nil {
            selectedEquationId = equations.first?.id
        }
    }

    private var toolbarView: some View {
        HStack {
            Text("Preview")
                .font(.headline)

            Spacer()

            zoomMenu
        }
        .padding(8)
    }

    private var zoomMenu: some View {
        Menu {
            ForEach(Self.zoomLevels, id: \.self) { level in
                Button {
                    zoom = level
                } label: {
                    Text("\(Int(level * 100))%")
                }
            }
        } label: {
            Text("\(Int(zoom * 100))%")
                .font(.system(.body, design: .default).monospacedDigit())
                .frame(minWidth: 50, alignment: .trailing)
        }
        .menuStyle(.borderlessButton)
        .fixedSize()
    }

    private var equationListView: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(equations) { equation in
                        equationRowView(for: equation)
                    }
                }
                .drawingGroup()
            }
            .onChange(of: highlightedEquationId) { _, newValue in
                if let id = newValue {
                    withAnimation {
                        proxy.scrollTo(id, anchor: .center)
                    }
                }
            }
        }
    }

    private func equationRowView(for equation: Equation) -> some View {
        EquationRow(
            equation: equation,
            svg: renderedSVGs[equation.id],
            isSelected: equation.id == highlightedEquationId,
            zoom: zoom
        )
        .id(equation.id)
        .contentShape(Rectangle())
        .onTapGesture {
            selectedEquationId = equation.id
        }
    }

}

// Mail.app style row
struct EquationRow: View {
    let equation: Equation
    let svg: String?
    let isSelected: Bool
    let zoom: CGFloat

    private var cachedImage: NSImage? {
        guard let svg = svg else { return nil }
        return ImageCache.shared.image(for: equation.id, svg: svg, zoom: zoom)
    }

    /// Create a high-quality PNG image for export/drag
    private func createExportImage() -> NSImage? {
        guard let svg = svg else { return nil }
        // Use zoom 2.0 for high-quality export
        return ImageCache.shared.image(for: "\(equation.id)-export", svg: svg, zoom: 2.0)
    }

    /// Create SVG data with proper XML header, scaled 2x for export
    private func createSVGData() -> Data? {
        guard let svg = svg else { return nil }
        let scaledSVG = Self.scaleSVG(svg, scale: 2.0)
        return scaledSVG.data(using: .utf8)
    }

    /// Scale SVG dimensions by a factor
    private static func scaleSVG(_ svg: String, scale: Double) -> String {
        var svgString = svg

        // Add xmlns if missing
        if !svgString.contains("xmlns=") {
            svgString = svgString.replacingOccurrences(
                of: "<svg",
                with: "<svg xmlns=\"http://www.w3.org/2000/svg\""
            )
        }

        // Scale width attribute
        if let widthPattern = try? NSRegularExpression(pattern: #"width="([0-9.]+)(ex|pt|px|em)?""#, options: []),
           let match = widthPattern.firstMatch(in: svgString, options: [], range: NSRange(svgString.startIndex..., in: svgString)),
           let fullRange = Range(match.range, in: svgString),
           let numRange = Range(match.range(at: 1), in: svgString),
           let value = Double(svgString[numRange]) {
            let unit = match.range(at: 2).location != NSNotFound ? String(svgString[Range(match.range(at: 2), in: svgString)!]) : ""
            let newValue = value * scale
            svgString = svgString.replacingCharacters(in: fullRange, with: "width=\"\(String(format: "%.3f", newValue))\(unit)\"")
        }

        // Scale height attribute
        if let heightPattern = try? NSRegularExpression(pattern: #"height="([0-9.]+)(ex|pt|px|em)?""#, options: []),
           let match = heightPattern.firstMatch(in: svgString, options: [], range: NSRange(svgString.startIndex..., in: svgString)),
           let fullRange = Range(match.range, in: svgString),
           let numRange = Range(match.range(at: 1), in: svgString),
           let value = Double(svgString[numRange]) {
            let unit = match.range(at: 2).location != NSNotFound ? String(svgString[Range(match.range(at: 2), in: svgString)!]) : ""
            let newValue = value * scale
            svgString = svgString.replacingCharacters(in: fullRange, with: "height=\"\(String(format: "%.3f", newValue))\(unit)\"")
        }

        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\(svgString)"
    }

    /// Sanitize label for use as filename (remove/replace invalid characters)
    private var sanitizedLabel: String {
        equation.label
            .replacingOccurrences(of: ":", with: "_")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "\\", with: "_")
    }

    /// Create an NSItemProvider for drag operations - provides SVG file
    private func createDragItemProvider() -> NSItemProvider {
        guard let svgData = createSVGData() else {
            return NSItemProvider()
        }

        let provider = NSItemProvider()

        // Register as file with .svg extension for better app compatibility
        provider.suggestedName = sanitizedLabel

        // Register SVG as a file representation
        provider.registerFileRepresentation(
            forTypeIdentifier: UTType.svg.identifier,
            fileOptions: [],
            visibility: .all
        ) { completion in
            let tempURL = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString)
                .appendingPathExtension("svg")
            do {
                try svgData.write(to: tempURL)
                completion(tempURL, true, nil)
            } catch {
                completion(nil, false, error)
            }
            return nil
        }

        return provider
    }

    private func copySVGToClipboard() {
        guard let svgData = createSVGData() else { return }

        // Write SVG to a temp file for file-based clipboard
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(sanitizedLabel)
            .appendingPathExtension("svg")
        do {
            try svgData.write(to: tempURL)
            NSPasteboard.general.clearContents()
            NSPasteboard.general.writeObjects([tempURL as NSURL])
        } catch {
            // Fallback: copy as text
            if let svg = svg {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(svg, forType: .string)
            }
        }
    }

    private func copyLaTeXToClipboard() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(equation.latex, forType: .string)
    }

    private func copyImageToClipboard() {
        guard let image = createExportImage(),
              let tiffData = image.tiffRepresentation,
              let bitmapRep = NSBitmapImageRep(data: tiffData),
              let pngData = bitmapRep.representation(using: .png, properties: [:]) else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setData(pngData, forType: .png)
    }

    private func exportSVG() {
        guard let svgData = createSVGData() else { return }
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.svg]
        panel.nameFieldStringValue = "\(sanitizedLabel).svg"

        panel.begin { response in
            if response == .OK, let url = panel.url {
                try? svgData.write(to: url)
            }
        }
    }

    private func exportPNG() {
        guard let image = createExportImage(),
              let tiffData = image.tiffRepresentation,
              let bitmapRep = NSBitmapImageRep(data: tiffData),
              let pngData = bitmapRep.representation(using: .png, properties: [:]) else { return }

        let panel = NSSavePanel()
        panel.allowedContentTypes = [.png]
        panel.nameFieldStringValue = "\(sanitizedLabel).png"

        panel.begin { response in
            if response == .OK, let url = panel.url {
                try? pngData.write(to: url)
            }
        }
    }

    /// LaTeX without comments and \label{}
    private var latexPreview: String {
        var result = equation.latex
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("%") }
            .joined(separator: " ")

        // Remove \label{...}
        if let regex = try? NSRegularExpression(pattern: "\\\\label\\{[^}]*\\}", options: []) {
            result = regex.stringByReplacingMatches(
                in: result,
                options: [],
                range: NSRange(result.startIndex..., in: result),
                withTemplate: ""
            )
        }

        return result.trimmingCharacters(in: .whitespaces)
    }

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                // Header row: color dot + label (dimmed)
                HStack(spacing: 6) {
                    if let color = equation.color {
                        Circle()
                            .fill(Color(hex: color) ?? .accentColor)
                            .frame(width: 8, height: 8)
                    }

                    Text(equation.label)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(1)

                    Spacer()
                }

                // Centered SVG preview - constrained to available width
                GeometryReader { geometry in
                    HStack {
                        Spacer()
                        if let nsImage = cachedImage {
                            Image(nsImage: nsImage)
                        } else {
                            ProgressView()
                                .scaleEffect(0.8)
                        }
                        Spacer()
                    }
                    .frame(width: geometry.size.width)
                }
                .frame(height: cachedImage?.size.height ?? 50)
                .frame(minHeight: 50)
                .clipped()

                // LaTeX source (without comments)
                Text(latexPreview)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 16)
            .overlay(
                RoundedRectangle(cornerRadius: 6)
                    .stroke(isSelected ? Color(nsColor: .unemphasizedSelectedContentBackgroundColor) : Color.clear, lineWidth: 2)
                    .padding(4)
            )

            // Full-width divider
            Divider()
        }
        .contentShape(Rectangle())
        .onDrag {
            createDragItemProvider()
        } preview: {
            // Custom drag preview showing only the equation image
            if let nsImage = cachedImage {
                Image(nsImage: nsImage)
            } else {
                Text(equation.label)
                    .padding(8)
                    .background(Color(nsColor: .controlBackgroundColor))
                    .cornerRadius(4)
            }
        }
        .contextMenu {
            Button("Copy SVG") {
                copySVGToClipboard()
            }
            .disabled(svg == nil)

            Button("Copy PNG") {
                copyImageToClipboard()
            }
            .disabled(svg == nil)

            Button("Copy LaTeX") {
                copyLaTeXToClipboard()
            }

            Divider()

            Button("Export SVG…") {
                exportSVG()
            }
            .disabled(svg == nil)

            Button("Export PNG…") {
                exportPNG()
            }
            .disabled(svg == nil)

            Divider()

            Button("Delete", role: .destructive) {
                NotificationCenter.default.post(name: .deleteEquation, object: equation.id)
            }
        }
    }
}

// MARK: - Color Extension
extension Color {
    init?(hex: String) {
        var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        hexSanitized = hexSanitized.replacingOccurrences(of: "#", with: "")

        var rgb: UInt64 = 0
        guard Scanner(string: hexSanitized).scanHexInt64(&rgb) else { return nil }

        let r = Double((rgb & 0xFF0000) >> 16) / 255.0
        let g = Double((rgb & 0x00FF00) >> 8) / 255.0
        let b = Double(rgb & 0x0000FF) / 255.0

        self.init(red: r, green: g, blue: b)
    }
}

#Preview {
    PreviewPane(
        equations: [
            Equation(id: "1", label: "eq:einstein", latex: "E = mc^2", startLine: 0, endLine: 1),
            Equation(id: "2", label: "eq2", latex: "\\int_0^\\infty e^{-x} dx", startLine: 3, endLine: 4),
        ],
        renderedSVGs: [:],
        selectedEquationId: .constant("1"),
        cursorLine: 0
    )
    .frame(width: 350, height: 400)
}

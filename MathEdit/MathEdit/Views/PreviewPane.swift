import SwiftUI

// Cache for rendered images to prevent blinking
private class ImageCache {
    static let shared = ImageCache()
    private var cache: [String: NSImage] = [:]
    private var svgHashes: [String: Int] = [:]
    private var lastZoom: CGFloat = 1.0

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

        let fullSVG = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\(svg)"
        guard let data = fullSVG.data(using: .utf8) else { return nil }

        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("svg")

        do {
            try data.write(to: tempURL)

            guard let image = NSImage(contentsOf: tempURL) else {
                try? FileManager.default.removeItem(at: tempURL)
                return nil
            }

            // Force the image to load its data before deleting the file
            _ = image.tiffRepresentation

            try? FileManager.default.removeItem(at: tempURL)

            // Check if image is valid
            guard image.isValid && image.size.width > 1 && image.size.height > 1 else {
                return nil
            }

            let baseScale: CGFloat = 12.0
            let originalSize = image.size
            let scaledSize = NSSize(
                width: originalSize.width * baseScale * zoom,
                height: originalSize.height * baseScale * zoom
            )
            image.size = scaledSize

            return image
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

                // Centered SVG preview
                HStack {
                    Spacer()
                    Group {
                        if let nsImage = cachedImage {
                            Image(nsImage: nsImage)
                        } else {
                            ProgressView()
                                .scaleEffect(0.8)
                        }
                    }
                    .frame(minHeight: 50)
                    Spacer()
                }

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

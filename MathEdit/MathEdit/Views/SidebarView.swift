import SwiftUI
import UniformTypeIdentifiers

struct SidebarView: View {
    let equations: [Equation]
    @Binding var selectedEquationId: String?
    let cursorLine: Int?

    /// Determine which equation is highlighted based on cursor line
    private var highlightedEquationId: String? {
        guard let line = cursorLine else { return selectedEquationId }
        return equations.first { $0.startLine <= line && line <= $0.endLine }?.id ?? selectedEquationId
    }

    var body: some View {
        VStack(spacing: 0) {
            List(selection: Binding(
                get: { highlightedEquationId },
                set: { selectedEquationId = $0 }
            )) {
                ForEach(equations) { equation in
                    EquationRowView(equation: equation)
                        .tag(equation.id)
                        .contextMenu {
                            EquationContextMenu(equation: equation)
                        }
                }
            }
            .listStyle(.sidebar)

            Divider()

            HStack {
                Button {
                    NotificationCenter.default.post(name: .addEquation, object: nil)
                } label: {
                    Label("Add Equation", systemImage: "plus")
                }
                .buttonStyle(.borderless)
                .padding(.leading, 8)

                Spacer()
            }
            .padding(.vertical, 8)
        }
    }
}

struct EquationRowView: View {
    let equation: Equation
    @AppStorage("showEquationInSidebar") private var showEquation = false

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
        VStack(alignment: .leading, spacing: 2) {
            Text(equation.label)
                .font(.body)
                .lineLimit(1)

            if showEquation {
                Text(latexPreview.prefix(30))
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Shared Context Menu for Equations
struct EquationContextMenu: View {
    let equation: Equation

    /// Sanitize label for use as filename
    private var sanitizedLabel: String {
        equation.label
            .replacingOccurrences(of: ":", with: "_")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "\\", with: "_")
    }

    /// Create SVG data with proper XML header, scaled 2x for export
    private func createSVGData() -> Data? {
        guard let svg = equation.renderedSVG else { return nil }
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

    /// Create PNG image from SVG
    private func createPNGImage() -> NSImage? {
        guard let svg = equation.renderedSVG else { return nil }

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

            // Scale 2x for high quality
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

    var body: some View {
        Button("Copy SVG") {
            guard let svgData = createSVGData() else { return }
            let tempURL = FileManager.default.temporaryDirectory
                .appendingPathComponent(sanitizedLabel)
                .appendingPathExtension("svg")
            do {
                try svgData.write(to: tempURL)
                NSPasteboard.general.clearContents()
                NSPasteboard.general.writeObjects([tempURL as NSURL])
            } catch {
                if let svg = equation.renderedSVG {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(svg, forType: .string)
                }
            }
        }
        .disabled(equation.renderedSVG == nil)

        Button("Copy PNG") {
            guard let image = createPNGImage(),
                  let tiffData = image.tiffRepresentation,
                  let bitmapRep = NSBitmapImageRep(data: tiffData),
                  let pngData = bitmapRep.representation(using: .png, properties: [:]) else { return }
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setData(pngData, forType: .png)
        }
        .disabled(equation.renderedSVG == nil)

        Button("Copy LaTeX") {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(equation.latex, forType: .string)
        }

        Divider()

        Button("Export SVG…") {
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
        .disabled(equation.renderedSVG == nil)

        Button("Export PNG…") {
            guard let image = createPNGImage(),
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
        .disabled(equation.renderedSVG == nil)

        Divider()

        Button("Delete", role: .destructive) {
            NotificationCenter.default.post(name: .deleteEquation, object: equation.id)
        }
    }
}

#Preview {
    SidebarView(
        equations: [
            Equation(id: "1", label: "eq:einstein", latex: "E = mc^2", startLine: 0, endLine: 1),
            Equation(id: "2", label: "eq2", latex: "\\int_0^\\infty e^{-x} dx", startLine: 3, endLine: 4),
        ],
        selectedEquationId: .constant("1"),
        cursorLine: 0
    )
    .frame(width: 220)
}

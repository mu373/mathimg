import Foundation

struct ImportedEquation {
    let id: String
    let latex: String
    let label: String
}

struct SVGParseResult {
    let hasMetadata: Bool
    let equations: [ImportedEquation]
    let errors: [String]
}

/// Parse SVG content to extract LaTeX equations from metadata
/// Mirrors the logic in packages/core/src/svg/parser.ts
func parseSvg(_ svgContent: String) -> SVGParseResult {
    var errors: [String] = []
    var equations: [ImportedEquation] = []

    // Try to extract metadata block first
    let metadataPattern = #"<metadata[^>]*?id="latex-equations"[^>]*?>([\s\S]*?)</metadata>"#
    if let metadataMatch = svgContent.range(of: metadataPattern, options: .regularExpression) {
        let fullMatch = String(svgContent[metadataMatch])

        // Extract the JSON content inside the metadata tag
        if let jsonStart = fullMatch.range(of: ">"),
           let jsonEnd = fullMatch.range(of: "</metadata>") {
            let jsonContent = String(fullMatch[jsonStart.upperBound..<jsonEnd.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)

            if let jsonData = jsonContent.data(using: .utf8) {
                do {
                    if let metadata = try JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
                       let equationsArray = metadata["equations"] as? [[String: Any]] {
                        for (index, eq) in equationsArray.enumerated() {
                            let id = eq["id"] as? String ?? UUID().uuidString
                            let latex = eq["latex"] as? String ?? ""
                            let label = eq["label"] as? String ?? "imported\(index + 1)"
                            equations.append(ImportedEquation(id: id, latex: latex, label: label))
                        }
                        return SVGParseResult(hasMetadata: true, equations: equations, errors: [])
                    }
                } catch {
                    errors.append("Failed to parse metadata JSON: \(error.localizedDescription)")
                }
            }
        }
    }

    // Fallback: try to extract from data attributes on groups
    let groupPattern = #"<g[^>]*?data-role="latex-equation"[^>]*?>"#
    let regex = try? NSRegularExpression(pattern: groupPattern, options: [])
    let range = NSRange(svgContent.startIndex..., in: svgContent)

    regex?.enumerateMatches(in: svgContent, options: [], range: range) { match, _, _ in
        guard let matchRange = match?.range, let swiftRange = Range(matchRange, in: svgContent) else { return }
        let groupTag = String(svgContent[swiftRange])

        // Extract data-latex attribute
        let latexPattern = #"data-latex="([^"]+)""#
        if let latexMatch = groupTag.range(of: latexPattern, options: .regularExpression) {
            let fullLatexMatch = String(groupTag[latexMatch])
            if let valueStart = fullLatexMatch.range(of: "=\""),
               let valueEnd = fullLatexMatch.lastIndex(of: "\"") {
                var latex = String(fullLatexMatch[valueStart.upperBound..<valueEnd])

                // Decode HTML entities
                latex = latex
                    .replacingOccurrences(of: "&quot;", with: "\"")
                    .replacingOccurrences(of: "&amp;", with: "&")
                    .replacingOccurrences(of: "&lt;", with: "<")
                    .replacingOccurrences(of: "&gt;", with: ">")
                    .replacingOccurrences(of: "&apos;", with: "'")

                // Extract ID
                let idPattern = #"data-equation-id="([^"]+)""#
                var id = UUID().uuidString
                if let idMatch = groupTag.range(of: idPattern, options: .regularExpression) {
                    let fullIdMatch = String(groupTag[idMatch])
                    if let idStart = fullIdMatch.range(of: "=\""),
                       let idEnd = fullIdMatch.lastIndex(of: "\"") {
                        id = String(fullIdMatch[idStart.upperBound..<idEnd])
                    }
                }

                // Extract label from latex
                let labelPattern = #"\\label\{([\w:.-]+)\}"#
                var label = "imported\(equations.count + 1)"
                if let labelMatch = latex.range(of: labelPattern, options: .regularExpression) {
                    let fullLabelMatch = String(latex[labelMatch])
                    if let labelStart = fullLabelMatch.range(of: "{"),
                       let labelEnd = fullLabelMatch.lastIndex(of: "}") {
                        label = String(fullLabelMatch[labelStart.upperBound..<labelEnd])
                    }
                }

                equations.append(ImportedEquation(id: id, latex: latex, label: label))
            }
        }
    }

    if equations.isEmpty {
        errors.append("No LaTeX equations found in SVG")
    }

    return SVGParseResult(hasMetadata: false, equations: equations, errors: errors)
}

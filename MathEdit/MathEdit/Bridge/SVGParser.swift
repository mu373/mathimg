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

/// Unescape XML entities in a string
private func unescapeXML(_ str: String) -> String {
    return str
        .replacingOccurrences(of: "&lt;", with: "<")
        .replacingOccurrences(of: "&gt;", with: ">")
        .replacingOccurrences(of: "&quot;", with: "\"")
        .replacingOccurrences(of: "&apos;", with: "'")
        .replacingOccurrences(of: "&amp;", with: "&") // Must be last
}

/// Parse SVG content to extract LaTeX equations from metadata
/// Mirrors the logic in packages/core/src/svg/parser.ts
func parseSvg(_ svgContent: String) -> SVGParseResult {
    var errors: [String] = []
    var equations: [ImportedEquation] = []

    // Try to extract metadata block first
    // Use NSRegularExpression for proper multiline matching
    let metadataPattern = #"<metadata[^>]*id="latex-equations"[^>]*>(.*?)</metadata>"#
    if let regex = try? NSRegularExpression(pattern: metadataPattern, options: .dotMatchesLineSeparators),
       let match = regex.firstMatch(in: svgContent, options: [], range: NSRange(svgContent.startIndex..., in: svgContent)),
       match.numberOfRanges > 1,
       let contentRange = Range(match.range(at: 1), in: svgContent) {

        let jsonContent = String(svgContent[contentRange]).trimmingCharacters(in: .whitespacesAndNewlines)

        // Unescape XML entities before parsing JSON
        let unescapedJSON = unescapeXML(jsonContent)

        if let jsonData = unescapedJSON.data(using: .utf8) {
            do {
                if let metadata = try JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
                   let equationsArray = metadata["equations"] as? [[String: Any]] {
                    for (index, eq) in equationsArray.enumerated() {
                        let id = (eq["id"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? UUID().uuidString
                        let latex = eq["latex"] as? String ?? ""
                        // Handle nil or empty label
                        let rawLabel = eq["label"] as? String
                        let label = (rawLabel == nil || rawLabel!.isEmpty) ? "imported\(index + 1)" : rawLabel!
                        equations.append(ImportedEquation(id: id, latex: latex, label: label))
                    }
                    return SVGParseResult(hasMetadata: true, equations: equations, errors: [])
                }
            } catch {
                errors.append("Failed to parse metadata JSON: \(error.localizedDescription)")
            }
        }
    }

    // Fallback: try to extract from data attributes on groups
    let groupPattern = #"<g[^>]*data-role="latex-equation"[^>]*>"#
    if let regex = try? NSRegularExpression(pattern: groupPattern, options: []) {
        let range = NSRange(svgContent.startIndex..., in: svgContent)

        regex.enumerateMatches(in: svgContent, options: [], range: range) { match, _, _ in
            guard let matchRange = match?.range, let swiftRange = Range(matchRange, in: svgContent) else { return }
            let groupTag = String(svgContent[swiftRange])

            // Extract data-equation-id attribute
            var id = UUID().uuidString
            if let idRegex = try? NSRegularExpression(pattern: #"data-equation-id="([^"]+)""#),
               let idMatch = idRegex.firstMatch(in: groupTag, range: NSRange(groupTag.startIndex..., in: groupTag)),
               idMatch.numberOfRanges > 1,
               let idRange = Range(idMatch.range(at: 1), in: groupTag) {
                id = String(groupTag[idRange])
            }

            // Extract data-latex attribute
            if let latexRegex = try? NSRegularExpression(pattern: #"data-latex="([^"]+)""#),
               let latexMatch = latexRegex.firstMatch(in: groupTag, range: NSRange(groupTag.startIndex..., in: groupTag)),
               latexMatch.numberOfRanges > 1,
               let latexRange = Range(latexMatch.range(at: 1), in: groupTag) {

                // Decode HTML entities
                let latex = unescapeXML(String(groupTag[latexRange]))

                // Extract label from latex
                var label = "imported\(equations.count + 1)"
                if let labelRegex = try? NSRegularExpression(pattern: #"\\label\{([\w:.-]+)\}"#),
                   let labelMatch = labelRegex.firstMatch(in: latex, range: NSRange(latex.startIndex..., in: latex)),
                   labelMatch.numberOfRanges > 1,
                   let labelRange = Range(labelMatch.range(at: 1), in: latex) {
                    label = String(latex[labelRange])
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

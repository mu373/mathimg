import SwiftUI
import UniformTypeIdentifiers

extension UTType {
    static var matheditDocument: UTType {
        UTType("com.mathedit.document") ?? UTType(exportedAs: "com.mathedit.document", conformingTo: .json)
    }
}

/// Document model for .mathedit files
final class MathEditDocument: ReferenceFileDocument {
    typealias Snapshot = ProjectData

    @Published var projectData: ProjectData
    @Published var equations: [Equation] = []
    @Published var frontmatter: DocumentFrontmatter = DocumentFrontmatter()
    @Published var renderedSVGs: [String: String] = [:]
    private var lastRenderedLatex: [String: String] = [:]
    /// Cache of pasted SVGs by normalized latex (for instant preview on paste)
    private var pastedSvgCache: [String: String] = [:]

    static var readableContentTypes: [UTType] { [.matheditDocument, .json] }
    static var writableContentTypes: [UTType] { [.matheditDocument] }

    init() {
        self.projectData = ProjectData.new(
            document: "E = mc^2\n\\label{eq:einstein}\n\n---\n\n\\int_0^\\infty e^{-x} dx = 1"
        )
    }

    required init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else {
            throw CocoaError(.fileReadCorruptFile)
        }
        self.projectData = try JSONDecoder().decode(ProjectData.self, from: data)
    }

    func snapshot(contentType: UTType) throws -> ProjectData {
        var snapshot = projectData
        snapshot.updateTimestamp()
        return snapshot
    }

    func fileWrapper(snapshot: ProjectData, configuration: WriteConfiguration) throws -> FileWrapper {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(snapshot)
        return FileWrapper(regularFileWithContents: data)
    }

    /// Update document content from web editor
    func updateDocument(_ content: String) {
        objectWillChange.send()
        projectData.document = content
    }

    /// Normalize latex for cache matching (strip label and whitespace)
    private func normalizeLatexForCache(_ latex: String) -> String {
        latex.replacingOccurrences(
            of: #"\\label\{[^}]*\}"#,
            with: "",
            options: .regularExpression
        ).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Update equations from parsed web content
    func updateEquations(_ newEquations: [Equation], frontmatter: DocumentFrontmatter) {
        self.frontmatter = frontmatter

        // Ensure unique IDs - if duplicates exist, generate new ones
        var seenIds = Set<String>()
        var updatedEquations: [Equation] = []
        for var eq in newEquations {
            if seenIds.contains(eq.id) {
                // Duplicate ID - generate a new one
                eq = Equation(
                    id: UUID().uuidString,
                    label: eq.label,
                    latex: eq.latex,
                    startLine: eq.startLine,
                    endLine: eq.endLine,
                    color: eq.color,
                    renderedSVG: nil
                )
            }
            seenIds.insert(eq.id)

            // Preserve rendered SVG if available
            if let svg = renderedSVGs[eq.id] {
                eq.renderedSVG = svg
            }
            updatedEquations.append(eq)
        }
        self.equations = updatedEquations

        // Check for cached pasted SVGs first
        var equationsToRender: [Equation] = []
        for eq in updatedEquations {
            if renderedSVGs[eq.id] == nil || lastRenderedLatex[eq.id] != eq.latex {
                // Check pasted SVG cache by normalized latex
                let normalized = normalizeLatexForCache(eq.latex)
                if let cachedSvg = pastedSvgCache[normalized] {
                    // Use cached SVG from paste
                    renderedSVGs[eq.id] = cachedSvg
                    lastRenderedLatex[eq.id] = eq.latex
                    pastedSvgCache.removeValue(forKey: normalized)
                } else {
                    equationsToRender.append(eq)
                }
            }
        }

        if !equationsToRender.isEmpty {
            RenderService.shared.render(equations: equationsToRender, frontmatter: frontmatter, document: self)
        }
    }

    /// Update rendered SVG for an equation
    func updateRenderedSVG(equationId: String, svg: String) {
        renderedSVGs[equationId] = svg
        if let index = equations.firstIndex(where: { $0.id == equationId }) {
            equations[index].renderedSVG = svg
            lastRenderedLatex[equationId] = equations[index].latex
        }
    }

    /// Duplicate info captured at check time to avoid race conditions
    struct DuplicateInfo {
        let label: String
        let hasExplicitLabel: Bool
        let existingSvg: String?
    }

    /// Check if SVG contains duplicate equations (by ID first, then by latex content, then by label)
    /// Returns all info needed for dialog to avoid race conditions with async equation updates
    func checkSvgForDuplicates(_ svgContent: String) -> (hasDuplicates: Bool, duplicates: [DuplicateInfo]) {
        let result = parseSvg(svgContent)

        var duplicates: [DuplicateInfo] = []
        for eq in result.equations {
            // Try to find by ID first
            var existing = equations.first(where: { $0.id == eq.id })

            // Fallback 1: find by normalized latex content (IDs can change between copy/paste)
            if existing == nil {
                let incomingNormalized = normalizeLatexForCache(eq.latex)
                existing = equations.first(where: { normalizeLatexForCache($0.latex) == incomingNormalized })
            }

            // Fallback 2: find by label (for labeled equations)
            if existing == nil && !eq.label.isEmpty && !eq.label.hasPrefix("eq") {
                existing = equations.first(where: { $0.label == eq.label })
            }

            if let existing = existing {
                let hasExplicitLabel = existing.latex.contains("\\label{")
                let existingSvg = renderedSVGs[existing.id]
                duplicates.append(DuplicateInfo(
                    label: existing.label,
                    hasExplicitLabel: hasExplicitLabel,
                    existingSvg: existingSvg
                ))
            }
        }
        return (hasDuplicates: !duplicates.isEmpty, duplicates: duplicates)
    }

    /// Import equations from SVG content
    /// - Parameters:
    ///   - svgContent: SVG content containing equation metadata
    ///   - overwrite: Replace existing equation if duplicate found
    ///   - keepBoth: Keep both equations with different labels if duplicate found
    ///   - insertAfterLine: Insert after the equation containing this line (nil = append at end)
    func importSvgEquations(_ svgContent: String, overwrite: Bool = false, keepBoth: Bool = false, insertAfterLine: Int? = nil) {
        let result = parseSvg(svgContent)
        guard !result.equations.isEmpty else { return }

        // Cache the pasted SVG for instant preview (indexed by normalized latex)
        for eq in result.equations {
            let normalized = normalizeLatexForCache(eq.latex)
            pastedSvgCache[normalized] = svgContent
        }

        var newDoc = projectData.document

        for eq in result.equations {
            // Check for duplicate by ID
            let existingEq = equations.first(where: { $0.id == eq.id })
            let isDuplicate = existingEq != nil

            let finalLatex = eq.latex

            if isDuplicate && overwrite {
                if let existingEq = existingEq {
                    var lines = newDoc.components(separatedBy: "\n")

                    // Find separator before equation
                    var separatorLine = existingEq.startLine - 1
                    while separatorLine >= 0 && lines[separatorLine].trimmingCharacters(in: .whitespaces).isEmpty {
                        separatorLine -= 1
                    }

                    let hasSeparatorBefore = separatorLine >= 0 &&
                        lines[separatorLine].trimmingCharacters(in: .whitespaces).hasPrefix("---")
                    let startReplaceLine = hasSeparatorBefore ? separatorLine : existingEq.startLine

                    // Find separator after equation
                    var afterLine = existingEq.endLine + 1
                    while afterLine < lines.count && lines[afterLine].trimmingCharacters(in: .whitespaces).isEmpty {
                        afterLine += 1
                    }
                    let hasSeparatorAfter = afterLine < lines.count &&
                        lines[afterLine].trimmingCharacters(in: .whitespaces).hasPrefix("---")
                    let endReplaceLine = hasSeparatorAfter ? afterLine : existingEq.endLine

                    let beforeLines = Array(lines[0..<startReplaceLine])
                    let afterLines = afterLine < lines.count ? Array(lines[(endReplaceLine + 1)...]) : []

                    let replacement = hasSeparatorBefore
                        ? ["---", "", finalLatex, ""]
                        : [finalLatex]

                    lines = beforeLines + replacement + afterLines
                    newDoc = lines.joined(separator: "\n")
                }
            } else if !isDuplicate || keepBoth {
                // Find insertion point based on cursor position
                if let insertLine = insertAfterLine,
                   let currentEq = equations.first(where: { $0.startLine <= insertLine && insertLine <= $0.endLine }) {
                    // Insert after the current equation
                    var lines = newDoc.components(separatedBy: "\n")

                    // Find where the current equation ends (including trailing empty lines)
                    var insertionLine = currentEq.endLine + 1

                    // Skip trailing empty lines after the current equation
                    while insertionLine < lines.count && lines[insertionLine].trimmingCharacters(in: .whitespaces).isEmpty {
                        insertionLine += 1
                    }

                    // Check if there's a separator after
                    let hasSeparatorAfter = insertionLine < lines.count &&
                        lines[insertionLine].trimmingCharacters(in: .whitespaces).hasPrefix("---")

                    if hasSeparatorAfter {
                        let beforeLines = Array(lines[0..<insertionLine])
                        let afterLines = Array(lines[insertionLine...])
                        lines = beforeLines + ["---", "", finalLatex, ""] + afterLines
                    } else {
                        let beforeLines = Array(lines[0..<insertionLine])
                        let afterLines = insertionLine < lines.count ? Array(lines[insertionLine...]) : []
                        lines = beforeLines + ["---", "", finalLatex, ""] + afterLines
                    }
                    newDoc = lines.joined(separator: "\n")
                } else {
                    // Append at end
                    let trimmedDoc = newDoc.trimmingCharacters(in: .whitespacesAndNewlines)

                    if trimmedDoc.isEmpty {
                        newDoc = "\(finalLatex)\n"
                    } else if trimmedDoc.hasSuffix("---") {
                        if !newDoc.hasSuffix("\n\n") {
                            newDoc = newDoc.trimmingCharacters(in: .newlines) + "\n\n"
                        }
                        newDoc += "\(finalLatex)\n\n"
                    } else {
                        if !newDoc.hasSuffix("\n\n") {
                            newDoc = newDoc.trimmingCharacters(in: .newlines) + "\n\n"
                        }
                        newDoc += "---\n\n\(finalLatex)\n\n"
                    }
                }
            }
        }

        updateDocument(newDoc)

        // Notify that document was imported (triggers editor sync)
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: .documentImported, object: nil)
        }
    }

    /// Generate a unique label by appending a number suffix
    private func generateUniqueLabel(baseLabel: String, existingLabels: Set<String>) -> String {
        var suffix = 2
        var newLabel = "\(baseLabel)-\(suffix)"
        while existingLabels.contains(newLabel) {
            suffix += 1
            newLabel = "\(baseLabel)-\(suffix)"
        }
        return newLabel
    }
}

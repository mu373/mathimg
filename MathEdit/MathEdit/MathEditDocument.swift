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

        // Trigger rendering for new equations or those with changed latex
        let equationsToRender = updatedEquations.filter { eq in
            renderedSVGs[eq.id] == nil || lastRenderedLatex[eq.id] != eq.latex
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

    /// Check if SVG contains duplicate equations (by ID first, then by label)
    func checkSvgForDuplicates(_ svgContent: String) -> (hasDuplicates: Bool, duplicateLabels: [String]) {
        let result = parseSvg(svgContent)
        let existingIds = Set(equations.map { $0.id })
        let existingLabels = Set(equations.map { $0.label })

        var duplicateLabels: [String] = []
        for eq in result.equations {
            if existingIds.contains(eq.id) || existingLabels.contains(eq.label) {
                duplicateLabels.append(eq.label)
            }
        }
        return (hasDuplicates: !duplicateLabels.isEmpty, duplicateLabels: duplicateLabels)
    }

    /// Import equations from SVG content
    func importSvgEquations(_ svgContent: String, overwrite: Bool = false, keepBoth: Bool = false) {
        let result = parseSvg(svgContent)
        guard !result.equations.isEmpty else { return }

        let existingIds = Set(equations.map { $0.id })
        let existingLabels = Set(equations.map { $0.label })
        var newDoc = projectData.document

        for eq in result.equations {
            // Check for duplicate by ID first, then by label
            let matchById = existingIds.contains(eq.id)
            let matchByLabel = existingLabels.contains(eq.label)
            let isDuplicate = matchById || matchByLabel

            // Determine the label to use
            var finalLabel = eq.label
            var finalLatex = eq.latex

            if isDuplicate && keepBoth {
                // Generate a unique label by appending a number
                finalLabel = generateUniqueLabel(baseLabel: eq.label, existingLabels: existingLabels)
                // Replace the label in latex if it exists
                if eq.latex.contains("\\label{") {
                    finalLatex = eq.latex.replacingOccurrences(
                        of: "\\label{\(eq.label)}",
                        with: "\\label{\(finalLabel)}"
                    )
                }
            }

            // Ensure latex has a label
            let hasLabel = finalLatex.contains("\\label{")
            let latexWithLabel = hasLabel ? finalLatex : "\(finalLatex)\n\\label{\(finalLabel)}"

            if isDuplicate && overwrite {
                // Find existing equation to replace (by ID first, then by label)
                let existingEq = equations.first(where: { $0.id == eq.id })
                    ?? equations.first(where: { $0.label == eq.label })

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
                        ? ["---", "", latexWithLabel, ""]
                        : [latexWithLabel]

                    lines = beforeLines + replacement + afterLines
                    newDoc = lines.joined(separator: "\n")
                }
            } else if !isDuplicate || keepBoth {
                // Append new equation (either not a duplicate, or keeping both)
                let trimmedDoc = newDoc.trimmingCharacters(in: .whitespacesAndNewlines)

                if trimmedDoc.isEmpty {
                    // Empty document - just add the equation without separator
                    newDoc = "\(latexWithLabel)\n"
                } else if trimmedDoc.hasSuffix("---") {
                    // Document already ends with separator - just add the equation
                    if !newDoc.hasSuffix("\n\n") {
                        newDoc = newDoc.trimmingCharacters(in: .newlines) + "\n\n"
                    }
                    newDoc += "\(latexWithLabel)\n\n"
                } else {
                    // Add separator before the new equation
                    if !newDoc.hasSuffix("\n\n") {
                        newDoc = newDoc.trimmingCharacters(in: .newlines) + "\n\n"
                    }
                    newDoc += "---\n\n\(latexWithLabel)\n\n"
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

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

    /// Check if SVG contains duplicate equations
    func checkSvgForDuplicates(_ svgContent: String) -> (hasDuplicates: Bool, duplicateLabels: [String]) {
        let result = parseSvg(svgContent)
        let existingIds = Set(equations.map { $0.id })
        let duplicates = result.equations.filter { existingIds.contains($0.id) }
        return (hasDuplicates: !duplicates.isEmpty, duplicateLabels: duplicates.map { $0.label })
    }

    /// Import equations from SVG content
    func importSvgEquations(_ svgContent: String, overwrite: Bool = false) {
        let result = parseSvg(svgContent)
        guard !result.equations.isEmpty else { return }

        let existingIds = Set(equations.map { $0.id })
        var newDoc = projectData.document

        for eq in result.equations {
            // Ensure latex has a label
            let hasLabel = eq.latex.contains("\\label{")
            let latexWithLabel = hasLabel ? eq.latex : "\(eq.latex)\n\\label{\(eq.label)}"

            if existingIds.contains(eq.id) && overwrite {
                // Find and replace existing equation
                if let existingEq = equations.first(where: { $0.id == eq.id }) {
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
            } else if !existingIds.contains(eq.id) {
                // Append new equation
                if !newDoc.hasSuffix("\n\n") {
                    if newDoc.hasSuffix("\n") {
                        newDoc += "\n"
                    } else {
                        newDoc += "\n\n"
                    }
                }
                newDoc += "---\n\n\(latexWithLabel)\n\n"
            }
        }

        updateDocument(newDoc)

        // Notify that document was imported (triggers editor sync)
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: .documentImported, object: nil)
        }
    }
}

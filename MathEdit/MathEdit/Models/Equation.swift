import Foundation

/// Represents a single LaTeX equation
struct Equation: Codable, Identifiable, Equatable, Hashable {
    let id: String
    var label: String
    var latex: String
    var startLine: Int
    var endLine: Int
    var color: String?

    /// Cached rendered SVG string
    var renderedSVG: String?

    static func new(latex: String = "", label: String? = nil) -> Equation {
        let id = UUID().uuidString
        return Equation(
            id: id,
            label: label ?? "eq\(id.prefix(4))",
            latex: latex,
            startLine: 0,
            endLine: 0,
            color: nil,
            renderedSVG: nil
        )
    }
}

/// Document frontmatter settings
struct DocumentFrontmatter: Codable, Equatable {
    var color: String?
    var colorPresets: [String: String]?

    init(color: String? = nil, colorPresets: [String: String]? = nil) {
        self.color = color
        self.colorPresets = colorPresets
    }
}

/// Bounding box for an equation
struct BBox: Codable, Equatable {
    var x: Double
    var y: Double
    var width: Double
    var height: Double
}

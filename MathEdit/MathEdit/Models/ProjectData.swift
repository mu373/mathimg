import Foundation

/// Project file format for .mathedit files
struct ProjectData: Codable {
    let version: String
    var metadata: ProjectMetadata
    var globalPreamble: String?
    var document: String  // Raw LaTeX document with --- separators

    struct ProjectMetadata: Codable {
        var name: String?
        var createdAt: String
        var updatedAt: String
        let generator: String
        let generatorVersion: String
    }

    static func new(document: String = "", globalPreamble: String? = nil, name: String? = nil) -> ProjectData {
        let now = ISO8601DateFormatter().string(from: Date())
        return ProjectData(
            version: "1.0.0",
            metadata: ProjectMetadata(
                name: name,
                createdAt: now,
                updatedAt: now,
                generator: "mathedit-mac",
                generatorVersion: "0.1.0"
            ),
            globalPreamble: globalPreamble,
            document: document
        )
    }

    mutating func updateTimestamp() {
        metadata.updatedAt = ISO8601DateFormatter().string(from: Date())
    }
}

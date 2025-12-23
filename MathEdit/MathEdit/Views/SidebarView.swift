import SwiftUI

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
                            Button("Copy LaTeX") {
                                NSPasteboard.general.clearContents()
                                NSPasteboard.general.setString(equation.latex, forType: .string)
                            }

                            if equation.renderedSVG != nil {
                                Button("Copy SVG") {
                                    NSPasteboard.general.clearContents()
                                    NSPasteboard.general.setString(equation.renderedSVG!, forType: .string)
                                }
                            }

                            Divider()

                            Button("Delete", role: .destructive) {
                                // Handled by parent
                            }
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

            Text(latexPreview.prefix(30))
                .font(.caption)
                .foregroundColor(.secondary)
                .lineLimit(1)
        }
        .padding(.vertical, 2)
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

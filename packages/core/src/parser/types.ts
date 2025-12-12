export interface ParsedEquation {
  id: string;           // UUID for React keys
  label: string;        // "eq:foo" or "eq1" (auto)
  latex: string;        // LaTeX code for this section
  startLine: number;    // Line number in document
  endLine: number;      // Line number in document
  color?: string;       // Per-equation color override
}

export interface DocumentFrontmatter {
  color?: string;
}

export interface ParsedDocument {
  frontmatter: DocumentFrontmatter;
  equations: ParsedEquation[];
}

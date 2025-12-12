import { ParsedEquation, DocumentFrontmatter, ParsedDocument } from './types';

function generateId(): string {
  // Fallback for environments without crypto.randomUUID (HTTP contexts)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Simple UUID v4 fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function extractLabel(latex: string): string | null {
  const match = latex.match(/\\label\{([^}]+)\}/);
  return match ? match[1] : null;
}

/**
 * Extract color directive from comment at end of content: % color: #ff0000
 * Only matches if it's the last non-empty line
 */
function extractColor(latex: string): string | null {
  const lines = latex.split('\n');
  // Find last non-empty line
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^%\s*color:\s*(.+)$/);
    return match ? match[1].trim() : null;
  }
  return null;
}

function parseFrontmatter(content: string): DocumentFrontmatter {
  const frontmatter: DocumentFrontmatter = {};
  const lines = content.split('\n');

  for (const line of lines) {
    // Skip comment lines
    if (line.trim().startsWith('%')) continue;

    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      if (key === 'color') {
        frontmatter.color = value.trim();
      }
    }
  }

  return frontmatter;
}

/**
 * Check if content looks like frontmatter (has uncommented key: value lines, no LaTeX)
 */
function isFrontmatter(content: string): boolean {
  const lines = content.split('\n');
  let hasKeyValue = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('%')) continue;

    // Check for LaTeX commands
    if (trimmed.includes('\\')) return false;

    // Check for key: value pattern
    if (/^\w+:\s*.+$/.test(trimmed)) {
      hasKeyValue = true;
    }
  }

  return hasKeyValue;
}

/**
 * Parse document with frontmatter and equations
 * Frontmatter is the first section if it contains key: value pairs (no LaTeX)
 * Equations are matched by position (index) for ID preservation
 */
export function parseDocumentWithFrontmatter(
  document: string,
  previousEquations?: ParsedEquation[]
): ParsedDocument {
  const lines = document.split('\n');
  const sections: ParsedEquation[] = [];
  let frontmatter: DocumentFrontmatter = {};

  let currentSection: string[] = [];
  let startLine = 0;
  let equationIndex = 0;
  let sectionIndex = 0;
  let isFirstSection = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for separator
    if (/^---+$/.test(line.trim())) {
      if (currentSection.length > 0) {
        const content = currentSection.join('\n').trim();
        if (content) {
          // Check if first section is frontmatter (contains key: value, no LaTeX commands)
          if (isFirstSection && isFrontmatter(content)) {
            frontmatter = parseFrontmatter(content);
          } else {
            const label = extractLabel(content) || `eq${++equationIndex}`;
            const color = extractColor(content);

            // Reuse ID from previous equation at same position, or generate new one
            const previousEq = previousEquations?.[sectionIndex];
            const id = previousEq?.id || generateId();

            sections.push({
              id,
              label,
              latex: content,
              startLine,
              endLine: i - 1,
              color: color || undefined,
            });

            sectionIndex++;
          }
          isFirstSection = false;
        }

        currentSection = [];
      }
      startLine = i + 1;
    } else {
      currentSection.push(line);
    }
  }

  // Last section
  if (currentSection.length > 0) {
    const content = currentSection.join('\n').trim();
    if (content) {
      // Check if first section is frontmatter
      if (isFirstSection && isFrontmatter(content)) {
        frontmatter = parseFrontmatter(content);
      } else {
        const label = extractLabel(content) || `eq${++equationIndex}`;
        const color = extractColor(content);

        const previousEq = previousEquations?.[sectionIndex];
        const id = previousEq?.id || generateId();

        sections.push({
          id,
          label,
          latex: content,
          startLine,
          endLine: lines.length - 1,
          color: color || undefined,
        });
      }
    }
  }

  return { frontmatter, equations: sections };
}

/**
 * Parse document and preserve IDs from previous parse when equations match
 * Equations are matched by position (index) in the document
 * @deprecated Use parseDocumentWithFrontmatter instead
 */
export function parseDocument(
  document: string,
  previousEquations?: ParsedEquation[]
): ParsedEquation[] {
  return parseDocumentWithFrontmatter(document, previousEquations).equations;
}

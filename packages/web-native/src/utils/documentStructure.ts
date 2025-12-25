import type { editor as MonacoEditor } from 'monaco-editor';

/**
 * Represents a section in the document (between --- separators)
 */
export interface DocumentSection {
  /** 1-based start line (first content line after separator, or 1 for first section) */
  startLine: number;
  /** 1-based end line (last content line before next separator, or last line) */
  endLine: number;
  /** Whether this section has any non-whitespace content */
  hasContent: boolean;
  /** Whether this is the last section in the document */
  isLast: boolean;
}

/**
 * Analyzes document structure from Monaco editor model
 * Returns sections based on --- separators, including empty sections
 */
export function analyzeDocumentStructure(model: MonacoEditor.ITextModel): DocumentSection[] {
  const lineCount = model.getLineCount();
  const sections: DocumentSection[] = [];

  let sectionStart = 1;

  for (let line = 1; line <= lineCount; line++) {
    const content = model.getLineContent(line).trim();

    if (content === '---') {
      // End current section before this separator
      if (line > sectionStart) {
        const hasContent = checkSectionHasContent(model, sectionStart, line - 1);
        sections.push({
          startLine: sectionStart,
          endLine: line - 1,
          hasContent,
          isLast: false,
        });
      }
      // Next section starts after this separator
      sectionStart = line + 1;
    }
  }

  // Add final section (after last separator or entire document if no separators)
  if (sectionStart <= lineCount) {
    const hasContent = checkSectionHasContent(model, sectionStart, lineCount);
    sections.push({
      startLine: sectionStart,
      endLine: lineCount,
      hasContent,
      isLast: true,
    });
  } else if (sectionStart === lineCount + 1) {
    // Document ends with a separator, add empty trailing section
    sections.push({
      startLine: sectionStart,
      endLine: sectionStart,
      hasContent: false,
      isLast: true,
    });
  }

  // Mark the actual last section
  if (sections.length > 0) {
    sections[sections.length - 1].isLast = true;
  }

  return sections;
}

/**
 * Check if a section has any non-whitespace content
 */
function checkSectionHasContent(
  model: MonacoEditor.ITextModel,
  startLine: number,
  endLine: number
): boolean {
  for (let line = startLine; line <= endLine; line++) {
    const content = model.getLineContent(line).trim();
    if (content !== '' && content !== '---') {
      return true;
    }
  }
  return false;
}

/**
 * Find which section contains the given cursor line (1-based)
 */
export function findSectionAtLine(
  sections: DocumentSection[],
  cursorLine: number
): DocumentSection | null {
  for (const section of sections) {
    if (cursorLine >= section.startLine && cursorLine <= section.endLine) {
      return section;
    }
  }
  return null;
}

/**
 * Find the index of the section containing the cursor
 */
export function findSectionIndexAtLine(
  sections: DocumentSection[],
  cursorLine: number
): number {
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (cursorLine >= section.startLine && cursorLine <= section.endLine) {
      return i;
    }
  }
  // If cursor is after last section (e.g., on trailing separator), return last section
  if (sections.length > 0 && cursorLine > sections[sections.length - 1].endLine) {
    return sections.length - 1;
  }
  return -1;
}

/**
 * Check if there's an empty trailing section at the end of document
 */
export function hasEmptyTrailingSection(sections: DocumentSection[]): DocumentSection | null {
  if (sections.length === 0) return null;
  const last = sections[sections.length - 1];
  if (last.isLast && !last.hasContent) {
    return last;
  }
  return null;
}

/**
 * Get the middle line of a section (for cursor positioning)
 */
export function getSectionMiddleLine(section: DocumentSection): number {
  return Math.floor((section.startLine + section.endLine) / 2);
}

/**
 * Calculate cursor position for a new equation section
 * Returns the line where cursor should be placed (middle of 3 empty lines)
 */
export function getNewEquationCursorLine(
  insertAfterLine: number,
  isAppending: boolean
): number {
  // Structure: [---] [empty] [cursor] [empty] [---]?
  // For append: insertAfterLine + 2 (after ---, skip 1 empty)
  // For insert: same logic
  return insertAfterLine + 2;
}

/**
 * Content to insert for a new equation section
 */
export const NEW_EQUATION_CONTENT = {
  // When appending at end: no trailing ---
  append: '\n---\n\n\n',
  // When inserting between: need trailing ---
  insert: '\n\n\n---\n',
};

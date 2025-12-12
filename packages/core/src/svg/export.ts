import JSZip from 'jszip';
import { ParsedEquation } from '../parser/types';

export async function exportAllSVGs(
  equations: ParsedEquation[],
  renderedSvgs: Record<string, string>
): Promise<void> {
  const zip = new JSZip();

  for (const eq of equations) {
    const svg = renderedSvgs[eq.id];
    if (svg) {
      // Sanitize label for filename
      const filename = `${eq.label.replace(/[^a-zA-Z0-9-_]/g, '_')}.svg`;
      zip.file(filename, svg);
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mathimg-equations-${Date.now()}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportSingleSVG(label: string, svg: string): void {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const filename = `${label.replace(/[^a-zA-Z0-9-_]/g, '_')}.svg`;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

import { ProjectData } from './types';

export async function openProject(file: File): Promise<ProjectData> {
  const text = await file.text();
  const data = JSON.parse(text) as ProjectData;

  // Validate version
  if (!data.version || data.version !== "1.0.0") {
    throw new Error("Unsupported project version");
  }

  return data;
}

export function openProjectFromInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      resolve(file || null);
    };
    input.click();
  });
}

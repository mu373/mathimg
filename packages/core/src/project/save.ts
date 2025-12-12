import { ProjectData } from './types';

export function createProjectData(
  document: string,
  globalPreamble?: string,
  name?: string
): ProjectData {
  const now = new Date().toISOString();

  return {
    version: "1.0.0",
    metadata: {
      name,
      createdAt: now,
      updatedAt: now,
      generator: "mathimg-web",
      generatorVersion: "0.1.0",
    },
    globalPreamble,
    document,
  };
}

export function downloadProject(data: ProjectData, sourceFileName?: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sourceFileName || `mathimg-project-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

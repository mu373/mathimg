import { Menu, FolderOpen, Save, Download, FileUp, FilePlus } from 'lucide-react';
import { useEditorStore } from '@/store';
import { openProjectFromInput, downloadProject, exportAllSVGs, importSvgFromInput } from '@mathimg/core';
import { toast } from './ui/use-toast';
import { Button } from './ui/button';
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from './ui/menubar';
import { TabBar } from './TabBar';

export function Toolbar() {
  const {
    newProject,
    saveProject,
    openProject,
    importSvgEquations,
    getActiveTab,
  } = useEditorStore();

  const activeTab = getActiveTab();

  const handleOpenProject = async () => {
    try {
      const file = await openProjectFromInput();
      if (!file) return;

      const data = await import('@mathimg/core').then(mod => mod.openProject(file));
      openProject(data, file.name);
      toast({ title: 'Project opened successfully' });
    } catch (error) {
      toast({
        title: 'Failed to open project',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleSaveProject = () => {
    try {
      const { data, sourceFileName } = saveProject();
      downloadProject(data, sourceFileName);
      toast({ title: 'Project saved successfully' });
    } catch (error) {
      toast({
        title: 'Failed to save project',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleExportAll = async () => {
    if (!activeTab) return;
    try {
      await exportAllSVGs(activeTab.parsedEquations, activeTab.renderedSvgs);
      toast({ title: 'SVGs exported successfully' });
    } catch (error) {
      toast({
        title: 'Failed to export SVGs',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleImportSvg = async () => {
    try {
      const svgContent = await importSvgFromInput();
      if (!svgContent) return;

      await importSvgEquations(svgContent);
      toast({ title: 'SVG imported successfully' });
    } catch (error) {
      toast({
        title: 'Failed to import SVG',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex items-center border-b border-border bg-muted min-h-[40px]">
      <Menubar className="border-0 rounded-none bg-transparent shadow-none h-auto p-0">
        <MenubarMenu>
          <MenubarTrigger className="px-3 py-2 rounded-none border-r border-border data-[state=open]:bg-accent">
            <Menu className="size-4" />
          </MenubarTrigger>
          <MenubarContent align="start" sideOffset={8} alignOffset={8}>
            <MenubarItem onClick={newProject}>
              <FilePlus className="size-4" />
              New Project
            </MenubarItem>
            <MenubarItem onClick={handleOpenProject}>
              <FolderOpen className="size-4" />
              Open Project...
            </MenubarItem>
            <MenubarItem onClick={handleSaveProject}>
              <Save className="size-4" />
              Save Project
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={handleImportSvg}>
              <FileUp className="size-4" />
              Import SVG...
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
      <TabBar />
      <Button onClick={handleExportAll} variant="outline" size="sm" className="mx-3 my-1" disabled={!activeTab}>
        <Download className="size-4" />
        Export All
      </Button>
    </div>
  );
}

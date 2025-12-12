import { useState, useRef, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { useEditorStore } from '@/store';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  tabId: string | null;
}

interface RenameState {
  isRenaming: boolean;
  tabId: string | null;
  value: string;
}

interface SortableTabProps {
  id: string;
  isActive: boolean;
  onSelect: () => void;
  onClose: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  label: string;
  isDirty?: boolean;
  isRenaming?: boolean;
  renameValue?: string;
  onRenameChange?: (value: string) => void;
  onRenameSubmit?: () => void;
  onRenameCancel?: () => void;
}

function SortableTab({
  id,
  isActive,
  onSelect,
  onClose,
  onContextMenu,
  onDoubleClick,
  label,
  isDirty,
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
}: SortableTabProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onRenameSubmit?.();
    } else if (e.key === 'Escape') {
      onRenameCancel?.();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={isRenaming ? undefined : onSelect}
      onDoubleClick={isRenaming ? undefined : onDoubleClick}
      onContextMenu={onContextMenu}
      className={`flex items-center gap-2 px-3 py-2 text-sm border-r border-border min-w-[120px] max-w-[200px] group cursor-grab active:cursor-grabbing ${
        isActive
          ? 'bg-background text-foreground border-b-2 border-b-primary'
          : 'text-muted-foreground hover:bg-accent'
      } ${isDragging ? 'bg-muted' : ''}`}
      {...(isRenaming ? {} : { ...attributes, ...listeners })}
    >
      {isRenaming ? (
        <input
          ref={inputRef}
          type="text"
          value={renameValue}
          onChange={(e) => onRenameChange?.(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={onRenameSubmit}
          className="flex-1 bg-transparent border border-primary rounded px-1 py-0 text-sm outline-none min-w-0"
        />
      ) : (
        <span className="truncate flex-1 text-left">{label}</span>
      )}
      {isDirty && !isRenaming && (
        <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" />
      )}
      {!isRenaming && (
        <span
          onClick={onClose}
          className="p-0.5 rounded hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        >
          <X className="w-3 h-3" />
        </span>
      )}
    </div>
  );
}

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, reorderTabs, tabOrder, addTab, renameTab } = useEditorStore();
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    tabId: null,
  });
  const [renameState, setRenameState] = useState<RenameState>({
    isRenaming: false,
    tabId: null,
    value: '',
  });
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const tabsById = new Map(tabs.map((tab) => [tab.id, tab]));
  const orderedTabIds = tabOrder.filter((id) => tabsById.has(id));

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu((prev) => ({ ...prev, isOpen: false }));
      }
    };
    if (contextMenu.isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [contextMenu.isOpen]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderTabs(active.id as string, over.id as string);
    }
  };

  const handleCloseTab = (e: React.MouseEvent, tabId: string, isDirty: boolean) => {
    e.stopPropagation();
    if (isDirty) {
      const confirmed = window.confirm('You have unsaved changes. Close anyway?');
      if (!confirmed) return;
    }
    closeTab(tabId);
  };

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      tabId,
    });
  };

  const handleStartRename = (tabId?: string) => {
    const targetTabId = tabId || contextMenu.tabId;
    if (!targetTabId) return;
    const tab = tabsById.get(targetTabId);
    if (!tab) return;

    setRenameState({
      isRenaming: true,
      tabId: targetTabId,
      value: tab.fileName,
    });
    setContextMenu((prev) => ({ ...prev, isOpen: false }));
  };

  const handleRenameSubmit = () => {
    if (renameState.tabId && renameState.value.trim()) {
      renameTab(renameState.tabId, renameState.value.trim());
    }
    setRenameState({ isRenaming: false, tabId: null, value: '' });
  };

  const handleRenameCancel = () => {
    setRenameState({ isRenaming: false, tabId: null, value: '' });
  };

  const handleCloseFromMenu = () => {
    if (!contextMenu.tabId) return;
    const tab = tabsById.get(contextMenu.tabId);
    if (!tab) return;

    if (tab.isDirty) {
      const confirmed = window.confirm('You have unsaved changes. Close anyway?');
      if (!confirmed) {
        setContextMenu((prev) => ({ ...prev, isOpen: false }));
        return;
      }
    }
    closeTab(contextMenu.tabId);
    setContextMenu((prev) => ({ ...prev, isOpen: false }));
  };

  return (
    <>
      <div className="flex-1 flex items-center overflow-x-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={orderedTabIds} strategy={horizontalListSortingStrategy}>
            {orderedTabIds.map((tabId) => {
              const tab = tabsById.get(tabId);
              if (!tab) return null;

              const isRenamingThis = renameState.isRenaming && renameState.tabId === tab.id;
              return (
                <SortableTab
                  key={tab.id}
                  id={tab.id}
                  isActive={tab.id === activeTabId}
                  onSelect={() => setActiveTab(tab.id)}
                  onClose={(e) => handleCloseTab(e, tab.id, tab.isDirty)}
                  onContextMenu={(e) => handleContextMenu(e, tab.id)}
                  onDoubleClick={() => handleStartRename(tab.id)}
                  label={tab.fileName}
                  isDirty={tab.isDirty}
                  isRenaming={isRenamingThis}
                  renameValue={isRenamingThis ? renameState.value : undefined}
                  onRenameChange={(value) => setRenameState((prev) => ({ ...prev, value }))}
                  onRenameSubmit={handleRenameSubmit}
                  onRenameCancel={handleRenameCancel}
                />
              );
            })}
          </SortableContext>
        </DndContext>
        <button
          onClick={() => addTab()}
          className="flex items-center justify-center w-8 h-8 text-muted-foreground hover:text-foreground hover:bg-accent rounded mx-1"
          title="New tab"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Context Menu */}
      {contextMenu.isOpen && (
        <div
          ref={contextMenuRef}
          className="fixed bg-popover border border-border rounded-md shadow-lg py-1 z-50 min-w-[120px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => handleStartRename()}
            className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent"
          >
            Rename
          </button>
          <button
            onClick={handleCloseFromMenu}
            className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent text-destructive"
          >
            Close
          </button>
        </div>
      )}
    </>
  );
}

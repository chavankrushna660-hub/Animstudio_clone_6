import React, { useState } from 'react';
import CustomColorPicker from './CustomColorPicker';
import { 
  Folder, 
  ChevronRight, 
  ChevronDown, 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock, 
  FolderPlus, 
  Link, 
  Unlink, 
  Trash2, 
  Maximize2,
  ChevronLeft,
  Image as ImageIcon,
  Type as TextIcon,
  Sparkles,
  Layers as LayerIcon,
  Box,
  Circle,
  Car,
  Smile,
  Armchair,
  Copy,
  PaintBucket,
  CheckSquare,
  Edit2,
  Check,
  GitCommit
} from 'lucide-react';
import { VectorObject, Layer } from '../types';
import { getDailyLimitStatus } from '../utils/engine3D';
import { sanitizeString } from '../utils/securityGuard';

interface LeftPanelProps {
  objects: { [id: string]: VectorObject };
  selectedObjectId: string | null;
  setSelectedObjectId: (id: string | null) => void;
  updateObject: (id: string, updates: Partial<VectorObject>) => void;
  deleteObject: (id: string) => void;
  layers: Layer[];
  setLayers: React.Dispatch<React.SetStateAction<Layer[]>>;
  activeLayerId: string;
  setActiveLayerId: (id: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  groupObjects: (ids: string[]) => void;
  activeTool: string;
  add3DModel?: (type: 'car' | 'character' | 'chair' | 'sphere' | 'box' | 'sword') => void;
  addCustom3DModel?: (mesh: any, filename: string) => void;
  add360Object?: (selectedIds: string[]) => void;
  currentUser: string | null;
  is360WizardActive?: boolean;
  draft360Views?: any[];
  draftAnchorId?: string | null;
  onionSkinEnabled360?: boolean;
  setOnionSkinEnabled360?: (val: boolean) => void;
  start360Wizard?: () => void;
  addDraft360View?: (drawingId: string, name: string, angle: number) => void;
  cancel360Wizard?: () => void;
  compile360Wizard?: (containerName: string) => void;
  adaptiveSubdivisionEnabled: boolean;
  setAdaptiveSubdivisionEnabled: (val: boolean) => void;
  adaptiveSubdivisionPoints: number;
  setAdaptiveSubdivisionPoints: (val: number) => void;
  duplicateObject: (id: string, offset?: { x: number; y: number }) => string | null;
  duplicateLassoBatch?: () => void;
  lassoPoints?: any[];
  setLassoPoints?: React.Dispatch<React.SetStateAction<any[]>>;
  fillToolColor?: string;
  setFillToolColor?: (val: string) => void;
  toolbarCollapsed?: boolean;
  applyFillForever?: boolean;
  setApplyFillForever?: (val: boolean) => void;
  ignoreInnerDrawings?: boolean;
  setIgnoreInnerDrawings?: React.Dispatch<React.SetStateAction<boolean>>;
  applyColorFillToSelected?: () => void;
}

export default function LeftPanel({
  objects,
  selectedObjectId,
  setSelectedObjectId,
  updateObject,
  deleteObject,
  layers,
  setLayers,
  activeLayerId,
  setActiveLayerId,
  open,
  setOpen,
  groupObjects,
  activeTool,
  add3DModel,
  addCustom3DModel,
  add360Object,
  currentUser,
  is360WizardActive = false,
  draft360Views = [],
  draftAnchorId = null,
  onionSkinEnabled360 = true,
  setOnionSkinEnabled360,
  start360Wizard,
  addDraft360View,
  cancel360Wizard,
  compile360Wizard,
  adaptiveSubdivisionEnabled,
  setAdaptiveSubdivisionEnabled,
  adaptiveSubdivisionPoints,
  setAdaptiveSubdivisionPoints,
  duplicateObject,
  duplicateLassoBatch,
  lassoPoints,
  setLassoPoints,
  fillToolColor,
  setFillToolColor,
  toolbarCollapsed = false,
  applyFillForever,
  setApplyFillForever,
  ignoreInnerDrawings = true,
  setIgnoreInnerDrawings,
  applyColorFillToSelected,
}: LeftPanelProps) {
  const [expandedNodes, setExpandedNodes] = useState<{ [id: string]: boolean }>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenamingText] = useState('');
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingLayerName, setEditingLayerName] = useState<string>('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [selected360Ids, setSelected360Ids] = useState<string[]>([]);
  const [customViewName, setCustomViewName] = useState('Front View');
  const [customViewAngle, setCustomViewAngle] = useState(0);
  const [masterContainerName, setMasterContainerName] = useState('Master_360_Character');
  const [is3DLibraryOpen, setIs3DLibraryOpen] = useState(true);


  // Toggle node expansion
  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Start inline renaming
  const startRename = (obj: VectorObject, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(obj.id);
    setRenamingText(obj.name);
  };

  const handleRenameSave = (id: string) => {
    if (renameText.trim()) {
      const sanitized = sanitizeString(renameText.trim());
      if (sanitized) {
        updateObject(id, { name: sanitized });
      }
    }
    setRenamingId(null);
  };

  // Visibility toggle
  const toggleVisibility = (obj: VectorObject, e: React.MouseEvent) => {
    e.stopPropagation();
    updateObject(obj.id, { isHidden: !obj.isHidden });
  };

  // Lock toggle
  const toggleLock = (obj: VectorObject, e: React.MouseEvent) => {
    e.stopPropagation();
    updateObject(obj.id, { isLocked: !obj.isLocked });
  };

  // Drag and Drop Parenting
  const handleDragStart = (id: string, e: React.DragEvent) => {
    setDraggedId(id);
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetParentId: string | null, e: React.DragEvent) => {
    e.preventDefault();
    const childId = e.dataTransfer.getData('text/plain') || draggedId;
    if (!childId || childId === targetParentId) return;

    // Detect Circular reference
    if (targetParentId) {
      let current = objects[targetParentId];
      while (current && current.parentId) {
        if (current.parentId === childId) {
          alert("Circular parent relationship not allowed!");
          return;
        }
        current = objects[current.parentId];
      }
    }

    // Set new parent
    const child = objects[childId];
    const oldParentId = child.parentId;

    // Remove child from old parent's children list
    if (oldParentId) {
      const oldParent = objects[oldParentId];
      updateObject(oldParentId, {
        childrenIds: oldParent.childrenIds.filter(id => id !== childId)
      });
    }

    // Add child to new parent's children list
    if (targetParentId) {
      const targetParent = objects[targetParentId];
      updateObject(targetParentId, {
        childrenIds: [...targetParent.childrenIds, childId]
      });
    }

    // Update child's parent pointer
    updateObject(childId, { parentId: targetParentId });
    setDraggedId(null);
  };

  // Group all selected objects
  const handleGroupSelected = () => {
    if (selectedObjectId) {
      groupObjects([selectedObjectId]);
    }
  };

  // Advanced Layer operations
  const handleAddLayer = () => {
    if (layers.length >= 50) {
      alert("App Safety Guard: Maximum limit is 50 layers per project to maintain high rendering performance.");
      return;
    }
    const defaultName = `Layer ${layers.length + 1}`;
    const name = sanitizeString(defaultName) || defaultName;
    const id = `layer_${Date.now()}`;
    const nextZ = layers.length > 0 ? Math.max(...layers.map(l => l.zIndex)) + 1 : 1;
    const newLayer: Layer = {
      id,
      name,
      zIndex: nextZ,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
    };
    (newLayer as any).blurAmount = 0;
    setLayers(prev => [...prev, newLayer]);
    setActiveLayerId(id);
  };

  const handleDeleteLayer = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (layers.length <= 1) {
      alert("Must keep at least one layer!");
      return;
    }
    setLayers(prev => prev.filter(l => l.id !== id));
    if (activeLayerId === id) {
      const remaining = layers.filter(l => l.id !== id);
      setActiveLayerId(remaining[0].id);
    }
  };

  const moveLayer = (index: number, dir: 'up' | 'down', e: React.MouseEvent) => {
    e.stopPropagation();
    const sorted = [...layers].sort((a, b) => b.zIndex - a.zIndex);
    const targetIdx = sorted.findIndex(l => l.id === layers[index].id);
    const swapIdx = dir === 'up' ? targetIdx - 1 : targetIdx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    // Swap position in sorted array
    const temp = sorted[targetIdx];
    sorted[targetIdx] = sorted[swapIdx];
    sorted[swapIdx] = temp;

    // Update z-indexes accordingly
    const updated = sorted.map((layer, idx) => ({
      ...layer,
      zIndex: sorted.length - idx
    }));

    setLayers(updated);
  };

  const updateLayerProp = (layerId: string, updates: Partial<Layer & { blurAmount: number }>) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, ...updates } as Layer : l));
  };

  const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  // Render object item recursively for hierarchy representation
  const renderTreeItem = (obj: VectorObject, depth: number) => {
    const hasChildren = obj.childrenIds.length > 0;
    const isExpanded = !!expandedNodes[obj.id];
    const isSelected = selectedObjectId === obj.id;

    return (
      <div key={obj.id} className="flex flex-col">
        <div
          draggable={!isTouchDevice}
          onDragStart={(e) => handleDragStart(obj.id, e)}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(obj.id, e)}
          onClick={() => {
            const effLayerId = obj.layerId || (layers && layers[0] ? layers[0].id : 'layer_1');
            if (effLayerId !== activeLayerId) return;
            if (selectedObjectId === obj.id) {
              setSelectedObjectId(null);
            } else {
              setSelectedObjectId(obj.id);
            }
          }}
          onTouchEnd={(e) => {
            // Avoid triggering when tapping inner buttons or inputs
            const target = e.target as HTMLElement;
            if (target.closest('button') || target.closest('input')) {
              return;
            }
            e.preventDefault(); // Stop synthetic click delay and bypass draggable touch interference on mobile screens
            const effLayerId = obj.layerId || (layers && layers[0] ? layers[0].id : 'layer_1');
            if (effLayerId !== activeLayerId) return;
            if (selectedObjectId === obj.id) {
              setSelectedObjectId(null);
            } else {
              setSelectedObjectId(obj.id);
            }
          }}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          className={`flex items-center justify-between py-1.5 px-2 rounded-xl group/item transition-colors select-none cursor-pointer ${
            isSelected 
              ? 'bg-amber-500/15 border border-amber-400/30 text-amber-300' 
              : 'border border-transparent hover:bg-neutral-800/50 text-neutral-300'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Collapse Arrow */}
            {hasChildren ? (
              <button
                onClick={(e) => toggleExpand(obj.id, e)}
                className="p-0.5 rounded hover:bg-neutral-700 text-neutral-400"
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <div className="w-4.5"></div>
            )}

            {/* Type Icon */}
            {obj.type === 'image' ? (
              <ImageIcon className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
            ) : obj.type === 'text' ? (
              <TextIcon className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
            )}

            {/* Editable Name */}
            {renamingId === obj.id ? (
              <input
                type="text"
                value={renameText}
                onChange={(e) => setRenamingText(e.target.value)}
                onBlur={() => handleRenameSave(obj.id)}
                onKeyDown={(e) => e.key === 'Enter' && handleRenameSave(obj.id)}
                autoFocus
                className="bg-neutral-950 text-white border border-amber-500 text-xs px-1 py-0.5 rounded outline-none w-28 font-bold"
              />
            ) : (
              <div className="flex items-center gap-1 min-w-0 flex-1">
                <span 
                  onDoubleClick={(e) => startRename(obj, e)}
                  className="text-xs truncate font-bold group-hover/item:text-white transition-colors cursor-pointer"
                  title="Click to select/unselect, Double click or click pencil to rename"
                >
                  {obj.name}
                </span>
              </div>
            )}
          </div>

          {/* Quick Item Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                startRename(obj, e);
              }}
              className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-amber-400"
              title="Rename drawing"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => toggleVisibility(obj, e)}
              className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white"
              title="Show/Hide drawing"
            >
              {obj.isHidden ? <EyeOff className="w-3.5 h-3.5 text-rose-400" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={(e) => toggleLock(obj, e)}
              className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white"
              title="Lock/Unlock positions"
            >
              {obj.isLocked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                duplicateObject(obj.id);
              }}
              className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-amber-400"
              title="Duplicate drawing"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteObject(obj.id);
              }}
              className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-rose-400"
              title="Delete node"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Render child elements if expanded */}
        {hasChildren && isExpanded && (
          <div className="flex flex-col">
            {obj.childrenIds.map(childId => objects[childId] && renderTreeItem(objects[childId], depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Find root-level elements for initial rendering tree pass (strictly filter by active layer)
  const rootObjects = Object.values(objects)
    .filter(o => !o.parentId)
    .filter(o => (o.layerId || (layers && layers[0] ? layers[0].id : 'layer_1')) === activeLayerId);
  const sortedLayersList = [...layers].sort((a, b) => b.zIndex - a.zIndex);

  return (
    <div
      className={`absolute ${toolbarCollapsed ? 'left-14' : 'left-56'} h-full transition-all duration-200 shrink-0 z-30 ${
        open ? 'w-64' : 'w-0'
      }`}
    >
      {/* Slider Open Close Handle Button */}
      <button
        onClick={() => setOpen(!open)}
        className="absolute -right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-16 bg-neutral-800 hover:bg-amber-500 border-y border-r border-neutral-700 hover:border-amber-400 rounded-r-lg flex items-center justify-center text-neutral-400 hover:text-neutral-950 transition-all cursor-pointer z-50 shadow-lg shadow-black/20"
      >
        {open ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>

      <div className={`w-full h-full bg-neutral-900/95 backdrop-blur-md border-r border-neutral-800 flex flex-col overflow-hidden ${
        open ? 'w-64' : 'w-0 border-r-0'
      }`}>
        {open && (
        <>
          {/* Header */}
          <div className="h-14 border-b border-neutral-800 flex items-center justify-between px-3 shrink-0 select-none">
            <span className="text-xs uppercase tracking-widest font-black text-neutral-400 flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 text-amber-400" />
              HIERARCHY TREE
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleGroupSelected}
                disabled={!selectedObjectId}
                className={`p-1.5 rounded-lg border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-all ${
                  !selectedObjectId ? 'opacity-40 cursor-not-allowed' : ''
                }`}
                title="Add Selected to Group"
              >
                <FolderPlus className="w-4 h-4" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-850 text-neutral-400 hover:text-rose-400 transition-all lg:hidden"
                title="Close Sidebar"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Root-Level Drag-Drop Landing Box */}
          <div 
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(null, e)}
            className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin select-none"
          >
            {/* 🎯 Adaptive Geometry Deformation Controller */}
            <div className="border border-amber-500/30 bg-neutral-950/90 rounded-2xl p-3 space-y-3 shrink-0 shadow-lg" id="adaptive-subdivision-panel">
              <div className="flex items-center gap-1.5 text-amber-400">
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-wider">Deformation Points Control</span>
              </div>
              <p className="text-[9px] text-neutral-400 leading-normal">
                Control dynamic point generation when stretching edges of 3D models & 2D drawings.
              </p>
              
              <div className="flex items-center gap-2">
                <button
                  id="btn-start-adaptive"
                  onClick={() => setAdaptiveSubdivisionEnabled(true)}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                    adaptiveSubdivisionEnabled
                      ? 'bg-amber-500 text-neutral-950 shadow-md shadow-amber-500/10 scale-105'
                      : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  ▶ START
                </button>
                <button
                  id="btn-stop-adaptive"
                  onClick={() => setAdaptiveSubdivisionEnabled(false)}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                    !adaptiveSubdivisionEnabled
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-600/10 scale-105'
                      : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-rose-400'
                  }`}
                >
                  ■ STOP
                </button>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-neutral-500 font-extrabold uppercase tracking-widest">Points Per Split</span>
                  <span className="text-[10px] text-amber-400 font-mono font-black bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800">{adaptiveSubdivisionPoints}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold text-neutral-500 font-mono">1</span>
                  <input
                    id="slider-adaptive-points"
                    type="range"
                    min="1"
                    max="3"
                    step="1"
                    value={adaptiveSubdivisionPoints}
                    onChange={(e) => setAdaptiveSubdivisionPoints(parseInt(e.target.value))}
                    className="flex-1 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <span className="text-[9px] font-bold text-neutral-500 font-mono">3</span>
                </div>
                <div className="text-[8px] text-neutral-500 leading-snug">
                  Strictly 1 to 3 points can be generated dynamically during edge elongation.
                </div>
              </div>
            </div>

            {/* 📋 Selected Drawing Quick Controls */}
            {selectedObjectId && objects[selectedObjectId] && (
              <div className="border border-neutral-800 bg-neutral-950/80 rounded-2xl p-3 space-y-2.5 shrink-0 shadow-lg" id="selected-drawing-controls">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-amber-400">
                    <Copy className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-black uppercase tracking-wider">Drawing Controls</span>
                  </div>
                  <span className="text-[9px] text-neutral-500 font-mono">SELECTED</span>
                </div>
                <div className="bg-neutral-900 border border-neutral-800/60 rounded-xl p-2 flex items-center justify-between gap-2">
                  <span 
                    onClick={() => setSelectedObjectId(null)}
                    className="text-xs truncate font-bold text-neutral-200 flex-1 cursor-pointer hover:text-rose-400 transition-colors"
                    title="Click to unselect drawing"
                  >
                    {objects[selectedObjectId].name}
                  </span>
                  <button
                    onClick={() => duplicateObject(selectedObjectId)}
                    className="bg-amber-500 hover:bg-amber-600 text-neutral-950 text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider transition-all cursor-pointer shadow-md shrink-0"
                  >
                    Duplicate
                  </button>
                </div>

                {/* Z-Index Controls */}
                <div className="bg-neutral-900/80 border border-neutral-800/80 rounded-xl p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider">Z-Index (Depth)</span>
                    <span className="text-[10px] font-mono font-bold text-neutral-300">
                      z: {objects[selectedObjectId].zIndex ?? 0}
                    </span>
                  </div>
                  
                  {/* Z-Index Range Slider */}
                  <div className="flex items-center gap-2 py-1">
                    <input
                      type="range"
                      min={-50}
                      max={50}
                      step={1}
                      value={objects[selectedObjectId].zIndex ?? 0}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        updateObject(selectedObjectId, { zIndex: val });
                      }}
                      className="w-full accent-amber-500 cursor-pointer h-1.5 bg-neutral-950 rounded-lg"
                      title="Slide to adjust Z-Index"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        const currentZ = objects[selectedObjectId].zIndex ?? 0;
                        updateObject(selectedObjectId, { zIndex: currentZ - 1 });
                      }}
                      className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-black px-2.5 py-1 rounded-lg border border-neutral-700 cursor-pointer transition-colors"
                      title="Send Backward (-1)"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      value={objects[selectedObjectId].zIndex ?? 0}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        updateObject(selectedObjectId, { zIndex: val });
                      }}
                      className="flex-1 bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-1 text-xs text-center font-mono font-bold text-amber-400 outline-none focus:border-amber-500"
                      title="Direct Z-Index depth value"
                    />
                    <button
                      onClick={() => {
                        const currentZ = objects[selectedObjectId].zIndex ?? 0;
                        updateObject(selectedObjectId, { zIndex: currentZ + 1 });
                      }}
                      className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-black px-2.5 py-1 rounded-lg border border-neutral-700 cursor-pointer transition-colors"
                      title="Bring Forward (+1)"
                    >
                      +
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                    <button
                      onClick={() => {
                        const zValues = Object.values(objects).map(o => o.zIndex ?? 0);
                        const minZ = zValues.length > 0 ? Math.min(...zValues) : 0;
                        updateObject(selectedObjectId, { zIndex: minZ - 1 });
                      }}
                      className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-[9px] font-bold py-1 px-1.5 rounded-lg border border-neutral-700/80 transition-colors uppercase cursor-pointer"
                    >
                      Send to Back
                    </button>
                    <button
                      onClick={() => {
                        const zValues = Object.values(objects).map(o => o.zIndex ?? 0);
                        const maxZ = zValues.length > 0 ? Math.max(...zValues) : 0;
                        updateObject(selectedObjectId, { zIndex: maxZ + 1 });
                      }}
                      className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-[9px] font-extrabold py-1 px-1.5 rounded-lg border border-amber-500/30 transition-colors uppercase cursor-pointer"
                    >
                      Bring to Front
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 📌 Points-Based Movement (PBM) & Rigid Point Deform Panel */}
            {(activeTool === 'PBM' || activeTool === 'RPD') && (
              <div className="border border-blue-500/40 bg-neutral-950/90 rounded-2xl p-3 space-y-3 shrink-0 shadow-lg animate-fade-in" id="pbm-left-panel">
                <div className="flex items-center gap-1.5 text-blue-400">
                  <GitCommit className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-black uppercase tracking-wider font-sans">🎯 Points-Based Movement (PBM)</span>
                </div>
                <p className="text-[9px] text-neutral-300 leading-normal font-medium">
                  Click on drawing to place <b>Blue Points</b>. Minimum 2 points are strictly required (e.g., Shoulder &amp; Hand). Drag points to move drawing sections strictly as-is without stroke distortion or overlap!
                </p>
                <div className="bg-neutral-900/80 p-2 rounded-xl border border-neutral-800 text-[9px] text-blue-300 font-bold space-y-1">
                  <div>• <b>Blue Points</b>: Joint skeleton points</div>
                  <div>• <b>Yellow Point</b>: Active selected point with capture radius</div>
                  <div>• <b>Extrude Mode</b>: Spawn connected joint chains</div>
                </div>
              </div>
            )}

            {/* 🎯 Lasso Batch Duplicate Option */}
            {activeTool === 'LSO' && (
              <div className="border border-amber-500/30 bg-neutral-950/90 rounded-2xl p-3 space-y-3 shrink-0 shadow-lg animate-fade-in" id="lasso-batch-panel">
                <div className="flex items-center gap-1.5 text-amber-400">
                  <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-wider font-sans">Lasso Batch Actions</span>
                </div>
                <p className="text-[9px] text-neutral-400 leading-normal font-medium">
                  Draw a closed loop on the canvas around multiple drawings, then duplicate all of them instantly in batch!
                </p>
                
                {lassoPoints && lassoPoints.length >= 3 ? (
                  <div className="space-y-2 bg-neutral-900/60 p-2 rounded-xl border border-neutral-800">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-neutral-400 font-bold">Lasso Loop:</span>
                      <span className="text-emerald-400 font-mono font-black">Closed ({lassoPoints.length} pts)</span>
                    </div>
                    <button
                      onClick={duplicateLassoBatch}
                      className="w-full bg-amber-500 hover:bg-amber-600 text-neutral-950 text-[10px] font-black py-1.5 rounded-lg uppercase tracking-wider transition-all cursor-pointer shadow-md"
                    >
                      Duplicate Lasso Batch
                    </button>
                  </div>
                ) : (
                  <div className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-center">
                    <span className="text-[9px] text-neutral-500 font-extrabold leading-normal block">Draw a closed loop on the canvas to select drawings.</span>
                  </div>
                )}
              </div>
            )}

            {/* 🎨 Premium Fill Bucket Configuration */}
            {activeTool === 'FIL' && (
              <div className="border border-emerald-500/30 bg-neutral-950/90 rounded-2xl p-3 space-y-3 shrink-0 shadow-lg animate-fade-in" id="fill-tool-panel">
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <PaintBucket className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-black uppercase tracking-wider">Fill Tool Controls</span>
                </div>
                <p className="text-[9px] text-neutral-400 leading-normal font-medium">
                  Select a color and click on a <b>selected</b> drawing.
                  <br />
                  • <b>Closed Path:</b> Fills inner area (preserves stroke).
                  <br />
                  • <b>Open Path:</b> Color is applied directly to the stroke.
                </p>

                {/* Apply Fill Forever Toggle */}
                <div className="flex items-center justify-between py-1.5 bg-neutral-900/40 px-2 rounded-xl border border-neutral-800/40">
                  <div className="flex flex-col">
                    <span className="text-[9px] text-neutral-300 font-bold uppercase">Apply Fill Forever</span>
                    <span className="text-[8px] text-neutral-500">Apply color to all frames on drawing</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!applyFillForever}
                      onChange={(e) => setApplyFillForever?.(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-neutral-850 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-500 after:border-neutral-400 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500 peer-checked:after:bg-white" />
                  </label>
                </div>

                {/* Full Closed Fill Toggle */}
                <div className="flex items-center justify-between py-1.5 bg-neutral-900/40 px-2 rounded-xl border border-neutral-800/40">
                  <div className="flex flex-col">
                    <span className="text-[9px] text-neutral-300 font-bold uppercase">Full Closed Fill</span>
                    <span className="text-[8px] text-neutral-500">Fill nested inner shapes too</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!ignoreInnerDrawings}
                      onChange={(e) => setIgnoreInnerDrawings?.(!e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-neutral-850 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-500 after:border-neutral-400 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500 peer-checked:after:bg-white" />
                  </label>
                </div>

                {/* One-Tap Apply Fill Button */}
                <button
                  type="button"
                  onClick={applyColorFillToSelected}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black uppercase text-[10px] rounded-xl tracking-wider shadow-lg shadow-emerald-500/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  title="Apply fill color to selected drawing immediately"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  Apply Fill to Selected
                </button>

                {/* Color Selection HUD */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-neutral-500 font-extrabold uppercase tracking-widest">Active Fill Color</span>
                  </div>
                  <CustomColorPicker
                    color={fillToolColor || '#4CAF50'}
                    onChange={(c) => setFillToolColor?.(c)}
                  />
                  {/* Preset Swatches */}
                  <div className="grid grid-cols-6 gap-1 pt-1">
                    {['#E53935', '#D81B60', '#8E24AA', '#5E35B1', '#3949AB', '#1E88E5', '#039BE5', '#00ACC1', '#00897B', '#43A047', '#7CB342', '#FDD835', '#FFB300', '#F4511E', '#6D4C41', '#757575', '#37474F', '#000000'].map(swatch => (
                      <button
                        key={swatch}
                        onClick={() => setFillToolColor?.(swatch)}
                        style={{ backgroundColor: swatch }}
                        className={`w-full h-4 rounded-md transition-all border ${
                          fillToolColor === swatch ? 'border-white scale-110 shadow' : 'border-transparent hover:scale-105'
                        }`}
                        title={swatch}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 360° Studio Creation Center */}
            {activeTool === '360' && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3 space-y-3.5 animate-fade-in shrink-0">
                <div className="flex items-center gap-1.5 text-amber-400 justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-wider">360° Pseudo-3D Studio</span>
                  </div>
                </div>

                {!is360WizardActive ? (
                  <div className="space-y-3">
                    <p className="text-[10px] text-neutral-400 font-medium leading-normal">
                      Turn standard 2D layers into fully rotating characters. Select drawings manually or use our smart step-by-step drawing wizard!
                    </p>

                    {/* Interactive Wizard Start */}
                    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-2.5 text-center space-y-2">
                      <span className="text-[9px] text-amber-400 font-bold block">⭐ Interactive Co-Location Wizard</span>
                      <p className="text-[9px] text-neutral-400 leading-snug">
                        Draw your viewpoints (Front, Side, Back, etc.) one by one at the exact same spot. Wizard hides previous drawings and provides <b>onion skin guides</b> automatically!
                      </p>
                      <button
                        onClick={() => {
                          if (start360Wizard) {
                            start360Wizard();
                            setCustomViewName('Front View');
                            setCustomViewAngle(0);
                          }
                        }}
                        className="w-full bg-amber-500 hover:bg-amber-600 text-neutral-950 text-[10px] font-black py-1.5 rounded-lg uppercase tracking-wider transition-all cursor-pointer shadow-md"
                      >
                        🚀 Launch Drawing Wizard
                      </button>
                    </div>

                    <div className="h-[1px] bg-neutral-850 my-2" />

                    {/* Classic Manual Selection Compile Option as Fallback */}
                    <div className="space-y-2">
                      <span className="text-[9px] text-neutral-500 font-bold block">Option B: Classic Bulk Compiler</span>
                      {/* Available Drawings */}
                      <div className="space-y-1.5">
                        <span className="text-[8px] text-neutral-500 font-black uppercase tracking-widest block">Available 2D Drawings</span>
                        <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                          {Object.values(objects)
                            .filter(obj => obj.type !== '360_container' && obj.type !== '3d')
                            .map(obj => {
                              const isChecked = selected360Ids.includes(obj.id);
                              return (
                                <div 
                                  key={obj.id}
                                  onClick={() => {
                                    if (isChecked) {
                                      setSelected360Ids(selected360Ids.filter(id => id !== obj.id));
                                    } else {
                                      setSelected360Ids([...selected360Ids, obj.id]);
                                    }
                                  }}
                                  className={`flex items-center gap-2 p-1.5 rounded-xl text-xs cursor-pointer border transition-all ${
                                    isChecked 
                                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' 
                                      : 'bg-neutral-950 border-neutral-850 text-neutral-400 hover:text-neutral-200'
                                  }`}
                                >
                                  <input 
                                    type="checkbox"
                                    checked={isChecked}
                                    readOnly
                                    className="accent-amber-500 rounded border-neutral-800 scale-90"
                                  />
                                  <span className="font-bold truncate text-[11px]">{obj.name}</span>
                                </div>
                              );
                            })
                          }
                          {Object.values(objects).filter(obj => obj.type !== '360_container' && obj.type !== '3d').length === 0 && (
                            <div className="text-[9px] text-neutral-500 font-medium text-center py-4 bg-neutral-950 border border-neutral-900 rounded-xl">
                              No 2D drawings found. Draw some elements first!
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Build Button */}
                      <button
                        onClick={() => {
                          if (selected360Ids.length === 0) {
                            alert("Please select at least one drawing.");
                            return;
                          }
                          if (add360Object) {
                            add360Object(selected360Ids);
                            setSelected360Ids([]);
                          }
                        }}
                        className="w-full bg-neutral-800 hover:bg-neutral-700 text-white font-bold py-1.5 rounded-lg text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
                      >
                        Compile Selected ({selected360Ids.length})
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Active Wizard Flow */}
                    <div className="bg-amber-500/20 border border-amber-500/40 rounded-xl p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-amber-300 font-bold flex items-center gap-1">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                          </span>
                          WIZARD STEP 1: ADD VIEW
                        </span>
                        <button 
                          onClick={cancel360Wizard}
                          className="text-[9px] text-neutral-400 hover:text-white underline cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>

                      {selectedObjectId && objects[selectedObjectId] && objects[selectedObjectId].type !== '360_container' && objects[selectedObjectId].type !== '3d' ? (
                        <div className="space-y-2.5">
                          <div className="p-2 bg-neutral-950 border border-neutral-850 rounded-lg text-[10px] text-white">
                            Selected Drawing: <b className="text-amber-400">{objects[selectedObjectId].name}</b>
                          </div>

                          {/* View Name configuration */}
                          <div className="space-y-1">
                            <label className="text-[8px] text-neutral-400 font-extrabold uppercase tracking-widest block">Viewpoint Custom Name</label>
                            <input 
                              type="text"
                              value={customViewName}
                              onChange={(e) => setCustomViewName(e.target.value)}
                              className="w-full bg-neutral-950 border border-neutral-800 text-white rounded-lg p-1 text-[11px] font-bold focus:border-amber-500/50 focus:outline-none"
                            />
                            {/* Preset Buttons */}
                            <div className="flex flex-wrap gap-1">
                              {[
                                { n: 'Front View', a: 0 },
                                { n: 'Right View', a: 90 },
                                { n: 'Back View', a: 180 },
                                { n: 'Left View', a: 270 }
                              ].map(p => (
                                <button
                                  key={p.n}
                                  onClick={() => {
                                    setCustomViewName(p.n);
                                    setCustomViewAngle(p.a);
                                  }}
                                  className="bg-neutral-800 hover:bg-neutral-750 text-[9px] font-bold text-neutral-300 hover:text-white px-1.5 py-0.5 rounded cursor-pointer"
                                >
                                  {p.n} ({p.a}°)
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Angle slider configuration */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-[8px] text-neutral-400 font-extrabold uppercase tracking-widest">
                              <span>View Angle</span>
                              <span className="text-amber-400 font-bold">{customViewAngle}°</span>
                            </div>
                            <input 
                              type="range"
                              min="0"
                              max="359"
                              value={customViewAngle}
                              onChange={(e) => setCustomViewAngle(Number(e.target.value))}
                              className="w-full accent-amber-500"
                            />
                          </div>

                          {/* Register View Trigger */}
                          <button
                            onClick={() => {
                              if (addDraft360View) {
                                addDraft360View(selectedObjectId, customViewName, customViewAngle);
                                // Suggest next logical viewpoint!
                                if (customViewAngle === 0) {
                                  setCustomViewName('Right View');
                                  setCustomViewAngle(90);
                                } else if (customViewAngle === 90) {
                                  setCustomViewName('Back View');
                                  setCustomViewAngle(180);
                                } else if (customViewAngle === 180) {
                                  setCustomViewName('Left View');
                                  setCustomViewAngle(270);
                                } else {
                                  setCustomViewName(`Angle ${customViewAngle + 45}°`);
                                  setCustomViewAngle((customViewAngle + 45) % 360);
                                }
                                setSelectedObjectId(null); // Unselect so they can draw fresh
                              }
                            }}
                            className="w-full bg-amber-500 hover:bg-amber-600 text-neutral-950 font-black py-1.5 rounded-lg text-[10px] uppercase tracking-wider transition-all cursor-pointer"
                          >
                            + Register "{customViewName}"
                          </button>
                        </div>
                      ) : (
                        <div className="bg-neutral-950 border border-neutral-900 rounded-lg p-2.5 text-center space-y-1.5 text-neutral-400">
                          <p className="text-[10px] font-bold text-neutral-300">
                            ✍️ Ready for "{customViewName}" ({customViewAngle}°)
                          </p>
                          <p className="text-[9px] leading-relaxed text-neutral-500">
                            Draw the model at this viewpoint exactly at the same location as previous drawings. Then, select the drawing on the canvas to register it!
                          </p>
                          <div className="flex justify-center gap-1.5 mt-1">
                            <span className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-[8px] font-mono text-neutral-500">
                              Brush/Pen/Upload
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Onion Skinning Toggle */}
                    <div className="flex items-center justify-between bg-neutral-900/50 border border-neutral-850 rounded-xl p-2 px-3">
                      <span className="text-[10px] text-neutral-300 font-bold">Onion Skinning (Trace Assist)</span>
                      <input 
                        type="checkbox"
                        checked={onionSkinEnabled360}
                        onChange={(e) => setOnionSkinEnabled360?.(e.target.checked)}
                        className="accent-amber-500 scale-110 cursor-pointer"
                      />
                    </div>

                    {/* Queue List of Registered Viewpoints */}
                    <div className="space-y-1">
                      <span className="text-[8px] text-neutral-500 font-black uppercase tracking-widest block">Registered viewpoints ({draft360Views.length})</span>
                      <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                        {draft360Views.map((view, idx) => (
                          <div 
                            key={view.id}
                            className="flex items-center justify-between p-1.5 rounded-lg bg-neutral-900 border border-neutral-850 text-[10px]"
                          >
                            <span className="font-bold text-neutral-300 truncate max-w-[120px]">{view.name}</span>
                            <span className="font-mono text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded text-[9px]">{view.angle}°</span>
                          </div>
                        ))}
                        {draft360Views.length === 0 && (
                          <div className="text-[9px] text-neutral-500 text-center py-2 italic">
                            Waiting for first viewpoint registration...
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Compile step */}
                    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-2.5 space-y-2">
                      <span className="text-[9px] text-neutral-400 font-extrabold uppercase tracking-wider block">STEP 2: COMPILE MASTER OBJECT</span>
                      <div className="space-y-1">
                        <label className="text-[8px] text-neutral-500 font-bold uppercase tracking-widest block">Master Object Name</label>
                        <input 
                          type="text"
                          value={masterContainerName}
                          onChange={(e) => setMasterContainerName(e.target.value)}
                          className="w-full bg-neutral-950 border border-neutral-800 text-white rounded-lg p-1 text-[11px] font-bold focus:border-amber-500/50 focus:outline-none"
                        />
                      </div>

                      <button
                        onClick={() => {
                          if (draft360Views.length === 0) {
                            alert("Please add at least one viewpoint before compiling.");
                            return;
                          }
                          if (compile360Wizard) {
                            compile360Wizard(masterContainerName);
                          }
                        }}
                        className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-neutral-950 font-black py-2 rounded-lg text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-amber-500/10"
                        disabled={draft360Views.length === 0}
                      >
                        💫 Convert to 360° Object ({draft360Views.length} views)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 📦 3D Models & Shapes Library */}
            <div className="border border-neutral-800/80 bg-neutral-900/50 rounded-2xl p-3 space-y-3.5 shrink-0">
              <button 
                type="button"
                onClick={() => setIs3DLibraryOpen(!is3DLibraryOpen)}
                className="w-full flex items-center justify-between text-left text-[10px] font-black uppercase tracking-wider text-amber-400 focus:outline-none"
              >
                <div className="flex items-center gap-1.5">
                  <Box className="w-3.5 h-3.5" />
                  <span>💫 2D to 3D Extrusion Engine</span>
                </div>
                <span>{is3DLibraryOpen ? '▼' : '▶'}</span>
              </button>

              {is3DLibraryOpen && (
                <div className="space-y-3.5 animate-fade-in">
                  <p className="text-[10px] text-neutral-400 leading-normal">
                    Draw freely on the canvas using our 2D brush or pen tool, select your drawing, and instantly convert it into a solid 3D mesh proxy!
                  </p>

                  {/* Daily Conversion Limit & Info Card */}
                  <div className="bg-neutral-950 rounded-xl p-3 border border-neutral-850 space-y-2">
                    <div className="flex items-center justify-between text-[9px] font-extrabold uppercase tracking-wider text-neutral-400">
                      <span>💫 Daily 3D Limit</span>
                      <span className="text-amber-400 font-mono text-[10px] font-bold">
                        {getDailyLimitStatus(currentUser || 'guest').count} / 10 Used
                      </span>
                    </div>
                    <div className="h-1 bg-neutral-850 rounded-full overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-amber-400 to-amber-500 h-full transition-all"
                        style={{ width: `${Math.min(100, (getDailyLimitStatus(currentUser || 'guest').count / 10) * 100)}%` }}
                      />
                    </div>
                    <p className="text-[9px] text-neutral-500 leading-normal">
                      Select any drawing or custom shape and click <b>💫 Convert to 3D</b> in the properties panel to convert it into a real 3D solid model.
                    </p>
                  </div>


                </div>
              )}
            </div>

            <div className="h-[1px] bg-neutral-800/40 my-2 shrink-0" />

            {/* Tree Section */}
            <div className="space-y-1">
              <div className="text-[10px] text-neutral-500 font-extrabold uppercase tracking-wider mb-2">
                Drawings and Groups
              </div>
              {rootObjects.length === 0 ? (
                <div className="text-center py-8 text-xs text-neutral-600 font-bold border border-dashed border-neutral-800/80 rounded-2xl p-4">
                  Draw or upload PNG to begin. Drag items to parent them recursively!
                </div>
              ) : (
                rootObjects.map(obj => renderTreeItem(obj, 0))
              )}
            </div>

            {/* Layer Panel Section */}
            <div className="border-t border-neutral-800/60 pt-4 mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] text-neutral-400 font-extrabold uppercase tracking-wider flex items-center gap-1">
                  <LayerIcon className="w-3.5 h-3.5 text-amber-500" />
                  3D Depth Layers System
                </div>
                <button
                  onClick={handleAddLayer}
                  className="px-2 py-0.5 text-[10px] bg-neutral-800 border border-neutral-700 hover:bg-amber-500 hover:text-neutral-950 font-black rounded-lg transition-all"
                >
                  + ADD LAYER
                </button>
              </div>

              <div className="space-y-2.5">
                {sortedLayersList.map((layer, index) => {
                  const isActive = activeLayerId === layer.id;
                  const blur = (layer as any).blurAmount ?? 0;
                  const itemCount = Object.values(objects).filter(o => {
                    const eff = o.layerId || (layers && layers[0] ? layers[0].id : 'layer_1');
                    return eff === layer.id;
                  }).length;

                  return (
                    <div
                      key={layer.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveLayerId(layer.id);
                      }}
                      className={`flex flex-col p-3 rounded-xl border text-xs transition-all cursor-pointer relative overflow-hidden ${
                        isActive
                          ? 'bg-amber-500/10 border-amber-400 text-amber-200 font-bold shadow-[0_0_15px_rgba(245,158,11,0.2)] ring-1 ring-amber-400/50'
                          : 'bg-neutral-950/90 border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:bg-neutral-900'
                      }`}
                    >
                      {isActive && (
                        <div className="mb-2 flex items-center justify-between border-b border-amber-500/30 pb-1.5">
                          <span className="px-2 py-0.5 text-[9px] bg-amber-500 text-neutral-950 font-black rounded uppercase tracking-wider flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-neutral-950 animate-pulse" />
                            ACTIVE LAYER
                          </span>
                          <span className="text-[10px] text-amber-400/90 font-mono font-black">
                            {itemCount} {itemCount === 1 ? 'drawing' : 'drawings'}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                        {editingLayerId === layer.id ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (editingLayerName.trim()) {
                                const sanitized = sanitizeString(editingLayerName.trim());
                                if (sanitized) {
                                  updateLayerProp(layer.id, { name: sanitized });
                                }
                              }
                              setEditingLayerId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 flex-1 mr-1"
                          >
                            <input
                              type="text"
                              value={editingLayerName}
                              onChange={(e) => setEditingLayerName(e.target.value)}
                              className="bg-neutral-900 border border-neutral-700 text-xs text-white rounded-lg px-2 py-0.5 focus:outline-none focus:border-amber-500 font-bold w-full"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (editingLayerName.trim()) {
                                    const sanitized = sanitizeString(editingLayerName.trim());
                                    if (sanitized) {
                                      updateLayerProp(layer.id, { name: sanitized });
                                    }
                                  }
                                  setEditingLayerId(null);
                                } else if (e.key === 'Escape') {
                                  setEditingLayerId(null);
                                }
                              }}
                            />
                            <button
                              type="submit"
                              className="text-emerald-400 hover:text-emerald-300 p-1 shrink-0"
                              title="Save Layer Name"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </form>
                        ) : (
                          <div 
                            className="flex items-center gap-1.5 truncate max-w-[140px] flex-1 cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveLayerId(layer.id);
                            }}
                          >
                            <span className="truncate font-black text-white select-none">{layer.name}</span>
                            {!isActive && (
                              <span className="text-[9px] text-neutral-500 font-mono font-normal shrink-0">
                                ({itemCount})
                              </span>
                            )}
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          {/* Visibility Toggle */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateLayerProp(layer.id, { visible: !layer.visible });
                            }}
                            className="p-1 rounded hover:bg-neutral-850 text-neutral-400 hover:text-white"
                            title={layer.visible ? "Hide Layer Drawings" : "Show Layer Drawings"}
                          >
                            {layer.visible ? <Eye className="w-3.5 h-3.5 text-neutral-300" /> : <EyeOff className="w-3.5 h-3.5 text-rose-500" />}
                          </button>

                          {/* Lock Toggle */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateLayerProp(layer.id, { locked: !layer.locked });
                            }}
                            className="p-1 rounded hover:bg-neutral-850 text-neutral-400 hover:text-white"
                            title="Lock Layer"
                          >
                            {layer.locked ? <Lock className="w-3.5 h-3.5 text-amber-500" /> : <Unlock className="w-3.5 h-3.5 text-neutral-600" />}
                          </button>

                          {/* Move Up/Down */}
                          <button
                            onClick={(e) => moveLayer(layers.findIndex(l => l.id === layer.id), 'up', e)}
                            className="p-0.5 rounded hover:bg-neutral-800 text-[10px] text-neutral-500 hover:text-white"
                            title="Move Up"
                          >
                            ▲
                          </button>
                          <button
                            onClick={(e) => moveLayer(layers.findIndex(l => l.id === layer.id), 'down', e)}
                            className="p-0.5 rounded hover:bg-neutral-800 text-[10px] text-neutral-500 hover:text-white"
                            title="Move Down"
                          >
                            ▼
                          </button>

                          {/* Delete Layer */}
                          <button
                            onClick={(e) => handleDeleteLayer(layer.id, e)}
                            className="p-1 rounded hover:bg-neutral-800 text-neutral-500 hover:text-rose-400"
                            title="Delete Layer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Edit / Rename Layer Icon (Pen Icon) positioned at the very end */}
                          {editingLayerId !== layer.id && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingLayerId(layer.id);
                                setEditingLayerName(layer.name);
                              }}
                              className="p-1 text-neutral-400 hover:text-amber-400 transition-colors rounded hover:bg-neutral-800 shrink-0"
                              title="Edit Layer Name"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-neutral-400 hover:text-amber-400" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Opacity & Blur & 3D Depth sliders */}
                      {isActive && (
                        <div className="mt-2.5 pt-2 border-t border-amber-500/20 space-y-2 text-[10px]">
                          {/* Opacity */}
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-400 font-bold">OPACITY</span>
                            <div className="flex items-center gap-2">
                              <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.05}
                                value={layer.opacity}
                                onChange={(e) => updateLayerProp(layer.id, { opacity: parseFloat(e.target.value) })}
                                className="w-20 accent-amber-500 h-1 bg-neutral-800 rounded-lg"
                              />
                              <span className="text-amber-400 font-black w-6 text-right">
                                {Math.round(layer.opacity * 100)}%
                              </span>
                            </div>
                          </div>

                          {/* Depth Blur */}
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-400 font-bold">DEPTH BLUR</span>
                            <div className="flex items-center gap-2">
                              <input
                                type="range"
                                min={0}
                                max={20}
                                step={1}
                                value={blur}
                                onChange={(e) => updateLayerProp(layer.id, { blurAmount: parseInt(e.target.value) })}
                                className="w-20 accent-amber-500 h-1 bg-neutral-800 rounded-lg"
                              />
                              <span className="text-amber-400 font-black w-6 text-right">
                                {blur}px
                              </span>
                            </div>
                          </div>

                          {/* 3D Multiplane Layer Depth */}
                          <div className="flex items-center justify-between">
                            <span className="text-amber-400 font-extrabold flex items-center gap-1">
                              <Box className="w-3 h-3 text-amber-400" />
                              3D DEPTH (Z)
                            </span>
                            <div className="flex items-center gap-2">
                              <input
                                type="range"
                                min={-500}
                                max={500}
                                step={10}
                                value={layer.depth ?? 0}
                                onChange={(e) => updateLayerProp(layer.id, { depth: parseInt(e.target.value) })}
                                className="w-20 accent-amber-500 h-1 bg-neutral-800 rounded-lg"
                              />
                              <span className="text-amber-400 font-black w-8 text-right font-mono">
                                {layer.depth ?? 0}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
      </div>
    </div>
  );
}

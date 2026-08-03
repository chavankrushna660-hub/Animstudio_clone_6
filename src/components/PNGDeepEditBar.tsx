import React, { useState } from 'react';
import { 
  Scissors, 
  Sparkles, 
  Box, 
  Layers, 
  Eye, 
  Smile, 
  Sliders, 
  Palette, 
  RotateCw, 
  ShieldCheck, 
  Move, 
  ChevronUp, 
  ChevronDown,
  Activity,
  Maximize2
} from 'lucide-react';
import { VectorObject, Point } from '../types';

interface PNGDeepEditBarProps {
  selectedObject: VectorObject | null;
  activeTool: string;
  setActiveTool: (tool: string) => void;
  onExtractPart: (infillColor: string) => void;
  onSetupMouthPosing: (cavityColor: string) => void;
  onSetupEyePosing: (skinColor: string) => void;
  onConvertTo3D: (depth: number) => void;
  onUpdateTransform3D: (updates: any) => void;
  onShiftZDepth: (deltaZ: number) => void;
  onApplyCustomColor: (color: string) => void;
  freeSelectionPoints: Point[];
  inline?: boolean;
}

export default function PNGDeepEditBar({
  selectedObject,
  activeTool,
  setActiveTool,
  onExtractPart,
  onSetupMouthPosing,
  onSetupEyePosing,
  onConvertTo3D,
  onUpdateTransform3D,
  onShiftZDepth,
  onApplyCustomColor,
  freeSelectionPoints,
  inline = true,
}: PNGDeepEditBarProps) {
  const [activeTab, setActiveTab] = useState<'extract' | 'pose' | '3d' | 'color'>('extract');
  const [infillColor, setInfillColor] = useState<string>('#18080c'); // Default inner mouth cavity
  const [skinColor, setSkinColor] = useState<string>('#e2bba2');
  const [extrusionDepth, setExtrusionDepth] = useState<number>(60);
  const [mouthOpenVal, setMouthOpenVal] = useState<number>(0);
  const [smileVal, setSmileVal] = useState<number>(0);
  const [eyeBlinkVal, setEyeBlinkVal] = useState<number>(0);
  const [pupilX, setPupilX] = useState<number>(0);
  const [pupilY, setPupilY] = useState<number>(0);
  const [customColor, setCustomColor] = useState<string>('#ff3366');

  if (!selectedObject) return null;

  const hasSelectionPoints = freeSelectionPoints && freeSelectionPoints.length >= 3;
  const is3DActive = !!selectedObject.transform3D?.enabled;

  const containerClasses = inline
    ? "bg-neutral-950/90 p-3 rounded-2xl border border-amber-500/30 text-white flex flex-col gap-2.5 w-full max-w-full overflow-hidden shadow-xl shrink-0"
    : "absolute bottom-16 left-1/2 -translate-x-1/2 bg-neutral-900/95 backdrop-blur-md border border-amber-500/30 text-white rounded-2xl shadow-2xl p-3 z-50 flex flex-col gap-3 max-w-xl w-full pointer-events-auto overflow-hidden";

  return (
    <div className={containerClasses}>
      {/* Header & Tabs */}
      <div className="flex flex-col gap-2 border-b border-neutral-800 pb-2 w-full min-w-0">
        <div className="flex items-center justify-between w-full min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span className="text-[11px] font-black tracking-wider uppercase text-amber-400 truncate">
              Deep PNG & Vector Studio
            </span>
          </div>
          <span className="text-[10px] text-neutral-400 bg-neutral-800 px-2 py-0.5 rounded-full font-mono truncate max-w-[100px] shrink-0">
            {selectedObject.name}
          </span>
        </div>

        {/* Tab Buttons - 2x2 Grid for compact sidebar layout */}
        <div className="grid grid-cols-2 gap-1 bg-neutral-950 p-1 rounded-xl border border-neutral-800 w-full">
          <button
            onClick={() => setActiveTab('extract')}
            className={`px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 min-w-0 truncate ${
              activeTab === 'extract'
                ? 'bg-amber-500 text-neutral-950 shadow-md'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            <Scissors className="w-3 h-3 shrink-0" />
            <span className="truncate">Isolate Part</span>
          </button>

          <button
            onClick={() => setActiveTab('pose')}
            className={`px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 min-w-0 truncate ${
              activeTab === 'pose'
                ? 'bg-amber-500 text-neutral-950 shadow-md'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            <Smile className="w-3 h-3 shrink-0" />
            <span className="truncate">Pose & Mouth</span>
          </button>

          <button
            onClick={() => setActiveTab('3d')}
            className={`px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 min-w-0 truncate ${
              activeTab === '3d'
                ? 'bg-amber-500 text-neutral-950 shadow-md'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            <Box className="w-3 h-3 shrink-0" />
            <span className="truncate">3D Depth</span>
          </button>

          <button
            onClick={() => setActiveTab('color')}
            className={`px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 min-w-0 truncate ${
              activeTab === 'color'
                ? 'bg-amber-500 text-neutral-950 shadow-md'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            <Palette className="w-3 h-3 shrink-0" />
            <span className="truncate">Color Fill</span>
          </button>
        </div>
      </div>

      {/* TAB 1: Isolate & Extract Part */}
      {activeTab === 'extract' && (
        <div className="flex flex-col gap-2 text-xs w-full min-w-0">
          <div className="flex items-center justify-between bg-neutral-950/60 p-2 rounded-xl border border-neutral-800 w-full min-w-0">
            <span className="text-neutral-300 font-semibold flex items-center gap-1.5 text-[11px] truncate">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              0.0001px Isolation
            </span>
            <span className="text-[9px] text-amber-300 font-medium truncate shrink-0 ml-1">
              {hasSelectionPoints ? `${freeSelectionPoints.length} pts` : 'Draw VEX/LSO first'}
            </span>
          </div>

          <div className="flex flex-col gap-2 w-full min-w-0">
            <div className="bg-neutral-950/80 p-2 rounded-xl border border-neutral-800 flex items-center justify-between gap-2 w-full">
              <label className="text-[10px] font-bold text-neutral-300">
                Infill Cavity Color:
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={infillColor}
                  onChange={(e) => setInfillColor(e.target.value)}
                  className="w-6 h-6 rounded cursor-pointer border border-neutral-700 bg-transparent"
                  title="Infill cavity color behind extracted part"
                />
                <span className="text-[10px] font-mono text-amber-400">{infillColor}</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 w-full">
              <button
                onClick={() => onExtractPart(infillColor)}
                disabled={!hasSelectionPoints}
                className={`w-full py-2 px-2 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-lg transition-all ${
                  hasSelectionPoints
                    ? 'bg-amber-500 hover:bg-amber-400 text-neutral-950 cursor-pointer'
                    : 'bg-neutral-800 text-neutral-500 cursor-not-allowed opacity-60'
                }`}
              >
                <Scissors className="w-3.5 h-3.5" />
                Extract Part & Auto-Infill
              </button>

              <button
                onClick={() => setActiveTool('VEX')}
                className={`w-full py-1.5 px-2 rounded-xl font-semibold text-[10px] flex items-center justify-center gap-1 transition-all border ${
                  activeTool === 'VEX'
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-white'
                }`}
              >
                <Sliders className="w-3 h-3" />
                {activeTool === 'VEX' ? 'Vector Selection Active' : 'Activate Vector Selection (VEX)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Character Pose & Mouth */}
      {activeTab === 'pose' && (
        <div className="flex flex-col gap-2 text-xs w-full min-w-0">
          <div className="flex flex-col gap-2 w-full">
            {/* Mouth Posing Setup */}
            <div className="bg-neutral-950/80 p-2 rounded-xl border border-neutral-800 flex flex-col gap-1.5 w-full">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-300 flex items-center gap-1 text-[11px]">
                  <Smile className="w-3.5 h-3.5" /> Mouth Posing
                </span>
                <input
                  type="color"
                  value={infillColor}
                  onChange={(e) => setInfillColor(e.target.value)}
                  className="w-5 h-5 rounded cursor-pointer border border-neutral-700"
                  title="Dark Mouth Cavity Color"
                />
              </div>

              <button
                onClick={() => onSetupMouthPosing(infillColor)}
                disabled={!hasSelectionPoints}
                className={`w-full py-1.5 px-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-all ${
                  hasSelectionPoints
                    ? 'bg-amber-500 text-neutral-950 hover:bg-amber-400'
                    : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                }`}
              >
                <Scissors className="w-3 h-3" /> Setup Mouth Cavity
              </button>

              <div className="flex flex-col gap-0.5 mt-0.5">
                <div className="flex justify-between text-[9px]">
                  <span className="text-neutral-400">Mouth Open</span>
                  <span className="text-amber-400 font-mono">{mouthOpenVal}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={mouthOpenVal}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setMouthOpenVal(val);
                    onUpdateTransform3D({ sy: 1 + val / 50, mouthOpen: val });
                  }}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Eye Posing Setup */}
            <div className="bg-neutral-950/80 p-2 rounded-xl border border-neutral-800 flex flex-col gap-1.5 w-full">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-300 flex items-center gap-1 text-[11px]">
                  <Eye className="w-3.5 h-3.5" /> Eye & Pupil Posing
                </span>
                <input
                  type="color"
                  value={skinColor}
                  onChange={(e) => setSkinColor(e.target.value)}
                  className="w-5 h-5 rounded cursor-pointer border border-neutral-700"
                  title="Skin / Eyelid Color"
                />
              </div>

              <button
                onClick={() => onSetupEyePosing(skinColor)}
                disabled={!hasSelectionPoints}
                className={`w-full py-1.5 px-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-all ${
                  hasSelectionPoints
                    ? 'bg-amber-500 text-neutral-950 hover:bg-amber-400'
                    : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                }`}
              >
                <Scissors className="w-3 h-3" /> Isolate Eyes
              </button>

              <div className="flex flex-col gap-0.5 mt-0.5">
                <div className="flex justify-between text-[9px]">
                  <span className="text-neutral-400">Eye Blink</span>
                  <span className="text-amber-400 font-mono">{eyeBlinkVal}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={eyeBlinkVal}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setEyeBlinkVal(val);
                    onUpdateTransform3D({ sy: Math.max(0.05, 1 - val / 100) });
                  }}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: 3D Depth & Extrusion */}
      {activeTab === '3d' && (
        <div className="flex flex-col gap-2 text-xs w-full min-w-0">
          <div className="flex items-center justify-between bg-neutral-950/80 p-2 rounded-xl border border-neutral-800 w-full min-w-0">
            <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
              <Box className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <div className="min-w-0 truncate">
                <span className="font-bold text-neutral-200 text-[11px] block truncate">
                  3D Extrusion Engine
                </span>
                <span className="text-[9px] text-neutral-400 block truncate">
                  {is3DActive ? '3D Mesh Active' : 'Convert flat PNG to 3D mesh'}
                </span>
              </div>
            </div>

            <button
              onClick={() => onConvertTo3D(extrusionDepth)}
              className="bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black px-2.5 py-1 text-[10px] rounded-lg shadow-md transition-all shrink-0 ml-1"
            >
              {is3DActive ? 'Re-Extrude' : 'Convert 3D'}
            </button>
          </div>

          <div className="flex flex-col gap-2 bg-neutral-950/60 p-2 rounded-xl border border-neutral-800 w-full min-w-0">
            <div className="flex flex-col gap-0.5">
              <div className="flex justify-between text-[9px]">
                <span className="font-bold text-neutral-400">3D Depth</span>
                <span className="text-amber-400 font-mono">{extrusionDepth}px</span>
              </div>
              <input
                type="range"
                min="5"
                max="300"
                value={extrusionDepth}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setExtrusionDepth(val);
                  onUpdateTransform3D({ extrusion: { depth: val, segments: 1, bevel: 2 } });
                }}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-0.5">
                <div className="flex justify-between text-[9px]">
                  <span className="font-bold text-neutral-400">Rotate Y</span>
                  <span className="text-amber-400 font-mono">{selectedObject.transform3D?.ry ?? 0}°</span>
                </div>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  value={selectedObject.transform3D?.ry ?? 0}
                  onChange={(e) => onUpdateTransform3D({ ry: Number(e.target.value) })}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-0.5">
                <div className="flex justify-between text-[9px]">
                  <span className="font-bold text-neutral-400">Rotate X</span>
                  <span className="text-amber-400 font-mono">{selectedObject.transform3D?.rx ?? 0}°</span>
                </div>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  value={selectedObject.transform3D?.rx ?? 0}
                  onChange={(e) => onUpdateTransform3D({ rx: Number(e.target.value) })}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Overlap & Depth Shift Tools */}
          <div className="flex items-center justify-between bg-neutral-950/80 p-2 rounded-xl border border-neutral-800 w-full min-w-0">
            <span className="text-[10px] font-bold text-neutral-300 flex items-center gap-1 truncate">
              <Layers className="w-3 h-3 text-amber-400 shrink-0" /> Z-Depth Shift:
            </span>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => onShiftZDepth(10)}
                className="bg-neutral-800 hover:bg-neutral-700 text-amber-300 font-bold px-2 py-1 rounded-lg text-[9px] flex items-center gap-0.5"
                title="Bring Forward (+Z)"
              >
                <ChevronUp className="w-3 h-3" /> +10 Z
              </button>

              <button
                onClick={() => onShiftZDepth(-10)}
                className="bg-neutral-800 hover:bg-neutral-700 text-amber-300 font-bold px-2 py-1 rounded-lg text-[9px] flex items-center gap-0.5"
                title="Send Backward (-Z)"
              >
                <ChevronDown className="w-3 h-3" /> -10 Z
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Custom Color Overlay */}
      {activeTab === 'color' && (
        <div className="flex items-center justify-between bg-neutral-950/80 p-2 rounded-xl border border-neutral-800 text-xs w-full min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
            <Palette className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <div className="min-w-0 truncate">
              <span className="font-bold text-neutral-200 text-[11px] block truncate">
                Custom Color Tint
              </span>
              <span className="text-[9px] text-neutral-400 block truncate">
                Colorize isolated PNG part
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-1">
            <input
              type="color"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer border border-neutral-700 bg-transparent"
            />
            <button
              onClick={() => onApplyCustomColor(customColor)}
              className="bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold px-2.5 py-1 text-[10px] rounded-lg shadow-md transition-all"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

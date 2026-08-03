import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Pipette, Check, X, Palette, ChevronDown, ChevronUp } from 'lucide-react';

interface CustomColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}

const PRESET_COLORS = [
  '#000000', '#FFFFFF', '#E53935', '#D81B60', '#8E24AA', '#5E35B1',
  '#3949AB', '#1E88E5', '#039BE5', '#00ACC1', '#00897B', '#43A047',
  '#7CB342', '#C0CA33', '#FDD835', '#FFB300', '#FB8C00', '#F4511E',
  '#6D4C41', '#757575', '#37474F', '#FF4081', '#7C4DFF', '#00E676'
];

// Helper: Hex <-> HSV
function hexToHsv(hex: string): { h: number; s: number; v: number } {
  let c = (hex || '#000000').replace('#', '');
  if (c.length === 3) {
    c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  }
  const num = parseInt(c, 16) || 0;
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : d / max;
  const v = max;

  return { h, s: s * 100, v: v * 100 };
}

function hsvToHex(h: number, s: number, v: number): string {
  const sNorm = s / 100;
  const vNorm = v / 100;

  const c = vNorm * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = vNorm - c;

  let rNorm = 0, gNorm = 0, bNorm = 0;
  if (h >= 0 && h < 60) { rNorm = c; gNorm = x; bNorm = 0; }
  else if (h >= 60 && h < 120) { rNorm = x; gNorm = c; bNorm = 0; }
  else if (h >= 120 && h < 180) { rNorm = 0; gNorm = c; bNorm = x; }
  else if (h >= 180 && h < 240) { rNorm = 0; gNorm = x; bNorm = c; }
  else if (h >= 240 && h < 300) { rNorm = x; gNorm = 0; bNorm = c; }
  else if (h >= 300 && h < 360) { rNorm = c; gNorm = 0; bNorm = x; }

  const r = Math.round((rNorm + m) * 255);
  const g = Math.round((gNorm + m) * 255);
  const b = Math.round((bNorm + m) * 255);

  const toHex = (n: number) => {
    const hex = Math.max(0, Math.min(255, n)).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export default function CustomColorPicker({
  color,
  onChange,
  label,
  className = '',
  disabled = false
}: CustomColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hexInput, setHexInput] = useState(color || '#000000');
  
  const hsv = hexToHsv(color || '#000000');
  const [hue, setHue] = useState(hsv.h);
  const [sat, setSat] = useState(hsv.s);
  const [val, setVal] = useState(hsv.v);

  const satValRef = useRef<HTMLDivElement>(null);
  const isDraggingSatVal = useRef(false);

  useEffect(() => {
    const targetHex = color || '#000000';
    setHexInput(prev => prev === targetHex ? prev : targetHex);
    const newHsv = hexToHsv(targetHex);
    setHue(prev => prev === newHsv.h ? prev : newHsv.h);
    setSat(prev => prev === newHsv.s ? prev : newHsv.s);
    setVal(prev => prev === newHsv.v ? prev : newHsv.v);
  }, [color]);

  const updateColorFromHsv = (h: number, s: number, v: number) => {
    const newHex = hsvToHex(h, s, v);
    setHexInput(newHex);
    onChange(newHex);
  };

  const handleSatValPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingSatVal.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    handleSatValMove(e);
  };

  const handleSatValMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSatVal.current || !satValRef.current) return;
    const rect = satValRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    const newSat = (x / rect.width) * 100;
    const newVal = 100 - (y / rect.height) * 100;

    setSat(newSat);
    setVal(newVal);
    updateColorFromHsv(hue, newSat, newVal);
  };

  const handleSatValPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingSatVal.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (_) {}
  };

  const handleHueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newHue = parseFloat(e.target.value);
    setHue(newHue);
    updateColorFromHsv(newHue, sat, val);
  };

  const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valStr = e.target.value;
    setHexInput(valStr);
    const formatted = valStr.startsWith('#') ? valStr : '#' + valStr;
    if (/^#([0-9A-F]{3}){1,2}$/i.test(formatted)) {
      onChange(formatted);
      const newHsv = hexToHsv(formatted);
      setHue(newHsv.h);
      setSat(newHsv.s);
      setVal(newHsv.v);
    }
  };

  const selectPresetColor = (c: string) => {
    onChange(c);
    setHexInput(c);
    const newHsv = hexToHsv(c);
    setHue(newHsv.h);
    setSat(newHsv.s);
    setVal(newHsv.v);
  };

  const handleEyedropper = async () => {
    if ((window as any).EyeDropper) {
      try {
        const eyeDropper = new (window as any).EyeDropper();
        const result = await eyeDropper.open();
        if (result && result.sRGBHex) {
          selectPresetColor(result.sRGBHex);
        }
      } catch (e) {
        // user canceled or not supported
      }
    }
  };

  const pureHueHex = hsvToHex(hue, 100, 100);

  return (
    <div className={`w-full ${className}`}>
      {label && <label className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">{label}</label>}
      
      {/* Primary Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-xl p-2 transition-all shadow-sm ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-neutral-850 cursor-pointer active:scale-[0.99]'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-6 h-6 rounded-lg border border-white/20 shadow-inner shrink-0"
            style={{ backgroundColor: color || '#000000' }}
          />
          <span className="text-xs font-mono font-black text-white tracking-widest truncate">
            {(color || '#000000').toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-1 text-neutral-400">
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
            {isOpen ? 'Close' : 'Color'}
          </span>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-amber-400" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {/* Expanded Inline Color Studio (Fits 100% inside Panel Width, Centered) */}
      {isOpen && (
        <div className="mt-2 w-full bg-neutral-950 border border-neutral-800/90 rounded-2xl p-3 shadow-2xl space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
          
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-1.5 border-b border-neutral-900">
            <div className="flex items-center gap-1.5 text-xs font-black text-amber-400 uppercase tracking-wider">
              <Palette className="w-3.5 h-3.5" />
              <span>In-App Color Studio</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-900 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Interactive 2D Saturation/Brightness Gradient Canvas */}
          <div
            ref={satValRef}
            onPointerDown={handleSatValPointerDown}
            onPointerMove={handleSatValMove}
            onPointerUp={handleSatValPointerUp}
            className="w-full h-32 rounded-xl relative cursor-crosshair overflow-hidden touch-none select-none shadow-inner border border-white/10"
            style={{
              backgroundColor: pureHueHex,
              backgroundImage: 'linear-gradient(to right, #fff, transparent), linear-gradient(to top, #000, transparent)'
            }}
          >
            {/* Pointer handle */}
            <div
              className="w-4 h-4 rounded-full border-2 border-white shadow-lg pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 ring-1 ring-black/50"
              style={{
                left: `${sat}%`,
                top: `${100 - val}%`,
                backgroundColor: color || '#000000'
              }}
            />
          </div>

          {/* Hue Spectrum Slider Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[9px] font-bold text-neutral-400 uppercase tracking-wider">
              <span>Hue Spectrum</span>
              <span className="font-mono text-amber-400">{Math.round(hue)}°</span>
            </div>
            <input
              type="range"
              min="0"
              max="360"
              step="1"
              value={hue}
              onChange={handleHueChange}
              className="w-full h-3.5 rounded-lg appearance-none cursor-pointer outline-none border border-white/10"
              style={{
                background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)'
              }}
            />
          </div>

          {/* Color Preview & Hex Direct Input */}
          <div className="flex items-center gap-2 pt-1">
            <div
              className="w-9 h-9 rounded-xl border border-white/20 shadow-md shrink-0 flex items-center justify-center"
              style={{ backgroundColor: color || '#000000' }}
            >
              <div className="w-2 h-2 rounded-full bg-white/60 shadow-sm" />
            </div>
            
            <div className="flex-1 relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500 font-mono text-xs font-bold">#</span>
              <input
                type="text"
                value={hexInput.replace('#', '')}
                onChange={handleHexInputChange}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-6 pr-2 py-1.5 text-xs font-mono font-black text-white outline-none focus:border-amber-500/80 uppercase transition-colors"
                maxLength={6}
              />
            </div>

            {(window as any).EyeDropper && (
              <button
                type="button"
                onClick={handleEyedropper}
                className="p-2 bg-neutral-900 hover:bg-neutral-850 text-amber-400 border border-neutral-800 rounded-xl shrink-0 transition-colors active:scale-95"
                title="Pick color from screen"
              >
                <Pipette className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Quick Preset Palette Swatches Grid */}
          <div className="pt-1 border-t border-neutral-900">
            <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider block mb-1.5">
              Preset Palette
            </span>
            <div className="grid grid-cols-8 gap-1">
              {PRESET_COLORS.map((c) => {
                const isActive = (color || '').toLowerCase() === c.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => selectPresetColor(c)}
                    className={`h-5 rounded-md border transition-all relative flex items-center justify-center hover:scale-110 active:scale-95 ${
                      isActive
                        ? 'border-amber-400 ring-2 ring-amber-400/40 scale-105 z-10'
                        : 'border-white/10 hover:border-white/40'
                    }`}
                    style={{ backgroundColor: c }}
                    title={c}
                  >
                    {isActive && (
                      <Check className={`w-3 h-3 ${c === '#FFFFFF' || c === '#FDD835' ? 'text-black' : 'text-white'}`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function CustomSelect({
  value,
  onChange,
  options = [],
  placeholder = '-- Select Option --',
  className = '',
  disabled = false,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const safeOptions = Array.isArray(options) ? options : [];
  const selectedOption = safeOptions.find((o) => o.value === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Custom Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between bg-neutral-950 hover:bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-white outline-none font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-inner"
      >
        <span className="truncate pr-2">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-amber-400' : ''}`} />
      </button>

      {/* Floating In-App Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-full z-50 bg-neutral-950 border border-neutral-800 rounded-2xl py-1.5 shadow-2xl shadow-black/80 max-h-56 overflow-y-auto scrollbar-thin animate-in fade-in zoom-in-95 duration-150">
          {safeOptions.length === 0 ? (
            <div className="px-3 py-2 text-xs text-neutral-500 italic font-semibold">No options available</div>
          ) : (
            safeOptions.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs font-bold transition-colors flex items-center justify-between ${
                    isSelected
                      ? 'bg-amber-500/20 text-amber-300 font-black'
                      : 'text-neutral-300 hover:bg-neutral-900 hover:text-white'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 ml-2" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

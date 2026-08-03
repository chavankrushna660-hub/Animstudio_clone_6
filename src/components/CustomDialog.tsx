import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, HelpCircle, CheckCircle, Info } from 'lucide-react';

export interface CustomDialogConfig {
  type: 'alert' | 'confirm' | 'prompt';
  title: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  onConfirm: (value?: string) => void;
  onCancel: () => void;
}

interface CustomDialogProps {
  config: CustomDialogConfig | null;
}

export default function CustomDialog({ config }: CustomDialogProps) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (config) {
      setInputValue(config.defaultValue || '');
      // Focus after a brief timeout to let DOM render
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [config]);

  if (!config) return null;

  const handleConfirm = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    config.onConfirm(inputValue);
  };

  const handleCancel = () => {
    config.onCancel();
  };

  const getIcon = () => {
    switch (config.type) {
      case 'confirm':
        return <HelpCircle className="w-6 h-6 text-amber-400" />;
      case 'prompt':
        return <Info className="w-6 h-6 text-emerald-400" />;
      default:
        return <AlertCircle className="w-6 h-6 text-rose-400" />;
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in"
      onClick={handleCancel}
    >
      <div 
        className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden text-neutral-200 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-neutral-800 bg-neutral-900/60 flex items-center gap-3">
          <div className="p-2 bg-neutral-950/65 border border-neutral-800 rounded-xl">
            {getIcon()}
          </div>
          <div>
            <h3 className="font-black uppercase tracking-wider text-xs text-white">
              {config.title}
            </h3>
            <p className="text-[10px] text-neutral-500 font-mono mt-0.5">
              SYSTEM CONTEXT DIALOG
            </p>
          </div>
        </div>

        {/* Form or message body */}
        <form onSubmit={handleConfirm} className="p-5 space-y-4">
          <p className="text-xs text-neutral-300 leading-relaxed font-semibold">
            {config.message}
          </p>

          {config.type === 'prompt' && (
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={config.placeholder}
              className="w-full bg-neutral-950 border border-neutral-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white outline-none font-bold transition-all placeholder:text-neutral-600"
            />
          )}

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-neutral-800/40">
            {config.type !== 'alert' && (
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-white font-bold uppercase text-[10px] rounded-xl tracking-wider transition-all cursor-pointer"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black font-black uppercase text-[10px] rounded-xl tracking-wider shadow-lg shadow-amber-500/10 transition-all cursor-pointer"
            >
              Confirm
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

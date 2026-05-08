import React, { useState, useEffect, useRef } from 'react';
import { ScanLine } from 'lucide-react';

interface MobileScannerProps {
  onScan: (value: string) => void;
  active: boolean;
}

const MobileScanner = ({ onScan, active }: MobileScannerProps) => {
  const [inputValue, setInputValue] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (active && inputRef.current) {
      inputRef.current.focus();
    }
  }, [active]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && onScan) {
      onScan(inputValue.trim());
      setInputValue('');
    }
  };

  if (!active) return null;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 p-4">
      <ScanLine size={48} className="text-emerald-500 mb-6 animate-pulse opacity-50" />

      <form onSubmit={handleSubmit} className="w-full max-w-[80%] relative z-20">
        <input
          ref={inputRef}
          type="password"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="w-full p-3 rounded-xl text-center font-mono font-bold text-sm bg-white/10 text-white border-2 border-emerald-500/50 focus:outline-none focus:border-emerald-400 focus:bg-white/20 transition-all placeholder:text-white/30"
          placeholder="Wacht op hardware scan..."
          autoFocus
          onBlur={() => {
            if (active) setTimeout(() => inputRef.current?.focus(), 100);
          }}
        />
        <button type="submit" className="hidden">Submit</button>
      </form>
    </div>
  );
};

export default MobileScanner;

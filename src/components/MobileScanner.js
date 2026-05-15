import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef } from 'react';
import { ScanLine } from 'lucide-react';
const MobileScanner = ({ onScan, active }) => {
    const [inputValue, setInputValue] = useState('');
    const inputRef = useRef(null);
    useEffect(() => {
        if (active && inputRef.current) {
            inputRef.current.focus();
        }
    }, [active]);
    const handleSubmit = (e) => {
        e.preventDefault();
        if (inputValue.trim() && onScan) {
            onScan(inputValue.trim());
            setInputValue('');
        }
    };
    if (!active)
        return null;
    return (_jsxs("div", { className: "absolute inset-0 flex flex-col items-center justify-center bg-black/50 p-4", children: [_jsx(ScanLine, { size: 48, className: "text-emerald-500 mb-6 animate-pulse opacity-50" }), _jsxs("form", { onSubmit: handleSubmit, className: "w-full max-w-[80%] relative z-20", children: [_jsx("input", { ref: inputRef, type: "password", value: inputValue, onChange: (e) => setInputValue(e.target.value), className: "w-full p-3 rounded-xl text-center font-mono font-bold text-sm bg-white/10 text-white border-2 border-emerald-500/50 focus:outline-none focus:border-emerald-400 focus:bg-white/20 transition-all placeholder:text-white/30", placeholder: "Wacht op hardware scan...", autoFocus: true, onBlur: () => {
                            if (active)
                                setTimeout(() => inputRef.current?.focus(), 100);
                        } }), _jsx("button", { type: "submit", className: "hidden", children: "Submit" })] })] }));
};
export default MobileScanner;

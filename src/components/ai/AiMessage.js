import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { X as LucideX, ThumbsUp } from "lucide-react";
const AiMessage = ({ message, factoryStructure, onNavigate, onReject, onLike, onQuery }) => {
    const { role, content } = message;
    // Formatter voor AI responses
    const formatResponse = (text) => {
        const parseEntities = (line) => {
            const entityRegex = /(N\d{8,})|\b(BH\d+|Mazak|Robot|CNC|Spuitgieten|Verpakking|Lossen|Nabewerking)\b/gi;
            if (!entityRegex.test(line))
                return line;
            entityRegex.lastIndex = 0;
            const parts = [];
            let lastIndex = 0;
            let match;
            while ((match = entityRegex.exec(line)) !== null) {
                if (match.index > lastIndex)
                    parts.push(line.substring(lastIndex, match.index));
                const text = match[0];
                const isOrder = text.toUpperCase().startsWith('N') && /\d/.test(text);
                let targetDepartment = null;
                if (!isOrder && factoryStructure?.departments) {
                    const lowerText = text.toLowerCase();
                    const foundDept = factoryStructure.departments.find(d => d.name.toLowerCase() === lowerText ||
                        d.stations?.some(s => s.name.toLowerCase() === lowerText));
                    if (foundDept)
                        targetDepartment = foundDept.id;
                }
                parts.push(_jsxs("button", { onClick: (e) => {
                        e.stopPropagation();
                        if (isOrder) {
                            onNavigate('/planning', { state: { searchOrder: text, initialView: 'FITTINGS' } });
                        }
                        else {
                            onNavigate('/planning', { state: { searchMachine: text, initialView: 'WORKSTATIONS', targetDepartment } });
                        }
                    }, className: `inline-flex items-center gap-1 px-2 py-0.5 mx-1 text-xs font-bold border rounded-md transition-colors ${isOrder ? "text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100" : "text-purple-700 bg-purple-50 border-purple-200 hover:bg-purple-100"}`, title: isOrder ? `Ga naar order ${text}` : `Bekijk planning voor ${text}`, children: [_jsx("span", { children: isOrder ? "📦" : "🏭" }), _jsx("span", { children: text })] }, `entity-${match.index}`));
                lastIndex = match.index + text.length;
            }
            if (lastIndex < line.length)
                parts.push(line.substring(lastIndex));
            return parts;
        };
        const ClickableLine = ({ children, text, className = "" }) => {
            const isClickable = text.length > 20;
            if (!isClickable)
                return _jsx("div", { className: className, children: children });
            return (_jsxs("div", { className: `group relative hover:bg-blue-50/80 rounded-lg px-2 -mx-2 transition-all cursor-help border border-transparent hover:border-blue-100 ${className}`, onClick: (e) => {
                    e.stopPropagation();
                    onQuery(`Kun je dit verder toelichten: "${text.replace(/^[-*]\s|^\d+\.\s/, '')}"`);
                }, title: "Klik voor verdieping", children: [_jsx("div", { className: "group-hover:text-blue-900 transition-colors", children: children }), _jsx("span", { className: "absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-[9px] font-black uppercase tracking-widest text-blue-500 bg-white px-2 py-1 rounded-lg shadow-sm border border-blue-100 pointer-events-none transition-all transform translate-x-2 group-hover:translate-x-0 z-10", children: "\u2728 Vraag Detail" })] }));
        };
        return text.split('\n').map((line, i) => {
            if (line.startsWith('### '))
                return _jsx("h3", { className: "text-base font-bold mt-3 mb-2 first:mt-0", children: line.replace('### ', '') }, i);
            if (line.startsWith('## '))
                return _jsx("h2", { className: "text-lg font-bold mt-4 mb-2 first:mt-0", children: line.replace('## ', '') }, i);
            if (line.startsWith('**') && line.endsWith('**'))
                return _jsx("p", { className: "font-bold mb-2", children: line.replace(/\*\*/g, '') }, i);
            if (line.match(/^\d+\./)) {
                const content = line.replace(/^\d+\.\s/, '');
                return _jsx("li", { className: "ml-6 mb-1 list-decimal", children: _jsx(ClickableLine, { text: content, className: "inline-block w-full", children: parseEntities(content) }) }, i);
            }
            if (line.startsWith('- ') || line.startsWith('* ')) {
                const content = line.substring(2);
                return _jsx("li", { className: "ml-6 mb-1 list-disc", children: _jsx(ClickableLine, { text: content, className: "inline-block w-full", children: parseEntities(content) }) }, i);
            }
            if (line === '---')
                return _jsx("hr", { className: "my-4 border-slate-200" }, i);
            if (line.trim() === '')
                return _jsx("br", {}, i);
            return _jsx("div", { className: "mb-2", children: _jsx(ClickableLine, { text: line, children: parseEntities(line) }) }, i);
        });
    };
    return (_jsx("div", { className: `flex ${role === "user" ? "justify-end" : "justify-start"}`, children: _jsx("div", { className: `relative max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed ${role === "user" ? "bg-blue-600 text-white rounded-br-none" : "bg-white border border-slate-200 text-slate-700 rounded-bl-none shadow-sm"}`, children: role === "user" ? content : (_jsxs(_Fragment, { children: [_jsx("div", { className: "prose prose-sm max-w-none", children: formatResponse(content) }), onLike && (_jsx("button", { title: "Goed antwoord \u2014 opslaan in geheugen", onClick: onLike, className: "absolute top-2 right-9 p-1 rounded-full bg-green-50 hover:bg-green-200 text-green-600 border border-green-100 shadow-sm transition-all", style: { zIndex: 10 }, children: _jsx(ThumbsUp, { size: 16 }) })), _jsx("button", { title: "Markeer als foutief/hallucinatie", onClick: onReject, className: "absolute top-2 right-2 p-1 rounded-full bg-red-50 hover:bg-red-200 text-red-600 border border-red-100 shadow-sm transition-all", style: { zIndex: 10 }, children: _jsx(LucideX, { size: 16 }) })] })) }) }));
};
export default AiMessage;

import React, { FC, ReactNode } from "react";
import { X as LucideX, ThumbsUp } from "lucide-react";

interface Department {
  id: string;
  name: string;
  stations?: Array<{ name: string; [key: string]: any }>;
  [key: string]: any;
}

interface FactoryStructure {
  departments?: Department[];
  [key: string]: any;
}

interface Message {
  role: string;
  content: string;
}

interface AiMessageProps {
  message: Message;
  factoryStructure?: FactoryStructure | null;
  onNavigate: (path: string, options?: { state?: Record<string, any> }) => void;
  onReject: () => void;
  onLike?: () => void;
  onQuery: (query: string) => void;
}

const AiMessage: FC<AiMessageProps> = ({ message, factoryStructure, onNavigate, onReject, onLike, onQuery }) => {
  const { role, content } = message;

  // Formatter voor AI responses
  const formatResponse = (text: string): ReactNode[] => {
    const parseEntities = (line: string): ReactNode[] => {
      const entityRegex = /(N\d{8,})|\b(BH\d+|Mazak|Robot|CNC|Spuitgieten|Verpakking|Lossen|Nabewerking)\b/gi;
      if (!entityRegex.test(line)) return [line];
      
      entityRegex.lastIndex = 0;
      const parts: ReactNode[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      
      while ((match = entityRegex.exec(line)) !== null) {
        if (match.index > lastIndex) parts.push(line.substring(lastIndex, match.index));
        
        const matchText = match[0];
        const isOrder = matchText.toUpperCase().startsWith('N') && /\d/.test(matchText);
        let targetDepartment: string | null = null;
        if (!isOrder && factoryStructure?.departments) {
          const lowerText = matchText.toLowerCase();
          const foundDept = factoryStructure.departments.find((d: Department) => 
            d.name.toLowerCase() === lowerText || 
            d.stations?.some((s: any) => s.name.toLowerCase() === lowerText)
          );
          if (foundDept) targetDepartment = foundDept.id;
        }
        
        parts.push(
          <button
            key={`entity-${match.index}`}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              if (isOrder) {
                onNavigate('/planning', { state: { searchOrder: matchText, initialView: 'FITTINGS' } });
              } else {
                onNavigate('/planning', { state: { searchMachine: matchText, initialView: 'WORKSTATIONS', targetDepartment } });
              }
            }}
            className={`inline-flex items-center gap-1 px-2 py-0.5 mx-1 text-xs font-bold border rounded-md transition-colors ${
              isOrder ? "text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100" : "text-purple-700 bg-purple-50 border-purple-200 hover:bg-purple-100"
            }`}
            title={isOrder ? `Ga naar order ${matchText}` : `Bekijk planning voor ${matchText}`}
          >
            <span>{isOrder ? "📦" : "🏭"}</span>
            <span>{matchText}</span>
          </button>
        );
        lastIndex = match.index + matchText.length;
      }
      if (lastIndex < line.length) parts.push(line.substring(lastIndex));
      return parts;
    };
    
    const ClickableLine: FC<{ children: ReactNode; text: string; className?: string }> = ({ children, text, className = "" }) => {
      const isClickable = text.length > 20;
      if (!isClickable) return <div className={className}>{children}</div>;
      return (
        <div 
          className={`group relative hover:bg-blue-50/80 rounded-lg px-2 -mx-2 transition-all cursor-help border border-transparent hover:border-blue-100 ${className}`}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onQuery(`Kun je dit verder toelichten: "${text.replace(/^[-*]\s|^\d+\.\s/, '')}"`);
          }}
          title="Klik voor verdieping"
        >
          <div className="group-hover:text-blue-900 transition-colors">{children}</div>
          <span className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-[9px] font-black uppercase tracking-widest text-blue-500 bg-white px-2 py-1 rounded-lg shadow-sm border border-blue-100 pointer-events-none transition-all transform translate-x-2 group-hover:translate-x-0 z-10">
            ✨ Vraag Detail
          </span>
        </div>
      );
    };

    return text.split('\n').map((line: string, i: number) => {
      if (line.startsWith('### ')) return <h3 key={i} className="text-base font-bold mt-3 mb-2 first:mt-0">{line.replace('### ', '')}</h3>;
      if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-bold mt-4 mb-2 first:mt-0">{line.replace('## ', '')}</h2>;
      if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="font-bold mb-2">{line.replace(/\*\*/g, '')}</p>;
      if (line.match(/^\d+\./)) {
        const contentLine = line.replace(/^\d+\.\s/, '');
        return <li key={i} className="ml-6 mb-1 list-decimal"><ClickableLine text={contentLine} className="inline-block w-full">{parseEntities(contentLine)}</ClickableLine></li>;
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        const contentLine = line.substring(2);
        return <li key={i} className="ml-6 mb-1 list-disc"><ClickableLine text={contentLine} className="inline-block w-full">{parseEntities(contentLine)}</ClickableLine></li>;
      }
      if (line === '---') return <hr key={i} className="my-4 border-slate-200" />;
      if (line.trim() === '') return <br key={i} />;
      return <div key={i} className="mb-2"><ClickableLine text={line}>{parseEntities(line)}</ClickableLine></div>;
    });
  };

  return (
    <div className={`flex ${role === "user" ? "justify-end" : "justify-start"}`}>
      <div className={`relative max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed ${role === "user" ? "bg-blue-600 text-white rounded-br-none" : "bg-white border border-slate-200 text-slate-700 rounded-bl-none shadow-sm"}`}>
        {role === "user" ? content : (
          <>
            <div className="prose prose-sm max-w-none">{formatResponse(content)}</div>
            {onLike && (
              <button
                title="Goed antwoord — opslaan in geheugen"
                onClick={onLike}
                className="absolute top-2 right-9 p-1 rounded-full bg-green-50 hover:bg-green-200 text-green-600 border border-green-100 shadow-sm transition-all"
                style={{ zIndex: 10 }}
              >
                <ThumbsUp size={16} />
              </button>
            )}
            <button
              title="Markeer als foutief/hallucinatie"
              onClick={onReject}
              className="absolute top-2 right-2 p-1 rounded-full bg-red-50 hover:bg-red-200 text-red-600 border border-red-100 shadow-sm transition-all"
              style={{ zIndex: 10 }}
            >
              <LucideX size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default AiMessage;

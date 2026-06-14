import React, { useState, useEffect, useCallback } from 'react';
import { 
  ChevronLeft, ChevronRight, Tablet, FileText, Users, 
  Settings, Zap, MessageSquarePlus, PlayCircle, ShieldCheck, X
} from 'lucide-react';

interface CompanyPresentationProps {
  onClose?: () => void;
}

const CompanyPresentation: React.FC<CompanyPresentationProps> = ({ onClose }) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    {
      title: "Van Papier naar Digitaal Gemak",
      subtitle: "Welkom in de Future Factory",
      icon: <Tablet size={64} className="text-blue-500 mb-6" />,
      content: (
        <div className="text-center">
          <p className="text-xl text-slate-600 mb-8 max-w-2xl mx-auto leading-relaxed">
            Vandaag introduceren we geen log softwarepakket van kantoor, maar een digitaal gereedschap 
            dat we samen, vanaf de fabrieksvloer, aan het bouwen zijn.
          </p>
          <div className="flex justify-center gap-4">
            <span className="bg-blue-100 text-blue-700 px-4 py-2 rounded-full font-bold uppercase tracking-widest text-sm">
              Live Planning
            </span>
            <span className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-full font-bold uppercase tracking-widest text-sm">
              Traceability
            </span>
            <span className="bg-purple-100 text-purple-700 px-4 py-2 rounded-full font-bold uppercase tracking-widest text-sm">
              Kwaliteit
            </span>
          </div>
        </div>
      )
    },
    {
      title: "Waar komen we vandaan?",
      subtitle: "De uitdagingen van papier",
      icon: <FileText size={48} className="text-slate-400 mb-4" />,
      content: (
        <ul className="space-y-6 text-lg text-slate-600 max-w-xl mx-auto text-left">
          <li className="flex items-center gap-4">
            <span className="bg-rose-100 text-rose-600 p-2 rounded-lg"><Zap size={24} /></span>
            Zodra een planning is geprint, is deze eigenlijk al verouderd.
          </li>
          <li className="flex items-center gap-4">
            <span className="bg-rose-100 text-rose-600 p-2 rounded-lg"><Settings size={24} /></span>
            Handmatig overtypen van metingen kost tijd en is foutgevoelig.
          </li>
          <li className="flex items-center gap-4">
            <span className="bg-rose-100 text-rose-600 p-2 rounded-lg"><FileText size={24} /></span>
            Zoeken naar de juiste werkbon of tekening haalt je uit je flow.
          </li>
        </ul>
      )
    },
    {
      title: "Gebouwd vanuit de Werkvloer",
      subtitle: "Bottom-Up in plaats van Top-Down",
      icon: <Users size={48} className="text-emerald-500 mb-4" />,
      content: (
        <div className="grid grid-cols-2 gap-8 text-left max-w-4xl mx-auto mt-8">
          <div className="bg-slate-50 p-8 rounded-2xl border border-slate-100 shadow-sm">
            <h4 className="font-black text-slate-800 text-xl mb-4 flex items-center gap-2">
              <ShieldCheck className="text-emerald-500" /> Geen "Kantoor" Systeem
            </h4>
            <p className="text-slate-600 leading-relaxed">
              Dit is geen ingewikkeld ERP dat over de schutting is gegooid. 
              Grote knoppen, donkere modus voor rustige ogen, en logische stappen 
              bedacht door operators.
            </p>
          </div>
          <div className="bg-slate-50 p-8 rounded-2xl border border-slate-100 shadow-sm">
            <h4 className="font-black text-slate-800 text-xl mb-4 flex items-center gap-2">
              <Zap className="text-emerald-500" /> Minder Administratie
            </h4>
            <p className="text-slate-600 leading-relaxed">
              Tekeningen met één klik bij de machine, directe label-prints (Zebra) 
              en ATM-stijl invoer voor het lab. Het systeem denkt met je mee.
            </p>
          </div>
        </div>
      )
    },
    {
      title: "Jouw Input is de Motor",
      subtitle: "We bouwen dit systeem samen",
      icon: <MessageSquarePlus size={48} className="text-purple-500 mb-4" />,
      content: (
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xl text-slate-600 mb-8 leading-relaxed">
            Het fundament staat en de eerste pilots bewijzen dat het werkt. Maar we zijn nog niet klaar. 
            Een systeem is pas perfect als het naadloos aansluit op <b>jullie</b> dagelijkse werk.
          </p>
          <div className="bg-purple-50 text-purple-800 p-6 rounded-2xl font-bold text-lg border border-purple-100">
            Mist er een knop? Kost iets te veel kliks? Heb je een goed idee?<br/>
            Laat het weten. Dit is óns gereedschap!
          </div>
        </div>
      )
    },
    {
      title: "Laten we kijken!",
      subtitle: "Live demonstratie",
      icon: <PlayCircle size={64} className="text-blue-600 mb-6 animate-pulse" />,
      content: (
        <div className="text-center">
          <button 
            onClick={() => window.location.href = '/workstation'} 
            className="bg-slate-900 text-white px-10 py-5 rounded-full font-black uppercase tracking-widest text-lg shadow-2xl hover:bg-blue-600 transition-all hover:scale-105 active:scale-95 flex items-center gap-3 mx-auto"
          >
            Open Productie Hub <ChevronRight size={24} />
          </button>
        </div>
      )
    }
  ];

  const changeSlide = useCallback((direction: 'next' | 'prev') => {
    setCurrentSlide((prev) => {
      if (direction === 'next') return Math.min(prev + 1, slides.length - 1);
      if (direction === 'prev') return Math.max(prev - 1, 0);
      return prev;
    });
  }, [slides.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Space') changeSlide('next');
      if (e.key === 'ArrowLeft') changeSlide('prev');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [changeSlide]);

  return (
    <div className="min-h-screen w-full fixed inset-0 z-[9999] bg-white flex flex-col justify-between p-8 md:p-12 animate-in fade-in zoom-in-95 duration-500 ease-out">
      {/* Achtergrond styling */}
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-blue-50 rounded-full blur-3xl opacity-50 pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-emerald-50 rounded-full blur-3xl opacity-50 pointer-events-none" />

      {/* Header */}
      <header className="flex justify-between items-center relative z-10">
        <div className="font-black text-xl tracking-tighter italic uppercase text-slate-800">
          Future <span className="text-blue-600">Factory</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-sm font-bold text-slate-400 uppercase tracking-widest">
            Slide {currentSlide + 1} / {slides.length}
          </div>
          {onClose && (
            <button 
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold uppercase text-xs tracking-widest transition-colors"
            >
              <X size={16} /> Sluiten
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center relative z-10 w-full max-w-6xl mx-auto px-4">
        <div className="transition-all duration-500 ease-in-out transform">
          <div className="flex flex-col items-center text-center mb-12">
            {slides[currentSlide].icon}
            <h1 className="text-5xl md:text-6xl font-black text-slate-900 mb-4 tracking-tight">
              {slides[currentSlide].title}
            </h1>
            <h2 className="text-2xl text-blue-600 font-medium italic">
              {slides[currentSlide].subtitle}
            </h2>
          </div>
          
          <div className="animate-fade-in-up">
            {slides[currentSlide].content}
          </div>
        </div>
      </main>

      {/* Controls */}
      <footer className="flex justify-center items-center gap-8 relative z-10">
        <button
          onClick={() => changeSlide('prev')}
          disabled={currentSlide === 0}
          aria-label="Vorige slide"
          className="p-4 rounded-full bg-slate-100 text-slate-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronLeft size={32} />
        </button>
        
        <div className="flex gap-3">
          {slides.map((_, idx) => (
            <div 
              key={idx} 
              className={`h-2 rounded-full transition-all duration-300 ${
                idx === currentSlide ? 'w-12 bg-blue-600' : 'w-2 bg-slate-200'
              }`}
            />
          ))}
        </div>

        <button
          onClick={() => changeSlide('next')}
          disabled={currentSlide === slides.length - 1}
          aria-label="Volgende slide"
          className="p-4 rounded-full bg-slate-100 text-slate-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronRight size={32} />
        </button>
      </footer>
    </div>
  );
};

export default CompanyPresentation;
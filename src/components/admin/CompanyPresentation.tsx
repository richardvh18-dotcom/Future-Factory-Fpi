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
  const [currentStep, setCurrentStep] = useState(0);

  const slides = [
    {
      title: "",
      subtitle: "",
      icon: (
        <div className="mb-12 relative flex justify-center items-center">
          <style>
            {`
              @keyframes breathe {
                0%, 100% { transform: scale(1); filter: drop-shadow(0 10px 15px rgba(0,0,0,0.1)); }
                50% { transform: scale(1.08); filter: drop-shadow(0 25px 35px rgba(59, 130, 246, 0.4)); }
              }
              .animate-breathe {
                animation: breathe 4s ease-in-out infinite;
              }
            `}
          </style>
          <div className="absolute w-80 h-80 md:w-96 md:h-96 lg:w-[28rem] lg:h-[28rem] bg-blue-100 rounded-full blur-3xl opacity-50 animate-pulse" style={{ animationDuration: '4s' }} />
          <img 
            src="/logo192.png" 
            alt="FPi Logo" 
            className="w-64 h-64 md:w-80 md:h-80 lg:w-96 lg:h-96 object-contain relative z-10 animate-breathe rounded-3xl" 
          />
        </div>
      ),
      steps: 1,
      content: (
        <div className={`text-center transition-all duration-700 ease-out transform ${currentStep >= 0 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <p className="text-sm md:text-base text-slate-400 mt-24 lg:mt-32 tracking-wide font-light">
            Druk op <kbd className="bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200 text-slate-500 font-mono text-xs mx-1 shadow-sm">Spatiebalk</kbd> of <kbd className="bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200 text-slate-500 font-mono text-xs mx-1 shadow-sm">→</kbd> om te starten
          </p>
        </div>
      )
    },
    {
      title: "Van Papier naar Digitaal Gemak",
      subtitle: "Welkom in de Future Factory",
      icon: <Tablet size={96} className="text-blue-500 mb-8" />,
      steps: 2,
      content: (
        <div className={`text-center transition-all duration-700 ease-out transform ${currentStep >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <p className="text-2xl md:text-4xl text-slate-600 mb-12 max-w-4xl mx-auto leading-relaxed">
            Vandaag introduceren we geen log softwarepakket van kantoor, maar een digitaal gereedschap 
            Vandaag introduceren we geen softwarepakket bedacht op een kantoor, maar een digitaal gereedschap 
            dat we samen, vanaf de fabrieksvloer, aan het bouwen zijn.
          </p>
          <div className="flex justify-center gap-6">
            <span className="bg-blue-100 text-blue-700 px-6 py-3 rounded-full font-black uppercase tracking-widest text-lg md:text-xl">
              Live Planning
            </span>
            <span className="bg-emerald-100 text-emerald-700 px-6 py-3 rounded-full font-black uppercase tracking-widest text-lg md:text-xl">
              Traceability
            </span>
            <span className="bg-purple-100 text-purple-700 px-6 py-3 rounded-full font-black uppercase tracking-widest text-lg md:text-xl">
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
      steps: 4,
      content: (
        <ul className="space-y-8 text-2xl md:text-3xl text-slate-600 max-w-4xl mx-auto text-left">
          <li className={`flex items-center gap-6 transition-all duration-500 ease-out transform ${currentStep >= 1 ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'}`}>
            <span className="bg-rose-100 text-rose-600 p-3 rounded-2xl shadow-sm"><Zap size={36} /></span>
            Zodra een planning is geprint, is deze eigenlijk al verouderd.
          </li>
          <li className={`flex items-center gap-6 transition-all duration-500 ease-out transform ${currentStep >= 2 ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'}`}>
            <span className="bg-rose-100 text-rose-600 p-3 rounded-2xl shadow-sm"><Settings size={36} /></span>
            Handmatig overtypen van metingen kost tijd en is foutgevoelig.
          </li>
          <li className={`flex items-center gap-6 transition-all duration-500 ease-out transform ${currentStep >= 3 ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'}`}>
            <span className="bg-rose-100 text-rose-600 p-3 rounded-2xl shadow-sm"><FileText size={36} /></span>
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
        <div className="grid grid-cols-2 gap-10 text-left max-w-6xl mx-auto mt-8">
          <div className="bg-slate-50 p-8 rounded-2xl border border-slate-100 shadow-sm">
            <h4 className="font-black text-slate-800 text-2xl md:text-3xl mb-6 flex items-center gap-3">
              <ShieldCheck size={36} className="text-emerald-500" /> Geen "Kantoor" Systeem
            </h4>
            <p className="text-xl md:text-2xl text-slate-600 leading-relaxed">
              Dit is geen ingewikkeld ERP dat over de schutting is gegooid. 
              Grote knoppen, donkere modus voor rustige ogen, en logische stappen 
              bedacht door operators.
            </p>
          </div>
          <div className="bg-slate-50 p-8 rounded-2xl border border-slate-100 shadow-sm">
            <h4 className="font-black text-slate-800 text-2xl md:text-3xl mb-6 flex items-center gap-3">
              <Zap size={36} className="text-emerald-500" /> Minder Administratie
            </h4>
            <p className="text-xl md:text-2xl text-slate-600 leading-relaxed">
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
        <div className="text-center max-w-4xl mx-auto">
          <p className="text-2xl md:text-3xl text-slate-600 mb-10 leading-relaxed">
            Het fundament staat en de eerste pilots bewijzen dat het werkt. Maar we zijn nog niet klaar. 
            Een systeem is pas perfect als het naadloos aansluit op <b>jullie</b> dagelijkse werk.
          </p>
          <div className="bg-purple-50 text-purple-800 p-8 rounded-2xl font-bold text-2xl md:text-3xl border border-purple-100 leading-relaxed">
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
            className="bg-slate-900 text-white px-12 py-6 rounded-full font-black uppercase tracking-widest text-xl md:text-2xl shadow-2xl hover:bg-blue-600 transition-all hover:scale-105 active:scale-95 flex items-center gap-4 mx-auto"
          >
            Open Productie Hub <ChevronRight size={32} />
          </button>
        </div>
      )
    }
  ];

  const changeSlide = (direction: 'next' | 'prev') => {
    const currentSlideObj = slides[currentSlide];
    const maxSteps = currentSlideObj.steps || 1;

    if (direction === 'next') {
      if (currentStep < maxSteps - 1) {
        setCurrentStep(currentStep + 1);
      } else if (currentSlide < slides.length - 1) {
        setCurrentSlide(currentSlide + 1);
        setCurrentStep(0);
      }
    } else if (direction === 'prev') {
      if (currentStep > 0) {
        setCurrentStep(currentStep - 1);
      } else if (currentSlide > 0) {
        const prevSlideIdx = currentSlide - 1;
        setCurrentSlide(prevSlideIdx);
        setCurrentStep((slides[prevSlideIdx].steps || 1) - 1);
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Space' || e.key === ' ') {
        if (e.key === ' ' || e.key === 'Space') e.preventDefault(); // Voorkom dat de pagina naar beneden scrollt
        changeSlide('next');
      }
      if (e.key === 'ArrowLeft') changeSlide('prev');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSlide, currentStep]);

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
        <div key={currentSlide} className="transition-all duration-500 ease-in-out transform w-full animate-in fade-in">
          <div className="flex flex-col items-center text-center mb-12">
            {slides[currentSlide].icon}
            {slides[currentSlide].title && (
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-black text-slate-900 mb-4 tracking-tight">
                {slides[currentSlide].title}
              </h1>
            )}
            {slides[currentSlide].subtitle && (
              <h2 className="text-2xl md:text-3xl lg:text-4xl text-blue-600 font-medium italic">
                {slides[currentSlide].subtitle}
              </h2>
            )}
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
          disabled={currentSlide === 0 && currentStep === 0}
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
          disabled={currentSlide === slides.length - 1 && currentStep === (slides[slides.length - 1].steps || 1) - 1}
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
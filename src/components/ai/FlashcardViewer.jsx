import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  RotateCw,
  BookOpen,
  X,
  CheckCircle2,
  Sparkles,
} from "lucide-react";

/**
 * FlashcardViewer V2.0 - AI Training Interface
 * Biedt een interactieve 3D interface voor het leren van technische termen en processen.
 */
const FlashcardViewer = ({ data, onClose }) => {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Injecteer 3D CSS effecten bij mount
  useEffect(() => {
    const styleId = "flashcard-3d-styles";
    if (!document.getElementById(styleId)) {
      const styleSheet = document.createElement("style");
      styleSheet.id = styleId;
      styleSheet.innerText = `
        .perspective-1000 { perspective: 1000px; }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `;
      document.head.appendChild(styleSheet);
    }
  }, []);

  if (!data || !data.flashcards || data.flashcards.length === 0) return null;

  const cards = data.flashcards;
  const currentCard = cards[currentIndex];

  const handleNext = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % cards.length);
    }, 150);
  };

  const handlePrev = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + cards.length) % cards.length);
    }, 150);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full w-full p-4 animate-in fade-in zoom-in-95 text-left">
      {/* Header / Progress Control */}
      <div className="mb-10 flex items-center justify-between w-full max-w-xl bg-white/50 backdrop-blur-sm p-4 rounded-[25px] border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-600 text-white rounded-xl shadow-lg">
            <Sparkles size={16} />
          </div>
          <span className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em] italic">
            {t('ai.flashcard.card', { current: currentIndex + 1, total: cards.length })}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-xl transition-all active:scale-90"
        >
          <X size={20} />
        </button>
      </div>

      {/* THE 3D CARD CONTAINER */}
      <div
        className="relative w-full max-w-xl aspect-[3/2] cursor-pointer group perspective-1000"
        onClick={() => setIsFlipped(!isFlipped)}
      >
        <div
          className={`w-full h-full transition-all duration-700 ease-in-out transform-style-3d relative ${
            isFlipped ? "rotate-y-180" : ""
          }`}
        >
          {/* FRONT SIDE */}
          <div className="absolute inset-0 backface-hidden bg-white rounded-[45px] shadow-2xl border-2 border-slate-100 flex flex-col items-center justify-center p-12 text-center hover:border-purple-300 transition-all group-hover:shadow-purple-900/5">
            <div className="mb-6 p-4 bg-purple-50 text-purple-600 rounded-[20px] ring-8 ring-purple-50/50">
              <BookOpen size={32} strokeWidth={2.5} />
            </div>
            <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter uppercase italic leading-tight">
              {currentCard.front.text}
            </h3>
            <div className="absolute bottom-10 flex flex-col items-center gap-2 opacity-40 group-hover:opacity-100 transition-opacity">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.4em]">
                Klik om te onthullen
              </span>
              <ChevronDown
                className="text-slate-300 animate-bounce"
                size={16}
              />
            </div>
          </div>

          {/* BACK SIDE */}
          <div className="absolute inset-0 backface-hidden bg-slate-900 text-white rounded-[45px] shadow-2xl flex flex-col items-center justify-center p-12 text-center rotate-y-180 border border-white/10 overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5 -rotate-12">
              <CheckCircle2 size={150} />
            </div>
            <div className="mb-6 p-4 bg-white/10 text-emerald-400 rounded-[20px] backdrop-blur-md relative z-10">
              <RotateCw size={32} strokeWidth={2.5} />
            </div>
            <div className="relative z-10 max-w-md">
              <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em] mb-4">
                Definitie / Antwoord
              </h4>
              <p className="text-lg md:text-xl font-medium leading-relaxed italic text-slate-200">
                {currentCard.back.text}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* NAVIGATION CONTROLS */}
      <div className="mt-12 flex items-center gap-6 animate-in slide-in-from-bottom-4 duration-700">
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlePrev();
          }}
          className="p-5 rounded-3xl bg-white border-2 border-slate-100 text-slate-400 hover:text-purple-600 hover:border-purple-200 shadow-xl active:scale-90 transition-all group"
          title="Vorige kaart"
        >
          <ChevronLeft
            size={28}
            className="group-hover:-translate-x-1 transition-transform"
          />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleNext();
          }}
          className="px-12 py-5 rounded-[25px] bg-slate-900 text-white font-black uppercase text-xs tracking-[0.3em] hover:bg-purple-600 shadow-2xl active:scale-95 transition-all flex items-center gap-3 group"
        >
          Volgende{" "}
          <ChevronRight
            size={18}
            className="group-hover:translate-x-1 transition-transform"
          />
        </button>

        <div className="hidden sm:flex items-center gap-3 px-6 py-4 bg-slate-100 rounded-[22px] border border-slate-200 opacity-50">
          <CheckCircle2 size={16} className="text-emerald-500" />
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">
            Training Mode: Active
          </span>
        </div>
      </div>
    </div>
  );
};

// Interne ChevronDown helper
const ChevronDown = ({ className, size }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export default FlashcardViewer;

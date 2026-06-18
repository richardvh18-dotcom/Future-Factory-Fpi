import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  SearchX,
  Code2,
  Database,
  FileX,
  RefreshCw,
  Zap,
  Eye,
  TrendingUp,
  CloudLightning,
  MapPin,
  ShieldCheck,
  Users,
  PlayCircle,
  Home,
  Share2,
  CreditCard,
  Key,
  ChevronsUpDown,
  MonitorSmartphone,
  Globe,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export const MTPresentation = () => {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(0);
  const total = 15;
  const [mesActive, setMesActive] = useState<number | null>(null);
  const [firebaseFlowActive, setFirebaseFlowActive] = useState<number | null>(null);
  const navigate = useNavigate();

  // MES animation effect
  useEffect(() => {
    if (current !== 5) {
      setMesActive(null);
      return;
    }

    let step = 0;
    const seq = [0, 1, 2, 1];

    const interval = setInterval(() => {
      setMesActive(seq[step % 4]);
      step++;
    }, 1500);

    return () => clearInterval(interval);
  }, [current]);

  useEffect(() => {
    if (current !== 9) {
      setFirebaseFlowActive(null);
      return;
    }

    let step = 0;
    const seq = [0, 1, 2, 1];
    const interval = setInterval(() => {
      setFirebaseFlowActive(seq[step % seq.length]);
      step++;
    }, 1200);

    return () => clearInterval(interval);
  }, [current]);

  const changeSlide = useCallback((dir: number) => {
    setCurrent((prev) => {
      let next = prev + dir;
      if (next >= total) return total - 1;
      if (next < 0) return 0;
      return next;
    });
  }, [total]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') changeSlide(1);
      if (e.key === 'ArrowLeft') changeSlide(-1);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [changeSlide]);

  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;600;800&family=Poppins:wght@900&family=Fira+Code&family=Comfortaa:wght@700&display=swap');

    .mt-presentation {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background-color: #020617;
      color: #f8fafc;
      overflow: hidden;
      user-select: none;
      height: 100vh;
      width: 100vw;
    }

    .slide {
      display: none;
      height: 100vh;
      width: 100vw;
      padding: 4vh 6vw;
      box-sizing: border-box;
      position: absolute;
      top: 0;
      left: 0;
      flex-direction: column;
      justify-content: center;
      z-index: 10;
    }

    .slide.active { 
      display: flex; 
      animation: slideFade 0.6s ease-out; 
    }

    @keyframes slideFade {
      from { opacity: 0; transform: scale(1.01); }
      to { opacity: 1; transform: scale(1); }
    }

    @keyframes breathe {
      0%, 100% { transform: scale(1); opacity: 0.9; filter: drop-shadow(0 0 20px rgba(59, 130, 246, 0.5)); }
      50% { transform: scale(1.05); opacity: 1; filter: drop-shadow(0 0 60px rgba(59, 130, 246, 0.9)); }
    }

    .logo-breathe { 
      animation: breathe 5s ease-in-out infinite; 
      pointer-events: none; 
    }

    .mes-box { 
      padding: 1vw; 
      border-radius: 1.5rem; 
      background: rgba(255,255,255,0.05); 
      border: 2px solid rgba(255,255,255,0.08); 
      text-align: center; 
      opacity: 0.3; 
      transition: 0.5s; 
    }

    .mes-active { 
      background: #3b82f6;
      opacity: 1; 
      transform: scale(1.05); 
      box-shadow: 0 0 40px rgba(59,130,246,0.3); 
      border-color: #3b82f6;
    }

    @keyframes brandBreathe {
      0%, 100% { transform: translateY(0) scale(1); box-shadow: 0 0 0 rgba(59, 130, 246, 0); }
      50% { transform: translateY(-2px) scale(1.03); box-shadow: 0 0 26px rgba(59, 130, 246, 0.22); }
    }

    .brand-tile-breathe {
      animation: brandBreathe 4.8s ease-in-out infinite;
      will-change: transform, box-shadow;
    }

    .flow-node {
      border: 2px solid rgba(148, 163, 184, 0.35);
      background: rgba(15, 23, 42, 0.65);
      border-radius: 1.6rem;
      transition: all 0.35s ease;
      opacity: 0.5;
    }

    .flow-node-active {
      border-color: rgba(59, 130, 246, 0.85);
      background: rgba(37, 99, 235, 0.2);
      opacity: 1;
      transform: scale(1.04);
      box-shadow: 0 0 36px rgba(59, 130, 246, 0.3);
    }

    @keyframes flowPulse {
      0%, 100% { opacity: 0.25; transform: scaleX(1); }
      50% { opacity: 0.9; transform: scaleX(1.08); }
    }

    .flow-link {
      height: 4px;
      border-radius: 999px;
      background: linear-gradient(90deg, rgba(59,130,246,0.2), rgba(59,130,246,0.85), rgba(16,185,129,0.2));
      animation: flowPulse 1.2s ease-in-out infinite;
      transform-origin: center;
    }
  `;

  const slideProps = (bg?: string) => ({
    className: `slide ${current === 0 ? 'active' : ''} ${bg || ''}`,
  });

  return (
    <div className="mt-presentation relative">
      <style>{styles}</style>

      {/* Back to App Button */}
      <div className="fixed top-[3vh] right-[3vw] z-50">
        <button
          onClick={() => navigate('/portal')}
          className="bg-white/5 backdrop-blur-[15px] border-2 border-white/10 text-white/60 px-[2vw] py-[1.2vh] rounded-[1.5rem] font-bold cursor-pointer transition-all hover:bg-blue-500 hover:translate-y-[-3px] hover:text-white hover:border-blue-500 flex items-center gap-4 uppercase text-[clamp(12px,0.9vw,22px)]"
        >
          <ArrowLeft size={20} />
          {t('mtPresentation.backToApp', 'Terug naar App')}
        </button>
      </div>

      {/* Slide Counter */}
      <div className="fixed bottom-[4vh] left-[4vw] text-[0.8vw] font-bold text-white/20 uppercase tracking-[5px] z-50">
        {t('mtPresentation.slideCounter', 'SLIDE')} {String(current + 1).padStart(2, '0')} / {total}
      </div>

      {/* Navigation Buttons */}
      <div className="fixed bottom-[3vh] right-[3vw] flex gap-[1.5vw] z-50">
        <button
          onClick={() => changeSlide(-1)}
          aria-label={t('mtPresentation.previousSlideAria', 'Vorige slide')}
          className="bg-white/5 backdrop-blur-[15px] border-2 border-white/10 text-white/60 px-[2vw] py-[1.2vh] rounded-[1.5rem] font-bold cursor-pointer transition-all hover:bg-blue-500 hover:translate-y-[-3px] hover:text-white hover:border-blue-500 flex items-center gap-4 uppercase"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          onClick={() => changeSlide(1)}
          aria-label={t('mtPresentation.nextSlideAria', 'Volgende slide')}
          className="bg-white/5 backdrop-blur-[15px] border-2 border-white/10 text-white/60 px-[2vw] py-[1.2vh] rounded-[1.5rem] font-bold cursor-pointer transition-all hover:bg-blue-500 hover:translate-y-[-3px] hover:text-white hover:border-blue-500 flex items-center gap-4 uppercase"
        >
          {t('mtPresentation.next', 'VOLGENDE')} <ChevronRight size={20} />
        </button>
      </div>

      {/* Slides */}
      <div className="relative w-full h-full">
        {/* Slide 0 - FPI Logo */}
        <div className={`slide ${current === 0 ? 'active' : ''} bg-slate-950`}>
          <div className="flex flex-col items-center justify-center h-full">
            <img
              src="/logo512.svg"
              alt="FPI Logo"
              className="logo-breathe w-[50vw] filter brightness-150"
            />
          </div>
        </div>

        {/* Slide 1 - Title */}
        <div className={`slide ${current === 1 ? 'active' : ''}`}>
          <div className="flex flex-col items-center text-center">
            <h1 className="font-black italic text-[11vw] leading-[0.85] -tracking-[0.05em] text-white">
              FUTURE<br />
              <span className="text-blue-500">{t('mtPresentation.factory', 'FACTORY')}</span>
            </h1>
            <p className="text-[2.2vw] text-slate-400 font-light italic mt-6 max-w-5xl">
              {t('mtPresentation.digitalTransitionShopfloor', 'De digitale transitie van de werkvloer.')}
            </p>
            <div className="mt-12 px-12 py-6 bg-white/5 border border-white/10 rounded-[3rem] backdrop-blur-xl inline-flex flex-col items-center">
              <p className="text-[0.8vw] font-bold uppercase tracking-[0.6em] text-blue-400 mb-2">
                {t('mtPresentation.projectArchitect', 'Project Architect')}
              </p>
              <p className="text-[3.2vw] font-extrabold tracking-tight text-white leading-none">
                Richard van Heerde
              </p>
              <p className="text-slate-500 text-[1vw] uppercase tracking-widest font-black mt-4">
                {t('mtPresentation.corporatePresentation2026', 'Corporate Presentation • 2026')}
              </p>
            </div>
          </div>
        </div>

        {/* Slide 2 - Journey */}
        <div className={`slide ${current === 2 ? 'active' : ''} bg-slate-900`}>
          <h2 className="font-black uppercase text-[clamp(40px,3.5vw,85px)] leading-none mb-[3vh] border-l-[1vw] border-blue-500 pl-[2.5vw]">
            {t('mtPresentation.journeyToCustomization', 'De Reis naar Maatwerk')}
          </h2>
          <div className="grid grid-cols-2 gap-12">
            <div className="space-y-8">
              <div className="bg-red-500/5 border-2 border-red-500/20 rounded-[2.5rem] p-[2.5vw] backdrop-blur-[12px]">
                <h3 className="text-red-400 mb-4 flex items-center gap-4 text-[clamp(22px,2vw,50px)] font-bold">
                  <SearchX size={40} /> {t('mtPresentation.externalResearch2024', '2024: Onderzoek Extern')}
                </h3>
                <p className="text-[1.4vw]">
                  {t('mtPresentation.thirdPartyTooRigid', 'Software van derden bleek te star. Het kon niet alles wat Future Pipe nodig had. We moesten ons proces aanpassen aan hun systeem.')}
                </p>
              </div>
              <div className="bg-emerald-500/5 border-2 border-emerald-500/20 rounded-[2.5rem] p-[2.5vw] backdrop-blur-[12px]">
                <h3 className="text-emerald-400 mb-4 flex items-center gap-4 text-[clamp(22px,2vw,50px)] font-bold">
                  <Code2 size={40} /> {t('mtPresentation.startDec2025', 'Dec 2025: De Start')}
                </h3>
                <p className="text-[1.4vw]">
                  {t('mtPresentation.buildOurselvesReason', 'Besloten om zelf te ontwikkelen. Omdat hoe we werkten met papier en Excel echt niet meer kon. Tijd voor data aan de bron.')}
                </p>
              </div>
            </div>
            <div className="flex flex-col justify-center p-12 bg-white/5 rounded-[4rem] border-2 border-white/5">
              <p className="text-[3vw] font-black italic text-blue-500 leading-tight">
                {t('mtPresentation.marketCantHelpQuote', '"Als de markt ons niet kan helpen, bouwen we het zelf. Beter, sneller en goedkoper."')}
              </p>
            </div>
          </div>
        </div>

        {/* Slide 3 - Genesis */}
        <div className={`slide ${current === 3 ? 'active' : ''} bg-slate-950`}>
          <h2 className="font-black uppercase text-[clamp(40px,3.5vw,85px)] leading-none mb-[3vh] border-l-[1vw] border-blue-500 pl-[2.5vw]">
            {t('mtPresentation.genesisTitle', 'Het Begin (Genesis)')}
          </h2>
          <div className="grid grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <h3 className="text-blue-400 italic text-[clamp(22px,2vw,50px)] font-bold">
                {t('mtPresentation.initialNeed', 'De Initiële Behoefte')}
              </h3>
              <p className="font-black italic text-white leading-tight mb-8 text-[2.2vw]">
                {t('mtPresentation.initialQuestionQuote', '"Hoe krijg IK de juiste tekeningen en maten direct bij de man aan de machine?"')}
              </p>
              <div className="space-y-4">
                <div className="flex items-center gap-6 p-4 bg-white/5 rounded-2xl border border-white/10">
                  <Database className="text-emerald-500" size={32} />
                  <span className="font-bold text-lg">{t('mtPresentation.centralizationOfData', 'Centralisatie van Data')}</span>
                </div>
                <div className="flex items-center gap-6 p-4 bg-white/5 rounded-2xl border border-white/10">
                  <FileX className="text-red-500" size={32} />
                  <span className="font-bold text-lg">{t('mtPresentation.noMorePaperFlow', 'Weg met de Papierstroom')}</span>
                </div>
                <div className="flex items-center gap-6 p-4 bg-white/5 rounded-2xl border border-white/10">
                  <RefreshCw className="text-blue-500" size={32} />
                  <span className="font-bold text-lg">{t('mtPresentation.realtimePlanningLink', 'Real-time Planning koppeling')}</span>
                </div>
              </div>
            </div>
            <div className="bg-slate-800/50 border-2 border-blue-500/20 rounded-[2.5rem] p-[2.5vw] backdrop-blur-[12px]">
              <p className="text-slate-400 italic">
                {t('mtPresentation.databaseAtSourceQuote', '"Door een database aan de bron te creëren, elimineren we de kans op fouten door verouderde papieren tekeningen."')}
              </p>
            </div>
          </div>
        </div>

        {/* Slide 4 - Bottom-Up */}
        <div className={`slide ${current === 4 ? 'active' : ''} bg-slate-900`}>
          <h2 className="font-black uppercase text-[clamp(40px,3.5vw,85px)] leading-none mb-[3vh] border-l-[1vw] border-blue-500 pl-[2.5vw]">
            {t('mtPresentation.bottomUpBuildTitle', 'Bottom-Up Opbouw')}
          </h2>
          <div className="grid grid-cols-2 gap-12 items-stretch">
            <div className="bg-slate-950 text-white p-12 rounded-[3rem] flex flex-col justify-center border border-white/10">
              <h3 className="text-blue-400 mb-2 italic text-[clamp(22px,2vw,50px)] font-bold">
                {t('mtPresentation.operatorPerspective', 'Operator Standpunt')}
              </h3>
              <p className="text-slate-500 text-[1.4vw] mb-4 font-semibold">
                {t('mtPresentation.notDeskButMachine', 'Niet bedacht aan een bureau, maar aan de machine.')}
              </p>
              <p className="text-slate-400 text-[1.1vw] leading-relaxed mb-6">
                {t('mtPresentation.noTopDownSystem', 'Geen systeem van bovenaf opgelegd waar het proces op aangepast moet worden door kantoorpersoneel.')}
              </p>
              <p className="font-black italic text-blue-500 mb-8 border-l-4 border-blue-500 pl-6 text-[2.2vw]">
                {t('mtPresentation.operatorToolPrefix', '"Een tool die de operator ')}<span className="text-white underline">{t('mtPresentation.really', 'ECHT')}</span>{t('mtPresentation.operatorToolSuffix', ' helpt."')}
              </p>
              <div className="flex gap-4">
                <div className="bg-blue-600 text-white px-[1.5vw] py-[1.2vh] rounded-[1vw] font-bold text-[1vw] uppercase flex items-center justify-center gap-[0.8vw] flex-1">
                  <Zap size={20} /> {t('mtPresentation.minimalActions', 'Minimaal handelingen')}
                </div>
                <div className="bg-blue-600 text-white px-[1.5vw] py-[1.2vh] rounded-[1vw] font-bold text-[1vw] uppercase flex items-center justify-center gap-[0.8vw] flex-1">
                  <Eye size={20} /> {t('mtPresentation.maximumOverview', 'Maximaal overzicht')}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center bg-white/5 rounded-[3rem] border border-white/10 p-12 text-center">
              <div className="p-8 bg-blue-600/20 rounded-full mb-6">
                <Database size={80} className="text-blue-500" />
              </div>
              <p className="font-black text-3xl uppercase tracking-tighter text-white">
                {t('mtPresentation.singleSourceOfTruth', 'Single Source of Truth')}
              </p>
              <p className="text-slate-500 mt-4 italic text-xl font-bold">{t('mtPresentation.inforLnRemainsFoundation', 'Infor-LN blijft het fundament.')}</p>
            </div>
          </div>
        </div>

        {/* Slide 5 - MES */}
        <div className={`slide ${current === 5 ? 'active' : ''}`}>
          <h2 className="font-black uppercase text-[clamp(40px,3.5vw,85px)] leading-none mb-[3vh] border-l-[1vw] border-blue-500 pl-[2.5vw]">
            {t('mtPresentation.whatIsMesSystem', 'Wat is een MES Systeem?')}
          </h2>
          <p className="text-[1.2vw] text-blue-400 font-semibold mb-8 border-b border-white/10 pb-6 leading-relaxed">
            {t('mtPresentation.mesDefinitionPrefix', 'Een ')}<b>{t('mtPresentation.mesAcronym', 'MES')}</b>{t('mtPresentation.mesDefinitionSuffix', ' (Manufacturing Execution System) is slimme software die de volledige uitvoering op een fabrieksvloer in realtime aanstuurt, bewaakt en optimaliseert.')}
          </p>

          <div className="grid grid-cols-2 gap-12 items-center">
            <div className="bg-slate-800/50 border-2 border-white/8 rounded-[2.5rem] p-[2.5vw] backdrop-blur-[12px]">
              <h3 className="text-blue-400 mb-6 uppercase tracking-widest text-sm">{t('mtPresentation.digitalBridge', 'De Digitale Brug')}</h3>
              <div className="space-y-4">
                <div className={`mes-box text-sm ${mesActive === 0 ? 'mes-active' : ''}`}>
                  <strong>{t('mtPresentation.erpInforLn', 'ERP (Infor-LN)')}</strong>
                  <br />
                  <span className="text-[11px] uppercase text-slate-300 font-bold tracking-widest">
                    {t('mtPresentation.officeAdministration', 'Kantoor / Administratie')}
                  </span>
                </div>
                <div className="flex justify-center text-blue-500">
                  <ChevronsUpDown />
                </div>
                <div className={`mes-box text-sm ${mesActive === 1 ? 'mes-active' : ''}`}>
                  <strong>{t('mtPresentation.mesFutureFactory', 'MES (Future-Factory)')}</strong>
                  <br />
                  <span className="text-[11px] uppercase text-slate-300 font-bold tracking-widest">
                    {t('mtPresentation.intelligenceControl', 'Intelligentie / Regie')}
                  </span>
                </div>
                <div className="flex justify-center text-blue-500">
                  <ChevronsUpDown />
                </div>
                <div className={`mes-box text-sm ${mesActive === 2 ? 'mes-active' : ''}`}>
                  <strong>{t('mtPresentation.shopfloor', 'WERKVLOER')}</strong>
                  <br />
                  <span className="text-[11px] uppercase text-slate-300 font-bold tracking-widest">
                    {t('mtPresentation.peopleOutput', 'Mensen / Output')}
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-6">
              <div className="flex items-start gap-6">
                <div className="p-4 bg-blue-600/20 rounded-2xl text-blue-400">
                  <Zap size={32} />
                </div>
                <div>
                  <h4 className="font-bold">{t('mtPresentation.realtimeDashboard', 'Real-time Dashboard')}</h4>
                  <p className="text-sm text-slate-400">{t('mtPresentation.realtimeDashboardDesc', 'Direct inzicht in elke scan en elke order.')}</p>
                </div>
              </div>
              <div className="flex items-start gap-6">
                <div className="p-4 bg-emerald-600/20 rounded-2xl text-emerald-400">
                  <ShieldCheck size={32} />
                </div>
                <div>
                  <h4 className="font-bold">{t('mtPresentation.zeroOverproduction', '0% Overproductie')}</h4>
                  <p className="text-sm text-slate-400">{t('mtPresentation.zeroOverproductionDesc', 'Exact maken wat de klant vraagt.')}</p>
                </div>
              </div>
              <div className="flex items-start gap-6">
                <div className="p-4 bg-blue-400/20 rounded-2xl text-blue-300">
                  <TrendingUp size={32} />
                </div>
                <div>
                  <h4 className="font-bold">{t('mtPresentation.moreEffectiveWork', 'We gaan effectiever werken')}</h4>
                  <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mt-1">
                    {t('mtPresentation.stockProductionDeliveryDifference', 'Verschil weten tussen voorraad, productie en leveringen')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Slide 6 - Firebase Hosting */}
        <div className={`slide ${current === 6 ? 'active' : ''} bg-slate-900`}>
          <h2 className="font-black uppercase text-[clamp(40px,3.5vw,85px)] leading-none mb-[3vh] border-l-[1vw] border-blue-500 pl-[2.5vw]">
            {t('mtPresentation.vercelHostTitle', '1. Firebase Hosting: De Gastheer')}
          </h2>
          <div className="grid grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="bg-slate-800/50 border-l-[1vw] border-blue-500 rounded-[2.5rem] p-[2.5vw] backdrop-blur-[12px]">
                <h3 className="mb-4 text-[clamp(22px,2vw,50px)] font-bold">{t('mtPresentation.lightHardware', 'Lichte Hardware')}</h3>
                <p className="text-[1.3vw]">
                  {t('mtPresentation.vercelCloudHeavyLifting', 'Firebase en Google Cloud doen het denkwerk in de cloud. Onze tablets op de vloer hoeven niet hard te werken.')}
                </p>
              </div>
              <div className="bg-slate-800/50 border-l-[1vw] border-emerald-500 rounded-[2.5rem] p-[2.5vw] backdrop-blur-[12px]">
                <h3 className="mb-4 text-[clamp(22px,2vw,50px)] font-bold">{t('mtPresentation.timeMachine', 'De Tijdmachine')}</h3>
                <p className="text-[1.3vw]">
                  {t('mtPresentation.vercelRollback', 'Een update gedaan met een foutje? Met een druk op de knop draaien we het hele systeem terug via Firebase releasebeheer.')}
                </p>
              </div>
            </div>
            <div className="text-center">
              <CloudLightning size={200} className="text-blue-500 opacity-20 mx-auto" />
              <p className="mt-6 font-black uppercase text-blue-400 tracking-[0.5em]">{t('mtPresentation.globalSpeed', 'Global Speed')}</p>
            </div>
          </div>
        </div>

        {/* Slide 7 - Global */}
        <div className={`slide ${current === 7 ? 'active' : ''} bg-slate-950`}>
          <h2 className="font-black uppercase text-[clamp(40px,3.5vw,85px)] leading-none mb-[3vh] border-l-[1vw] border-blue-500 pl-[2.5vw]">
            {t('mtPresentation.globalStandard', 'Wereldwijde Standaard')}
          </h2>
          <div className="flex flex-col items-center justify-center h-full">
            <p className="text-[1.2vw] font-black uppercase tracking-[0.5em] text-blue-500 mb-12">
              {t('mtPresentation.techTrustedByLeaders', 'Technologie vertrouwd door marktleiders')}
            </p>
            <div className="flex gap-8">
              {['UBER', 'NINTENDO', 'TICKETMASTER', 'EBAY'].map((brand, index) => (
                <div
                  key={brand}
                  className="brand-tile-breathe bg-white/3 border border-white/10 px-[2vw] py-[1.2vh] rounded-[1rem] font-bold text-[1.1vw] tracking-[1px] text-white/40"
                  style={{ animationDelay: `${index * 0.35}s` }}
                >
                  {brand}
                </div>
              ))}
            </div>
            <p className="mt-16 text-slate-500 italic text-[1.4vw] max-w-3xl text-center">
              {t('mtPresentation.vercelFoundationQuote', '"Door te kiezen voor Firebase en Google Cloud, gebruikt de Future Factory hetzelfde fundament als de meest veeleisende platforms ter wereld."')}
            </p>
          </div>
        </div>

        {/* Slide 8 - Firebase */}
        <div className={`slide ${current === 8 ? 'active' : ''} bg-slate-950`}>
          <h2 className="font-black uppercase text-[clamp(40px,3.5vw,85px)] leading-none mb-[3vh] border-l-[1vw] border-blue-500 pl-[2.5vw]">
            {t('mtPresentation.firebaseSecureVaultTitle', '2. Firebase: De Veilige Kluis')}
          </h2>
          <div className="grid grid-cols-2 gap-12">
            <div className="bg-slate-800/50 border-2 border-white/8 rounded-[2.5rem] p-[2.5vw] backdrop-blur-[12px] space-y-8">
              <div className="flex items-center gap-6">
                <div className="p-5 bg-blue-600/20 rounded-3xl text-blue-400">
                  <MapPin size={40} />
                </div>
                <div>
                  <h3 className="text-blue-300 font-black text-[1.45vw] leading-tight">{t('mtPresentation.eemshavenNl', 'Eemshaven, NL')}</h3>
                  <p className="text-[0.85vw] uppercase font-bold tracking-widest text-slate-200">{t('mtPresentation.dataSafeInNetherlands', 'Data blijft veilig in Nederland')}</p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="p-5 bg-emerald-600/20 rounded-3xl text-emerald-400">
                  <ShieldCheck size={40} />
                </div>
                <div>
                  <h3 className="text-emerald-300 font-black text-[1.45vw] leading-tight">{t('mtPresentation.theGuardian', 'De Bewaker')}</h3>
                  <p className="text-[0.85vw] uppercase font-bold tracking-widest text-slate-200">{t('mtPresentation.builtInRulesProtect', 'Ingebouwde wetten beschermen')}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-col justify-center p-12 text-center border-4 border-dashed border-blue-400/20 rounded-[4rem] bg-blue-500/5">
              <p className="text-[1.35vw] leading-relaxed text-slate-200 font-semibold">
                {t('mtPresentation.sameGoogleTechPrefix', '"Dezelfde ')}<span className="text-blue-300 font-black">{t('mtPresentation.googleTechnology', 'Google-techniek')}</span>{t('mtPresentation.sameGoogleTechSuffix', ' waar de grootste banken ter wereld op draaien."')}
              </p>
            </div>
          </div>
        </div>

        {/* Slide 9 - Firebase Flow */}
        <div className={`slide ${current === 9 ? 'active' : ''} bg-slate-900`}>
          <h2 className="font-black uppercase text-[clamp(40px,3.5vw,85px)] leading-none mb-[3vh] border-l-[1vw] border-blue-500 pl-[2.5vw]">
            {t('mtPresentation.dataFlowTabletToFirebase', 'Datastroom: Tablet naar Firebase')}
          </h2>
          <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] gap-6 items-center mt-10">
            <div className={`flow-node p-8 text-center ${firebaseFlowActive === 0 ? 'flow-node-active' : ''}`}>
              <p className="text-slate-300 text-[0.8vw] uppercase tracking-[0.3em] font-bold mb-4">{t('mtPresentation.step1', 'Stap 1')}</p>
              <div className="text-blue-300 text-[3vw] mb-3">{t('mtPresentation.tablet', 'TABLET')}</div>
              <p className="text-slate-300 text-[1.1vw]">{t('mtPresentation.operatorScanOrInput', 'Operator scan of invoer')}</p>
            </div>

            <div className={`flow-link w-[8vw] ${firebaseFlowActive === 1 ? 'opacity-100' : 'opacity-40'}`} />

            <div className={`flow-node p-8 text-center ${firebaseFlowActive === 1 ? 'flow-node-active' : ''}`}>
              <p className="text-slate-300 text-[0.8vw] uppercase tracking-[0.3em] font-bold mb-4">{t('mtPresentation.step2', 'Stap 2')}</p>
              <div className="text-emerald-300 text-[2.2vw] mb-3">{t('mtPresentation.gatekeeper', 'GATEKEEPER')}</div>
              <p className="text-slate-300 text-[1.1vw]">{t('mtPresentation.rulesValidateData', 'Rules valideren de data')}</p>
            </div>

            <div className={`flow-link w-[8vw] ${firebaseFlowActive === 2 ? 'opacity-100' : 'opacity-40'}`} />

            <div className={`flow-node p-8 text-center ${firebaseFlowActive === 2 ? 'flow-node-active' : ''}`}>
              <p className="text-slate-300 text-[0.8vw] uppercase tracking-[0.3em] font-bold mb-4">{t('mtPresentation.step3', 'Stap 3')}</p>
              <div className="text-orange-300 text-[2.6vw] mb-3">{t('mtPresentation.firebase', 'FIREBASE')}</div>
              <p className="text-slate-300 text-[1.1vw]">{t('mtPresentation.storeSecureAndAvailable', 'Veilig opslaan en direct beschikbaar')}</p>
            </div>
          </div>
          <p className="mt-16 text-center text-[1.25vw] text-slate-300 font-semibold">
            {t('mtPresentation.dataFlowPrefix', 'Elke scan gaat van ')}<span className="text-blue-300">{t('mtPresentation.tabletLower', 'Tablet')}</span>{t('mtPresentation.dataFlowMiddle', ' naar ')}<span className="text-emerald-300">{t('mtPresentation.gatekeeperCloudFunctions', 'Gatekeeper (Cloud Functions)')}</span>{t('mtPresentation.dataFlowSuffix', ' en daarna naar ')}<span className="text-orange-300">{t('mtPresentation.firebaseLower', 'Firebase')}</span>.
          </p>
        </div>

        {/* Slide 10 - Codespaces */}
        <div className={`slide ${current === 10 ? 'active' : ''}`}>
          <h2 className="font-black uppercase text-[clamp(40px,3.5vw,85px)] leading-none mb-[3vh] border-l-[1vw] border-blue-500 pl-[2.5vw]">
            {t('mtPresentation.codespacesWorkshopTitle', '3. Codespaces: De Werkplaats')}
          </h2>
          <div className="grid grid-cols-2 gap-12 items-center">
            <div className="bg-slate-800/50 border-2 border-white/8 rounded-[2.5rem] p-[2.5vw] backdrop-blur-[12px] space-y-6">
              <h3 className="text-blue-400 italic text-[clamp(22px,2vw,50px)] font-bold">
                {t('mtPresentation.teamEffortNotSolo', 'Team-effort, geen Solo-project')}
              </h3>
              <p className="text-[1.3vw]">
                {t('mtPresentation.codeWrittenPrefix', 'De code is geschreven in ')}<b>{t('mtPresentation.reactJavascript', 'React (JavaScript)')}</b>{t('mtPresentation.codeWrittenSuffix', ', de wereldstandaard. De hele werkplaats staat in GitHub.')}
              </p>
              <div className="p-6 bg-blue-600/10 rounded-3xl border border-blue-500/20 flex items-center gap-6">
                <Users className="text-blue-500" size={40} />
                <p className="text-[1.1vw] font-bold">
                  {t('mtPresentation.itCanGrantAccess', 'IT kan morgen een andere programmeur toegang geven tot de exacte werkplek van Richard.')}
                </p>
              </div>
            </div>
            <div className="bg-slate-800/50 border-2 border-white/8 rounded-[2.5rem] p-12 text-center backdrop-blur-[12px]">
              <p className="text-slate-400 uppercase tracking-widest text-sm mb-6 font-bold">
                {t('mtPresentation.sameTechAs', 'Wij gebruiken dezelfde techniek als:')}
              </p>
              <div className="grid grid-cols-3 gap-6 opacity-60">
                <div className="brand-tile-breathe p-4 bg-black/40 rounded-2xl" style={{ animationDelay: '0s' }}>
                  <PlayCircle className="text-red-500 mx-auto mb-2" size={32} />
                  <p className="text-[10px] font-black">{t('mtPresentation.netflix', 'NETFLIX')}</p>
                </div>
                <div className="brand-tile-breathe p-4 bg-black/40 rounded-2xl" style={{ animationDelay: '0.3s' }}>
                  <div className="text-blue-600 mx-auto mb-2">{t('mtPresentation.facebookGlyph', 'f')}</div>
                  <p className="text-[10px] font-black">{t('mtPresentation.facebook', 'FACEBOOK')}</p>
                </div>
                <div className="brand-tile-breathe p-4 bg-black/40 rounded-2xl" style={{ animationDelay: '0.6s' }}>
                  <Home className="text-pink-500 mx-auto mb-2" size={32} />
                  <p className="text-[10px] font-black">{t('mtPresentation.airbnb', 'AIRBNB')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Slide 11 - Costs */}
        <div className={`slide ${current === 11 ? 'active' : ''} bg-slate-900`}>
          <h2 className="font-black uppercase text-[clamp(40px,3.5vw,85px)] leading-none mb-[3vh] border-l-[1vw] border-blue-500 pl-[2.5vw]">
            {t('mtPresentation.businessCaseCostsTitle', 'Business Case: De Kosten')}
          </h2>
          <div className="max-w-5xl mx-auto space-y-6 mt-8">
            <div className="flex justify-between items-center bg-slate-800/50 border-2 border-white/10 rounded-[2rem] p-8 backdrop-blur-[12px] hover:bg-slate-800/80 transition-all">
              <div className="flex flex-col text-left">
                <span className="text-2xl font-bold text-white">{t('mtPresentation.googleCloudInfra', 'Google Cloud Infra')}</span>
                <span className="text-slate-400 text-sm mt-1">{t('mtPresentation.googleCloudInfraDesc', 'Database, opslag en serverless functies (pay-as-you-go)')}</span>
              </div>
              <span className="px-6 py-3 bg-emerald-500/20 text-emerald-400 rounded-full font-black text-lg border border-emerald-500/30">
                EUR 0 - 40 / mnd
              </span>
            </div>
            <div className="flex justify-between items-center bg-slate-800/50 border-2 border-white/10 rounded-[2rem] p-8 backdrop-blur-[12px] hover:bg-slate-800/80 transition-all">
              <div className="flex flex-col text-left">
                <span className="text-2xl font-bold text-white">{t('mtPresentation.vercelPro', 'Firebase Hosting')}</span>
                <span className="text-slate-400 text-sm mt-1">{t('mtPresentation.vercelProDesc', 'Firebase Hosting + Google Cloud diensten')}</span>
              </div>
              <span className="px-6 py-3 bg-emerald-500/20 text-emerald-400 rounded-full font-black text-lg border border-emerald-500/30">
                EUR 0 - 40 / mnd
              </span>
            </div>
            <div className="flex justify-between items-center bg-slate-800/50 border-2 border-white/10 rounded-[2rem] p-8 backdrop-blur-[12px] hover:bg-slate-800/80 transition-all">
              <div className="flex flex-col text-left">
                <span className="text-2xl font-bold text-white">{t('mtPresentation.githubTeam', 'GitHub Team')}</span>
                <span className="text-slate-400 text-sm mt-1">{t('mtPresentation.githubTeamDesc', 'Broncodebeheer en samenwerking (afhankelijk van teamgrootte)')}</span>
              </div>
              <span className="px-6 py-3 bg-emerald-500/20 text-emerald-400 rounded-full font-black text-lg border border-emerald-500/30">
                EUR 50 - 75 / mnd *
              </span>
            </div>
            <div className="pt-10 text-center">
              <p className="text-5xl md:text-6xl font-black text-emerald-500 tracking-tighter">
                {t('mtPresentation.totalPerMonth', 'TOTAAL: ± EUR 135,- PER MAAND')}
              </p>
              <p className="text-slate-400 mt-4 text-sm italic font-medium">
                {t('mtPresentation.scalablePerMachine', 'Schaalbaar per machine. Geen dure licenties per werknemer.')}
              </p>
              <p className="text-slate-500 mt-2 text-sm italic font-medium">
                {t('mtPresentation.costsDecreaseOverTime', '* (kosten nemen af naarmate het van ontwikkelen naar onderhouden gaat)')}
              </p>
            </div>
          </div>
        </div>

        {/* Slide 12 - Extra Opties */}
        <div className={`slide ${current === 12 ? 'active' : ''} bg-slate-900`}>
          <h2 className="font-black uppercase text-[clamp(40px,3.5vw,85px)] leading-none mb-[3vh] border-l-[1vw] border-blue-500 pl-[2.5vw]">
            {t('mtPresentation.optionalExtras', "Optionele Extra's")}
          </h2>
          <div className="grid grid-cols-2 gap-12 items-center mt-8">
            <div className="bg-slate-800/50 border-2 border-white/10 rounded-[2.5rem] p-[2.5vw] backdrop-blur-[12px] space-y-6">
              <h3 className="text-blue-400 italic text-[clamp(22px,2vw,35px)] font-bold flex items-center gap-4">
                <MonitorSmartphone size={32} className="shrink-0" /> {t('mtPresentation.googleWorkspaceMdm', 'Google Workspace (MDM)')}
              </h3>
              <p className="text-[1.3vw] leading-relaxed">
                {t('mtPresentation.manageTabletsPrefix', 'Tablets op de werkvloer beheren en ')}<b>{t('mtPresentation.lockKioskMode', 'vergrendelen (Kiosk-modus)')}</b>.
              </p>
              <ul className="text-slate-400 text-[1.1vw] space-y-3 font-semibold list-disc pl-5">
                <li>{t('mtPresentation.onlyFutureFactoryAppUsable', 'Alleen de Future Factory app is bruikbaar.')}</li>
                <li>{t('mtPresentation.noDistractionOrMisuse', 'Geen afleiding of misbruik via andere apps.')}</li>
                <li>{t('mtPresentation.centralSecureRemoteManagement', 'Centraal en veilig beheer van alle apparaten op afstand.')}</li>
              </ul>
            </div>
            
            <div className="bg-slate-800/50 border-2 border-white/10 rounded-[2.5rem] p-[2.5vw] backdrop-blur-[12px] space-y-6">
              <h3 className="text-emerald-400 italic text-[clamp(22px,2vw,35px)] font-bold flex items-center gap-4">
                <Globe size={32} className="shrink-0" /> {t('mtPresentation.customDomain', 'Eigen Domeinnaam')}
              </h3>
              <p className="text-[1.3vw] leading-relaxed">
                {t('mtPresentation.linkOfficialDomainToVercel', 'Koppel een officieel domein (bijv. fpi-future-factory.com) aan Firebase Hosting.')}
              </p>
              <ul className="text-slate-400 text-[1.1vw] space-y-3 font-semibold list-disc pl-5">
                <li>{t('mtPresentation.professionalMemorableUrl', 'Professionele en makkelijk te onthouden URL.')}</li>
                <li>{t('mtPresentation.seamlessGoogleWorkspaceSso', 'Naadloze koppeling met Google Workspace voor Single Sign-On (SSO).')}</li>
                <li>{t('mtPresentation.increasesSecuritySslTls', 'Verhoogt de veiligheid (SSL/TLS certificaten op eigen naam).')}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Slide 13 - Transfer */}
        <div className={`slide ${current === 13 ? 'active' : ''} bg-slate-950`}>
          <h2 className="font-black uppercase text-[clamp(40px,3.5vw,85px)] leading-none mb-[3vh] border-l-[1vw] border-blue-500 pl-[2.5vw]">
            {t('mtPresentation.fromRichardToFpiAsset', 'Van Richard naar FPi Asset')}
          </h2>
          <div className="grid grid-cols-2 gap-10">
            <div className="space-y-6">
              <div className="p-8 bg-white/5 rounded-[2.5rem] border border-blue-500/20 flex items-center gap-8">
                <Share2 className="text-blue-500" size={40} />
                <div>
                  <h4 className="font-bold text-blue-400 text-xl uppercase">{t('mtPresentation.organizationAccounts', 'Organization Accounts')}</h4>
                  <p className="text-base text-slate-400 mt-1">{t('mtPresentation.transferToOfficialOrgs', 'Overdracht naar officieel FPi GitHub & Google Org.')}</p>
                </div>
              </div>
              <div className="p-8 bg-white/5 rounded-[2.5rem] border border-blue-500/20 flex items-center gap-8">
                <CreditCard className="text-blue-500" size={40} />
                <div>
                  <h4 className="font-bold text-blue-400 text-xl uppercase">{t('mtPresentation.billing', 'Facturatie')}</h4>
                  <p className="text-base text-slate-400 mt-1">{t('mtPresentation.linkToCompanyCreditcardFinance', 'Koppelen aan de bedrijfs-creditcard / Finance.')}</p>
                </div>
              </div>
              <div className="p-8 bg-white/5 rounded-[2.5rem] border border-blue-500/20 flex items-center gap-8">
                <Key className="text-blue-500" size={40} />
                <div>
                  <h4 className="font-bold text-blue-400 text-xl uppercase">{t('mtPresentation.microsoftSso', 'Microsoft SSO')}</h4>
                  <p className="text-base text-slate-400 mt-1">{t('mtPresentation.mainUsersCanLoginFuturepipe', 'Hoofdgebruikers kunnen inloggen met hun eigen @futurepipe.com mail en account.')}</p>
                </div>
              </div>
            </div>
            <div className="bg-slate-800/50 border-2 border-blue-500/30 rounded-[2.5rem] p-[2.5vw] flex flex-col justify-center backdrop-blur-[12px]">
              <h3 className="text-2xl font-bold mb-6 italic">{t('mtPresentation.continuity', 'Continuiteit')}</h3>
              <p className="text-[1.2vw] text-slate-400 leading-relaxed">
                {t('mtPresentation.continuityDescription', 'Door de overdracht krijgt de IT-afdeling volledige controle. Het systeem is hiermee onafhankelijk van Richard\'s prive accounts.')}
              </p>
            </div>
          </div>
        </div>

        {/* Slide 15 - Questions */}
        <div className={`slide ${current === 14 ? 'active' : ''} text-center`}>
          <h1 className="text-9xl font-black italic tracking-tighter mb-8 text-blue-600 leading-none">
            {t('mtPresentation.questions', 'VRAGEN?')}
          </h1>
          <p className="text-2xl text-slate-500 uppercase tracking-[0.5em] font-light">
            {t('mtPresentation.theFloorIsYours', 'The floor is yours.')}
          </p>
          <div className="mt-20 inline-block bg-slate-800/50 border-2 border-blue-500/30 rounded-[2.5rem] px-16 py-10 backdrop-blur-[12px]">
            <p className="text-xl font-bold tracking-[0.4em] uppercase italic text-blue-500">
              {t('mtPresentation.richardVanHeerde', 'Richard van Heerde')}
            </p>
            <p className="text-slate-600 mt-2 font-mono text-[10px] uppercase">
              {t('mtPresentation.futureFactoryMesMaster', 'Future Factory MES v8.3 Master')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

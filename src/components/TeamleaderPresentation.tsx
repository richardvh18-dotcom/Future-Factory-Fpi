import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

type Slide = {
  title: string;
  subtitle?: string;
  bullets?: string[];
  image?: string;
};

const slides: Slide[] = [
  {
    title: "FUTURE-FACTORY",
    subtitle: "De digitale transitie vanuit het hart van de werkvloer",
    image: "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&q=80&w=1600",
  },
  {
    title: "Het Begin",
    subtitle: "December 2025: de vraag van de werkvloer",
    bullets: [
      "Centralisatie van data en tekeningen",
      "Digitalisering van de papierstroom",
      "Real-time koppeling met planning",
    ],
    image: "https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&q=80&w=1400",
  },
  {
    title: "Wat is Future-Factory?",
    subtitle: "De digitale motor op de vloer",
    bullets: [
      "Realtime aansturing van productie",
      "Snelle en betrouwbare registratie",
      "Brug tussen werkvloer en ERP",
    ],
  },
  {
    title: "Bottom-Up Opbouw",
    subtitle: "Gebouwd vanuit het operator standpunt",
    bullets: [
      "Geen bureausysteem dat processen forceert",
      "Single source of truth op basis van LN",
      "Praktische stappen voor dagelijks werk",
    ],
  },
  {
    title: "Operator Flow: Start",
    bullets: [
      "Scan en direct op het juiste station",
      "Order selecteren vanuit visuele planning",
      "Automatisch label printen bij start",
    ],
    image: "https://images.unsplash.com/photo-1595079676339-1534801ad6cf?auto=format&fit=crop&q=80&w=1400",
  },
  {
    title: "Operator Flow: Uitvoering",
    bullets: [
      "Wikkelen en gereedmelden met snelle scan",
      "Metingen direct op tablet vastleggen",
      "Geen papier of dubbele invoer",
    ],
    image: "https://images.unsplash.com/photo-1565514158740-064f34bd6cfd?auto=format&fit=crop&q=80&w=1400",
  },
  {
    title: "Digitale Product Catalogus",
    bullets: [
      "Tekeningen op een centrale plek",
      "Direct gekoppeld aan planning",
      "Sneller vinden, minder zoektijd",
    ],
    image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=1400",
  },
  {
    title: "Kwaliteitsborging",
    subtitle: "Snelle afkeurregistratie en traceerbaarheid",
    bullets: [
      "NCR direct op station registreren",
      "Automatische triggers voor vervolgactie",
      "Volledige orderhistorie beschikbaar",
    ],
  },
  {
    title: "Teamleader Dashboard",
    bullets: [
      "KPI inzicht per afdeling",
      "Lotnummer scannen voor volledige historie",
      "Realtime locatie en status per order",
    ],
    image: "https://images.unsplash.com/photo-1551281044-8d8d4f42bb4f?auto=format&fit=crop&q=80&w=1400",
  },
  {
    title: "Regie en Efficiency",
    bullets: [
      "Prioriteiten direct aansturen",
      "Orders flexibel verplaatsen",
      "Minder administratietijd",
    ],
  },
  {
    title: "Wat Zit Er Al In?",
    bullets: [
      "Slimme planning en live import",
      "Kwaliteit en traceerbaarheid",
      "Beveiliging en rollen",
      "Tablet-first UX",
    ],
  },
  {
    title: "Roadmap",
    subtitle: "Voorspellend en slimmer werken",
    bullets: [
      "AI-assistent die anticipeert",
      "Productherkenning via camera",
      "Machine data synchronisatie",
    ],
  },
  {
    title: "Techniek",
    bullets: [
      "GitHub en Codespaces",
      "Vercel deployment",
      "Firebase realtime platform",
      "React frontend",
    ],
  },
  {
    title: "Implementatie",
    bullets: [
      "Stapsgewijze uitrol per afdeling",
      "Meetbare KPI per fase",
      "Kennisoverdracht naar teamleaders",
    ],
  },
  {
    title: "Vragen?",
    subtitle: "Samen maken we de werkvloer slimmer",
  },
];

const TeamleaderPresentation = () => {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);
  const startXRef = useRef<number | null>(null);

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => Math.min(prev + 1, slides.length - 1));
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentSlide((prev) => Math.max(prev - 1, 0));
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        nextSlide();
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        prevSlide();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [nextSlide, prevSlide]);

  const styles = useMemo(
    () => `
      @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;700;800&family=Lato:wght@400;700&display=swap');

      .tl-react {
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        position: relative;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        font-family: 'Lato', sans-serif;
      }

      .tl-slide {
        position: absolute;
        inset: 0;
        display: grid;
        grid-template-columns: 1.05fr 0.95fr;
        gap: 2rem;
        padding: 3rem;
        opacity: 0;
        pointer-events: none;
        transform: scale(1.01);
        transition: opacity 320ms ease, transform 320ms ease;
        color: #e2e8f0;
      }

      .tl-slide.active {
        opacity: 1;
        pointer-events: auto;
        transform: scale(1);
      }

      .tl-content h1 {
        font-family: 'Poppins', sans-serif;
        font-size: clamp(2.2rem, 4.8vw, 5rem);
        line-height: 1.05;
        color: #f8fafc;
        margin-bottom: 0.8rem;
      }

      .tl-content p {
        font-size: clamp(1rem, 1.7vw, 1.55rem);
        color: #cbd5e1;
        margin-bottom: 1.1rem;
      }

      .tl-content ul {
        list-style: none;
        display: grid;
        gap: 0.8rem;
        margin-top: 1.2rem;
      }

      .tl-content li {
        background: rgba(59, 130, 246, 0.15);
        border: 1px solid rgba(59, 130, 246, 0.35);
        border-radius: 1rem;
        padding: 0.8rem 1rem;
        color: #dbeafe;
        font-size: clamp(0.95rem, 1.35vw, 1.15rem);
      }

      .tl-visual {
        border-radius: 1.5rem;
        border: 1px solid rgba(255, 255, 255, 0.18);
        background: rgba(15, 23, 42, 0.45);
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .tl-visual img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .tl-placeholder {
        text-align: center;
        color: #93c5fd;
        font-weight: 700;
        padding: 2rem;
        font-family: 'Poppins', sans-serif;
        letter-spacing: 0.02em;
      }

      .tl-nav {
        position: fixed;
        right: 1.6rem;
        bottom: 1.4rem;
        display: flex;
        gap: 0.7rem;
        z-index: 50;
      }

      .tl-btn {
        border: none;
        width: 3.2rem;
        height: 3.2rem;
        border-radius: 999px;
        background: rgba(30, 41, 59, 0.92);
        color: white;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }

      .tl-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }

      .tl-counter {
        position: fixed;
        left: 1.3rem;
        bottom: 1.45rem;
        color: #bfdbfe;
        font-weight: 700;
        letter-spacing: 0.04em;
        z-index: 50;
      }

      .tl-back {
        position: fixed;
        top: 1rem;
        right: 1rem;
        z-index: 50;
        border: 1px solid rgba(255, 255, 255, 0.35);
        background: rgba(15, 23, 42, 0.86);
        color: white;
        border-radius: 999px;
        padding: 0.55rem 0.95rem;
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        cursor: pointer;
      }

      @media (max-width: 1000px) {
        .tl-slide {
          grid-template-columns: 1fr;
          padding: 1.3rem;
          gap: 1rem;
        }

        .tl-visual {
          min-height: 34vh;
        }
      }
    `,
    []
  );

  const slide = slides[currentSlide];

  return (
    <div
      className="tl-react"
      onTouchStart={(event) => {
        startXRef.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const startX = startXRef.current;
        const endX = event.changedTouches[0]?.clientX ?? null;
        if (startX == null || endX == null) return;
        const delta = endX - startX;
        if (delta < -40) nextSlide();
        if (delta > 40) prevSlide();
      }}
    >
      <style>{styles}</style>

      <button className="tl-back" onClick={() => navigate("/portal")}> 
        <ArrowLeft size={16} /> Terug naar app
      </button>

      {slides.map((item, index) => (
        <section key={item.title} className={`tl-slide ${index === currentSlide ? "active" : ""}`}>
          <div className="tl-content">
            <h1>{item.title}</h1>
            {item.subtitle ? <p>{item.subtitle}</p> : null}
            {item.bullets ? (
              <ul>
                {item.bullets.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="tl-visual">
            {item.image ? (
              <img src={item.image} alt={item.title} />
            ) : (
              <div className="tl-placeholder">Future-Factory Teamleader Presentatie</div>
            )}
          </div>
        </section>
      ))}

      <div className="tl-counter">
        Slide {currentSlide + 1} / {slides.length}
      </div>

      <div className="tl-nav">
        <button className="tl-btn" onClick={prevSlide} disabled={currentSlide === 0} aria-label="Vorige slide">
          <ChevronLeft size={20} />
        </button>
        <button
          className="tl-btn"
          onClick={nextSlide}
          disabled={currentSlide === slides.length - 1}
          aria-label="Volgende slide"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
};

export default TeamleaderPresentation;

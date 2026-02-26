
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { nl } from "./lang/nl";
import { en } from "./lang/en";
import { ar } from "./lang/ar";

const resources = {
  nl,
  en,
  ar
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: ['nl', 'en', 'ar'],
    fallbackLng: "en", // Set English as fallback
    // lng: "en", // Verwijderd: Dit forceerde Engels en negeerde de detector/localStorage
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false, // React doet dit al zelf
    },
  });

i18n.on('languageChanged', (lng) => {
  document.documentElement.dir = i18n.dir(lng);
  document.documentElement.lang = lng;
});

document.documentElement.dir = i18n.dir(i18n.language);
document.documentElement.lang = i18n.language;

export default i18n;

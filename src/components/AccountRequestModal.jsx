import React, { useState } from "react";
import { X, UserPlus, Mail, User, Globe, Building2, Send, CheckCircle } from "lucide-react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../config/firebase";
import { PATHS } from "../config/dbPaths";

/**
 * AccountRequestModal - Formulier voor account aanvraag
 * Gebruikers kunnen hun gegevens invullen en een account aanvragen
 */
const AccountRequestModal = ({ isOpen, onClose }) => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    country: "",
    department: "",
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const departments = [
    "Productie - Fittings",
    "Productie - Pipes", 
    "Productie - Spools",
    "Kwaliteitscontrole",
    "Planning",
    "Logistiek",
    "Magazijn",
    "Onderhoud",
    "Management",
    "Administratie",
    "Anders"
  ];

  const countries = [
    "Nederland",
    "België",
    "Duitsland",
    "Frankrijk",
    "Verenigd Koninkrijk",
    "Anders"
  ];

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Sla aanvraag op in Firestore
      await addDoc(collection(db, ...PATHS.ACCOUNT_REQUESTS), {
        ...formData,
        status: "pending",
        requestedAt: serverTimestamp(),
        processedAt: null,
        processedBy: null,
      });

      setSubmitted(true);
      
      // Reset form na 3 seconden en sluit modal
      setTimeout(() => {
        setFormData({ name: "", email: "", country: "", department: "" });
        setSubmitted(false);
        onClose();
      }, 3000);
    } catch (err) {
      console.error("Fout bij indienen aanvraag:", err);
      setError("Er is een fout opgetreden. Probeer het opnieuw.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-gradient-to-br from-slate-900 via-cyan-950 to-blue-950 rounded-[40px] shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300 border-2 border-white/20">
        {submitted ? (
          // Success scherm
          <div className="p-12 text-center">
            <div className="mb-6 flex justify-center">
              <div className="p-6 bg-green-500/20 rounded-full">
                <CheckCircle size={64} className="text-green-400" />
              </div>
            </div>
            <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter mb-4">
              Aanvraag Verzonden!
            </h2>
            <p className="text-cyan-200/80 text-sm font-medium leading-relaxed">
              Je accountaanvraag is succesvol ingediend. Een administrator zal je aanvraag beoordelen
              en je ontvangt een e-mail zodra je account is goedgekeurd.
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-8 text-white border-b border-white/10">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-3 bg-cyan-500/20 rounded-2xl">
                      <UserPlus size={24} className="text-cyan-400" />
                    </div>
                    <h2 className="text-3xl font-black uppercase italic tracking-tighter">
                      Account Aanvragen
                    </h2>
                  </div>
                  <p className="text-cyan-200/60 text-sm font-bold">
                    Vul je gegevens in om toegang aan te vragen
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-8 space-y-5">
              {error && (
                <div className="bg-rose-500/20 border-2 border-rose-400/50 p-4 rounded-2xl text-rose-200 text-sm font-bold">
                  {error}
                </div>
              )}

              {/* Naam */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-cyan-200/80 uppercase tracking-widest ml-1 flex items-center gap-2">
                  <User size={12} /> Volledige Naam
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="bijv. Jan Jansen"
                  className="w-full px-4 py-4 bg-white border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-cyan-500 transition-all text-sm text-slate-900 placeholder:text-slate-400"
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-cyan-200/80 uppercase tracking-widest ml-1 flex items-center gap-2">
                  <Mail size={12} /> E-mailadres
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="naam@futurepipe.com"
                  className="w-full px-4 py-4 bg-white border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-cyan-500 transition-all text-sm text-slate-900 placeholder:text-slate-400"
                />
              </div>

              {/* Land */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-cyan-200/80 uppercase tracking-widest ml-1 flex items-center gap-2">
                  <Globe size={12} /> Land
                </label>
                <select
                  name="country"
                  required
                  value={formData.country}
                  onChange={handleChange}
                  className="w-full px-4 py-4 bg-white border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-cyan-500 transition-all text-sm text-slate-900"
                >
                  <option value="">-- Selecteer land --</option>
                  {countries.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
              </div>

              {/* Afdeling */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-cyan-200/80 uppercase tracking-widest ml-1 flex items-center gap-2">
                  <Building2 size={12} /> Afdeling
                </label>
                <select
                  name="department"
                  required
                  value={formData.department}
                  onChange={handleChange}
                  className="w-full px-4 py-4 bg-white border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-cyan-500 transition-all text-sm text-slate-900"
                >
                  <option value="">-- Selecteer afdeling --</option>
                  {departments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-6 py-4 bg-white/10 border-2 border-white/20 text-cyan-200 rounded-2xl font-bold uppercase text-xs tracking-widest hover:bg-white/20 transition-all"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-6 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:from-cyan-400 hover:to-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-xl"
                >
                  {loading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      <Send size={16} />
                      Verzenden
                    </>
                  )}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default AccountRequestModal;

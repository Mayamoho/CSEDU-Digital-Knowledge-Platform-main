"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "bn";

// Minimal English -> Bangla dictionary. t() returns the Bangla string when the
// language is "bn" and a translation exists, otherwise the original English key
// (so any untranslated label degrades gracefully).
const BN: Record<string, string> = {
  "Library Catalog": "লাইব্রেরি ক্যাটালগ",
  "Digital Archive": "ডিজিটাল আর্কাইভ",
  Research: "গবেষণা",
  Projects: "প্রকল্প",
  "Upload Research": "গবেষণা আপলোড",
  "Upload Projects": "প্রকল্প আপলোড",
  "Upload Archive": "আর্কাইভ আপলোড",
  Dashboard: "ড্যাশবোর্ড",
  "Search…": "অনুসন্ধান…",
  Profile: "প্রোফাইল",
  Settings: "সেটিংস",
  "Log out": "লগ আউট",
};

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const Ctx = createContext<I18nCtx>({ lang: "en", setLang: () => {}, t: (k) => k });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const saved = (typeof window !== "undefined" && localStorage.getItem("csedu_lang")) as Lang | null;
    if (saved === "bn" || saved === "en") setLangState(saved);
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") {
      localStorage.setItem("csedu_lang", l);
      document.documentElement.lang = l;
    }
  };

  const t = (key: string) => (lang === "bn" ? BN[key] ?? key : key);

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);

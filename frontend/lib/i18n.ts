// Lightweight i18n for the CSEDU platform (SDD §7.2 — bilingual EN/BN).
// Strings are intentionally translated inline (no external dependency) so the
// shell works in SSR and client renders alike.

export type Locale = "en" | "bn";

const STORAGE_KEY = "csedu_locale";

const dictionaries: Record<Locale, Record<string, string>> = {
  en: {
    "auth.welcome": "Welcome back",
    "auth.enterCredentials": "Enter your credentials to access your account",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.signIn": "Sign in",
    "auth.forgotPassword": "Forgot password?",
    "auth.continueWith": "Continue with University SSO",
    "auth.noAccount": "Don't have an account?",
    "auth.signUp": "Sign up",
    "auth.signingIn": "Signing in...",
    "nav.dashboard": "Dashboard",
    "nav.library": "Library",
    "nav.research": "Research",
    "nav.projects": "Projects",
    "nav.archive": "Archive",
    "nav.logout": "Logout",
    "ai.placeholder": "Ask about CSEDU resources...",
    "ai.send": "Send",
    "common.loading": "Loading...",
    "common.cancel": "Cancel",
  },
  bn: {
    "auth.welcome": "পুনরায় স্বাগতম",
    "auth.enterCredentials": "আপনার অ্যাকাউন্ট অ্য়াক্স করতে আপনার তথ্য দিন",
    "auth.email": "ইমেইল",
    "auth.password": "পাসওয়ার্ড",
    "auth.signIn": "সাইন ইন",
    "auth.forgotPassword": "পাসওয়ার্ড ভুলে গেছেন?",
    "auth.continueWith": "বিশ্ববিদ্যালয় এসএসও দিয়ে চালিয়ে যান",
    "auth.noAccount": "অ্যাকাউন্ট নেই?",
    "auth.signUp": "নিবন্ধন করুন",
    "auth.signingIn": "সাইন ইন করা হচ্ছে...",
    "nav.dashboard": "ড্যাশবোর্ড",
    "nav.library": "লাইব্রেরি",
    "nav.research": "গবেষণা",
    "nav.projects": "প্রজেক্ট",
    "nav.archive": "আর্কাইভ",
    "nav.logout": "লগআউট",
    "ai.placeholder": "সিএসইডিউ রিসোর্স সম্পর্কে জিজ্ঞাসা করুন...",
    "ai.send": "পাঠান",
    "common.loading": "লোড হচ্ছে...",
    "common.cancel": "বাতিল",
  },
};

export function getStoredLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "bn" ? "bn" : "en";
}

export function setStoredLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, locale);
  document.documentElement.lang = locale === "bn" ? "bn" : "en";
}

export function t(locale: Locale, key: string): string {
  return dictionaries[locale]?.[key] ?? dictionaries.en[key] ?? key;
}

export function availableLocales(): Locale[] {
  return ["en", "bn"];
}

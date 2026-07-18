"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type Lang = "en" | "bn";

// English -> Bangla dictionary. Keys are the exact trimmed English strings that
// appear in the UI. t() uses it for explicitly wrapped labels; the DOM walker
// below uses the same table to translate everything else on the page, so a new
// entry here instantly localises that text everywhere it appears.
const BN: Record<string, string> = {
  // Navigation / core
  "Library Catalog": "লাইব্রেরি ক্যাটালগ",
  "Digital Archive": "ডিজিটাল আর্কাইভ",
  Research: "গবেষণা",
  Projects: "প্রকল্প",
  Catalog: "ক্যাটালগ",
  Archive: "আর্কাইভ",
  "Upload Research": "গবেষণা আপলোড",
  "Upload Projects": "প্রকল্প আপলোড",
  "Upload Archive": "আর্কাইভ আপলোড",
  "Upload Archive Materials": "আর্কাইভ উপকরণ আপলোড",
  Dashboard: "ড্যাশবোর্ড",
  "Search…": "অনুসন্ধান…",
  "Search...": "অনুসন্ধান...",
  Search: "অনুসন্ধান",
  Profile: "প্রোফাইল",
  Settings: "সেটিংস",
  "Log out": "লগ আউট",
  "Log in": "লগ ইন",
  Login: "লগ ইন",
  "Sign in": "সাইন ইন",
  "Sign up": "সাইন আপ",
  "Sign out": "সাইন আউট",
  Register: "নিবন্ধন",
  Home: "হোম",
  Notifications: "বিজ্ঞপ্তি",
  "My Uploads": "আমার আপলোড",
  "Role Request": "ভূমিকার অনুরোধ",
  Admin: "অ্যাডমিন",
  "AI Assistant": "এআই সহকারী",
  Assistant: "সহকারী",

  // Common actions / buttons
  Save: "সংরক্ষণ",
  "Save Changes": "পরিবর্তন সংরক্ষণ",
  Cancel: "বাতিল",
  Delete: "মুছুন",
  Edit: "সম্পাদনা",
  "Edit Profile": "প্রোফাইল সম্পাদনা",
  "Change Password": "পাসওয়ার্ড পরিবর্তন",
  Submit: "জমা দিন",
  "Submit request": "অনুরোধ জমা দিন",
  "Submit for Review": "পর্যালোচনার জন্য জমা দিন",
  "Resubmit for Review": "পুনরায় পর্যালোচনার জন্য জমা দিন",
  Publish: "প্রকাশ করুন",
  Download: "ডাউনলোড",
  "Download Paper": "পেপার ডাউনলোড",
  Upload: "আপলোড",
  "Upload File": "ফাইল আপলোড",
  "Open Link": "লিংক খুলুন",
  Back: "পিছনে",
  "Go Back": "ফিরে যান",
  Next: "পরবর্তী",
  Previous: "পূর্ববর্তী",
  Close: "বন্ধ",
  Confirm: "নিশ্চিত করুন",
  View: "দেখুন",
  "View all": "সব দেখুন",
  "Read more": "আরও পড়ুন",
  Apply: "প্রয়োগ করুন",
  Clear: "পরিষ্কার",
  "Clear filters": "ফিল্টার পরিষ্কার",
  Filter: "ফিল্টার",
  Filters: "ফিল্টার",
  Accept: "গ্রহণ",
  Decline: "প্রত্যাখ্যান",
  Approve: "অনুমোদন",
  Reject: "প্রত্যাখ্যান",
  Review: "পর্যালোচনা",
  "Review Paper": "পেপার পর্যালোচনা",
  Loading: "লোড হচ্ছে",
  "Loading...": "লোড হচ্ছে...",
  Saving: "সংরক্ষণ হচ্ছে",
  "Saving...": "সংরক্ষণ হচ্ছে...",
  Uploading: "আপলোড হচ্ছে",
  "Uploading...": "আপলোড হচ্ছে...",

  // Form labels
  Title: "শিরোনাম",
  "Full Name": "পূর্ণ নাম",
  Name: "নাম",
  Email: "ইমেইল",
  Password: "পাসওয়ার্ড",
  "Current Password": "বর্তমান পাসওয়ার্ড",
  "New Password": "নতুন পাসওয়ার্ড",
  "Confirm New Password": "নতুন পাসওয়ার্ড নিশ্চিত করুন",
  Abstract: "সারসংক্ষেপ",
  "Abstract / Description": "সারসংক্ষেপ / বিবরণ",
  Description: "বিবরণ",
  Keywords: "কীওয়ার্ড",
  "Keywords (comma-separated)": "কীওয়ার্ড (কমা দিয়ে পৃথক)",
  Authors: "লেখক",
  "Co-Authors": "সহ-লেখক",
  Journal: "জার্নাল",
  Conference: "সম্মেলন",
  Language: "ভাষা",
  "Access Level": "প্রবেশাধিকার স্তর",
  "Access Tier": "প্রবেশাধিকার স্তর",
  "Publication Status": "প্রকাশনার অবস্থা",
  "Desired role": "কাঙ্ক্ষিত ভূমিকা",
  Justification: "যৌক্তিকতা",
  "Identity card": "পরিচয়পত্র",
  Optional: "ঐচ্ছিক",
  Required: "আবশ্যক",

  // Statuses
  Draft: "খসড়া",
  Published: "প্রকাশিত",
  "Under Review": "পর্যালোচনাধীন",
  Archived: "আর্কাইভকৃত",
  Pending: "অপেক্ষমাণ",
  Approved: "অনুমোদিত",
  Rejected: "প্রত্যাখ্যাত",
  Active: "সক্রিয়",
  Returned: "ফেরত",
  Overdue: "মেয়াদোত্তীর্ণ",
  Public: "সর্বজনীন",
  Restricted: "সীমাবদ্ধ",

  // Roles
  Student: "শিক্ষার্থী",
  Researcher: "গবেষক",
  Librarian: "গ্রন্থাগারিক",
  Administrator: "প্রশাসক",

  // Profile / dashboard
  "Total Uploads": "মোট আপলোড",
  "Total Loans": "মোট ঋণ",
  "Active Loans": "সক্রিয় ঋণ",
  "Books Added": "যোগ করা বই",
  "My Contributions": "আমার অবদান",
  "Borrowing History": "ধারের ইতিহাস",
  "No contributions yet": "এখনও কোনো অবদান নেই",
  "No borrowing history": "কোনো ধারের ইতিহাস নেই",
  "Your requests": "আপনার অনুরোধ",
  "No requests yet.": "এখনও কোনো অনুরোধ নেই।",
  "Request a role upgrade": "ভূমিকা উন্নীতকরণের অনুরোধ",
  All: "সব",

  // Misc common words
  Keyword: "কীওয়ার্ড",
  Type: "ধরন",
  Year: "বছর",
  Topic: "বিষয়",
  Date: "তারিখ",
  Status: "অবস্থা",
  Actions: "ক্রিয়া",
  Author: "লেখক",
  Category: "বিভাগ",
  Results: "ফলাফল",
  "No results found": "কোনো ফলাফল পাওয়া যায়নি",
  "No results found.": "কোনো ফলাফল পাওয়া যায়নি।",
  English: "ইংরেজি",
};

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const Ctx = createContext<I18nCtx>({ lang: "en", setLang: () => {}, t: (k) => k });

// Tags whose text is never user-facing prose (or is an editable control) and
// must not be rewritten by the DOM walker.
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "CODE", "PRE"]);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  // Original English text keyed by the text node, so switching back restores it.
  const originals = useRef<Map<Text, string>>(new Map());
  const applying = useRef(false);

  const translateNode = (node: Text) => {
    const value = node.nodeValue;
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const bn = BN[trimmed];
    if (!bn) return;
    if (!originals.current.has(node)) originals.current.set(node, value);
    node.nodeValue = value.replace(trimmed, bn);
  };

  const walk = (root: Node) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const parent = (n as Text).parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(parent.tagName) || parent.isContentEditable) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    nodes.forEach(translateNode);
  };

  const applyAll = () => {
    applying.current = true;
    walk(document.body);
    applying.current = false;
  };

  const restoreAll = () => {
    applying.current = true;
    originals.current.forEach((orig, node) => {
      if (node.isConnected) node.nodeValue = orig;
    });
    originals.current.clear();
    applying.current = false;
  };

  useEffect(() => {
    const saved = (typeof window !== "undefined" && localStorage.getItem("csedu_lang")) as Lang | null;
    if (saved === "bn" || saved === "en") setLangState(saved);
  }, []);

  // Whenever the language is Bangla, translate the current DOM and keep
  // re-translating as React renders/replaces nodes (route changes, data loads).
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (lang !== "bn") {
      restoreAll();
      return;
    }

    applyAll();

    let raf = 0;
    const observer = new MutationObserver((mutations) => {
      if (applying.current) return;
      // Debounce bursts of React mutations into a single re-translate pass.
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        applying.current = true;
        for (const m of mutations) {
          m.addedNodes.forEach((n) => {
            if (n.nodeType === Node.TEXT_NODE) translateNode(n as Text);
            else if (n.nodeType === Node.ELEMENT_NODE) walk(n);
          });
          if (m.type === "characterData" && m.target.nodeType === Node.TEXT_NODE) {
            translateNode(m.target as Text);
          }
        }
        applying.current = false;
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [lang]);

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

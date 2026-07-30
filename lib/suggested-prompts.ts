import {
  Banknote,
  Building2,
  FileWarning,
  Landmark,
  Scale,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import type { UiLanguage } from "@/lib/ui-strings";

interface SuggestedPrompt {
  icon: LucideIcon;
  ms: string;
  en: string;
}

// A small, report-grounded set of example questions (see data/core.md) that
// cover the report's main themes — spans the Ringkasan Eksekutif rather than
// leaning on any single topic, so the empty state reads as a fair sample of
// what the chatbot can answer.
const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  {
    icon: Building2,
    ms: "Apa itu UJSB?",
    en: "What is UJSB?",
  },
  {
    icon: TrendingDown,
    ms: "Kenapa TH mengalami krisis kewangan?",
    en: "Why did TH face a financial crisis?",
  },
  {
    icon: Landmark,
    ms: "Apakah cadangan Suruhanjaya mengenai Dana Haji?",
    en: "What did the Commission recommend about Dana Haji?",
  },
  {
    icon: Banknote,
    ms: "Apakah isu bonus kakitangan LTH?",
    en: "What were the issues with LTH staff bonuses?",
  },
  {
    icon: Scale,
    ms: "Kenapa Ketua Audit Negara dikritik?",
    en: "Why was the Auditor General criticized?",
  },
  {
    icon: FileWarning,
    ms: "Apakah kelemahan Akta Tabung Haji 1995?",
    en: "What are the weaknesses of the Tabung Haji Act 1995?",
  },
];

export function getSuggestedPrompts(lang: UiLanguage) {
  return SUGGESTED_PROMPTS.map((p) => ({ icon: p.icon, text: p[lang] }));
}

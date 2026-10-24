import { LanguageCode, Translations } from "./types";
import { fr } from "./fr";
import { en } from "./en";
import { es } from "./es";
import { zh } from "./zh";
import { de } from "./de";
import { ru } from "./ru";
import { uk } from "./uk";
import { pt } from "./pt";
import { ar } from "./ar";
import { it } from "./it";
import { ja } from "./ja";
import { ln } from "./ln";
import { sw } from "./sw";
import { tsh } from "./tsh";
import { kg } from "./kg";
import { alur } from "./alur";

export * from "./types";

export const translations: Record<LanguageCode, Translations> = {
  fr,
  en,
  es,
  zh,
  de,
  ru,
  uk,
  pt,
  ar,
  it,
  ja,
  ln,
  sw,
  tsh,
  kg,
  alur,
};

export const supportedLanguages: { code: LanguageCode; name: string; flag: string; nativeName: string }[] = [
  { code: "fr", name: "Français", flag: "🇫🇷", nativeName: "Français" },
  { code: "en", name: "English", flag: "🇬🇧", nativeName: "English" },
  { code: "es", name: "Español", flag: "🇪🇸", nativeName: "Español" },
  { code: "zh", name: "Chinois", flag: "🇨🇳", nativeName: "中文" },
  { code: "de", name: "Allemand", flag: "🇩🇪", nativeName: "Deutsch" },
  { code: "ru", name: "Russe", flag: "🇷🇺", nativeName: "Русский" },
  { code: "uk", name: "Ukrainien", flag: "🇺🇦", nativeName: "Українська" },
  { code: "pt", name: "Portugais", flag: "🇵🇹", nativeName: "Português" },
  { code: "ar", name: "Arabe", flag: "🇸🇦", nativeName: "العربية" },
  { code: "it", name: "Italien", flag: "🇮🇹", nativeName: "Italiano" },
  { code: "ja", name: "Japonais", flag: "🇯🇵", nativeName: "日本語" },
  { code: "ln", name: "Lingala", flag: "🇨🇩", nativeName: "Lingála" },
  { code: "sw", name: "Swahili", flag: "🇹🇿", nativeName: "Kiswahili" },
  { code: "tsh", name: "Tshiluba", flag: "🇨🇩", nativeName: "Tshiluba" },
  { code: "kg", name: "Kikongo", flag: "🇨🇬", nativeName: "Kikongo" },
  { code: "alur", name: "Dhu Alur", flag: "🇨🇩", nativeName: "Dhu Alur" },
];

const langMap: Record<string, LanguageCode> = {
  // Direct codes
  fr: "fr",
  en: "en",
  es: "es",
  zh: "zh",
  de: "de",
  ru: "ru",
  uk: "uk",
  pt: "pt",
  ar: "ar",
  it: "it",
  ja: "ja",
  ln: "ln",
  sw: "sw",
  tsh: "tsh",
  kg: "kg",
  alur: "alur",

  // English names
  french: "fr",
  english: "en",
  spanish: "es",
  chinese: "zh",
  german: "de",
  russian: "ru",
  ukrainian: "uk",
  portuguese: "pt",
  arabic: "ar",
  italian: "it",
  japanese: "ja",
  lingala: "ln",
  swahili: "sw",
  tshiluba: "tsh",
  kikongo: "kg",
  "dhu alur": "alur",
  "dhu-alur": "alur",
  alur_rdc: "alur",

  // French names
  francais: "fr",
  français: "fr",
  anglais: "en",
  espagnol: "es",
  chinois: "zh",
  allemand: "de",
  russe: "ru",
  ukrainien: "uk",
  portugais: "pt",
  arabe: "ar",
  italien: "it",
  japonais: "ja",
  ciluba: "tsh",
  kiswahili: "sw",
  "kikongo ya leta": "kg",
  mahagi: "alur",
};

export function getLanguageCode(lang: string): LanguageCode {
  if (!lang) return "fr";
  const normalized = lang.trim().toLowerCase();
  return langMap[normalized] || (translations[normalized as LanguageCode] ? (normalized as LanguageCode) : "fr");
}

export function getTranslations(lang: string): Translations {
  const code = getLanguageCode(lang);
  return translations[code] || translations.fr;
}


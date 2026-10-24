/**
 * Alur Conjugation Engine (Moteur de règles de conjugaison Dhu Alur)
 *
 * Ce module gère les règles formelles de conjugaison en Dhu Alur authentique
 * (territoire de Mahagi, RDC).
 *
 * Il fournit :
 * 1. Une fonction de conjugaison programmatique de verbes Alur.
 * 2. Les instructions système complètes pour le moteur de traduction IA.
 * 3. Un vérificateur / nettoyeur post-traduction (sanitizeAndFixAlurConjugation)
 *    qui élimine automatiquement les verbes restés à l'infinitif ('Ni') dans les
 *    phrases conjuguées, corrige la séparation des sujets et expulse le vocabulaire Acholi.
 */

export type AlurSubject = "A" | "I" | "E" | "Wa" | "Wu" | "Gi" | "An" | "In" | "En" | "Wan" | "Wun" | "Gin";

export type AlurTense = 
  | "present_habitual"
  | "present_continuous"
  | "future"
  | "future_accomplished"
  | "future_continuous"
  | "past_general"
  | "past_accomplished"
  | "past_continuous"
  | "past_immediate"
  | "imperative_singular"
  | "imperative_plural";

export interface ConjugationOptions {
  verb: string;             // Ex: "Ni camu", "Ni cidho", "Ni maru" ou "camu"
  subject: AlurSubject;     // Ex: "A" (Je), "I" (Tu), "E" (Il/Elle), "Wa" (Nous), "Wu" (Vous), "Gi" (Ils/Elles)
  tense: AlurTense;         // Temps de la phrase
  isNegative?: boolean;     // Négation (ngo / kud)
  isTargetedObject?: boolean; // Forme transitive ciblée (-e, ex: Nege)
}

/**
 * Extrait la racine verbale propre en retirant le préfixe infinitif 'Ni' ou 'ni'
 */
export function getAlurVerbRoot(verb: string): string {
  if (!verb) return "";
  let clean = verb.trim();
  // Retirer "Ni " ou "ni " au début
  if (/^ni\s+/i.test(clean)) {
    clean = clean.replace(/^ni\s+/i, "");
  }
  return clean;
}

/**
 * Moteur de conjugaison programmatique
 */
export function conjugateAlurVerb(options: ConjugationOptions): string {
  const root = getAlurVerbRoot(options.verb);
  const { subject, tense, isNegative, isTargetedObject } = options;

  if (!root) return "";

  // 1. Traitement de l'impératif
  if (tense === "imperative_singular" || tense === "imperative_plural") {
    let impRoot = root;
    
    // Si ciblé vers un objet / personne (-e)
    if (isTargetedObject) {
      impRoot = root.replace(/[aouei]$/i, "") + "e";
    } else {
      // Regarder la consonne finale
      const endsWithMLR = /[mlr][aouei]$/i.test(root);
      if (endsWithMLR) {
        // Supprimer la dernière voyelle
        impRoot = root.replace(/[aouei]$/i, "");
      } else {
        // Remplacer la voyelle finale par 'i'
        impRoot = root.replace(/[aouei]$/i, "i");
      }
    }

    if (tense === "imperative_plural") {
      impRoot = `Wu-${impRoot}`;
    }

    if (isNegative) {
      return `Kud ${impRoot}`;
    }
    return impRoot;
  }

  // 2. Conjugaison standard par temps
  let prefix = "";
  let suffix = "";

  switch (tense) {
    case "present_habitual":
    case "past_general":
      prefix = `${subject} `;
      break;

    case "present_continuous":
      prefix = `${subject} be `;
      break;

    case "future":
      prefix = `${subject} bi `;
      break;

    case "future_accomplished":
      prefix = `${subject} bi daru `;
      break;

    case "future_continuous":
      prefix = `${subject} bi be `;
      break;

    case "past_accomplished":
      prefix = `${subject} daru `;
      break;

    case "past_continuous":
      prefix = `${subject} bedo `;
      break;

    case "past_immediate":
      prefix = `${subject} aye `;
      suffix = " eni";
      break;

    default:
      prefix = `${subject} `;
      break;
  }

  let finalVerb = root;
  if (isTargetedObject && !finalVerb.endsWith("e")) {
    finalVerb = finalVerb.replace(/[aouei]$/i, "") + "e";
  }

  let sentence = `${prefix}${finalVerb}${suffix}`.trim();

  if (isNegative) {
    sentence += " ngo";
  }

  return sentence;
}

export interface FidelityIssue {
  originalWord: string;
  suggestedWord: string;
  reason: string;
  category: "acholi_external" | "infinitif_unconjugated" | "spelling_standard";
}

/**
 * Dictionnaire officiel de fidélité Mahagi / JW.ORG pour la détection et correction des mots non authentiques
 */
export const MAHAGI_FIDELITY_DICTIONARY: Array<{
  pattern: RegExp;
  original: string;
  suggested: string;
  reason: string;
}> = [
  { pattern: /\bRubanga\b/gi, original: "Rubanga", suggested: "Mungu", reason: "Terme religieux Acholi → Utilisez Mungu / Mugu (Authentique Mahagi & JW.ORG)" },
  { pattern: /\bLubanga\b/gi, original: "Lubanga", suggested: "Mungu", reason: "Terme religieux Acholi → Utilisez Mungu / Mugu" },
  { pattern: /\bCwiny\s+Maleng\b/gi, original: "Cwiny Maleng", suggested: "Kudhi Malleng'o", reason: "Saint-Esprit en Acholi → Utilisez Kudhi Malleng'o (Mahagi & JW.ORG)" },
  { pattern: /\bLok\b/g, original: "Lok", suggested: "Lembe", reason: "Mot/Parole en Acholi → Utilisez Lembe / Lembang'o (JW.ORG)" },
  { pattern: /\blok\b/g, original: "lok", suggested: "lembe", reason: "Mot/Parole en Acholi → Utilisez lembe" },
  { pattern: /\bApwoyo\s+matek\b/gi, original: "Apwoyo matek", suggested: "Afoyo lee dith", reason: "Remerciement Acholi → Utilisez Afoyo lee dith (Mahagi)" },
  { pattern: /\bApwoyo\b/gi, original: "Apwoyo", suggested: "Afoyo", reason: "Remerciement Acholi → Utilisez Afoyo (Authentique Mahagi)" },
  { pattern: /\bPwoyo\b/gi, original: "Pwoyo", suggested: "Afoyo", reason: "Terme Acholi → Utilisez Afoyo / Foyo" },
  { pattern: /\bDichwo\b/gi, original: "Dichwo", suggested: "Choo", reason: "Homme en Acholi → Utilisez Choo (Authentique Mahagi)" },
  { pattern: /\bLaco\b/gi, original: "Laco", suggested: "Choo", reason: "Homme en Acholi → Utilisez Choo" },
  { pattern: /\bDhako\b/gi, original: "Dhako", suggested: "Dhaku", reason: "Femme en Acholi/Luo → Utilisez Dhaku (Orthographe Mahagi)" },
  { pattern: /\bDako\b/gi, original: "Dako", suggested: "Dhaku", reason: "Femme en Acholi → Utilisez Dhaku" },
  { pattern: /\bNyathi\b/gi, original: "Nyathi", suggested: "Nyatin", reason: "Enfant en Acholi → Utilisez Nyatin (Authentique Mahagi & JW.ORG)" },
  { pattern: /\bLati\b/gi, original: "Lati", suggested: "Nyatin", reason: "Enfant en Acholi → Utilisez Nyatin" },
  { pattern: /\bNyithindhi\b/gi, original: "Nyithindhi", suggested: "Awiya", reason: "Enfants en Acholi → Utilisez Awiya (Mahagi)" },
  { pattern: /\bRwenyo\b/gi, original: "Rwenyo", suggested: "rwinyo", reason: "Forme Acholi du verbe perdre → Utilisez rwinyo (Mahagi)" },
  { pattern: /\bm'urweny\b/gi, original: "m'urweny", suggested: "m'urwinyo", reason: "Forme Acholi → Utilisez m'urwinyo" },
  { pattern: /\bLapwonj\b/gi, original: "Lapwonj", suggested: "Japonj", reason: "Préfixe agent Acholi La- → Utilisez Japonj (Préfixe Ja- en Alur)" },
  { pattern: /\bLapwonjo\b/gi, original: "Lapwonjo", suggested: "Japonjo", reason: "Préfixe Acholi La- → Utilisez Japonjo" },
  { pattern: /\bLatic\b/gi, original: "Latic", suggested: "Jatich", reason: "Préfixe Acholi La- → Utilisez Jatich" },
  { pattern: /\bLalweny\b/gi, original: "Lalweny", suggested: "Jalwiny", reason: "Préfixe Acholi La- → Utilisez Jalwiny" },
  { pattern: /\bLapur\b/gi, original: "Lapur", suggested: "Japur", reason: "Préfixe Acholi La- → Utilisez Japur" },
  { pattern: /\bGik\b/g, original: "Gik", suggested: "Gi", reason: "Choses en Acholi → Utilisez Gi (Dhu Alur)" },
  { pattern: /\bgimoro\b/gi, original: "gimoro", suggested: "gin moko mbe", reason: "Rien en Acholi → Utilisez gin moko mbe" },
  { pattern: /\bmbek\b/gi, original: "mbek", suggested: "mbe", reason: "Négation Acholi mbek → Utilisez mbe" },
  { pattern: /\bcamo\b/gi, original: "camo", suggested: "camu", reason: "Verbe manger en Acholi/Luo → Utilisez camu (Orthographe Mahagi)" },
  { pattern: /\bpwonjo\b/gi, original: "pwonjo", suggested: "ponjo", reason: "Verbe enseigner → Utilisez ponjo (Mahagi)" },
  { pattern: /\bPuonjo\b/gi, original: "Puonjo", suggested: "Ponjo", reason: "Orthographe Acholi → Utilisez Ponjo" },
  { pattern: /\bKweno\b/gi, original: "Kweno", suggested: "Kani", reason: "Où en Acholi → Utilisez Kani (Dhu Alur Mahagi)" },
  { pattern: /\bJo\b/g, original: "Jo", suggested: "Dhanu", reason: "Les gens/Personnes → Utilisez Dhanu (Dhu Alur)" },
  { pattern: /\bjo\b/g, original: "jo", suggested: "dhanu", reason: "Les gens/Personnes → Utilisez dhanu (Dhu Alur)" },
  { pattern: /\bJu\b/g, original: "Ju", suggested: "Dhanu", reason: "Les gens/Personnes → Utilisez Dhanu (Dhu Alur)" },
  { pattern: /\bju\b/g, original: "ju", suggested: "dhanu", reason: "Les gens/Personnes → Utilisez dhanu (Dhu Alur)" },
  { pattern: /\bnyoorere\b/gi, original: "nyoorere", suggested: "ni nyuthire", reason: "Se montrer/se faire voir → Utilisez ni nyuthire (Dhu Alur)" },
  { pattern: /\bnyorere\b/gi, original: "nyorere", suggested: "ni nyuthire", reason: "Se montrer/se faire voir → Utilisez ni nyuthire (Dhu Alur)" },
  { pattern: /\bnyenru\b/gi, original: "nyenru", suggested: "ni nyuthire", reason: "Se montrer/se faire voir → Utilisez ni nyuthire (Dhu Alur)" },
  { pattern: /\bnyalendo\b/gi, original: "nyalendo", suggested: "", reason: "Mot banni → Supprimez ou remplacez par le mot Alur adéquat" }
];

export function checkMahagiAlurFidelity(text: string): FidelityIssue[] {
  if (!text) return [];
  const issues: FidelityIssue[] = [];
  const seenKeys = new Set<string>();

  for (const item of MAHAGI_FIDELITY_DICTIONARY) {
    const matches = text.match(item.pattern);
    if (matches && matches.length > 0) {
      matches.forEach(match => {
        const key = `${match.toLowerCase()}->${item.suggested.toLowerCase()}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          issues.push({
            originalWord: match,
            suggestedWord: item.suggested,
            reason: item.reason,
            category: "acholi_external"
          });
        }
      });
    }
  }

  // Vérifier également les verbes non conjugués 'Ni [verbe]' après pronom sujet
  const subjectNiMatches = text.match(/\b(A|I|E|Wa|Wu|Gi)\s+(ni)\s+([a-z]+)\b/gi);
  if (subjectNiMatches) {
    subjectNiMatches.forEach(m => {
      const parts = m.split(/\s+/);
      if (parts.length >= 3) {
        const subj = parts[0];
        const verb = parts[2];
        const key = `ni_infinitif_${m.toLowerCase()}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          issues.push({
            originalWord: m,
            suggestedWord: `${subj} ${verb}`,
            reason: "Verbe laissé à l'infinitif ('ni') après un pronom sujet. Supprimez 'ni' pour conjuguer activement.",
            category: "infinitif_unconjugated"
          });
        }
      }
    });
  }

  return issues;
}

/**
 * Nettoyeur et vérificateur post-traduction spécialisé en Dhu Alur.
 * Détecte et élimine :
 * - Les verbes restés à l'infinitif ('Ni') après un pronom sujet (ex: "A ni camu" -> "A camu")
 * - Les mots collés (ex: "Amaru" -> "A maru", "Eponjo" -> "E ponjo", "Gicidho" -> "Gi cidho")
 * - Les préfixes acholi ou mots bannis (ex: "Rubanga" -> "Mungu", "Rwenyo"/"Rwinyo" -> "rwiny")
 */
export function sanitizeAndFixAlurConjugation(text: string): string {
  if (!text) return "";

  let fixed = text;

  // 1. Remplacement systématique et rigoureux de tout vocabulaire Acholi, Luo externe ou banni
  const banzaiReplacements: [RegExp, string][] = [
    // Perdre / Perdu / S'égarer (Authentique Mahagi Alur: Ni rwinyo / Rwinyo)
    [/\bRwenyo\b/gi, "rwinyo"],
    [/\bm'urweny\b/gi, "m'urwinyo"],
    
    // Noms sacrés et termes religieux
    [/\bRubanga\b/gi, "Mungu"],
    [/\bLubanga\b/gi, "Mungu"],
    [/\bCwiny\s+Maleng\b/gi, "Kudhi Malleng'o"],

    // Salutations et remerciements
    [/\bApwoyo\s+matek\b/gi, "Afoyo lee dith"],
    [/\bApwoyo\b/gi, "Afoyo"],

    // Personnes et famille
    [/\bDichwo\b/gi, "Choo"],
    [/\bLaco\b/gi, "Choo"],
    [/\bDhako\b/gi, "Dhaku"],
    [/\bDako\b/gi, "Dhaku"],
    [/\bNyathi\b/gi, "Nyatin"],
    [/\bLati\b/gi, "Nyatin"],
    [/\bNyithindhi\b/gi, "Awiya"],

    // Préfixes d'agent Acholi ('La-') vs Alur ('Ja-')
    [/\bLapwonj\b/gi, "Japonj"],
    [/\bLapwonjo\b/gi, "Japonjo"],
    [/\bLatic\b/gi, "Jatich"],
    [/\bLalweny\b/gi, "Jalwiny"],
    [/\bLapur\b/gi, "Japur"],
    [/\bLapoor\b/gi, "Japor"],
    [/\bPwoyo\b/gi, "Foyo"],
    [/\bPwonji\b/gi, "Ponji"],
    [/\bPwonjo\b/gi, "Ponjo"],

    // Vocabulaire divers Acholi vs Alur
    [/\bKop\s+ang'o\b/gi, "Lembang'o"],
    [/\bKop\b/g, "Lembe"],
    [/\bkop\b/g, "lembe"],
    [/\bLok\b/g, "Lembe"],
    [/\blok\b/g, "lembe"],
    [/\bGik\b/g, "Gi"],
    [/\bgimoro\b/gi, "gin moko mbe"],
    [/\bmbek\b/gi, "mbe"],
    [/\bPece\b/gi, "Sente"],
    [/\bNyithindo\b/gi, "Awiya"],
    [/\bLacoo\b/gi, "Choo"],
    [/\bLakur\b/gi, "Jakur"],
    [/\bLakoor\b/gi, "Jakur"],
    [/\bAnongo\b/gi, "Anwang'u"],
    [/\bNongo\b/gi, "Nwang'u"],
    [/\bKwiya\b/gi, "Ng'eyu ungo"],
    [/\bjamu\s+mi\s+ng'om\b/gi, "piny mi ng'om"],
    [/\bjami\s+mi\s+ng'om\b/gi, "piny mi ng'om"],
    [/\bJamu\s+mi\s+ng'om\b/gi, "Piny mi ng'om"],
    [/\bJami\s+mi\s+ng'om\b/gi, "Piny mi ng'om"],
    [/\bJamu\b/g, "Piny"],
    [/\bjamu\b/g, "piny"],
    [/\bJami\b/g, "Piny"],
    [/\bjami\b/g, "piny"],
    [/\bbe\s+mi\b/gi, "bey mi"],
    [/\bching'\b/gi, "cing'"],
    [/\bChing'\b/gi, "Cing'"],
    [/\bthelo\s+mi\s+kwo\b/gi, "kura mi kwo"],
    [/\bThelo\s+mi\s+kwo\b/gi, "Kura mi kwo"],
    [/\bthelo\b/gi, "wel"],
    [/\bThelo\b/gi, "Wel"],
    [/\bwell\b/gi, "wel"],
    [/\bWell\b/gi, "Wel"],
    [/\bbo\s+kendo\b/gi, "dok kendo"],
    [/\A\s+itye\b/g, "A tye"],
    [/\ba\s+itye\b/g, "a tye"],
    [/\bJu\s+u\s+be\b/gi, "Ju be"],
    [/\bJu\s+u\s+daru\b/gi, "Ju daru"],
    [/\bMoth,\s*moth\b/gi, "Mot, mot"],
    [/\bjurimimba\b/gi, "jurimba"],
    [/\bKweno\b/g, "Kani"],
    [/\bkweno\b/g, "kani"],
    [/\bJo\b/g, "Dhanu"],
    [/\bjo\b/g, "dhanu"],
    [/\bJu\b/g, "Dhanu"],
    [/\bju\b/g, "dhanu"],
    [/\bnyoorere\b/gi, "nyuthire"],
    [/\bnyorere\b/gi, "nyuthire"],
    [/\bNyoorere\b/gi, "Nyuthire"],
    [/\bNyorere\b/gi, "Nyuthire"],
    [/\bnyenru\b/gi, "nyuthire"],
    [/\bNyenru\b/gi, "Nyuthire"],
    [/\bNyalendo\b/gi, ""],
    [/\bnyalendo\b/gi, ""],

    // Orthographe verbale Alur correcte
    [/\bNi\s+camo\b/gi, "Ni camu"],
    [/\bcamo\b/gi, "camu"],
    [/\bpwonjo\b/gi, "ponjo"],
    [/\bPuonjo\b/gi, "Ponjo"],
    [/\bcung'u\b/gi, "cungo"],
  ];

  for (const [regex, replacement] of banzaiReplacements) {
    fixed = fixed.replace(regex, replacement);
  }

  // 2. Correction de l'infinitif résiduel 'Ni' / 'ni' après pronom sujet, nom ou marqueur temporel
  // Exemple : "A ni camu" -> "A camu", "E ni cidho" -> "E cidho", "A be ni camu" -> "A be camu", "Mungu ni maru" -> "Mungu maru"
  const subjectPrefixes = "(?:A|I|E|Wa|Wu|Gi|An|In|En|Wan|Wun|Gin|Mungu|Choo|Dhaku|Nyatin|Awiya|Dhano)";
  const tenseMarkers = "(?:be|bi|daru|bedo|aye)";

  // Supprime 'ni' entre un pronom sujet/nom et un verbe : "A ni camu" -> "A camu"
  const patternSubjectNiVerb = new RegExp(`\\b(${subjectPrefixes})\\s+ni\\s+([a-z]+)`, "gi");
  fixed = fixed.replace(patternSubjectNiVerb, (match, subj, verb) => {
    if (verb.toLowerCase() === "nindo") return `${subj} nindo`;
    if (verb.toLowerCase() === "poyo") return `${subj} poyo`;
    return `${subj} ${verb}`;
  });

  // Supprime 'ni' entre marqueur de temps et verbe : "A be ni camu" -> "A be camu"
  const patternTenseNiVerb = new RegExp(`\\b(${subjectPrefixes}\\s+${tenseMarkers})\\s+ni\\s+([a-z]+)`, "gi");
  fixed = fixed.replace(patternTenseNiVerb, (match, subjTense, verb) => {
    if (verb.toLowerCase() === "nindo") return `${subjTense} nindo`;
    if (verb.toLowerCase() === "poyo") return `${subjTense} poyo`;
    return `${subjTense} ${verb}`;
  });

  // 3. Décollage systématique des pronoms sujets collés aux verbes (ex: "Amaru" -> "A maru", "Eponjo" -> "E ponjo")
  // Mots exclus (qui ne sont pas des verbes collés avec pronom)
  const excludedA = new Set(["an", "afoyo", "awiya", "alur", "afrique", "asie", "anglais", "aujourd'hui", "aussi", "avec", "avant", "après", "autre", "au", "aux", "anatomie", "ancien", "ange", "apôtre", "accord", "alliance", "amour", "arbre", "argent"]);
  const excludedE = new Set(["en", "ebe", "ebi", "egi", "eti", "egypte", "europe", "eglise", "enfant", "elle", "elles", "eux", "entre", "ensemble", "et", "egalement", "etant", "effet", "evangile", "esprit"]);
  const excludedGi = new Set(["gin", "gibe", "gibi", "gipre", "gimoko", "giri"]);
  const excludedWa = new Set(["wan", "wabe", "wabi"]);
  const excludedWu = new Set(["wun", "wube", "wubi"]);
  const excludedI = new Set(["in", "ibe", "ibi", "il", "ils", "ici", "idée", "image", "israël", "italie"]);

  // Décollage A + verbe
  fixed = fixed.replace(/\bA([a-z]{3,})\b/g, (match, word) => {
    if (excludedA.has(word.toLowerCase())) return match;
    return `A ${word}`;
  });

  // Décollage E + verbe
  fixed = fixed.replace(/\bE([a-z]{3,})\b/g, (match, word) => {
    if (excludedE.has(word.toLowerCase())) return match;
    return `E ${word}`;
  });

  // Décollage Gi + verbe
  fixed = fixed.replace(/\bGi([a-z]{3,})\b/g, (match, word) => {
    if (excludedGi.has(word.toLowerCase())) return match;
    return `Gi ${word}`;
  });

  // Décollage Wa + verbe
  fixed = fixed.replace(/\bWa([a-z]{3,})\b/g, (match, word) => {
    if (excludedWa.has(word.toLowerCase())) return match;
    return `Wa ${word}`;
  });

  // Décollage Wu + verbe
  fixed = fixed.replace(/\bWu([a-z]{3,})\b/g, (match, word) => {
    if (excludedWu.has(word.toLowerCase())) return match;
    return `Wu ${word}`;
  });

  // Décollage I + verbe
  fixed = fixed.replace(/\bI([a-z]{3,})\b/g, (match, word) => {
    if (excludedI.has(word.toLowerCase())) return match;
    return `I ${word}`;
  });

  return fixed;
}

/**
 * Bloc d'instructions ultra-détaillé décrivant le moteur de conjugaison
 * à injecter directement dans le Prompt Système de Gemini.
 */
export function getAlurConjugationEnginePrompt(): string {
  return `
================================================================================
MOTEUR DE RÈGLES DE CONJUGAISON EXPLICITE DHU ALUR (MAHAGI - RDC)
================================================================================

VOUS DEVEZ IMPÉRATIVEMENT APPLIQUER LE MOTEUR DE CONJUGAISON ALUR SUIVANT :

1. RÈGLE DE L'INFINITIF VS VERBE CONJUGUÉ :
   - L'infinitif isolé prend la particule 'Ni' (ex: "Ni maru" = aimer, "Ni camu" = manger, "Ni cidho" = aller, "Ni ponjo" = enseigner).
   - DÈS QU'UN VERBE EST DANS UNE PHRASE AVEC UN SUJET ET/OU UN TEMPS, LE PRÉFIXE 'Ni' DOIT ÊTRE SUPPRIMÉ SANS EXCEPTION !
   - INTERDICTION ABSOLUE : Ne produisez JAMAIS "E ni camu", "A ni cidho", "Gi ni foyo".
   - CORRECTION OBLIGATOIRE : Produisez "E camu" (Il mange), "A cidho" (Je vais), "Gi foyo" (Ils remercient).

2. MATRICE DES PRONOMS SUJETS & SEPARATION OBLIGATOIRE :
   - Je = 'A' (ex: "A maru" = J'aime)
   - Tu = 'I' (ex: "I maru" = Tu aimes)
   - Il / Elle = 'E' (ex: "E maru" = Il/Elle aime)
   - Nous = 'Wa' (ex: "Wa maru" = Nous aimons)
   - Vous = 'Wu' (ex: "Wu maru" = Vous aimez)
   - Ils / Elles = STRICTEMENT 'Gi' (ex: "Gi maru" = Ils/Elles aiment). Ne collez jamais le pronom au verbe (PAS "Amaru", PAS "A-maru").

3. SYSTÈME DES TEMPS ET DES ASPECTS :
   - Présent habituel / général : [Sujet] + [Racine sans 'Ni'] (ex: "A camu" = Je mange).
   - Présent continu / progressif ("en train de") : [Sujet] + "be" + [Racine sans 'Ni'] (ex: "A be camu" = Je suis en train de manger).
   - Futur ("va / fera") : [Sujet] + "bi" + [Racine sans 'Ni'] (ex: "A bi camu" = Je mangerai / je vais manger).
   - Futur accompli / antérieur : [Sujet] + "bi daru" + [Racine sans 'Ni'] (ex: "A bi daru camu" = J'aurai fini de manger).
   - Futur continu : [Sujet] + "bi be" + [Racine sans 'Ni'] (ex: "A bi be nindo" = Je serai en train de dormir).
   - Passé général : [Sujet] + [Racine sans 'Ni'] + [Indicateur de temps : nyaworo, con, tin] (ex: "A cidho nyaworo" = Je suis allé hier).
   - Passé accompli ("avoir déjà fait") : [Sujet] + "daru" + [Racine sans 'Ni'] (ex: "A daru camu" = J'ai déjà mangé).
   - Passé continu ("était en train de") : [Sujet] + "bedo" ou "bino" + [Racine sans 'Ni'] (ex: "A bedo nindo" = J'étais en train de dormir).
   - Passé immédiat ("venir de") : [Sujet] + "aye" + [Racine sans 'Ni'] + "eni" (ex: "E aye tundo eni" = Il vient d'arriver).
   - Aspect incompli ("pas encore") : "Fodi" + [Sujet] + [Racine sans 'Ni'] + "ngo" (ex: "Fodi a camu ngo" = Je n'ai pas encore mangé).

4. NÉGATION DECLARATIVE :
   - Placez la particule 'ngo' IMMÉDIATEMENT APRÈS le verbe conjugué.
   - Exemples : "A camu ngo" (Je ne mange pas), "A be camu ngo" (Je ne suis pas en train de manger), "A bi camu ngo" (Je ne mangerai pas).

5. MODE IMPÉRATIF :
   - Singulier : Changer la voyelle finale en '-i' (ex: "cidho" -> "cidhi!"). Si consonne M, L, R -> supprimer la voyelle finale.
   - Pluriel : Ajouter "Wu-" devant la forme impérative singulière (ex: "Wu-cidhi!").
   - Impératif négatif : Utiliser "Kud i" (singulier) ou "Kud wu" (pluriel) (ex: "Kud i cidhi!" = Ne va pas !).

6. POSSESSIFS ET EXPRESSION DE L'AVIS / OPINION :
   - Avis / Opinion / Pensée = 'Paru'
   - Déclinaison complète de l'avis / opinion :
     * Mon avis / Ma pensée = 'Paru para'
     * Ton avis / Ta pensée = 'Paru peri'
     * Son avis / Sa pensée = 'Paru pare'
     * Notre avis / Notre pensée = 'Paru mwa'
     * Votre avis / Votre pensée = 'Paru mu'
     * Leur avis / Leur pensée = 'Paru migi'
     * Avis / opinion d'une personne spécifique = 'Paru pa [nom]' (ex: 'Paru pa Joseph' = L'avis / l'opinion de Joseph)
   - Possessifs généraux : Mon/Ma/Mes = 'para', Ton/Ta/Tes = 'peri', Son/Sa/Ses = 'pare', Notre/Nos = 'mwa' / 'perwa', Votre/Vos = 'mu' / 'perwu', Leur/Leurs = 'migi' / 'pergi'.

7. VOCABULAIRE SPÉCIFIQUE & EXPRESSIONS :
   - Réunion = 'coko' / 'dilo'
   - Individu / Personne = 'ng\'ati'
   - Miracle = 'udu' / 'tangu'
   - Signe / Miracle visuel = 'giranyutha'
   - Sommeil = 'nindo'
   - Dormir (infinitif) = 'ni nindo' (conjugaison: "A nindo", "E nindo")
   - Informer / Prévenir (infinitif) = 'ni poyo' (conjugaison: "A poyo", "E poyo")
   - Célibat = 'Musuma' (Don du célibat = 'Giramia mi musuma')
   - Clé / Clés = 'Kifungula' (Clés du royaume = 'Kifungula mi Ker')
   - Encourager / Fortifier le cœur = 'Tielo cwiny'
   - Jour du Seigneur = 'Nindo pa Rwoth'
   - Verset = 'Giragora'
   - Page = 'Mbaya' (ex: "i mbaya mir 2" = à la page 2)
   - Tremblement de terre = 'Digidi' (Séisme / secousse = 'Digidi uyengo ot')
   - Gardien de prison = 'Jakur otkol'
   - Enfant/Fils perdu = 'Wod m\'urwinyo'
   - Pression du groupe / camarades = 'cwal m\'aradu wada'
   - Salle du Royaume = 'Ot ker' (Pluriel: 'Udi ker')
   - Courage / Force = 'tego'
   - Paix intérieure / Sérénité = 'kwiocwiny mir adunde'
   - Culte familial = 'thier mi juruot'
   - Semeur (de graines) = 'jacoi kodhi' (Semer = 'coi kodhi')
   - Jeune fille / Vierge = 'nyamanyir' (Pluriel: 'jumanyir')
   - Montagne = 'got' (ex: "Sermon sur la montagne" = "Ponji pa Yesu ma wi got")
   - Représentants du gouvernement / Dirigeants = 'jubim mi ng\'om'
   - Armure / Équipement spirituel = 'jamlwiny' (Armure complète = 'jamlwiny mi Jukristu')
   - Épis / Moisson = 'cam' (Arracher des épis = 'jaku cam')
   - Direction / Guidance = 'telowic'
   - Descendant / Petit-fils = 'nyakwar' (ex: "Nyakwar Ubimo Daudi" = Descendant du roi David)
   - Angoisse / Douleur vive = 'litho'
   - Maïs = 'anyogi'
   - Réconfort / Apaisement = 'yom' (Trouver du réconfort = 'nwang\'u yom')
   - Vérité = 'lemandha' (Apprendre la vérité = 'ponjo lemandha')
   - Thème du mois = 'thiwiwec mi dwi'
   - Divertissement / Détente = 'ninambu' / 'foyo'
   - Fractions du sang = 'nyithitheng rimo'
   - Esprit du monde = 'tipo m\'i ng\'om'
   - Démons / Esprits mauvais = 'pajogi'
   - Nettoyage / Propreté = 'leng\'o'
   - Personne sage / Sage = 'ng\'atu ma riek'
   - Traitement médical / Soins = 'thieth'
   - Levain = 'thobi' (ex: "levain des pharisiens" = "thobi mi Jufarisayo")
   - Temple = 'hekalu'
   - Offrande / Don = 'giramia' / 'sente mi giramia'
   - Créateur = 'Jacwich'
   - Espérance / Espoir = 'genogen'
   - Respect / Honneur = 'woro'
   - Premier-né = 'wod ma kayu'
   - Ancêtres / Lignée = 'thekwaru'
   - Promesse / Engagement = 'macikra'
   - Rêve / Songe = 'lek'
   - Proverbe / Sagesse = 'Lembrieko' (ex: "Lembrieko 1-6" = Proverbes 1-6)
   - Trésor / Joyau / Richesse = 'Lonyo' (ex: "Lonyo ma nwang'ere" = Joyaux qu'on trouve)
   - Épée / Machette = 'Palamularu' (ex: "cob mi palamularu" = coup d'épée)
   - Faute / Transgression = 'Kier' (Confesser ses fautes = 'tuco kier')
   - Digne de confiance / Fiable = 'Jugeno'
   - Berger = 'Jakwac' (Mouton/Brebis = 'Rombe')
   - Colère / Irritation = 'Ng'ecwiny' (Apaiser la colère = 'kwio wi ng'ecwiny')
   - Ami / Compagnon = 'Jarimo' (Ami véritable = 'Jarimo mandha')
   - Féliciter = 'Yunge' (ex: "Yunge pi dieng'" = Félicitez-la pour ses soins)
   - Mariage / Union = 'Gamiri'
   - Détresse / Malheur / Épreuve = 'Can' (ex: "nind mi can" = jours de détresse)
   - Sagesse = 'Rieko' (ex: "Woth ku jurieko" = Marche avec les sages)
   - Appareil enregistreur / Dictaphone / Micro = 'Giramak-dwand' / 'Giramak-lembe' (de 'gira' = outil + 'mako' = attraper/enregistrer + 'dwand/lembe' = voix/parole)
   - Document de lecture / Publication = 'Girasoma' (de 'gira' = outil/élément + 'soma' = lecture)
   - Limite / Frontière / Borne = 'Wang kiew' (ex: "wang kiew mi ng'om" = la frontière du pays / la limite du champ)
   - Sous terre = 'i the Ng\'om' (ex: "i the ng'om" = sous le sol / sous terre)
   - Plafond = 'dwand oth' / 'dwand ot' (ex: "dwand oth mi ot" = le plafond de la maison)
   - Marché = 'Kathali' (ex: "cith i kathali" = aller au marché)
   - Bureau = 'odi tich' / 'ot tich' (ex: "e itye i odi tich" = il est au bureau)
   - Luminosité / Lumière d'écran = 'Der mi wang'' (ex: "der mi wang' téléphone" = la luminosité de l'écran du téléphone)
   - Faire mal aux yeux = 'Remo wang'' (ex: "ube remo wang'a" = ça me fait mal aux yeux / fatigue mes yeux)
   - Prison = 'Kol' (ex: "E itye i kol" = Il est en prison).
   - Monsieur / Homme de respect / Personnalité éminente = 'Jadith' (ex: "Jadith Joseph" = Monsieur Joseph / Un homme respectable).
   - Confirmation / C'est tout à fait ça / Exactement ainsi = 'Tap kumeno' (ex: "Tap kumeno!" = Exactement cela ! / C'est tout à fait ça !).
   - Compréhension globale / Tout compris :
     * Singulier (Tu) = "Kara man i nyang' zoo" (Ça veut dire que tu as tout compris)
     * Pluriel (Vous) = "Kara man wu nyang' zoo" (Ça veut dire que vous avez tout compris)

    - Expressions complémentaires & RÈGLE DE DISTINCTION LINGUISTIQUE (DHU ALUR AUTHENTIQUE) :
      * Merci aussi / Merci également = 'Afoyo bende'
      * Merci infiniment = 'Afoyo lee dit akeca' (ou 'Afoyo lee akeca' / 'Afoyo matek akeca')
      * Pas de problème / Aucun souci = 'Lembe mbe' (ou 'Lembe moko mbe' = aucun problème particulier)
      * ATTENTION STRICTE : Le Dhu Alur (RDC / Ouganda West-Nile) est une langue Luo distincte. NE JAMAIS utiliser de termes Acholi comme 'Kop' à la place de 'Lembe' ('Lembe' = affaire/parole/problème ; 'Kopo' = tasse).
      * Pourquoi ? / Pour quelle raison ? = 'Pir ang'o?' (ou 'Pi lembang'o?') — REMARQUE STRICTE : "Pi ang'o" n'existe PAS en Dhu Alur. On dit exclusivement "Pir ang'o ?" ou "Pi lembang'o ?".
      * Petits enfants (pluriel) = 'awiya matindo'
      * Au pluriel = 'i dupa' (ex: "i dupa ju yero..." = au pluriel on dit...)
      * Expression d'encouragement et de gratitude = "Wa foyo lee dit pi ni konyo wa ni wotho i yoo mathira, man ku woro yub mi Dhu Alur ma kakare" (Merci beaucoup pour votre aide à nous faire avancer dans la bonne direction, et pour le respect accordé à la langue Dhu Alur authentique)
      * Au moins maintenant on s'entend bien = "Twora kawoni wabe winjira maber" (ou "Twora kawoni wa be winjira maber")
      * Parler agréable / très bien parler = "Tap, kawoni twora ibe weco ma mith akeca" (Exactement, maintenant au moins tu parles très agréablement)
      * Joie de se comprendre = "Lembe maeni u nyayu anyong'a i cwinya ma wa be nyang'ira maber" (Cela me fait grand plaisir que nous nous comprenions si bien)
      * Dhu Alur de Mahagi (RDC, Territoire de Mahagi) = "Dhu Alur mi Mahagi" (Référence de parler authentique Alur)
      * Biens matériels / Choses du monde (contexte spirituel / biblique) = "Piny mi ng'om" (STRICTEMENT ! Ne JAMAIS utiliser 'jamu' ou 'jami' pour les biens matériels du monde dans un contexte spirituel/biblique. Ex: "Les biens matériels de ce monde" = "Piny mi ng'om").
      * Courir = "Ni ringo" (Infinitif) / "ringo" (Action)
      * RÈGLES STRICTES SUR LE MOT 'VALEUR' SELON LE SENS :
        - Valeur (en terme de nombre, chiffres, données, quantité, versets, statistiques) = 'Wel' (ou 'well', ex: "wel mi nindo" = le nombre/la valeur des jours).
        - Valeur (en terme de comportement, habitudes, principes moraux, valeurs de la vie) = 'Kura' ou 'Kura kwo' (ex: "kura mi kwo mandha" = les vraies valeurs morales de la vie).
        - Valeur (en terme de prix d'un objet, coût, valeur marchande) = STRICTEMENT 'Bey' (ex: "bey mi piny" = le prix/la valeur marchande de la chose. INTERDIT: 'jamu', 'jami', 'be').
      * Comportement = "Kura" (attitude, manière d'être ou de s'exprimer) ; "Kura wec" = locution (tournure de phrase / façon de parler).
      * Le protecteur / gardien = "Ja kur" (avec le préfixe d'agent 'ja-' + 'kur', ex: "Ja kur wec" = le gardien des mots). REMARQUE STRICTE : "Kura" signifie "comportement" (et non gardien), et ne vient pas du verbe "ni kuro".
      * Finir / Achever = "ni Daru" (ex: "A daru tich meni nyaworo" = J'ai fini ce travail hier).
      * Avoir été fait / S'accomplir = "ni timire" (forme passive / réfléchie du verbe 'ni timo' = faire, ex: "Tich meni u timire nyaworo" = Ce travail a été fait hier).
      * "Avec" (Préposition) = "Kud" devant une VOYELLE (ex: "Kud awiya karacelo" = avec les enfants ensemble) ; "Ku" devant une CONSONNE (ex: "Ku judongo" = avec les adultes/anciens).
      * Et / Avec / Également = "Kede" (S'emploie pour 'avec' ou 'et aussi', aux côtés de 'man')
      * Avancer ensemble / Entente parfaite = "Ma kan tek ibe kwayu ungo wec moko i dok mange cii wabi woto karcelo man lembe mwa bi rombo" (Tant que tu n'empruntes aucun mot dans d'autres langues, nous avancerons ensemble et notre entente sera parfaite)

TOUTE TRADUCTION VERS LE DHU ALUR DOIT RESPECTER À 100% CES RÈGLES DE CONJUGAISON ET LE VOCABULAIRE DHU ALUR PUR (SANS CONFUSION AVEC L'ACHOLI).
`;
}

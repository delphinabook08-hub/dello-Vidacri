import { GoogleGenAI, Type } from "@google/genai";
import { 
  sanitizeAndFixAlurConjugation, 
  getAlurConjugationEnginePrompt 
} from "./alurConjugation";
import { unwrapLinesExceptParagraphs, autoFormatAndPunctuateText } from "./textUtils";

let aiInstance: GoogleGenAI | null = null;

function getAi() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("La clé d'API GEMINI_API_KEY n'est pas configurée dans les paramètres. Veuillez l'ajouter pour utiliser l'OCR.");
    }
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiInstance;
}

function serializeError(err: any): string {
  if (!err) return "";
  try {
    if (err instanceof Error) {
      let str = `${err.name}: ${err.message}`;
      if (err.stack) str += `\nStack: ${err.stack}`;
      // Safely append other properties (like status, code, statusText, etc.)
      const otherProps: Record<string, any> = {};
      for (const key of Object.keys(err)) {
        otherProps[key] = (err as any)[key];
      }
      for (const key of Object.getOwnPropertyNames(err)) {
        if (key !== "stack" && key !== "message" && key !== "name") {
          otherProps[key] = (err as any)[key];
        }
      }
      if (Object.keys(otherProps).length > 0) {
        str += `\nMetadata: ${JSON.stringify(otherProps)}`;
      }
      return str;
    }
    if (typeof err === "object") {
      return JSON.stringify(err);
    }
    return String(err);
  } catch (e) {
    return String(err?.message || err?.status || err || "");
  }
}

/**
 * Robust JSON parser with multi-stage recovery for AI outputs.
 * Handles markdown fences, unescaped newlines, truncated JSON strings, and regex fallbacks.
 */
function safeParseJson<T = any>(rawText: string | undefined | null): T | null {
  if (!rawText) return null;

  let clean = rawText.trim();

  // Strip markdown code block wrappers if present
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }

  // 1. Direct parse attempt
  try {
    return JSON.parse(clean);
  } catch (e) {
    // Continue
  }

  // 2. Sanitize unescaped control characters inside string values
  try {
    const sanitized = clean.replace(/[\u0000-\u001F]+/g, (match) => {
      if (match === "\n") return "\\n";
      if (match === "\r") return "\\r";
      if (match === "\t") return "\\t";
      return "";
    });
    return JSON.parse(sanitized);
  } catch (e) {
    // Continue
  }

  // 3. Repair truncated JSON (close unclosed quotes and brackets)
  try {
    let repaired = clean;
    let inString = false;
    let isEscaped = false;

    for (let i = 0; i < repaired.length; i++) {
      const char = repaired[i];
      if (char === '\\' && !isEscaped) {
        isEscaped = true;
      } else {
        if (char === '"' && !isEscaped) {
          inString = !inString;
        }
        isEscaped = false;
      }
    }

    if (inString) {
      repaired += '"';
    }

    const stack: string[] = [];
    inString = false;
    isEscaped = false;
    for (let i = 0; i < repaired.length; i++) {
      const char = repaired[i];
      if (char === '\\' && !isEscaped) {
        isEscaped = true;
        continue;
      }
      if (char === '"' && !isEscaped) {
        inString = !inString;
      } else if (!inString) {
        if (char === '{' || char === '[') {
          stack.push(char);
        } else if (char === '}') {
          if (stack[stack.length - 1] === '{') stack.pop();
        } else if (char === ']') {
          if (stack[stack.length - 1] === '[') stack.pop();
        }
      }
      isEscaped = false;
    }

    while (stack.length > 0) {
      const open = stack.pop();
      if (open === '{') repaired += '}';
      if (open === '[') repaired += ']';
    }

    return JSON.parse(repaired);
  } catch (e) {
    // Continue
  }

  // 4. Regex extraction for "text" field
  try {
    const textMatch = clean.match(/"text"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"|"\s*\}|$)/);
    if (textMatch && textMatch[1]) {
      let extractedText = textMatch[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
      return { text: extractedText } as unknown as T;
    }
  } catch (e) {
    // Continue
  }

  // 5. If plain text without JSON markers
  if (!clean.startsWith("{") && !clean.startsWith("[")) {
    return { text: clean } as unknown as T;
  }

  return null;
}

/**
 * Executes a Gemini API generateContent call with active high-availability failover
 * and adaptive timeouts to handle 503 (high demand / temporary spikes) and 429 errors gracefully.
 */
async function reliableGenerateContent(params: {
  model: string;
  contents: any;
  config?: any;
  timeoutMs?: number;
}): Promise<any> {
  const contentsStr = JSON.stringify(params.contents || "");
  const isAudio = contentsStr.includes("audio/");
  const isMultipageImage = Array.isArray(params.contents?.parts) && params.contents.parts.length > 2;
  
  // High-availability model sequence using valid models from @google/genai guidelines:
  // Primary: requested model (gemini-3.8-flash or gemini-3.5-transcribe for audio)
  // Fallbacks: gemini-3.1-flash-lite, gemini-flash-latest
  const fallbackList = isAudio
    ? [params.model, "gemini-3.5-transcribe", "gemini-3.8-flash", "gemini-3.1-flash-lite"]
    : [params.model, "gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];

  const modelsToTry = Array.from(new Set(fallbackList.filter(Boolean)));
  let lastError: any = null;

  // Generous, realistic timeouts for vision OCR & multi-page document recognition
  const defaultTimeout = isAudio ? 40000 : isMultipageImage ? 55000 : 35000;
  const timeoutMs = params.timeoutMs || defaultTimeout;

  for (let i = 0; i < modelsToTry.length; i++) {
    const currentModel = modelsToTry[i];
    // Give primary model full time, fallbacks get 25-30s
    const currentTimeout = i === 0 ? timeoutMs : Math.min(timeoutMs, 30000);

    try {
      console.log(`[Gemini HA Router] Calling model ${currentModel} (${i + 1}/${modelsToTry.length}) [timeout: ${currentTimeout}ms]...`);
      const t0 = Date.now();

      const callPromise = getAi().models.generateContent({
        ...params,
        model: currentModel,
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${currentTimeout}ms on ${currentModel}`)), currentTimeout)
      );

      const response = await Promise.race([callPromise, timeoutPromise]);
      console.log(`[Gemini HA Router] SUCCESS on model ${currentModel} in ${Date.now() - t0}ms`);
      return response;
    } catch (err: any) {
      lastError = err;
      const errStr = serializeError(err).toLowerCase();

      // If 404 / not found, skip immediately to next model
      if (errStr.includes("404") || errStr.includes("not_found")) {
        console.warn(`[Gemini HA Router] Model ${currentModel} not available (404), switching to fallback.`);
        continue;
      }

      console.warn(`[Gemini HA Router] Model ${currentModel} encountered transient issue (503 / demand / timeout: ${err?.message || errStr}). Fast-switching to next model in pool...`);
      // Seamlessly continue to the next model in the high-availability pool
      continue;
    }
  }

  // If all models failed, propagate error back to caller
  throw lastError;
}

export interface TranscriptionResult {
  text: string;
  tableData?: string[][]; // Array of rows, each row is an array of cells
  isRawScan?: boolean;
}

function getNormalizedLanguageName(lang: string): string {
  if (!lang) return "French";
  const lower = lang.toLowerCase();
  if (lower.includes("alur") || lower.includes("dhu alur") || lower.includes("dholur") || lower.includes("mahagi")) {
    return `Dhu Alur / Mahagi (Authentic Dhu Alur language of Mahagi, RDC - Corpus JW2019).
    
    LÉGUMES & NOTIONS CORE:
    - Légumes = 'dek macol'
    - Accueillir = 'ni jolo'
    - Justice / Loi / Règle = 'cik'
    - Papier = 'karatasi'
    - Paix = 'Kuch'
    - Salutation = 'Moth'
    
    CRITICAL TERRITORIAL & LINGUISTIC DIRECTIVE FOR DHU ALUR / MAHAGI:
    When transcribing images (OCR), translating, or processing text in Dhu Alur / Mahagi:
    1. EXCLUSIVE TERRITORIAL DIALECT & ABSOLUTE LOCKDOWN:
       - Focus strictly and exclusively on the authentic Dhu Alur of the Mahagi territory (RDC).
       - STRICTLY EXCLUDE AND BAN all words, grammar, and spelling from Acholi (Acoli), Lango (Lang'u), Jonam (Junam), or any other Lwoo variants or external dialects.
    2. ABSOLUTE EXCLUSION OF EXTERNAL LWO / ACHOLI DIALECT TERMINOLOGY:
       - PRISON: Prison = 'Kol' (NEVER use external terms).
       - MONSIEUR / HOMME DE RESPECT: Monsieur / Homme éminent ou respecté = 'Jadith'.
       - COMPREHENSION / TOUT COMPRIS: "Kara man i nyang' zoo" = Ça veut dire que tu as tout compris (Singulier, avec 'i'). "Kara man wu nyang' zoo" = Ça veut dire que vous avez tout compris (Pluriel, avec 'wu').
       - EXACTEMENT AINSI / TOUT À FAIT CELA: Expressing exact agreement / confirmation = 'Tap kumeno' (C'est tout à fait ça / Exactement ainsi).
       - OPINION / AVIS / THOUGHT: Use 'Paru' (Avis / Opinion / Pensée = 'Paru'; Mon avis = 'Paru para'; Avis de quelqu'un = 'Paru pa [nom]', ex: 'Paru pa Joseph').
       - GOD / CREATOR: Use 'Mungu' or 'Mugu' in Dhu Alur (NEVER 'Rubanga' or 'Lubanga' which is Acholi).
       - WORD / SPEECH / LESSON: Use 'Lembe' or 'Lembang\'o' (Plural: 'Lembini' / 'Lembi'; NEVER 'Lok' which is Acholi).
       - THANK YOU / GRATITUDE: Use 'Afoyo' or 'Afoyo lee dith' (NEVER 'Apwoyo' or 'Apwoyo matek').
       - MAN: Use 'Choo' (NEVER 'Dichwo' or 'Laco').
       - WOMAN: Use 'Dhaku' (NEVER 'Dhako' or 'Dako').
       - CHILD: Use 'Nyatin' (NEVER 'Nyathi' or 'Lati').
       - CHILDREN: Use 'Awiya' or 'Nyithindo' (NEVER 'Nyithindhi').
       - HOLY SPIRIT: Use 'Kudhi Malleng\'o' or 'Kudhi Leng\'o' (NEVER 'Cwiny Maleng').
       - NOTHING / ABSENCE: Use 'Umbe' / 'mbe' and 'Gin moko mbe' (NEVER 'Mbek' or 'Gimoro').
       - TO EAT: Use 'Ni camu' (NEVER 'Ni camo').
       - TO LOSE / GET LOST: Verbe = 'Ni rwinyo' (Perdre / se perdre) | Adjectif = 'Rwinyo' (Perdu) (STRICTEMENT AUTHENTIQUE MAHAGI ALUR - VALIDÉ UTILISATEUR). BAN 'Rwenyo' (forme Acholi).
       - BANNED WORDS: STRICTLY BAN 'nyalendo'! STRICTLY BAN 'jamu' and 'jami' (use 'piny' / 'piny mi ng'om' or 'gira'/'giragira')! STRICTLY BAN 'Kweno' (use 'Ni kwayu' for borrow; use 'Kani' for where)! STRICTLY BAN 'Jo'/'jo' and 'Ju'/'ju' for gens/people (use STRICTLY 'Dhanu' / 'dhanu')! STRICTLY BAN 'Nyoorere'/'Nyorere'/'Nyenru' (use STRICTLY 'Ni nyuthire' for se montrer/se faire voir)!
       - NO 'CH' SPELLING: Dhu Alur uses 'c' (NEVER 'ch'!). Use 'cido' (NEVER 'chido'), 'cwiny' (NEVER 'chwiny'), 'coko' (NEVER 'choko').
       - MES AMIS / NOS AMIS: Use STRICTLY 'Jurimba' (Mes amis) / 'Jurimbwa' (Nos amis) / 'Jarimba' (Mon ami). STRICTLY VALIDATED Dhu Alur forms (NEVER reject 'b' in jurimba/jurimbwa).
       - ETRE PRESENT: Use 'a tye' / 'i tye' / 'e tye' (NEVER 'a be tye' / 'i be tye').
       - PARDON: Use STRICTLY 'Kisa' (ex: "Kisa" = pardon; "Ni timo kisa" = pardonner; "Ni kwayu kisa" = demander pardon).
       - QUI (pronom relatif / interrogatif): Use STRICTLY 'Mu' (ex: "dhano mu bino" = la personne qui vient).
       - QUE (pronom relatif): Use STRICTLY 'Ma' (ex: "lembe ma i yero" = la parole que tu dis).
       - WHERE / OÙ: Use STRICTLY 'Kani' (NEVER 'Kweno' nor 'kene').
       - EMPRUNTER / BORROW: Use STRICTLY 'Ni kwayu' (NEVER 'kweno').
       - GENS / PEOPLE: Use STRICTLY 'Dhanu' or 'dhanu' (NEVER 'Jo' nor 'Ju').
       - SE MONTRE / SE FAIRE VOIR: Use STRICTLY 'Ni nyuthire' (NEVER 'nyoorere', 'nyorere', nor 'nyenru').
       - BIENS MATÉRIELS / CHOSES DU MONDE: In a spiritual / biblical context, use STRICTLY 'Piny mi ng'om' (NEVER 'jamu' nor 'jami').
       - TO RUN / COURIR: Use STRICTLY 'Ni ringo' (Infinitif) / 'ringo' (Action).
       - VALEUR (3 SENS DISTINCTS ACCORDÉS PAR L'UTILISATEUR):
         * Valeur en nombre, chiffres, quantité, verset, statistique = 'Wel' (ou 'well', ex: "wel mi nindo" = le nombre/la valeur des jours).
         * Valeur en comportement, habitudes, principes moraux, conduite de vie = 'Kura' ou 'Kura kwo' (ex: "kura mi kwo mandha" = les vraies valeurs morales de la vie).
         * Valeur en prix d'un objet, coût, valeur marchande = STRICTEMENT 'Bey' (ex: "bey mi piny" = le prix/la valeur marchande de la chose. INTERDIT: 'jamu', 'jami', 'be').
       - ADMINISTRATIVE & LEGAL VOCABULARY (TERMES ADMINISTRATIFS ET JUDICIAIRES DUU ALUR) :
         * Chef = 'Jatela'
         * Auditorat militaire = 'odi pido mi askari'
         * Militaire = 'askari'
         * Auditeur militaire de Garnison = 'jatela ma j\'askari mi odi pido mi Garnison'
         * Auditeur militaire Supérieur = 'Jatela ma j\'askari mi odi pido ma malu'
         * Auditorat Militaire Supérieur = 'odi pido mi ju askari ma malu'
         * Auditorat militaire de Garnison = 'odi pido mi ju askari mi Garnison'
         * Magistrat, juge, OPJ... = 'Jadith ma jang\'ol lembe'
         * Décision = 'lembamoka'
         * Résultat = 'adwogi'
         * Loi / Règle = 'cik'
         * Arme = 'Athum'
         * Garder (verbe) = 'Ni gwoko' (Nom / Gardiennage = 'gwok')
         * Chien = 'Gwok'
         * Date = 'nindo'
         * En date du 01 = 'i nindo mikwong\'o'
         * En date du 06 = 'i nindo abuciel'
         * En date du 30 = 'i nindo pyer adek'
         * Sixième jour = 'nindo mir\'abuciel'
         * 6 (Chiffre/Nombre) = 'Abuciel'
         * De / Du / De la (préposition générale) = 'mi'
         * De / Du / De la (possession / appartenance à une personne) = 'pa' (RÈGLE STRICTE: utilisez 'pa' SI ET SEULEMENT SI 'de' désigne quelqu'un ou quelque chose qui appartient à une personne, ex: "la maison de Pierre" = "ot pa Pierre". Pour tout autre lien général ou qualification, utilisez 'mi').
       - ABSOLUTE CORPUS CONSTRAINT (JW.ORG & BIBLE DHU ALUR - MAHAGI): Rely STRICTLY and EXCLUSIVELY on the authentic Dhu Alur vocabulary and grammar rules of Mahagi territory (Ituri, RDC) as published on JW.ORG and in the Bible in Dhu Alur. DO NOT invent or import external Acholi, Lango, or generic Luo words, nor words from external online platforms or dictionaries.
       - ACCURATE TRANSLATION & UNMAPPED WORDS DIRECTIVE: Translate concepts into authentic Dhu Alur of Mahagi territory (JW.ORG & Bible Alur standard). If a specialized technical, administrative, or modern term lacks an official Dhu Alur equivalent in the JW.ORG/Mahagi lexicon, preserve the original French/English word intact as intended, rather than inventing false translations or borrowing Acholi/Lwo words.
    3. PRONOUNS & VERBAL PREFIXES (EXACT USER GRAMMATICAL SPECIFICATION):
       - INDEPENDENT PRONOUNS (Pronoms autonomes / toniques: Moi, Toi, Lui/Elle, Nous, Vous, Eux/Elles):
         * Moi = 'An'
         * Toi = 'In'
         * Lui / Elle = 'En'
         * Nous = 'Wan'
         * Vous = 'Wun'
         * Eux / Elles = 'Gin'
       - RÈGLE OBLIGATOIRE DE CONJUGATION vs INFINITIF ('Ni' est SUPPRIMÉ lors de la conjugaison) :
         * L'INFINITIF SEUL utilise le préfixe 'Ni' (ex: 'Ni maru' = aimer, 'Ni camu' = manger, 'Ni cidho' = aller, 'Ni ringo' = courir).
         * DÈS QU'UN VERBE EST CONJUGUÉ (dans une phrase avec sujet ou temps), LE PRÉFIXE 'Ni' DISPARAÎT OBLIGATOIREMENT !
         * INTERDICTION ABSOLUE de laisser 'Ni' dans une phrase conjuguée (ex: JAMAIS "E ni camu", JAMAIS "A ni cidho").
         * EXEMPLES CORRECTS CONJUGUÉS :
           - "Il mange" -> "E camu" (Présent habituel - pas de 'Ni')
           - "Je suis en train de manger" -> "A be camu" (Présent continu - pas de 'Ni')
           - "Tu vas manger" -> "I bi camu" (Futur - pas de 'Ni')
           - "Ils ont mangé" -> "Gi camu" / "Gi daru camu" (Passé - pas de 'Ni')
       - HABITUAL PRESENT VERBAL PREFIXES (Présent habituel: Je, Tu, Il/Elle, Nous, Vous, Ils/Elles):
         * RÈGLE STRICTE SUR LA SÉPARATION SUJET ET VERBE (COMME EN FRANÇAIS): On ne relie PAS le sujet et le verbe. Le sujet et le verbe sont deux mots séparés par un espace, exactement comme en français ("Je mange" -> "A maru"). AUCUN trait d'union (-) et AUCUN collage du sujet au verbe (écrire 'A maru', 'I maru', 'E maru', 'Wa maru', 'Wu maru', 'Gi maru' - JAMAIS 'A-maru' ni 'Amaru').
         * Je (I) = 'A' (e.g., A maru = J'aime / A foyo = Je remercie)
         * Tu (You sg.) = 'I' (e.g., I maru = Tu aimes / I foyo = Tu remercies)
         * Il / Elle (He/She/It) = 'E' (e.g., E maru = Il/Elle aime / E foyo = Il/Elle remercie)
         * Nous (We) = 'Wa' (e.g., Wa maru = Nous aimons / Wa foyo = Nous remercions)
         * Vous (You pl.) = 'Wu' (e.g., Wu maru = Vous aimez / Wu foyo = Vous remerciez)
         * Ils / Elles (They) = 'Gi' (Au 3ème personne du pluriel, le sujet est STRICTEMENT 'Gi' et NON 'Gik', e.g., Gi maru = Ils/Elles aiment / Gi foyo = Ils/Elles remercient)
       - CONTINUOUS PRESENT PREFIXES (Présent en cours / progressif - ajouter 'be' après le sujet):
         * Je suis en train de / Je vais (I am... / I go...) = 'A be' / 'Abe' (e.g., A be cidho i Bunia / Abe cidho i Bunia = Je vais / je pars à Bunia)
         * Tu es en train de... = 'I be' / 'Ibe' (e.g., I be cidho = Tu vas / tu es en train d'aller)
         * Il / Elle est en train de... = 'E be' / 'Ebe' (e.g., E be cidho = Il/Elle va / est en train d'aller)
         * Nous sommes en train de... = 'Wa be' / 'Wabe' (e.g., Wa be cidho = Nous allons / sommes en train d'aller)
         * Vous êtes en train de... = 'Wu be' / 'Wube' (e.g., Wu be cidho = Vous allez / êtes en train d'aller)
         * Ils / Elles sont en train de... = 'Gi be' / 'Gibe' (e.g., Gi be cidho = Ils/Elles vont / sont en train d'aller)
       - FUTURE TENSE PREFIXES (Futur - ajouter 'bi' après le sujet):
         * Je (Futur / I will) = 'A bi' / 'Abi' (e.g., A bi izo iwi got urwo = Je monterai sur la montagne demain)
         * Tu (Futur / You will) = 'I bi' / 'Ibi' (e.g., I bi izo iwi got = Tu monteras sur la montagne)
         * Il / Elle (Futur / He/She will) = 'E bi' / 'Ebi' (e.g., E bi izo iwi got = Il/Elle montera sur la montagne)
         * Nous (Futur / We will) = 'Wa bi' / 'Wabi' (e.g., Wa bi izo iwi got = Nous monterons sur la montagne)
         * Vous (Futur / You pl. will) = 'Wu bi' / 'Wubi' (e.g., Wu bi izo iwi got = Vous monterez sur la montagne)
         * Ils / Elles (Futur / They will) = 'Gi bi' / 'Gibi' (e.g., Gi bi izo iwi got = Ils/Elles monteront sur la montagne)
         * Futur Accompli / Futur Antérieur ("J'aurai déjà fait" / "Je vais finir de..."):
           - Forme avec 'Dong' (déjà / désormais): "I Sawa meni, Nang'u Dong a camu" = À cette heure-ci, j'aurai déjà mangé.
           - Forme avec 'A bi Daru ni...' (Je vais achever/finir de...): "A bi Daru ni camu kan tek i bino" = Je vais finir de manger si et seulement si tu viens/seras là.
         * Futur Continu ("Je serai en train de..."): Se forme avec le sujet du futur + 'be' (provenant du verbe 'ni bedo') + verbe.
           Example: "A bi be nindo yo piny" = Je serai en train de dormir en bas.
       - GENERAL PAST TENSE & IMMEDIATE ASPECTS (Passé général, Passé immédiat "venir de" et Présentatif "voilà que"):
         * En général, le passé se conjugue avec les MÊMES pronoms sujets que le présent habituel (A, I, E, Wa, Wu, Gi) séparés du verbe par un espace.
         * La différence entre le présent et le passé est donnée par le contexte de la phrase, le sujet, ou les adverbes/mots temporels du passé (e.g., tin = aujourd'hui/passé récent, nyaworo = hier, cing'uca = avant-hier, con = autrefois, etc.).
           Example: "A cidho i Bunia nyaworo" = Je suis allé(e) à Bunia hier.
         * Passé immédiat ("venir juste de..."): S'exprime avec 'aye' + verbe + 'eni' (e.g., 'E aye tundo eni' = il vient juste d'arriver).
         * Présentatif / Immédiatité ("voilà que..."): S'exprime avec 'fwo' + verbe + 'eni' (e.g., 'Efwo tundo eni' / 'E fwo tundo eni' = voilà qu'il arrive / le voilà qui arrive).
          * Habitude Présente vs Habitude Passée:
            1. Habitude actuelle / permanente: Se forme avec le verbe au présent + la particule 'nja' (toujours / habituellement).
               Example: "A Cidho nja i somo sa 1 mi Kugweno" = Je vais toujours / habituellement à l'école à 7h du matin (Habitude actuelle).
            2. Habitude passée / révolue: Se forme avec 'Con' (autrefois) + 'A bed' (provenant de 'Ni bedo') + verbe conjugué.
               Example: "Con A bed a Cidho i somo Sawa 1 mi Kugweno" = Autrefois, j'avais l'habitude d'aller à l'école à 7h du matin (Habitude passée révolue).
          * Passé Accompli / Parfait ("Avoir déjà fait" / Action totalement terminée): Se forme avec l'auxiliaire/particule 'Daru' (du verbe 'Ni daru' = finir/achever) placé après le préfixe-sujet.
            Examples:
            - "A Daru camu" = J'ai déjà mangé (Action achevée/accomplie).
            - "A Daru pyelo / Gak" = J'ai déjà fait caca / chié.
          * Passé Continu / Imparfait ("J'étais en train de..."): Décrit une action continue/en cours dans le passé. Se forme avec 'A bedo' ou 'A bino' + verbe.
            Examples:
            - "A bedo nindo" / "A bino nindo" = J'étais en train de dormir.
            - "A bedo camo" / "A bino camo" = J'étais en train de manger.
          * Aspect Incompli / "Pas encore" ("Je n'ai pas encore..."): S'exprime avec la particule 'fodi' (ou 'fodi ... ngo').
            Examples:
            - Réponse directe à soi-même: "Fodi a camu ngo" = Je n'ai pas encore mangé.
            - Pour se désigner parmi une foule/groupe: "An" (Moi) ou "An re ma fodi a camu ngo" (C'est moi qui n'ai pas encore mangé).
       - IMPERATIVE MOOD (L'Impératif):
         * Impératif Singulier: La dernière voyelle du verbe change automatiquement en '-i' (e.g., 'cidho' -> 'cidhi' = va !). Si le verbe finit par une consonne, on ajoute aussi '-i'.
         * Exception Singulier (consonnes M, L ou R): Pour les verbes dont la dernière consonne est 'M', 'L' ou 'R', on supprime la dernière voyelle (sans ajouter le '-i').
         * Impératif Pluriel: On ajoute le préfixe 'Wu-' (ou 'wu') devant le verbe + la forme modifiée du singulier (e.g., 'Wu-cidhi' = allez !).
         * Action sur une personne ou un objet (Objet direct / Transitif ciblé en '-e'): La voyelle finale devient '-e' avec le sujet (e.g., 'I nege' = tu l'as tué / éteint; 'E nege' = il l'a tué / éteint; 'Gi nege' = ils l'ont tué / éteint; 'Wu gure' = crucifiez-le !).
         * Impératif négatif (Défense / Interdiction "Ne ... pas !"): Se forme avec 'Kud' (ou 'Kud i' au singulier / 'Kud wu' au pluriel) devant la forme impérative (e.g., 'Kud i cidhi' = ne va pas !; 'Kud wu cidhi' = n'allez pas !; 'Kud i nege' = ne le tue / n'éteins pas !).
       - MODAL VERBS & OBLIGATION (Verbes modaux, Pouvoir, Vouloir, Devoir):
         * Pouvoir (to be able / can) = 'Ni romo', 'Ni Copo'
         * Vouloir (to want) = 'Ni Mito'
         * Devoir / Obligation (must / should / have to) = 'Umaka', 'Ni Mito'
         * Expression de l'obligation / Devoir (Duty/Obligation context): On ajoute le préfixe 'u-' (ou 'U-') devant le verbe pour exprimer la nécessité / l'obligation.
           Example: "Umito i cam ketho inwang' kero" / "Umaka i cam ketho inwang' kero" = Tu dois manger pour avoir de la force.
       - CONDITIONAL MOOD (Le Conditionnel / Hypothèse "Si ... alors ..."):
         * Se forme avec la conjonction 'Kan' (Si / If) introduisant la condition, généralement suivie de 'ci' (alors / then) dans la proposition principale.
           Example 1 (avec 'Ni camo' = manger): "Kan icamu ci ibi nwang'u kero" = Si tu manges alors tu trouveras de la force.
           Example 2 (avec 'Ni ringo' = courir): "Kan iringo ci ibi tundo pio" = Si tu cours alors tu arriveras vite.
           Example 3 (avec 'Ni cidho' = aller): "Kan icidho ci ibi nwang'e" = Si tu vas alors tu le trouveras.
         * Conditionnel Passé / Irréel du passé ("Si j'avais su..." / "J'aurais fait..."):
           Examples:
           - "Kan Nang' ang'ey nang'u abino" = Si j'avais su, je serais venu.
           - "Meni nang'u a camu" = J'aurais mangé.
       - SUBJUNCTIVE MOOD (Le Subjonctif / Souhait, But, Condition "Afin que / Pour que / Que"):
         * Se forme avec la particule 'Ketho' (Afin que / Pour que / Que) devant la proposition.
           Example: "Ketho wa tundi i wang' sawa, nang' wa wotho piyo piyo" = Pour que nous arrivions à temps, nous devons marcher vite.
       - PASSIVE VOICE (La voix passive):
         * IMPERSONAL 'JU' & PASSIVE / REFLEXIVE ('Ju' / '-ere' / '-re'):
           - Pronom impersonnel 'Ju' (On = quand l'auteur de l'acte est inconnu): 'Ju nege' = on l'a tué (auteur inconnu).
           - Transitifs conjugués (Sujets connus): 'I nege' = tu l'as tué; 'E nege' = il/elle l'a tué; 'Gi nege' = ils l'ont tué.
           - Forme pronominale / réfléchie ('-ere' / '-re'): 'E negere' = il s'est tué / a été tué; 'E camere' = il s'est mangé; 'E deyere' = il s'est pendu; 'E miyere' = il s'est donné / s'est livré.
       - TEMPORAL EXPRESSIONS & TIME OF DAY (Expressions de temps & Moments de la journée):
         * Hier = 'Nyaworo'
         * Avant-hier = 'Cing\'uca'
         * Maintenant = 'Kawoni'
         * Aujourd'hui = 'tin'
         * Demain = 'Urwo'
         * Le matin = 'Kugweno'
         * Petit matin = 'du Kugweno'
         * Avant-midi = 'Nang\'u'
         * Midi = 'DyeCheng'
         * Après-midi = 'wangRetho'
         * Le soir = 'Retho'
         * La nuit = 'Utyeno'
         * De 23h passé jusqu'à 2h passé (Profonde nuit) = 'Dyewor'
         * De 3h à 5h passé (Petit matin / Aube) = 'Mombwa'
       - INFINITIVE VERBS & DERIVED NOUNS (Infinitif avec préfixe 'Ni' & Noms associés):
         * Parler / Discours (to speak) = 'Ni weco' (Nom / Parole / Parole parlée = 'wec')
         * Mourir / La mort (to die) = 'Ni tho' (Nom / La mort = 'tho')
         * Tuer / Éteindre (to kill / to turn off/extinguish) = 'Ni Nego'
         * Refuser (to refuse / reject) = 'Ni kwero'
         * Accepter (to accept) = 'Ni yiyo'
         * Allumer (feu/lumière) = 'Ni lyelo'
         * Apprendre / Lire (to read/learn) = 'Ni somo'
         * Apprendre / Enseigner à qq'un = STRICTELY 'Ni ponjo' (JAMAIS 'Ni pwonjo')
         * Arriver = 'Ni tundo' ou 'Ni bino'
         * S'arrêter / Se tenir debout = STRICTELY 'Ni cungo' (JAMAIS 'Ni cung\'u')
         * Arrêter (qq'un ou qqch) = 'Ni chero'
         * Balayer / Essuyer (les larmes) = 'Ni weyo'
         * Bâtir / Construire = 'Ni gyero'
         * Brûler = 'Ni wang\'u'
         * Casser = 'Ni turo'
         * Briser = 'Ni ng\'enyo'
         * Chercher = 'Ni yenyo' ou 'Ni sayu'
         * Couper = 'Ni tong\'o'
         * Pleurer (to cry) = 'Ni ywak' (JAMAIS 'ni kwoyo')
         * Coudre (to sew) = 'Ni kwoyo'
         * Courir (to run) = 'Ni ringo'
         * Aller (to go) = 'Ni cidho'
         * Manger (to eat) = 'Ni camu' (STRICTEMENT 'Ni camu', JAMAIS 'Ni camo'. Nom / Nourriture = 'Cam')
         * Boire (to drink) = 'Ni madho'
         * Rester / Être / Avoir l'habitude (to stay / to be / habit) = 'Ni bedo' (Forme conjuguée de l'habitude = 'A bed')
       - RÈGLE DE CONTRACTION ET ÉLISION VOCALIQUE (Deux voyelles qui se suivent):
         * Quand deux voyelles se rencontrent (ex: la particule 'ma' + le pronom/préfixe 'u' -> 'ma u' dans 'ng'a ma u bino'), la première voyelle ('a') subit une élision avec apostrophe ou est supprimée, donnant 'ng'a m'u bino' ou 'ng'a mu bino' (c'est qui qui est venu / qui est venu).
       - QUESTION WORDS & INTERROGATIVES (Mots interrogatifs):
         * Où (Where) = STRICTEMENT 'Kani' (JAMAIS 'kene'). Ex: "Icidho kani?" (Où vas-tu ?), "Itye kani?" (Où es-tu ?).
         * Comment (How) = STRICTEMENT 'Nedi' ou 'Nenedi' (JAMAIS 'ndi'). Ex: "Itye nenedi?" ou "Itye nedi?" (Comment vas-tu ?).
         * Qui (Who) = 'Ng\'a' / 'Ng\'ani'
         * Quoi / Que (What) = 'Ang\'o' (ex: "Lembang'o?")
       - NEGATION & PARTICLES (Règle générale de la Négation en Dhu Alur):
         * Règle Générale pour tous les temps et modes déclaratifs (Présent, Passé, Futur, Conditionnel, Incompli, etc.):
           - On n'utilise JAMAIS 'Ungo' entier pour négativer un verbe conjugué.
           - On tronque la voyelle initiale 'U' et on place la particule 'ngo' immédiatement APRÈS le verbe (ou après la forme verbale principale).
           Examples à tous les temps:
           - Présent: "A camu ngo" = Je ne mange pas.
           - Présent continu: "Abe camu ngo" = Je ne suis pas en train de manger.
           - Futur: "Abi camu ngo" = Je ne mangerai pas / Je ne vais pas manger.
           - Passé: "A camu ngo nyaworo" = Je n'ai pas mangé hier.
           - Incompli ("Pas encore"): "Fodi a camu ngo" = Je n'ai pas encore mangé.
           - Conditionnel: "Kan icamu ngo..." = Si tu ne manges pas...
         * Exception - Impératif négatif / Interdiction / Défense ("Ne ... pas !"):
           - Ne pas utiliser 'ngo', mais la particule pré-verbale 'Kud' (ou 'Kud i' au singulier / 'Kud wu' au pluriel) placée DEVANT le verbe à l'impératif.
           Examples:
           - "Kud i cidhi" = Ne va pas !
           - "Kud wu cidhi" = N'allez pas !
           - "Kud i nege" = Ne le tue pas ! / Ne l'éteins pas !
         * Non / Pas du tout (Réponse autonome / Standalone): 'Ungo' (e.g., Ungo = Non / Pas du tout).
       - KINSHIP POSSESSIVES (Possessifs et Termes de Parenté - Mère, Père, Grand-père, Grand-mère, Fils, Fille):
         * MÈRE (Mother):
           - Ma mère = "min mira"
           - Ta mère = "Meru"
           - Sa mère = "Min"
           - Notre mère = "megwa"
           - Votre mère = "megu"
           - Leur mère = "megi"
         * PÈRE (Father):
           - Mon père = "wora"
           - Ton père = "wuru"
           - Son père = "won"
           - Notre père = "wegwa"
           - Votre père = "wegu"
           - Leur père = "wegi"
         * GRAND-PÈRE (Grandfather):
           - Mon grand-père = "Kwara"
           - Ton grand-père = "kwaru"
           - Son grand-père = "kwaru mire"
           - Notre grand-père = "kwaru wa"
           - Votre grand-père = "kwaru wu"
           - Leur grand-père = "kwaru gi"
          * GRAND-MÈRE (Grandmother - "Wang'u"):
            - Ma grand-mère = "Wang'u mira"
            - Ta grand-mère = "Wang'u miri"
            - Sa grand-mère = "Wang'u mire"
            - Notre grand-mère = "Wang'u wa"
            - Votre grand-mère = "Wang'u wu"
            - Leur grand-mère = "Wang'u gi"
          * TANTE MATERNELLE (Maternal Aunt - "Nyamin" + terme possessif de la mère):
            - Tante maternelle = "Nyamin Ma"
            - Ma tante maternelle = "Nyamin Ma"
            - Ta tante maternelle = "Nyamin Méru"
            - Sa tante maternelle = "Nyamin min"
            - Notre tante maternelle = "Nyamin megwa"
            - Votre tante maternelle = "Nyamin megu"
            - Leur tante maternelle = "Nyamin megi"
         * FILS (Son):
           - Mon fils = "woda"
           - Ton fils = "wodi"
           - Son fils = "wode"
           - Notre fils = "Wodwa"
           - Votre fils = "wodwu"
           - Leur fils = "wodgi"
         * FILLE (Daughter):
           - Ma fille = "nyara"
           - Ta fille = "nyeri"
           - Sa fille = "nyare"
           - Notre fille = "nyarwa"
           - Votre fille = "nyarwu"
           - Leur fille = "nyargi"
          * TANTE PATERNELLE (Paternal Aunt - sens collectif "Wayu"):
            - Tante paternelle (sens collectif) = "Wayu"
            - Ma tante paternelle = "Waya"
            - Ta tante paternelle = "Wayu"
            - Sa tante paternelle = "Wayu mire"
            - Notre tante paternelle = "Wayu wa"
            - Votre tante paternelle = "Wayu wu"
            - Leur tante paternelle = "Wayu gi"
          * ONCLE MATERNEL (Maternal Uncle - "Nero"):
            - Oncle maternel = "Nero"
            - Mon oncle maternel = "Nera"
            - Ton oncle maternel = "Neru"
            - Son oncle maternel = "Neru mire"
            - Notre oncle maternel = "Nero wa"
            - Votre oncle maternel = "Nero wu"
            - Leur oncle maternel = "Nero gi"
          * FRÈRES DANS LE SENS COLLECTIF (Brothers - "Umego"):
            - Mon frère = "Umira"
            - Ton frère = "Umeru"
            - Son frère = "Umin"
            - Notre frère = "Umegwa"
            - Votre frère = "Umegu"
            - Leur frère = "Umegi"
          * PETIT-FILS / PETITE-FILLE (Grandchild - sens collectif "Nya Kwar"):
            - Petit-fils (sens collectif) = "Nya Kwar"
            - Mon petit-fils = "Nya Kwara"
            - Ton petit-fils = "Nya kweri"
            - Son petit-fils = "Nya kware"
            - Notre petit-fils = "Nya kwaru wa"
            - Votre petit-fils = "Nya kwaru wu"
            - Leur petit-fils = "Nya kwaru gi"
          * RÈGLE GÉNÉRALE DU PRÉFIXE FÉMININ ("Nya" vs "Nyar") :
            - DEVANT CONSONNE : On utilise "Nya" devant un mot commençant par une consonne (ex: Nya Mahagi, Nya Kwar).
            - DEVANT VOYELLE : Si et seulement si le mot qui suit commence par une voyelle, on ajoute un 'r' et on utilise "Nyar" (ex: Nyar Ukelo, Nyar Upio, Nyar Umira).
          * NEVEUX ET NIÈCES (Nephews & Nieces - "Wod" / "Nya" ou "Nyar" + terme du frère/sœur):
            - Wod Umira = "Fils de mon frère" (Mon neveu)
            - Nyar Umira = "Fille de mon frère" (Ma nièce - "Nyar" car "Umira" commence par la voyelle U)
            - (Règle : "Wod" pour le fils et "Nyar" pour la fille devant voyelle, "Nya" devant consonne, ex: Wod Umeru, Nyar Umeru, Nyar Umin, Nya Mahagi).
          * COUSINS (Male Cousins - "Umaru"):
            - Cousin (masculin / collectif) = "Umaru"
            - Mon cousin = "Umara"
            - Ton cousin = "Umaru"
            - Son cousin = "Maru mire"
            - Notre cousin = "Umaru wa"
            - Votre cousin = "Umaru wu"
            - Leur cousin = "Umaru gi"
          * COUSINES (Female Cousins - "Nyamaru"):
            - Cousine (féminin - remplacement du 'U' initial de 'Umaru' par 'Nya') = "Nyamaru"
            - Ma cousine = "Nyamara"
            - Ta cousine = "Nyamaru"
            - Sa cousine = "Nya maru mire"
            - Notre cousine = "Nyamaru wa"
            - Votre cousine = "Nyamaru wu"
            - Leur cousine = "Nyamaru gi"
          * AMIS ET RELATIONS SOCIALES (Friend - "Jarimo" / "Nyarimo", Pluriel - "Jurimo"):
            - Un ami (masculin / général) = "Jarimo"
            - Mon ami = "Jarimba" ou "Jarimo na"
            - Ton ami = "Jarimbi" ou "Jarimo ni"
            - Son ami = "Jarimbe" ou "Jarimo ne"
            - Notre ami = "Jarimbwa" ou "Jarimo wa"
            - Votre ami = "Jarimbwu" ou "Jarimo wu"
            - Leur ami = "Jarimgi" ou "Jarimo gi"
            - Une amie (féminin - remplacement du préfixe 'Ja' par 'Nya') = "Nyarimo"
            - Ma copine / amie = "Nyarimba" ou "Nyarimo na"
            - Ta copine / amie = "Nyarimbi" ou "Nyarimo ni"
            - Sa copine / amie = "Nyarimbe" ou "Nyarimo ne"
            - Notre copine / amie = "Nyarimbwa" ou "Nyarimo wa"
            - Votre copine / amie = "Nyarimbwu" ou "Nyarimo wu"
            - Leur copine / amie = "Nyarimgi" ou "Nyarimo gi"
            - Des amis (Pluriel) = "Jurimo"
            - Mes amis = "Jurimo para" ou "Jurimba"
            - Tes amis = "Jurimo peri" ou "Jurimbi"
            - Ses amis = "Jurimo pare" ou "Jurimbe"
            - Nos amis = "Jurimo mwa" ou "Jurimbwa"
            - Vos amis = "Jurimo mu" ou "Jurimbu"
            - Leurs amis = "Jurimo migi" ou "Jurimb gi"
          * ENNEMI (Enemy - "Jadegi" / "Nyadegi", Pluriel - "Judegi"):
            - Un ennemi (masculin / général) = "Jadegi"
            - Mon ennemi = "Jadegi na"
            - Ton ennemi = "Jadegi ni"
            - Son ennemi = "Jadegi pare"
            - Notre ennemi = "Jadegi mwa"
            - Votre ennemi = "Jadegi mu"
            - Leur ennemi = "Jadegi migi"
            - Une ennemie (féminin - remplacement du préfixe 'Ja' par 'Nya') = "Nyadegi"
            - Mon ennemie = "Nyadegi na"
            - Ton ennemie = "Nyadegi ni"
            - Sa ennemie = "Nyadegi pare"
            - Notre ennemie = "Nyadegi mwa"
            - Votre ennemie = "Nyadegi mu"
            - Leur ennemie = "Nyadegi migi"
            - Des ennemis (Pluriel) = "Judegi"
            - Mes ennemis = "Judegi para" ou "Judegi na"
            - Tes ennemis = "Judegi peri" ou "Judegi ni"
            - Ses ennemis = "Judegi pare"
            - Nos ennemis = "Judegi mwa"
            - Vos ennemis = "Judegi mu"
            - Leurs ennemis = "Judegi migi"
          * DEMONSTRATIFS (Demonstratives - Ce, Cette, Cet, Ceci, Cela, Ces, Ceux-ci, Ceux-là) :
            - PROCHE (Ceci / Ce, Cette, Cet) :
              * Singulier : "Mae" ou "Maeni"
              * Pluriel (ajouter 'gi') : "Maegi" ou "Maenigi" (Ceux-ci / Ces ...-ci)
            - ÉLOIGNÉ (Cela / Ce... là, Cette... là) :
              * Singulier : "Macha" ou "Maecha"
              * Pluriel (ajouter 'gi') : "Machagi" ou "Maechagi" (Ceux-là / Ces ...-là)
          * VOCABULAIRE AUTHENTIQUE ENRICHI (Armes, Objets, Animaux, Lieux, Adverbes, Expressions bibliques/territoriales) :
            - Avec / Et = "Kud" (devient "Ku" dans certains contextes, ex: "Ku ng'ati moko" = avec quelqu'un; "Ku ng'ati macha" = avec cette personne-là; "kud awiya ca zoo" = avec tous ces enfants; "ley Ku lajwer" = la hache et la machette/coupe-coupe)
            - Exact = "Tap"
            - Comme ceci / De cette façon-ci = "Kumeni"
            - Comme cela / De cette façon-là = "Kumeno" (ex: "Kumeno tap" = Exactement comme ça)
            - Comme cela là-bas / De cette façon là-bas = "Kumeca"
            - Comme / De même que = "Calu"
            - Famille / Foyer = "Juruot" (ex: "Ot peri" = ta maison/foyer)
            - Vraie vie / Vie authentique = "Kwo mandhandha"
            - La vérité = "Lemandha"
            - Mensonge = "Vupo"
            - Injustice / Tordu / Impartialité = "Gondri"
            - Colère / Sentiment rapide = "Ng'ecwiny" / "Kwiny" (ex: "Kwiny akwinya" = très colérique)
            - Spiritisme / Sorcellerie = "Ajoga" / "Pajogi" / "Thangu"
            - Plateau = "Atangla"
            - Arme = "Atum"
            - Guerre = "Lwiny" ou "Mony"
            - Couvrir (Verbe) = "Ni umo"
            - Huile = "Moo"
            - Moustique = "Uber"
            - Chien = "Gwok"
            - Chat = "Kajangu"
            - Chambre = "Kusika"
            - Lune = "Dwi"
            - Le balai = "Uwich"
            - Les poignets = "Ngudhi"
          * POSSESSIFS ANATOMIQUES DIRECTS & CORPS HUMAIN (Kum dhanu / Kum jo) :
            - CORPS HUMAIN = "Kum dhanu" ou "Kum jo"
            1. RÈGLE GÉNÉRALE (Suffixes sujets directs : -a [mon], -i [ton], -e [son], -wa [notre], -u [votre], -gi [leur]) :
               * Dents = "Lak" -> "Laka" (mes dents), "Laki", "Lake", "Lakwa", "Laku", "Lakgi".
               * Joues = "Limb" -> "Limba", "Limbi", "Limbe", "Limbwa", "Limbu", "Limbgi".
               * Poitrine = "Kor" -> "Kora", "Kori", "Kore", "Korwa", "Koru", "Korgi".
               * Foie = "Cwiny" -> "Cwinya", "Cwinyi", "Cwinye", "Cwinywa", "Cwinyu", "Cwinygi".
               * Aisselles = "Teyoth" -> "Teyotha", "Teyothi", "Teyothe", "Teyothwa", "Teyothu", "Teyothgi".
               * Genou(x) = "Chong" -> "Chonga" (mon genou), "Chongi", "Chonge", "Chongwa", "Chongu", "Chonggi".
               * Ongle(s) = "Lweth" -> "Lwetha" (mes ongles), "Lwethi", "Lwethe", "Lwethwa", "Lwethu", "Lwethgi".
               * Fesses = "Adige" -> "Adiga", "Adigi", "Adige", "Adigwa", "Adigu", "Adiggi".
               * Nez = "Um" -> "Uma", "Umi", "Ume", "Umwa", "Umu", "Umgi".
               * Langue = "Leb" -> "Leba", "Lebi", "Lebe", "Lebwa", "Lebu", "Lebgi".
               * Épaule = "Gok" -> "Goka", "Goki", "Goke", "Gokwa", "Goku", "Gokgi".
               * Cou = "Ng'ut" -> "Ng'uta", "Ng'uti", "Ng'ute", "Ng'utwa", "Ng'utu", "Ng'utgi".
               * Oreille = "It" -> "Ita", "Iti", "Ite", "Itwa", "Itu", "Itgi".
               * Pénis = "Chund" -> "Chunda", "Chundi", "Chunde", "Chundwa", "Chundu", "Chundgi".
               * Main = "Ching" -> "Chinga", "Chingi", "Chinge", "Chingwa", "Chingu", "Chinggi".
               * Front = "Nyim" -> "Nyima", "Nyimi", "Nyime", "Nyimwa", "Nyimu", "Nyimgi".
               * Testicules = "Mand" -> "Manda", "Mandi", "Mande", "Mandwa", "Mandu", "Mandgi".
               * Bouche = "Dog" -> "Doga", "Dogi", "Doge", "Dogwa", "Dogu", "Doggi".
               * Barbe = "Yirtik" -> "Yirtika", "Yirtiki", "Yirtike", "Yirtikwa", "Yirtiku", "Yirtikgi".
               * Côte = "Ng'et" -> "Ng'eta", "Ng'eti", "Ng'ete", "Ng'etwa", "Ng'etu", "Ng'etgi".
               * Menton = "Tik" -> "Tika" (mon menton), "Tiki", "Tike", "Tikwa", "Tiku", "Tikgi".
               * Hanches = "Pier" -> "Piera", "Pieri", "Piere", "Pierwa", "Pieru", "Piergi".
               * Morve = "Pii um" -> "Pii uma", "Pii umi", "Pii ume", "Pii umwa", "Pii umu", "Pii umgi".
               * Chaleur / Fièvre = "Lyeto"
               * Être excité = "Ni tyelo"
               * Composés du visage/membres :
                 - Lèvres = "Dend dog"
                 - Moustache = "Yir dog"
                 - Sourcils = "Yir wang'"
                 - Paupière = "Bind wang'"
                 - Boule de l'œil / Bille d'œil = "Tong wang'"
                 - Larme(s) = "Pii wang'" (s'approprie selon la règle de "wang'")
                 - Doigts = "Lweth ching"
                 - Orteils = "Lweth tyelo"
                 - Paume de la main = "Dye ching"
                 - Plante du pied = "Dye tyelo"
                 - Talon = "Tok tyelo"
                 - Mollet = "Kor tyelo" (s'approprie selon la règle de "tyelo" -> "Kor tyenda", "Kor tyendi", "Kor tyende", "Kor tyendwa", "Kor tyendu", "Kor tyendgi")
            2. RÈGLE AVEC PRONOM POSSESSIF SÉPARÉ (na/para [mon], ni/peri [ton], pare [son], wa/mwa [notre], wu/mu [votre], gi/migi [leur]) :
               * Seins = "Tuno" -> "Tuno na" (mon sein/mes seins), "Tuno ni", "Tuno pare", "Tuno wa", "Tuno wu", "Tuno gi".
               * Cœur (Organe) = "Adunde" -> "Adunde na" (mon cœur), "Adunde ni", "Adunde pare", "Adunde wa", "Adunde wu", "Adunde gi".
               * Poumons = "Umbo" -> "Umbo na", "Umbo ni", "Umbo pare", "Umbo wa", "Umbo wu", "Umbo gi".
               * Coude = "Utwenge" -> "Utwenge na", "Utwenge ni", "Utwenge pare", "Utwenge wa", "Utwenge wu", "Utwenge gi".
               * Os = "Chogo" -> "Chogo na", "Chogo ni", "Chogo pare", "Chogo wa", "Chogo wu", "Chogo gi".
               * Sang = "Rimo" -> "Rimo na", "Rimo ni", "Rimo pare", "Rimo wa", "Rimo wu", "Rimo gi".
               * Chair / Muscle = "Ringo" -> "Ringo na", "Ringo ni", "Ringo pare", "Ringo wa", "Ringo wu", "Ringo gi".
               * Anus = "Odi chet" -> "Odi chet para" (mon anus), "Odi chet peri", "Odi chet pare", "Odi chet mwa", "Odi chet mu", "Odi chet migi".
               * Excréments / Caca = "Chet" -> "Chet para", "Chet peri", "Chet pare", "Chet mwa", "Chet mu", "Chet migi".
               * Salive = "Law" -> "Law para", "Law peri", "Law pare", "Law mwa", "Law mu", "Law migi".
               * Urine = "Lach" -> "Lach para", "Lach peri", "Lach pare", "Lach mwa", "Lach mu", "Lach migi".
               * Plaie = "Rem" -> "Rem para", "Rem peri", "Rem pare", "Rem mwa", "Rem mu", "Rem migi".
               * Poils = "Yir" -> "Yir para", "Yir peri", "Yir pare", "Yir mwa", "Yir mu", "Yir migi".
               * Nombril = "Pel" -> "Penda" (mon nombril), "Pendi" (ton nombril), "Pende" (son nombril), "Pendwa" (notre nombril), "Pendu" (votre nombril), "Pendgi" (leur nombril) [Même règle que Tyelo/Pied : le 'l' ou 'lo' se transforme en 'nd' + suffixe].
            3. RÈGLE SPÉCIALE POUR LE LAIT ("Chak") :
               * Le 'k' se transforme en 'g' + suffixe sujet, et la voyelle devient 'e' aux 2èmes personnes (-i et -u) : "Chaga" (mon lait), "Chegi" (ton lait), "Chage" (son lait), "Chagwa" (notre lait), "Chegu" (votre lait), "Chaggi" (leur lait).
            4. RÈGLE SPÉCIALE POUR LA PEAU ("Del") :
               * Le 'l' se transforme en 'nd' + forme de corps/sujet : "kuma" (ma peau), "kumi" (ta peau), "kume" (sa peau), "kumwa" (notre peau), "kumu" (votre peau), "kumgi" (leur peau).
            5. RÈGLE DES MOTS SE TERMINANT EN "LO" (ex: Pied = "Tyelo") :
               * "lo" se transforme en "nd" + suffixe sujet -> "Tyenda" (mon pied), "Tyendi" (ton pied), "Tyende" (son pied), "Tyendwa" (notre pied), "Tyendu" (votre pied), "Tyendgi" (leur pied).
            6. RÈGLE DE CHANGEMENT DE VOYELLE EN 'E' AUX 2ÈMES PERSONNES -i ET -u (œil "Wang'", vagin "Nyar", jambe "Bamb") :
               * Œil / Yeux = "Wang'" -> "Wang'a" (mon œil), "Weng'i" (ton œil), "Wang'e" (son œil), "Wang'wa" (notre œil), "Weng'u" (votre œil), "Wang'gi" (leur œil).
               * TOUT MOT OU COMPOSÉ SE TERMINANT PAR "WANG'" (Sourcils "Yir wang'", Paupière "Bind wang'", Bille d'œil "Tong wang'", etc.) : la règle de "wang'" s'applique exactement sur la partie "wang'" -> ex: "Yir wang'a" (mes sourcils), "Yir weng'i" (tes sourcils), "Yir wang'e", "Yir wang'wa", "Yir weng'u", "Yir wang'gi".
               * Vagin = "Nyar" -> "Nyara" (mon vagin), "Nyeri" (ton vagin), "Nyare" (son vagin), "Nyarwa" (notre vagin), "Nyeru" (votre vagin), "Nyargi" (leur vagin).
               * Jambe = "Bamb" -> "Bamba" (ma jambe), "Bembi" (ta jambe), "Bambe" (sa jambe), "Bambwa" (notre jambe), "Bembu" (votre jambe), "Bambgi" (leur jambe).
            7. RÈGLE DES MOTS SE TERMINANT EN "CH" (Tête "Wich", Ventre "Ich", Dos "Ng'ech", Cheveux "Yukwich") :
               * Au singulier (mon/ton/son) : le 'ch' se transforme en 'y' + suffixe (-a, -i, -e) :
                 - Tête ("Wich") : "Wiya" (ma tête), "Wiyi" (ta tête), "Wiye" (sa tête).
                 - Ventre ("Ich") : "Iya" (mon ventre), "Iyi" (ton ventre), "Iye" (son ventre).
                 - Dos ("Ng'ech") : "Ng'eya" (mon dos), "Ng'eyi" (ton dos), "Ng'eye" (son dos).
                 - Cheveux ("Yukwich") : "Yukwiya" (mes cheveux), "Yukwiyi" (tes cheveux), "Yukwiye" (ses cheveux).
               * Au pluriel (notre/votre/leur) : on supprime 'ch' + suffixe (-wa, -u, -gi) :
                 - Tête ("Wich") : "Wiwa" (nos têtes), "Wiu" (vos têtes), "Wigi" (leurs têtes).
                 - Ventre ("Ich") : "Iwa" (nos ventres), "Iu" (vos ventres), "Igi" (leurs ventres).
                 - Dos ("Ng'ech") : "Ng'ewa" (nos dos), "Ng'eu" (vos dos), "Ng'egi" (leurs dos).
                 - Cheveux ("Yukwich") : "Yukwiwa" (nos cheveux), "Yukwiu" (vos cheveux), "Yukwigi" (leurs cheveux).
          * NOMBRES ET COMPTE EXACT DE 0 À 20 (Dhu Alur authentique du territoire de Mahagi, RDC) :
            - 0 = Zéro (ou Mbe / Umbe)
            - 1 = Acel
            - 2 = Aryo (ou Ario)
            - 3 = Adek
            - 4 = Ang'wen
            - 5 = Abic (ou Abich)
            - 6 = Abuciel
            - 7 = Abiro (ou Abiryo)
            - 8 = Abora (ou Aboro)
            - 9 = Abung'wen
            - 10 = Apar
            - 11 = Apar acel
            - 12 = Apar aryo
            - 13 = Apar adek
            - 14 = Apar ang'wen
            - 15 = Apar abic
            - 16 = Apar abuciel
            - 17 = Apar abiro
            - 18 = Apar abora
            - 19 = Apar abung'wen
            - 20 = Pyer aryo (ou Pyer ario)
            - Pour les dizaines et nombres composés : les dizaines se forment avec "Pyer" (20 = Pyer aryo / Pyer ario, 30 = Pyer adek, 40 = Pyer ang'wen, 50 = Pyer abic, 60 = Pyer abuciel, 70 = Pyer abiro, 80 = Pyer abora, 90 = Pyer abung'wen).
            - RÈGLE DU CONNECTEUR "wi" ENTRE DIZAINE ET UNITÉ : On ajoute impérativement "wi" entre la dizaine (Pyer...) et l'unité.
              Exemples :
              * 21 = Pyer aryo wi acel
              * 35 = Pyer adek wi abic
              * 59 = Pyer abic wi abung'wen
              * 95 = Pyer abung'wen wi abic
            - 100 = Dak acel
            - RÈGLE PHONÉTIQUE DU CONNECTEUR "kud" / "ku" :
              * Le connecteur "kud" devient "ku" devant une consonne (ex : "ku nyinge...", "ku pyer...").
              * On conserve "kud" devant une voyelle (ex : "kud acel", "kud apar").
            - RÈGLE POUR LES CENTAINES (100 et +) :
              * 100 = Dak acel
              * 101 à 119 : "Dak kud ..." ou "Dak acel kud ..." + unité/nombre (ex : 101 = Dak kud acel ou Dak acel kud acel, 110 = Dak kud apar, 119 = Dak kud apar abung'wen)
              * 120 = Dak pyer aryo
              * 121 = Dak pyer aryo wi acel
              * 199 = Dak pyer abung'wen wi abung'wen
              * 200 = Dak aryo
              * 201 = Dak aryo kud acel (ou Dak aryo wi acel)
              * 219 = Dak aryo kud apar abung'wen
              * 300 = Dak adek (et ainsi de suite)
              * 900 = Dak abung'wen
              * 999 = Dak abung'wen pyer abung'wen wi abung'wen
            - RÈGLE DES DEUX VOYELLES SUIVANTES (ÉLISION / ABSORPTION EN ALUR) :
              * En Alur, si deux voyelles se suivent, la seconde voyelle prime sur la précédente dans la prononciation et l'écriture.
              * Exemple avec "Elufu" + voyelle : Le "u" final s'efface devant la voyelle suivante (ex: Elufu + acel = Eluf-acel, Elufu + aryo = Eluf-aryo, Elufu + apar = Eluf-apar).
              * Devant une consonne, "Elufu" conserve sa forme normale (ex: 90000 = Elufu pyer abung'wen).
            - RÈGLE POUR LES MILLIERS (1000 et +) :
              * 1000 = Elufu (ou Eluf-acel)
              * 2000 = Eluf-aryo
              * 11000 = Eluf-apar acel
              * 2001 = Eluf-aryo ku nyinge acel (ou Eluf-aryo kud acel)
              * 90000 = Elufu pyer abung'wen
              * Et ainsi de suite selon la même logique de composition.
            - RÈGLE POUR LES MILLIONS (1 000 000 et +) :
              * 1000000 = Million acel
              * 1111111 = Million acel kud elufu dak kud apar acel ku nying dak kud apar acel
              * Et ainsi de suite selon la même logique de composition (avec le connecteur "kud" / "ku" selon voyelle/consonne).
          * ADJECTIFS NUMÉRAUX ORDINAUX (Ordinal numbers - rang et ordre):
            - Premier / Première = Mikwong'o
            - RÈGLE DE FORMATION DES ORDINAUX :
              * On prend le nombre cardinal et on lui ajoute un préfixe :
              * **mir** devant un nombre qui commence par une VOYELLE (ex: mir acel, mir aryo, mir adek, mir ang'wen, mir abic, mir apar, mir elufu...).
              * **mi** devant un nombre qui commence par une CONSONNE (ex: mi pyer abung'wen, mi dak acel, mi million acel...).
            - Exemples :
              * Premier = Mikwong'o
              * Deuxième = mir aryo (ou Mukar'o)
              * Troisième = mir adek (ou Mdek'o)
              * Quatrième = mir ang'wen (ou Mang'wen'o)
              * Cinquième = mir abic (ou Mbic'o)
              * Sixième = mir'abuciel (ou mir abuciel)
              * Septième = mir abiryo
              * Huitième = mir abiro-adek
              * Neuvième = mir abung'wen
              * Dixième = mir apar
              * Quatre-vingt-dixième = mi pyer abung'wen
              * Dernier / Dernière = Mogik (ou me tok)
           * DATES ET EXPRESSIONS TEMPORELLES (Dhu Alur authentique) :
             - En date du 01 = "i nindo mikwong'o"
             - En date du 06 = "i nindo abuciel"
             - En date du 30 = "i nindo pyer adek"
             - Sixième jour = "nindo mir'abuciel"
             - RÈGLE POUR "EN DATE DU [X]" = "i nindo [X]" (ex: "En date du 01" = "i nindo mikwong'o", "En date du 06" = "i nindo abuciel", "En date du 30" = "i nindo pyer adek").
    2. RELY EXCLUSIVELY ON THE USER-PROVIDED GRAMMATICAL SYSTEM (AUTHENTIC NATIVE TERRITORY ALUR):
        - The user-provided grammatical system and vocabulary represent authentic native Alur from their home territory and MUST serve as the supreme, uncompromised reference.
        - NEVER mix, override, or pollute these authentic native rules with external material, internet sources, or other dialectal variations gathered from other platforms or web dictionaries.
        - DYNAMIC ADAPTATION TO USER CORRECTIONS: Whenever the user corrects a rule, provides a nuance, gives an opposite rule, or specifies a native territorial refinement, IMMEDIATELY submit to, integrate, and apply their input as the supreme rule without hesitation or argument.
        - STRICT RULE ON SUBJECT AND VERB SEPARATION (COMME EN FRANÇAIS): On ne relie PAS le sujet et le verbe. Le sujet et le verbe sont deux mots séparés par un espace, exactement comme en français ("Je mange" -> "A maru"). AUCUN trait d'union (-) et AUCUN collage du sujet au verbe (écrire 'A maru', 'I maru', 'E maru', 'Wa maru', 'Wu maru', 'Gi maru' - JAMAIS 'A-maru' ni 'Amaru').
        - STRICT RULE ON 3RD PERSON PLURAL: The 3rd person plural subject pronoun is STRICTLY 'Gi' (e.g. 'Gi maru', 'Gi be cidho', 'Gi bi cidho'), NEVER 'Gik'.
        - STRICT RULE ON INFINITIVES: Verbs in the infinitive ALWAYS take the particle/prefix 'Ni' (like 'to' in English, e.g. 'Ni maru', 'Ni camo', 'Ni cidho') except for rare exceptions.
        - STRICT RULE ON INTERROGATIVES: 'Où' is STRICTLY 'Kani' (NEVER 'kene'). 'Comment' is STRICTLY 'Nedi' or 'Nenedi' (NEVER 'ndi'). 'Quoi / Que' is STRICTLY 'Ang\'o'. Example: 'Itye nenedi?' or 'Itye nedi?' (Comment vas-tu ?), 'Lembang\'o?' (Quoi de neuf ? - NEVER 'Kop ang\'o' which is Acholi).
        - STRICT RULE ON VERBS (PLEURER VS COUDRE): To cry / Pleurer = 'Ni ywak' (NEVER 'ni kwoyo'). To sew / Coudre = 'Ni kwoyo'.
        - STRICT RULE ON VOWEL CONTRACTION: When two vowels follow each other (e.g. 'ma' + 'u'), 'a' undergoes elision with apostrophe or is dropped (e.g. 'ng\'a ma u bino' -> 'ng\'a m\'u bino' or 'ng\'a mu bino').
        - STRICT RULE ON GRANDPARENTS & FAMILY: Grandfather is 'Kwaru' (e.g. 'Kwara', 'Kwaru mira'). Child = 'Nyatin', Children = 'Awiya' or 'Nyithindo'.
        - STRICT RULE ON ABSENCE & NEGATION: Absence / There is no = 'Umbe' or 'mbe' (STRICTLY NEVER 'mbek').
        - STRICT RULE ON SOMETHING & NOTHING: Something = 'Gin moko' (STRICTLY NEVER 'gimoro'). Nothing / Il n'y a rien = 'Gin moko mbe' or 'Gin moko umbe' (STRICTLY NEVER 'gimoro').
        - STRICT RULE ON EATING & FOOD: Verbe Manger = STRICTLY 'Ni camu' (NEVER 'Ni camo'). Nom (Nourriture / Repas) = 'Cam'.
        - STRICT RULE ON PRISON & HONORIFICS: Prison = 'Kol'. Monsieur / Homme de respect / Dignitaire = 'Jadith'. Confirmation / Exactement ça = 'Tap kumeno' (Tout à fait cela / Exactement ainsi). Tout compris (Tu) = "Kara man i nyang' zoo" (Singulier). Tout compris (Vous) = "Kara man wu nyang' zoo" (Pluriel).
        - STRICT RULE ON OPINION & POSSESSIVES: Avis / Opinion / Pensée = 'Paru'. Déclinaison de l'avis: Mon avis ('Paru para'), Ton avis ('Paru peri'), Son avis ('Paru pare'), Notre avis ('Paru mwa'), Votre avis ('Paru mu'), Leur avis ('Paru migi'), Avis d'une personne ('Paru pa [nom]', ex: 'Paru pa Joseph'). Possessifs: Mon/Ma/Mes = 'Para', Ton/Ta/Tes = 'Peri', Son/Sa/Ses = 'Pare', Notre/Nos = 'Mwa', Votre/Vos = 'Mu' (ou 'Mwu'), Leur/Leurs = 'Migi'.
        - STRICT RULE ON DEMONSTRATIVES: Ceci / Ce / Cette / Cet (Proche) = 'Mae' or 'Maeni' (Singulier), Pluriel (ajouter 'gi') = 'Maegi' or 'Maenigi'. Cela / Ce... là (Éloigné) = 'Macha' or 'Maecha' (Singulier), Pluriel (ajouter 'gi') = 'Machagi' or 'Maechagi'.
        - STRICT RULE ON VERBS (ACCEPTER, PORTER, HABILLER): Accepter = 'Ni yiyo', Porter (bagages/charges) = 'Ni yeyo', Porter (vêtements) = 'Ni kendo', Habiller / S'habiller = 'Ni ronyo'.
        - STRICT RULE ON VERBS (ALLUMER, APPRENDRE, ARRIVER, BRÛLER, CASSER, BRISER, CHERCHER, COUPER): Allumer (feu/lumière) = 'Ni lyelo', Apprendre / lire = 'Ni somo', Apprendre (Étudier / Enseigner à quelqu'un) = STRICTLY 'Ni ponjo' (NEVER 'Ni pwonjo'), Arriver = 'Ni tundo' ou 'Ni bino', Brûler = 'Ni wang\'u', Casser = 'Ni turo', Briser = 'Ni ng\'enyo', Chercher = 'Ni yenyo' ou 'Ni sayu', Couper = 'Ni tong\'o'.
        - STRICT RULE ON VERBS (S'ARRÊTER, ARRÊTER, BALAYER, BÂTIR): S'arrêter / Se tenir debout = STRICTLY 'Ni cungo' (NEVER 'Ni cung\'u'), Arrêter qq'un ou qqch = 'Ni chero', Balayer / Essuyer (les larmes) = 'Ni weyo', Bâtir / Construire = 'Ni gyero'.
        - STRICT RULE ON VERBS WITH NOUNS (DESSINER, CHASSER, POURSUIVRE, LAPIDER, DORMIR, SE RÉVEILLER, SAUTER, JOUER, RIRE, BOXER, GRANDIR, MURMURER, CRIER, CROQUER, ENTRER, SORTIR, VOMIR, CULTIVER, SE CACHER, DÉRACINER, ÉTRANGLER, REMPLACER, PLIER, EMBELLIR, LAVER, SE LAVER, TAPER, PLANTER, MONTER, DESCENDRE, VAINCRE): Dessiner = 'Ni Kubo' (Nom: Kub), Chasser = 'Ni ryemo' (Nom: ryem), Poursuivre = 'Ni lubo' (Nom: Lub), Lapider = 'Ni ng\'uro' (Nom: ng\'ur), Dormir = 'Ni nindo' (Nom: nindo), Se réveiller = 'Ni chew' (Nom: chew), Sauter = 'Ni pyei' (Nom: pyei), Jouer = 'Ni tugo' (Nom: Tugo), Rire = 'Ni ng\'yero' (Nom: ng\'yero), Boxer = 'Ni dhongo' (Nom: dhong), Grandir = 'Ni Dongo' (Nom: dongo), Murmurer = 'Ni ng\'ur' (Nom: ng\'ur), Crier = 'Ni kok' (Nom: kok), Croquer = 'Ni mwodo' (Nom: mwod), Entrer = 'Ni mondo' (Nom: mondo), Sortir = 'Ni wok' (Nom: wok), Vomir = 'Ni ng\'ok' (Nom: ng\'ok), Cultiver = 'Ni furo' (Nom: Fur), Se cacher = 'Ni pondo' (Nom: pondo), Déraciner = 'Ni dhoyo' (Nom: dhoy), Étrangler = 'Ni deyo' (Nom: dey), Remplacer = 'Ni wilo' (Nom: wil), Plier = 'Ni dholo' (Nom: dhol), Embellir = 'Ni Boyo' (Nom: Boy), Laver = 'Ni lwoko' (Nom: lwok), Se laver = 'Ni Djom' (Nom: Djom), Taper = 'Ni padhu' (Nom: padh), Planter = 'Ni pidho' (Nom: pidhi), Monter = 'Ni Idho' (Nom: Idho), Descendre = 'Ni loro' (Nom: lor), Vaincre = 'Ni loyo' (Nom/Subst: alochi).
        - STRICT RULE ON NEW AUTHENTIC MAHAGI VERBS & NOUNS (VALIDATED BY USER):
          * Penser / Réfléchir / Croire = 'Ni paru' (Nom: Pensée = 'Paru', Esprit = 'Tipo', Imagination = 'Maparu')
          * Savoir / Connaître = 'Ni ng\'eyo' (Nom: Savoir / Connaissance = 'Ng\'ech')
          * Oublier = 'Ni whil' (Nom: Oubli = 'Whil wich')
          * Se souvenir / Se rappeler = 'Ni poyi' (Nom: Souvenir / Rappel = 'Poyi')
          * Rêver = 'Ni leko' (Nom: Rêve = 'Lek')
          * Demander / Questionner = 'Ni penjo' (Nom: Question / Demande = 'Penji')
          * Répondre = 'Ni dwoko wang\'' (Nom: Réponse = 'Dwok')
          * Expliquer / Raconter = 'Ni koro' (Nom: Explication = 'Koro i lembe')
          * Promettre = 'Ni ciko' (Nom: Promesse = 'Macikara')
          * Mentir = 'Ni wondo' (Nom: Mensonge = 'Awonde' / 'Vupo' / 'Ndraa')
          * Conseiller = 'Japonjo' (Nom: Conseil = 'Ponji')
          * Prendre / Attraper = 'Ni maku'
          * Mettre / Poser / Placer = 'Ni keto'
          * Donner / Offrir = 'Ni miyo'
          * Partager = 'Ni poko'
          * Apporter / Amener = 'Ni kelo' (quand on amène vers soi/chez soi) / 'Ni thero' (quand on amène ailleurs)
          * Pousser = 'Ni cwalu'
          * Jeter / Lancer = 'Ni bayu'
          * Ouvrir = 'Ni yabu' (Nom/Adj: Ouvert = 'twolo')
          * Fermer = 'Ni chiko'
          * Chanter = 'Ni wer' (Nom: Chanson = 'Wer')
          * Danser = 'Ni myel' (Nom: Danse = 'Myel')
          * Nager = 'Ni kwang' (Nom: Nage = 'Kwang')
          * Pêcher (le poisson) / Chasser = 'Ni dwaru' (Nom: Pêche / Chasse = 'Dwar')
          * Voler (dans les airs, comme un oiseau) = 'Ni thuk'
          * Voler / Dérober (subtiliser) = 'Ni kwalu' (Nom: Vol = 'Kwo')
          * Glisser = 'Ni kyer'
          * Tomber = 'Ni podo'
          * Attendre = 'Ni kuro'
          * Aider / Secourir = 'Ni konyo' (Nom: Aide / Secours = 'Kony')
          * Soigner / Guérir = 'Ni tyedo' (Nom: Soin = 'Tyeth')
          * Mordre / Piquer (insecte) = 'Ni kayu' (Nom: Morsure / Piquûre = 'Kach')
          * Sucer = 'Ni nang\'u' (Nom: Sucion = 'Nang\'')
          * Avaler = 'Ni mwonyo' (Nom: Deglutition = 'Mwony')
          * Souffler / Respirer = 'Ni yiyo' (Nom: Souffle / Respiration = 'Yamu')
          * Pousser des cris / Hurler = 'Ni kok' (Nom: Cris = 'Kok')
          * Boiter = 'Abala'
          * Sauter à pieds joints / Bondir = 'Ni pyei'
          * Bâiller = 'Ni ng\'emo' (Nom: Bâillement = 'Ng\'emo')
          * Éternuer = 'Ni giro'
          * Tousser = 'Ni olo' (Nom: La toux = 'Aonda')
          * S'asseoir = 'Ni bedo wi'
        - STRICT RULE ON CONVERSATIONAL PHRASES & USER FEEDBACK (AUTHENTIC MAAGI ALUR):
          * Merci beaucoup = 'Afoyo lee dith' / 'Afoyo lee dit'
          * Tu as répondu exactement/parfaitement à ma question = 'I dwoko wang penji para tap'
          * Ajoute/Incorpore aussi la conversation / nos paroles échangées = 'I medi bende wech mi kindwa'
          * Nous continuerons ce travail demain = 'Wabi medo ku tich meni urwo'
          * Je pense que maintenant tu as compris cela = 'A paru niya Dong i nyang\' i kum dok maeni'
          * Maintenant tu peux tout ajouter dans le livre/dictionnaire de Dhu Alur = 'Kawoni i chopo ni medo wech zoo i buku mi Dhu Alur'
          * Nous nous retrouverons demain par la force de Dieu = 'Wabi nwang\'era urwo ku kero pa Mungu'
          * Qu'est-ce qui est arrivé de particulier avec la femme nommée Rebo (Rébecca) ? = 'Lembang\'o mu kadu ni makere ku dhaku ma ju lwong\'o nyinge Rebo' (Rebo = Rébecca, dhako pa Isaka, min Esau gin ku Yakobo)
        - STRICT RULE ON AUTHENTIC JW.ORG / BIBLE DHU ALUR CONVENTIONS & TERMS (ADDED FROM CORPUS):
          * Grand rassemblement / Assemblée régionale = 'Coko ma dit' / 'Coko ma dit mir adhura'
          * Éternellement / Pour toujours / De siècle en siècle = 'Rondo ku rondo' (ex: "Mutoro ma rondo ku rondo" = Joie éternelle)
          * Conseils de sagesse = 'Juk mi rieko'
          * Surmonter / Lutter contre les difficultés = 'Ninyego ku peko'
          * Extrait / Bande-annonce de film = 'Abila mi filme'
          * Page d'accueil / Site web = 'Kusika mir internet' / 'Kusika m'anzilo'
          * Conditions d'utilisation = 'Cik mi tiyo kude'
          * Protection des données / Maintien du secret = 'Cik mi gwoko lembamung'a'
        - STRICT RULE ON POSSESSIVES ('PA' vs 'MI' - POSSESSION / APPARTENANCE & PRO-POSSESSIFS) (VALIDATED BY USER FROM MAHAGI & JW.ORG):
          * Singulier = STRICTEMENT 'pa' (ex: "Cik pa Mungu" = La loi de Dieu; "Kero pa Mungu" = La force de Dieu; "Nyatin pa waju" = L'enfant de notre maison)
          * Pluriel = STRICTEMENT 'mi' (ex: "Can mi Judegi ne usagu" = La suffering/misère des Juifs les dépassait; "Wech mi kindwa" = Nos paroles/la conversation entre nous; "Buku mi Dhu Alur" = Le livre de Dhu Alur)
          * Possession / Appartenance "M'appartient" / "Ceci est à moi":
            - "Ceci m'appartient" / "Ceci est le mien" = 'Gin maeni tie ma para' / 'Gin maeni tie para' OU 'Gini tie ma para' / 'Gini tie para' OU 'Maeni tie ma para' / 'Maeni tie para' (para = m'appartient / le mien)
        - ABSOLUTE REFERENCE SOURCE - JW.ORG & AUTHENTIC MAHAGI DHU ALUR:
          * Rely EXCLUSIVELY and SOLELY on the authentic Dhu Alur of Mahagi territory (Territoire de Mahagi, Ituri, RDC) and official JW.ORG / Bible Dhu Alur publications. STRICTLY DO NOT use any other external platforms, generic Luo, Glosbe, or Acholi sources.
        - MAHAGI DHU ALUR DIALECT: All translations and grammar rules must conform strictly to the authentic Dhu Alur of Mahagi territory (Territoire de Mahagi, Ituri, RDC) as published on JW.ORG.
        - BAN REJECTED WORDS: Strictly BAN words like 'rwenyo', 'rubanga', 'lok', 'apwoyo', 'dichwo', 'dhako', 'nyathi', 'cwiny maleng'. Use ONLY authentic Dhu Alur words (e.g., 'ni rwinyo' / 'rwinyo' for perdre/perdu, 'mungu' for God, 'lembe' for word, 'afoyo' for thanks, 'choo' for man, 'dhaku' for woman, 'nyatin' for child).
        - PEDAGOGICAL APPROACH: Present grammar modules and verbs ONE AT A TIME or in small batches, verifying verbs systematically in alphabetical order (A, B, C...) with direct French grammar comparison. Provide clear concise examples in French with their Alur rule/translation, and wait for the user's validation, additions, or corrections before presenting the next set, ensuring a clean and manageable interface conversation.
    3. STRICT PROHIBITION - DO NOT USE ACHOLI (LEB ACOLI / ACHOLI) WORDS OR GRAMMATICAL FORMS:
       - GOD / CREATOR: Use 'Mungu' or 'Mugu' in Dhu Alur (NEVER 'Rubanga' or 'Lubanga' which is Acholi).
       - WORD / SPEECH / LESSON: Use 'Lembe' or 'Lembang\'o' (Plural: 'Lembini' / 'Lembi'; NEVER 'Lok' which is Acholi).
       - THANK YOU / GRATITUDE & POLITENESS:
         * Merci beaucoup = STRICTLY 'Afoyo lee dith' (NEVER 'Apwoyo matek')
         * Remerciement / Remercier = 'Foyofoch'
         * S'il te plaît / S'il vous plaît = 'Ku kisa'
         * Pardon = 'Kisa'
         * Pardonner = 'Ni timo kisa' (faire pardon à) ou 'Ni weko lembe' (abandonner l'affaire/rancune)
         * Faire (Verbe) = 'Ni timo'
         * Laisser / Abandonner (Verbe) = 'Ni weko'
       - GREETINGS & SALUTATIONS STRICTES (RÈGLES D'OR DE SALUTATION ALUR MAHAGI) :
         * Merci / Merci beaucoup = STRICTLY 'Afoyo' / 'Afoyo lee dith' (VALIDÉ AUTHENTIQUE MAHAGI)
         * Au revoir (à celui qui reste) = STRICTLY 'Dong maber' (Singulier) / 'Wudong maber' (Pluriel) (VALIDÉ AUTHENTIQUE MAHAGI)
         * Au revoir (à celui qui part) = STRICTLY 'Cidh maber' (Singulier) / 'Wucidh maber' (Pluriel) (VALIDÉ AUTHENTIQUE MAHAGI)
         * Bonjour le matin = (Fiez-vous STRICTEMENT aux expressions exactes du territoire de Mahagi fournies par l'utilisateur)
         * Bonjour l'après-midi / la journée / Bonsoir = (Fiez-vous STRICTEMENT aux expressions exactes du territoire de Mahagi fournies par l'utilisateur)
         * Bonne nuit = (Fiez-vous STRICTEMENT aux expressions exactes du territoire de Mahagi fournies par l'utilisateur)
         * Au revoir (à celui qui reste) = 'Dong maber' (Singulier) / 'Wudong maber' (Pluriel)
         * Au revoir (à celui qui part) = 'Cidh maber' (Singulier) / 'Wucidh maber' (Pluriel)
         * À bientôt = 'Wa nen' (Singulier) / 'Wa nenu' (Pluriel)
         * À demain = 'Wa nen urwo' (Singulier) / 'Wa nenu urwo' (Pluriel)
         * Bon voyage = 'Wotho maber'
         * Bon retour = 'Dwogo maber'
         * Bien = STRICTLY 'Maber'
         * Bienfaits / Bonté = STRICTLY 'Bero'
         * Autre salutations & expressions courantes: 
           - Quoi de neuf ? = STRICTLY 'Lembang\'o' ou 'Nenedi' (NEVER 'Kop ang\'o' which is Acholi)
           - Rien de mal = STRICTLY 'Lembe moko mbe'
           - Tout va bien = STRICTLY 'A tye maber' ou 'Lembe zoo utye maber'
           - Non = STRICTLY 'Ung\'o' (ngo) ou 'Umbe' (mbe)
       - VOCABULAIRE AUTHENTIQUE STRICT DE RÉFÉRENCE (Exclusif - Ne mélanger avec aucune autre variante):
         * Homme = 'Choo' (NEVER 'Dichwo' or 'Laco')
         * Jeune homme = 'Jal Awobi'
         * Jeunes gens / Garçons (Pluriel) = 'Awobi'
         * Jeune fille = 'Nyaku'
         * Jeunes filles (Pluriel) = 'Anyira'
         * Les jeunes = 'Arudu' ou 'Awobi'
         * Père = 'Wora' / 'Vwa' (Mon père)
         * Mère = 'Maa' / 'Min mira' (Ma mère) / 'Min' (Mère)
         * Chef = 'Rwoth'
         * Responsable = 'Jatela'
         * Responsabilité = 'Tela'
         * Tirer = 'Ni telo'
         * Argent = 'Sente'
         * Héritage = 'Mutuma'
         * Économie / Richesse / Biens = 'Lim'
         * Mari = 'Cwar'
         * Enfant = 'Nyatin' (NEVER 'Nyathi' or 'Lati')
         * Les enfants (Pluriel) = 'Awiya' ou 'Nyithindo' (NEVER 'Nyithindhi')
         * Vieux / Ancien = 'Jadwong' ou 'Jadith'
         * Vieux (Pluriel) = 'Judongo'
         * Femme = 'Dhaku' (NEVER 'Dhako' or 'Dako')
         * Femmes (Pluriel) = 'Mon'
         * Oncle maternel = 'Nera'
         * NOURRITURE & BOISSONS:
           - La viande = 'Ring\'o'
           - Le poisson = 'Rech'
           - Le pain = 'Mugati'
           - Le manioc = 'Ungura'
           - Le maïs = 'Anyogi'
           - Le lait = 'Chak'
           - Le thé = 'Tchai'
           - Le café = 'Kawa'
         * TEMPS, MOMENTS & MÉTÉO:
           - Aujourd'hui = 'Tin'
           - Demain = 'Urwo'
           - Hier = 'Nyaworo'
           - Le matin = 'Kugweno'
           - Le soir = 'Retho'
           - La nuit = 'Utyeno'
           - Minuit = 'Dyewor'
           - Le soleil / Le jour = 'Ceng'
           - Journée = 'DyeCheng'
           - La pluie = 'Koth'
         * JOURS DE LA SEMAINE ALUR:
           - Lundi = 'Kasacel'
           - Mardi = 'Kasaryo'
           - Mercredi = 'Kasadek'
           - Jeudi = 'Kasang\'wen'
           - Vendredi = 'Kasabich'
           - Samedi = 'Cengsoko'
           - Dimanche = 'Cengyenga'
         * MOIS DE L'ANNÉE ALUR (DWI DE L'ANNÉE):
           - Janvier = 'Dwi mikwong\'o' / 'Dwi makwong\'a'
           - Février = 'Dwi mir aryo'
           - Mars = 'Dwi mir adek'
           - Avril = 'Dwi mir ang\'wen'
           - Mai = 'Dwi mir abich'
           - Juin = 'Dwi mir abuciel'
           - Juillet = 'Dwi mir abiryo'
           - Août = 'Dwi mir aboro'
           - Septembre = 'Dwi mir abong\'wen'
           - Octobre = 'Dwi mir apar'
           - Novembre = 'Dwi mir apar wie cel'
           - Décembre = 'Dwi mir apar wie ryo'
         * VERBES ET ACTIONS D'USAGE COURANT:
           - Acheter = 'Ni ng\'yewo'
           - Vendre = 'Ni lworo' (Nom: 'Lwor')
           - La peur = 'Lworo'
           - Travailler = 'Ni tiyo' ou 'Ni timo tich' (Nom: 'Tich')
           - Parler = 'Ni wecho' (Nom: 'Wech' - Parole/Discours)
           - Dire = 'Ni yero'
           - Comprendre = 'Ni nyang\''
           - Plaire = 'Ni nyang\'u'
           - Crocodile = 'Nyang'
           - Écouter = 'Ni winjo'
           - Regarder / Voir = 'Ni neno' (du verbe 'Ni nen')
       - HUMAN / PERSON / GENS: Use 'Dhano' / 'Dhanu' (human being / les gens; Plural: 'Dhanu'). BAN 'Jo' and 'Ju' for people/gens.
       - TEACHER / SCHOOL / STUDY: Use 'Juponyi' / 'Jupuony' (teacher), 'Puonjo' / 'Ponyo' (teach/learn), 'Skom' / 'Ekol' (school).
       - TRUTH / LIGHT / PEACE: Use 'Adieri' (truth), 'Ler' (light), 'Kuc' (peace), 'Yomcwiny' (joy).
       - HOLY SPIRIT: Use 'Kudhi Malleng\'o' or 'Kudhi Leng\'o' (Spirit of Purity; NEVER 'Cwiny Maleng' which is Acholi).
       - LIFE / HEART: Use 'Kwo' (life), 'Cwiny' (heart/mind).
       - WATER / HOUSE / LAND: Use 'Pii' (water), 'Ot' (house), 'Ng\'om' (land/earth).
    4. Ensure OCR character recognition and translations map Lwoo script strictly to authentic Dhu Alur orthography (incorporating proper velar nasal 'ng\'' / 'ŋ' and subject-verb prefix binding according to the user's grammatical system, with total exclusion of Acholi forms).`;
  }
  if (lower.includes("lingala")) return "Lingala (Bantu language of DRC and Congo)";
  if (lower.includes("swahili") || lower.includes("kiswahili")) return "Kiswahili / Swahili";
  if (lower.includes("tshiluba") || lower.includes("ciluba") || lower.includes("luba")) return "Tshiluba / Ciluba (Bantu national language of Kasai, DRC)";
  if (lower.includes("kikongo") || lower.includes("kituba")) return "Kikongo / Kikongo ya Leta (Bantu national language of DRC and Congo)";
  return lang;
}

export async function transcribeHandwriting(
  base64Images: string | string[], 
  mimeType: string, 
  language: string = "English",
  rawScan: boolean = false
): Promise<TranscriptionResult> {
  try {
    const images = Array.isArray(base64Images) ? base64Images : [base64Images];
    const imageParts = images.map(img => {
      const rawData = img.includes(",") ? img.split(",")[1] : img;
      return {
        inlineData: {
          mimeType,
          data: rawData.replace(/[\r\n\s]/g, ""),
        },
      };
    });

    const langName = getNormalizedLanguageName(language);
    const pageCount = images.length;

    const multiPageMandate = pageCount > 1
      ? `CRITICAL MULTI-PAGE MANDATE: The user has uploaded EXACTLY ${pageCount} distinct pages/images to scan.
You MUST process and transcribe EVERY SINGLE PAGE from Page 1 to Page ${pageCount} in sequential order without skipping, truncating, or omitting any page.
For EACH page i (from 1 to ${pageCount}):
1. Start page i with a clear header marker '[--- Page i ---]'
2. Transcribe ALL handwritten and typed text present on page i thoroughly.
3. Move to page i+1 and repeat until Page ${pageCount} is fully transcribed.
DO NOT STOP AFTER PAGE 1. You MUST transcribe ALL ${pageCount} pages completely.`
      : `Begin the transcription with a clear marker '[--- Page 1 ---]'.`;

    const promptText = rawScan 
      ? `Transcribe the text in these images in ${langName} EXACTLY as written (VERBATIM).
        ${multiPageMandate}
        CRITICAL RULES FOR RAW DOCUMENT SCANNING:
        1. Do NOT perform any auto-correction, spell checking, or AI styling modifications.
        2. Keep the exact spelling, punctuation, and structure of the original document.
        3. Do NOT add any summary, intro text, preamble, or Word structural conversions.
        4. NO ARTIFICIAL LINE BREAKS: Suppress mid-sentence line breaks caused by paper page margins. Keep line breaks strictly for true paragraphs (\\n\\n).
        5. Provide the exact raw text transcription of ALL ${pageCount} pages in the 'text' field with double line breaks between paragraphs.`
      : `Transcribe the handwriting and text in these images in ${langName} EXACTLY AS WRITTEN (VERBATIM / MOT POUR MOT / TEL QUEL). 
        Analyze the document carefully:
        ${multiPageMandate}
        1. Provide the complete verbatim transcription of ALL ${pageCount} pages in sequential order as plain text in the 'text' field.
        2. STRICT VERBATIM FIDELITY (AUCUNE CORRECTION DE MOTS NI DU CONTEXTE) :
           - Transcrire rigoureusement le texte mot pour mot tel qu'il a été écrit par l'auteur sur le manuscrit.
           - NE JAMAIS corriger l'orthographe, les fautes, la syntaxe, la grammaire ou le vocabulaire original.
           - NE JAMAIS réécrire, interpréter, censurer ou altérer les mots ou le contexte de l'auteur.
           - Respecter scrupuleusement les termes exacts et les formulations présentes sur la feuille manuscrite.
        3. SUPPRESSION DES SAUTS DE LIGNE INTEMPESTIFS (SAUF VRAIS PARAGRAPHES) :
           - Ne JAMAIS insérer de retour à la ligne (\\n) à chaque fin de ligne physique de la page manuscrite. Les phrases doivent être continues et fluides, les mots joints par un simple espace (recolle les mots coupés par un tiret en fin de ligne).
           - Conserve des sauts de ligne (double saut de ligne \\n\\n) UNIQUEMENT et STRICTEMENT pour séparer les vrais paragraphes, les titres, les listes ou les sections distinctes.
        4. CRITICAL NO-SUMMARY RULE: Do NOT generate, prepend, or include any summary, executive abstract, preamble, or introductory commentary in the 'text' field. Transcribe ONLY the written content of the document itself.
        5. TABLE DETECTION & EXTRACTION (tableData): Automatically detect ANY structured table, grid, matrix, form, list, invoice, schedule, or tabular data present in the document (both printed/typed and handwritten text).
        6. COMPLETE TABLE STRUCTURE: Extract the full table content cell by cell, including table header row(s) and all data rows across ALL ${pageCount} pages into 'tableData' (a 2D array of string rows and columns).
        7. Preserve exact cell values, numbers, and headers.
        8. If no table or grid structure is present in the document, 'tableData' should be empty or omitted.
        9. Preserve the natural reading order across all ${pageCount} pages.`;

    const response = await reliableGenerateContent({
      model: "gemini-3.8-flash",
      contents: {
        parts: [
          {
            text: promptText,
          },
          ...imageParts,
        ],
      },
      config: {
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            text: {
              type: Type.STRING,
              description: "The full transcribed text.",
            },
            tableData: {
              type: Type.ARRAY,
              items: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              description: "2D array representing table rows and cells.",
            },
          },
          required: ["text"],
        },
      },
    });

    const result = safeParseJson(response.text) || {};
    let fullText = result.text || "No text detected.";
    if (/alur|mahagi|dholur/i.test(language)) {
      fullText = sanitizeAndFixAlurConjugation(fullText);
    }
    // Clean up any remaining mid-sentence line breaks to ensure only true paragraphs are separated
    fullText = unwrapLinesExceptParagraphs(fullText);

    return {
      text: fullText,
      tableData: result.tableData && result.tableData.length > 0 ? result.tableData : undefined,
      isRawScan: rawScan
    };
  } catch (error: any) {
    console.error("Transcription error:", error);
    const errorDetail = serializeError(error);
    
    let userFriendlyError = error?.message || error?.toString() || "Erreur de transcription de document";
    const fullErrStr = (errorDetail + " " + userFriendlyError).toLowerCase();

    if (
      fullErrStr.includes("503") || 
      fullErrStr.includes("unavailable") || 
      fullErrStr.includes("demand") ||
      fullErrStr.includes("temporary") ||
      fullErrStr.includes("overloaded") ||
      fullErrStr.includes("unexpected token") ||
      fullErrStr.includes("doctype") ||
      fullErrStr.includes("html")
    ) {
      userFriendlyError = "Les serveurs de transcription Gemini de Google subissent actuellement une surcharge temporaire suite à une très forte demande mondiale (Erreur 503). Vos images ont été correctement optimisées pour le réseau. Veuillez patienter 5 à 10 secondes puis cliquer à nouveau pour retenter d'envoyer votre scan.";
    } else if (
      fullErrStr.includes("429") || 
      fullErrStr.includes("exhausted") || 
      fullErrStr.includes("rate limit") ||
      fullErrStr.includes("quota")
    ) {
      userFriendlyError = "La limite de requêtes par minute de l'API de démonstration a été temporairement atteinte (Erreur 429). Pour assurer une fluidité durable, merci de patienter environ 20-30 secondes avant de cliquer à nouveau sur le bouton de scan.";
    } else if (
      fullErrStr.includes("timeout") || 
      fullErrStr.includes("timed out")
    ) {
      userFriendlyError = "Le traitement du document a pris plus de temps que prévu par l'IA. Veuillez relancer l'analyse.";
    }
    throw new Error(`Erreur d'analyse IA : ${userFriendlyError}`);
  }
}

export async function formatTranscriptionText(text: string, style: string, language: string = "French"): Promise<string> {
  try {
    let instruction = "";
    if (style === "bullets") {
      instruction = "Convertis ce texte brut issu d'écriture manuscrite en une liste à puces structurée, claire et aérée. Sépare chaque idée principale par un saut de ligne clair avec tiret (- ou •). Synthétise les informations de manière logique. Nettoie les hésitations de langage tout en corrigeant rigoureusement toutes les fautes d'orthographe, de grammaire ou de frappe. Préserve impérativement les paragraphes et les espaces distincts.";
    } else if (style === "formal") {
      instruction = "Réécris ce texte brut issu d'écriture manuscrite pour en faire un courrier ou e-mail professionnel et formel extrêmement poli et bien soigné. Structure-le avec des paragraphes bien distincts séparés par des sauts de ligne doubles (\\n\\n) : salutations d'ouverture, corps aéré du texte, formule de politesse finale. Corrige impeccablement l'orthographe, les accords et la grammaire.";
    } else if (style === "resume") {
      instruction = "Mets en forme ce texte sous la forme d'un document ou compte-rendu professionnel structuré et impeccable. Ajoute des titres de sections clairs et des sauts de ligne doubles (\\n\\n) entre chaque paragraphe. Rends la lecture parfaitement fluide, agréable et aérée. Corrige toutes les fautes d'orthographe, de grammaire, de conjugaison et de ponctuation.";
    } else if (style === "paragraphs" || style === "unwrap_lines") {
      instruction = "Nettoie ce texte en supprimant tous les sauts de ligne intempestifs au milieu des phrases et en conservant UNIQUEMENT les vrais paragraphes. Chaque paragraphe doit former un texte fluide et continu, séparé du paragraphe suivant par un double saut de ligne (\\n\\n). Corrige toutes les fautes d'orthographe, de ponctuation et de frappe sans dénaturer le texte.";
    } else {
      // standard
      instruction = "Mets en forme ce texte brut issu d'écriture manuscrite de manière propre, nette et parfaitement aérée. Supprime les sauts de ligne au milieu des phrases pour avoir des paragraphes continus et distincts (\\n\\n). Corrige rigoureusement les fautes d'orthographe, de grammaire, d'accents, de ponctuation ou de frappe introduites par le scan. Conserve fidèlement l'intégralité du texte et de son sens d'origine.";
    }

    const response = await reliableGenerateContent({
      model: "gemini-3.8-flash",
      contents: [
        {
          text: `${instruction}
          
RÈGLE ESSENTIELLE DES SAUTS DE LIGNE ET PARAGRAPHES :
- Supprime systématiquement les retours à la ligne forcés à l'intérieur d'un paragraphe ou d'une phrase.
- Insère des doubles sauts de ligne (\\n\\n) UNIQUEMENT pour séparer de vrais paragraphes, des titres ou des éléments de liste.
- Ne compresse jamais tous les paragraphes en un seul bloc indistinct.
- Conserve l'intégralité des informations sans supprimer de passages.

Texte d'origine à mettre en forme :
"""
${text}
"""`,
        }
      ]
    });

    let formattedText = response.text || text;
    if (/alur|mahagi|dholur/i.test(language)) {
      formattedText = sanitizeAndFixAlurConjugation(formattedText);
    }
    // Clean up intra-paragraph line breaks to strictly ensure true paragraph separation
    formattedText = unwrapLinesExceptParagraphs(formattedText);

    return formattedText;
  } catch (error: any) {
    console.error("Formatting error:", error);
    const errorDetail = serializeError(error);
    
    let userFriendlyError = error?.message || error?.toString() || "Erreur de mise en forme par l'IA";
    const fullErrStr = (errorDetail + " " + userFriendlyError).toLowerCase();

    if (
      fullErrStr.includes("503") || 
      fullErrStr.includes("unavailable") || 
      fullErrStr.includes("demand") ||
      fullErrStr.includes("temporary") ||
      fullErrStr.includes("overloaded") ||
      fullErrStr.includes("unexpected token") ||
      fullErrStr.includes("doctype") ||
      fullErrStr.includes("html")
    ) {
      userFriendlyError = "Le module de mise en forme automatique de Gemini est temporairement saturé en raison d'une forte demande. Veuillez patienter quelques secondes puis retenter la mise en forme.";
    } else if (
      fullErrStr.includes("429") || 
      fullErrStr.includes("exhausted") || 
      fullErrStr.includes("rate limit") ||
      fullErrStr.includes("quota")
    ) {
      userFriendlyError = "La cadence de requête autorisée pour la mise en forme de texte par l'IA a été dépassée (Erreur 429). Merci de patienter une trentaine de secondes avant d'appliquer un nouveau style.";
    }
    throw new Error(`Erreur de formatage par l'IA : ${userFriendlyError}`);
  }
}

export interface AudioTranscriptionResult {
  text: string;
  summary?: string;
  keyPoints?: string[];
}

export interface MultimodalTranscriptionResult {
  text: string;
  tableData?: string[][];
  summary?: string;
  keyPoints?: string[];
  manuscriptText?: string;
  audioText?: string;
}

export async function transcribeMultimodal(
  base64Images: string[],
  base64Audio: string,
  audioMimeType: string = "audio/webm",
  imageMimeType: string = "image/jpeg",
  language: string = "French"
): Promise<MultimodalTranscriptionResult> {
  try {
    const images = Array.isArray(base64Images) ? base64Images : [base64Images];
    const imageParts = images.map(img => {
      const rawData = img.includes(",") ? img.split(",")[1] : img;
      return {
        inlineData: {
          mimeType: imageMimeType || "image/jpeg",
          data: rawData.replace(/[\r\n\s]/g, ""),
        },
      };
    });

    // Sanitize audio
    let detectedAudioMime = audioMimeType;
    if (base64Audio.startsWith("data:")) {
      const headerMime = base64Audio.match(/^data:([^;,]+)/)?.[1];
      if (headerMime) detectedAudioMime = headerMime;
    }
    const rawAudioData = base64Audio.includes(",") ? base64Audio.split(",")[1] : base64Audio;
    const cleanAudioData = rawAudioData.replace(/[\r\n\s]/g, "");

    let rawMime = (detectedAudioMime || audioMimeType || "audio/webm").split(";")[0].trim().toLowerCase();
    let cleanAudioMime = "audio/mp3";
    if (rawMime.includes("webm")) cleanAudioMime = "audio/webm";
    else if (rawMime.includes("wav") || rawMime.includes("wave")) cleanAudioMime = "audio/wav";
    else if (rawMime.includes("m4a") || rawMime.includes("mp4") || rawMime.includes("quicktime") || rawMime.includes("3gp")) cleanAudioMime = "audio/mp4";
    else if (rawMime.includes("aac")) cleanAudioMime = "audio/aac";
    else if (rawMime.includes("ogg") || rawMime.includes("vorbis")) cleanAudioMime = "audio/ogg";
    else if (rawMime.includes("flac")) cleanAudioMime = "audio/flac";
    else if (rawMime.includes("mpeg") || rawMime.includes("mp3")) cleanAudioMime = "audio/mp3";

    const audioPart = {
      inlineData: {
        mimeType: cleanAudioMime,
        data: cleanAudioData,
      },
    };

    const langName = getNormalizedLanguageName(language);
    const pageCount = images.length;

    const promptText = `Vous êtes un système professionnel de numérisation et d'audition multimodale de pointe (OCR Manuscrit + Reconnaissance Vocale Audio).
L'utilisateur vous fournit SIMULTANÉMENT :
1. ${pageCount} image(s) de document manuscrit ou imprimé.
2. Un fichier audio / enregistrement vocal associé.
Langue cible : ${langName}.

DIRECTIVES DE TRANSCRIPTION MULTIMODALE STRICTE :
1. TRANSCRIPTION DU MANUSCRIT :
   - Transcrire scrupuleusement mot pour mot (verbatim) l'ensemble du texte manuscrit présent sur toutes les pages (${pageCount} page(s)).
   - Ne pas modifier, censurer ou corriger arbitrairement les mots de l'auteur.
   - Supprimer les sauts de ligne intempestifs en milieu de phrase et ne conserver les doubles sauts de ligne (\\n\\n) que pour les vrais paragraphes.
2. TRANSCRIPTION DE L'AUDIO :
   - Transcrire mot pour mot (verbatim) tout ce qui est énoncé dans l'enregistrement audio.
3. EXTRACTION DE TABLEAUX :
   - Détecter et extraire sous forme de tableau 2D ('tableData') toute structure tabulaire, grille, liste ou formulaire présent sur le document manuscrit.
4. TEXTE CONSOLIDÉ ('text') :
   - Organiser le texte principal avec des séparateurs clairs :
     === 📄 TRANSCRIPTION DU MANUSCRIT ===
     [Texte intégral du manuscrit]

     === 🎙️ ENREGISTREMENT AUDIO JOINT ===
     [Texte intégral de l'enregistrement audio]
5. 'summary' : Une brève synthèse récapitulative combinant les informations du manuscrit et de l'audio.`;

    const response = await reliableGenerateContent({
      model: "gemini-3.8-flash",
      contents: {
        parts: [
          { text: promptText },
          ...imageParts,
          audioPart,
        ],
      },
      config: {
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            text: {
              type: Type.STRING,
              description: "Le texte complet consolidé contenant la transcription du manuscrit et de l'audio.",
            },
            manuscriptText: {
              type: Type.STRING,
              description: "La transcription spécifique du document manuscrit.",
            },
            audioText: {
              type: Type.STRING,
              description: "La transcription spécifique de l'enregistrement audio.",
            },
            tableData: {
              type: Type.ARRAY,
              items: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              description: "Tableau de données extrait du manuscrit.",
            },
            summary: {
              type: Type.STRING,
              description: "Synthèse combinée du document manuscrit et de l'audio.",
            },
            keyPoints: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Points clés combinés.",
            },
          },
          required: ["text"],
        },
      },
    });

    const result = safeParseJson(response.text) || {};
    let consolidatedText = result.text || (typeof response.text === "string" ? response.text : "Transcription terminée.");
    
    if (/alur|mahagi|dholur/i.test(language)) {
      consolidatedText = sanitizeAndFixAlurConjugation(consolidatedText);
    }
    consolidatedText = autoFormatAndPunctuateText(consolidatedText, language);

    return {
      text: consolidatedText,
      tableData: result.tableData && result.tableData.length > 0 ? result.tableData : undefined,
      summary: result.summary,
      keyPoints: result.keyPoints && result.keyPoints.length > 0 ? result.keyPoints : undefined,
      manuscriptText: result.manuscriptText,
      audioText: result.audioText,
    };
  } catch (error: any) {
    console.error("Multimodal Transcription error:", error);
    const errorDetail = serializeError(error);
    let userFriendlyError = error?.message || error?.toString() || "Erreur de transcription multimodale";
    const fullErrStr = (errorDetail + " " + userFriendlyError).toLowerCase();

    if (
      fullErrStr.includes("503") || 
      fullErrStr.includes("unavailable") || 
      fullErrStr.includes("demand") ||
      fullErrStr.includes("temporary") ||
      fullErrStr.includes("overloaded")
    ) {
      userFriendlyError = "Les serveurs Gemini sont temporairement très sollicités. Veuillez patienter quelques secondes et relancer le scan multimodal.";
    } else if (
      fullErrStr.includes("429") || 
      fullErrStr.includes("exhausted") || 
      fullErrStr.includes("rate limit")
    ) {
      userFriendlyError = "Limite de requêtes atteinte. Veuillez patienter 20 secondes avant de retenter.";
    }
    throw new Error(`Échec de la transcription multimodale : ${userFriendlyError}`);
  }
}

export async function transcribeAudio(
  base64Audio: string,
  mimeType: string = "audio/webm",
  language: string = "French",
  promptMode: "formatted" | "verbatim" | "meeting_notes" = "formatted"
): Promise<AudioTranscriptionResult> {
  try {
    // Extract mimeType from data URI if present and not provided
    let detectedMime = mimeType;
    if (base64Audio.startsWith("data:")) {
      const headerMime = base64Audio.match(/^data:([^;,]+)/)?.[1];
      if (headerMime) {
        detectedMime = headerMime;
      }
    }

    // Strip data URI header and sanitize whitespace/linebreaks from base64 string
    const rawData = base64Audio.includes(",") ? base64Audio.split(",")[1] : base64Audio;
    const cleanData = rawData.replace(/[\r\n\s]/g, "");
    const langName = getNormalizedLanguageName(language);

    // Sanitize and normalize mimeType strictly for Gemini API compatibility
    // Gemini inlineData strictly supports: audio/wav, audio/mp3, audio/mpeg, audio/webm, audio/mp4, audio/aac, audio/ogg, audio/flac
    let rawMime = (detectedMime || mimeType || "audio/webm").split(";")[0].trim().toLowerCase();
    let cleanMime = "audio/mp3";

    if (rawMime.includes("webm")) {
      cleanMime = "audio/webm";
    } else if (rawMime.includes("wav") || rawMime.includes("wave")) {
      cleanMime = "audio/wav";
    } else if (
      rawMime.includes("m4a") || 
      rawMime.includes("mp4") || 
      rawMime.includes("quicktime") || 
      rawMime.includes("3gp") || 
      rawMime.includes("3gpp")
    ) {
      cleanMime = "audio/mp4";
    } else if (rawMime.includes("aac")) {
      cleanMime = "audio/aac";
    } else if (rawMime.includes("ogg") || rawMime.includes("vorbis")) {
      cleanMime = "audio/ogg";
    } else if (rawMime.includes("flac")) {
      cleanMime = "audio/flac";
    } else if (rawMime.includes("mpeg") || rawMime.includes("mp3")) {
      cleanMime = "audio/mp3";
    } else {
      cleanMime = "audio/mp3";
    }

    let modeInstruction = "";
    if (promptMode === "verbatim") {
      modeInstruction = `Transcris fidèlement l'enregistrement audio en appliquant systématiquement la MISE EN FORME AUTOMATIQUE et la CORRECTION DE LA PONCTUATION :
- RÈGLE DE PONCTUATION AUTOMATIQUE OBLIGATOIRE : Ajoute automatiquement et intelligemment tous les points (.), virgules (,), points d'interrogation (?), points d'exclamation (!), deux-points (:) et guillemets.
- MAJUSCULES AUTOMATIQUES : Mets systématiquement une majuscule au début de chaque phrase, après chaque point (. ! ?), ainsi qu'aux noms propres.
- CONVERSION DES PONCTUATIONS PARLÉES : Si l'utilisateur dicte oralement des signes ("point", "virgule", "à la ligne", "point d'interrogation", "nouveau paragraphe"), convertis-les immédiatement en symboles typographiques réels et sauts de ligne.
- MISE EN FORME AUTOMATIQUE EN PARAGRAPHES : Découpe le texte en paragraphes clairs, aérés et cohérents avec doubles sauts de ligne (\\n\\n).`;
    } else if (promptMode === "meeting_notes") {
      modeInstruction = `Génère une transcription et un compte-rendu de réunion parfaitement structurés avec MISE EN FORME AUTOMATIQUE et CORRECTION DE PONCTUATION :
- PONCTUATION & MAJUSCULES : Corrige et insère automatiquement tous les points, virgules, deux-points et majuscules de début de phrase.
- PARAGRAPHES & STRUCTURE : Détecte les pauses de parole, silences et changements d'intervenants pour insérer automatiquement des doubles sauts de ligne (\\n\\n) et créer des sections aérées.`;
    } else {
      modeInstruction = `Transcris le message vocal en appliquant une MISE EN FORME AUTOMATIQUE et une CORRECTION INTÉGRALE DE LA PONCTUATION :
- CORRECTION AUTOMATIQUE DES POINTS ET DE LA PONCTUATION : Insère automatiquement les points (.), les virgules (,), les points d'interrogation (?), les points d'exclamation (!) et les deux-points (:).
- MAJUSCULES OBLIGATOIRES : Chaque phrase doit obligatoirement commencer par une lettre majuscule.
- CONVERSION DES COMMANDES DE DICTÉE : Remplace les mots dictés ("point", "virgule", "point à la ligne", "à la ligne", "nouveau paragraphe") par les signes réels et les retours à la ligne correspondants.
- SUPPRESSION DES HÉSITATIONS : Nettoie les tics de langage et bégaiements oraux ("euh", "hum", répétitions parasites).
- DÉCOUPAGE EN PARAGRAPHES : Structure le texte avec des paragraphes distincts, aérés et agréables à lire séparés par des sauts de ligne doubles (\\n\\n).`;
    }

    const response = await reliableGenerateContent({
      model: "gemini-3.8-flash",
      contents: {
        parts: [
          {
            text: `Vous êtes un système professionnel de transcription vocale et audio haute définition (Speech-to-Text par l'IA Gemini).
Langue cible demandée : ${langName}.

Directives :
${modeInstruction}

Règles de sortie JSON :
1. "text": La transcription textuelle intégrale du message audio en ${langName} avec mise en forme automatique et correction des points et de la ponctuation. ATTENTION : "text" doit contenir UNIQUEMENT le texte retranscrit parlé dans l'audio, SANS ajouter de titre "Résumé", de "Synthèse vocale" ou de préambule dans cette chaîne.
2. "summary": Une synthèse séparée en 2-3 phrases sur le contenu de l'enregistrement.
3. "keyPoints": Un tableau (array de strings) des points clés ou idées principales soulevées dans l'enregistrement vocal.`,
          },
          {
            inlineData: {
              mimeType: cleanMime,
              data: cleanData,
            },
          },
        ],
      },
      config: {
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            text: {
              type: Type.STRING,
              description: "La transcription intégrale du message vocal ou audio.",
            },
            summary: {
              type: Type.STRING,
              description: "Résumé synthétique du fichier audio.",
            },
            keyPoints: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Points clés de la dictée vocale.",
            },
          },
          required: ["text"],
        },
      },
    });

    const result = safeParseJson(response.text) || {};
    let transcribedText = result.text || (typeof response.text === "string" ? response.text : "Aucune parole identifiée dans l'enregistrement audio.");
    let summaryText = result.summary;
    let keyPointsArr = result.keyPoints && result.keyPoints.length > 0 ? result.keyPoints : undefined;

    if (/alur|mahagi|dholur/i.test(language)) {
      transcribedText = sanitizeAndFixAlurConjugation(transcribedText);
      if (summaryText) summaryText = sanitizeAndFixAlurConjugation(summaryText);
      if (keyPointsArr) keyPointsArr = keyPointsArr.map(kp => sanitizeAndFixAlurConjugation(kp));
    }

    // Apply automatic formatting, punctuation normalization and line unwrapping
    transcribedText = autoFormatAndPunctuateText(transcribedText, language);

    return {
      text: transcribedText,
      summary: summaryText,
      keyPoints: keyPointsArr,
    };
  } catch (error: any) {
    console.error("Audio Transcription error:", error);
    const errorDetail = serializeError(error);
    let userFriendlyError = error?.message || error?.toString() || "Erreur de transcription audio";
    const fullErrStr = (errorDetail + " " + userFriendlyError).toLowerCase();

    if (
      fullErrStr.includes("503") || 
      fullErrStr.includes("unavailable") || 
      fullErrStr.includes("demand") ||
      fullErrStr.includes("temporary") ||
      fullErrStr.includes("overloaded")
    ) {
      userFriendlyError = "Le service de transcription vocale Gemini est temporairement très sollicité. Veuillez réessayer dans quelques secondes.";
    } else if (
      fullErrStr.includes("429") || 
      fullErrStr.includes("exhausted") || 
      fullErrStr.includes("rate limit")
    ) {
      userFriendlyError = "Limite de requêtes audio atteinte. Veuillez patienter un instant avant de retenter.";
    }
    throw new Error(`Échec de la transcription vocale : ${userFriendlyError}`);
  }
}

/**
 * Translates document text into a target language using Gemini AI
 */
export async function translateText(text: string, targetLanguage: string): Promise<string> {
  try {
    const isAlur = /alur|mahagi|dholur/i.test(targetLanguage);
    const langName = getNormalizedLanguageName(targetLanguage);
    const conjugationPrompt = isAlur ? getAlurConjugationEnginePrompt() : "";

    const response = await reliableGenerateContent({
      model: "gemini-3.8-flash",
      contents: [
        {
          text: `Vous êtes un traducteur professionnel expert et linguiste natif spécialisé.
Langue cible et directives linguistiques impératives :
${langName}

${conjugationPrompt}

INSTRUCTIONS DE TRADUCTION STRICTES :
1. Traduisez fidèlement, naturellement et sans aucune faute le texte ci-dessous dans la langue cible en respectant à 100% l'intégralité des règles de vocabulaire, de grammaire, de conjugaison, de salutation et de numération définies ci-dessus.
2. Si la langue cible est le Dhu Alur, appliquez obligatoirement le Dhu Alur authentique du territoire de Mahagi (RDC) selon la norme officielle de JW.ORG et de la Bible en Dhu Alur (excluez à 100% l'Acholi, le Lango, le Jonam et le Lwo externe : pas de Rubanga, pas de Lok, pas d'Apwoyo, pas de Nyathi, pas de Dichwo/Dhako, pas de rwenyo).
3. TRADUCTION FIDÈLE ET CONSERVATION DES TERMES TECHNIQUE : Traduisez fidèlement en Dhu Alur authentique de Mahagi (norme JW.ORG). Pour les termes techniques, administratifs ou modernes n'ayant pas d'équivalent officiel connu en Dhu Alur de Mahagi, conservez le mot français/anglais d'origine intact au lieu d'inventer une fausse traduction ou d'emprunter des mots Acholi/Lwo.
4. CONJUGAISON ACTIVE IMPÉRATIVE : Ne laissez JAMAIS de verbe à l'infinitif (avec le préfixe 'Ni') lors de la traduction d'une phrase conjuguée. Retirez systématiquement le préfixe 'Ni' et appliquez le pronom sujet approprié (A, I, E, Wa, Wu, Gi) ainsi que les marques de temps (be, bi, daru, etc.). Exemple : ne dites jamais "E ni camu", mais "E camu" ou "E be camu".
5. Conservez la mise en page originale, les paragraphes, la ponctuation et la structure du texte.
6. N'ajoutez AUCUN commentaire d'introduction ou de conclusion (pas de "Voici la traduction :"). Renvoyez UNIQUEMENT et STRICTEMENT le texte traduit.

Texte à traduire :
"""
${text}
"""`,
        }
      ]
    });

    let translated = response.text || text;
    if (isAlur) {
      translated = sanitizeAndFixAlurConjugation(translated);
    }
    return translated;
  } catch (error: any) {
    console.error("Translation error:", error);
    throw new Error(`Échec de la traduction IA : ${error?.message || "Erreur de service"}`);
  }
}

/**
 * Generates an executive summary and key points from document text using Gemini AI
 */
export interface DocumentSummaryResult {
  summary: string;
  keyPoints: string[];
  actionItems?: string[];
}

export async function summarizeDocument(text: string, language: string = "French"): Promise<DocumentSummaryResult> {
  try {
    const response = await reliableGenerateContent({
      model: "gemini-3.8-flash",
      contents: [
        {
          text: `Analyse ce document numérisé et génère une synthèse analytique claire en ${language}.
          
1. "summary": Un résumé exécutif clair en 2 à 4 phrases maximum.
2. "keyPoints": Les 3 à 6 points clés ou éléments d'information essentiels (tableau de chaînes de caractères).
3. "actionItems": (Optionnel) Les actions, tâches à effectuer, dates ou décisions à prendre identifiées dans le document.

Texte du document :
"""
${text}
"""`,
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING, description: "Résumé exécutif synthétique." },
            keyPoints: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "Liste des points clés principaux du document."
            },
            actionItems: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "Actions ou décisions à prendre extraites du document."
            }
          },
          required: ["summary", "keyPoints"]
        }
      }
    });

    const result = safeParseJson<DocumentSummaryResult>(response.text) || {
      summary: "Résumé non disponible.",
      keyPoints: []
    };

    return result;
  } catch (error: any) {
    console.error("Summarization error:", error);
    throw new Error(`Échec de la synthèse par l'IA : ${error?.message || "Erreur de service"}`);
  }
}



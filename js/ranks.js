// ==========================================================================
// ranks.js — le système de rangs (E, D, C, B, A, S) et les succès.
//
// PRINCIPES (validés ensemble) :
//  - Chaque exercice est comparé à des standards publiés pour un homme
//    (StrengthLog pour squat, bench, deadlift et strict press ; Strength
//    Level pour l'haltéro, le front squat et la gym).
//  - Ces standards dépendent du POIDS DE CORPS. On garde donc les tableaux
//    complets (de 50 à 100 kg) et on calcule le seuil exact pour ton poids
//    actuel par interpolation : à 57 kg, le seuil est entre celui de 55 kg
//    et celui de 60 kg. Si ton poids change, tous les seuils suivent
//    automatiquement. En dehors de 50–100 kg, on prend la ligne la plus proche.
//  - Le rang reflète ton niveau ACTUEL : il peut baisser (poids de corps qui
//    augmente sans que les charges suivent, ou régularité en baisse).
//  - Score continu : rang + progression dans le rang (B à 78 % = 4,78).
//    Une catégorie = moyenne des exercices testés ; le rang global = moyenne
//    des catégories (régularité comprise).
//  - Sources des données :
//      · séances de Musculation et cours de Spé gym / Spé haltéro = vraies séries ;
//      · 1RM notés à la main (page Records) ;
//      · WOD classiques : uniquement pour l'haltéro, comme charge minimum prouvée.
//  - Un succès débloqué reste acquis, même si ton poids change ensuite.
// ==========================================================================

const RANK_LETTERS = ["E", "D", "C", "B", "A", "S"];
const RANK_INFO = {
  E: { title: "Débutant", color: "#9297A0", tint: "rgba(146,151,160,0.12)" },
  D: { title: "Initié", color: "#4CAF7D", tint: "rgba(76,175,125,0.14)" },
  C: { title: "Intermédiaire", color: "#5B9BD9", tint: "rgba(91,155,217,0.14)" },
  B: { title: "Confirmé", color: "#A78BFA", tint: "rgba(167,139,250,0.14)" },
  A: { title: "Avancé", color: "#E1584F", tint: "rgba(225,88,79,0.14)" },
  S: { title: "Élite", color: "#E8B968", tint: "rgba(232,185,104,0.14)" },
};

// --------------------------------------------------------------------------
// TABLEAUX DE STANDARDS (homme)
// Chaque ligne : [poids de corps, D, C, B, A, S], soit les niveaux Débutant,
// Novice, Intermédiaire, Avancé et Élite des sources. Charges en kg,
// gym en répétitions. "<1" dans la source = 1 (première répétition réussie).
// --------------------------------------------------------------------------
const STANDARD_TABLES = {
  // StrengthLog
  backSquat: [[50,36,57,70,80,97],[55,40,64,79,91,114],[60,44,70,87,102,129],[65,48,75,94,112,143],[70,51,80,100,120,157],[75,54,84,106,129,169],[80,57,89,112,137,180],[85,60,93,118,144,191],[90,63,97,123,151,201],[95,65,100,127,157,210],[100,67,104,132,164,219]],
  benchPress: [[50,24,38,47,55,86],[55,30,45,55,66,98],[60,36,52,64,76,108],[65,41,58,71,85,118],[70,46,64,78,94,127],[75,50,69,84,102,135],[80,54,74,90,109,143],[85,58,79,96,116,151],[90,62,83,101,123,158],[95,66,87,106,129,164],[100,69,91,111,135,170]],
  deadlift: [[50,47,72,96,113,132],[55,52,80,106,125,149],[60,57,87,114,136,164],[65,62,94,122,146,179],[70,66,100,129,155,192],[75,69,106,136,164,204],[80,73,111,142,172,216],[85,76,116,148,179,226],[90,79,121,154,187,236],[95,82,125,159,193,246],[100,85,130,164,200,255]],
  strictPress: [[50,21,29,34,37,43],[55,24,33,38,42,50],[60,25,35,42,47,57],[65,27,38,45,51,63],[70,29,41,48,55,69],[75,30,43,51,59,74],[80,32,45,53,62,79],[85,33,47,56,66,83],[90,35,49,58,69,88],[95,36,51,61,72,92],[100,37,53,63,74,96]],
  // Strength Level
  frontSquat: [[50,30,45,64,87,112],[55,35,51,72,95,121],[60,40,57,79,104,130],[65,45,63,86,111,139],[70,50,69,92,119,147],[75,54,74,98,126,155],[80,59,79,104,133,163],[85,63,85,110,139,170],[90,68,90,116,146,177],[95,72,94,121,152,184],[100,76,99,127,158,190]],
  snatch: [[50,19,31,48,67,89],[55,22,35,53,73,96],[60,25,39,57,79,102],[65,28,43,62,84,108],[70,31,47,66,89,114],[75,34,50,70,94,119],[80,37,53,74,98,124],[85,39,57,78,103,129],[90,42,60,82,107,134],[95,45,63,85,111,139],[100,47,66,89,115,143]],
  cleanAndJerk: [[50,24,39,57,80,105],[55,28,44,63,87,113],[60,32,49,69,94,121],[65,36,53,75,100,128],[70,40,58,80,107,135],[75,43,62,86,113,142],[80,47,67,91,118,148],[85,51,71,95,124,155],[90,54,75,100,129,160],[95,57,79,105,134,166],[100,61,83,109,139,172]],
  clean: [[50,31,44,60,78,98],[55,36,49,66,85,106],[60,40,54,72,92,113],[65,44,59,78,98,121],[70,48,64,83,104,127],[75,52,69,88,110,134],[80,56,73,93,116,140],[85,60,77,98,121,146],[90,63,81,103,126,151],[95,67,85,107,131,157],[100,70,89,112,136,162]],
  pullUp: [[50,1,6,14,24,34],[55,1,7,14,24,34],[60,1,7,14,23,33],[65,1,7,14,23,32],[70,1,7,14,22,31],[75,1,7,13,21,30],[80,1,7,13,21,29],[85,1,7,13,20,28],[90,1,7,12,19,27],[95,1,7,12,19,26],[100,1,6,11,18,25]],
  dips: [[50,1,8,19,33,47],[55,1,9,20,33,47],[60,1,10,20,33,46],[65,2,10,20,32,45],[70,2,10,20,32,44],[75,3,10,20,31,43],[80,3,10,20,31,42],[85,4,10,20,30,41],[90,4,10,19,29,40],[95,4,10,19,29,39],[100,4,10,19,28,38]],
  pushUp: [[50,1,18,42,70,102],[55,2,19,42,69,99],[60,4,19,41,67,95],[65,4,20,41,65,92],[70,5,20,40,64,89],[75,6,20,39,62,87],[80,6,20,38,60,84],[85,6,20,38,59,81],[90,6,19,37,57,79],[95,6,19,36,56,77],[100,6,19,35,54,74]],
  toesToBar: [[50,1,3,12,25,39],[55,1,4,14,26,39],[60,1,5,14,26,39],[65,1,6,15,26,38],[70,1,6,15,26,38],[75,1,7,15,26,37],[80,1,7,15,26,36],[85,1,7,15,25,36],[90,1,7,15,25,35],[95,1,7,15,24,34],[100,1,7,15,24,33]],
  handstandPushUp: [[50,1,1,8,20,35],[55,1,1,9,21,35],[60,1,1,10,21,34],[65,1,1,10,22,34],[70,1,2,10,22,33],[75,1,2,11,21,33],[80,1,3,11,21,32],[85,1,3,11,21,32],[90,1,3,11,21,31],[95,1,3,11,20,30],[100,1,3,10,20,29]],
  // Rowing Level (rameur 2000 m) et Running Level (course 5 km) : ces
  // barèmes dépendent de l'ÂGE, pas du poids de corps. Ligne : [âge, D, C, B, A, S],
  // temps en secondes (plus bas = mieux).
  rowing2000: [[15,608.9,528.9,476.1,439.1,412.2],[20,561.2,487.4,438.8,404.7,379.9],[25,561,487.2,438.6,404.5,379.7],[30,561.2,487.4,438.8,404.6,379.9],[35,567.2,492.6,443.5,409,383.9],[40,579,502.9,452.7,417.5,391.9],[45,591.4,513.6,462.4,426.4,400.3],[50,604.4,524.9,472.6,435.8,409.1],[55,617.9,536.7,483.1,445.5,418.3],[60,632.1,548.9,494.2,455.7,427.8],[65,648,562.8,506.6,467.2,438.6],[70,670.3,582.1,524.1,483.3,453.7]],
  run5k: [[15,1845,1611,1415,1256,1130],[20,1747,1525,1340,1189,1070],[25,1747,1525,1340,1189,1070],[30,1758,1535,1348,1197,1077],[35,1790,1563,1373,1218,1096],[40,1844,1611,1414,1255,1129],[45,1915,1672,1468,1303,1173],[50,1991,1739,1527,1355,1219],[55,2073,1810,1590,1411,1270],[60,2162,1888,1658,1472,1324],[65,2260,1974,1733,1538,1384],[70,2373,2072,1820,1615,1453]],
  muscleUp: [[50,1,1,5,10,17],[55,1,1,6,11,17],[60,1,1,6,11,17],[65,1,1,7,11,17],[70,1,2,7,11,17],[75,1,2,7,11,17],[80,1,2,7,11,16],[85,1,2,7,11,16],[90,1,2,7,11,16],[95,1,2,7,10,15],[100,1,2,7,10,15]],
};

// --------------------------------------------------------------------------
// LES CATÉGORIES ET CE QUI LES ALIMENTE
// kind : "lift" (1RM en kg), "reps" (répétitions max en une série),
//        "time" (meilleur temps, plus bas = mieux), "frequency" (séances/semaine).
// sources : les exercices de l'appli qui comptent pour cette ligne
// (les variantes plus faciles ne peuvent prouver qu'un minimum).
// --------------------------------------------------------------------------
const RANK_CATEGORIES = [
  { id: "force", name: "Force", items: [
    { id: "backSquat", name: "Back Squat", kind: "lift", sources: ["Back Squat"], table: "backSquat" },
    { id: "frontSquat", name: "Front Squat", kind: "lift", sources: ["Front Squat"], table: "frontSquat" },
    { id: "deadlift", name: "Deadlift", kind: "lift", sources: ["Deadlift"], table: "deadlift" },
    { id: "benchPress", name: "Bench Press", kind: "lift", sources: ["Bench Press"], table: "benchPress" },
    { id: "strictPress", name: "Strict Press", kind: "lift", sources: ["Strict Press"], table: "strictPress" },
  ] },
  { id: "haltero", name: "Haltéro", items: [
    { id: "snatch", name: "Snatch", kind: "lift", sources: ["Snatch", "Squat Snatch", "Power Snatch"], table: "snatch", wodProof: true },
    { id: "cleanAndJerk", name: "Clean & Jerk", kind: "lift", sources: ["Clean & Jerk"], table: "cleanAndJerk", wodProof: true },
    { id: "clean", name: "Clean", kind: "lift", sources: ["Clean", "Squat Clean", "Power Clean", "Hang Power Clean"], table: "clean", wodProof: true },
  ] },
  { id: "gym", name: "Gym", items: [
    { id: "pullUp", name: "Pull-up", kind: "reps", sources: ["Pull-up", "Chest-to-Bar Pull-Up"], table: "pullUp" },
    { id: "dips", name: "Dips", kind: "reps", sources: ["Dips"], table: "dips" },
    { id: "pushUp", name: "Push-Up", kind: "reps", sources: ["Push-Up"], table: "pushUp" },
    { id: "toesToBar", name: "Toes-to-Bar", kind: "reps", sources: ["Toes-to-Bar"], table: "toesToBar" },
    { id: "handstandPushUp", name: "Handstand Push-Up", kind: "reps", sources: ["Handstand Push-Up"], table: "handstandPushUp" },
    { id: "muscleUp", name: "Muscle-up", kind: "reps", sources: ["Bar Muscle-Up", "Ring Muscle-Up"], table: "muscleUp" },
  ] },
  { id: "endurance", name: "Endurance", items: [
    // Efforts longs. Barèmes par âge (calculé depuis ton année de naissance).
    // Les anciens tests sprint (Rameur 500 m, Course 400 m) restent dans
    // l'historique mais ne comptent plus ici.
    { id: "row2000", name: "Rameur 2000 m", kind: "time", sources: ["Rameur 2000 m"], ageTable: "rowing2000" },
    { id: "run5k", name: "Course 5 km", kind: "time", sources: ["Course 5 km"], ageTable: "run5k" },
  ] },
  { id: "regularite", name: "Régularité", items: [
    { id: "frequency", name: "Séances par semaine", kind: "frequency", fixed: [1, 2, 3, 4, 5] },
  ] },
];

// Au-delà de 10 répétitions, l'estimation du 1RM devient peu fiable : pour
// les rangs, une telle série compte seulement pour la charge réellement soulevée.
const MAX_REPS_FOR_1RM_ESTIMATE = 10;

// --------------------------------------------------------------------------
// OUTILS DE CALCUL
// --------------------------------------------------------------------------

/** Seuils [D, C, B, A, S] pour un poids de corps donné, par interpolation linéaire. */
function interpolateThresholds(table, bodyweight) {
  if (bodyweight <= table[0][0]) return table[0].slice(1);
  const last = table[table.length - 1];
  if (bodyweight >= last[0]) return last.slice(1);
  for (let i = 0; i < table.length - 1; i++) {
    const low = table[i], high = table[i + 1];
    if (bodyweight >= low[0] && bodyweight <= high[0]) {
      const t = (bodyweight - low[0]) / (high[0] - low[0]);
      return low.slice(1).map((v, k) => v + (high[k + 1] - v) * t);
    }
  }
  return last.slice(1);
}

/** Âge utilisé tant que l'année de naissance n'est pas renseignée (barème 20-30 ans). */
const DEFAULT_AGE = 25;

/**
 * Seuils d'une ligne de rang, ou null si on a besoin du poids de corps et
 * qu'il est inconnu. Les barèmes d'endurance suivent l'âge (même principe
 * d'interpolation que pour le poids de corps : à 28 ans, entre 25 et 30 ans).
 */
function getThresholdsForItem(item, bodyweight, age) {
  if (item.fixed) return item.fixed;
  if (item.ageTable) return interpolateThresholds(STANDARD_TABLES[item.ageTable], age || DEFAULT_AGE);
  if (bodyweight === null || bodyweight === undefined) return null;
  return interpolateThresholds(STANDARD_TABLES[item.table], bodyweight);
}

/**
 * Position d'une valeur dans les seuils [D, C, B, A, S].
 * Renvoie { rankIndex (0 = E … 5 = S), progress (0 → 1 dans le rang), score (1 → 6), next }.
 */
function scoreAgainstThresholds(value, thresholds, lowerIsBetter) {
  const reached = (threshold) => (lowerIsBetter ? value <= threshold : value >= threshold);
  let level = -1;
  for (let k = 0; k < thresholds.length; k++) if (reached(thresholds[k])) level = k;

  if (level === 4) return { rankIndex: 5, progress: 1, score: 6, next: null };

  let progress;
  if (level === -1) {
    // Rang E : progression vers le seuil D
    if (lowerIsBetter) {
      const floor = thresholds[0] * 1.5;
      progress = (floor - value) / (floor - thresholds[0]);
    } else {
      progress = thresholds[0] > 0 ? value / thresholds[0] : 0;
    }
  } else {
    const low = thresholds[level], high = thresholds[level + 1];
    progress = high === low ? 0 : (value - low) / (high - low);
  }
  progress = Math.min(Math.max(progress, 0), 0.999);
  const rankIndex = level + 1;
  return { rankIndex, progress, score: rankIndex + 1 + progress, next: { rankIndex: rankIndex + 1, threshold: thresholds[level + 1] } };
}

/** Transforme un score continu (1 → 6) en rang + progression. */
function rankFromScore(score) {
  if (score >= 6 - 1e-9) return { rankIndex: 5, progress: 1, score: 6 };
  const whole = Math.floor(score + 1e-9);
  return { rankIndex: Math.max(0, whole - 1), progress: Math.max(0, score - whole), score };
}

const average = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;

function formatKg(value) {
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} kg`;
}

/** Arrondi au demi-kilo supérieur : la charge affichée suffit toujours pour le rang. */
function roundUpHalfKg(value) {
  return Math.ceil(value * 2 - 1e-9) / 2;
}

// --------------------------------------------------------------------------
// COLLECTE DES PERFORMANCES DANS TES SÉANCES
// --------------------------------------------------------------------------

function collectPerformances() {
  // Par nom d'exercice : meilleure charge en séries réelles, meilleure charge
  // en WOD (minimum prouvé), 1RM noté à la main, meilleures reps, meilleur temps.
  const perf = {};
  const get = (name) => (perf[name] = perf[name] || { load: 0, loadSource: "estimate", wodLoad: 0, manual: 0, reps: 0, time: null });

  const registerRealSet = (name, reps, weight) => {
    if (!name || !(reps > 0)) return;
    const p = get(name);
    p.reps = Math.max(p.reps, reps);
    if (weight > 0) {
      const estimate = reps <= MAX_REPS_FOR_1RM_ESTIMATE ? estimateOneRepMax(weight, reps) : weight;
      if (estimate > p.load) {
        p.load = estimate;
        // D'où vient la charge : vraie série d'1 rep, estimation, ou simple charge soulevée (> 10 reps)
        p.loadSource = reps === 1 ? "single" : reps <= MAX_REPS_FOR_1RM_ESTIMATE ? "estimate" : "lifted";
      }
    }
  };

  getAllSessions().forEach((session) => {
    if (session.type === "musculation") {
      (session.exercises || []).forEach((entry) => {
        if (!entry) return;
        if (entry.kind === "cardio") {
          if (entry.timeSeconds > 0) {
            const p = get(entry.exercise);
            p.time = p.time === null ? entry.timeSeconds : Math.min(p.time, entry.timeSeconds);
          }
          return;
        }
        (Array.isArray(entry.sets) ? entry.sets : []).forEach((set) => registerRealSet(entry.exercise, set.reps, set.weight || 0));
      });
    } else if (session.type === "crossfit") {
      const isSpe = typeof isSpeSession === "function" && isSpeSession(session.wodName);
      (session.exercises || []).forEach((entry) => {
        if (typeof entry !== "object" || entry === null) return; // mouvement libre : rien à mesurer
        if (isSpe) {
          registerRealSet(entry.exercise, entry.reps, entry.weight || 0);
        } else if (entry.reps > 0 && entry.weight > 0) {
          const p = get(entry.exercise);
          p.wodLoad = Math.max(p.wodLoad, entry.weight);
        }
      });
    }
  });

  const manual = typeof getManualOneRMs === "function" ? getManualOneRMs() : {};
  Object.keys(manual).forEach((name) => {
    if (manual[name] && manual[name].weight > 0) get(name).manual = Math.max(get(name).manual, manual[name].weight);
  });

  return perf;
}

/** Séances par semaine, en moyenne sur les 4 dernières semaines glissantes (aujourd'hui inclus). */
function computeSessionsPerWeek() {
  const today = parseLocalDate(todayLocalDateString());
  const start = new Date(today);
  start.setDate(start.getDate() - 27);
  const count = getAllSessions().filter((s) => {
    if (!s.date) return false;
    const d = parseLocalDate(s.date);
    return d >= start && d <= today;
  }).length;
  return count / 4;
}

/** Meilleure valeur d'une ligne de rang, avec d'où elle vient. Renvoie null si jamais testé. */
function getItemValue(item, perf) {
  if (item.kind === "frequency") return { value: computeSessionsPerWeek(), source: "frequency" };

  let best = null;
  item.sources.forEach((name) => {
    const p = perf[name];
    if (!p) return;
    const candidates = [];
    if (item.kind === "lift") {
      if (p.load > 0) candidates.push({ value: p.load, source: p.loadSource });
      if (p.manual > 0) candidates.push({ value: p.manual, source: "manual" });
      if (item.wodProof && p.wodLoad > 0) candidates.push({ value: p.wodLoad, source: "wod" });
    } else if (item.kind === "reps") {
      if (p.reps > 0) candidates.push({ value: p.reps, source: "reps" });
    } else if (item.kind === "time") {
      if (p.time !== null) candidates.push({ value: p.time, source: "time" });
    }
    candidates.forEach((c) => {
      const better = !best || (item.kind === "time" ? c.value < best.value : c.value > best.value);
      if (better) best = c;
    });
  });
  return best;
}

// --------------------------------------------------------------------------
// LE PROFIL COMPLET
// --------------------------------------------------------------------------

/**
 * Calcule tout : chaque exercice, chaque catégorie, le rang global.
 * C'est la seule fonction à appeler pour afficher les rangs.
 */
function computeRankProfile() {
  // Poids de corps le plus récent (onglet Mensurations). Tous les seuils de
  // force, d'haltéro et de gym sont recalculés à partir de lui à chaque appel.
  const rawBodyweight = typeof getCurrentBodyweight === "function" ? Number(getCurrentBodyweight()) : NaN;
  const bodyweight = Number.isFinite(rawBodyweight) && rawBodyweight > 0 ? rawBodyweight : null;
  // Âge (depuis l'année de naissance, onglet Mensurations) : pour l'endurance
  const age = typeof getAge === "function" ? getAge() : null;
  const perf = collectPerformances();

  const categories = RANK_CATEGORIES.map((category) => {
    const items = category.items.map((item) => {
      const found = getItemValue(item, perf);
      const base = { id: item.id, name: item.name, kind: item.kind, categoryId: category.id };
      if (!found) return { ...base, status: "untested" };

      const thresholds = getThresholdsForItem(item, bodyweight, age);
      if (!thresholds) return { ...base, status: "needsBodyweight", value: found.value, source: found.source };

      const result = scoreAgainstThresholds(found.value, thresholds, item.kind === "time");
      return { ...base, status: "ranked", value: found.value, source: found.source, thresholds, ...result };
    });

    const ranked = items.filter((i) => i.status === "ranked");
    const summary = ranked.length > 0 ? rankFromScore(average(ranked.map((i) => i.score))) : null;
    return { id: category.id, name: category.name, items, rankedCount: ranked.length, ...(summary || {}), hasRank: Boolean(summary) };
  });

  const rankedCategories = categories.filter((c) => c.hasRank);
  const global = rankedCategories.length > 0 ? rankFromScore(average(rankedCategories.map((c) => c.score))) : null;

  return { bodyweight, age, categories, global };
}

/** Texte "ce qu'il te manque" pour passer au rang suivant d'une ligne classée. */
function describeNextStep(item) {
  if (!item.next) return "Rang maximum atteint";
  const nextLetter = RANK_LETTERS[item.next.rankIndex];
  if (item.kind === "lift") {
    const target = roundUpHalfKg(item.next.threshold);
    const missing = Math.max(0.5, target - item.value);
    return `Encore ${formatKg(roundUpHalfKg(missing))} pour le rang ${nextLetter}`;
  }
  if (item.kind === "reps") {
    const missing = Math.max(1, Math.ceil(item.next.threshold - item.value - 1e-9));
    return `Encore ${missing} rep${missing > 1 ? "s" : ""} pour le rang ${nextLetter}`;
  }
  if (item.kind === "time") {
    return `${formatDuration(Math.floor(item.next.threshold))} ou moins pour le rang ${nextLetter}`;
  }
  return `${item.next.threshold} séances par semaine pour le rang ${nextLetter}`;
}

/** Valeur mise en forme (charge, reps, temps ou fréquence). */
function formatItemValue(item) {
  if (item.kind === "lift") return formatKg(Math.round(item.value * 10) / 10);
  if (item.kind === "reps") return `${item.value} rep${item.value > 1 ? "s" : ""}`;
  if (item.kind === "time") return formatDuration(item.value);
  return item.value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

/** Petite ligne d'explication sous la valeur. */
function describeItemSource(item, bodyweight) {
  if (item.kind === "lift") {
    const labels = { manual: "1RM noté", wod: "Charge levée en WOD", single: "1RM réalisé", lifted: "Charge soulevée", estimate: "1RM estimé" };
    const label = labels[item.source] || "1RM estimé";
    if (!bodyweight) return label;
    const ratio = (item.value / bodyweight).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${label} · ${ratio} × poids de corps`;
  }
  if (item.kind === "reps") return "Répétitions max en une série";
  if (item.kind === "time") return "Meilleur temps";
  return "Moyenne sur les 4 dernières semaines";
}

/**
 * Les prochains paliers les plus proches, tous exercices confondus : on
 * compare le pourcentage de chemin parcouru dans le rang actuel (les kilos,
 * reps et secondes ne se comparent pas entre eux, les pourcentages si).
 * La régularité n'en fait pas partie : ce n'est pas un objectif de séance.
 */
function computeNextMilestones(profile, limit) {
  return profile.categories
    .filter((c) => c.id !== "regularite")
    .flatMap((c) => c.items)
    .filter((i) => i.status === "ranked" && i.next)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, limit || 3);
}

// --------------------------------------------------------------------------
// SUCCÈS
// Chaque succès a une condition sur le profil actuel. Une fois débloqué, il
// est mémorisé avec sa date et reste acquis pour toujours (même si ton poids
// change ensuite) : c'est le rôle de STORAGE_KEY_ACHIEVEMENTS.
// --------------------------------------------------------------------------

const STORAGE_KEY_ACHIEVEMENTS = "carnet_achievements";
const STORAGE_KEY_RANK_SNAPSHOT = "carnet_rank_snapshot";

function findItem(profile, id) {
  for (const c of profile.categories) {
    const item = c.items.find((i) => i.id === id);
    if (item) return item;
  }
  return null;
}

/** Charge réelle sur un mouvement de force (les WOD n'y comptent pas, comme convenu). */
function itemValueOrZero(profile, id) {
  const item = findItem(profile, id);
  return item && item.value > 0 ? item.value : 0;
}

/** Le meilleur exercice classé (hors régularité), pour les succès "premier rang A / S". */
function bestRankedExercise(profile) {
  return profile.categories
    .filter((c) => c.id !== "regularite")
    .flatMap((c) => c.items)
    .filter((i) => i.status === "ranked")
    .sort((a, b) => b.score - a.score)[0] || null;
}

function bodyweightLoadAchievement(id, title, itemId, exerciseLabel, multiplier) {
  return {
    id, title,
    check: (p) => p.bodyweight !== null && itemValueOrZero(p, itemId) >= p.bodyweight * multiplier - 1e-9,
    progress: (p) => {
      if (p.bodyweight === null) return { text: "Renseigne ton poids dans Mensurations", pct: 0 };
      const target = roundUpHalfKg(p.bodyweight * multiplier);
      const current = itemValueOrZero(p, itemId);
      return { text: `${exerciseLabel} : ${formatKg(Math.round(current * 10) / 10)} / ${formatKg(target)}`, pct: Math.min(99, Math.round((current / target) * 100)) };
    },
    describe: (p) => `${exerciseLabel} à ${multiplier === 1 ? "ton poids de corps" : `${String(multiplier).replace(".", ",")} × ton poids de corps`}`,
  };
}

const ACHIEVEMENTS = [
  bodyweightLoadAchievement("squatBw", "Squat au poids de corps", "backSquat", "Back Squat", 1),
  bodyweightLoadAchievement("squat15Bw", "Squat à 1,5 × le poids de corps", "backSquat", "Back Squat", 1.5),
  bodyweightLoadAchievement("deadlift2Bw", "Deadlift à 2 × le poids de corps", "deadlift", "Deadlift", 2),
  bodyweightLoadAchievement("benchBw", "Bench au poids de corps", "benchPress", "Bench Press", 1),
  bodyweightLoadAchievement("cleanAndJerkBw", "Clean & Jerk au poids de corps", "cleanAndJerk", "Clean & Jerk", 1),
  {
    id: "pullUps10", title: "10 pull-ups d’affilée",
    check: (p) => itemValueOrZero(p, "pullUp") >= 10,
    progress: (p) => ({ text: `${itemValueOrZero(p, "pullUp")} / 10 reps`, pct: Math.min(99, itemValueOrZero(p, "pullUp") * 10) }),
    describe: () => "10 pull-ups en une seule série",
  },
  {
    id: "firstMuscleUp", title: "Premier muscle-up",
    check: (p) => itemValueOrZero(p, "muscleUp") >= 1,
    progress: () => ({ text: "Pas encore réussi", pct: 0 }),
    describe: () => "Un muscle-up à la barre ou aux anneaux",
  },
  {
    id: "firstRankA", title: "Premier rang A",
    check: (p) => { const best = bestRankedExercise(p); return Boolean(best) && best.rankIndex >= 4; },
    progress: (p) => {
      const best = bestRankedExercise(p);
      if (!best) return { text: "Aucun exercice classé pour l’instant", pct: 0 };
      return { text: `Meilleur : ${best.name} (${RANK_LETTERS[best.rankIndex]})`, pct: Math.min(99, Math.round(((best.score - 1) / 4) * 100)) };
    },
    describe: () => "Un exercice classé A",
  },
  {
    id: "firstRankS", title: "Premier rang S",
    check: (p) => { const best = bestRankedExercise(p); return Boolean(best) && best.rankIndex >= 5; },
    progress: (p) => {
      const best = bestRankedExercise(p);
      if (!best) return { text: "Aucun exercice classé pour l’instant", pct: 0 };
      return { text: `Meilleur : ${best.name} (${RANK_LETTERS[best.rankIndex]})`, pct: Math.min(99, Math.round(((best.score - 1) / 5) * 100)) };
    },
    describe: () => "Un exercice classé S",
  },
];

function getUnlockedAchievements() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_ACHIEVEMENTS)) || {}; } catch { return {}; }
}

function saveUnlockedAchievements(unlocked) {
  localStorage.setItem(STORAGE_KEY_ACHIEVEMENTS, JSON.stringify(unlocked));
}

// --------------------------------------------------------------------------
// SUIVI DES PROGRÈS : montées de rang et nouveaux succès
// On garde une "photo" des rangs de chaque exercice. Après chaque
// enregistrement, on compare : si un rang a monté, on l'annonce ; s'il a
// baissé, on met simplement la photo à jour. Lors du tout premier calcul
// (ou après un import), tout est enregistré sans rien annoncer.
// --------------------------------------------------------------------------

function syncRanksAndAchievements(options) {
  const silent = Boolean(options && options.silent);
  const profile = computeRankProfile();

  let snapshot = null;
  try { snapshot = JSON.parse(localStorage.getItem(STORAGE_KEY_RANK_SNAPSHOT)); } catch { snapshot = null; }
  const firstRun = !snapshot;

  const rankUps = [];
  const newSnapshot = {};
  profile.categories.forEach((c) => c.items.forEach((item) => {
    if (item.status !== "ranked") return;
    newSnapshot[item.id] = item.rankIndex;
    const previous = snapshot && snapshot[item.id];
    if (!firstRun && item.categoryId !== "regularite" && previous !== undefined && item.rankIndex > previous) {
      rankUps.push({ item, fromIndex: previous });
    }
  }));
  localStorage.setItem(STORAGE_KEY_RANK_SNAPSHOT, JSON.stringify(newSnapshot));

  const unlocked = getUnlockedAchievements();
  const newAchievements = [];
  ACHIEVEMENTS.forEach((achievement) => {
    if (!unlocked[achievement.id] && achievement.check(profile)) {
      unlocked[achievement.id] = { date: todayLocalDateString() };
      newAchievements.push(achievement);
    }
  });
  saveUnlockedAchievements(unlocked);

  if (silent || firstRun) return { profile, rankUps: [], newAchievements: [] };
  return { profile, rankUps, newAchievements };
}

/** À appeler après chaque enregistrement : affiche une montée de rang et/ou un succès débloqué. */
function notifyRankProgress() {
  const { rankUps, newAchievements } = syncRanksAndAchievements({ silent: false });
  if (rankUps.length > 0) {
    // S'il y en a plusieurs, on montre la plus forte progression
    rankUps.sort((a, b) => (b.item.rankIndex - b.fromIndex) - (a.item.rankIndex - a.fromIndex) || b.item.rankIndex - a.item.rankIndex);
    showRankUpModal(rankUps[0], rankUps.length - 1);
  }
  newAchievements.forEach((achievement, index) => {
    setTimeout(() => showAchievementToast(achievement), index * 600);
  });
  if (typeof renderProfile === "function") renderProfile();
}

// --------------------------------------------------------------------------
// AFFICHAGE : badges, cartes, radar
// --------------------------------------------------------------------------

function rankBadgeHtml(rankIndex, size) {
  const letter = RANK_LETTERS[rankIndex];
  const info = RANK_INFO[letter];
  return `<span class="rank-badge rank-badge-${size || "md"}" style="color:${info.color};background:${info.tint};border-color:${info.color}">${letter}</span>`;
}

function rankItemCardHtml(item, bodyweight) {
  if (item.status === "untested" || item.status === "needsBodyweight") {
    const hints = {
      lift: "Note une série ou un 1RM pour obtenir ton rang",
      reps: item.id === "muscleUp" ? "Note ton premier muscle-up pour obtenir ton rang" : "Note une série pour obtenir ton rang",
      time: "Note un test chrono (onglet Musculation)",
    };
    const hint = item.status === "needsBodyweight" ? "Renseigne ton poids dans Mensurations" : hints[item.kind];
    return `
      <article class="rank-card rank-card-locked">
        <div class="rank-card-header"><h4>${item.name}</h4><span class="rank-badge rank-badge-md rank-badge-unknown">?</span></div>
        <span class="rank-card-value-muted">Pas encore classé</span>
        <span class="rank-card-meta">${hint}</span>
      </article>`;
  }
  const info = RANK_INFO[RANK_LETTERS[item.rankIndex]];
  return `
    <article class="rank-card">
      <div class="rank-card-header"><h4>${item.name}</h4>${rankBadgeHtml(item.rankIndex, "md")}</div>
      <div class="rank-card-value-block">
        <span class="rank-card-value">${formatItemValue(item)}</span>
        <span class="rank-card-meta">${describeItemSource(item, bodyweight)}</span>
      </div>
      <div class="rank-progress"><div style="width:${Math.round(item.progress * 100)}%;background:${info.color}"></div></div>
      <span class="rank-card-meta">${describeNextStep(item)}</span>
    </article>`;
}

/** Radar à 5 axes (un par catégorie) dessiné en SVG. Une catégorie non classée reste au centre. */
function radarSvg(profile) {
  // Couleurs écrites en dur : les attributs SVG ne comprennent pas toujours var(--...) sur Safari
  const cx = 130, cy = 125, maxR = 90;
  const angles = [-90, -18, 54, 126, 198].map((a) => (a * Math.PI) / 180);
  const point = (r, a) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  const rings = [30, 60, 90].map((r) => `<polygon points="${angles.map((a) => point(r, a)).join(" ")}" fill="none" stroke="#26292D" stroke-width="1"/>`).join("");
  const axes = angles.map((a) => `<line x1="${cx}" y1="${cy}" x2="${point(maxR, a).split(",")[0]}" y2="${point(maxR, a).split(",")[1]}" stroke="#26292D"/>`).join("");
  const values = profile.categories.map((c, i) => (c.hasRank ? (c.score / 6) * maxR : 0));
  const shape = angles.map((a, i) => point(values[i], a)).join(" ");
  const dots = angles.map((a, i) => {
    const [x, y] = point(values[i], a).split(",");
    return `<circle cx="${x}" cy="${y}" r="4" fill="#E8B968"/>`;
  }).join("");
  const labelPos = [
    { x: 130, y: 16, anchor: "middle" }, { x: 226, y: 94, anchor: "start" }, { x: 190, y: 222, anchor: "start" },
    { x: 70, y: 222, anchor: "end" }, { x: 34, y: 94, anchor: "end" },
  ];
  const labels = profile.categories.map((c, i) => {
    const letter = c.hasRank ? RANK_LETTERS[c.rankIndex] : "?";
    const color = c.hasRank ? RANK_INFO[letter].color : "#5C6066";
    const pos = labelPos[i];
    return `<text x="${pos.x}" y="${pos.y}" text-anchor="${pos.anchor}" font-size="13" fill="#90949B">${c.name} <tspan font-weight="700" fill="${color}">${letter}</tspan></text>`;
  }).join("");
  const description = profile.categories.map((c) => `${c.name} ${c.hasRank ? RANK_LETTERS[c.rankIndex] : "non classé"}`).join(", ");
  return `
    <svg viewBox="-70 -10 400 250" role="img" aria-label="Radar des catégories : ${description}" class="profile-radar">
      ${rings}${axes}
      <polygon points="${shape}" fill="rgba(211,162,78,0.18)" stroke="#D3A24E" stroke-width="2" stroke-linejoin="round"/>
      ${dots}${labels}
    </svg>`;
}

// --------------------------------------------------------------------------
// LA PAGE PROFIL
// --------------------------------------------------------------------------

function describeGlobalBasis(profile) {
  const count = profile.categories.filter((c) => c.hasRank).length;
  if (count === 1) return "Calculé sur ta seule catégorie classée pour l’instant";
  return `Moyenne de tes ${count} catégories classées, régularité comprise`;
}

function renderProfile() {
  const container = document.getElementById("profile-content");
  if (!container) return;

  const profile = computeRankProfile();
  const bw = profile.bodyweight;
  const unlocked = getUnlockedAchievements();
  const unlockedCount = ACHIEVEMENTS.filter((a) => unlocked[a.id]).length;

  // ----- En-tête : rang global -----
  let heroHtml;
  // Le rang global n'apparaît qu'avec au moins une vraie performance notée
  // (sinon il ne reposerait que sur "0 séance par semaine")
  const hasPerformance = profile.categories.some((c) => c.id !== "regularite" && c.hasRank);
  if (profile.global && hasPerformance) {
    const letter = RANK_LETTERS[profile.global.rankIndex];
    const info = RANK_INFO[letter];
    const progressHtml = profile.global.rankIndex < 5
      ? `<div class="rank-progress rank-progress-lg"><div style="width:${Math.round(profile.global.progress * 100)}%;background:${info.color}"></div></div>
         <span class="profile-hero-sub">${Math.round(profile.global.progress * 100)} % vers le rang <strong style="color:${RANK_INFO[RANK_LETTERS[profile.global.rankIndex + 1]].color}">${RANK_LETTERS[profile.global.rankIndex + 1]}</strong></span>`
      : `<span class="profile-hero-sub">Rang maximum atteint</span>`;
    const best = bestRankedExercise(profile);
    heroHtml = `
      <div class="profile-hero-main">
        <div class="rank-emblem" style="border-color:${info.color};background:${info.tint};box-shadow:0 0 40px ${info.tint}">
          <span style="color:${info.color}">${letter}</span>
        </div>
        <div class="profile-hero-text">
          <span class="profile-eyebrow">Rang global</span>
          <span class="profile-hero-title">${info.title}</span>
          <span class="profile-hero-sub">${describeGlobalBasis(profile)}</span>
          ${progressHtml}
          <div class="profile-chips">
            <span class="profile-chip profile-chip-accent">${unlockedCount} succès sur ${ACHIEVEMENTS.length}</span>
            ${best ? `<span class="profile-chip">Meilleur rang : ${RANK_LETTERS[best.rankIndex]} (${best.name})</span>` : ""}
          </div>
        </div>
      </div>
      <div class="profile-hero-radar">${radarSvg(profile)}</div>`;
  } else {
    heroHtml = `<p class="empty-text">Ton rang global apparaîtra dès ta première performance classée : une série de squat, bench ou pull-ups, un 1RM noté, ou un test cardio. Pense aussi à renseigner ton poids dans Mensurations.</p>`;
  }

  // ----- Barème -----
  const scaleHtml = RANK_LETTERS.map((letter) =>
    `<span class="rank-scale-chip"><span class="rank-badge rank-badge-sm" style="color:${RANK_INFO[letter].color};background:${RANK_INFO[letter].tint};border-color:transparent">${letter}</span>${RANK_INFO[letter].title}</span>`
  ).join("");

  // ----- Catégories -----
  const categoriesHtml = profile.categories.map((c) => {
    let basis;
    if (c.id === "regularite") basis = "4 dernières semaines glissantes";
    else if (c.rankedCount === 0) basis = "Aucun exercice classé";
    else basis = `Moyenne de ${c.rankedCount} exercice${c.rankedCount > 1 ? "s" : ""}`;
    if (c.hasRank && c.rankIndex < 5) basis += ` · ${Math.round(c.progress * 100)} % vers ${RANK_LETTERS[c.rankIndex + 1]}`;
    const badge = c.hasRank ? rankBadgeHtml(c.rankIndex, "sm") : `<span class="rank-badge rank-badge-sm rank-badge-unknown">?</span>`;
    return `
      <section class="profile-category" aria-label="${c.name}">
        <div class="profile-category-header">${badge}<h3>${c.name}</h3><span class="profile-category-basis">${basis}</span></div>
        <div class="rank-grid">${c.items.map((item) => rankItemCardHtml(item, bw)).join("")}</div>
      </section>`;
  }).join("");

  // ----- Succès -----
  const achievementsHtml = ACHIEVEMENTS.map((a) => {
    if (unlocked[a.id]) {
      return `
        <article class="achievement-card achievement-unlocked">
          <span class="achievement-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/></svg></span>
          <div class="achievement-text">
            <h4>${a.title}</h4>
            <span>${a.describe(profile)}</span>
            <span class="achievement-date">Débloqué le ${parseLocalDate(unlocked[a.id].date).toLocaleDateString("fr-FR")}</span>
          </div>
        </article>`;
    }
    const progress = a.progress(profile);
    return `
      <article class="achievement-card">
        <span class="achievement-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></span>
        <div class="achievement-text">
          <h4>${a.title}</h4>
          <div class="rank-progress"><div style="width:${progress.pct}%;background:var(--text-muted)"></div></div>
          <span>${progress.text}</span>
        </div>
      </article>`;
  }).join("");

  const bodyweightLine = (bw !== null
    ? `Rangs calculés pour ton poids de corps actuel : ${formatKg(bw)}`
    : `Renseigne ton poids dans Mensurations : la force, l’haltéro et la gym en dépendent.`)
    + (profile.age !== null
      ? ` · endurance : barème ${profile.age} ans`
      : ` · Renseigne ton année de naissance dans Mensurations pour un barème d’endurance à ton âge (20-30 ans par défaut).`);

  container.innerHTML = `
    <p class="profile-bodyweight">${bodyweightLine}</p>
    <section class="panel profile-hero" aria-label="Rang global">${heroHtml}</section>
    <div class="rank-scale"><span class="rank-scale-label">Barème</span>${scaleHtml}</div>
    ${categoriesHtml}
    <section class="profile-category" aria-label="Succès">
      <div class="profile-category-header"><h3>Succès</h3><span class="profile-category-basis profile-accent-text">${unlockedCount} débloqués sur ${ACHIEVEMENTS.length}</span></div>
      <div class="achievement-grid">${achievementsHtml}</div>
    </section>
    <p class="records-footnote">Barèmes : standards masculins StrengthLog (squat, bench, deadlift, strict press) et Strength Level (front squat, haltéro, gym), ajustés à ton poids de corps. Rameur 2000 m et course 5 km : standards Rowing Level et Running Level, ajustés à ton âge. 1RM estimés avec la formule d’Epley sur les séries de 10 répétitions maximum.</p>
  `;
}

// --------------------------------------------------------------------------
// CARTE "PROCHAIN PALIER" DU TABLEAU DE BORD
// --------------------------------------------------------------------------

/** Ouvre la page Profil, en haut de page. */
function openProfilePage() {
  if (typeof goToSection === "function") goToSection("profil");
  try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* navigateur ancien : sans importance */ }
}

const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);

function renderNextMilestoneCard() {
  const container = document.getElementById("next-milestone");
  if (!container) return;
  const profile = computeRankProfile();
  const milestones = computeNextMilestones(profile, 3);

  if (milestones.length === 0) {
    const allMaxed = profile.categories.some((c) => c.id !== "regularite" && c.items.some((i) => i.status === "ranked"));
    container.innerHTML = allMaxed
      ? `<p class="empty-text">Tous tes exercices classés sont au rang S. Respect.</p>`
      : profile.bodyweight === null
      ? `<p class="empty-text">Renseigne ton poids dans Mensurations pour découvrir ton prochain palier.</p>`
      : `<p class="empty-text">Enregistre tes séances pour découvrir ton prochain palier.</p>`;
    return;
  }

  const [main, ...others] = milestones;
  const fromInfo = RANK_INFO[RANK_LETTERS[main.rankIndex]];
  const toLetter = RANK_LETTERS[main.next.rankIndex];
  const othersHtml = others.map((item) => `
    <div class="milestone-next-item">
      ${rankBadgeHtml(item.next.rankIndex, "sm")}
      <div><strong>${item.name}</strong><span>${describeNextStep(item)} · ${Math.round(item.progress * 100)} % du chemin</span></div>
    </div>`).join("");

  container.innerHTML = `
    <div class="milestone-main">
      <span class="profile-eyebrow profile-accent-text">Prochain palier</span>
      <div class="milestone-headline">
        <div class="milestone-ranks">${rankBadgeHtml(main.rankIndex, "md")}<span aria-hidden="true">→</span>${rankBadgeHtml(main.next.rankIndex, "md")}</div>
        <div>
          <span class="milestone-title">${main.name} : ${lowerFirst(describeNextStep(main).replace(` pour le rang ${toLetter}`, ""))}</span>
          <span class="rank-card-meta">${formatItemValue(main)} actuellement · rang ${toLetter} visé</span>
        </div>
      </div>
      <div class="rank-progress rank-progress-lg"><div style="width:${Math.round(main.progress * 100)}%;background:${fromInfo.color}"></div></div>
      <span class="rank-card-meta">${Math.round(main.progress * 100)} % du chemin parcouru</span>
    </div>
    <div class="milestone-others">
      ${others.length > 0 ? `<span class="milestone-others-title">Ensuite</span>${othersHtml}` : ""}
      <button type="button" class="milestone-link">Voir mon profil</button>
    </div>
  `;
  container.querySelector(".milestone-link").addEventListener("click", openProfilePage);
}

// --------------------------------------------------------------------------
// FENÊTRE "RANG SUPÉRIEUR" ET NOTIFICATION "SUCCÈS DÉBLOQUÉ"
// --------------------------------------------------------------------------

function showRankUpModal(rankUp, otherCount) {
  const overlay = document.getElementById("rank-up-modal");
  if (!overlay) return;
  const profile = computeRankProfile();
  const item = rankUp.item;
  const toInfo = RANK_INFO[RANK_LETTERS[item.rankIndex]];
  overlay.querySelector(".rank-up-content").innerHTML = `
    <span class="profile-eyebrow profile-accent-text">Rang supérieur</span>
    <h2 class="rank-up-title">${item.name}</h2>
    <div class="rank-up-ranks">
      <span class="rank-badge rank-badge-lg rank-up-from" style="color:${RANK_INFO[RANK_LETTERS[rankUp.fromIndex]].color};background:${RANK_INFO[RANK_LETTERS[rankUp.fromIndex]].tint};border-color:${RANK_INFO[RANK_LETTERS[rankUp.fromIndex]].color}">${RANK_LETTERS[rankUp.fromIndex]}</span>
      <span aria-hidden="true" class="rank-up-arrow">→</span>
      <span class="rank-badge rank-badge-xl" style="color:${toInfo.color};background:${toInfo.tint};border-color:${toInfo.color};box-shadow:0 0 36px ${toInfo.tint}">${RANK_LETTERS[item.rankIndex]}</span>
    </div>
    <span class="rank-up-rank-title">${toInfo.title}</span>
    <span class="rank-card-meta">${formatItemValue(item)} · ${describeItemSource(item, profile.bodyweight)}</span>
    ${item.next ? `<div class="rank-progress"><div style="width:${Math.round(item.progress * 100)}%;background:${toInfo.color}"></div></div><span class="rank-card-meta">${describeNextStep(item)}</span>` : ""}
    ${otherCount > 0 ? `<span class="rank-card-meta">Et ${otherCount} autre${otherCount > 1 ? "s" : ""} rang${otherCount > 1 ? "s" : ""} en hausse : détails sur ta page Profil.</span>` : ""}
  `;
  overlay.classList.add("is-visible");
}

function showAchievementToast(achievement) {
  const toast = document.createElement("div");
  toast.className = "achievement-toast";
  toast.setAttribute("role", "status");
  const profile = computeRankProfile();
  toast.innerHTML = `
    <span class="achievement-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/></svg></span>
    <div class="achievement-text">
      <span class="profile-eyebrow profile-accent-text">Succès débloqué</span>
      <h4>${achievement.title}</h4>
      <span>${achievement.describe(profile)}</span>
    </div>`;
  // Un toucher sur la notification ouvre la page Profil
  toast.addEventListener("click", () => {
    openProfilePage();
    toast.remove();
  });
  // Les notifications s'empilent dans un conteneur commun (pas de chevauchement)
  let stack = document.getElementById("toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "toast-stack";
    stack.className = "toast-stack";
    document.body.appendChild(stack);
  }
  stack.appendChild(toast);
  setTimeout(() => toast.classList.add("is-leaving"), 4500);
  setTimeout(() => toast.remove(), 5000);
}

(function setupRankUpModal() {
  const overlay = document.getElementById("rank-up-modal");
  if (!overlay) return;
  overlay.querySelector(".rank-up-close").addEventListener("click", () => overlay.classList.remove("is-visible"));
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) overlay.classList.remove("is-visible");
  });
})();

// Au chargement : on met la "photo" des rangs et les succès à jour sans rien
// annoncer (évite une avalanche de notifications à la première ouverture).
syncRanksAndAchievements({ silent: true });

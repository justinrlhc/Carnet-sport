// ==========================================================================
// stats.js — les calculs automatiques de l'application.
// Pour cette étape : les Records personnels.
// (Le volume, déjà calculé dans app.js pour le dashboard, pourrait être
// déplacé ici plus tard pour tout centraliser — pas obligatoire pour l'instant.)
// ==========================================================================

/**
 * Calcule le volume d'une séance de musculation : somme de (poids x répétitions)
 * pour chaque série. Une séance de CrossFit n'a pas de volume au sens classique,
 * donc elle renvoie 0 ici.
 * Utilisée par le dashboard ET par les graphiques de statistiques.
 */
/**
 * Calcule le volume d'un exercice donné, dans une séance de musculation :
 *  - pour un exercice classique (barre/haltères) : reps × poids soulevé
 *  - pour un exercice au poids du corps (pull-up, dips, burpee...) :
 *    reps × (poids de corps actuel + éventuel lest ajouté)
 * Si l'exercice est au poids du corps mais qu'aucun poids de corps n'est
 * encore connu (onglet Mensurations vide), ses séries sont simplement
 * ignorées dans le calcul — sans jamais empêcher d'enregistrer la séance.
 * Le poids de corps utilisé est celui du jour de la séance (dernière pesée
 * à cette date) : ton ancien volume ne change pas quand tu prends du poids.
 */
function bodyweightForVolume(dateStr) {
  if (typeof getBodyweightAt === "function") return getBodyweightAt(dateStr);
  return typeof getCurrentBodyweight === "function" ? getCurrentBodyweight() : null;
}

function computeExerciseVolume(exerciseEntry, dateStr) {
  if (!exerciseEntry || !Array.isArray(exerciseEntry.sets)) return 0; // donnée malformée : on l'ignore sans planter
  if (typeof isNoVolumeExercise === "function" && isNoVolumeExercise(exerciseEntry.exercise)) return 0;

  const isBW = typeof isBodyweightExercise === "function" && isBodyweightExercise(exerciseEntry.exercise);

  if (!isBW) {
    return exerciseEntry.sets.reduce((total, set) => total + set.reps * set.weight, 0);
  }

  const bodyweight = bodyweightForVolume(dateStr);
  if (bodyweight === null) return 0; // poids de corps inconnu : pas de calcul possible pour l'instant

  return exerciseEntry.sets.reduce((total, set) => total + set.reps * (bodyweight + (set.weight || 0)), 0);
}

function computeSessionVolume(session) {
  if (session.type === "musculation" && session.exercises) {
    return session.exercises.reduce((total, ex) => total + computeExerciseVolume(ex, session.date), 0);
  }
  if (session.type === "crossfit" && session.exercises) {
    return session.exercises.reduce((total, entry) => {
      if (typeof entry !== "object" || entry === null) return total; // mouvement en texte libre : pas de volume calculable
      return total + computeCrossfitStructuredVolume(session, entry);
    }, 0);
  }
  return 0;
}

/**
 * Calcule le volume d'un exercice structuré au sein d'un WOD CrossFit.
 * Pour un AMRAP, les répétitions sont multipliées par le nombre de tours
 * complets réalisés, plus d'éventuelles répétitions supplémentaires du
 * tour partiel. Pour les autres formats (For Time, EMOM, Chipper...), les
 * répétitions saisies sont déjà le total réalisé sur tout le WOD.
 * Un exercice au poids du corps applique la même logique que dans
 * l'onglet Musculation (poids de corps actuel + éventuel lest).
 */
function computeCrossfitStructuredVolume(session, entry) {
  if (typeof isNoVolumeExercise === "function" && isNoVolumeExercise(entry.exercise)) return 0;
  if (typeof getEntryUnit === "function" && getEntryUnit(entry) !== "reps") return 0; // calories / mètres : pas de volume en kg

  const isBW = typeof isBodyweightExercise === "function" && isBodyweightExercise(entry.exercise);
  let perRepWeight;

  if (isBW) {
    const bodyweight = bodyweightForVolume(session.date);
    if (bodyweight === null) return 0; // poids de corps inconnu : pas de calcul possible pour l'instant
    perRepWeight = bodyweight + (entry.weight || 0);
  } else {
    perRepWeight = entry.weight || 0;
  }

  const isAmrap = session.wodType === "AMRAP" && typeof session.rounds === "number";
  const totalReps = isAmrap
    ? (entry.reps || 0) * session.rounds + (entry.extraReps || 0)
    : (entry.reps || 0);

  return totalReps * perRepWeight;
}

/**
 * Estime le 1RM (la charge maximale que tu pourrais soulever une seule fois)
 * à partir d'une série réellement effectuée, grâce à la formule d'Epley,
 * une formule standard largement utilisée en musculation.
 *
 * Formule : 1RM ≈ poids × (1 + répétitions / 30)
 *
 * RÈGLE UNIQUE pour toute l'appli (Records, Statistiques, Profil) : au-delà
 * de 10 répétitions l'estimation n'est plus fiable, la série compte alors
 * simplement pour la charge réellement soulevée.
 */
const MAX_REPS_FOR_1RM_ESTIMATE = 10;

function estimateOneRepMax(weight, reps) {
  if (reps <= 1) return weight; // à 1 répétition, le "1RM" est simplement le poids soulevé
  if (reps > MAX_REPS_FOR_1RM_ESTIMATE) return weight; // série trop longue : charge soulevée
  return weight * (1 + reps / 30);
}

/**
 * Parcourt toutes les séances (musculation ET exercices structurés des
 * WOD CrossFit) et calcule, pour chaque exercice pratiqué :
 *  - le 1RM estimé le plus élevé jamais atteint (record de force estimé)
 *  - la charge la plus lourde jamais soulevée, quel que soit le nombre de reps
 *  - le plus grand nombre de répétitions jamais réalisé sur une série
 *
 * Important sur les données venant d'un WOD CrossFit : on ne sait jamais
 * si les répétitions saisies ont été faites d'un seul tenant ou réparties
 * en plusieurs petites séries pendant le WOD (que ce soit un total AMRAP
 * cumulé sur plusieurs tours, ou même un total "For Time" comme 50 reps
 * fractionnées). Un 1RM estimé ou un "reps max" calculés là-dessus
 * seraient donc trompeurs. Le CrossFit alimente donc uniquement la
 * charge maximale utilisée (un fait solide, peu importe le découpage des
 * séries) — jamais le 1RM estimé ni les reps max, qui restent réservés
 * aux vraies séries enregistrées dans l'onglet Musculation.
 */
function computeMuscuRecords(options) {
  const before = options && options.before; // "AAAA-MM-JJ" : ne compter que les séances antérieures
  const records = {}; // { "Back Squat": { oneRM: {...}, maxWeight: {...}, maxReps: {...} } }

  function ensureRecord(exercise) {
    if (!records[exercise]) {
      records[exercise] = { oneRM: null, maxWeight: null, maxReps: null };
    }
    return records[exercise];
  }

  /** Une vraie série (musculation) : alimente le 1RM, la charge max et les reps max. */
  function registerSet(exercise, set, date) {
    if (set.warmup === true) return; // échauffement : jamais un record
    const rec = ensureRecord(exercise);
    const estimated1RM = estimateOneRepMax(set.weight, set.reps);

    if (!rec.oneRM || estimated1RM > rec.oneRM.value) {
      rec.oneRM = { value: estimated1RM, weight: set.weight, reps: set.reps, date };
    }
    if (!rec.maxWeight || set.weight > rec.maxWeight.value) {
      rec.maxWeight = { value: set.weight, reps: set.reps, date };
    }
    if (!rec.maxReps || set.reps > rec.maxReps.value) {
      rec.maxReps = { value: set.reps, weight: set.weight, date };
    }
  }

  /** Un exercice structuré vu dans un WOD : alimente uniquement la charge max utilisée. */
  function registerWeightUsage(exercise, weight, date) {
    if (!weight || weight <= 0) return; // rien de fiable à en tirer sans charge réelle
    const rec = ensureRecord(exercise);
    if (!rec.maxWeight || weight > rec.maxWeight.value) {
      rec.maxWeight = { value: weight, reps: null, date, source: "crossfit" };
    }
  }

  getAllSessions().forEach((session) => {
    if (before && session.date >= before) return;
    if (session.type === "musculation") {
      (session.exercises || []).forEach((entry) => {
        if (!entry || !Array.isArray(entry.sets)) return; // donnée malformée : on l'ignore sans planter
        entry.sets.forEach((set) => registerSet(entry.exercise, set, session.date));
      });
    } else if (session.type === "crossfit") {
      // Un cours de spé (gym, haltéro) se fait en séries techniques, pas en
      // WOD chronométré : ses exercices structurés comptent comme de vraies
      // séries de musculation. Dans un WOD classique, seule la charge utilisée compte.
      const isSpe = typeof isSpeSession === "function" && isSpeSession(session.wodName);
      (session.exercises || []).forEach((entry) => {
        if (typeof entry === "object" && entry !== null && entry.reps > 0) {
          if (typeof getEntryUnit === "function" && getEntryUnit(entry) !== "reps") return; // calories / mètres
          if (isSpe) {
            registerSet(entry.exercise, { reps: entry.reps, weight: entry.weight || 0, warmup: entry.warmup === true }, session.date);
          } else {
            registerWeightUsage(entry.exercise, entry.weight || 0, session.date);
          }
        }
      });
    }
  });

  return records;
}

/**
 * Compare les charges avant/après l'ajout d'un WOD pour détecter si un
 * exercice structuré vient de battre la charge maximale connue pour cet
 * exercice. Utilisée à la place de detectMuscuNewRecords pour le
 * CrossFit, puisque le CrossFit n'alimente que la charge max, pas le 1RM.
 */
function detectStructuredWeightRecords(recordsBefore, structuredEntries) {
  const hits = [];
  structuredEntries.forEach((entry) => {
    if (!entry.weight || entry.weight <= 0 || entry.warmup === true) return;
    const before = recordsBefore[entry.exercise];
    const isNewRecord = !before || !before.maxWeight || entry.weight > before.maxWeight.value;
    if (isNewRecord) hits.push({ exercise: entry.exercise, value: entry.weight });
  });
  return hits;
}

/** Ordre d'affichage des niveaux CrossFit (du plus exigeant au plus adapté). */
const CF_LEVEL_ORDER = ["RX", "Inter", "Scaled"];

/** Niveau d'une séance ou d'un résultat noté ; les anciennes données sans niveau comptent comme RX. */
function getCfLevel(entry) {
  return entry && CF_LEVEL_ORDER.includes(entry.rxOrScaled || entry.level) ? (entry.rxOrScaled || entry.level) : "RX";
}

/** Un WOD "avec un nom" peut avoir des records : pas le WOD du jour (différent à chaque fois), ni les cours de spé. */
function isRecordableWod(wodName) {
  if (!wodName) return false;
  if (typeof DAILY_WOD_LABEL !== "undefined" && wodName === DAILY_WOD_LABEL) return false;
  if (typeof isSpeSession === "function" && isSpeSession(wodName)) return false;
  return true;
}

/** Vrai si la performance a (rounds + reps) bat la performance b. */
function isBetterPerformance(a, b) {
  return !b || a.rounds > b.rounds || (a.rounds === b.rounds && (a.extraReps || 0) > (b.extraReps || 0));
}

/**
 * Parcourt les séances de CrossFit et calcule, pour chaque WOD et chaque
 * NIVEAU (RX, Inter, Scaled) — un Fran en Scaled ne se compare pas à un Fran RX :
 *  - le meilleur temps (le plus petit, pour les WOD chronométrés)
 *  - la meilleure performance en rounds/reps (la plus grande, pour les AMRAP)
 * Le "WOD du jour" et les cours de spé sont exclus : ce ne sont pas des WOD
 * comparables d'une fois sur l'autre.
 * Forme : { "Fran": { "RX": { bestTime, bestPerformance }, "Scaled": {...} } }
 */
function computeCfRecords(options) {
  const before = options && options.before;
  const records = {};

  getAllSessions().forEach((session) => {
    if (session.type !== "crossfit" || !isRecordableWod(session.wodName)) return;
    if (before && session.date >= before) return;
    const hasTime = session.timeSeconds !== null && session.timeSeconds !== undefined;
    const hasRounds = session.rounds !== null && session.rounds !== undefined;
    if (!hasTime && !hasRounds) return; // WOD sans score (EMOM, Tabata...) : rien à comparer
    const level = getCfLevel(session);
    records[session.wodName] = records[session.wodName] || {};
    const rec = (records[session.wodName][level] = records[session.wodName][level] || { bestTime: null, bestPerformance: null });

    if (session.timeSeconds !== null && session.timeSeconds !== undefined) {
      if (!rec.bestTime || session.timeSeconds < rec.bestTime.value) {
        rec.bestTime = { value: session.timeSeconds, date: session.date };
      }
    }
    if (session.rounds !== null && session.rounds !== undefined) {
      const perf = { rounds: session.rounds, extraReps: session.extraReps || 0, date: session.date };
      if (isBetterPerformance(perf, rec.bestPerformance)) rec.bestPerformance = perf;
    }
  });

  return records;
}

/**
 * Compare les records d'AVANT et d'APRÈS l'ajout d'une séance de musculation
 * pour détecter les records battus par cette séance. Utilisée juste après
 * addSession() pour afficher le badge "Nouveau record !". Mêmes règles que
 * la page Records :
 *  - exercice avec charge : 1RM estimé (Epley jusqu'à 10 reps) ;
 *  - exercice au poids du corps : reps max en une série ;
 *  - test cardio : meilleur temps (cardioBestsBefore = computeCardioTestBests()
 *    calculé AVANT l'enregistrement).
 * Les perfs notées à la main (Records) comptent aussi comme "à battre".
 * Comme avant, un tout premier résultat compte comme un record.
 * Renvoie [{ exercise, value, text }] — text est la valeur prête à afficher.
 */
function detectMuscuNewRecords(recordsBeforeSave, newExercises, sessionDate, cardioBestsBefore) {
  const recordsAfterSave = computeMuscuRecords();
  const manualLoads = typeof getManualOneRMs === "function" ? getManualOneRMs() : {};
  const manualReps = typeof getManualReps === "function" ? getManualReps() : {};
  const manualTimes = typeof getManualTimes === "function" ? getManualTimes() : {};
  const hits = [];
  const seen = new Set();

  newExercises.forEach((entry) => {
    if (!entry || !entry.exercise || seen.has(entry.exercise)) return;
    seen.add(entry.exercise);

    // Test cardio : plus le temps est court, mieux c'est
    if (entry.kind === "cardio") {
      if (!(entry.timeSeconds > 0)) return;
      const candidates = [];
      if (cardioBestsBefore && cardioBestsBefore[entry.exercise]) candidates.push(cardioBestsBefore[entry.exercise].value);
      if (manualTimes[entry.exercise] && manualTimes[entry.exercise].timeSeconds > 0) candidates.push(manualTimes[entry.exercise].timeSeconds);
      if (candidates.length === 0 || entry.timeSeconds < Math.min(...candidates)) {
        const text = typeof formatDuration === "function" ? formatDuration(entry.timeSeconds) : String(entry.timeSeconds);
        hits.push({ exercise: entry.exercise, value: entry.timeSeconds, text });
      }
      return;
    }

    const before = recordsBeforeSave[entry.exercise];
    const after = recordsAfterSave[entry.exercise];
    if (!after) return;

    // Poids du corps (pull-ups, dips...) : le record, ce sont les reps d'affilée
    const isBW = typeof isBodyweightExercise === "function" && isBodyweightExercise(entry.exercise);
    if (isBW) {
      if (!after.maxReps || after.maxReps.date !== sessionDate) return;
      const previousReps = Math.max(before && before.maxReps ? before.maxReps.value : 0, manualReps[entry.exercise] ? Number(manualReps[entry.exercise].reps) || 0 : 0);
      if (after.maxReps.value > previousReps) {
        hits.push({ exercise: entry.exercise, value: after.maxReps.value, text: `${after.maxReps.value} rep${after.maxReps.value > 1 ? "s" : ""}` });
      }
      return;
    }

    if (!after.oneRM || after.oneRM.value <= 0 || after.oneRM.date !== sessionDate) return;
    const previousLoad = Math.max(before && before.oneRM ? before.oneRM.value : 0, manualLoads[entry.exercise] ? Number(manualLoads[entry.exercise].weight) || 0 : 0);
    if (after.oneRM.value > previousLoad) {
      const value = Math.round(after.oneRM.value);
      hits.push({ exercise: entry.exercise, value, text: `${formatNumberFr(value)} kg` });
    }
  });

  return hits;
}

/**
 * Même principe pour le CrossFit : détecte si le WOD qu'on vient d'enregistrer
 * bat le meilleur temps ou la meilleure performance précédente AU MÊME NIVEAU
 * (comme en musculation, un tout premier résultat compte comme un record).
 */
function detectCfNewRecords(recordsBeforeSave, wodName, level, sessionDate) {
  if (!isRecordableWod(wodName)) return null;
  const before = (recordsBeforeSave[wodName] && recordsBeforeSave[wodName][level]) || { bestTime: null, bestPerformance: null };
  const afterAll = computeCfRecords()[wodName];
  const after = afterAll && afterAll[level];
  if (!after) return null;

  if (after.bestTime && after.bestTime.date === sessionDate && (!before.bestTime || after.bestTime.value < before.bestTime.value)) {
    return { type: "time", level, value: formatSecondsToTime(after.bestTime.value) };
  }
  if (after.bestPerformance && after.bestPerformance.date === sessionDate &&
      isBetterPerformance(after.bestPerformance, before.bestPerformance)) {
    const extra = after.bestPerformance.extraReps ? ` + ${after.bestPerformance.extraReps}` : "";
    return { type: "performance", level, value: `${after.bestPerformance.rounds}${extra}` };
  }
  return null;
}

// --------------------------------------------------------------------------
// AFFICHAGE DE LA PAGE RECORDS
// (avec fusion des records calculés à partir des séances ET des records
// saisis manuellement — le plus élevé des deux est affiché en priorité,
// avec toujours une indication claire de sa source)
// --------------------------------------------------------------------------

// ----- Éléments du formulaire "1RM connu" (musculation) -----
const manual1rmForm = document.getElementById("manual-1rm-form");
const manual1rmExerciseSelect = document.getElementById("manual-1rm-exercise-select");
const manual1rmExerciseCustom = document.getElementById("manual-1rm-exercise-custom");
const manual1rmWeightInput = document.getElementById("manual-1rm-weight");
const manual1rmDateInput = document.getElementById("manual-1rm-date");
const manual1rmNotesInput = document.getElementById("manual-1rm-notes");
const btnCancel1rmForm = document.getElementById("btn-cancel-1rm-form");

// ----- Éléments du formulaire "résultat connu" (CrossFit) -----
const manualCfForm = document.getElementById("manual-cf-record-form");
const manualCfWodSelect = document.getElementById("manual-cf-wod-select");
const manualCfWodCustom = document.getElementById("manual-cf-wod-custom");
const manualCfTimeInput = document.getElementById("manual-cf-time");
const manualCfRoundsInput = document.getElementById("manual-cf-rounds");
const manualCfExtraRepsInput = document.getElementById("manual-cf-extra-reps");
const manualCfDateInput = document.getElementById("manual-cf-date");
const manualCfNotesInput = document.getElementById("manual-cf-notes");
const manualCfLevelSelect = document.getElementById("manual-cf-level");
const btnCancelCfForm = document.getElementById("btn-cancel-cf-record-form");

/** Meilleur temps de chaque test cardio dans les séances : { "Row 2000 m": { value, date } }. */
function computeCardioTestBests() {
  const bests = {};
  getAllSessions().forEach((session) => {
    if (session.type !== "musculation") return;
    (session.exercises || []).forEach((entry) => {
      if (!entry || entry.kind !== "cardio" || !(entry.timeSeconds > 0)) return;
      const current = bests[entry.exercise];
      if (!current || entry.timeSeconds < current.value) bests[entry.exercise] = { value: entry.timeSeconds, date: session.date };
    });
  });
  return bests;
}

// ----- État de la page Records : filtre et recherche -----
let recordsFilter = "all";
let recordsQuery = "";

const RECORD_GROUPS = [
  { id: "load", chip: "Charges", title: "Charges · 1RM" },
  { id: "bw", chip: "Poids du corps", title: "Poids du corps · reps max" },
  { id: "cardio", chip: "Cardio", title: "Cardio · tests chrono" },
  { id: "wod", chip: "WOD", title: "WOD · benchmarks" },
];

const RECORD_WOD_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg>';

/** "aujourd'hui", "hier", "il y a 4 j", "il y a 2 mois" */
function recordAgo(date) {
  if (!date) return "";
  const days = Math.round((parseLocalDate(todayLocalDateString()) - parseLocalDate(date)) / 86400000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 31) return `il y a ${days} j`;
  if (days < 365) return `il y a ${Math.round(days / 30)} mois`;
  const years = Math.round(days / 365);
  return `il y a ${years} an${years > 1 ? "s" : ""}`;
}

/** "4 nov." (avec l'année si ce n'est pas l'année en cours) */
function recordDay(date) {
  const d = parseLocalDate(date);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("fr-FR", sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
}

/** Tout ce qu'il faut pour construire la page (calculé une seule fois). */
function collectRecordData() {
  return {
    sessionRecords: computeMuscuRecords(),
    manualOneRMs: getManualOneRMs(),
    manualReps: getManualReps(),
    manualTimes: getManualTimes(),
    cardioBests: computeCardioTestBests(),
    cfRecords: computeCfRecords(),
    manualCf: getManualCfBests(),
  };
}

const afterManualRecordChange = () => {
  renderRecords();
  if (typeof notifyRankProgress === "function") notifyRankProgress();
  if (typeof renderDashboard === "function") renderDashboard();
};

/**
 * Le record d'un exercice (charge, poids du corps ou test cardio), pour la
 * ligne de la liste ET sa fiche détaillée. Mêmes règles qu'avant : la valeur
 * la plus haute entre séances et perf notée à la main, avec sa source.
 */
function buildExerciseRecord(exercise, data) {
  const kg = (v) => `${formatKgValue(v)} kg`;

  // ----- Test cardio (Row 2000 m, Run 5 km…) : meilleur temps -----
  if (data.cardioBests[exercise] || data.manualTimes[exercise]) {
    const sessionBest = data.cardioBests[exercise] || null;
    const manualTime = data.manualTimes[exercise] || null;
    const manualIsBest = Boolean(manualTime && (!sessionBest || manualTime.timeSeconds < sessionBest.value));
    const value = manualIsBest ? manualTime.timeSeconds : sessionBest.value;
    const date = manualIsBest ? manualTime.date : sessionBest.date;
    const tiles = [];
    if (sessionBest) tiles.push({ v: formatDuration(sessionBest.value), l: "Meilleur en séance" });
    if (manualTime) tiles.push({ v: formatDuration(manualTime.timeSeconds), l: "Temps noté" });
    return {
      group: "cardio",
      name: exercise,
      icon: RF_ICONS.run,
      value: formatDuration(value),
      label: manualIsBest ? "temps noté" : "meilleur temps",
      sub: manualIsBest ? `noté ${recordAgo(date)}` : recordAgo(date),
      big: formatDuration(value),
      bigUnit: "",
      bigLabel: manualIsBest ? "meilleur temps (noté)" : "meilleur temps",
      origin: date ? `${manualIsBest ? "noté le" : "le"} ${recordDay(date)}` : "",
      tiles: tiles.length > 1 ? tiles : [],
      notes: [],
      series: "time",
      actions: [
        ...(manualTime
          ? [{ label: "Modifier mon temps", cls: "edit-time-link", style: "gold", run: () => open1rmForm(exercise, manualTime, { mode: "time" }) },
            { label: "Supprimer mon temps noté", cls: "delete-time-link", style: "danger", run: () => {
              if (!confirm(`Supprimer le temps que tu as noté pour ${exercise} ?`)) return false;
              deleteManualTime(exercise);
              afterManualRecordChange();
            } }]
          : [{ label: "+ Noter mon meilleur temps", cls: "add-time-link", style: "gold", run: () => open1rmForm(exercise, null, { mode: "time" }) }]),
      ],
    };
  }

  const sessionRec = data.sessionRecords[exercise] || null;
  const manual = data.manualOneRMs[exercise] || null;
  const isBW = typeof isBodyweightExercise === "function" && isBodyweightExercise(exercise);

  // Poids du corps : ce qui compte, ce sont les reps max en une série
  const sessionReps = sessionRec && sessionRec.maxReps && sessionRec.maxReps.value > 0 ? sessionRec.maxReps : null;
  const manualReps = isBW ? data.manualReps[exercise] || null : null;
  const showReps = isBW && Boolean(sessionReps || manualReps);
  const manualRepsIsBest = Boolean(manualReps && (!sessionReps || manualReps.reps > sessionReps.value));

  // Sinon : la plus haute entre l'estimation (séances) et la valeur notée
  const estimate = sessionRec && sessionRec.oneRM && sessionRec.oneRM.value > 0 ? sessionRec.oneRM : null;
  let headline = null;
  if (!showReps) {
    if (manual && (!estimate || manual.weight >= estimate.value)) headline = { value: manual.weight, source: "manual", date: manual.date };
    else if (estimate) headline = { value: estimate.value, source: "estimated", date: estimate.date, weight: estimate.weight, reps: estimate.reps };
  }
  // Exercice vu seulement dans un WOD : une charge max utilisée, jamais de 1RM
  const weightOnly = !headline && !showReps && sessionRec && sessionRec.maxWeight && sessionRec.maxWeight.value > 0 ? sessionRec.maxWeight : null;
  // v28 : exercice noté sans charge (abdos, gainage, mouvement de spé sans poids…) :
  // pas de « 0 kg », on montre ses reps max en une série, comme au poids du corps
  const repsOnly = !headline && !showReps && !weightOnly && sessionReps ? sessionReps : null;

  const entry = { group: isBW ? "bw" : "load", name: exercise, icon: exerciseIconSvg(exercise), tiles: [], notes: [], bigUnit: "", series: "load" };
  if (headline) {
    const rounded = formatKgValue(Math.round(headline.value));
    Object.assign(entry, {
      value: `${rounded} kg`,
      big: rounded,
      bigUnit: "kg",
      label: headline.source === "manual" ? (isBW ? "lest noté" : "1RM noté") : "1RM estimé",
      bigLabel: headline.source === "manual" ? (isBW ? "lest max (noté)" : "1RM noté") : "1RM estimé",
      sub: headline.source === "manual" ? `noté ${recordAgo(headline.date)}` : `${kg(headline.weight)} × ${headline.reps} · ${recordAgo(headline.date)}`,
      origin: headline.source === "manual" ? (headline.date ? `noté le ${recordDay(headline.date)}` : "noté à la main") : `d'après ${kg(headline.weight)} × ${headline.reps} · le ${recordDay(headline.date)}`,
    });
  } else if (showReps) {
    const reps = manualRepsIsBest ? manualReps.reps : sessionReps.value;
    const date = manualRepsIsBest ? manualReps.date : sessionReps.date;
    const lest = !manualRepsIsBest && sessionReps.weight > 0 ? ` · lesté ${kg(sessionReps.weight)}` : "";
    Object.assign(entry, {
      value: `${reps} reps`,
      big: String(reps),
      bigUnit: "reps",
      label: manualRepsIsBest ? "reps notées" : "en une série",
      bigLabel: manualRepsIsBest ? "en une série (noté)" : "en une série",
      sub: `${manualRepsIsBest ? "noté " : ""}${recordAgo(date)}${lest}`,
      origin: date ? `${manualRepsIsBest ? "noté le" : "le"} ${recordDay(date)}${lest}` : "",
      series: "reps",
    });
  } else if (repsOnly) {
    Object.assign(entry, {
      group: "bw",
      value: `${repsOnly.value} reps`,
      big: String(repsOnly.value),
      bigUnit: "reps",
      label: "en une série",
      bigLabel: "en une série, sans charge",
      sub: recordAgo(repsOnly.date),
      origin: repsOnly.date ? `le ${recordDay(repsOnly.date)}` : "",
      series: "reps",
    });
  } else if (weightOnly) {
    Object.assign(entry, {
      group: "load",
      value: kg(weightOnly.value),
      big: formatKgValue(weightOnly.value),
      bigUnit: "kg",
      label: "charge max (WOD)",
      bigLabel: "charge max utilisée en WOD",
      sub: `vue en WOD · ${recordAgo(weightOnly.date)}`,
      origin: `le ${recordDay(weightOnly.date)} · pas de 1RM sans séance de muscu ou de spé`,
    });
  } else {
    Object.assign(entry, { value: "—", big: "—", label: "", bigLabel: "", sub: "", origin: "" });
  }

  // Détails de la fiche (ce qui était sous la valeur dans les anciennes cartes)
  if (!weightOnly && sessionRec && sessionRec.maxWeight && sessionRec.maxWeight.value > 0) {
    const fromWod = sessionRec.maxWeight.source === "crossfit" ? " (vu en WOD)" : "";
    entry.tiles.push({ v: `${kg(sessionRec.maxWeight.value)}${sessionRec.maxWeight.reps ? ` × ${sessionRec.maxWeight.reps}` : ""}`, l: `${isBW ? "Lest max" : "Charge max"}${fromWod}` });
  }
  if (sessionRec && sessionRec.maxReps && !showReps && !repsOnly) {
    entry.tiles.push({ v: `${sessionRec.maxReps.value} reps`, l: sessionRec.maxReps.weight > 0 ? `Reps max (à ${kg(sessionRec.maxReps.weight)})` : "Reps max" });
  }
  if (showReps && manualRepsIsBest && sessionReps) entry.tiles.push({ v: `${sessionReps.value} reps`, l: "En séance" });
  if (showReps && manualReps && !manualRepsIsBest) entry.tiles.push({ v: `${manualReps.reps} reps`, l: "Reps notées" });
  if (manual && isBW && showReps) entry.tiles.push({ v: kg(manual.weight), l: "Lest max noté (1 rep)" });
  else if (manual && estimate && headline && headline.source === "manual" && Math.round(estimate.value) !== Math.round(manual.weight)) {
    entry.tiles.push({ v: kg(Math.round(estimate.value)), l: "Estimé d'après tes séances" });
  } else if (manual && headline && headline.source === "estimated") {
    entry.tiles.push({ v: kg(manual.weight), l: "1RM noté" });
  }
  if (!sessionRec && !showReps) entry.notes.push("Aucune séance de musculation pour cet exercice : seulement ta valeur notée.");

  entry.actions = [];
  if (isBW) {
    entry.actions.push(manualReps
      ? { label: "Modifier mes reps", cls: "edit-reps-link", style: "gold", run: () => open1rmForm(exercise, manualReps, { mode: "reps" }) }
      : { label: "+ Noter mon max de reps", cls: "add-reps-link", style: "gold", run: () => open1rmForm(exercise, null, { mode: "reps" }) });
    if (manual) entry.actions.push({ label: "Modifier le lest noté", cls: "edit-1rm-link", style: "ghost", run: () => open1rmForm(exercise, manual, { mode: "load" }) });
    if (manualReps) entry.actions.push({ label: "Supprimer mes reps notées", cls: "delete-reps-link", style: "danger", run: () => {
      if (!confirm(`Supprimer les reps que tu as notées pour ${exercise} ?`)) return false;
      deleteManualReps(exercise);
      afterManualRecordChange();
    } });
    if (manual) entry.actions.push({ label: "Supprimer le lest noté", cls: "delete-1rm-link", style: "danger", run: () => {
      if (!confirm(`Supprimer le lest max que tu as saisi pour ${exercise} ?`)) return false;
      deleteManualOneRM(exercise);
      afterManualRecordChange();
    } });
  } else if (!repsOnly) {
    entry.actions.push(manual
      ? { label: "Modifier mon 1RM noté", cls: "edit-1rm-link", style: "gold", run: () => open1rmForm(exercise, manual, { mode: "load" }) }
      : { label: "+ Noter mon 1RM connu", cls: "add-1rm-link", style: "gold", run: () => open1rmForm(exercise, null, { mode: "load" }) });
    if (manual) entry.actions.push({ label: "Supprimer mon 1RM noté", cls: "delete-1rm-link", style: "danger", run: () => {
      if (!confirm(`Supprimer le 1RM connu que tu as saisi pour ${exercise} ?`)) return false;
      deleteManualOneRM(exercise);
      afterManualRecordChange();
    } });
  }
  return entry;
}

/** Score d'un niveau : "7:10" ou "15 + 3". */
function formatLevelScore(rec) {
  if (rec.bestTime) return formatSecondsToTime(rec.bestTime.value);
  if (rec.bestPerformance) return `${rec.bestPerformance.rounds}${rec.bestPerformance.extraReps ? ` + ${rec.bestPerformance.extraReps}` : ""}`;
  return "—";
}

/** Le record d'un WOD, niveau par niveau (RX, Inter, Scaled). */
function buildWodRecord(wodName, data) {
  const byLevel = JSON.parse(JSON.stringify(data.cfRecords[wodName] || {}));
  const manual = data.manualCf[wodName] || null;
  if (manual) {
    const level = getCfLevel(manual);
    const rec = (byLevel[level] = byLevel[level] || { bestTime: null, bestPerformance: null });
    if (manual.timeSeconds !== null && manual.timeSeconds !== undefined && (!rec.bestTime || manual.timeSeconds < rec.bestTime.value)) {
      rec.bestTime = { value: manual.timeSeconds, date: manual.date, source: "manual" };
    }
    if (manual.rounds !== null && manual.rounds !== undefined) {
      const perf = { rounds: manual.rounds, extraReps: manual.extraReps || 0, date: manual.date, source: "manual" };
      if (isBetterPerformance(perf, rec.bestPerformance)) rec.bestPerformance = perf;
    }
  }
  const levels = CF_LEVEL_ORDER.filter((level) => byLevel[level]);
  const main = levels[0];
  const mainRec = byLevel[main];
  const mainDate = (mainRec.bestTime || mainRec.bestPerformance).date;
  const preset = typeof BENCHMARK_WODS !== "undefined" ? BENCHMARK_WODS[wodName] : null;
  const latest = getAllSessions().filter((s) => s.type === "crossfit" && s.wodName === wodName).sort((a, b) => (a.date < b.date ? 1 : -1))[0];

  const actions = [];
  if (latest && typeof duplicateCfSession === "function") {
    actions.push({ label: "Refaire ce WOD", cls: "repeat-wod-link", style: "ghost", run: () => {
      if (duplicateCfSession(latest) === false) return false;
      goToSection("crossfit");
      window.scrollTo(0, 0);
    } });
  }
  if (manual) {
    actions.push({ label: "Modifier le résultat noté", cls: "edit-cf-link", style: "gold", run: () => openCfRecordForm(wodName, manual) });
    actions.push({ label: "Supprimer le résultat noté", cls: "delete-cf-link", style: "danger", run: () => {
      if (!confirm(`Supprimer le résultat connu que tu as saisi pour ${wodName} ?`)) return false;
      deleteManualCfBest(wodName);
      renderRecords();
    } });
  } else {
    actions.push({ label: "+ Noter un résultat connu", cls: "add-cf-link", style: "gold", run: () => openCfRecordForm(wodName, null) });
  }

  return {
    group: "wod",
    name: wodName,
    icon: RECORD_WOD_ICON,
    level: main,
    value: formatLevelScore(mainRec),
    label: mainRec.bestTime ? `meilleur temps${mainRec.bestTime.source === "manual" ? " (noté)" : ""}` : `rounds + reps${mainRec.bestPerformance.source === "manual" ? " (noté)" : ""}`,
    sub: levels.length > 1 ? levels.slice(1).map((l) => `${l} ${formatLevelScore(byLevel[l])}`).join(" · ") : recordAgo(mainDate),
    description: preset ? [preset.wodType, ...preset.movements].join(" · ") : "",
    byLevel,
    manual,
    actions,
  };
}

/** Toutes les lignes de la page, dans l'ordre des groupes. */
function buildAllRecordEntries(data) {
  const exerciseNames = Array.from(new Set([
    ...Object.keys(data.sessionRecords), ...Object.keys(data.manualOneRMs), ...Object.keys(data.manualReps),
    ...Object.keys(data.cardioBests), ...Object.keys(data.manualTimes),
  ])).sort((a, b) => a.localeCompare(b, "fr"));
  const wodNames = Array.from(new Set([
    ...Object.keys(data.cfRecords),
    ...Object.keys(data.manualCf).filter((name) => isRecordableWod(name)),
  ])).sort((a, b) => a.localeCompare(b, "fr"));
  return [
    // v28 : un mouvement de WOD noté sans charge ni reps n'a rien à montrer
    ...exerciseNames.map((name) => buildExerciseRecord(name, data)).filter((entry) => entry.value !== "—"),
    ...wodNames.map((name) => buildWodRecord(name, data)),
  ];
}

function renderRecords() {
  const list = document.getElementById("records-list");
  const chips = document.getElementById("records-filters");
  if (!list || !chips) return; // sécurité si la page n'est pas encore dans le DOM

  renderRecordFeed();
  const entries = buildAllRecordEntries(collectRecordData());

  // Pastilles de filtre (avec le nombre de records) ; un groupe vide n'en a pas
  const counts = {};
  RECORD_GROUPS.forEach((g) => { counts[g.id] = entries.filter((e) => e.group === g.id).length; });
  if (recordsFilter !== "all" && !counts[recordsFilter]) recordsFilter = "all";
  chips.innerHTML = [{ id: "all", chip: "Tout" }, ...RECORD_GROUPS]
    .filter((g) => g.id === "all" || counts[g.id] > 0)
    .map((g) => `<button type="button" class="rc-chip${recordsFilter === g.id ? " on" : ""}" data-filter="${g.id}" aria-pressed="${recordsFilter === g.id}">${g.chip}<small>${g.id === "all" ? entries.length : counts[g.id]}</small></button>`)
    .join("");
  chips.hidden = entries.length === 0;
  const search = document.getElementById("records-search");
  if (search) search.hidden = entries.length === 0;

  list.innerHTML = "";
  if (entries.length === 0) {
    list.innerHTML = `<p class="rc-empty">Ajoute une séance ou note une perf pour voir apparaître tes records ici. Pour les WOD, il faut un nom (Fran, Murph…) : le « WOD du jour » change à chaque fois, il n'a pas de record.</p>`;
    return;
  }

  const query = typeof normalizeSearchText === "function" ? normalizeSearchText(recordsQuery) : recordsQuery.toLowerCase().trim();
  const matches = (e) => !query || (e.group === "wod"
    ? normalizeSearchText(e.name).includes(query)
    : (typeof exerciseMatchesSearch === "function" ? exerciseMatchesSearch(e.name, query) : e.name.toLowerCase().includes(query)));
  const visible = entries.filter((e) => (recordsFilter === "all" || e.group === recordsFilter) && matches(e));
  if (visible.length === 0) {
    list.innerHTML = `<p class="rc-empty">Aucun record ne correspond à « ${escapeHtml(recordsQuery.trim())} ».</p>`;
    return;
  }

  RECORD_GROUPS.forEach((group) => {
    const rows = visible.filter((e) => e.group === group.id);
    if (rows.length === 0) return;
    if (recordsFilter === "all") list.insertAdjacentHTML("beforeend", `<div class="rc-group">${group.title}</div>`);
    const box = document.createElement("div");
    box.className = "rc-list";
    rows.forEach((entry) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "rc-row";
      row.dataset.record = entry.name;
      row.innerHTML = `
        <span class="rf-ex-ic">${entry.icon}</span>
        <span class="rc-main"><span class="rc-name">${escapeHtml(entry.name)}</span>${entry.sub ? `<span class="rc-sub">${escapeHtml(entry.sub)}</span>` : ""}</span>
        <span class="rc-val"><b>${entry.level ? `<span class="rc-lvl ${getLevelBadgeClass(entry.level)}">${entry.level}</span>` : ""}${escapeHtml(entry.value)}</b>${entry.label ? `<small>${escapeHtml(entry.label)}</small>` : ""}</span>
        <span class="rc-chev" aria-hidden="true">›</span>`;
      row.addEventListener("click", () => openRecordSheet(entry));
      box.appendChild(row);
    });
    list.appendChild(box);
  });
}

// --------------------------------------------------------------------------
// FICHE DÉTAILLÉE (en touchant une ligne ou une carte du fil)
// --------------------------------------------------------------------------

/** Points de la courbe : la meilleure valeur de chaque séance. */
function buildRecordSeries(name, kind) {
  const byDate = {};
  const better = (a, b) => (kind === "time" ? a < b : a > b);
  const add = (date, value) => {
    if (!(value > 0)) return;
    if (byDate[date] === undefined || better(value, byDate[date])) byDate[date] = value;
  };
  getAllSessions().forEach((session) => {
    (session.exercises || []).forEach((entry) => {
      if (!entry || typeof entry !== "object" || entry.exercise !== name) return;
      if (kind === "time") {
        if (session.type === "musculation" && entry.kind === "cardio") add(session.date, entry.timeSeconds);
        return;
      }
      let sets = [];
      if (session.type === "musculation" && Array.isArray(entry.sets)) sets = entry.sets;
      else if (session.type === "crossfit" && typeof isSpeSession === "function" && isSpeSession(session.wodName) && getEntryUnit(entry) === "reps") sets = [{ reps: entry.reps, weight: entry.weight || 0, warmup: entry.warmup }];
      sets.forEach((set) => {
        if (!set || set.warmup === true) return;
        add(session.date, kind === "reps" ? set.reps : (set.weight > 0 && set.reps > 0 ? estimateOneRepMax(set.weight, set.reps) : 0));
      });
    });
  });
  return Object.keys(byDate).sort().map((date) => ({ date, value: byDate[date] }));
}

/** Petite courbe en SVG (les 12 dernières séances). Plus haut = mieux, même pour un temps. */
function renderRecordChart(points, kind) {
  const pts = points.slice(-12);
  if (pts.length < 2) return "";
  const W = 320, H = 110, padX = 14, top = 12, bottom = 22;
  const values = pts.map((p) => p.value);
  let min = Math.min(...values), max = Math.max(...values);
  if (max - min < 1e-9) { min -= 1; max += 1; }
  const x = (i) => padX + (i * (W - 2 * padX)) / (pts.length - 1);
  const y = (v) => {
    const t = (v - min) / (max - min);
    return top + (kind === "time" ? t : 1 - t) * (H - top - bottom);
  };
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const first = pts[0], last = pts[pts.length - 1];
  const days = Math.round((parseLocalDate(last.date) - parseLocalDate(first.date)) / 86400000);
  const span = days < 14 ? `en ${Math.max(days, 1)} j` : days < 60 ? `en ${Math.round(days / 7)} sem.` : `en ${Math.round(days / 30)} mois`;
  let delta = "";
  let good = false;
  if (kind === "time") {
    const diff = Math.round(last.value - first.value);
    good = diff < 0;
    delta = diff === 0 ? "stable" : `${diff < 0 ? "−" : "+"}${formatDuration(Math.abs(diff))} ${span}`;
  } else if (kind === "reps") {
    const diff = last.value - first.value;
    good = diff > 0;
    delta = diff === 0 ? "stable" : `${diff > 0 ? "+" : "−"}${Math.abs(diff)} rep${Math.abs(diff) > 1 ? "s" : ""} ${span}`;
  } else {
    const diff = Math.round(last.value - first.value);
    good = diff > 0;
    delta = diff === 0 ? "stable" : `${diff > 0 ? "+" : "−"}${Math.abs(diff)} kg ${span}`;
  }
  const title = kind === "time" ? "Temps (plus haut = plus rapide)" : kind === "reps" ? "Reps max par séance" : "1RM estimé par séance";
  return `
    <div class="rc-chart">
      <div class="rc-chart-h"><span>${title}</span><span class="${good ? "good" : ""}">${escapeHtml(delta)}</span></div>
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${escapeHtml(title)}">
        <defs><linearGradient id="rcGrad" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#D3A24E" stop-opacity=".35"/><stop offset="1" stop-color="#D3A24E" stop-opacity="0"/></linearGradient></defs>
        <path d="${line} L${x(pts.length - 1).toFixed(1)} ${H - bottom + 4} L${x(0).toFixed(1)} ${H - bottom + 4} Z" fill="url(#rcGrad)"/>
        <path d="${line}" fill="none" stroke="#E3B566" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        ${pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="4" fill="#17191C" stroke="#E3B566" stroke-width="2.5"/>`).join("")}
        <text x="${x(0)}" y="${H - 4}" fill="#7B7F86" font-size="10" text-anchor="start">${escapeHtml(recordDay(first.date))}</text>
        <text x="${x(pts.length - 1)}" y="${H - 4}" fill="#7B7F86" font-size="10" text-anchor="end">${escapeHtml(recordDay(last.date))}</text>
      </svg>
    </div>`;
}

/** Boutons de la fiche : chaque action ferme la fiche puis s'exécute. */
function appendRecordActions(sheet, close, actions) {
  const main = actions.filter((a) => a.style !== "danger");
  const danger = actions.filter((a) => a.style === "danger");
  const box = document.createElement("div");
  box.className = "rc-actions";
  main.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `rf-btn ${action.style === "gold" ? "rf-btn-gold" : "rf-btn-ghost"} ${action.cls}`;
    button.textContent = action.label;
    button.addEventListener("click", () => { close(); action.run(); });
    box.appendChild(button);
  });
  if (main.length === 1) box.classList.add("single");
  sheet.appendChild(box);
  danger.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `rf-link-danger ${action.cls}`;
    button.textContent = action.label;
    button.addEventListener("click", () => { if (action.run() !== false) close(); });
    sheet.appendChild(button);
  });
}

function openRecordSheet(entry) {
  if (entry.group === "wod") return openWodRecordSheet(entry);
  return openSheet((sheet, close) => {
    sheet.classList.add("rc-sheet");
    const hint = typeof EXERCISE_FRENCH_HINTS !== "undefined" ? EXERCISE_FRENCH_HINTS[entry.name] : "";
    const events = computeRecordHistory().filter((e) => e.target && e.target.section === "exercise" && e.title === entry.name).slice(0, 8);
    sheet.insertAdjacentHTML("beforeend", `
      <div class="rc-sheet-head"><span class="rf-ex-ic">${entry.icon}</span><div><h2>${escapeHtml(entry.name)}</h2>${hint ? `<div class="rf-ex-sub">${escapeHtml(hint)}</div>` : ""}</div></div>
      <div class="rc-big"><b>${escapeHtml(entry.big)}</b>${entry.bigUnit || entry.bigLabel ? `<span>${escapeHtml([entry.bigUnit, entry.bigLabel].filter(Boolean).join(" · "))}</span>` : ""}</div>
      ${entry.origin ? `<div class="rc-origin">${escapeHtml(entry.origin)}</div>` : ""}
      ${entry.tiles.length ? `<div class="rf-stats">${entry.tiles.map((t) => `<div class="rf-stat"><b>${escapeHtml(t.v)}</b><span>${escapeHtml(t.l)}</span></div>`).join("")}</div>` : ""}
      ${entry.notes.map((n) => `<p class="rc-note">${escapeHtml(n)}</p>`).join("")}
      ${renderRecordChart(buildRecordSeries(entry.name, entry.series), entry.series)}
      ${events.length ? `<div class="rf-cmp-h">Records battus</div><div class="rc-timeline">${events.map((e) => `<div><span>${escapeHtml(recordDay(e.date))}</span><b>${escapeHtml(e.value)}</b><em>${escapeHtml(e.gain)}</em></div>`).join("")}</div>` : ""}`);
    appendRecordActions(sheet, close, entry.actions);
  });
}

function openWodRecordSheet(entry) {
  return openSheet((sheet, close) => {
    sheet.classList.add("rc-sheet");
    const sessions = getAllSessions()
      .filter((s) => s.type === "crossfit" && s.wodName === entry.name)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const score = (s) => (s.timeSeconds > 0 ? formatSecondsToTime(s.timeSeconds) : typeof s.rounds === "number" ? `${s.rounds}${s.extraReps ? ` + ${s.extraReps}` : ""} rounds` : "—");
    const isBest = (s) => {
      const rec = entry.byLevel[getCfLevel(s)];
      if (!rec) return false;
      if (rec.bestTime && s.timeSeconds > 0) return rec.bestTime.source !== "manual" && rec.bestTime.value === s.timeSeconds && rec.bestTime.date === s.date;
      if (rec.bestPerformance && typeof s.rounds === "number") return rec.bestPerformance.source !== "manual" && rec.bestPerformance.rounds === s.rounds && (rec.bestPerformance.extraReps || 0) === (s.extraReps || 0) && rec.bestPerformance.date === s.date;
      return false;
    };
    const rows = sessions.slice(0, 10).map((s) => {
      const level = getCfLevel(s);
      return `<div><span>${escapeHtml(recordDay(s.date))}</span><b><span class="rc-lvl ${getLevelBadgeClass(level)}">${level}</span>${escapeHtml(score(s))}</b>${isBest(s) ? "<em>record</em>" : "<i></i>"}</div>`;
    });
    if (entry.manual) {
      const level = getCfLevel(entry.manual);
      const value = entry.manual.timeSeconds > 0 ? formatSecondsToTime(entry.manual.timeSeconds) : `${entry.manual.rounds}${entry.manual.extraReps ? ` + ${entry.manual.extraReps}` : ""} rounds`;
      rows.push(`<div><span>${entry.manual.date ? escapeHtml(recordDay(entry.manual.date)) : "—"}</span><b><span class="rc-lvl ${getLevelBadgeClass(level)}">${level}</span>${escapeHtml(value)}</b><em class="noted">noté</em></div>`);
    }
    sheet.insertAdjacentHTML("beforeend", `
      <div class="rc-sheet-head"><span class="rf-ex-ic">${RECORD_WOD_ICON}</span><div><h2>${escapeHtml(entry.name)}</h2>${entry.description ? `<div class="rf-ex-sub">${escapeHtml(entry.description)}</div>` : ""}</div></div>
      <div class="rc-levels">${CF_LEVEL_ORDER.map((level) => {
        const rec = entry.byLevel[level];
        const date = rec ? (rec.bestTime || rec.bestPerformance || {}).date : null;
        const noted = rec && ((rec.bestTime && rec.bestTime.source === "manual") || (!rec.bestTime && rec.bestPerformance && rec.bestPerformance.source === "manual"));
        return `<div class="${rec ? "" : "empty"}"><span class="rc-lvl ${getLevelBadgeClass(level)}">${level}</span><b>${rec ? escapeHtml(formatLevelScore(rec)) : "—"}</b><small>${rec ? `${noted ? "noté " : ""}${date ? `le ${escapeHtml(recordDay(date))}` : ""}` : "pas encore"}</small></div>`;
      }).join("")}</div>
      ${rows.length ? `<div class="rf-cmp-h">Tous tes ${escapeHtml(entry.name)}</div><div class="rc-timeline">${rows.join("")}</div>` : ""}`);
    appendRecordActions(sheet, close, entry.actions);
  });
}

/** Ouvre la fiche d'un exercice ou d'un WOD par son nom (fil des records). */
function openRecordSheetByName(name, kind) {
  const entry = buildAllRecordEntries(collectRecordData()).find((e) => e.name === name && (kind === "wod" ? e.group === "wod" : e.group !== "wod"));
  if (entry) openRecordSheet(entry);
}

// ----- En-tête : « + Noter une perf », explication ⓘ, recherche, filtres -----
const btnNotePerf = document.getElementById("btn-note-perf");
if (btnNotePerf) {
  btnNotePerf.addEventListener("click", () => openActionSheet("Noter une perf", [
    { label: "Un exercice : charge, reps ou temps", onClick: () => open1rmForm(null, null) },
    { label: "Un WOD : temps ou rounds", onClick: () => openCfRecordForm(null, null) },
  ]));
}
const recordsInfoBtn = document.getElementById("records-info-btn");
if (recordsInfoBtn) {
  recordsInfoBtn.addEventListener("click", () => openSheet((sheet, close) => {
    sheet.insertAdjacentHTML("beforeend", `
      <h2>Comment sont calculés tes records ?</h2>
      <p class="rc-info-p"><b>1RM estimé</b> : calculé à partir de tes séries avec la formule d'Epley, seulement avec les séries de 10 reps maximum. Au-delà, c'est la charge soulevée qui compte. Une estimation n'est jamais une valeur mesurée.</p>
      <p class="rc-info-p"><b>1RM noté</b> : une charge que tu as vraiment testée et notée à la main. Elle est affichée si elle est plus haute que l'estimation.</p>
      <p class="rc-info-p"><b>Poids du corps</b> : le plus de reps d'affilée en une série. <b>Cardio</b> : ton meilleur temps. <b>WOD</b> : ton meilleur score, niveau par niveau (RX, Inter, Scaled) ; le « WOD du jour » n'a pas de record.</p>
      <p class="rc-info-p">Les séries d'échauffement ne comptent jamais.</p>
      <button type="button" class="rf-btn rf-btn-gold rf-btn-wide" data-act="close">Compris</button>`);
    sheet.querySelector('[data-act="close"]').addEventListener("click", close);
  }));
}
const recordsSearchInput = document.getElementById("records-search");
if (recordsSearchInput) {
  recordsSearchInput.addEventListener("input", () => { recordsQuery = recordsSearchInput.value; renderRecords(); });
}
const recordsFiltersEl = document.getElementById("records-filters");
if (recordsFiltersEl) {
  recordsFiltersEl.addEventListener("click", (event) => {
    const chip = event.target.closest(".rc-chip");
    if (!chip) return;
    recordsFilter = chip.dataset.filter;
    renderRecords();
  });
}

/**
 * HISTORIQUE DES RECORDS BATTUS
 * On rejoue toutes les séances dans l'ordre chronologique et on note chaque
 * fois qu'un record est BATTU (la toute première fois ne compte pas : il n'y
 * avait rien à battre). Mêmes règles que le reste de l'appli :
 *  - exercice avec charge : 1RM estimé (Epley jusqu'à 10 reps) — Musculation
 *    et cours de spé ;
 *  - exercice au poids du corps : reps max en une série ;
 *  - test cardio (rameur, course) : meilleur temps ;
 *  - WOD avec un nom : meilleur temps ou meilleure performance, à niveau égal.
 * Renvoie la liste, du plus récent au plus ancien :
 * { date, title, value, gain, detail, target: { section, name } }
 */
function computeRecordHistory() {
  const sessions = getAllSessions()
    .map((session, index) => ({ session, index }))
    .sort((a, b) => (a.session.date < b.session.date ? -1 : a.session.date > b.session.date ? 1 : a.index - b.index))
    .map((item) => item.session);

  const best = {};
  const events = [];
  const kg = (v) => `${formatNumberFr(Math.round(v * 10) / 10)} kg`;

  sessions.forEach((session) => {
    // ---- Musculation, cours de spé et tests cardio ----
    let entries = [];
    if (session.type === "musculation") {
      (session.exercises || []).forEach((entry) => {
        if (!entry) return;
        if (entry.kind === "cardio") {
          if (entry.timeSeconds > 0) entries.push({ name: entry.exercise, time: entry.timeSeconds });
        } else if (Array.isArray(entry.sets)) {
          entries.push({ name: entry.exercise, sets: entry.sets.filter((set) => set && set.warmup !== true) });
        }
      });
    } else if (session.type === "crossfit" && typeof isSpeSession === "function" && isSpeSession(session.wodName)) {
      entries = (session.exercises || [])
        .filter((e) => typeof e === "object" && e !== null && e.reps > 0 && getEntryUnit(e) === "reps" && e.warmup !== true)
        .map((e) => ({ name: e.exercise, sets: [{ reps: e.reps, weight: e.weight || 0 }] }));
    }

    // Une même séance peut contenir plusieurs fois l'exercice : on garde sa meilleure série
    const top = {};
    entries.forEach((entry) => {
      if (entry.time) {
        const key = "time:" + entry.name;
        if (!top[key] || entry.time < top[key].value) top[key] = { name: entry.name, value: entry.time, mode: "time" };
        return;
      }
      const isBW = typeof isBodyweightExercise === "function" && isBodyweightExercise(entry.name);
      entry.sets.forEach((set) => {
        const value = isBW ? set.reps || 0 : set.weight > 0 && set.reps > 0 ? estimateOneRepMax(set.weight, set.reps) : 0;
        const key = (isBW ? "reps:" : "load:") + entry.name;
        if (value > 0 && (!top[key] || value > top[key].value)) top[key] = { name: entry.name, value, set, mode: isBW ? "reps" : "load" };
      });
    });

    Object.entries(top).forEach(([key, t]) => {
      const previous = best[key];
      const better = previous === undefined ? false : t.mode === "time" ? t.value < previous : t.value > previous + 1e-9;
      if (better) {
        let value, gain, detail = "";
        if (t.mode === "time") {
          value = formatDuration(t.value);
          gain = `−${formatDuration(previous - t.value)}`;
          detail = "test chrono";
        } else if (t.mode === "reps") {
          value = `${t.value} reps`;
          gain = `+${t.value - previous} rep${t.value - previous > 1 ? "s" : ""}`;
          detail = t.set.weight > 0 ? `lesté ${formatNumberFr(t.set.weight)} kg` : "";
        } else {
          value = kg(t.value);
          gain = `+${kg(t.value - previous)}`;
          detail = `${formatNumberFr(t.set.weight)} kg × ${t.set.reps}`;
        }
        events.push({ date: session.date, sessionId: session.id, title: t.name, value, gain, detail, target: { section: "exercise", name: t.name } });
      }
      if (previous === undefined || better) best[key] = t.value;
    });

    // ---- WOD avec un nom, par niveau ----
    if (session.type === "crossfit" && isRecordableWod(session.wodName)) {
      const level = getCfLevel(session);
      const title = `${session.wodName} ${level}`;
      if (session.timeSeconds !== null && session.timeSeconds !== undefined) {
        const key = `wodtime:${session.wodName}:${level}`;
        const previous = best[key];
        if (previous !== undefined && session.timeSeconds < previous) {
          events.push({ date: session.date, title, value: formatSecondsToTime(session.timeSeconds), gain: `−${formatSecondsToTime(previous - session.timeSeconds)}`, detail: "", target: { section: "wod", name: session.wodName } });
        }
        if (previous === undefined || session.timeSeconds < previous) best[key] = session.timeSeconds;
      }
      if (session.rounds !== null && session.rounds !== undefined) {
        const key = `wodperf:${session.wodName}:${level}`;
        const perf = { rounds: session.rounds, extraReps: session.extraReps || 0 };
        const previous = best[key];
        if (previous !== undefined && isBetterPerformance(perf, previous)) {
          const roundGain = perf.rounds - previous.rounds;
          const gain = roundGain > 0 ? `+${roundGain} round${roundGain > 1 ? "s" : ""}` : `+${perf.extraReps - previous.extraReps} reps`;
          events.push({ date: session.date, title, value: `${perf.rounds}${perf.extraReps ? ` + ${perf.extraReps}` : ""} rounds`, gain, detail: "", target: { section: "wod", name: session.wodName } });
        }
        if (previous === undefined || isBetterPerformance(perf, previous)) best[key] = perf;
      }
    }
  });

  return events.reverse();
}

/**
 * Nombre de records battus depuis une date ("AAAA-MM-JJ") : chaque fois que
 * tu fais mieux qu'avant compte (même règle que le fil de la page Records).
 */
function countRecordsBeatenSince(startDate) {
  return computeRecordHistory().filter((event) => event.date >= startDate).length;
}

// --------------------------------------------------------------------------
// FIL "DERNIERS RECORDS BATTUS" (en haut de la page Records)
// --------------------------------------------------------------------------

/** Les derniers records battus, en petites cartes qui défilent de côté. */
function renderRecordFeed() {
  const container = document.getElementById("record-feed");
  if (!container) return;
  const events = computeRecordHistory();
  const now = new Date();
  const monthStart = toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
  const thisMonth = events.filter((e) => e.date >= monthStart).length;

  const badge = document.getElementById("record-feed-count");
  if (badge) badge.textContent = `${thisMonth} ce mois-ci`;

  if (events.length === 0) {
    container.innerHTML = `<p class="rc-feed-empty">Aucun record battu pour l'instant. Ils apparaîtront ici dès que tu feras mieux qu'avant sur un exercice, un test chrono ou un WOD.</p>`;
    return;
  }

  const shown = events.slice(0, 10);
  container.innerHTML = shown.map((e, i) => `
    <button type="button" class="rc-fc" data-i="${i}">
      <span class="n">${escapeHtml(e.title)}</span>
      <span class="v">${escapeHtml(e.value)}</span>
      <span class="g">${escapeHtml(e.gain)}</span>
      <span class="d">${escapeHtml(recordDay(e.date))}</span>
    </button>`).join("");
  container.querySelectorAll(".rc-fc").forEach((card) => card.addEventListener("click", () => {
    const event = shown[Number(card.dataset.i)];
    if (event && event.target) openRecordSheetByName(event.target.name, event.target.section === "wod" ? "wod" : "exercise");
  }));
}

/** 87.5 → "87,5" ; 60 → "60" (kilos à la française). */
function formatKgValue(value) {
  return formatNumberFr(value);
}

// --------------------------------------------------------------------------
// FORMULAIRE "NOTER UNE PERF" — 1RM / lest, reps max, meilleur temps
// --------------------------------------------------------------------------

function populateManual1rmExerciseSelect() {
  if (!manual1rmExerciseSelect) return;
  const exercises = typeof getAllKnownExercises === "function" ? getAllKnownExercises() : [];
  const label = (ex) => (typeof exerciseOptionLabel === "function" ? exerciseOptionLabel(ex) : ex);
  manual1rmExerciseSelect.innerHTML = "";
  exercises.forEach((ex) => {
    const opt = document.createElement("option");
    opt.value = ex;
    opt.textContent = label(ex);
    manual1rmExerciseSelect.appendChild(opt);
  });
  // Tests cardio : on y note un meilleur temps
  const cardioTests = typeof CARDIO_TESTS !== "undefined" ? CARDIO_TESTS : [];
  if (cardioTests.length > 0) {
    const group = document.createElement("optgroup");
    group.label = "Tests cardio";
    cardioTests.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = label(name);
      group.appendChild(opt);
    });
    manual1rmExerciseSelect.appendChild(group);
  }
  const customOpt = document.createElement("option");
  customOpt.value = "__custom__";
  customOpt.textContent = "+ Autre exercice…";
  manual1rmExerciseSelect.appendChild(customOpt);
}

// ----- Ce que le formulaire demande selon l'exercice -----
// "load" : charge max (ou lest max pour un exercice au poids du corps)
// "reps" : reps max d'affilée, sans lest (exercices au poids du corps)
// "time" : meilleur temps (tests cardio)
const manualPerfModeRow = document.getElementById("manual-perf-mode-row");
const manualPerfModeGroup = document.getElementById("manual-perf-mode");
const manualValueRow = document.getElementById("manual-value-row");
const manualValueLabel = document.getElementById("manual-value-label");
const manualValueHint = document.getElementById("manual-value-hint");
const manualTimeFields = document.getElementById("manual-time-fields");
const manualTimeMinInput = document.getElementById("manual-time-min");
const manualTimeSecInput = document.getElementById("manual-time-sec");
const manual1rmSubmitBtn = document.getElementById("manual-1rm-submit");
const manual1rmFeedback = document.getElementById("manual-1rm-feedback");

let manualPerfMode = "load";
// Quand le formulaire a été ouvert depuis le Profil : { itemId } pour y revenir ensuite
let manualPerfReturn = null;

function getManualFormExercise() {
  if (!manual1rmExerciseSelect) return "";
  return manual1rmExerciseSelect.value === "__custom__" ? manual1rmExerciseCustom.value.trim() : manual1rmExerciseSelect.value;
}

function isCardioTestName(name) {
  return typeof CARDIO_TESTS !== "undefined" && CARDIO_TESTS.includes(name);
}

function isBodyweightName(name) {
  return typeof isBodyweightExercise === "function" && isBodyweightExercise(name);
}

/** Le mode par défaut d'un exercice : temps pour un test cardio, reps pour le poids du corps, charge sinon. */
function defaultPerfMode(name) {
  if (isCardioTestName(name)) return "time";
  if (isBodyweightName(name)) return "reps";
  return "load";
}

function showManualFeedback(message) {
  if (manual1rmFeedback) manual1rmFeedback.textContent = message || "";
}

/** Adapte libellés, champs et bouton au mode choisi. */
function applyManualPerfMode(mode) {
  const name = getManualFormExercise();
  const isBW = isBodyweightName(name);
  manualPerfMode = mode;

  if (manualPerfModeRow) manualPerfModeRow.style.display = isBW ? "" : "none";
  if (manualPerfModeGroup) {
    manualPerfModeGroup.querySelectorAll("button[data-mode]").forEach((button) => {
      const selected = button.dataset.mode === mode;
      button.classList.toggle("on", selected);
      button.setAttribute("aria-checked", selected ? "true" : "false");
    });
  }

  const isTime = mode === "time";
  manual1rmWeightInput.style.display = isTime ? "none" : "";
  if (manualTimeFields) manualTimeFields.style.display = isTime ? "" : "none";
  if (manualValueRow) manualValueRow.classList.toggle("is-stacked", isTime);

  if (mode === "reps") {
    manualValueLabel.textContent = "Reps d'affilée";
    manualValueLabel.setAttribute("for", "manual-1rm-weight");
    manual1rmWeightInput.step = "1";
    manual1rmWeightInput.setAttribute("inputmode", "numeric");
    manual1rmWeightInput.placeholder = "ex : 12";
    manualValueHint.textContent = "Sans lest, en une seule série";
    manual1rmSubmitBtn.textContent = "Enregistrer ces reps";
  } else if (isTime) {
    manualValueLabel.textContent = "Meilleur temps";
    manualValueLabel.setAttribute("for", "manual-time-min");
    manualValueHint.textContent = "";
    manual1rmSubmitBtn.textContent = "Enregistrer ce temps";
  } else {
    manualValueLabel.textContent = isBW ? "Lest max (1 rep, kg)" : "Charge max (1 rep, kg)";
    manualValueLabel.setAttribute("for", "manual-1rm-weight");
    manual1rmWeightInput.step = "0.5";
    manual1rmWeightInput.setAttribute("inputmode", "decimal");
    manual1rmWeightInput.placeholder = isBW ? "ex : 10" : "ex : 100";
    manualValueHint.textContent = isBW ? "Charge ajoutée en plus de ton poids de corps" : "";
    manual1rmSubmitBtn.textContent = isBW ? "Enregistrer ce lest" : "Enregistrer ce 1RM";
  }
}

/** Remplit la valeur et la date avec ce qui a déjà été noté pour cet exercice dans ce mode (ou vide). */
function fillManualPerfValues(existing) {
  const name = getManualFormExercise();
  let entry = existing;
  if (entry === undefined) {
    if (manualPerfMode === "reps") entry = getManualReps()[name] || null;
    else if (manualPerfMode === "time") entry = getManualTimes()[name] || null;
    else entry = getManualOneRMs()[name] || null;
  }
  manual1rmWeightInput.value = "";
  if (manualTimeMinInput) manualTimeMinInput.value = "";
  if (manualTimeSecInput) manualTimeSecInput.value = "";
  if (entry) {
    if (manualPerfMode === "reps") manual1rmWeightInput.value = entry.reps;
    else if (manualPerfMode === "time" && entry.timeSeconds > 0) {
      const minutes = Math.floor(entry.timeSeconds / 60);
      const seconds = Math.round((entry.timeSeconds - minutes * 60) * 10) / 10;
      manualTimeMinInput.value = String(minutes);
      manualTimeSecInput.value = String(seconds).replace(".", ",");
    } else if (manualPerfMode === "load") manual1rmWeightInput.value = entry.weight;
  }
  manual1rmDateInput.value = entry && entry.date ? entry.date : todayLocalDateString();
  manual1rmNotesInput.value = entry ? entry.notes || "" : "";
}

/**
 * Ouvre le formulaire "Noter une perf".
 * options.mode : "load", "reps" ou "time" (par défaut : selon l'exercice)
 * options.returnTo : { itemId } pour revenir sur cette carte du Profil après
 */
function open1rmForm(exerciseToPrefill, existingManualEntry, options) {
  const opts = options || {};
  populateManual1rmExerciseSelect();
  manual1rmExerciseCustom.style.display = "none";
  manual1rmExerciseCustom.value = "";

  if (exerciseToPrefill) {
    const exists = [...manual1rmExerciseSelect.options].some((o) => o.value === exerciseToPrefill);
    if (exists) {
      manual1rmExerciseSelect.value = exerciseToPrefill;
    } else {
      manual1rmExerciseSelect.value = "__custom__";
      manual1rmExerciseCustom.style.display = "block";
      manual1rmExerciseCustom.value = exerciseToPrefill;
    }
  }

  manualPerfReturn = opts.returnTo || null;
  showManualFeedback("");
  applyManualPerfMode(opts.mode || defaultPerfMode(getManualFormExercise()));
  fillManualPerfValues(existingManualEntry || undefined);

  manual1rmForm.style.display = "block";
  manual1rmForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeManualPerfForm() {
  manual1rmForm.style.display = "none";
  manual1rmForm.reset();
  showManualFeedback("");
  const target = manualPerfReturn;
  manualPerfReturn = null;
  return target;
}

/** Retour sur la carte du Profil d'où l'on venait, mise en évidence un instant. */
function returnToProfileCard(target) {
  if (!target || typeof goToSection !== "function") return;
  goToSection("profil");
  const card = document.querySelector(`#profile-content [data-rank-item="${target.itemId}"]`);
  if (!card) return;
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.classList.add("is-highlighted");
  setTimeout(() => card.classList.remove("is-highlighted"), 1600);
}

if (manual1rmExerciseSelect) {
  manual1rmExerciseSelect.addEventListener("change", () => {
    const isCustom = manual1rmExerciseSelect.value === "__custom__";
    manual1rmExerciseCustom.style.display = isCustom ? "block" : "none";
    showManualFeedback("");
    applyManualPerfMode(defaultPerfMode(getManualFormExercise()));
    fillManualPerfValues();
  });
}

if (manualPerfModeGroup) {
  manualPerfModeGroup.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-mode]");
    if (!button || button.dataset.mode === manualPerfMode) return;
    showManualFeedback("");
    applyManualPerfMode(button.dataset.mode);
    fillManualPerfValues();
  });
}

if (btnCancel1rmForm) {
  btnCancel1rmForm.addEventListener("click", () => returnToProfileCard(closeManualPerfForm()));
}

if (manual1rmForm) {
  manual1rmForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const exercise = getManualFormExercise();
    if (!exercise) {
      showManualFeedback("Choisis ou écris le nom de l'exercice.");
      return;
    }
    const date = manual1rmDateInput.value || todayLocalDateString();
    const notes = manual1rmNotesInput.value.trim();
    const rawValue = String(manual1rmWeightInput.value).trim().replace(",", ".");

    if (manualPerfMode === "reps") {
      const reps = Number(rawValue);
      if (!Number.isInteger(reps) || reps < 1 || reps > 1000) {
        showManualFeedback("Indique un nombre de reps entier (au moins 1).");
        return;
      }
      setManualReps(exercise, { reps, date, notes });
    } else if (manualPerfMode === "time") {
      const timeSeconds = typeof readCardioTime === "function"
        ? readCardioTime({ querySelector: (sel) => (sel === ".cardio-block-min" ? manualTimeMinInput : manualTimeSecInput) })
        : null;
      if (!timeSeconds) {
        showManualFeedback("Indique un temps valide (minutes et secondes).");
        return;
      }
      setManualTime(exercise, { timeSeconds, date, notes });
    } else {
      const weight = Number(rawValue);
      if (!Number.isFinite(weight) || weight <= 0) {
        showManualFeedback("Indique une charge en kg.");
        return;
      }
      setManualOneRM(exercise, { weight, date, notes });
    }

    const returnTarget = closeManualPerfForm();
    renderRecords();
    // Les perfs notées comptent pour les rangs (force, haltéro, gym, endurance)
    if (typeof notifyRankProgress === "function") notifyRankProgress();
    if (typeof renderDashboard === "function") renderDashboard();
    returnToProfileCard(returnTarget);
  });
}

// --------------------------------------------------------------------------
// FORMULAIRE "RÉSULTAT CONNU" (CrossFit) — même principe
// --------------------------------------------------------------------------

function populateManualCfWodSelect() {
  if (!manualCfWodSelect) return;
  const wods = typeof getAllKnownWods === "function" ? getAllKnownWods() : [];
  manualCfWodSelect.innerHTML = "";
  wods.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    manualCfWodSelect.appendChild(opt);
  });
  const customOpt = document.createElement("option");
  customOpt.value = "__custom__";
  customOpt.textContent = "+ Autre WOD…";
  manualCfWodSelect.appendChild(customOpt);
}

function openCfRecordForm(wodToPrefill, existingManualEntry) {
  populateManualCfWodSelect();

  if (wodToPrefill) {
    const exists = [...manualCfWodSelect.options].some((o) => o.value === wodToPrefill);
    if (exists) {
      manualCfWodSelect.value = wodToPrefill;
      manualCfWodCustom.style.display = "none";
    } else {
      manualCfWodSelect.value = "__custom__";
      manualCfWodCustom.style.display = "block";
      manualCfWodCustom.value = wodToPrefill;
    }
  }

  manualCfTimeInput.value = existingManualEntry && existingManualEntry.timeSeconds != null
    ? formatSecondsToTime(existingManualEntry.timeSeconds) : "";
  manualCfRoundsInput.value = existingManualEntry && existingManualEntry.rounds != null ? existingManualEntry.rounds : "";
  manualCfExtraRepsInput.value = existingManualEntry && existingManualEntry.extraReps != null ? existingManualEntry.extraReps : "";
  manualCfDateInput.value = existingManualEntry ? existingManualEntry.date : todayLocalDateString();
  manualCfNotesInput.value = existingManualEntry ? existingManualEntry.notes || "" : "";
  if (manualCfLevelSelect) manualCfLevelSelect.value = existingManualEntry ? getCfLevel(existingManualEntry) : "RX";

  manualCfForm.style.display = "block";
  manualCfForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

if (manualCfWodSelect) {
  manualCfWodSelect.addEventListener("change", () => {
    const isCustom = manualCfWodSelect.value === "__custom__";
    manualCfWodCustom.style.display = isCustom ? "block" : "none";
  });
}

if (btnCancelCfForm) {
  btnCancelCfForm.addEventListener("click", () => { manualCfForm.style.display = "none"; manualCfForm.reset(); });
}

if (manualCfForm) {
  manualCfForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const isCustom = manualCfWodSelect.value === "__custom__";
    const wodName = isCustom ? manualCfWodCustom.value.trim() : manualCfWodSelect.value;
    if (!wodName) return;

    const timeSeconds = typeof parseTimeToSeconds === "function" ? parseTimeToSeconds(manualCfTimeInput.value) : null;
    const rounds = manualCfRoundsInput.value ? Number(manualCfRoundsInput.value) : null;
    const extraReps = manualCfExtraRepsInput.value ? Number(manualCfExtraRepsInput.value) : null;

    if (timeSeconds === null && rounds === null) return;

    setManualCfBest(wodName, {
      timeSeconds,
      rounds,
      extraReps,
      level: manualCfLevelSelect ? manualCfLevelSelect.value : "RX",
      date: manualCfDateInput.value || todayLocalDateString(),
      notes: manualCfNotesInput.value.trim(),
    });

    manualCfForm.style.display = "none";
    manualCfForm.reset();
    renderRecords();
  });
}

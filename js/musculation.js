// ==========================================================================
// musculation.js — tout ce qui concerne la page Musculation.
//
// Une séance contient plusieurs exercices. Elle se remplit "en direct" :
// on démarre la séance (chrono), chaque exercice est une carte avec ses
// séries, et chaque série se coche (✓) dès qu'elle est faite. Tout est
// gardé au fur et à mesure dans un brouillon ; "Terminer" l'enregistre.
// Les briques communes (cartes, séries, minuteur) sont dans seance.js.
// ==========================================================================

// Liste des exercices proposés par défaut. Le joueur peut aussi taper
// le nom d'un exercice personnalisé grâce à l'option "Autre".
const DEFAULT_EXERCISES = [
  "Back Squat", "Front Squat", "Overhead Squat", "Air Squat", "Goblet Squat", "Bulgarian Split Squat",
  "Deadlift", "Sumo Deadlift", "Romanian Deadlift", "Good Morning",
  "Bench Press", "Incline Bench Press",
  "Strict Press", "Push Press", "Push Jerk", "Split Jerk",
  "Barbell Row", "Dumbbell Row", "Shrugs", "Rear Delt Fly",
  "Barbell Lunge", "Barbell Reverse Lunge", "Walking Lunge",
  "Snatch", "Power Snatch", "Squat Snatch", "Snatch Pull", "Snatch Balance",
  "Clean", "Power Clean", "Clean & Jerk", "Squat Clean", "Hang Power Clean", "Clean Pull",
  "Barbell Thruster", "Barbell Curl", "Dumbbell Curl", "Skull Crusher", "Lateral Raise",
  "Dumbbell Bench Press", "Dumbbell Incline Bench Press", "Dumbbell Floor Press",
  "Dumbbell Shoulder Press", "Dumbbell Clean & Jerk", "Dumbbell Snatch",
  "Dumbbell Thruster", "Dumbbell Walking Lunge", "Devil Press", "Wall Ball", "Kettlebell Swing",
  "Pull-up", "Bar Muscle-Up", "Ring Muscle-Up", "Chest-to-Bar Pull-Up",
  "Toes-to-Bar", "Push-Up", "Handstand Push-Up", "Dips",
  "Burpee", "Burpee over the bar", "Burpee Box Jump-Over", "Box Jump", "Box Step-Up",
  "V-Up", "Sit-Up", "Single Under", "Double Under",
  "Farmer Carry", "Hip Thrust",
  // Ajouts CrossFit
  "Ring Dips", "Pistol Squat", "Wall Walk", "Sumo Deadlift High Pull", "Overhead Walking Lunge", "Sandbag Clean",
];

// Exercices "au poids du corps" : la charge y est facultative (on peut juste
// noter des répétitions), mais on peut quand même ajouter un lest si la
// série est réalisée avec une charge supplémentaire (ex : dips lestés).
const BODYWEIGHT_EXERCISES = [
  "Dips", "Burpee over the bar", "Pull-up", "V-Up", "Toes-to-Bar",
  "Box Jump", "Box Step-Up", "Burpee Box Jump-Over", "Sit-Up", "Air Squat",
  "Burpee", "Push-Up", "Handstand Push-Up", "Ring Muscle-Up", "Bar Muscle-Up",
  "Chest-to-Bar Pull-Up", "Single Under", "Double Under",
  "Ring Dips", "Pistol Squat", "Wall Walk", "Handstand Walk",
];

// --------------------------------------------------------------------------
// EXERCICES MESURÉS EN CALORIES OU EN MÈTRES (dans les WOD)
// Machines de cardio, course et handstand walk ne se comptent pas en
// "répétitions × kg" : on note une quantité avec son unité. Ils ne sont
// proposés que dans les exercices structurés des WOD (CrossFit) et n'entrent
// ni dans le volume, ni dans les records de charge, ni dans les rangs.
// Stockage : { exercise: "Row", reps: 500, unit: "m", weight: 0, extraReps: 0 }
// ("reps" contient alors la quantité ; une entrée sans "unit" = des reps)
// --------------------------------------------------------------------------
const MEASURED_EXERCISES = {
  "Row": ["cal", "m"],
  "SkiErg": ["cal", "m"],
  "Assault Bike": ["cal"],
  "Echo Bike": ["cal"],
  "BikeErg": ["cal", "m"],
  "Run": ["m"],
  "Shuttle Run": ["m"],
  "Handstand Walk": ["m"],
};
const UNIT_LABELS = { reps: "reps", cal: "cal", m: "m" };

function isMeasuredExercise(name) {
  return Object.prototype.hasOwnProperty.call(MEASURED_EXERCISES, name);
}

/** Unité d'une entrée structurée de WOD : "reps" (par défaut), "cal" ou "m". */
function getEntryUnit(entry) {
  return entry && (entry.unit === "cal" || entry.unit === "m") ? entry.unit : "reps";
}

/** "500 m", "15 cal", "10 reps" (nombres à la française). */
function formatAmount(amount, unit) {
  return `${formatNumberFr(amount)} ${UNIT_LABELS[unit] || "reps"}`;
}

/** Un exercice au poids du corps n'exige pas de charge pour valider une série. */
function isBodyweightExercise(exerciseName) {
  return BODYWEIGHT_EXERCISES.includes(exerciseName);
}

// Exercices dont les répétitions sont bien enregistrées, mais qui ne
// contribuent PAS au volume d'entraînement : compter chaque saut à la corde
// comme "un poids de corps soulevé" ferait exploser le volume hebdomadaire
// de façon trompeuse par rapport à la musculation.
const NO_VOLUME_EXERCISES = ["Single Under", "Double Under"];

/** Renvoie true si cet exercice ne doit pas être comptabilisé dans le volume. */
function isNoVolumeExercise(exerciseName) {
  return NO_VOLUME_EXERCISES.includes(exerciseName);
}

// --------------------------------------------------------------------------
// TESTS CARDIO
// Un test cardio n'a pas de séries : son résultat est un temps. Il alimente
// l'axe Endurance de la page Profil, et jamais le volume d'entraînement.
// Stockage : { exercise: "Row 2000 m", kind: "cardio", timeSeconds: 452 }
// Les anciens tests sprint ("Row 500 m", "Run 400 m") restent lisibles
// dans l'historique, mais ne sont plus proposés et ne comptent plus aux rangs.
// --------------------------------------------------------------------------
const CARDIO_TESTS = ["Row 2000 m", "Run 5 km"];

// --------------------------------------------------------------------------
// NOMS D'EXERCICES : tout en anglais (comme au tableau de la box), avec un
// rappel en français dans les listes pour ceux qui avaient un nom français,
// et une recherche qui marche dans les deux langues.
// --------------------------------------------------------------------------

// Rappel affiché dans les listes déroulantes : "Skull Crusher · barre au front"
const EXERCISE_FRENCH_HINTS = {
  "Bulgarian Split Squat": "fente bulgare",
  "Barbell Row": "rowing barre",
  "Dumbbell Row": "rowing haltères",
  "Rear Delt Fly": "oiseau",
  "Barbell Curl": "curl barre",
  "Dumbbell Curl": "curl haltères",
  "Skull Crusher": "barre au front",
  "Lateral Raise": "élévations latérales",
  "Row": "rameur",
  "Run": "course",
  "Row 2000 m": "rameur",
  "Run 5 km": "course",
  "Row 500 m": "rameur",
  "Run 400 m": "course",
};

// Mots français reconnus par la recherche : si le nom contient la clé, on
// trouve aussi l'exercice avec ces mots ("arraché" → Snatch, Power Snatch…)
const SEARCH_KEYWORD_ALIASES = {
  "snatch": "arraché arrache",
  "clean": "épaulé epaule",
  "jerk": "jeté jete",
  "deadlift": "soulevé de terre",
  "bench": "développé couché",
  "press": "développé",
  "pull-up": "traction tractions",
  "push-up": "pompe pompes",
  "lunge": "fente fentes",
  "split squat": "fente fentes",
  "row": "rowing tirage",
  "run": "course courir",
  "curl": "biceps",
  "skull crusher": "barre au front triceps",
  "lateral raise": "élévations latérales épaules",
  "rear delt": "oiseau deltoïdes",
  "shrugs": "haussements d'épaules trapèzes",
  "toes-to-bar": "relevés de jambes",
  "sit-up": "abdos",
  "v-up": "abdos",
  "handstand": "poirier équilibre",
  "box": "boîte caisse",
  "under": "corde à sauter",
  "farmer": "marche du fermier",
  "bike": "vélo",
  "shuttle": "navette",
  "ski": "skierg",
  "kettlebell": "kettlebell",
  "hip thrust": "fessiers",
  "good morning": "ischios",
};

/** Libellé d'un exercice dans une liste déroulante (avec son rappel français). */
function exerciseOptionLabel(name) {
  const hint = EXERCISE_FRENCH_HINTS[name];
  return hint ? `${name} · ${hint}` : name;
}

/** Vrai si le nom (anglais) ou l'un de ses équivalents français contient le texte cherché (déjà normalisé). */
function exerciseMatchesSearch(name, query) {
  if (!query) return true;
  const normalizedName = normalizeSearchText(name);
  if (normalizedName.includes(query)) return true;
  const extras = [EXERCISE_FRENCH_HINTS[name] || ""];
  Object.keys(SEARCH_KEYWORD_ALIASES).forEach((key) => {
    if (normalizedName.includes(key)) extras.push(SEARCH_KEYWORD_ALIASES[key]);
  });
  return normalizeSearchText(extras.join(" ")).includes(query);
}

function isCardioEntry(entry) {
  return Boolean(entry) && entry.kind === "cardio";
}

/**
 * Lit les champs minutes + secondes d'une carte de test cardio. Renvoie des
 * secondes, ou null si c'est vide ou illisible. Les dixièmes sont acceptés ("43,5").
 */
function readCardioTime(block) {
  return parseCardioTime(block.querySelector(".cardio-block-min").value, block.querySelector(".cardio-block-sec").value);
}

/** 103 → "1:43" ; 103,5 → "1:43,5" */
function formatDuration(totalSeconds) {
  const total = Math.round(totalSeconds * 10) / 10;
  const minutes = Math.floor(total / 60);
  const seconds = Math.round((total - minutes * 60) * 10) / 10;
  const secondsText = Number.isInteger(seconds)
    ? String(seconds).padStart(2, "0")
    : seconds.toFixed(1).padStart(4, "0").replace(".", ",");
  return `${minutes}:${secondsText}`;
}

/** Renvoie la classe de couleur du badge RPE : vert (facile) → doré → rouge (quasi max). */
function getRpeBadgeClass(rpe) {
  if (rpe >= 9) return "badge-rpe-high";
  if (rpe >= 7) return "badge-rpe-mid";
  return "badge-rpe-low";
}

// --------------------------------------------------------------------------
// ÉLÉMENTS DE LA PAGE
// L'onglet a deux écrans : l'accueil (démarrer, refaire une séance,
// historique) et la séance en cours (chrono, cartes d'exercice, séries à
// cocher). Une séance ancienne se modifie dans ce même écran.
// --------------------------------------------------------------------------

const muscuHome = document.getElementById("muscu-home");
const muscuLive = document.getElementById("muscu-live");
const muscuTemplates = document.getElementById("muscu-templates");
const muscuStartBtn = document.getElementById("muscu-start-btn");
const muscuLiveTitle = document.getElementById("muscu-live-title");
const muscuChrono = document.getElementById("muscu-chrono");
const muscuChronoTime = document.getElementById("muscu-chrono-time");
const muscuNameInput = document.getElementById("muscu-name");
const muscuDateInput = document.getElementById("muscu-date");
const muscuExercisesList = document.getElementById("muscu-exercises-list");
const muscuAddExerciseBlockBtn = document.getElementById("muscu-add-exercise-block");
const muscuAddCardioBtn = document.getElementById("muscu-add-cardio-block");
const muscuNotesInput = document.getElementById("muscu-notes");
const muscuFeedback = document.getElementById("muscu-feedback");
const muscuSubmitBtn = document.getElementById("muscu-submit-btn");
const muscuCancelEditBtn = document.getElementById("muscu-cancel-edit");
const muscuDiscardBtn = document.getElementById("muscu-discard-btn");
const muscuFilterSelect = document.getElementById("muscu-filter-exercise");
const muscuHistoryList = document.getElementById("muscu-history-list");
const muscuHistorySearch = document.getElementById("muscu-history-search");
const muscuLastSeen = document.getElementById("muscu-last-seen");

/**
 * Prépare un texte pour une recherche souple : minuscules et accents retirés,
 * pour que "elevations" trouve "Élévations latérales". Partagée avec crossfit.js.
 */
function normalizeSearchText(text) {
  return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Renvoie la liste des exercices déjà utilisés dans l'historique, fusionnée
 * avec la liste par défaut (sans doublons). Ça permet aux exercices
 * "personnalisés" ajoutés une fois de réapparaître dans les listes.
 */
function getAllKnownExercises() {
  const used = getAllSessions()
    .filter((s) => s.type === "musculation")
    .flatMap((s) => (s.exercises || []).filter((ex) => ex && !isCardioEntry(ex)).map((ex) => ex.exercise));
  return Array.from(new Set([...DEFAULT_EXERCISES, ...used])).filter((name) => !isMeasuredExercise(name)).sort();
}

/**
 * Les derniers exercices utilisés (séances de muscu et exercices structurés
 * des WOD), du plus récent au plus ancien, sans doublons. Les tests cardio
 * n'en font pas partie (ils ont leur propre bouton).
 */
function getRecentExercises(limit, includeMeasured) {
  const sessions = getAllSessions().slice().reverse() // à date égale : la dernière ajoutée d'abord
    .filter((s) => Array.isArray(s.exercises))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const recent = [];
  for (const session of sessions) {
    for (const entry of session.exercises) {
      if (!entry || typeof entry !== "object" || isCardioEntry(entry)) continue;
      const name = String(entry.exercise || "").trim();
      if (!name || recent.includes(name)) continue;
      if (!includeMeasured && isMeasuredExercise(name)) continue;
      recent.push(name);
      if (recent.length >= limit) return recent;
    }
  }
  return recent;
}

const RECENT_EXERCISES_COUNT = 5;

function createExerciseOption(name, label) {
  const opt = document.createElement("option");
  opt.value = name;
  opt.textContent = label || exerciseOptionLabel(name);
  return opt;
}

/**
 * Remplit un <select> avec la liste des exercices connus + option "Autre"
 * (utilisée par la page Records). options.includeMeasured : ajoute aussi
 * le groupe "Cardio et distance" (row, bike, run...).
 */
function populateExerciseSelectElement(selectEl, options) {
  const includeMeasured = Boolean(options && options.includeMeasured);
  const measuredLabel = (ex) => `${exerciseOptionLabel(ex)} (${MEASURED_EXERCISES[ex].map((u) => UNIT_LABELS[u]).join(" ou ")})`;
  selectEl.innerHTML = "";

  // "Récents" tout en haut : les 5 derniers exercices utilisés (ils restent
  // aussi à leur place dans la liste complète, juste en dessous)
  const recent = getRecentExercises(RECENT_EXERCISES_COUNT, includeMeasured);
  let mainContainer = selectEl;
  if (recent.length > 0) {
    const recentGroup = document.createElement("optgroup");
    recentGroup.label = "Récents";
    recent.forEach((ex) => recentGroup.appendChild(createExerciseOption(ex, isMeasuredExercise(ex) ? measuredLabel(ex) : null)));
    selectEl.appendChild(recentGroup);
    mainContainer = document.createElement("optgroup");
    mainContainer.label = "Tous les exercices";
    selectEl.appendChild(mainContainer);
  }

  getAllKnownExercises().forEach((ex) => mainContainer.appendChild(createExerciseOption(ex)));
  if (includeMeasured) {
    const group = document.createElement("optgroup");
    group.label = "Cardio et distance";
    Object.keys(MEASURED_EXERCISES).sort().forEach((ex) => group.appendChild(createExerciseOption(ex, measuredLabel(ex))));
    selectEl.appendChild(group);
  }
  const customOpt = document.createElement("option");
  customOpt.value = "__custom__";
  customOpt.textContent = "+ Autre exercice…";
  selectEl.appendChild(customOpt);
}

function populateExerciseSelects() {
  populateExerciseFilterSelect();
}

function populateExerciseFilterSelect() {
  const previous = muscuFilterSelect.value;
  muscuFilterSelect.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = "Tous les exercices";
  muscuFilterSelect.appendChild(allOpt);
  getAllKnownExercises().forEach((ex) => muscuFilterSelect.appendChild(createExerciseOption(ex)));
  if (previous && [...muscuFilterSelect.options].some((o) => o.value === previous)) muscuFilterSelect.value = previous;
}

// --------------------------------------------------------------------------
// AFFICHAGE COMPACT DES SÉRIES
// Les séries identiques qui se suivent sont regroupées :
// [70×5, 70×5, 70×5, 75×3] → "3 × 5 à 70 kg · 1 × 3 à 75 kg"
// (séries × reps à charge). Poids du corps : "3 × 8 reps", ou "lesté".
// Échauffement : "échauff. 1 × 10 à 40 kg".
// --------------------------------------------------------------------------

function formatSetsCompact(sets, isBW) {
  const groups = [];
  (Array.isArray(sets) ? sets : []).forEach((set) => {
    if (!set) return;
    const reps = Number(set.reps) || 0;
    const weight = Number(set.weight) || 0;
    const warmup = set.warmup === true;
    const last = groups[groups.length - 1];
    if (last && last.reps === reps && last.weight === weight && last.warmup === warmup) last.count += 1;
    else groups.push({ reps, weight, warmup, count: 1 });
  });
  return groups
    .map(({ count, reps, weight, warmup }) => (warmup ? "échauff. " : "") + (weight > 0
      ? `${count} × ${reps} ${isBW ? "lesté" : "à"} ${formatNumberFr(weight)} kg`
      : `${count} × ${reps} rep${reps > 1 ? "s" : ""}`))
    .join(" · ");
}

/** "12/10" (avec l'année si ce n'est pas l'année en cours : "12/10/2025"). */
function formatShortDate(dateStr) {
  const date = parseLocalDate(dateStr);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("fr-FR", sameYear ? { day: "2-digit", month: "2-digit" } : { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** "lun. 2 nov." (avec l'année si ce n'est pas l'année en cours). */
function formatDayDate(dateStr) {
  const date = parseLocalDate(dateStr);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("fr-FR", sameYear
    ? { weekday: "short", day: "numeric", month: "short" }
    : { day: "numeric", month: "short", year: "numeric" });
}

/** 3480 → "58 min" ; 3900 → "1 h 05". */
function formatSessionDuration(totalSeconds) {
  const minutes = Math.max(1, Math.round(totalSeconds / 60));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

// --------------------------------------------------------------------------
// "DERNIÈRE FOIS" ET RECORDS D'UN EXERCICE
// --------------------------------------------------------------------------

/** Séances de la plus récente à la plus ancienne (à date égale : la dernière ajoutée d'abord). */
function getSessionsNewestFirst(excludeSessionId) {
  return getAllSessions()
    .map((session, index) => ({ session, index }))
    .filter(({ session }) => session && session.id !== excludeSessionId && Array.isArray(session.exercises))
    .sort((a, b) => (a.session.date < b.session.date ? 1 : a.session.date > b.session.date ? -1 : b.index - a.index))
    .map(({ session }) => session);
}

/**
 * Dernière fois qu'un exercice a été fait : ses séries (musculation ou cours
 * de spé) ou sa ligne de WOD. null si jamais.
 */
function getLastExercisePerformance(name, excludeSessionId) {
  if (!name) return null;
  for (const session of getSessionsNewestFirst(excludeSessionId)) {
    if (session.type === "musculation") {
      const entry = session.exercises.find((e) => e && e.exercise === name && !isCardioEntry(e) && Array.isArray(e.sets) && e.sets.length > 0);
      if (entry) return { source: "muscu", date: session.date, sets: entry.sets };
    } else if (session.type === "crossfit") {
      const matching = session.exercises.filter((e) => e && typeof e === "object" && e.exercise === name && getEntryUnit(e) === "reps" && e.reps > 0);
      if (matching.length === 0) continue;
      if (typeof isSpeSession === "function" && isSpeSession(session.wodName)) {
        // Cours de spé : une ligne par série
        const sets = matching.map((e) => (e.warmup === true ? { reps: e.reps, weight: e.weight || 0, warmup: true } : { reps: e.reps, weight: e.weight || 0 }));
        return { source: "spe", date: session.date, wodName: session.wodName, sets };
      }
      const entry = matching[0];
      const perRound = session.wodType === "AMRAP" && typeof session.rounds === "number";
      return { source: "wod", date: session.date, wodName: session.wodName, reps: entry.reps, weight: entry.weight || 0, perRound };
    }
  }
  return null;
}

/** Record actuel d'un exercice, en texte ("1RM estimé : 93 kg", "Record : 10 reps"), ou "". */
function describeExerciseRecord(name) {
  if (!name || typeof computeMuscuRecords !== "function") return "";
  const record = computeMuscuRecords()[name];
  if (isBodyweightExercise(name)) {
    const manual = typeof getManualReps === "function" ? getManualReps()[name] : null;
    const best = Math.max(record && record.maxReps ? record.maxReps.value : 0, manual ? Number(manual.reps) || 0 : 0);
    return best > 0 ? `Record : ${best} rep${best > 1 ? "s" : ""}` : "";
  }
  const estimate = record && record.oneRM ? record.oneRM.value : 0;
  const manual = typeof getManualOneRMs === "function" && getManualOneRMs()[name] ? Number(getManualOneRMs()[name].weight) || 0 : 0;
  if (manual > 0 && manual >= estimate) return `1RM noté : ${formatNumberFr(manual)} kg`;
  if (estimate > 0) return `1RM estimé : ${formatNumberFr(Math.round(estimate))} kg`;
  return "";
}

/** Dernier temps et record d'un test cardio. */
function getCardioLastAndBest(name, excludeSessionId) {
  let last = null;
  let best = null;
  for (const session of getSessionsNewestFirst(excludeSessionId)) {
    if (session.type !== "musculation") continue;
    session.exercises.forEach((e) => {
      if (!e || !isCardioEntry(e) || e.exercise !== name || !(e.timeSeconds > 0)) return;
      if (!last) last = { date: session.date, timeSeconds: e.timeSeconds };
      if (best === null || e.timeSeconds < best) best = e.timeSeconds;
    });
  }
  const manual = typeof getManualTimes === "function" ? getManualTimes()[name] : null;
  if (manual && manual.timeSeconds > 0 && (best === null || manual.timeSeconds < best)) best = manual.timeSeconds;
  return { last, best };
}

/**
 * Réaffiche les cartes de la séance en cours (records et "précédent" à
 * jour). Appelée au démarrage par app.js, une fois stats.js chargé.
 */
function refreshExerciseLastSeen() {
  if (muscuDraft) renderMuscuList();
  if (typeof refreshCfSpeCards === "function") refreshCfSpeCards();
}

// --------------------------------------------------------------------------
// SÉANCE EN COURS : BROUILLON
// Tout ce qui est tapé ou coché est gardé tout de suite sur le téléphone
// ("carnet_muscu_draft") : fermer l'appli ne fait rien perdre. Le brouillon
// devient une vraie séance seulement avec "Terminer" → "Enregistrer".
// --------------------------------------------------------------------------

const STORAGE_KEY_MUSCU_DRAFT = "carnet_muscu_draft";
let muscuDraft = null;

const newEmptySet = (warmup) => ({ reps: "", weight: "", done: false, warmup: Boolean(warmup) });

/** Lit le brouillon enregistré (ou null s'il n'y en a pas ou s'il est illisible). */
function loadMuscuDraft() {
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(STORAGE_KEY_MUSCU_DRAFT)); } catch { draft = null; }
  if (!isPlainObject(draft) || !Array.isArray(draft.exercises)) return null;
  draft.exercises = draft.exercises
    .filter((item) => isPlainObject(item) && typeof item.exercise === "string" && item.exercise.trim())
    .map((item) => {
      if (item.kind === "cardio") {
        return { kind: "cardio", exercise: item.exercise, min: String(item.min ?? ""), sec: String(item.sec ?? ""), done: Boolean(item.done) };
      }
      const rpe = Number(item.rpe);
      return {
        kind: "sets",
        exercise: item.exercise,
        rpe: rpe > 0 ? rpe : null,
        sets: (Array.isArray(item.sets) ? item.sets : []).filter(isPlainObject).map((set) => ({
          reps: String(set.reps ?? ""), weight: String(set.weight ?? ""), done: Boolean(set.done), warmup: Boolean(set.warmup),
        })),
      };
    });
  draft.editingId = typeof draft.editingId === "string" && draft.editingId ? draft.editingId : null;
  // Séance modifiée supprimée entre-temps : plus rien à modifier
  if (draft.editingId && !getAllSessions().some((s) => s.id === draft.editingId)) return null;
  draft.mode = draft.editingId ? "edit" : "new";
  if (!isValidDateString(draft.date)) draft.date = todayLocalDateString();
  if (draft.mode === "new" && !(Number(draft.startedAt) > 0)) draft.startedAt = Date.now();
  draft.name = typeof draft.name === "string" ? draft.name : "";
  draft.notes = typeof draft.notes === "string" ? draft.notes : "";
  draft.rest = isPlainObject(draft.rest) ? draft.rest : null;
  return draft;
}

function saveMuscuDraft() {
  try {
    if (muscuDraft) localStorage.setItem(STORAGE_KEY_MUSCU_DRAFT, JSON.stringify(muscuDraft));
    else localStorage.removeItem(STORAGE_KEY_MUSCU_DRAFT);
  } catch (error) {
    console.warn("Brouillon de séance non enregistré :", error);
  }
}

/** Cartes d'une séance enregistrée : vides pour "Refaire", remplies et cochées pour "Modifier". */
function buildItemsFromSession(session, forEdit) {
  return (session.exercises || []).filter(Boolean).map((entry) => {
    if (isCardioEntry(entry)) {
      if (!forEdit) return { kind: "cardio", exercise: entry.exercise, min: "", sec: "", done: false };
      const minutes = Math.floor(entry.timeSeconds / 60);
      const seconds = Math.round((entry.timeSeconds - minutes * 60) * 10) / 10;
      return { kind: "cardio", exercise: entry.exercise, min: String(minutes), sec: String(seconds).replace(".", ","), done: true };
    }
    const sets = (entry.sets || []).map((set) => (forEdit
      ? { reps: rfInputNumber(set.reps), weight: set.weight > 0 ? rfInputNumber(set.weight) : "", done: true, warmup: set.warmup === true }
      : newEmptySet(set.warmup === true)));
    return { kind: "sets", exercise: entry.exercise, rpe: forEdit && entry.rpe ? entry.rpe : null, sets };
  });
}

/** Une séance est déjà en cours : on demande avant de la remplacer. */
function confirmReplaceMuscuDraft() {
  if (!muscuDraft) return true;
  const message = muscuDraft.mode === "edit"
    ? "Une modification de séance est en cours. L'abandonner ?"
    : "Une séance est déjà en cours. L'abandonner pour en commencer une autre ? Rien n'en sera enregistré.";
  return confirm(message);
}

/** Démarre une séance : vide, ou avec les exercices d'une séance passée ("Refaire"). */
function startNewMuscuSession(template) {
  if (!confirmReplaceMuscuDraft()) return false;
  stopRestTimer();
  muscuDraft = {
    mode: "new",
    editingId: null,
    startedAt: Date.now(),
    date: todayLocalDateString(),
    name: template && template.name ? template.name : "",
    notes: "",
    exercises: template ? buildItemsFromSession(template, false) : [],
    rest: null,
  };
  saveMuscuDraft();
  renderMuscuView();
  window.scrollTo(0, 0);
  if (!template) openMuscuExercisePicker();
  return true;
}

/**
 * "Refaire cette séance" : mêmes exercices, même nombre de séries, avec les
 * charges de la dernière fois en grisé. La séance repart d'aujourd'hui.
 */
function duplicateMuscuSession(session) {
  return startNewMuscuSession(session);
}

/** "Modifier" : la séance s'ouvre dans le même écran, toutes ses séries cochées. */
function startEditMuscuSession(session) {
  if (!confirmReplaceMuscuDraft()) return false;
  stopRestTimer();
  muscuDraft = {
    mode: "edit",
    editingId: session.id,
    startedAt: null,
    date: session.date,
    name: session.name || "",
    notes: session.notes || "",
    exercises: buildItemsFromSession(session, true),
    rest: null,
  };
  saveMuscuDraft();
  renderMuscuView();
  window.scrollTo(0, 0);
  return true;
}

/** Annule une modification en cours (la séance d'origine n'est pas touchée). */
function cancelMuscuEdit() {
  muscuDraft = null;
  stopRestTimer();
  saveMuscuDraft();
  renderMuscuView();
}

function discardMuscuSession() {
  if (!confirm("Abandonner cette séance ? Rien ne sera enregistré.")) return;
  cancelMuscuEdit();
  window.scrollTo(0, 0);
}

// --------------------------------------------------------------------------
// SÉANCE EN COURS : AFFICHAGE
// --------------------------------------------------------------------------

let muscuChronoInterval = null;

function updateMuscuChrono() {
  if (!muscuDraft || muscuDraft.mode !== "new") return;
  const elapsed = Math.max(0, Math.floor((Date.now() - muscuDraft.startedAt) / 1000));
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  muscuChronoTime.textContent = [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function updateMuscuLiveTitle() {
  if (!muscuDraft) return;
  // Modification : la date est déjà dans son champ, le titre reste court (place pour 2 boutons)
  muscuLiveTitle.textContent = muscuDraft.mode === "edit"
    ? "Modification"
    : `${muscuDraft.name.trim() || "Séance"} · ${formatDayDate(muscuDraft.date)}`;
}

function muscuCardContext() {
  const editing = muscuDraft.mode === "edit";
  return {
    excludeSessionId: muscuDraft.editingId,
    showRpe: true,
    showPR: !editing,
    recordsBefore: typeof computeMuscuRecords === "function" ? computeMuscuRecords() : {},
    persist: saveMuscuDraft,
    feedback: showMuscuFeedback,
    onSetChecked: (item) => { if (!editing) startRestTimer(item.exercise, getRestSeconds()); },
    menu: muscuItemMenu,
  };
}

/** Menu ⋮ d'une carte : changer d'exercice, déplacer, supprimer. */
function muscuItemMenu(item) {
  const list = muscuDraft.exercises;
  const index = list.indexOf(item);
  const isCardio = item.kind === "cardio";
  const move = (delta) => {
    list.splice(index, 1);
    list.splice(index + delta, 0, item);
    saveMuscuDraft();
    renderMuscuList();
  };
  const actions = [];
  actions.push({
    label: isCardio ? "Changer de test" : "Changer d'exercice",
    onClick: () => (isCardio ? openCardioTestPicker((name) => { item.exercise = name; item.done = false; saveMuscuDraft(); renderMuscuList(); })
      : openMuscuExercisePicker((name) => { item.exercise = name; saveMuscuDraft(); renderMuscuList(); }, "Changer d'exercice")),
  });
  if (index > 0) actions.push({ label: "Monter", onClick: () => move(-1) });
  if (index < list.length - 1) actions.push({ label: "Descendre", onClick: () => move(1) });
  actions.push({
    label: isCardio ? "Supprimer le test" : "Supprimer l'exercice",
    danger: true,
    onClick: () => {
      const hasContent = isCardio ? Boolean(item.done || item.min || item.sec) : item.sets.some(isSetFilled);
      if (hasContent && !confirm(`Supprimer ${item.exercise} de la séance ?`)) return;
      list.splice(list.indexOf(item), 1);
      saveMuscuDraft();
      renderMuscuList();
    },
  });
  return actions;
}

function createMuscuCard(item, ctx) {
  return item.kind === "cardio" ? createCardioCard(item, ctx) : createSetCard(item, ctx);
}

function renderMuscuList() {
  if (!muscuDraft) return;
  muscuExercisesList.innerHTML = "";
  if (muscuDraft.exercises.length === 0) {
    muscuExercisesList.innerHTML = `<p class="rf-empty">Ajoute ton premier exercice avec le bouton ci-dessous.</p>`;
    return;
  }
  const ctx = muscuCardContext();
  muscuDraft.exercises.forEach((item) => muscuExercisesList.appendChild(createMuscuCard(item, ctx)));
}

/** Affiche l'accueil, ou la séance en cours s'il y en a une. */
function renderMuscuView() {
  document.body.classList.toggle("rf-live-on", Boolean(muscuDraft));
  if (!muscuDraft) {
    muscuHome.hidden = false;
    muscuLive.hidden = true;
    if (muscuChronoInterval) clearInterval(muscuChronoInterval);
    muscuChronoInterval = null;
    renderMuscuTemplates();
    if (restTimer.state) stopRestTimer();
    else renderRestTimer();
    return;
  }
  const editing = muscuDraft.mode === "edit";
  muscuHome.hidden = true;
  muscuLive.hidden = false;
  muscuLive.classList.toggle("is-edit", editing);
  muscuChrono.hidden = editing;
  muscuSubmitBtn.textContent = editing ? "Enregistrer" : "Terminer";
  muscuCancelEditBtn.hidden = !editing;
  muscuDiscardBtn.hidden = editing;
  muscuNameInput.value = muscuDraft.name;
  muscuDateInput.value = muscuDraft.date;
  muscuNotesInput.value = muscuDraft.notes;
  updateMuscuLiveTitle();
  renderMuscuList();
  if (muscuChronoInterval) clearInterval(muscuChronoInterval);
  muscuChronoInterval = null;
  if (!editing) {
    updateMuscuChrono();
    muscuChronoInterval = setInterval(updateMuscuChrono, 1000);
  }
  restoreRestTimer(editing ? null : muscuDraft.rest);
}

// ----- Ajout d'exercices -----

function openMuscuExercisePicker(onPick, title) {
  openExercisePicker({
    title: title || "Ajouter un exercice",
    includeMeasured: false,
    onPick: (name) => {
      if (isMeasuredExercise(name)) {
        showMuscuFeedback(`${name} se note dans un WOD (onglet CrossFit). Pour un test chronométré, utilise « + Test cardio ».`, true);
        return;
      }
      (onPick || addMuscuExercise)(name);
    },
  });
}

function openCardioTestPicker(onPick) {
  openExercisePicker({ title: "Ajouter un test cardio", choices: CARDIO_TESTS, allowCustom: false, onPick });
}

/** Nouvelle carte : autant de séries que la dernière fois (3 si jamais fait). */
function addMuscuExercise(name) {
  if (!muscuDraft) return;
  const previous = getPreviousSets(name, muscuDraft.editingId).slice(0, 12);
  const sets = previous.length ? previous.map((set) => newEmptySet(set.warmup === true)) : [newEmptySet(), newEmptySet(), newEmptySet()];
  const item = { kind: "sets", exercise: name, rpe: null, sets };
  muscuDraft.exercises.push(item);
  saveMuscuDraft();
  renderMuscuList();
  const cards = muscuExercisesList.querySelectorAll(".rf-card");
  const card = cards[cards.length - 1];
  if (card && typeof card.scrollIntoView === "function") card.scrollIntoView({ behavior: "smooth", block: "center" });
}

function addMuscuCardioTest(name) {
  if (!muscuDraft) return;
  muscuDraft.exercises.push({ kind: "cardio", exercise: name, min: "", sec: "", done: false });
  saveMuscuDraft();
  renderMuscuList();
}

muscuStartBtn.addEventListener("click", () => startNewMuscuSession(null));
muscuAddExerciseBlockBtn.addEventListener("click", () => openMuscuExercisePicker());
muscuAddCardioBtn.addEventListener("click", () => openCardioTestPicker(addMuscuCardioTest));
muscuNameInput.addEventListener("input", () => {
  if (!muscuDraft) return;
  muscuDraft.name = muscuNameInput.value;
  saveMuscuDraft();
  updateMuscuLiveTitle();
});
muscuDateInput.addEventListener("change", () => {
  if (!muscuDraft) return;
  if (!isValidDateString(muscuDateInput.value)) { muscuDateInput.value = muscuDraft.date; return; }
  muscuDraft.date = muscuDateInput.value;
  saveMuscuDraft();
  updateMuscuLiveTitle();
});
muscuNotesInput.addEventListener("input", () => {
  if (!muscuDraft) return;
  muscuDraft.notes = muscuNotesInput.value;
  saveMuscuDraft();
});
muscuCancelEditBtn.addEventListener("click", () => { cancelMuscuEdit(); window.scrollTo(0, 0); });
muscuDiscardBtn.addEventListener("click", discardMuscuSession);

// Le minuteur de repos est gardé dans le brouillon, et ne s'affiche que sur cette page
restTimer.onChange = (state) => {
  if (!muscuDraft) return;
  muscuDraft.rest = state ? { ...state } : null;
  saveMuscuDraft();
};
restTimer.visibleWhen = () => Boolean(muscuDraft) && document.getElementById("section-musculation").classList.contains("is-active");

// --------------------------------------------------------------------------
// "REFAIRE UNE SÉANCE" (accueil de l'onglet)
// --------------------------------------------------------------------------

/** Les 3 dernières séances différentes (même nom et mêmes exercices = une seule). */
function getMuscuTemplates(limit) {
  const seen = new Set();
  const list = [];
  for (const session of getSessionsNewestFirst()) {
    if (session.type !== "musculation" || session.exercises.length === 0) continue;
    const key = `${session.name || ""}|${session.exercises.map((e) => e && e.exercise).join("|")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(session);
    if (list.length >= limit) break;
  }
  return list;
}

function renderMuscuTemplates() {
  const templates = getMuscuTemplates(3);
  if (templates.length === 0) {
    muscuTemplates.innerHTML = "";
    return;
  }
  muscuTemplates.innerHTML = `<div class="rf-h3">Refaire une séance</div>`;
  templates.forEach((session) => {
    const names = session.exercises.map((e) => e.exercise);
    const setCount = session.exercises.reduce((total, e) => total + (Array.isArray(e.sets) ? e.sets.length : 0), 0);
    const when = [formatDayDate(session.date)];
    if (session.durationSeconds > 0) when.push(formatSessionDuration(session.durationSeconds));
    if (setCount > 0) when.push(`${setCount} série${setCount > 1 ? "s" : ""}`);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rf-tpl";
    button.innerHTML = `
      <span class="rf-tpl-main">
        <span class="rf-tpl-name">${escapeHtml(session.name || (names.length === 1 ? names[0] : `Séance du ${formatDayDate(session.date)}`))}</span>
        <span class="rf-tpl-ex">${escapeHtml(names.slice(0, 4).join(" · "))}${names.length > 4 ? ` · +${names.length - 4}` : ""}</span>
        <span class="rf-tpl-when">${escapeHtml(when.join(" · "))}</span>
      </span>
      <span class="rf-go">${RF_ICONS.arrow}</span>`;
    button.setAttribute("aria-label", `Refaire : ${session.name || names.join(", ")}`);
    button.addEventListener("click", () => duplicateMuscuSession(session));
    muscuTemplates.appendChild(button);
  });
}

// --------------------------------------------------------------------------
// TERMINER LA SÉANCE
// Les séries cochées sont enregistrées, et aussi celles remplies sans être
// cochées. Une ligne vide (juste les valeurs grisées) est ignorée.
// --------------------------------------------------------------------------

/** "7" min et "45,5" s → 465.5 secondes ; null si vide ou illisible. */
function parseCardioTime(minText, secText) {
  const min = String(minText ?? "").trim();
  const sec = String(secText ?? "").trim().replace(",", ".");
  if (!min && !sec) return null;
  if ((min && !/^\d+$/.test(min)) || (sec && !/^\d+(\.\d)?$/.test(sec))) return null;
  const total = (Number(min) || 0) * 60 + (Number(sec) || 0);
  return total > 0 ? Math.round(total * 10) / 10 : null;
}

/**
 * Transforme le brouillon en séance prête à enregistrer.
 * Renvoie { error } ou { sessionData, doneCount, totalCount, unchecked, dropped }.
 */
function collectMuscuSession(draft) {
  const exercises = [];
  const dropped = [];
  const unchecked = [];
  let doneCount = 0;
  let totalCount = 0;

  for (const item of draft.exercises) {
    if (item.kind === "cardio") {
      totalCount += 1;
      if (item.done) doneCount += 1;
      if (!String(item.min).trim() && !String(item.sec).trim()) { dropped.push(item.exercise); continue; }
      const timeSeconds = parseCardioTime(item.min, item.sec);
      if (timeSeconds === null) {
        return { error: `Merci d'indiquer ton temps pour le test ${item.exercise} (minutes et secondes, ex : 1 min 43 s).` };
      }
      if (!item.done) unchecked.push(item.exercise);
      exercises.push({ exercise: item.exercise, kind: "cardio", timeSeconds });
      continue;
    }

    const sets = [];
    let number = 0;
    for (const set of item.sets) {
      if (!set.warmup) number += 1;
      totalCount += 1;
      if (set.done) doneCount += 1;
      if (!isSetFilled(set)) continue;
      const result = validateSetInput(item.exercise, set.reps, set.weight, setLabel(item.exercise, set, number), false);
      if (result.error) return { error: result.error };
      if (!set.done) unchecked.push(item.exercise);
      sets.push(set.warmup ? { reps: result.reps, weight: result.weight, warmup: true } : { reps: result.reps, weight: result.weight });
    }
    if (sets.length === 0) { dropped.push(item.exercise); continue; }
    exercises.push({ exercise: item.exercise, sets, rpe: item.rpe > 0 ? Number(item.rpe) : null });
  }

  if (exercises.length === 0) {
    return { error: "Remplis au moins une série (ou un test cardio) pour enregistrer ta séance." };
  }
  const sessionData = {
    type: "musculation",
    date: isValidDateString(draft.date) ? draft.date : todayLocalDateString(),
    exercises,
    notes: (draft.notes || "").trim(),
  };
  const name = (draft.name || "").trim();
  if (name || draft.mode === "edit") sessionData.name = name;
  return { sessionData, doneCount, totalCount, unchecked, dropped };
}

/** Records que la séance va battre (aperçu avant d'enregistrer, mêmes règles que la page Records). */
function previewMuscuRecords(exercises) {
  const recordsBefore = typeof computeMuscuRecords === "function" ? computeMuscuRecords() : {};
  const cardioBests = typeof computeCardioTestBests === "function" ? computeCardioTestBests() : {};
  const manualTimes = typeof getManualTimes === "function" ? getManualTimes() : {};
  const best = {};
  exercises.forEach((entry) => {
    if (isCardioEntry(entry)) {
      const current = best[entry.exercise];
      if (!current || entry.timeSeconds < current.value) best[entry.exercise] = { mode: "time", value: entry.timeSeconds };
      return;
    }
    const isBW = isBodyweightExercise(entry.exercise);
    entry.sets.forEach((set) => {
      if (set.warmup) return;
      const value = setRecordValue(entry.exercise, set.reps, set.weight);
      const current = best[entry.exercise];
      if (value > 0 && (!current || value > current.value)) best[entry.exercise] = { mode: isBW ? "reps" : "load", value };
    });
  });
  const hits = [];
  Object.keys(best).forEach((name) => {
    const { mode, value } = best[name];
    if (mode === "time") {
      const candidates = [];
      if (cardioBests[name]) candidates.push(cardioBests[name].value);
      if (manualTimes[name] && manualTimes[name].timeSeconds > 0) candidates.push(manualTimes[name].timeSeconds);
      if (candidates.length === 0 || value < Math.min(...candidates)) hits.push({ exercise: name, text: formatDuration(value) });
      return;
    }
    if (value > getRecordBestBefore(name, recordsBefore)) {
      hits.push({ exercise: name, text: mode === "reps" ? `${value} rep${value > 1 ? "s" : ""}` : `1RM estimé ${formatNumberFr(Math.round(value))} kg` });
    }
  });
  return hits;
}

/** Liste lisible : "Skull Crusher (2), Pull-up". */
function describeNameCounts(names) {
  const counts = {};
  names.forEach((name) => { counts[name] = (counts[name] || 0) + 1; });
  return Object.keys(counts).map((name) => (counts[name] > 1 ? `${name} (${counts[name]})` : name)).join(", ");
}

function openMuscuFinishSheet(result) {
  const { sessionData, doneCount, totalCount, unchecked, dropped } = result;
  const duration = muscuDraft.startedAt ? (Date.now() - muscuDraft.startedAt) / 1000 : 0;
  const volume = sessionData.exercises.reduce((total, entry) => total + (isCardioEntry(entry) || typeof computeExerciseVolume !== "function" ? 0 : computeExerciseVolume(entry, sessionData.date)), 0);
  const records = previewMuscuRecords(sessionData.exercises);

  openSheet((sheet, close) => {
    const infos = [];
    if (unchecked.length > 0) {
      infos.push(`<b>${unchecked.length} série${unchecked.length > 1 ? "s" : ""} remplie${unchecked.length > 1 ? "s" : ""} mais pas cochée${unchecked.length > 1 ? "s" : ""}</b> (${escapeHtml(describeNameCounts(unchecked))}) : ${unchecked.length > 1 ? "elles seront" : "elle sera"} quand même enregistrée${unchecked.length > 1 ? "s" : ""}.`);
    }
    if (dropped.length > 0) {
      infos.push(`Rien de rempli pour ${escapeHtml(describeNameCounts(dropped))} : ${dropped.length > 1 ? "ils ne seront pas enregistrés" : "il ne sera pas enregistré"}.`);
    }
    sheet.insertAdjacentHTML("beforeend", `
      <h2>Terminer la séance ?</h2>
      <div class="rf-stats">
        <div class="rf-stat"><b>${duration > 0 ? formatSessionDuration(duration) : "—"}</b><span>Durée</span></div>
        <div class="rf-stat"><b>${doneCount} / ${totalCount}</b><span>Séries cochées</span></div>
        <div class="rf-stat"><b>${volume > 0 ? `${Math.round(volume).toLocaleString("fr-FR")} kg` : "—"}</b><span>Volume</span></div>
        <div class="rf-stat"><b>${records.length}</b><span>Record${records.length > 1 ? "s" : ""} battu${records.length > 1 ? "s" : ""}</span></div>
      </div>
      ${records.length ? `<div class="rf-prs">${records.map((r) => `<div><span>${escapeHtml(r.exercise)}</span><b>${escapeHtml(r.text)}</b></div>`).join("")}</div>` : ""}
      ${infos.map((text) => `<div class="rf-warn">${text}</div>`).join("")}
      <button type="button" class="rf-btn rf-btn-gold rf-btn-wide" data-act="save">Enregistrer la séance</button>
      <button type="button" class="rf-btn rf-btn-ghost rf-btn-wide" data-act="continue">Continuer la séance</button>
      <button type="button" class="rf-link-danger" data-act="discard">Abandonner la séance</button>`);
    sheet.querySelector('[data-act="save"]').addEventListener("click", () => { close(); saveMuscuSession(result); });
    sheet.querySelector('[data-act="continue"]').addEventListener("click", close);
    sheet.querySelector('[data-act="discard"]').addEventListener("click", () => { close(); discardMuscuSession(); });
  });
}

/** Enregistre (ou met à jour) la séance, puis revient à l'accueil de l'onglet. */
function saveMuscuSession(result) {
  const sessionData = result.sessionData;
  if (muscuDraft.mode === "edit") {
    updateSession(muscuDraft.editingId, sessionData);
    showMuscuFeedback("Séance mise à jour !", false);
  } else {
    if (muscuDraft.startedAt) {
      const duration = Math.round((Date.now() - muscuDraft.startedAt) / 1000);
      if (duration > 0 && duration <= 6 * 3600) sessionData.durationSeconds = duration; // au-delà : séance oubliée ouverte
    }
    const recordsBefore = typeof computeMuscuRecords === "function" ? computeMuscuRecords() : {};
    const cardioBestsBefore = typeof computeCardioTestBests === "function" ? computeCardioTestBests() : {};
    addSession(sessionData);

    const newRecords = typeof detectMuscuNewRecords === "function"
      ? detectMuscuNewRecords(recordsBefore, sessionData.exercises, sessionData.date, cardioBestsBefore)
      : [];

    // Exercice au poids du corps sans poids connu (Mensurations vide) : le
    // volume ne peut pas être calculé — on le signale, sans rien bloquer.
    const hasBodyweightExercise = sessionData.exercises.some((ex) => isBodyweightExercise(ex.exercise));
    const bodyweightUnknown = hasBodyweightExercise &&
      typeof getCurrentBodyweight === "function" && getCurrentBodyweight() === null;

    if (newRecords.length > 0) {
      showMuscuRecordBadge(newRecords);
    } else if (bodyweightUnknown) {
      showMuscuFeedback("Séance enregistrée ! Astuce : renseigne ton poids dans Mensurations pour calculer le volume des exercices au poids du corps.", false);
    } else {
      showMuscuFeedback("Séance enregistrée !", false);
    }
  }

  muscuDraft = null;
  stopRestTimer();
  saveMuscuDraft();
  renderMuscuView();
  window.scrollTo(0, 0);
  populateExerciseFilterSelect();
  renderMuscuHistory();
  if (typeof notifyRankProgress === "function") notifyRankProgress(); // rangs et succès
  if (typeof renderDashboard === "function") renderDashboard();
  if (typeof renderRecords === "function") renderRecords();
}

/** Bouton "Terminer" (séance en cours) ou "Enregistrer" (modification). */
function finishMuscuSession() {
  if (!muscuDraft) return;
  if (document.activeElement && typeof document.activeElement.blur === "function") document.activeElement.blur();
  const result = collectMuscuSession(muscuDraft);
  if (result.error) {
    showMuscuFeedback(result.error, true);
    return;
  }
  if (muscuDraft.mode === "edit") saveMuscuSession(result);
  else openMuscuFinishSheet(result);
}

muscuSubmitBtn.addEventListener("click", finishMuscuSession);

let muscuFeedbackTimer = null;

function showMuscuFeedback(message, isError) {
  clearTimeout(muscuFeedbackTimer);
  muscuFeedback.textContent = message;
  muscuFeedback.className = "form-feedback rf-toast " + (isError ? "form-feedback-error" : "form-feedback-success");
  muscuFeedbackTimer = setTimeout(() => { muscuFeedback.textContent = ""; }, isError ? 4500 : 3500);
}

/** Affiche un badge mis en avant quand la séance qu'on vient d'enregistrer bat un record. */
function showMuscuRecordBadge(newRecords) {
  clearTimeout(muscuFeedbackTimer);
  const list = newRecords.map((r) => `${escapeHtml(r.exercise)} : ${escapeHtml(r.text || `${formatNumberFr(r.value)} kg`)}`).join(" · ");
  muscuFeedback.innerHTML = `
    <span class="record-badge">
      <svg viewBox="0 0 24 24" class="record-badge-icon"><path d="M6 2h12v6a6 6 0 0 1-5 5.92V17h3v2H8v-2h3v-3.08A6 6 0 0 1 6 8V2Zm2 2v4a4 4 0 0 0 8 0V4H8ZM3 4h2v3a3 3 0 0 1-2 2.83V4Zm16 0h2v5.83A3 3 0 0 1 19 7V4Z"/></svg>
      Nouveau record ! ${list}
    </span>`;
  muscuFeedback.className = "form-feedback rf-toast rf-toast-record";
  muscuFeedbackTimer = setTimeout(() => { muscuFeedback.innerHTML = ""; }, 6000);
}

// --------------------------------------------------------------------------
// HISTORIQUE (liste des séances de musculation, filtrable par exercice)
// --------------------------------------------------------------------------

// Nombre de séances affichées dans l'historique (augmente avec "Voir plus",
// revient à 20 quand on change de filtre ou de recherche)
let muscuHistoryLimit = HISTORY_PAGE_SIZE;

muscuFilterSelect.addEventListener("change", () => { muscuHistoryLimit = HISTORY_PAGE_SIZE; renderMuscuHistory(); });
muscuHistorySearch.addEventListener("input", () => { muscuHistoryLimit = HISTORY_PAGE_SIZE; renderMuscuHistory(); });

/**
 * Encart "Dernière fois" affiché pendant une recherche : la séance la plus
 * récente contenant l'exercice cherché, avec ses séries et ses charges.
 */
function renderMuscuLastSeen(sessions, query) {
  const latest = sessions[0];
  if (!query || !latest) {
    muscuLastSeen.style.display = "none";
    return;
  }
  const matching = (latest.exercises || []).filter((ex) => exerciseMatchesSearch(ex.exercise, query));
  const lines = matching
    .map((entry) => {
      if (isCardioEntry(entry)) {
        return `<span><strong>${escapeHtml(entry.exercise)}</strong> — ${formatDuration(entry.timeSeconds)}</span>`;
      }
      const setsText = escapeHtml(formatSetsCompact(entry.sets, isBodyweightExercise(entry.exercise)));
      return `<span><strong>${escapeHtml(entry.exercise)}</strong> — ${setsText}</span>`;
    })
    .join("");
  muscuLastSeen.innerHTML = `
    <span class="history-last-seen-title">Dernière fois : ${parseLocalDate(latest.date).toLocaleDateString("fr-FR")}</span>
    ${lines}`;
  muscuLastSeen.style.display = "flex";
}

function renderMuscuHistory() {
  const filter = muscuFilterSelect.value || "all";
  const query = normalizeSearchText(muscuHistorySearch.value);

  const sessions = getAllSessions()
    .filter((s) => s.type === "musculation")
    .filter((s) => filter === "all" || (s.exercises || []).some((ex) => ex.exercise === filter))
    .filter((s) => !query || (s.exercises || []).some((ex) => exerciseMatchesSearch(ex.exercise, query)))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  renderMuscuLastSeen(sessions, query);
  muscuHistoryList.innerHTML = "";

  if (sessions.length === 0) {
    muscuHistoryList.innerHTML = `<p class="empty-text">Aucune séance enregistrée pour ce filtre.</p>`;
    return;
  }

  sessions.slice(0, muscuHistoryLimit).forEach((session) => {
    const card = document.createElement("div");
    card.className = "history-card";

    const exercisesHtml = (session.exercises || [])
      .map((entry) => {
        if (isCardioEntry(entry)) {
          return `
          <div class="history-card-exercise">
            <span class="history-card-exercise-name">${escapeHtml(entry.exercise)}</span>
            <span class="history-card-sets">Test chrono : ${formatDuration(entry.timeSeconds)}</span>
          </div>`;
        }
        const setsText = escapeHtml(formatSetsCompact(entry.sets, isBodyweightExercise(entry.exercise)));
        return `
          <div class="history-card-exercise">
            <span class="history-card-exercise-name">${escapeHtml(entry.exercise)}</span>
            <span class="history-card-sets">${setsText}</span>
            ${entry.rpe ? `<span class="badge-rpe ${getRpeBadgeClass(entry.rpe)}">RPE ${escapeHtml(entry.rpe)}</span>` : ""}
          </div>`;
      })
      .join("");

    card.innerHTML = `
      <div class="history-card-header">
        <span class="history-card-title">${escapeHtml(session.name || "Séance")}</span>
        <span class="history-card-date">${parseLocalDate(session.date).toLocaleDateString("fr-FR")}${session.durationSeconds > 0 ? ` · ${formatSessionDuration(session.durationSeconds)}` : ""}</span>
      </div>
      ${exercisesHtml}
      ${session.notes ? `<p class="history-card-notes">${escapeHtml(session.notes)}</p>` : ""}
      <div class="history-card-actions">
        <button type="button" class="btn btn-secondary btn-small hist-repeat-btn">Refaire cette séance</button>
        <button type="button" class="btn btn-secondary btn-small hist-edit-btn">Modifier</button>
        <button type="button" class="btn btn-secondary btn-small hist-delete-btn">Supprimer</button>
      </div>
    `;
    card.querySelector(".hist-repeat-btn").addEventListener("click", () => duplicateMuscuSession(session));
    card.querySelector(".hist-edit-btn").addEventListener("click", () => startEditMuscuSession(session));
    card.querySelector(".hist-delete-btn").addEventListener("click", () => {
      const confirmed = confirm("Supprimer définitivement cette séance ? Cette action est irréversible.");
      if (!confirmed) return;
      deleteSession(session.id);
      renderMuscuHistory();
      renderMuscuTemplates(); // "Refaire une séance" a peut-être changé
      if (typeof notifyRankProgress === "function") notifyRankProgress(); // rangs et succès
      if (typeof renderDashboard === "function") renderDashboard();
      if (typeof renderRecords === "function") renderRecords();
    });
    muscuHistoryList.appendChild(card);
  });

  appendShowMoreButton(muscuHistoryList, sessions.length - muscuHistoryLimit, () => {
    muscuHistoryLimit += HISTORY_PAGE_SIZE;
    renderMuscuHistory();
  });
}

// --------------------------------------------------------------------------
// INITIALISATION DE LA PAGE
// Une séance en cours (appli fermée pendant l'entraînement) reprend là où
// elle en était : séries cochées, chrono et minuteur de repos.
// --------------------------------------------------------------------------

muscuDraft = loadMuscuDraft();
if (!muscuDraft) localStorage.removeItem(STORAGE_KEY_MUSCU_DRAFT);
populateExerciseFilterSelect();
renderMuscuView();
renderMuscuHistory();

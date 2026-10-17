// ==========================================================================
// musculation.js — tout ce qui concerne la page Musculation.
//
// Point important sur la structure : une séance peut désormais contenir
// PLUSIEURS exercices (ex : une séance "pecs" avec Bench Press, Incline
// Bench Press et Dumbbell Floor Press le même jour). Le formulaire affiche
// donc une liste de "blocs exercice" qu'on peut ajouter/enlever, chacun
// avec son propre choix d'exercice, ses séries et son RPE.
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
 * Lit les champs minutes + secondes d'un bloc cardio. Renvoie des secondes,
 * ou null si c'est vide ou illisible. Les dixièmes sont acceptés ("43,5").
 */
function readCardioTime(block) {
  const minText = block.querySelector(".cardio-block-min").value.trim();
  const secText = block.querySelector(".cardio-block-sec").value.trim().replace(",", ".");
  if (!minText && !secText) return null;
  if ((minText && !/^\d+$/.test(minText)) || (secText && !/^\d+(\.\d)?$/.test(secText))) return null;
  const total = (Number(minText) || 0) * 60 + (Number(secText) || 0);
  return total > 0 ? Math.round(total * 10) / 10 : null;
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
// ÉLÉMENTS GÉNÉRAUX DU FORMULAIRE
// --------------------------------------------------------------------------

const muscuForm = document.getElementById("muscu-form");
const muscuDateInput = document.getElementById("muscu-date");
const muscuExercisesList = document.getElementById("muscu-exercises-list");
const muscuAddExerciseBlockBtn = document.getElementById("muscu-add-exercise-block");
const muscuNotesInput = document.getElementById("muscu-notes");
const muscuFeedback = document.getElementById("muscu-feedback");
const muscuFilterSelect = document.getElementById("muscu-filter-exercise");
const muscuHistoryList = document.getElementById("muscu-history-list");
const muscuHistorySearch = document.getElementById("muscu-history-search");
const muscuLastSeen = document.getElementById("muscu-last-seen");

/**
 * Prépare un texte pour une recherche souple : minuscules et accents retirés,
 * pour que "elevations" trouve "Élévations latérales". Partagée avec crossfit.js.
 */
function normalizeSearchText(text) {
  return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
const muscuSubmitBtn = document.getElementById("muscu-submit-btn");
const muscuCancelEditBtn = document.getElementById("muscu-cancel-edit");

// Quand cette variable contient un id, le formulaire est en mode "édition".
let muscuEditingId = null;

/**
 * Renvoie la liste des exercices déjà utilisés dans l'historique, fusionnée
 * avec la liste par défaut (sans doublons). Ça permet aux exercices
 * "personnalisés" ajoutés une fois de réapparaître dans les listes déroulantes.
 */
function getAllKnownExercises() {
  const used = getAllSessions()
    .filter((s) => s.type === "musculation")
    .flatMap((s) => (s.exercises || []).filter((ex) => ex && !isCardioEntry(ex)).map((ex) => ex.exercise));
  return Array.from(new Set([...DEFAULT_EXERCISES, ...used])).filter((name) => !isMeasuredExercise(name)).sort();
}

/**
 * Remplit un <select> avec la liste des exercices connus + option "Autre".
 * options.includeMeasured : ajoute aussi le groupe "Cardio et distance"
 * (row, bike, run...), proposé uniquement dans les WOD.
 */
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
  muscuFilterSelect.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = "Tous les exercices";
  muscuFilterSelect.appendChild(allOpt);
  getAllKnownExercises().forEach((ex) => muscuFilterSelect.appendChild(createExerciseOption(ex)));
}

// --------------------------------------------------------------------------
// SÉRIES DYNAMIQUES (ajouter / enlever des lignes reps x poids)
// --------------------------------------------------------------------------

function createSetRow() {
  const row = document.createElement("div");
  row.className = "set-row";
  row.innerHTML = `
    <input type="number" class="set-reps" placeholder="Reps" min="0" inputmode="numeric">
    <span class="set-x">×</span>
    <input type="number" class="set-weight" placeholder="kg" min="0" step="0.5">
    <button type="button" class="set-duplicate" title="Refaire cette série" aria-label="Refaire cette série">
      <svg viewBox="0 0 24 24"><path d="M8 3h11a2 2 0 0 1 2 2v11h-2V5H8V3Zm-3 4h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm0 2v10h10V9H5Z"/></svg>
    </button>
    <button type="button" class="set-remove" title="Supprimer cette série">✕</button>
  `;
  row.querySelector(".set-remove").addEventListener("click", () => row.remove());

  // "Refaire cette série" : insère juste en dessous une copie exacte de la
  // série (mêmes reps, même charge), pour ne pas tout retaper quand on
  // enchaîne plusieurs séries identiques (ex : 5 × 10 reps à 40 kg).
  row.querySelector(".set-duplicate").addEventListener("click", () => {
    const copy = createSetRow();
    const sourceWeight = row.querySelector(".set-weight");
    copy.querySelector(".set-reps").value = row.querySelector(".set-reps").value;
    copy.querySelector(".set-weight").value = sourceWeight.value;
    copy.querySelector(".set-weight").placeholder = sourceWeight.placeholder;
    row.after(copy);
  });
  return row;
}

// --------------------------------------------------------------------------
// AFFICHAGE COMPACT DES SÉRIES
// Les séries identiques qui se suivent sont regroupées :
// [70×5, 70×5, 70×5, 75×3] → "3 × 5 à 70 kg · 1 × 3 à 75 kg"
// (séries × reps à charge). Poids du corps : "3 × 8 reps", ou "lesté".
// --------------------------------------------------------------------------

function formatSetsCompact(sets, isBW) {
  const groups = [];
  (Array.isArray(sets) ? sets : []).forEach((set) => {
    if (!set) return;
    const reps = Number(set.reps) || 0;
    const weight = Number(set.weight) || 0;
    const last = groups[groups.length - 1];
    if (last && last.reps === reps && last.weight === weight) last.count += 1;
    else groups.push({ reps, weight, count: 1 });
  });
  return groups
    .map(({ count, reps, weight }) => (weight > 0
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

// --------------------------------------------------------------------------
// "DERNIÈRE FOIS" DANS LE FORMULAIRE
// Sous chaque exercice choisi : ta dernière perf sur cet exercice et ton
// record, pour savoir quoi charger sans aller fouiller l'historique.
// --------------------------------------------------------------------------

/** Séances de la plus récente à la plus ancienne (à date égale : la dernière ajoutée d'abord). */
function getSessionsNewestFirst(excludeSessionId) {
  return getAllSessions()
    .map((session, index) => ({ session, index }))
    .filter(({ session }) => session && session.id !== excludeSessionId && Array.isArray(session.exercises))
    .sort((a, b) => (a.session.date < b.session.date ? 1 : a.session.date > b.session.date ? -1 : b.index - a.index))
    .map(({ session }) => session);
}

/** Dernière fois qu'un exercice a été fait : séries (musculation) ou ligne de WOD. null si jamais. */
function getLastExercisePerformance(name, excludeSessionId) {
  if (!name) return null;
  for (const session of getSessionsNewestFirst(excludeSessionId)) {
    if (session.type === "musculation") {
      const entry = session.exercises.find((e) => e && e.exercise === name && !isCardioEntry(e) && Array.isArray(e.sets) && e.sets.length > 0);
      if (entry) return { source: "muscu", date: session.date, sets: entry.sets };
    } else if (session.type === "crossfit") {
      const entry = session.exercises.find((e) => e && typeof e === "object" && e.exercise === name && getEntryUnit(e) === "reps" && e.reps > 0);
      if (entry) {
        const perRound = session.wodType === "AMRAP" && typeof session.rounds === "number";
        return { source: "wod", date: session.date, wodName: session.wodName, reps: entry.reps, weight: entry.weight || 0, perRound };
      }
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

/** Remet à jour la ligne "Dernière fois" de tous les blocs du formulaire. */
function refreshExerciseLastSeen() {
  muscuExercisesList.querySelectorAll(".exercise-block").forEach((block) => {
    if (typeof block.refreshLastSeen === "function") block.refreshLastSeen();
  });
}

// --------------------------------------------------------------------------
// BLOCS EXERCICE (un bloc = un exercice avec ses séries et son RPE)
// --------------------------------------------------------------------------

/** Crée un nouveau bloc exercice, vide ou pré-rempli si prefill est fourni. */
function createExerciseBlock(prefill) {
  const block = document.createElement("div");
  block.className = "exercise-block";
  block.innerHTML = `
    <div class="exercise-block-header">
      <select class="exercise-block-select"></select>
      <input type="text" class="exercise-block-custom form-input-spaced" placeholder="Nom de l'exercice" style="display:none;">
      <button type="button" class="exercise-block-remove" title="Supprimer cet exercice">✕</button>
    </div>
    <div class="exercise-last-seen" style="display:none;"></div>
    <p class="exercise-block-hint" style="display:none;">Poids de corps : la charge est facultative — ajoute un lest si tu es lesté.</p>
    <div class="exercise-block-sets sets-list"></div>
    <button type="button" class="exercise-block-add-set btn btn-secondary btn-small">+ Ajouter une série</button>
    <div class="form-row" style="margin-top: 10px;">
      <label>RPE <span class="label-optional">(optionnel)</span></label>
      <input type="number" class="exercise-block-rpe" min="1" max="10" step="0.5" placeholder="ex : 8">
    </div>
  `;

  const select = block.querySelector(".exercise-block-select");
  const customInput = block.querySelector(".exercise-block-custom");
  const hint = block.querySelector(".exercise-block-hint");
  const setsList = block.querySelector(".exercise-block-sets");
  const addSetBtn = block.querySelector(".exercise-block-add-set");
  const removeBtn = block.querySelector(".exercise-block-remove");
  const rpeInput = block.querySelector(".exercise-block-rpe");
  const lastSeenEl = block.querySelector(".exercise-last-seen");
  let lastPerformance = null;

  populateExerciseSelectElement(select);

  /** Renvoie le nom d'exercice actuellement choisi dans ce bloc (liste ou saisie libre). */
  function getBlockExerciseName() {
    return select.value === "__custom__" ? customInput.value.trim() : select.value;
  }

  /**
   * Adapte le bloc à l'exercice choisi : indice "poids du corps", ligne
   * "Dernière fois" (+ record) et charges de la dernière fois en grisé
   * dans les cases vides (ce n'est qu'un repère : rien n'est enregistré
   * tant que tu n'as pas tapé la valeur).
   */
  function updateBodyweightUI() {
    const name = getBlockExerciseName();
    const isBW = isBodyweightExercise(name);
    hint.style.display = isBW ? "block" : "none";

    lastPerformance = getLastExercisePerformance(name, muscuEditingId);
    const lastSets = lastPerformance && lastPerformance.source === "muscu" ? lastPerformance.sets : [];
    setsList.querySelectorAll(".set-row").forEach((row, index) => {
      const reference = lastSets.length ? lastSets[Math.min(index, lastSets.length - 1)] : null;
      const input = row.querySelector(".set-weight");
      input.placeholder = reference && reference.weight > 0
        ? formatNumberFr(reference.weight)
        : (isBW ? "Lest (kg)" : "kg");
    });

    const record = describeExerciseRecord(name);
    if (!lastPerformance && !record) {
      lastSeenEl.style.display = "none";
      lastSeenEl.innerHTML = "";
      return;
    }
    let lastText = "";
    if (lastPerformance && lastPerformance.source === "muscu") {
      lastText = formatSetsCompact(lastPerformance.sets, isBW);
    } else if (lastPerformance) {
      const amount = `${lastPerformance.reps} rep${lastPerformance.reps > 1 ? "s" : ""}${lastPerformance.perRound ? "/tour" : ""}`;
      const load = lastPerformance.weight > 0 ? ` ${isBW ? "lesté" : "à"} ${formatNumberFr(lastPerformance.weight)} kg` : "";
      lastText = `${amount}${load} (${lastPerformance.wodName || "WOD"})`;
    }
    lastSeenEl.innerHTML = `
      ${lastPerformance ? `<span class="exercise-last-seen-text"><strong>Dernière fois</strong> · ${escapeHtml(formatShortDate(lastPerformance.date))} : ${escapeHtml(lastText)}</span>` : ""}
      ${record ? `<span class="exercise-last-seen-record">${escapeHtml(record)}</span>` : ""}
      ${lastSets.length ? `<button type="button" class="exercise-last-seen-reuse">Reprendre ces séries</button>` : ""}`;
    lastSeenEl.style.display = "";
    const reuse = lastSeenEl.querySelector(".exercise-last-seen-reuse");
    if (reuse) reuse.addEventListener("click", () => reuseLastSets(lastSets));
  }

  /** Recopie les séries de la dernière fois dans les lignes vides (en ajoute si besoin). */
  function reuseLastSets(lastSets) {
    lastSets.forEach((set, index) => {
      let row = setsList.querySelectorAll(".set-row")[index];
      if (!row) {
        row = createSetRow();
        setsList.appendChild(row);
      }
      const repsInput = row.querySelector(".set-reps");
      const weightInput = row.querySelector(".set-weight");
      if (repsInput.value.trim() || weightInput.value.trim()) return; // ligne déjà remplie : on n'y touche pas
      repsInput.value = set.reps;
      weightInput.value = set.weight > 0 ? set.weight : "";
    });
    updateBodyweightUI();
  }
  block.refreshLastSeen = updateBodyweightUI;

  select.addEventListener("change", () => {
    const isCustom = select.value === "__custom__";
    customInput.style.display = isCustom ? "block" : "none";
    if (isCustom) customInput.focus();
    updateBodyweightUI();
  });
  customInput.addEventListener("input", updateBodyweightUI);

  addSetBtn.addEventListener("click", () => {
    setsList.appendChild(createSetRow());
    updateBodyweightUI();
  });

  removeBtn.addEventListener("click", () => {
    if (muscuExercisesList.children.length <= 1) {
      showMuscuFeedback("Une séance doit contenir au moins un exercice.", true);
      return;
    }
    block.remove();
  });

  // Pré-remplissage (mode édition) ou lignes vides par défaut (mode ajout)
  if (prefill) {
    const exists = getAllKnownExercises().includes(prefill.exercise);
    if (exists) {
      select.value = prefill.exercise;
    } else {
      select.value = "__custom__";
      customInput.style.display = "block";
      customInput.value = prefill.exercise;
    }
    prefill.sets.forEach((set) => {
      const row = createSetRow();
      row.querySelector(".set-reps").value = set.reps;
      row.querySelector(".set-weight").value = set.weight;
      setsList.appendChild(row);
    });
    rpeInput.value = prefill.rpe || "";
  } else {
    for (let i = 0; i < 3; i++) setsList.appendChild(createSetRow());
  }

  updateBodyweightUI();

  return block;
}

muscuAddExerciseBlockBtn.addEventListener("click", () => {
  muscuExercisesList.appendChild(createExerciseBlock(null));
});

/** Crée un bloc "test cardio" : le test choisi et le temps réalisé. */
function createCardioBlock(prefill) {
  const block = document.createElement("div");
  block.className = "exercise-block cardio-block";
  block.innerHTML = `
    <div class="exercise-block-header">
      <select class="exercise-block-select cardio-block-select" aria-label="Test cardio"></select>
      <button type="button" class="exercise-block-remove" title="Supprimer ce test">✕</button>
    </div>
    <div class="exercise-last-seen" style="display:none;"></div>
    <div class="form-row" style="margin-bottom: 0;">
      <label>Temps réalisé</label>
      <!-- Deux champs séparés : le pavé numérique de l'iPhone n'a pas de touche ":" -->
      <div class="cardio-time-row">
        <input type="text" class="cardio-block-min" inputmode="numeric" pattern="[0-9]*" placeholder="7" aria-label="Minutes">
        <span class="cardio-time-unit">min</span>
        <input type="text" class="cardio-block-sec" inputmode="decimal" placeholder="45" aria-label="Secondes">
        <span class="cardio-time-unit">s</span>
      </div>
    </div>
  `;
  const select = block.querySelector(".cardio-block-select");
  CARDIO_TESTS.forEach((name) => select.appendChild(createExerciseOption(name)));
  const lastSeenEl = block.querySelector(".exercise-last-seen");

  /** "Dernière fois · 12/10 : 8:02" et le record du test choisi. */
  function updateCardioLastSeen() {
    const { last, best } = getCardioLastAndBest(select.value, muscuEditingId);
    if (!last && best === null) {
      lastSeenEl.style.display = "none";
      lastSeenEl.innerHTML = "";
      return;
    }
    lastSeenEl.innerHTML = `
      ${last ? `<span class="exercise-last-seen-text"><strong>Dernière fois</strong> · ${escapeHtml(formatShortDate(last.date))} : ${formatDuration(last.timeSeconds)}</span>` : ""}
      ${best !== null ? `<span class="exercise-last-seen-record">Record : ${formatDuration(best)}</span>` : ""}`;
    lastSeenEl.style.display = "";
  }
  select.addEventListener("change", updateCardioLastSeen);
  block.refreshLastSeen = updateCardioLastSeen;
  block.querySelector(".exercise-block-remove").addEventListener("click", () => {
    if (muscuExercisesList.children.length <= 1) {
      showMuscuFeedback("Une séance doit contenir au moins un exercice.", true);
      return;
    }
    block.remove();
  });
  if (prefill) {
    // Ancien test qui n'est plus proposé : on le garde tel quel pour ne pas
    // le transformer en un autre test par erreur en modifiant la séance
    if (prefill.exercise && !CARDIO_TESTS.includes(prefill.exercise)) {
      const legacy = document.createElement("option");
      legacy.value = prefill.exercise;
      legacy.textContent = `${prefill.exercise} (ancien test)`;
      select.appendChild(legacy);
    }
    select.value = prefill.exercise;
    if (prefill.timeSeconds > 0) {
      const minutes = Math.floor(prefill.timeSeconds / 60);
      const seconds = Math.round((prefill.timeSeconds - minutes * 60) * 10) / 10;
      block.querySelector(".cardio-block-min").value = String(minutes);
      block.querySelector(".cardio-block-sec").value = String(seconds).replace(".", ",");
    }
  }
  updateCardioLastSeen();
  return block;
}

/** Crée le bon type de bloc pour une entrée enregistrée (exercice ou test cardio). */
function createBlockForEntry(entry) {
  return isCardioEntry(entry) ? createCardioBlock(entry) : createExerciseBlock(entry);
}

document.getElementById("muscu-add-cardio-block").addEventListener("click", () => {
  muscuExercisesList.appendChild(createCardioBlock(null));
});

/** Vide la liste des blocs et en remet un seul, vide. */
function resetExerciseBlocks() {
  muscuExercisesList.innerHTML = "";
  muscuExercisesList.appendChild(createExerciseBlock(null));
}

// --------------------------------------------------------------------------
// SOUMISSION DU FORMULAIRE
// --------------------------------------------------------------------------

muscuForm.addEventListener("submit", (event) => {
  event.preventDefault(); // empêche la page de se recharger, comportement par défaut d'un formulaire

  const blocks = [...muscuExercisesList.children];
  const exercises = [];

  for (const block of blocks) {
    if (block.classList.contains("cardio-block")) {
      const testName = block.querySelector(".cardio-block-select").value;
      const timeSeconds = readCardioTime(block);
      if (timeSeconds === null) {
        showMuscuFeedback(`Merci d'indiquer ton temps pour le test ${testName} (minutes et secondes, ex : 1 min 43 s).`, true);
        return;
      }
      exercises.push({ exercise: testName, kind: "cardio", timeSeconds });
      continue;
    }

    const select = block.querySelector(".exercise-block-select");
    const customInput = block.querySelector(".exercise-block-custom");
    const isCustom = select.value === "__custom__";
    const exerciseName = isCustom ? customInput.value.trim() : select.value;

    if (!exerciseName) {
      showMuscuFeedback("Merci d'indiquer un nom pour chaque exercice de la séance.", true);
      return;
    }

    const isBW = isBodyweightExercise(exerciseName);
    // Une ligne entièrement vide est ignorée (on n'est pas obligé de remplir
    // les 3 lignes proposées). Une ligne à moitié remplie, en revanche, n'est
    // jamais jetée en silence : on dit exactement ce qui manque.
    // Pour un exercice au poids du corps, la charge (un éventuel lest) reste
    // facultative ; avec barre/haltères, elle est obligatoire.
    const sets = [];
    const rows = [...block.querySelectorAll(".set-row")];
    for (let i = 0; i < rows.length; i++) {
      const repsText = rows[i].querySelector(".set-reps").value.trim();
      const weightText = rows[i].querySelector(".set-weight").value.trim().replace(",", ".");
      if (!repsText && !weightText) continue;
      const label = `Série ${i + 1} de ${exerciseName}`;
      const reps = Number(repsText);
      const weight = weightText ? Number(weightText) : 0;
      if (!repsText) {
        showMuscuFeedback(`${label} : il manque le nombre de reps.`, true);
        return;
      }
      if (!Number.isInteger(reps) || reps <= 0) {
        showMuscuFeedback(`${label} : le nombre de reps doit être un nombre entier.`, true);
        return;
      }
      if (!isBW && !weightText) {
        showMuscuFeedback(`${label} : il manque la charge (kg).`, true);
        return;
      }
      if (!Number.isFinite(weight) || weight < 0 || (!isBW && weight === 0)) {
        showMuscuFeedback(`${label} : la charge n'est pas valide.`, true);
        return;
      }
      sets.push({ reps, weight });
    }

    if (sets.length === 0) {
      showMuscuFeedback(`Merci de renseigner au moins une série pour ${exerciseName}.`, true);
      return;
    }

    const rpeValue = block.querySelector(".exercise-block-rpe").value;
    exercises.push({ exercise: exerciseName, sets, rpe: rpeValue ? Number(rpeValue) : null });
  }

  if (exercises.length === 0) {
    showMuscuFeedback("Ajoute au moins un exercice à ta séance.", true);
    return;
  }

  const sessionData = {
    type: "musculation",
    date: muscuDateInput.value || todayLocalDateString(),
    exercises,
    notes: muscuNotesInput.value.trim(),
  };

  if (muscuEditingId) {
    updateSession(muscuEditingId, sessionData);
    showMuscuFeedback("Séance mise à jour !", false);
  } else {
    const recordsBefore = typeof computeMuscuRecords === "function" ? computeMuscuRecords() : {};
    const cardioBestsBefore = typeof computeCardioTestBests === "function" ? computeCardioTestBests() : {};
    addSession(sessionData);

    const newRecords = typeof detectMuscuNewRecords === "function"
      ? detectMuscuNewRecords(recordsBefore, exercises, sessionData.date, cardioBestsBefore)
      : [];

    // Si la séance contient un exercice au poids du corps mais qu'aucun poids
    // n'est encore connu (onglet Mensurations vide), le volume de ces
    // exercices ne pourra pas être calculé — on le signale simplement,
    // sans jamais empêcher l'enregistrement de la séance.
    const hasBodyweightExercise = exercises.some((ex) => isBodyweightExercise(ex.exercise));
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

  cancelMuscuEdit(); // remet le formulaire à zéro et sort du mode édition
  populateExerciseFilterSelect();
  renderMuscuHistory();
  if (typeof notifyRankProgress === "function") notifyRankProgress(); // rangs et succès
  if (typeof renderDashboard === "function") renderDashboard();
  if (typeof renderRecords === "function") renderRecords();
});

function showMuscuFeedback(message, isError) {
  muscuFeedback.textContent = message;
  muscuFeedback.className = "form-feedback " + (isError ? "form-feedback-error" : "form-feedback-success");
  setTimeout(() => { muscuFeedback.textContent = ""; }, 3500);
}

/** Affiche un badge mis en avant quand la séance qu'on vient d'enregistrer bat un record. */
function showMuscuRecordBadge(newRecords) {
  const list = newRecords.map((r) => `${escapeHtml(r.exercise)} : ${escapeHtml(r.text || `${formatNumberFr(r.value)} kg`)}`).join(" · ");
  muscuFeedback.innerHTML = `
    <span class="record-badge">
      <svg viewBox="0 0 24 24" class="record-badge-icon"><path d="M6 2h12v6a6 6 0 0 1-5 5.92V17h3v2H8v-2h3v-3.08A6 6 0 0 1 6 8V2Zm2 2v4a4 4 0 0 0 8 0V4H8ZM3 4h2v3a3 3 0 0 1-2 2.83V4Zm16 0h2v5.83A3 3 0 0 1 19 7V4Z"/></svg>
      Nouveau record ! ${list}
    </span>`;
  muscuFeedback.className = "form-feedback";
  setTimeout(() => { muscuFeedback.innerHTML = ""; }, 5000);
}

/**
 * Pré-remplit le formulaire avec les exercices d'une séance existante, mais
 * SANS passer en mode édition : la validation créera une toute nouvelle
 * séance, datée d'aujourd'hui. Pratique pour un programme qui revient
 * régulièrement, où seules les charges changent d'une fois sur l'autre.
 */
function duplicateMuscuSession(session) {
  muscuEditingId = null; // on s'assure de bien être en mode "ajout", pas "édition"

  muscuDateInput.value = todayLocalDateString();
  muscuNotesInput.value = "";

  muscuExercisesList.innerHTML = "";
  (session.exercises || []).forEach((entry) => {
    muscuExercisesList.appendChild(createBlockForEntry(entry));
  });

  muscuSubmitBtn.textContent = "Enregistrer la séance";
  muscuCancelEditBtn.style.display = "none";
}

/**
 * Remplit le formulaire avec les valeurs d'une séance existante (tous ses
 * exercices) et bascule en mode édition. Appelée depuis l'historique.
 */
function startEditMuscuSession(session) {
  muscuEditingId = session.id;

  muscuDateInput.value = session.date;
  muscuNotesInput.value = session.notes || "";

  muscuExercisesList.innerHTML = "";
  (session.exercises || []).forEach((entry) => {
    muscuExercisesList.appendChild(createBlockForEntry(entry));
  });

  muscuSubmitBtn.textContent = "Mettre à jour la séance";
  muscuCancelEditBtn.style.display = "inline-block";
}

/** Sort du mode édition et remet le formulaire à son état "ajout". */
function cancelMuscuEdit() {
  muscuEditingId = null;
  muscuDateInput.value = todayLocalDateString();
  muscuNotesInput.value = "";
  resetExerciseBlocks();
  muscuSubmitBtn.textContent = "Enregistrer la séance";
  muscuCancelEditBtn.style.display = "none";
}

muscuCancelEditBtn.addEventListener("click", cancelMuscuEdit);

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
        <span class="history-card-title">Séance</span>
        <span class="history-card-date">${new Date(session.date).toLocaleDateString("fr-FR")}</span>
      </div>
      ${exercisesHtml}
      ${session.notes ? `<p class="history-card-notes">${escapeHtml(session.notes)}</p>` : ""}
      <div class="history-card-actions">
        <button type="button" class="btn btn-secondary btn-small hist-repeat-btn">Refaire cette séance</button>
        <button type="button" class="btn btn-secondary btn-small hist-edit-btn">Modifier</button>
        <button type="button" class="btn btn-secondary btn-small hist-delete-btn">Supprimer</button>
      </div>
    `;
    card.querySelector(".hist-repeat-btn").addEventListener("click", () => {
      duplicateMuscuSession(session);
      document.querySelector("#section-musculation .form-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    card.querySelector(".hist-edit-btn").addEventListener("click", () => {
      startEditMuscuSession(session);
      document.querySelector("#section-musculation .form-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    card.querySelector(".hist-delete-btn").addEventListener("click", () => {
      const confirmed = confirm("Supprimer définitivement cette séance ? Cette action est irréversible.");
      if (!confirmed) return;
      deleteSession(session.id);
      renderMuscuHistory();
      refreshExerciseLastSeen(); // la "dernière fois" a peut-être changé
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
// --------------------------------------------------------------------------

muscuDateInput.value = todayLocalDateString(); // aujourd'hui par défaut
populateExerciseFilterSelect();
resetExerciseBlocks();
renderMuscuHistory();

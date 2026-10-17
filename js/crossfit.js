// ==========================================================================
// crossfit.js — tout ce qui concerne la page CrossFit :
//   - remplir la liste déroulante des noms de WOD
//   - ajouter/enlever des lignes de mouvements dans le formulaire
//   - enregistrer un WOD (via addSession, fourni par data.js)
//   - afficher l'historique, filtrable par nom de WOD
// ==========================================================================

// Quelques WOD "benchmark" bien connus, proposés par défaut.
const DEFAULT_WODS = ["Fran", "Grace", "Helen", "Cindy", "Annie", "Diane", "Murph"];

/** Renvoie la classe de couleur du badge de niveau : rouge pour RX, doré pour Inter, bleu pour Scaled. */
function getLevelBadgeClass(level) {
  if (level === "RX") return "badge-level-rx";
  if (level === "Scaled") return "badge-level-scaled";
  return "badge-level-inter"; // Inter, ou toute autre valeur
}

// Option toujours disponible pour un WOD "classique", sans nom particulier —
// évite d'avoir à taper un nom pour les entraînements du quotidien.
const DAILY_WOD_LABEL = "WOD du jour";

// Cours "spécifiques" (gymnastique, haltérophilie) : ce ne sont pas des WOD
// avec un score, juste des séances qu'on veut retrouver dans l'historique.
// Pas de temps, de rounds ni de niveau à saisir ; on peut quand même y noter
// des mouvements libres ou des exercices structurés (volume, charge max).
const SPE_SESSIONS = ["Spé gym", "Spé haltéro"];

function isSpeSession(name) {
  return SPE_SESSIONS.includes(name);
}

// Formats où un score est indispensable. Un EMOM, un Tabata ou un format
// "Autre" se termine souvent sans temps ni rounds à noter : le score y est
// facultatif (et un WOD sans score n'entre simplement pas dans les records).
const SCORED_WOD_TYPES = ["For Time", "AMRAP", "Chipper"];

function isScoreRequired(wodType) {
  return SCORED_WOD_TYPES.includes(wodType);
}

// Détail de chaque benchmark : son format, son type de score (temps ou
// rounds), et ses mouvements avec le schéma de répétitions/charges. Sert à
// préremplir automatiquement le formulaire dès qu'on sélectionne son nom.
const BENCHMARK_WODS = {
  Helen: {
    wodType: "For Time",
    scoreType: "time",
    movements: ["3 rounds for time", "400 m run", "21 kettlebell swings (24/16 kg)", "12 pull-ups"],
  },
  Annie: {
    wodType: "For Time",
    scoreType: "time",
    movements: ["50-40-30-20-10 reps, for time", "Double-unders", "Sit-ups"],
  },
  Grace: {
    wodType: "For Time",
    scoreType: "time",
    movements: ["30 reps, for time", "Clean & jerks (61/43 kg)"],
  },
  Fran: {
    wodType: "For Time",
    scoreType: "time",
    movements: ["21-15-9 reps, for time", "Thrusters (43/30 kg)", "Pull-ups"],
  },
  Cindy: {
    wodType: "AMRAP",
    scoreType: "rounds",
    movements: ["AMRAP 20 minutes", "5 pull-ups", "10 push-ups", "15 air squats"],
  },
  Diane: {
    wodType: "For Time",
    scoreType: "time",
    movements: ["21-15-9 reps, for time", "Deadlifts (102/70 kg)", "Handstand push-ups"],
  },
  Murph: {
    wodType: "For Time",
    scoreType: "time",
    movements: ["For time", "1 mile run", "100 pull-ups", "200 push-ups", "300 air squats", "1 mile run"],
  },
};

// --------------------------------------------------------------------------
// ÉLÉMENTS DU FORMULAIRE
// --------------------------------------------------------------------------

const cfForm = document.getElementById("cf-form");
const cfDateInput = document.getElementById("cf-date");
const cfWodSelect = document.getElementById("cf-wod-select");
const cfTypeSelect = document.getElementById("cf-type");
const cfTypeRow = document.getElementById("cf-type-row");
const cfLevelRow = document.getElementById("cf-level-row");
const cfRxSelect = document.getElementById("cf-rx");
const cfTimeRow = document.getElementById("cf-time-row");
const cfTimeInput = document.getElementById("cf-time");
const cfRoundsRow = document.getElementById("cf-rounds-row");
const cfRoundsInput = document.getElementById("cf-rounds");
const cfExtraRepsInput = document.getElementById("cf-extra-reps");
const cfExercisesList = document.getElementById("cf-exercises-list");
const cfAddExerciseBtn = document.getElementById("cf-add-exercise");
const cfAddStructuredExerciseBtn = document.getElementById("cf-add-structured-exercise");
const cfNotesInput = document.getElementById("cf-notes");
const cfFeedback = document.getElementById("cf-feedback");
const cfFilterSelect = document.getElementById("cf-filter-wod");
const cfFilterLevelSelect = document.getElementById("cf-filter-level");
const cfHistoryList = document.getElementById("cf-history-list");
const cfSubmitBtn = document.getElementById("cf-submit-btn");
const cfCancelEditBtn = document.getElementById("cf-cancel-edit");

// Quand cette variable contient un id, le formulaire est en mode "édition".
let cfEditingId = null;

/**
 * Renvoie la liste des noms de WOD déjà utilisés dans l'historique,
 * fusionnée avec la liste des benchmarks par défaut (sans doublons).
 * "WOD du jour" est volontairement exclu d'ici : il est géré à part,
 * toujours affiché en premier dans les listes déroulantes.
 */
function getAllKnownWods() {
  const used = getAllSessions()
    .filter((s) => s.type === "crossfit")
    .map((s) => s.wodName)
    .filter((name) => Boolean(name) && name !== DAILY_WOD_LABEL && !isSpeSession(name));
  return Array.from(new Set([...DEFAULT_WODS, ...used])).sort();
}

function populateWodSelects() {
  const wods = getAllKnownWods();

  // ----- Select du formulaire : "WOD du jour" toujours en premier,
  // c'est le cas le plus courant (un WOD sans nom particulier) -----
  cfWodSelect.innerHTML = "";
  const dailyOpt = document.createElement("option");
  dailyOpt.value = DAILY_WOD_LABEL;
  dailyOpt.textContent = DAILY_WOD_LABEL;
  cfWodSelect.appendChild(dailyOpt);
  SPE_SESSIONS.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    cfWodSelect.appendChild(opt);
  });
  wods.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    cfWodSelect.appendChild(opt);
  });

  // ----- Select du filtre d'historique -----
  cfFilterSelect.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = "Tous les WOD";
  cfFilterSelect.appendChild(allOpt);
  const dailyFilterOpt = document.createElement("option");
  dailyFilterOpt.value = DAILY_WOD_LABEL;
  dailyFilterOpt.textContent = DAILY_WOD_LABEL;
  cfFilterSelect.appendChild(dailyFilterOpt);
  SPE_SESSIONS.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    cfFilterSelect.appendChild(opt);
  });
  wods.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    cfFilterSelect.appendChild(opt);
  });
}

// Formats chronométrés : le score est un temps. AMRAP : des rounds (+ reps).
// Les autres (EMOM, Tabata, Autre) ont un score facultatif : les deux champs restent proposés.
const TIME_SCORED_WOD_TYPES = ["For Time", "Chipper"];

/**
 * N'affiche que les champs de score utiles au type de WOD choisi.
 * Un champ déjà rempli reste toujours visible (rien ne disparaît en
 * silence si tu changes le type après avoir noté ton score).
 */
function updateScoreFields(wodName) {
  if (isSpeSession(wodName === undefined ? cfWodSelect.value : wodName)) {
    cfTimeRow.style.display = "none";
    cfRoundsRow.style.display = "none";
    return;
  }
  const type = cfTypeSelect.value;
  const optional = !isScoreRequired(type);
  const hasTime = cfTimeInput.value.trim() !== "";
  const hasRounds = cfRoundsInput.value !== "" || cfExtraRepsInput.value !== "";
  const showTime = optional || TIME_SCORED_WOD_TYPES.includes(type) || hasTime;
  const showRounds = optional || type === "AMRAP" || hasRounds;
  cfTimeRow.style.display = showTime ? "" : "none";
  cfRoundsRow.style.display = showRounds ? "" : "none";
  const timeOptional = document.getElementById("cf-time-optional");
  const roundsOptional = document.getElementById("cf-rounds-optional");
  if (timeOptional) timeOptional.textContent = optional ? "(facultatif)" : "";
  if (roundsOptional) roundsOptional.textContent = optional ? "(facultatif)" : "";
}

/** Champs propres au WOD choisi : type et niveau masqués pour un cours de spé, puis les champs de score. */
function setScoreFieldsVisibility(name) {
  const isSpe = isSpeSession(name);
  cfTypeRow.style.display = isSpe ? "none" : "";
  cfLevelRow.style.display = isSpe ? "none" : "";
  updateScoreFields(name);
}

/**
 * Applique automatiquement le préréglage d'un benchmark quand on le
 * sélectionne dans le formulaire : type de WOD, mouvements préremplis, et
 * affichage des seuls champs de score pertinents. Pour "WOD du jour" ou un
 * nom sans préréglage connu, on repart sur des mouvements vides.
 */
function applyWodSelection(name) {
  const preset = BENCHMARK_WODS[name];
  setScoreFieldsVisibility(name);

  if (!preset) {
    resetExerciseRows();
    return;
  }

  cfTypeSelect.value = preset.wodType;
  updateScoreHint();

  cfExercisesList.innerHTML = "";
  preset.movements.forEach((movement) => {
    const row = createExerciseRow();
    row.querySelector(".cf-exercise-input").value = movement;
    cfExercisesList.appendChild(row);
  });

  if (preset.scoreType === "time") {
    cfRoundsInput.value = "";
    cfExtraRepsInput.value = "";
  } else {
    cfTimeInput.value = "";
  }
}

cfWodSelect.addEventListener("change", () => applyWodSelection(cfWodSelect.value));

// --------------------------------------------------------------------------
// MOUVEMENTS DYNAMIQUES
// Deux types de lignes peuvent être ajoutées à un WOD :
//  - un "mouvement libre" (texte simple, ex: "Thrusters 42,5 kg") : reste
//    dans l'historique, mais n'alimente aucun calcul ;
//  - un "exercice structuré" (choisi dans la même base que Musculation,
//    avec répétitions + charge) : alimente le volume, les records et le
//    1RM estimé de l'exercice, exactement comme dans l'onglet Musculation.
// --------------------------------------------------------------------------

function createExerciseRow() {
  const row = document.createElement("div");
  row.className = "set-row set-row-single";
  row.innerHTML = `
    <input type="text" class="cf-exercise-input" placeholder="ex : Thrusters 42,5 kg">
    <button type="button" class="set-remove" title="Supprimer ce mouvement">✕</button>
  `;
  row.querySelector(".set-remove").addEventListener("click", () => row.remove());
  return row;
}

/**
 * Crée une ligne d'exercice structuré, avec sélection de l'exercice
 * (réutilise exactement la même liste que Musculation), répétitions et
 * charge. Si le WOD est un AMRAP, un champ "reps par tour" + un champ
 * "reps supplémentaires" apparaissent au lieu d'un simple total.
 */
function createStructuredExerciseRow(prefill) {
  const row = document.createElement("div");
  row.className = "cf-structured-row";
  row.innerHTML = `
    <div class="cf-structured-row-header">
      <select class="cf-structured-select"></select>
      <input type="text" class="cf-structured-custom form-input-spaced" placeholder="Nom de l'exercice" style="display:none;">
      <button type="button" class="set-remove" title="Supprimer cet exercice">✕</button>
    </div>
    <div class="cf-structured-fields">
      <input type="number" class="cf-structured-reps" min="0" inputmode="numeric" placeholder="Reps" aria-label="Répétitions">
      <input type="number" class="cf-structured-weight" min="0" step="0.5" placeholder="kg" aria-label="Charge (kg)">
      <select class="cf-structured-unit" aria-label="Unité" style="display:none;"></select>
      <input type="number" class="cf-structured-extra" min="0" inputmode="numeric" placeholder="+ reps" aria-label="Répétitions en plus (tour incomplet)" style="display:none;">
    </div>
  `;

  const select = row.querySelector(".cf-structured-select");
  const customInput = row.querySelector(".cf-structured-custom");
  const repsInput = row.querySelector(".cf-structured-reps");
  const weightInput = row.querySelector(".cf-structured-weight");
  const extraInput = row.querySelector(".cf-structured-extra");

  const unitSelect = row.querySelector(".cf-structured-unit");

  // On réutilise directement la fonction de musculation.js : même base
  // d'exercices, même option "+ Autre exercice…", plus le groupe
  // "Cardio et distance" (calories ou mètres) propre aux WOD.
  populateExerciseSelectElement(select, { includeMeasured: true });

  function getRowExerciseName() {
    return select.value === "__custom__" ? customInput.value.trim() : select.value;
  }

  /** Charge (kg) pour un exercice classique ; unité (cal / m) pour le cardio et la distance. */
  function updateWeightPlaceholder() {
    const name = getRowExerciseName();
    const units = isMeasuredExercise(name) ? MEASURED_EXERCISES[name] : null;
    if (units) {
      const previous = unitSelect.value;
      unitSelect.innerHTML = units.map((u) => `<option value="${u}">${u === "cal" ? "Calories" : "Mètres"}</option>`).join("");
      if (units.includes(previous)) unitSelect.value = previous;
      unitSelect.style.display = "";
      weightInput.style.display = "none";
      weightInput.value = "";
    } else {
      unitSelect.innerHTML = "";
      unitSelect.style.display = "none";
      weightInput.style.display = "";
      const isBW = typeof isBodyweightExercise === "function" && isBodyweightExercise(name);
      weightInput.placeholder = isBW ? "Lest kg" : "kg";
    }
    updateStructuredRowForWodType(row);
  }
  unitSelect.addEventListener("change", () => updateStructuredRowForWodType(row));

  select.addEventListener("change", () => {
    const isCustom = select.value === "__custom__";
    customInput.style.display = isCustom ? "block" : "none";
    if (isCustom) customInput.focus();
    updateWeightPlaceholder();
  });
  customInput.addEventListener("input", updateWeightPlaceholder);

  row.querySelector(".set-remove").addEventListener("click", () => row.remove());

  if (prefill) {
    const exists = getAllKnownExercises().includes(prefill.exercise) || isMeasuredExercise(prefill.exercise);
    if (exists) {
      select.value = prefill.exercise;
    } else {
      select.value = "__custom__";
      customInput.style.display = "block";
      customInput.value = prefill.exercise;
    }
    repsInput.value = prefill.reps ?? "";
    weightInput.value = prefill.weight || "";
    extraInput.value = prefill.extraReps ?? "";
  }

  updateWeightPlaceholder();
  if (prefill && getEntryUnit(prefill) !== "reps") {
    unitSelect.value = getEntryUnit(prefill);
    updateStructuredRowForWodType(row);
  }

  return row;
}

/** Adapte les libellés (reps, calories ou mètres) et le champ "en plus" selon le type de WOD. */
function updateStructuredRowForWodType(row) {
  const isAmrap = cfTypeSelect.value === "AMRAP";
  const repsInput = row.querySelector(".cf-structured-reps");
  const extraInput = row.querySelector(".cf-structured-extra");
  const unitSelect = row.querySelector(".cf-structured-unit");
  const unit = unitSelect && unitSelect.style.display !== "none" && unitSelect.value ? unitSelect.value : "reps";
  const word = { reps: "Reps", cal: "Cal", m: "Mètres" }[unit];
  repsInput.placeholder = isAmrap ? `${word}/tour` : unit === "reps" ? "Reps totales" : `${word} au total`;
  extraInput.placeholder = `+ ${UNIT_LABELS[unit]}`;
  extraInput.style.display = isAmrap ? "block" : "none";
}

/** Réapplique l'adaptation AMRAP à toutes les lignes structurées déjà présentes. */
function updateAllStructuredRowsForWodType() {
  cfExercisesList.querySelectorAll(".cf-structured-row").forEach(updateStructuredRowForWodType);
  updateScoreHint();
}

/** Petit rappel sous le type de WOD quand le score est facultatif (EMOM, Tabata, Autre). */
function updateScoreHint() {
  const hint = document.getElementById("cf-score-hint");
  if (hint) hint.style.display = isScoreRequired(cfTypeSelect.value) ? "none" : "block";
  updateScoreFields();
}

cfTypeSelect.addEventListener("change", updateAllStructuredRowsForWodType);

function resetExerciseRows() {
  cfExercisesList.innerHTML = "";
  for (let i = 0; i < 2; i++) {
    cfExercisesList.appendChild(createExerciseRow());
  }
}

cfAddExerciseBtn.addEventListener("click", () => {
  cfExercisesList.appendChild(createExerciseRow());
});

cfAddStructuredExerciseBtn.addEventListener("click", () => {
  cfExercisesList.appendChild(createStructuredExerciseRow(null));
});

// --------------------------------------------------------------------------
// CONVERSION DU TEMPS "mm:ss" <-> secondes
// --------------------------------------------------------------------------

/** "6:42" → 402 ; "1:02:30" → 3750 (au-delà d'une heure, ex. Murph). Null si illisible. */
function parseTimeToSeconds(text) {
  if (!text || !text.trim()) return null;
  const value = text.trim().replace(/[.,]/g, ":");
  if (!/^\d+(:[0-5]\d){1,2}$/.test(value)) return null;
  const parts = value.split(":").map(Number);
  const total = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  return total > 0 ? total : null;
}

/** 402 → "6:42" ; 3750 → "1:02:30" */
function formatSecondsToTime(totalSeconds) {
  const total = Math.round(totalSeconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

// --------------------------------------------------------------------------
// SOUMISSION DU FORMULAIRE
// --------------------------------------------------------------------------

cfForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const wodName = cfWodSelect.value;

  if (!wodName) {
    showCfFeedback("Merci d'indiquer un nom de WOD.", true);
    return;
  }

  const timeSeconds = parseTimeToSeconds(cfTimeInput.value);
  const rounds = cfRoundsInput.value ? Number(cfRoundsInput.value) : null;
  const extraReps = cfExtraRepsInput.value ? Number(cfExtraRepsInput.value) : null;

  const isSpe = isSpeSession(wodName);

  if (cfTimeInput.value.trim() && timeSeconds === null) {
    showCfFeedback("Temps illisible : écris-le en minutes:secondes, par exemple 6:42 (ou 1:02:30 au-delà d'une heure).", true);
    return;
  }
  if (!isSpe && isScoreRequired(cfTypeSelect.value) && timeSeconds === null && rounds === null) {
    const message = cfTypeSelect.value === "AMRAP"
      ? "Indique ton nombre de rounds complets (et les reps en plus s'il y en a)."
      : "Indique ton temps (mm:ss), par exemple 6:42.";
    showCfFeedback(message, true);
    return;
  }

  // Ligne structurée à moitié remplie (charge ou "en plus" sans quantité) :
  // on le signale au lieu de l'ignorer en silence.
  for (const rowEl of cfExercisesList.querySelectorAll(".cf-structured-row")) {
    const visibleValue = (selector) => {
      const input = rowEl.querySelector(selector);
      return input && input.style.display !== "none" ? input.value.trim() : "";
    };
    const repsText = rowEl.querySelector(".cf-structured-reps").value.trim();
    if (!repsText && (visibleValue(".cf-structured-weight") || visibleValue(".cf-structured-extra"))) {
      const select = rowEl.querySelector(".cf-structured-select");
      const name = select.value === "__custom__" ? rowEl.querySelector(".cf-structured-custom").value.trim() : select.value;
      showCfFeedback(`${name || "Exercice structuré"} : il manque la quantité (reps, calories ou mètres).`, true);
      return;
    }
  }

  // On parcourt les lignes dans l'ordre où elles apparaissent dans le
  // formulaire, en gardant soit un texte libre, soit un objet structuré.
  // Une ligne incomplète (pas d'exercice choisi, ou aucune répétition
  // renseignée pour une ligne structurée) est simplement ignorée — elle
  // ne bloque jamais l'enregistrement du WOD.
  const exercises = [...cfExercisesList.children]
    .map((rowEl) => {
      if (rowEl.classList.contains("cf-structured-row")) {
        const select = rowEl.querySelector(".cf-structured-select");
        const customInput = rowEl.querySelector(".cf-structured-custom");
        const isCustom = select.value === "__custom__";
        const exerciseName = isCustom ? customInput.value.trim() : select.value;
        const reps = Number(rowEl.querySelector(".cf-structured-reps").value) || 0;
        const weight = Number(rowEl.querySelector(".cf-structured-weight").value) || 0;
        const extraReps = Number(rowEl.querySelector(".cf-structured-extra").value) || 0;
        if (!exerciseName || reps <= 0) return null;
        if (isMeasuredExercise(exerciseName)) {
          // Cardio / distance : une quantité et son unité, jamais de charge
          const unitSelect = rowEl.querySelector(".cf-structured-unit");
          const unit = unitSelect && unitSelect.value ? unitSelect.value : MEASURED_EXERCISES[exerciseName][0];
          return { exercise: exerciseName, reps, weight: 0, extraReps, unit };
        }
        return { exercise: exerciseName, reps, weight, extraReps };
      }
      const input = rowEl.querySelector(".cf-exercise-input");
      const text = input ? input.value.trim() : "";
      return text || null;
    })
    .filter((entry) => entry !== null);

  const sessionData = {
    type: "crossfit",
    date: cfDateInput.value || todayLocalDateString(),
    wodName: wodName,
    wodType: isSpe ? null : cfTypeSelect.value,
    rxOrScaled: isSpe ? null : cfRxSelect.value,
    timeSeconds: isSpe ? null : timeSeconds,
    rounds: isSpe ? null : rounds,
    extraReps: isSpe ? null : extraReps,
    exercises: exercises,
    notes: cfNotesInput.value.trim(),
  };

  if (cfEditingId) {
    updateSession(cfEditingId, sessionData);
    showCfFeedback("WOD mis à jour !", false);
  } else {
    const recordsBefore = typeof computeCfRecords === "function" ? computeCfRecords() : {};
    const muscuRecordsBefore = typeof computeMuscuRecords === "function" ? computeMuscuRecords() : {};
    addSession(sessionData);

    // Comparé uniquement aux WOD du même nom ET du même niveau (RX, Inter, Scaled)
    const newRecord = typeof detectCfNewRecords === "function"
      ? detectCfNewRecords(recordsBefore, wodName, sessionData.rxOrScaled || "RX", sessionData.date)
      : null;

    // Les exercices structurés du WOD sont comparés à la charge maximale
    // déjà connue pour cet exercice — pas au 1RM estimé, puisqu'on ne
    // peut jamais garantir qu'ils ont été faits en une seule série
    // continue (voir la note dans stats.js).
    const structuredEntries = exercises.filter((entry) => typeof entry === "object" && entry !== null);
    const newLiftRecords = (typeof detectStructuredWeightRecords === "function" && structuredEntries.length > 0)
      ? detectStructuredWeightRecords(muscuRecordsBefore, structuredEntries)
      : [];

    if (newRecord || newLiftRecords.length > 0) {
      showCfRecordBadge(wodName, newRecord, newLiftRecords);
    } else {
      showCfFeedback("WOD enregistré !", false);
    }
  }

  cancelCfEdit();
  populateWodSelects();
  renderCfHistory();
  if (typeof notifyRankProgress === "function") notifyRankProgress(); // rangs et succès
  if (typeof renderDashboard === "function") renderDashboard();
  if (typeof renderRecords === "function") renderRecords();
});

/**
 * Pré-remplit le formulaire avec les valeurs d'un WOD existant, mais SANS
 * passer en mode édition : la validation créera un tout nouveau WOD,
 * daté d'aujourd'hui.
 */
function duplicateCfSession(session) {
  cfEditingId = null;

  cfDateInput.value = todayLocalDateString();

  populateWodSelects();
  cfWodSelect.value = session.wodName;
  setScoreFieldsVisibility(session.wodName);

  cfTypeSelect.value = session.wodType || "For Time";
  updateScoreHint();
  cfRxSelect.value = session.rxOrScaled || "RX";
  cfTimeInput.value = "";
  cfRoundsInput.value = "";
  cfExtraRepsInput.value = "";

  cfExercisesList.innerHTML = "";
  (session.exercises && session.exercises.length ? session.exercises : []).forEach((ex) => {
    if (typeof ex === "object" && ex !== null) {
      cfExercisesList.appendChild(createStructuredExerciseRow(ex));
    } else {
      const row = createExerciseRow();
      row.querySelector(".cf-exercise-input").value = ex;
      cfExercisesList.appendChild(row);
    }
  });
  if (cfExercisesList.children.length === 0) {
    cfExercisesList.appendChild(createExerciseRow());
    cfExercisesList.appendChild(createExerciseRow());
  }

  cfNotesInput.value = "";
  updateScoreFields();

  cfSubmitBtn.textContent = "Enregistrer le WOD";
  cfCancelEditBtn.style.display = "none";
}

/**
 * Remplit le formulaire avec les valeurs d'un WOD existant et bascule
 * en mode édition. Appelée depuis la page Historique.
 */
function startEditCfSession(session) {
  cfEditingId = session.id;

  cfDateInput.value = session.date;

  populateWodSelects();
  cfWodSelect.value = session.wodName;
  setScoreFieldsVisibility(session.wodName);

  cfTypeSelect.value = session.wodType || "For Time";
  updateScoreHint();
  cfRxSelect.value = session.rxOrScaled || "RX";
  cfTimeInput.value = session.timeSeconds !== null && session.timeSeconds !== undefined
    ? formatSecondsToTime(session.timeSeconds) : "";
  cfRoundsInput.value = session.rounds ?? "";
  cfExtraRepsInput.value = session.extraReps ?? "";

  cfExercisesList.innerHTML = "";
  (session.exercises && session.exercises.length ? session.exercises : []).forEach((ex) => {
    if (typeof ex === "object" && ex !== null) {
      cfExercisesList.appendChild(createStructuredExerciseRow(ex));
    } else {
      const row = createExerciseRow();
      row.querySelector(".cf-exercise-input").value = ex;
      cfExercisesList.appendChild(row);
    }
  });
  if (cfExercisesList.children.length === 0) {
    cfExercisesList.appendChild(createExerciseRow());
    cfExercisesList.appendChild(createExerciseRow());
  }

  cfNotesInput.value = session.notes || "";
  // Après le remplissage : un score déjà noté reste toujours visible
  updateScoreFields();

  cfSubmitBtn.textContent = "Mettre à jour le WOD";
  cfCancelEditBtn.style.display = "inline-block";
}

/** Sort du mode édition et remet le formulaire à son état "ajout". */
function cancelCfEdit() {
  cfEditingId = null;
  cfForm.reset();
  resetExerciseRows();
  cfTypeRow.style.display = "";
  cfLevelRow.style.display = "";
  cfDateInput.value = todayLocalDateString();
  setScoreFieldsVisibility(cfWodSelect.value);
  updateScoreHint();
  cfSubmitBtn.textContent = "Enregistrer le WOD";
  cfCancelEditBtn.style.display = "none";
}

cfCancelEditBtn.addEventListener("click", cancelCfEdit);

function showCfFeedback(message, isError) {
  cfFeedback.textContent = message;
  cfFeedback.className = "form-feedback " + (isError ? "form-feedback-error" : "form-feedback-success");
  setTimeout(() => { cfFeedback.textContent = ""; }, 3000);
}

/** Affiche un badge mis en avant quand le WOD (ou un exercice structuré qu'il contient) bat un record. */
function showCfRecordBadge(wodName, wodRecord, liftRecords) {
  const parts = [];
  if (wodRecord) {
    const label = wodRecord.type === "time" ? "meilleur temps" : "meilleure performance";
    parts.push(`${escapeHtml(wodName)} ${wodRecord.level} — ${label} : ${wodRecord.value}`);
  }
  (liftRecords || []).forEach((r) => parts.push(`${escapeHtml(r.exercise)} : ${formatNumberFr(r.value)} kg`));

  cfFeedback.innerHTML = `
    <span class="record-badge">
      <svg viewBox="0 0 24 24" class="record-badge-icon"><path d="M6 2h12v6a6 6 0 0 1-5 5.92V17h3v2H8v-2h3v-3.08A6 6 0 0 1 6 8V2Zm2 2v4a4 4 0 0 0 8 0V4H8ZM3 4h2v3a3 3 0 0 1-2 2.83V4Zm16 0h2v5.83A3 3 0 0 1 19 7V4Z"/></svg>
      Nouveau record ! ${parts.join(" · ")}
    </span>`;
  cfFeedback.className = "form-feedback";
  setTimeout(() => { cfFeedback.innerHTML = ""; }, 5000);
}

// --------------------------------------------------------------------------
// HISTORIQUE (liste des WOD, filtrable par nom)
// --------------------------------------------------------------------------

// Nombre de WOD affichés (augmente avec "Voir plus", revient à 20 au changement de filtre)
let cfHistoryLimit = HISTORY_PAGE_SIZE;
const resetCfHistoryLimit = () => { cfHistoryLimit = HISTORY_PAGE_SIZE; };

cfFilterSelect.addEventListener("change", () => { resetCfHistoryLimit(); renderCfHistory(); });
cfFilterLevelSelect.addEventListener("change", () => { resetCfHistoryLimit(); renderCfHistory(); });

const cfHistorySearch = document.getElementById("cf-history-search");
const cfLastSeen = document.getElementById("cf-last-seen");
cfHistorySearch.addEventListener("input", () => { resetCfHistoryLimit(); renderCfHistory(); });

/** Nom affichable d'un mouvement, qu'il soit structuré ou en texte libre. */
function getMovementLabel(entry) {
  return typeof entry === "object" && entry !== null ? entry.exercise : String(entry);
}

/** Une séance correspond à la recherche si son nom de WOD ou l'un de ses mouvements contient le texte cherché. */
function cfSessionMatchesSearch(session, query) {
  if (!query) return true;
  if (normalizeSearchText(session.wodName).includes(query)) return true;
  return (session.exercises || []).some((entry) => exerciseMatchesSearch(getMovementLabel(entry), query));
}

/** Encart "Dernière fois" pendant une recherche : le WOD le plus récent qui correspond, avec charges. */
function renderCfLastSeen(sessions, query) {
  const latest = sessions[0];
  if (!query || !latest) {
    cfLastSeen.style.display = "none";
    return;
  }
  const matching = (latest.exercises || []).filter((entry) => exerciseMatchesSearch(getMovementLabel(entry), query));
  const lines = matching
    .map((entry) => {
      if (typeof entry === "object" && entry !== null) {
        const weightText = entry.weight > 0 ? ` à ${formatNumberFr(entry.weight)} kg` : "";
        return `<span><strong>${escapeHtml(entry.exercise)}</strong> — ${formatAmount(entry.reps, getEntryUnit(entry))}${weightText}</span>`;
      }
      return `<span>${escapeHtml(entry)}</span>`;
    })
    .join("");
  cfLastSeen.innerHTML = `
    <span class="history-last-seen-title">Dernière fois : ${escapeHtml(latest.wodName)} — ${parseLocalDate(latest.date).toLocaleDateString("fr-FR")}</span>
    ${lines}`;
  cfLastSeen.style.display = "flex";
}

/** Construit le texte de résultat à afficher : "6:42" ou "18 rounds + 5 reps" */
function formatWodResult(session) {
  if (session.timeSeconds !== null && session.timeSeconds !== undefined) {
    return formatSecondsToTime(session.timeSeconds);
  }
  if (session.rounds !== null && session.rounds !== undefined) {
    const extra = session.extraReps ? ` + ${session.extraReps} reps` : "";
    return `${session.rounds} rounds${extra}`;
  }
  return "—";
}

function renderCfHistory() {
  const filter = cfFilterSelect.value || "all";
  const levelFilter = cfFilterLevelSelect.value || "all";
  const query = normalizeSearchText(cfHistorySearch.value);

  const sessions = getAllSessions()
    .filter((s) => s.type === "crossfit")
    .filter((s) => filter === "all" || s.wodName === filter)
    .filter((s) => levelFilter === "all" || s.rxOrScaled === levelFilter)
    .filter((s) => cfSessionMatchesSearch(s, query))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  renderCfLastSeen(sessions, query);
  cfHistoryList.innerHTML = "";

  if (sessions.length === 0) {
    cfHistoryList.innerHTML = `<p class="empty-text">Aucun WOD enregistré pour ce filtre.</p>`;
    return;
  }

  sessions.slice(0, cfHistoryLimit).forEach((session) => {
    const card = document.createElement("div");
    card.className = "history-card";

    const exercisesHtml = (session.exercises || [])
      .map((entry) => {
        if (typeof entry === "object" && entry !== null) {
          const isAmrap = session.wodType === "AMRAP" && typeof session.rounds === "number";
          const unit = getEntryUnit(entry);
          const totalReps = isAmrap ? entry.reps * session.rounds + (entry.extraReps || 0) : entry.reps;
          const repsDetail = isAmrap
            ? `${formatAmount(entry.reps, unit)} × ${session.rounds} tours${entry.extraReps ? ` + ${formatNumberFr(entry.extraReps)}` : ""} = ${formatAmount(totalReps, unit)}`
            : formatAmount(totalReps, unit);
          const weightText = entry.weight > 0 ? ` à ${formatNumberFr(entry.weight)} kg` : "";
          const volume = typeof computeCrossfitStructuredVolume === "function"
            ? computeCrossfitStructuredVolume(session, entry)
            : 0;
          const volumeText = volume > 0 ? ` · Volume : ${Math.round(volume).toLocaleString("fr-FR")} kg` : "";
          return `<p class="history-card-notes"><strong>${escapeHtml(entry.exercise)}</strong> — ${escapeHtml(repsDetail)}${weightText}${volumeText}</p>`;
        }
        return null;
      })
      .filter(Boolean)
      .join("");

    const freeTextMovements = (session.exercises || []).filter((entry) => typeof entry === "string");
    const freeTextHtml = freeTextMovements
      .map((movement) => `<p class="history-card-notes">${escapeHtml(movement)}</p>`)
      .join("");

    card.innerHTML = `
      <div class="history-card-header">
        <span class="history-card-title-group">
          <span class="history-card-title">${escapeHtml(session.wodName)}</span>
          ${session.rxOrScaled ? `<span class="badge-rpe ${getLevelBadgeClass(session.rxOrScaled)}">${escapeHtml(session.rxOrScaled)}</span>` : ""}
        </span>
        <span class="history-card-date">${new Date(session.date).toLocaleDateString("fr-FR")}</span>
      </div>
      ${isSpeSession(session.wodName)
        ? `<p class="history-card-sets">Séance spécifique</p>`
        : `<p class="history-card-sets">${escapeHtml(session.wodType || "")}${formatWodResult(session) !== "—" ? ` — <strong>${escapeHtml(formatWodResult(session))}</strong>` : " — sans score"}</p>`}
      ${exercisesHtml}
      ${freeTextHtml}
      ${session.notes ? `<p class="history-card-notes">${escapeHtml(session.notes)}</p>` : ""}
      <div class="history-card-actions">
        <button type="button" class="btn btn-secondary btn-small hist-repeat-btn">Refaire ce WOD</button>
        <button type="button" class="btn btn-secondary btn-small hist-edit-btn">Modifier</button>
        <button type="button" class="btn btn-secondary btn-small hist-delete-btn">Supprimer</button>
      </div>
    `;
    card.querySelector(".hist-repeat-btn").addEventListener("click", () => {
      duplicateCfSession(session);
      document.querySelector("#section-crossfit .form-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    card.querySelector(".hist-edit-btn").addEventListener("click", () => {
      startEditCfSession(session);
      document.querySelector("#section-crossfit .form-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    card.querySelector(".hist-delete-btn").addEventListener("click", () => {
      const confirmed = confirm("Supprimer définitivement ce WOD ? Cette action est irréversible.");
      if (!confirmed) return;
      deleteSession(session.id);
      renderCfHistory();
      if (typeof notifyRankProgress === "function") notifyRankProgress(); // rangs et succès
      if (typeof renderDashboard === "function") renderDashboard();
      if (typeof renderRecords === "function") renderRecords();
    });
    cfHistoryList.appendChild(card);
  });

  appendShowMoreButton(cfHistoryList, sessions.length - cfHistoryLimit, () => {
    cfHistoryLimit += HISTORY_PAGE_SIZE;
    renderCfHistory();
  });
}

// --------------------------------------------------------------------------
// INITIALISATION DE LA PAGE
// --------------------------------------------------------------------------

cfDateInput.value = todayLocalDateString();
populateWodSelects();
resetExerciseRows();
// Au départ ("For Time") : seul le champ Temps est affiché
setScoreFieldsVisibility(cfWodSelect.value);
updateScoreHint();
renderCfHistory();

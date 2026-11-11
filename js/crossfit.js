// ==========================================================================
// crossfit.js — tout ce qui concerne la page CrossFit :
//   - choisir le WOD (pastilles), son format, son niveau et noter le score
//   - les mouvements du WOD (exercices structurés ou texte libre)
//   - les cours de spé : exercices avec séries à cocher, comme en musculation
//     (briques communes dans seance.js)
//   - enregistrer (via addSession, fourni par data.js) et l'historique
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
// ÉLÉMENTS DE LA PAGE
// --------------------------------------------------------------------------

const cfFormTitle = document.getElementById("cf-form-title");
const cfWodChips = document.getElementById("cf-wod-chips");
const cfCustomNameInput = document.getElementById("cf-custom-name");
const cfWodFields = document.getElementById("cf-wod-fields");
const cfTypeSeg = document.getElementById("cf-type-seg");
const cfLevelSeg = document.getElementById("cf-level-seg");
const cfScoreHint = document.getElementById("cf-score-hint");
const cfTimeBlock = document.getElementById("cf-time-block");
const cfTimeMinInput = document.getElementById("cf-time-min");
const cfTimeSecInput = document.getElementById("cf-time-sec");
const cfRoundsBlock = document.getElementById("cf-rounds-block");
const cfRoundsInput = document.getElementById("cf-rounds");
const cfExtraRepsInput = document.getElementById("cf-extra-reps");
const cfScoreCompare = document.getElementById("cf-score-compare");
const cfItemsLabel = document.getElementById("cf-items-label");
const cfItemsHint = document.getElementById("cf-items-hint");
const cfExercisesList = document.getElementById("cf-exercises-list");
const cfAddStructuredExerciseBtn = document.getElementById("cf-add-structured-exercise");
const cfAddExerciseBtn = document.getElementById("cf-add-exercise");
const cfDateInput = document.getElementById("cf-date");
const cfNotesInput = document.getElementById("cf-notes");
const cfSubmitBtn = document.getElementById("cf-submit-btn");
const cfCancelEditBtn = document.getElementById("cf-cancel-edit");
const cfClearBtn = document.getElementById("cf-clear-btn");
const cfFeedback = document.getElementById("cf-feedback");
const cfFilterSelect = document.getElementById("cf-filter-wod");
const cfFilterLevelSelect = document.getElementById("cf-filter-level");
const cfHistoryList = document.getElementById("cf-history-list");

/**
 * Renvoie la liste des noms de WOD déjà utilisés dans l'historique,
 * fusionnée avec la liste des benchmarks par défaut (sans doublons).
 * "WOD du jour" et les cours de spé sont gérés à part (toujours en premier).
 */
function getAllKnownWods() {
  const used = getAllSessions()
    .filter((s) => s.type === "crossfit")
    .map((s) => s.wodName)
    .filter((name) => Boolean(name) && name !== DAILY_WOD_LABEL && !isSpeSession(name));
  return Array.from(new Set([...DEFAULT_WODS, ...used])).sort();
}

/** Remplit le filtre de l'historique et les pastilles de WOD du formulaire. */
function populateWodSelects() {
  const previous = cfFilterSelect.value;
  cfFilterSelect.innerHTML = "";
  const addOption = (value, label) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    cfFilterSelect.appendChild(opt);
  };
  addOption("all", "Tous les WOD");
  addOption(DAILY_WOD_LABEL, DAILY_WOD_LABEL);
  SPE_SESSIONS.forEach((name) => addOption(name, name));
  getAllKnownWods().forEach((name) => addOption(name, name));
  if (previous && [...cfFilterSelect.options].some((o) => o.value === previous)) cfFilterSelect.value = previous;
  if (cfState) renderCfWodChips();
}

// Formats chronométrés : le score est un temps. AMRAP : des rounds (+ reps).
// Les autres (EMOM, Tabata, Autre) ont un score facultatif : les deux champs restent proposés.
const TIME_SCORED_WOD_TYPES = ["For Time", "Chipper"];
const CF_WOD_TYPES = ["For Time", "AMRAP", "EMOM", "Chipper", "Tabata", "Autre"];
const CF_LEVELS = ["RX", "Inter", "Scaled"];
const CF_CUSTOM_WOD = "__custom__";

// --------------------------------------------------------------------------
// ÉTAT DU FORMULAIRE (gardé en brouillon : "carnet_cf_draft")
// wodItems : mouvements d'un WOD ; speItems : exercices d'un cours de spé
// (séries à cocher). Les deux listes sont gardées séparément : passer d'un
// WOD à un cours de spé ne fait rien perdre.
// --------------------------------------------------------------------------

const STORAGE_KEY_CF_DRAFT = "carnet_cf_draft";
let cfState = null;

function defaultCfState() {
  return {
    editingId: null,
    wod: DAILY_WOD_LABEL,
    customName: "",
    wodType: "For Time",
    level: "RX",
    timeMin: "",
    timeSec: "",
    rounds: "",
    extraReps: "",
    date: todayLocalDateString(),
    dateTouched: false,
    notes: "",
    wodItems: [],
    speItems: [],
  };
}

/** Le formulaire est-il vide (rien à garder) ? */
function isCfStatePristine(state) {
  const strip = (s) => JSON.stringify({ ...s, date: null, dateTouched: null });
  return !state.editingId && !state.dateTouched && strip(state) === strip(defaultCfState());
}

function sanitizeCfItem(item, forSpe) {
  if (!isPlainObject(item)) return null;
  if (item.kind === "text") return { kind: "text", text: String(item.text ?? "") };
  if (typeof item.exercise !== "string" || !item.exercise.trim()) return null;
  const unit = item.unit === "cal" || item.unit === "m" ? item.unit : undefined;
  if (forSpe) {
    return {
      kind: "sets",
      exercise: item.exercise,
      unit,
      sets: (Array.isArray(item.sets) ? item.sets : []).filter(isPlainObject).map((set) => ({
        reps: String(set.reps ?? ""), weight: String(set.weight ?? ""), done: Boolean(set.done), warmup: Boolean(set.warmup),
      })),
    };
  }
  return { kind: "mv", exercise: item.exercise, unit, reps: String(item.reps ?? ""), weight: String(item.weight ?? ""), extraReps: String(item.extraReps ?? "") };
}

function loadCfDraft() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(STORAGE_KEY_CF_DRAFT)); } catch { raw = null; }
  if (!isPlainObject(raw)) return null;
  const state = defaultCfState();
  ["customName", "timeMin", "timeSec", "rounds", "extraReps", "notes"].forEach((key) => {
    if (typeof raw[key] === "string") state[key] = raw[key];
  });
  if (typeof raw.wod === "string" && raw.wod) state.wod = raw.wod;
  if (CF_WOD_TYPES.includes(raw.wodType)) state.wodType = raw.wodType;
  if (CF_LEVELS.includes(raw.level)) state.level = raw.level;
  state.editingId = typeof raw.editingId === "string" && raw.editingId ? raw.editingId : null;
  if (state.editingId && !getAllSessions().some((s) => s.id === state.editingId)) return null;
  state.dateTouched = Boolean(raw.dateTouched) || Boolean(state.editingId);
  // Date jamais changée à la main : le brouillon d'hier passe à aujourd'hui
  if (state.dateTouched && isValidDateString(raw.date)) state.date = raw.date;
  state.wodItems = (Array.isArray(raw.wodItems) ? raw.wodItems : []).map((i) => sanitizeCfItem(i, false)).filter(Boolean);
  state.speItems = (Array.isArray(raw.speItems) ? raw.speItems : []).map((i) => sanitizeCfItem(i, true)).filter(Boolean);
  return state;
}

function saveCfDraft() {
  try {
    if (!cfState || isCfStatePristine(cfState)) localStorage.removeItem(STORAGE_KEY_CF_DRAFT);
    else localStorage.setItem(STORAGE_KEY_CF_DRAFT, JSON.stringify(cfState));
  } catch (error) {
    console.warn("Brouillon de WOD non enregistré :", error);
  }
}

/** Nom du WOD choisi (pastille, ou nom tapé pour "Autre"). */
function getCfWodName() {
  return cfState.wod === CF_CUSTOM_WOD ? cfState.customName.trim() : cfState.wod;
}

function isCfSpeMode() {
  return isSpeSession(getCfWodName());
}

function getCfItems() {
  return isCfSpeMode() ? cfState.speItems : cfState.wodItems;
}

// --------------------------------------------------------------------------
// AFFICHAGE DU FORMULAIRE
// --------------------------------------------------------------------------

function renderCfWodChips() {
  const names = [DAILY_WOD_LABEL, ...SPE_SESSIONS, ...getAllKnownWods()];
  // Nom d'une séance modifiée qui ne serait plus dans la liste : on l'ajoute
  if (cfState.wod !== CF_CUSTOM_WOD && !names.includes(cfState.wod)) names.push(cfState.wod);
  const small = (name) => {
    if (name === DAILY_WOD_LABEL) return "";
    if (isSpeSession(name)) return "Cours";
    if (BENCHMARK_WODS[name]) return BENCHMARK_WODS[name].wodType;
    return "Perso";
  };
  cfWodChips.innerHTML = names
    .map((name) => `<button type="button" class="rf-wodchip${cfState.wod === name ? " on" : ""}" data-wod="${escapeHtml(name)}" aria-pressed="${cfState.wod === name}">${small(name) ? `<small>${escapeHtml(small(name))}</small>` : ""}${escapeHtml(name)}</button>`)
    .join("") +
    `<button type="button" class="rf-wodchip${cfState.wod === CF_CUSTOM_WOD ? " on" : ""}" data-wod="${CF_CUSTOM_WOD}" aria-pressed="${cfState.wod === CF_CUSTOM_WOD}"><small>Nouveau</small>+ Autre</button>`;
  const selected = cfWodChips.querySelector(".rf-wodchip.on");
  if (selected && typeof selected.scrollIntoView === "function" && cfWodChips.scrollWidth > cfWodChips.clientWidth) {
    cfWodChips.scrollLeft = Math.max(0, selected.offsetLeft - cfWodChips.offsetLeft - 16);
  }
}

function renderCfSegments() {
  cfTypeSeg.querySelectorAll("button").forEach((b) => {
    const on = b.dataset.value === cfState.wodType;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
  });
  cfLevelSeg.querySelectorAll("button").forEach((b) => {
    const on = b.dataset.value === cfState.level;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
  });
}

/**
 * N'affiche que les champs de score utiles au format choisi. Un champ déjà
 * rempli reste toujours visible (rien ne disparaît en silence si tu changes
 * de format après avoir noté ton score).
 */
function updateScoreFields() {
  const type = cfState.wodType;
  const optional = !isScoreRequired(type);
  const hasTime = cfState.timeMin.trim() !== "" || cfState.timeSec.trim() !== "";
  const hasRounds = cfState.rounds.trim() !== "" || cfState.extraReps.trim() !== "";
  cfTimeBlock.hidden = !(optional || TIME_SCORED_WOD_TYPES.includes(type) || hasTime);
  cfRoundsBlock.hidden = !(optional || type === "AMRAP" || hasRounds);
  document.getElementById("cf-time-optional").textContent = optional ? " (facultatif)" : "";
  document.getElementById("cf-rounds-optional").textContent = optional ? " (facultatif)" : "";
  cfScoreHint.hidden = !optional;
  updateCfScoreCompare();
}

/** Temps tapé en minutes + secondes → { seconds } (null si vide) ou { error }. */
function readCfTime(minText, secText) {
  const min = String(minText ?? "").trim();
  const sec = String(secText ?? "").trim();
  if (!min && !sec) return { seconds: null };
  if ((min && !/^\d+$/.test(min)) || (sec && (!/^\d{1,2}$/.test(sec) || Number(sec) > 59))) {
    return { error: "Temps illisible : indique les minutes et les secondes (de 0 à 59), par exemple 6 min 42 s." };
  }
  const total = (Number(min) || 0) * 60 + (Number(sec) || 0);
  return total > 0 ? { seconds: total } : { error: "Temps illisible : il doit être supérieur à 0." };
}

/** Sous le score : le record à battre, et l'écart dès que le score est tapé. */
function updateCfScoreCompare() {
  const name = getCfWodName();
  cfScoreCompare.innerHTML = "";
  if (typeof computeCfRecords !== "function" || cfState.editingId || !isRecordableWod(name)) return;
  const level = cfState.level;
  const fromSessions = (computeCfRecords()[name] || {})[level] || { bestTime: null, bestPerformance: null };
  let bestTime = fromSessions.bestTime ? fromSessions.bestTime.value : null;
  let bestPerf = fromSessions.bestPerformance;
  const manual = typeof getManualCfBests === "function" ? getManualCfBests()[name] : null;
  if (manual && getCfLevel(manual) === level) {
    if (manual.timeSeconds > 0 && (bestTime === null || manual.timeSeconds < bestTime)) bestTime = manual.timeSeconds;
    if (typeof manual.rounds === "number") {
      const perf = { rounds: manual.rounds, extraReps: manual.extraReps || 0 };
      if (isBetterPerformance(perf, bestPerf)) bestPerf = perf;
    }
  }
  const label = `${escapeHtml(name)} ${escapeHtml(level)}`;
  const time = readCfTime(cfState.timeMin, cfState.timeSec).seconds || null;
  const rounds = /^\d+$/.test(cfState.rounds.trim()) ? Number(cfState.rounds) : null;
  const extra = /^\d+$/.test(cfState.extraReps.trim()) ? Number(cfState.extraReps) : 0;
  const perfText = (p) => `${p.rounds} round${p.rounds > 1 ? "s" : ""}${p.extraReps ? ` + ${p.extraReps} reps` : ""}`;

  if (!cfTimeBlock.hidden && bestTime !== null) {
    let text = `Record ${label} : ${formatSecondsToTime(bestTime)}`;
    if (time !== null) {
      const diff = time - bestTime;
      text += diff < 0 ? ` → <b>−${formatSecondsToTime(-diff)}, nouveau record !</b>` : ` (+${formatSecondsToTime(diff)})`;
    }
    cfScoreCompare.innerHTML = text;
  } else if (!cfRoundsBlock.hidden && bestPerf) {
    let text = `Record ${label} : ${perfText(bestPerf)}`;
    if (rounds !== null && isBetterPerformance({ rounds, extraReps: extra }, bestPerf)) text += ` → <b>nouveau record !</b>`;
    cfScoreCompare.innerHTML = text;
  } else if (bestTime === null && !bestPerf) {
    cfScoreCompare.textContent = `Premier ${name} en ${level} : ce sera ton record.`;
  }
}

/** Ligne de mouvement d'un WOD (exercice structuré, ou texte libre). */
function createCfMovementRow(item, items) {
  const row = document.createElement("div");
  const remove = () => {
    items.splice(items.indexOf(item), 1);
    saveCfDraft();
    renderCfItems();
  };
  if (item.kind === "text") {
    row.className = "rf-mv rf-mv-text";
    row.innerHTML = `
      <span class="rf-ex-ic">${RF_ICONS.text}</span>
      <input type="text" class="rf-text cf-exercise-input" placeholder="ex : 21-15-9 reps, for time" aria-label="Mouvement libre">
      <button type="button" class="rf-x" aria-label="Retirer ce mouvement">${RF_ICONS.close}</button>`;
    const input = row.querySelector("input");
    input.value = item.text;
    input.addEventListener("input", () => { item.text = input.value; saveCfDraft(); });
    row.querySelector(".rf-x").addEventListener("click", remove);
    return row;
  }

  const measured = isMeasuredExercise(item.exercise);
  const units = measured ? MEASURED_EXERCISES[item.exercise] : [];
  const unit = measured ? (units.includes(item.unit) ? item.unit : units[0]) : "reps";
  const isBW = !measured && isBodyweightExercise(item.exercise);
  const isAmrap = cfState.wodType === "AMRAP";
  const word = { reps: "REPS", cal: "CAL", m: "MÈTRES" }[unit];
  row.className = "rf-mv rf-mv-struct cf-structured-row";
  row.innerHTML = `
    <span class="rf-ex-ic">${exerciseIconSvg(item.exercise)}</span>
    <button type="button" class="rf-mv-main" aria-label="Changer d'exercice">
      <span class="rf-mv-name">${escapeHtml(item.exercise)}</span>
      <span class="rf-mv-sub">${isAmrap ? "Quantité par tour" : "Quantité totale"}${isBW ? " · lest facultatif" : ""}</span>
    </button>
    <button type="button" class="rf-x" aria-label="Retirer cet exercice">${RF_ICONS.close}</button>
    <div class="rf-qty">
      <label><small>${word}${isAmrap ? "/TOUR" : ""}</small><input type="text" class="rf-in cf-structured-reps" inputmode="${measured ? "decimal" : "numeric"}" autocomplete="off"></label>
      ${measured
        ? (units.length > 1 ? `<div class="rf-units">${units.map((u) => `<button type="button" class="rf-chip${u === unit ? " on" : ""}" data-unit="${u}">${u === "cal" ? "Calories" : "Mètres"}</button>`).join("")}</div>` : "")
        : `<label><small>${isBW ? "LEST KG" : "KG"}</small><input type="text" class="rf-in cf-structured-weight" inputmode="decimal" autocomplete="off"></label>`}
      ${isAmrap ? `<label><small>+ EN PLUS</small><input type="text" class="rf-in cf-structured-extra" inputmode="decimal" autocomplete="off"></label>` : ""}
    </div>`;
  const bind = (selector, key) => {
    const input = row.querySelector(selector);
    if (!input) return;
    input.value = item[key];
    input.addEventListener("input", () => { item[key] = input.value; saveCfDraft(); });
  };
  bind(".cf-structured-reps", "reps");
  bind(".cf-structured-weight", "weight");
  bind(".cf-structured-extra", "extraReps");
  row.querySelectorAll(".rf-units .rf-chip").forEach((chip) => chip.addEventListener("click", () => {
    item.unit = chip.dataset.unit;
    saveCfDraft();
    renderCfItems();
  }));
  row.querySelector(".rf-mv-main").addEventListener("click", () => openExercisePicker({
    title: "Changer d'exercice",
    includeMeasured: true,
    onPick: (name) => {
      item.exercise = name;
      if (!isMeasuredExercise(name)) item.unit = undefined;
      saveCfDraft();
      renderCfItems();
    },
  }));
  row.querySelector(".rf-x").addEventListener("click", remove);
  return row;
}

/** Carte "texte libre" d'un cours de spé. */
function createCfTextCard(item, items) {
  const card = document.createElement("div");
  card.className = "rf-card rf-text-card";
  card.appendChild(createCfMovementRow(item, items));
  return card;
}

function cfSpeCardContext() {
  const editing = Boolean(cfState.editingId);
  return {
    excludeSessionId: cfState.editingId,
    showRpe: false,
    showPR: !editing,
    recordsBefore: typeof computeMuscuRecords === "function" ? computeMuscuRecords() : {},
    persist: saveCfDraft,
    feedback: showCfFeedback,
    onSetChecked: null, // pas de minuteur de repos pendant un cours
    menu: (item) => {
      const list = cfState.speItems;
      const index = list.indexOf(item);
      const move = (delta) => {
        list.splice(index, 1);
        list.splice(index + delta, 0, item);
        saveCfDraft();
        renderCfItems();
      };
      const actions = [{
        label: "Changer d'exercice",
        onClick: () => openExercisePicker({
          title: "Changer d'exercice",
          includeMeasured: true,
          onPick: (name) => { item.exercise = name; item.unit = undefined; saveCfDraft(); renderCfItems(); },
        }),
      }];
      if (index > 0) actions.push({ label: "Monter", onClick: () => move(-1) });
      if (index < list.length - 1) actions.push({ label: "Descendre", onClick: () => move(1) });
      actions.push({
        label: "Supprimer l'exercice",
        danger: true,
        onClick: () => {
          if (item.sets.some(isSetFilled) && !confirm(`Supprimer ${item.exercise} de la séance ?`)) return;
          list.splice(list.indexOf(item), 1);
          saveCfDraft();
          renderCfItems();
        },
      });
      return actions;
    },
  };
}

function renderCfItems() {
  const spe = isCfSpeMode();
  const items = getCfItems();
  cfExercisesList.innerHTML = "";
  if (items.length === 0) {
    cfExercisesList.innerHTML = `<p class="rf-empty">${spe ? "Ajoute les exercices travaillés pendant le cours." : "Ajoute les mouvements du WOD (facultatif)."}</p>`;
    return;
  }
  if (spe) {
    const ctx = cfSpeCardContext();
    items.forEach((item) => cfExercisesList.appendChild(item.kind === "text" ? createCfTextCard(item, items) : createSetCard(item, ctx)));
    return;
  }
  const card = document.createElement("div");
  card.className = "rf-card rf-mv-card";
  items.forEach((item) => card.appendChild(createCfMovementRow(item, items)));
  cfExercisesList.appendChild(card);
}

/** Réaffiche les cartes du cours de spé et le record à battre (records à jour). */
function refreshCfSpeCards() {
  if (!cfState) return;
  if (isCfSpeMode()) renderCfItems();
  else updateCfScoreCompare();
}

/** Affiche tout le formulaire à partir de son état. */
function renderCfForm() {
  const spe = isCfSpeMode();
  const editing = Boolean(cfState.editingId);
  cfFormTitle.textContent = editing
    ? (spe ? "Modifier la séance de spé" : "Modifier le WOD")
    : (spe ? "Ajouter une séance de spé" : "Ajouter un WOD");
  renderCfWodChips();
  cfCustomNameInput.hidden = cfState.wod !== CF_CUSTOM_WOD;
  cfCustomNameInput.value = cfState.customName;
  cfWodFields.hidden = spe;
  renderCfSegments();
  cfTimeMinInput.value = cfState.timeMin;
  cfTimeSecInput.value = cfState.timeSec;
  cfRoundsInput.value = cfState.rounds;
  cfExtraRepsInput.value = cfState.extraReps;
  if (!spe) updateScoreFields();
  cfItemsLabel.textContent = spe ? "Exercices" : "Mouvements";
  cfItemsHint.textContent = spe
    ? "Coche chaque série une fois faite (✓). Les séries remplies sont enregistrées, même non cochées, et comptent dans tes records."
    : "Un exercice alimente tes statistiques (volume, charge max) ; un texte libre reste juste dans l'historique.";
  renderCfItems();
  cfDateInput.value = cfState.date;
  cfNotesInput.value = cfState.notes;
  cfSubmitBtn.textContent = editing
    ? (spe ? "Mettre à jour la séance" : "Mettre à jour le WOD")
    : (spe ? "Enregistrer la séance" : "Enregistrer le WOD");
  cfCancelEditBtn.hidden = !editing;
  cfClearBtn.hidden = editing || isCfStatePristine(cfState);
}

// --------------------------------------------------------------------------
// INTERACTIONS
// --------------------------------------------------------------------------

/**
 * Choix d'un WOD : un benchmark préremplit son format et ses mouvements ;
 * un cours de spé passe en mode "séries à cocher".
 */
function selectCfWod(name) {
  const previousPreset = BENCHMARK_WODS[getCfWodName()];
  cfState.wod = name;
  const preset = BENCHMARK_WODS[name];
  if (name !== CF_CUSTOM_WOD && !isSpeSession(name)) {
    if (preset) {
      cfState.wodType = preset.wodType;
      cfState.wodItems = preset.movements.map((text) => ({ kind: "text", text }));
      if (preset.scoreType === "time") { cfState.rounds = ""; cfState.extraReps = ""; } else { cfState.timeMin = ""; cfState.timeSec = ""; }
    } else if (previousPreset && JSON.stringify(cfState.wodItems) === JSON.stringify(previousPreset.movements.map((text) => ({ kind: "text", text })))) {
      cfState.wodItems = []; // mouvements du benchmark précédent, pas retouchés : ils ne vont plus avec ce WOD
    }
  }
  saveCfDraft();
  renderCfForm();
  if (name === CF_CUSTOM_WOD) cfCustomNameInput.focus();
}

cfWodChips.addEventListener("click", (event) => {
  const chip = event.target.closest(".rf-wodchip");
  if (chip) selectCfWod(chip.dataset.wod);
});
cfCustomNameInput.addEventListener("input", () => {
  const wasSpe = isCfSpeMode();
  cfState.customName = cfCustomNameInput.value;
  saveCfDraft();
  if (wasSpe !== isCfSpeMode()) renderCfForm();
  else { updateCfScoreCompare(); cfClearBtn.hidden = isCfStatePristine(cfState); }
});
cfTypeSeg.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  cfState.wodType = button.dataset.value;
  saveCfDraft();
  renderCfSegments();
  updateScoreFields();
  renderCfItems(); // "par tour" et "+ en plus" n'existent qu'en AMRAP
});
cfLevelSeg.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  cfState.level = button.dataset.value;
  saveCfDraft();
  renderCfSegments();
  updateCfScoreCompare();
});
[[cfTimeMinInput, "timeMin"], [cfTimeSecInput, "timeSec"], [cfRoundsInput, "rounds"], [cfExtraRepsInput, "extraReps"]].forEach(([input, key]) => {
  input.addEventListener("input", () => {
    cfState[key] = input.value;
    saveCfDraft();
    updateCfScoreCompare();
  });
});
cfDateInput.addEventListener("change", () => {
  if (!isValidDateString(cfDateInput.value)) { cfDateInput.value = cfState.date; return; }
  cfState.date = cfDateInput.value;
  cfState.dateTouched = cfState.date !== todayLocalDateString() || Boolean(cfState.editingId);
  saveCfDraft();
});
cfNotesInput.addEventListener("input", () => { cfState.notes = cfNotesInput.value; saveCfDraft(); });

/**
 * v28 : l'iPhone garde l'appli ouverte en arrière-plan. Une date jamais
 * changée à la main suit donc le jour qui passe (sinon le WOD du lendemain
 * serait enregistré à la date de la veille).
 */
function refreshCfDateIfStale() {
  if (!cfState || cfState.dateTouched) return;
  const today = todayLocalDateString();
  if (cfState.date === today) return;
  cfState.date = today;
  cfDateInput.value = today;
  saveCfDraft();
}

cfAddStructuredExerciseBtn.addEventListener("click", () => openExercisePicker({
  title: "Ajouter un exercice",
  includeMeasured: true,
  onPick: (name) => {
    const measured = isMeasuredExercise(name);
    if (isCfSpeMode()) {
      const previous = getPreviousSets(name, cfState.editingId).slice(0, 12);
      const sets = previous.length ? previous.map((set) => newEmptySet(set.warmup === true)) : [newEmptySet(), newEmptySet(), newEmptySet()];
      cfState.speItems.push({ kind: "sets", exercise: name, unit: measured ? MEASURED_EXERCISES[name][0] : undefined, sets });
    } else {
      cfState.wodItems.push({ kind: "mv", exercise: name, unit: measured ? MEASURED_EXERCISES[name][0] : undefined, reps: "", weight: "", extraReps: "" });
    }
    saveCfDraft();
    renderCfItems();
    cfClearBtn.hidden = Boolean(cfState.editingId) || isCfStatePristine(cfState);
  },
}));

cfAddExerciseBtn.addEventListener("click", () => {
  getCfItems().push({ kind: "text", text: "" });
  saveCfDraft();
  renderCfItems();
  const inputs = cfExercisesList.querySelectorAll(".cf-exercise-input");
  if (inputs.length) inputs[inputs.length - 1].focus();
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
// ENREGISTREMENT
// --------------------------------------------------------------------------

/** Transforme le formulaire en séance prête à enregistrer : { sessionData } ou { error }. */
function collectCfSession() {
  const wodName = getCfWodName();
  if (!wodName) return { error: "Merci d'indiquer un nom de WOD." };
  refreshCfDateIfStale();
  const date = isValidDateString(cfState.date) ? cfState.date : todayLocalDateString();
  const notes = cfState.notes.trim();

  if (isSpeSession(wodName)) {
    const exercises = [];
    for (const item of cfState.speItems) {
      if (item.kind === "text") {
        if (item.text.trim()) exercises.push(item.text.trim());
        continue;
      }
      const unit = getSetItemUnit(item);
      const measured = unit !== "reps";
      let number = 0;
      for (const set of item.sets) {
        if (!set.warmup) number += 1;
        if (!isSetFilled(set)) continue;
        const result = validateSetInput(item.exercise, set.reps, set.weight, setLabel(item.exercise, set, number), measured);
        if (result.error) return { error: result.error };
        const entry = { exercise: item.exercise, reps: result.reps, weight: result.weight, extraReps: 0 };
        if (measured) entry.unit = unit;
        if (set.warmup) entry.warmup = true;
        exercises.push(entry);
      }
    }
    return {
      sessionData: { type: "crossfit", date, wodName, wodType: null, rxOrScaled: null, timeSeconds: null, rounds: null, extraReps: null, exercises, notes },
    };
  }

  const time = readCfTime(cfState.timeMin, cfState.timeSec);
  if (time.error) return { error: time.error };
  const readCount = (text, label) => {
    const clean = text.trim();
    if (!clean) return { value: null };
    return /^\d+$/.test(clean) ? { value: Number(clean) } : { error: `${label} : indique un nombre entier.` };
  };
  const rounds = readCount(cfState.rounds, "Rounds complets");
  if (rounds.error) return { error: rounds.error };
  const extra = readCount(cfState.extraReps, "Reps en plus");
  if (extra.error) return { error: extra.error };
  if (isScoreRequired(cfState.wodType) && time.seconds === null && rounds.value === null) {
    return {
      error: cfState.wodType === "AMRAP"
        ? "Indique ton nombre de rounds complets (et les reps en plus s'il y en a)."
        : "Indique ton temps (minutes et secondes), par exemple 6 min 42 s.",
    };
  }

  const isAmrap = cfState.wodType === "AMRAP";
  const exercises = [];
  for (const item of cfState.wodItems) {
    if (item.kind === "text") {
      if (item.text.trim()) exercises.push(item.text.trim());
      continue;
    }
    const measured = isMeasuredExercise(item.exercise);
    const repsText = item.reps.trim();
    const weightText = measured ? "" : item.weight.trim();
    const extraText = isAmrap ? item.extraReps.trim() : "";
    // Charge ou "en plus" sans quantité : on le signale au lieu de l'ignorer en silence
    if (!repsText) {
      if (weightText || extraText) return { error: `${item.exercise} : il manque la quantité (reps, calories ou mètres).` };
      continue; // ligne vide : ignorée
    }
    const reps = rfParseNumber(repsText);
    if (!(reps > 0)) return { error: `${item.exercise} : la quantité n'est pas valide.` };
    const weight = weightText ? rfParseNumber(weightText) : 0;
    if (!Number.isFinite(weight) || weight < 0) return { error: `${item.exercise} : la charge n'est pas valide.` };
    const extraReps = extraText ? rfParseNumber(extraText) : 0;
    if (!Number.isFinite(extraReps) || extraReps < 0) return { error: `${item.exercise} : les reps en plus ne sont pas valides.` };
    if (measured) {
      const units = MEASURED_EXERCISES[item.exercise];
      exercises.push({ exercise: item.exercise, reps, weight: 0, extraReps, unit: units.includes(item.unit) ? item.unit : units[0] });
    } else {
      exercises.push({ exercise: item.exercise, reps, weight, extraReps });
    }
  }

  return {
    sessionData: {
      type: "crossfit",
      date,
      wodName,
      wodType: cfState.wodType,
      rxOrScaled: cfState.level,
      timeSeconds: time.seconds,
      rounds: rounds.value,
      extraReps: extra.value,
      exercises,
      notes,
    },
  };
}

function submitCfForm() {
  if (document.activeElement && typeof document.activeElement.blur === "function") document.activeElement.blur();
  const result = collectCfSession();
  if (result.error) {
    showCfFeedback(result.error, true);
    return;
  }
  const sessionData = result.sessionData;
  const wodName = sessionData.wodName;
  const isSpe = isSpeSession(wodName);

  if (cfState.editingId) {
    updateSession(cfState.editingId, sessionData);
    showCfFeedback(isSpe ? "Séance mise à jour !" : "WOD mis à jour !", false);
  } else {
    const recordsBefore = typeof computeCfRecords === "function" ? computeCfRecords() : {};
    const muscuRecordsBefore = typeof computeMuscuRecords === "function" ? computeMuscuRecords() : {};
    addSession(sessionData);

    // Comparé uniquement aux WOD du même nom ET du même niveau (RX, Inter, Scaled)
    const newRecord = typeof detectCfNewRecords === "function"
      ? detectCfNewRecords(recordsBefore, wodName, sessionData.rxOrScaled || "RX", sessionData.date)
      : null;

    // Les exercices structurés sont comparés à la charge maximale déjà
    // connue pour cet exercice (voir la note dans stats.js).
    const structuredEntries = sessionData.exercises.filter((entry) => typeof entry === "object" && entry !== null);
    const newLiftRecords = (typeof detectStructuredWeightRecords === "function" && structuredEntries.length > 0)
      ? detectStructuredWeightRecords(muscuRecordsBefore, structuredEntries)
      : [];

    if (newRecord || newLiftRecords.length > 0) {
      showCfRecordBadge(wodName, newRecord, newLiftRecords);
    } else {
      showCfFeedback(isSpe ? "Séance enregistrée !" : "WOD enregistré !", false);
    }
  }

  cfState = defaultCfState();
  saveCfDraft();
  populateWodSelects();
  renderCfForm();
  renderCfHistory();
  if (typeof notifyRankProgress === "function") notifyRankProgress(); // rangs et succès
  if (typeof renderDashboard === "function") renderDashboard();
  if (typeof renderRecords === "function") renderRecords();
}

cfSubmitBtn.addEventListener("click", submitCfForm);

/** Le formulaire contient une saisie : on demande avant de la remplacer. */
function confirmReplaceCfForm() {
  if (!cfState || isCfStatePristine(cfState)) return true;
  return confirm("Le formulaire contient une saisie en cours. La remplacer ?");
}

/** État du formulaire à partir d'une séance enregistrée (pour "Refaire" ou "Modifier"). */
function cfStateFromSession(session, forEdit) {
  const state = defaultCfState();
  state.wod = session.wodName || DAILY_WOD_LABEL;
  if (CF_WOD_TYPES.includes(session.wodType)) state.wodType = session.wodType;
  if (CF_LEVELS.includes(session.rxOrScaled)) state.level = session.rxOrScaled;
  const entries = (session.exercises || []).filter((e) => e !== null && e !== undefined);

  if (isSpeSession(state.wod)) {
    // Une ligne par série : les séries qui se suivent sur le même exercice forment une carte
    entries.forEach((entry) => {
      if (typeof entry !== "object") { state.speItems.push({ kind: "text", text: String(entry) }); return; }
      const unit = getEntryUnit(entry) === "reps" ? undefined : getEntryUnit(entry);
      const last = state.speItems[state.speItems.length - 1];
      const set = forEdit
        ? { reps: rfInputNumber(entry.reps), weight: entry.weight > 0 ? rfInputNumber(entry.weight) : "", done: true, warmup: entry.warmup === true }
        : newEmptySet(entry.warmup === true);
      if (last && last.kind === "sets" && last.exercise === entry.exercise && last.unit === unit) last.sets.push(set);
      else state.speItems.push({ kind: "sets", exercise: entry.exercise, unit, sets: [set] });
    });
  } else {
    state.wodItems = entries.map((entry) => (typeof entry === "object"
      ? {
        kind: "mv",
        exercise: entry.exercise,
        unit: getEntryUnit(entry) === "reps" ? undefined : getEntryUnit(entry),
        reps: entry.reps ? rfInputNumber(entry.reps) : "",
        weight: entry.weight > 0 ? rfInputNumber(entry.weight) : "",
        extraReps: forEdit && entry.extraReps ? rfInputNumber(entry.extraReps) : "",
      }
      : { kind: "text", text: String(entry) }));
  }

  if (forEdit) {
    state.editingId = session.id;
    state.date = session.date;
    state.dateTouched = true;
    state.notes = session.notes || "";
    if (session.timeSeconds > 0) {
      state.timeMin = String(Math.floor(session.timeSeconds / 60));
      state.timeSec = String(Math.round(session.timeSeconds % 60)).padStart(2, "0");
    }
    if (typeof session.rounds === "number") state.rounds = String(session.rounds);
    if (typeof session.extraReps === "number" && session.extraReps > 0) state.extraReps = String(session.extraReps);
  }
  return state;
}

function scrollToCfForm() {
  const panel = document.querySelector("#section-crossfit .form-panel");
  if (panel && typeof panel.scrollIntoView === "function") panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Pré-remplit le formulaire avec un WOD existant, SANS passer en mode
 * édition : la validation créera un tout nouveau WOD, daté d'aujourd'hui.
 */
function duplicateCfSession(session) {
  if (!confirmReplaceCfForm()) return false;
  cfState = cfStateFromSession(session, false);
  saveCfDraft();
  renderCfForm();
  scrollToCfForm();
  return true;
}

/** Remplit le formulaire avec un WOD existant et bascule en mode édition. */
function startEditCfSession(session) {
  if (!confirmReplaceCfForm()) return false;
  cfState = cfStateFromSession(session, true);
  saveCfDraft();
  renderCfForm();
  scrollToCfForm();
  return true;
}

/** Sort du mode édition et remet le formulaire à zéro. */
function cancelCfEdit() {
  cfState = defaultCfState();
  saveCfDraft();
  renderCfForm();
}

cfCancelEditBtn.addEventListener("click", cancelCfEdit);
cfClearBtn.addEventListener("click", () => {
  if (!confirm("Vider le formulaire ?")) return;
  cancelCfEdit();
});

let cfFeedbackTimer = null;

function showCfFeedback(message, isError) {
  clearTimeout(cfFeedbackTimer);
  cfFeedback.textContent = message;
  cfFeedback.className = "form-feedback rf-toast " + (isError ? "form-feedback-error" : "form-feedback-success");
  cfFeedbackTimer = setTimeout(() => { cfFeedback.textContent = ""; }, isError ? 4500 : 3000);
}

/** Affiche un badge mis en avant quand le WOD (ou un exercice structuré qu'il contient) bat un record. */
function showCfRecordBadge(wodName, wodRecord, liftRecords) {
  clearTimeout(cfFeedbackTimer);
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
  cfFeedback.className = "form-feedback rf-toast rf-toast-record";
  cfFeedbackTimer = setTimeout(() => { cfFeedback.innerHTML = ""; }, 6000);
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
    card.dataset.sessionId = session.id; // le calendrier de Statistiques retrouve la carte

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
          return `<p class="history-card-notes"><strong>${escapeHtml(entry.exercise)}</strong> — ${entry.warmup === true ? "échauff. " : ""}${escapeHtml(repsDetail)}${weightText}${volumeText}</p>`;
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
        <span class="history-card-date">${parseLocalDate(session.date).toLocaleDateString("fr-FR")}</span>
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
    card.querySelector(".hist-repeat-btn").addEventListener("click", () => duplicateCfSession(session));
    card.querySelector(".hist-edit-btn").addEventListener("click", () => startEditCfSession(session));
    card.querySelector(".hist-delete-btn").addEventListener("click", () => {
      const confirmed = confirm("Supprimer définitivement ce WOD ? Cette action est irréversible.");
      if (!confirmed) return;
      deleteSession(session.id);
      if (cfState && cfState.editingId === session.id) cancelCfEdit(); // on modifiait justement ce WOD
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
// Une saisie en cours (appli fermée au milieu d'un cours) est reprise telle quelle.
// --------------------------------------------------------------------------

cfState = loadCfDraft() || defaultCfState();
saveCfDraft();
populateWodSelects();
renderCfForm();
renderCfHistory();

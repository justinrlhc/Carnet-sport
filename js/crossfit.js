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
    .filter((name) => Boolean(name) && name !== DAILY_WOD_LABEL);
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
  wods.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    cfFilterSelect.appendChild(opt);
  });
}

/** Affiche uniquement les champs de score pertinents pour un WOD donné (temps OU rounds). */
function setScoreFieldsVisibility(name) {
  const preset = BENCHMARK_WODS[name];
  if (preset && preset.scoreType === "time") {
    cfTimeRow.style.display = "";
    cfRoundsRow.style.display = "none";
  } else if (preset && preset.scoreType === "rounds") {
    cfTimeRow.style.display = "none";
    cfRoundsRow.style.display = "";
  } else {
    cfTimeRow.style.display = "";
    cfRoundsRow.style.display = "";
  }
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
      <input type="number" class="cf-structured-reps" min="0" placeholder="Répétitions">
      <input type="number" class="cf-structured-weight" min="0" step="0.5" placeholder="Poids (kg)">
      <input type="number" class="cf-structured-extra" min="0" placeholder="Reps suppl." style="display:none;">
    </div>
  `;

  const select = row.querySelector(".cf-structured-select");
  const customInput = row.querySelector(".cf-structured-custom");
  const repsInput = row.querySelector(".cf-structured-reps");
  const weightInput = row.querySelector(".cf-structured-weight");
  const extraInput = row.querySelector(".cf-structured-extra");

  // On réutilise directement la fonction de musculation.js : même base
  // d'exercices, même option "+ Autre exercice…" pour rester cohérent.
  populateExerciseSelectElement(select);

  function getRowExerciseName() {
    return select.value === "__custom__" ? customInput.value.trim() : select.value;
  }

  function updateWeightPlaceholder() {
    const isBW = typeof isBodyweightExercise === "function" && isBodyweightExercise(getRowExerciseName());
    weightInput.placeholder = isBW ? "Lest (kg, optionnel)" : "Poids (kg)";
  }

  select.addEventListener("change", () => {
    const isCustom = select.value === "__custom__";
    customInput.style.display = isCustom ? "block" : "none";
    if (isCustom) customInput.focus();
    updateWeightPlaceholder();
  });
  customInput.addEventListener("input", updateWeightPlaceholder);

  row.querySelector(".set-remove").addEventListener("click", () => row.remove());

  if (prefill) {
    const exists = getAllKnownExercises().includes(prefill.exercise);
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
  updateStructuredRowForWodType(row);

  return row;
}

/** Adapte le libellé des reps et la visibilité du champ "reps supplémentaires" selon le type de WOD. */
function updateStructuredRowForWodType(row) {
  const isAmrap = cfTypeSelect.value === "AMRAP";
  const repsInput = row.querySelector(".cf-structured-reps");
  const extraInput = row.querySelector(".cf-structured-extra");
  repsInput.placeholder = isAmrap ? "Reps par tour" : "Répétitions totales";
  extraInput.style.display = isAmrap ? "block" : "none";
}

/** Réapplique l'adaptation AMRAP à toutes les lignes structurées déjà présentes. */
function updateAllStructuredRowsForWodType() {
  cfExercisesList.querySelectorAll(".cf-structured-row").forEach(updateStructuredRowForWodType);
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

function parseTimeToSeconds(text) {
  if (!text || !text.trim()) return null;
  const parts = text.trim().split(":");
  if (parts.length !== 2) return null;
  const minutes = Number(parts[0]);
  const seconds = Number(parts[1]);
  if (Number.isNaN(minutes) || Number.isNaN(seconds)) return null;
  return minutes * 60 + seconds;
}

function formatSecondsToTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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

  if (timeSeconds === null && rounds === null) {
    showCfFeedback("Indique au moins un temps (mm:ss) ou un nombre de rounds.", true);
    return;
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
    wodType: cfTypeSelect.value,
    rxOrScaled: cfRxSelect.value,
    timeSeconds: timeSeconds,
    rounds: rounds,
    extraReps: extraReps,
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

    const newRecord = typeof detectCfNewRecords === "function"
      ? detectCfNewRecords(recordsBefore, wodName, sessionData.date)
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

  cfSubmitBtn.textContent = "Mettre à jour le WOD";
  cfCancelEditBtn.style.display = "inline-block";
}

/** Sort du mode édition et remet le formulaire à son état "ajout". */
function cancelCfEdit() {
  cfEditingId = null;
  cfForm.reset();
  resetExerciseRows();
  cfTimeRow.style.display = "";
  cfRoundsRow.style.display = "";
  cfDateInput.value = todayLocalDateString();
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
    parts.push(`${wodName} — ${label} : ${wodRecord.value}`);
  }
  (liftRecords || []).forEach((r) => parts.push(`${r.exercise} : ${r.value} kg`));

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

cfFilterSelect.addEventListener("change", () => renderCfHistory());
cfFilterLevelSelect.addEventListener("change", () => renderCfHistory());

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

  const sessions = getAllSessions()
    .filter((s) => s.type === "crossfit")
    .filter((s) => filter === "all" || s.wodName === filter)
    .filter((s) => levelFilter === "all" || s.rxOrScaled === levelFilter)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  cfHistoryList.innerHTML = "";

  if (sessions.length === 0) {
    cfHistoryList.innerHTML = `<p class="empty-text">Aucun WOD enregistré pour ce filtre.</p>`;
    return;
  }

  sessions.forEach((session) => {
    const card = document.createElement("div");
    card.className = "history-card";

    const exercisesHtml = (session.exercises || [])
      .map((entry) => {
        if (typeof entry === "object" && entry !== null) {
          const isAmrap = session.wodType === "AMRAP" && typeof session.rounds === "number";
          const totalReps = isAmrap ? entry.reps * session.rounds + (entry.extraReps || 0) : entry.reps;
          const repsDetail = isAmrap
            ? `${entry.reps} reps × ${session.rounds} tours${entry.extraReps ? ` + ${entry.extraReps}` : ""} = ${totalReps} reps`
            : `${totalReps} reps`;
          const weightText = entry.weight > 0 ? ` à ${entry.weight} kg` : "";
          const volume = typeof computeCrossfitStructuredVolume === "function"
            ? computeCrossfitStructuredVolume(session, entry)
            : 0;
          const volumeText = volume > 0 ? ` · Volume : ${Math.round(volume).toLocaleString("fr-FR")} kg` : "";
          return `<p class="history-card-notes"><strong>${entry.exercise}</strong> — ${repsDetail}${weightText}${volumeText}</p>`;
        }
        return null;
      })
      .filter(Boolean)
      .join("");

    const freeTextMovements = (session.exercises || []).filter((entry) => typeof entry === "string");
    const freeTextHtml = freeTextMovements
      .map((movement) => `<p class="history-card-notes">${movement}</p>`)
      .join("");

    card.innerHTML = `
      <div class="history-card-header">
        <span class="history-card-title">${session.wodName}</span>
        <span class="history-card-date">${new Date(session.date).toLocaleDateString("fr-FR")}</span>
      </div>
      <p class="history-card-sets">${session.wodType || ""} — <strong>${formatWodResult(session)}</strong></p>
      ${exercisesHtml}
      ${freeTextHtml}
      <span class="badge-rpe ${getLevelBadgeClass(session.rxOrScaled)}">${session.rxOrScaled}</span>
      ${session.notes ? `<p class="history-card-notes">${session.notes}</p>` : ""}
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
      if (typeof renderDashboard === "function") renderDashboard();
      if (typeof renderRecords === "function") renderRecords();
    });
    cfHistoryList.appendChild(card);
  });
}

// --------------------------------------------------------------------------
// INITIALISATION DE LA PAGE
// --------------------------------------------------------------------------

cfDateInput.value = todayLocalDateString();
populateWodSelects();
resetExerciseRows();
renderCfHistory();

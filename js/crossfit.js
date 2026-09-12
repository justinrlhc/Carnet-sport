// ==========================================================================
// crossfit.js — tout ce qui concerne la page CrossFit :
//   - remplir la liste déroulante des noms de WOD
//   - ajouter/enlever des lignes de mouvements dans le formulaire
//   - enregistrer un WOD (via addSession, fourni par data.js)
//   - afficher l'historique, filtrable par nom de WOD
// ==========================================================================

// Quelques WOD "benchmark" bien connus, proposés par défaut.
// Comme pour les exercices de musculation, on peut aussi taper un nom
// personnalisé grâce à l'option "Autre".
const DEFAULT_WODS = ["Fran", "Grace", "Helen", "Cindy", "Annie", "Diane", "Murph", "Karen"];

// --------------------------------------------------------------------------
// ÉLÉMENTS DU FORMULAIRE
// --------------------------------------------------------------------------

const cfForm = document.getElementById("cf-form");
const cfDateInput = document.getElementById("cf-date");
const cfWodSelect = document.getElementById("cf-wod-select");
const cfWodCustom = document.getElementById("cf-wod-custom");
const cfTypeSelect = document.getElementById("cf-type");
const cfRxSelect = document.getElementById("cf-rx");
const cfTimeInput = document.getElementById("cf-time");
const cfRoundsInput = document.getElementById("cf-rounds");
const cfExtraRepsInput = document.getElementById("cf-extra-reps");
const cfExercisesList = document.getElementById("cf-exercises-list");
const cfAddExerciseBtn = document.getElementById("cf-add-exercise");
const cfNotesInput = document.getElementById("cf-notes");
const cfFeedback = document.getElementById("cf-feedback");
const cfFilterSelect = document.getElementById("cf-filter-wod");
const cfHistoryList = document.getElementById("cf-history-list");
const cfSubmitBtn = document.getElementById("cf-submit-btn");
const cfCancelEditBtn = document.getElementById("cf-cancel-edit");

// Quand cette variable contient un id, le formulaire est en mode "édition".
let cfEditingId = null;

/**
 * Renvoie la liste des noms de WOD déjà utilisés dans l'historique,
 * fusionnée avec la liste des benchmarks par défaut (sans doublons).
 */
function getAllKnownWods() {
  const used = getAllSessions()
    .filter((s) => s.type === "crossfit")
    .map((s) => s.wodName)
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_WODS, ...used])).sort();
}

function populateWodSelects() {
  const wods = getAllKnownWods();

  // ----- Select du formulaire -----
  cfWodSelect.innerHTML = "";
  wods.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    cfWodSelect.appendChild(opt);
  });
  const customOpt = document.createElement("option");
  customOpt.value = "__custom__";
  customOpt.textContent = "+ Autre WOD…";
  cfWodSelect.appendChild(customOpt);

  // ----- Select du filtre d'historique -----
  cfFilterSelect.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = "Tous les WOD";
  cfFilterSelect.appendChild(allOpt);
  wods.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    cfFilterSelect.appendChild(opt);
  });
}

cfWodSelect.addEventListener("change", () => {
  const isCustom = cfWodSelect.value === "__custom__";
  cfWodCustom.style.display = isCustom ? "block" : "none";
  if (isCustom) cfWodCustom.focus();
});

// --------------------------------------------------------------------------
// MOUVEMENTS DYNAMIQUES (une simple liste de textes, ex: "Thrusters 42,5 kg")
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

function resetExerciseRows() {
  cfExercisesList.innerHTML = "";
  for (let i = 0; i < 2; i++) {
    cfExercisesList.appendChild(createExerciseRow());
  }
}

cfAddExerciseBtn.addEventListener("click", () => {
  cfExercisesList.appendChild(createExerciseRow());
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

  const isCustom = cfWodSelect.value === "__custom__";
  const wodName = isCustom ? cfWodCustom.value.trim() : cfWodSelect.value;

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

  const exercises = [...cfExercisesList.querySelectorAll(".cf-exercise-input")]
    .map((input) => input.value.trim())
    .filter(Boolean);

  const sessionData = {
    type: "crossfit",
    date: cfDateInput.value || new Date().toISOString().split("T")[0],
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
    addSession(sessionData);

    const newRecord = typeof detectCfNewRecords === "function"
      ? detectCfNewRecords(recordsBefore, wodName, sessionData.date)
      : null;

    if (newRecord) {
      showCfRecordBadge(wodName, newRecord);
    } else {
      showCfFeedback("WOD enregistré !", false);
    }
  }

  cancelCfEdit();
  populateWodSelects();
  renderCfHistory();
  if (typeof renderDashboard === "function") renderDashboard();
  if (typeof renderHistorique === "function") renderHistorique();
});

/**
 * Pré-remplit le formulaire avec les valeurs d'un WOD existant, mais SANS
 * passer en mode édition : la validation créera un tout nouveau WOD,
 * daté d'aujourd'hui.
 */
function duplicateCfSession(session) {
  cfEditingId = null;

  cfDateInput.value = new Date().toISOString().split("T")[0];

  populateWodSelects();
  const exists = [...cfWodSelect.options].some((o) => o.value === session.wodName);
  if (exists) {
    cfWodSelect.value = session.wodName;
    cfWodCustom.style.display = "none";
  } else {
    cfWodSelect.value = "__custom__";
    cfWodCustom.style.display = "block";
    cfWodCustom.value = session.wodName;
  }

  cfTypeSelect.value = session.wodType || "For Time";
  cfRxSelect.value = session.rxOrScaled || "RX";
  cfTimeInput.value = "";
  cfRoundsInput.value = "";
  cfExtraRepsInput.value = "";

  cfExercisesList.innerHTML = "";
  (session.exercises && session.exercises.length ? session.exercises : ["", ""]).forEach((ex) => {
    const row = createExerciseRow();
    row.querySelector(".cf-exercise-input").value = ex;
    cfExercisesList.appendChild(row);
  });

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
  const exists = [...cfWodSelect.options].some((o) => o.value === session.wodName);
  if (exists) {
    cfWodSelect.value = session.wodName;
    cfWodCustom.style.display = "none";
  } else {
    cfWodSelect.value = "__custom__";
    cfWodCustom.style.display = "block";
    cfWodCustom.value = session.wodName;
  }

  cfTypeSelect.value = session.wodType || "For Time";
  cfRxSelect.value = session.rxOrScaled || "RX";
  cfTimeInput.value = session.timeSeconds !== null && session.timeSeconds !== undefined
    ? formatSecondsToTime(session.timeSeconds) : "";
  cfRoundsInput.value = session.rounds ?? "";
  cfExtraRepsInput.value = session.extraReps ?? "";

  cfExercisesList.innerHTML = "";
  (session.exercises && session.exercises.length ? session.exercises : ["", ""]).forEach((ex) => {
    const row = createExerciseRow();
    row.querySelector(".cf-exercise-input").value = ex;
    cfExercisesList.appendChild(row);
  });

  cfNotesInput.value = session.notes || "";

  cfSubmitBtn.textContent = "Mettre à jour le WOD";
  cfCancelEditBtn.style.display = "inline-block";
}

/** Sort du mode édition et remet le formulaire à son état "ajout". */
function cancelCfEdit() {
  cfEditingId = null;
  cfForm.reset();
  resetExerciseRows();
  cfWodCustom.style.display = "none";
  cfDateInput.value = new Date().toISOString().split("T")[0];
  cfSubmitBtn.textContent = "Enregistrer le WOD";
  cfCancelEditBtn.style.display = "none";
}

cfCancelEditBtn.addEventListener("click", cancelCfEdit);

function showCfFeedback(message, isError) {
  cfFeedback.textContent = message;
  cfFeedback.className = "form-feedback " + (isError ? "form-feedback-error" : "form-feedback-success");
  setTimeout(() => { cfFeedback.textContent = ""; }, 3000);
}

/** Affiche un badge mis en avant quand le WOD qu'on vient d'enregistrer bat un record. */
function showCfRecordBadge(wodName, record) {
  const label = record.type === "time" ? "meilleur temps" : "meilleure performance";
  cfFeedback.innerHTML = `
    <span class="record-badge">
      <svg viewBox="0 0 24 24" class="record-badge-icon"><path d="M6 2h12v6a6 6 0 0 1-5 5.92V17h3v2H8v-2h3v-3.08A6 6 0 0 1 6 8V2Zm2 2v4a4 4 0 0 0 8 0V4H8ZM3 4h2v3a3 3 0 0 1-2 2.83V4Zm16 0h2v5.83A3 3 0 0 1 19 7V4Z"/></svg>
      Nouveau record ! ${wodName} — ${label} : ${record.value}
    </span>`;
  cfFeedback.className = "form-feedback";
  setTimeout(() => { cfFeedback.innerHTML = ""; }, 5000);
}

// --------------------------------------------------------------------------
// HISTORIQUE (liste des WOD, filtrable par nom)
// --------------------------------------------------------------------------

cfFilterSelect.addEventListener("change", () => renderCfHistory());

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

  const sessions = getAllSessions()
    .filter((s) => s.type === "crossfit")
    .filter((s) => filter === "all" || s.wodName === filter)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  cfHistoryList.innerHTML = "";

  if (sessions.length === 0) {
    cfHistoryList.innerHTML = `<p class="empty-text">Aucun WOD enregistré pour ce filtre.</p>`;
    return;
  }

  sessions.forEach((session) => {
    const card = document.createElement("div");
    card.className = "history-card";

    const exercisesText = (session.exercises || []).join(" · ");

    card.innerHTML = `
      <div class="history-card-header">
        <span class="history-card-title">${session.wodName}</span>
        <span class="history-card-date">${new Date(session.date).toLocaleDateString("fr-FR")}</span>
      </div>
      <p class="history-card-sets">${session.wodType || ""} — <strong>${formatWodResult(session)}</strong></p>
      ${exercisesText ? `<p class="history-card-notes">${exercisesText}</p>` : ""}
      <span class="badge-rpe">${session.rxOrScaled}</span>
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

cfDateInput.value = new Date().toISOString().split("T")[0];
populateWodSelects();
resetExerciseRows();
renderCfHistory();

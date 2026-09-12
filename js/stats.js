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
function computeSessionVolume(session) {
  if (session.type !== "musculation" || !session.sets) return 0;
  return session.sets.reduce((total, set) => total + set.reps * set.weight, 0);
}

/** Renvoie true si une date (format "AAAA-MM-JJ") tombe dans les X derniers jours. */
function isWithinLastDays(dateStr, nbDays) {
  const date = new Date(dateStr);
  const limit = new Date();
  limit.setDate(limit.getDate() - nbDays);
  return date >= limit;
}

/**
 * Estime le 1RM (la charge maximale que tu pourrais soulever une seule fois)
 * à partir d'une série réellement effectuée, grâce à la formule d'Epley,
 * une formule standard largement utilisée en musculation.
 *
 * Formule : 1RM ≈ poids × (1 + répétitions / 30)
 *
 * IMPORTANT : c'est une ESTIMATION, pas une mesure réelle. Elle devient
 * moins fiable au-delà d'une dizaine de répétitions.
 */
function estimateOneRepMax(weight, reps) {
  if (reps <= 1) return weight; // à 1 répétition, le "1RM" est simplement le poids soulevé
  return weight * (1 + reps / 30);
}

/**
 * Parcourt toutes les séances de musculation et calcule, pour chaque
 * exercice pratiqué :
 *  - le 1RM estimé le plus élevé jamais atteint (record de force estimé)
 *  - la charge la plus lourde jamais soulevée, quel que soit le nombre de reps
 *  - le plus grand nombre de répétitions jamais réalisé sur une série
 */
function computeMuscuRecords() {
  const sessions = getAllSessions().filter((s) => s.type === "musculation");
  const records = {}; // { "Back Squat": { oneRM: {...}, maxWeight: {...}, maxReps: {...} } }

  sessions.forEach((session) => {
    if (!records[session.exercise]) {
      records[session.exercise] = { oneRM: null, maxWeight: null, maxReps: null };
    }
    const rec = records[session.exercise];

    session.sets.forEach((set) => {
      const estimated1RM = estimateOneRepMax(set.weight, set.reps);

      if (!rec.oneRM || estimated1RM > rec.oneRM.value) {
        rec.oneRM = { value: estimated1RM, weight: set.weight, reps: set.reps, date: session.date };
      }
      if (!rec.maxWeight || set.weight > rec.maxWeight.value) {
        rec.maxWeight = { value: set.weight, reps: set.reps, date: session.date };
      }
      if (!rec.maxReps || set.reps > rec.maxReps.value) {
        rec.maxReps = { value: set.reps, weight: set.weight, date: session.date };
      }
    });
  });

  return records;
}

/**
 * Parcourt toutes les séances de CrossFit et calcule, pour chaque WOD :
 *  - le meilleur temps jamais réalisé (le plus petit, pour les WOD chronométrés)
 *  - la meilleure performance en rounds/reps (la plus grande, pour les AMRAP)
 */
function computeCfRecords() {
  const sessions = getAllSessions().filter((s) => s.type === "crossfit");
  const records = {}; // { "Fran": { bestTime: {...}, bestPerformance: {...} } }

  sessions.forEach((session) => {
    if (!records[session.wodName]) {
      records[session.wodName] = { bestTime: null, bestPerformance: null };
    }
    const rec = records[session.wodName];

    if (session.timeSeconds !== null && session.timeSeconds !== undefined) {
      if (!rec.bestTime || session.timeSeconds < rec.bestTime.value) {
        rec.bestTime = { value: session.timeSeconds, date: session.date };
      }
    }

    if (session.rounds !== null && session.rounds !== undefined) {
      const extra = session.extraReps || 0;
      const isBetter =
        !rec.bestPerformance ||
        session.rounds > rec.bestPerformance.rounds ||
        (session.rounds === rec.bestPerformance.rounds && extra > rec.bestPerformance.extraReps);

      if (isBetter) {
        rec.bestPerformance = { rounds: session.rounds, extraReps: extra, date: session.date };
      }
    }
  });

  return records;
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
const btnToggle1rmForm = document.getElementById("btn-toggle-1rm-form");
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
const btnToggleCfForm = document.getElementById("btn-toggle-cf-record-form");
const btnCancelCfForm = document.getElementById("btn-cancel-cf-record-form");

function renderRecords() {
  const muscuGrid = document.getElementById("records-muscu-grid");
  const cfGrid = document.getElementById("records-cf-grid");
  if (!muscuGrid || !cfGrid) return; // sécurité si la page n'est pas encore dans le DOM

  // ========== MUSCULATION ==========
  const sessionRecords = computeMuscuRecords();
  const manualOneRMs = getManualOneRMs();
  const exerciseNames = Array.from(new Set([...Object.keys(sessionRecords), ...Object.keys(manualOneRMs)])).sort();

  muscuGrid.innerHTML = "";
  if (exerciseNames.length === 0) {
    muscuGrid.innerHTML = `<p class="empty-text">Ajoute une séance ou note un 1RM connu pour voir apparaître tes records ici.</p>`;
  }

  exerciseNames.forEach((exercise) => {
    const sessionRec = sessionRecords[exercise] || null;
    const manual = manualOneRMs[exercise] || null;

    // On choisit la valeur la plus élevée entre l'estimation calculée et
    // la valeur saisie manuellement, en gardant toujours une trace de sa source.
    let headline;
    if (manual && (!sessionRec || !sessionRec.oneRM || manual.weight >= sessionRec.oneRM.value)) {
      headline = { value: manual.weight, source: "manual", date: manual.date };
    } else {
      headline = { value: sessionRec.oneRM.value, source: "estimated", date: sessionRec.oneRM.date };
    }

    const otherValueNote =
      manual && sessionRec && sessionRec.oneRM && Math.round(sessionRec.oneRM.value) !== Math.round(manual.weight)
        ? `<span>Estimé à partir des séances : ${Math.round(sessionRec.oneRM.value)} kg</span>`
        : "";

    const subLines = sessionRec
      ? `
        <div class="record-sub">
          <span>Charge max levée : ${sessionRec.maxWeight.value} kg × ${sessionRec.maxWeight.reps}</span>
          <span>Reps max : ${sessionRec.maxReps.value} (à ${sessionRec.maxReps.weight} kg)</span>
          ${otherValueNote}
        </div>`
      : `<p class="empty-text" style="margin-top:8px;">Aucune séance enregistrée pour cet exercice.</p>`;

    const manageLinks = manual
      ? `
        <div class="record-manage">
          <button type="button" class="record-link edit-1rm-link">Modifier le 1RM connu</button>
          <button type="button" class="record-link record-link-danger delete-1rm-link">Supprimer</button>
        </div>`
      : `<div class="record-manage"><button type="button" class="record-link add-1rm-link">+ Noter mon 1RM connu</button></div>`;

    const card = document.createElement("div");
    card.className = "record-card";
    card.innerHTML = `
      <span class="record-card-title">${exercise}</span>
      <div class="record-main">
        <span class="record-value">${Math.round(headline.value)} <small>kg</small></span>
        <span class="record-label">${headline.source === "manual" ? "1RM connu (saisi)" : "1RM estimé*"}</span>
      </div>
      ${subLines}
      ${manageLinks}
    `;

    const editLink = card.querySelector(".edit-1rm-link");
    if (editLink) editLink.addEventListener("click", () => open1rmForm(exercise, manual));

    const addLink = card.querySelector(".add-1rm-link");
    if (addLink) addLink.addEventListener("click", () => open1rmForm(exercise, null));

    const deleteLink = card.querySelector(".delete-1rm-link");
    if (deleteLink) {
      deleteLink.addEventListener("click", () => {
        const confirmed = confirm(`Supprimer le 1RM connu que tu as saisi pour ${exercise} ?`);
        if (!confirmed) return;
        deleteManualOneRM(exercise);
        renderRecords();
      });
    }

    muscuGrid.appendChild(card);
  });

  // ========== CROSSFIT ==========
  const sessionCfRecords = computeCfRecords();
  const manualCfBests = getManualCfBests();
  const wodNames = Array.from(new Set([...Object.keys(sessionCfRecords), ...Object.keys(manualCfBests)])).sort();

  cfGrid.innerHTML = "";
  if (wodNames.length === 0) {
    cfGrid.innerHTML = `<p class="empty-text">Ajoute un WOD ou note un résultat connu pour voir apparaître tes records ici.</p>`;
  }

  wodNames.forEach((wodName) => {
    const sessionRec = sessionCfRecords[wodName] || { bestTime: null, bestPerformance: null };
    const manual = manualCfBests[wodName] || null;

    let bestTime = sessionRec.bestTime;
    if (manual && manual.timeSeconds !== null && manual.timeSeconds !== undefined) {
      if (!bestTime || manual.timeSeconds < bestTime.value) {
        bestTime = { value: manual.timeSeconds, date: manual.date, source: "manual" };
      }
    }

    let bestPerf = sessionRec.bestPerformance;
    if (manual && manual.rounds !== null && manual.rounds !== undefined) {
      const extra = manual.extraReps || 0;
      const isBetter = !bestPerf || manual.rounds > bestPerf.rounds || (manual.rounds === bestPerf.rounds && extra > bestPerf.extraReps);
      if (isBetter) bestPerf = { rounds: manual.rounds, extraReps: extra, date: manual.date, source: "manual" };
    }

    let mainBlock = "";
    if (bestTime) {
      mainBlock += `
        <div class="record-main">
          <span class="record-value">${formatSecondsToTime(bestTime.value)}</span>
          <span class="record-label">Meilleur temps${bestTime.source === "manual" ? " (saisi)" : ""}</span>
        </div>`;
    }
    if (bestPerf) {
      const extraText = bestPerf.extraReps ? ` + ${bestPerf.extraReps}` : "";
      mainBlock += `
        <div class="record-main">
          <span class="record-value">${bestPerf.rounds}${extraText}</span>
          <span class="record-label">Meilleure performance${bestPerf.source === "manual" ? " (saisie)" : ""}</span>
        </div>`;
    }

    const manageLinks = manual
      ? `
        <div class="record-manage">
          <button type="button" class="record-link edit-cf-link">Modifier le résultat connu</button>
          <button type="button" class="record-link record-link-danger delete-cf-link">Supprimer</button>
        </div>`
      : `<div class="record-manage"><button type="button" class="record-link add-cf-link">+ Noter un résultat connu</button></div>`;

    const card = document.createElement("div");
    card.className = "record-card";
    card.innerHTML = `<span class="record-card-title">${wodName}</span>${mainBlock}${manageLinks}`;

    const editLink = card.querySelector(".edit-cf-link");
    if (editLink) editLink.addEventListener("click", () => openCfRecordForm(wodName, manual));

    const addLink = card.querySelector(".add-cf-link");
    if (addLink) addLink.addEventListener("click", () => openCfRecordForm(wodName, null));

    const deleteLink = card.querySelector(".delete-cf-link");
    if (deleteLink) {
      deleteLink.addEventListener("click", () => {
        const confirmed = confirm(`Supprimer le résultat connu que tu as saisi pour ${wodName} ?`);
        if (!confirmed) return;
        deleteManualCfBest(wodName);
        renderRecords();
      });
    }

    cfGrid.appendChild(card);
  });
}

// --------------------------------------------------------------------------
// FORMULAIRE "1RM CONNU" — ouverture, remplissage des listes, soumission
// --------------------------------------------------------------------------

function populateManual1rmExerciseSelect() {
  if (!manual1rmExerciseSelect) return;
  const exercises = typeof getAllKnownExercises === "function" ? getAllKnownExercises() : [];
  manual1rmExerciseSelect.innerHTML = "";
  exercises.forEach((ex) => {
    const opt = document.createElement("option");
    opt.value = ex;
    opt.textContent = ex;
    manual1rmExerciseSelect.appendChild(opt);
  });
  const customOpt = document.createElement("option");
  customOpt.value = "__custom__";
  customOpt.textContent = "+ Autre exercice…";
  manual1rmExerciseSelect.appendChild(customOpt);
}

function open1rmForm(exerciseToPrefill, existingManualEntry) {
  populateManual1rmExerciseSelect();

  if (exerciseToPrefill) {
    const exists = [...manual1rmExerciseSelect.options].some((o) => o.value === exerciseToPrefill);
    if (exists) {
      manual1rmExerciseSelect.value = exerciseToPrefill;
      manual1rmExerciseCustom.style.display = "none";
    } else {
      manual1rmExerciseSelect.value = "__custom__";
      manual1rmExerciseCustom.style.display = "block";
      manual1rmExerciseCustom.value = exerciseToPrefill;
    }
  }

  manual1rmWeightInput.value = existingManualEntry ? existingManualEntry.weight : "";
  manual1rmDateInput.value = existingManualEntry ? existingManualEntry.date : new Date().toISOString().split("T")[0];
  manual1rmNotesInput.value = existingManualEntry ? existingManualEntry.notes || "" : "";

  manual1rmForm.style.display = "block";
  manual1rmForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

if (manual1rmExerciseSelect) {
  manual1rmExerciseSelect.addEventListener("change", () => {
    const isCustom = manual1rmExerciseSelect.value === "__custom__";
    manual1rmExerciseCustom.style.display = isCustom ? "block" : "none";
  });
}

if (btnToggle1rmForm) {
  btnToggle1rmForm.addEventListener("click", () => open1rmForm(null, null));
}
if (btnCancel1rmForm) {
  btnCancel1rmForm.addEventListener("click", () => { manual1rmForm.style.display = "none"; manual1rmForm.reset(); });
}

if (manual1rmForm) {
  manual1rmForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const isCustom = manual1rmExerciseSelect.value === "__custom__";
    const exercise = isCustom ? manual1rmExerciseCustom.value.trim() : manual1rmExerciseSelect.value;
    const weight = Number(manual1rmWeightInput.value);

    if (!exercise || !weight || weight <= 0) return;

    setManualOneRM(exercise, {
      weight,
      date: manual1rmDateInput.value || new Date().toISOString().split("T")[0],
      notes: manual1rmNotesInput.value.trim(),
    });

    manual1rmForm.style.display = "none";
    manual1rmForm.reset();
    renderRecords();
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
  manualCfDateInput.value = existingManualEntry ? existingManualEntry.date : new Date().toISOString().split("T")[0];
  manualCfNotesInput.value = existingManualEntry ? existingManualEntry.notes || "" : "";

  manualCfForm.style.display = "block";
  manualCfForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

if (manualCfWodSelect) {
  manualCfWodSelect.addEventListener("change", () => {
    const isCustom = manualCfWodSelect.value === "__custom__";
    manualCfWodCustom.style.display = isCustom ? "block" : "none";
  });
}

if (btnToggleCfForm) {
  btnToggleCfForm.addEventListener("click", () => openCfRecordForm(null, null));
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
      date: manualCfDateInput.value || new Date().toISOString().split("T")[0],
      notes: manualCfNotesInput.value.trim(),
    });

    manualCfForm.style.display = "none";
    manualCfForm.reset();
    renderRecords();
  });
}

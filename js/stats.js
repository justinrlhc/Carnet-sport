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
 */
function computeExerciseVolume(exerciseEntry) {
  if (!exerciseEntry || !Array.isArray(exerciseEntry.sets)) return 0; // donnée malformée : on l'ignore sans planter

  const isBW = typeof isBodyweightExercise === "function" && isBodyweightExercise(exerciseEntry.exercise);

  if (!isBW) {
    return exerciseEntry.sets.reduce((total, set) => total + set.reps * set.weight, 0);
  }

  const bodyweight = typeof getCurrentBodyweight === "function" ? getCurrentBodyweight() : null;
  if (bodyweight === null) return 0; // poids de corps inconnu : pas de calcul possible pour l'instant

  return exerciseEntry.sets.reduce((total, set) => total + set.reps * (bodyweight + (set.weight || 0)), 0);
}

function computeSessionVolume(session) {
  if (session.type === "musculation" && session.exercises) {
    return session.exercises.reduce((total, ex) => total + computeExerciseVolume(ex), 0);
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
  const isBW = typeof isBodyweightExercise === "function" && isBodyweightExercise(entry.exercise);
  let perRepWeight;

  if (isBW) {
    const bodyweight = typeof getCurrentBodyweight === "function" ? getCurrentBodyweight() : null;
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
function computeMuscuRecords() {
  const records = {}; // { "Back Squat": { oneRM: {...}, maxWeight: {...}, maxReps: {...} } }

  function ensureRecord(exercise) {
    if (!records[exercise]) {
      records[exercise] = { oneRM: null, maxWeight: null, maxReps: null };
    }
    return records[exercise];
  }

  /** Une vraie série (musculation) : alimente le 1RM, la charge max et les reps max. */
  function registerSet(exercise, set, date) {
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
    if (session.type === "musculation") {
      (session.exercises || []).forEach((entry) => {
        if (!entry || !Array.isArray(entry.sets)) return; // donnée malformée : on l'ignore sans planter
        entry.sets.forEach((set) => registerSet(entry.exercise, set, session.date));
      });
    } else if (session.type === "crossfit") {
      (session.exercises || []).forEach((entry) => {
        if (typeof entry === "object" && entry !== null && entry.reps > 0) {
          registerWeightUsage(entry.exercise, entry.weight || 0, session.date);
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
    if (!entry.weight || entry.weight <= 0) return;
    const before = recordsBefore[entry.exercise];
    const isNewRecord = !before || !before.maxWeight || entry.weight > before.maxWeight.value;
    if (isNewRecord) hits.push({ exercise: entry.exercise, value: entry.weight });
  });
  return hits;
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

/**
 * Compare les records d'AVANT et d'APRÈS l'ajout d'une séance de musculation
 * pour détecter si l'un des exercices de cette séance vient de battre un
 * record de 1RM estimé. Utilisée juste après addSession() pour afficher
 * un petit badge "Nouveau record !" à l'utilisateur.
 */
function detectMuscuNewRecords(recordsBeforeSave, newExercises, sessionDate) {
  const recordsAfterSave = computeMuscuRecords();
  const hits = [];

  newExercises.forEach((entry) => {
    const before = recordsBeforeSave[entry.exercise];
    const after = recordsAfterSave[entry.exercise];
    if (!after || !after.oneRM || after.oneRM.date !== sessionDate) return;

    const isNewRecord = !before || !before.oneRM || after.oneRM.value > before.oneRM.value;
    if (isNewRecord) {
      hits.push({ exercise: entry.exercise, value: Math.round(after.oneRM.value) });
    }
  });

  return hits;
}

/**
 * Même principe pour le CrossFit : détecte si le WOD qu'on vient d'enregistrer
 * bat le meilleur temps ou la meilleure performance précédente.
 */
function detectCfNewRecords(recordsBeforeSave, wodName, sessionDate) {
  const recordsAfterSave = computeCfRecords();
  const before = recordsBeforeSave[wodName];
  const after = recordsAfterSave[wodName];
  if (!after) return null;

  if (after.bestTime && after.bestTime.date === sessionDate) {
    const isNewRecord = !before || !before.bestTime || after.bestTime.value < before.bestTime.value;
    if (isNewRecord) return { type: "time", value: formatSecondsToTime(after.bestTime.value) };
  }

  if (after.bestPerformance && after.bestPerformance.date === sessionDate) {
    const isNewRecord = !before || !before.bestPerformance ||
      after.bestPerformance.rounds > before.bestPerformance.rounds ||
      (after.bestPerformance.rounds === before.bestPerformance.rounds && after.bestPerformance.extraReps > before.bestPerformance.extraReps);
    if (isNewRecord) {
      const extra = after.bestPerformance.extraReps ? ` + ${after.bestPerformance.extraReps}` : "";
      return { type: "performance", value: `${after.bestPerformance.rounds}${extra}` };
    }
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
    const isBW = typeof isBodyweightExercise === "function" && isBodyweightExercise(exercise);

    // On choisit la valeur la plus élevée entre l'estimation calculée et
    // la valeur saisie manuellement, en gardant toujours une trace de sa source.
    let headline;
    if (manual && (!sessionRec || !sessionRec.oneRM || manual.weight >= sessionRec.oneRM.value)) {
      headline = { value: manual.weight, source: "manual", date: manual.date };
    } else if (sessionRec && sessionRec.oneRM) {
      headline = { value: sessionRec.oneRM.value, source: "estimated", date: sessionRec.oneRM.date };
    } else {
      headline = null;
    }

    // Pour un exercice au poids du corps jamais réalisé avec un lest, un
    // "1RM à 0 kg" n'a pas de sens : on met plutôt en avant les reps max.
    const showRepsHeadline = !headline && isBW && sessionRec && sessionRec.maxReps;
    // Exercice jamais vu en musculation, seulement dans un WOD : on n'a
    // qu'une charge max utilisée, jamais de 1RM (voir note plus haut).
    const showWeightOnlyHeadline = !headline && !showRepsHeadline && sessionRec && sessionRec.maxWeight;

    const otherValueNote =
      manual && sessionRec && sessionRec.oneRM && Math.round(sessionRec.oneRM.value) !== Math.round(manual.weight)
        ? `<span>Estimé à partir des séances : ${Math.round(sessionRec.oneRM.value)} kg</span>`
        : "";

    const subLineParts = [];
    if (sessionRec && sessionRec.maxWeight && sessionRec.maxWeight.value > 0) {
      const repsText = sessionRec.maxWeight.reps ? ` × ${sessionRec.maxWeight.reps}` : "";
      const fromWod = sessionRec.maxWeight.source === "crossfit" ? " (vu en WOD)" : "";
      subLineParts.push(`<span>${isBW ? "Lest max" : "Charge max"} : ${sessionRec.maxWeight.value} kg${repsText}${fromWod}</span>`);
    }
    if (sessionRec && sessionRec.maxReps) {
      subLineParts.push(`<span>Reps max : ${sessionRec.maxReps.value}${sessionRec.maxReps.weight > 0 ? ` (à ${sessionRec.maxReps.weight} kg)` : ""}</span>`);
    }
    if (otherValueNote) subLineParts.push(otherValueNote);

    const subLines = subLineParts.length > 0
      ? `<div class="record-sub">${subLineParts.join("")}</div>`
      : `<p class="empty-text" style="margin-top:8px;">Aucune séance de musculation enregistrée pour cet exercice.</p>`;

    const manageLinks = manual
      ? `
        <div class="record-manage">
          <button type="button" class="record-link edit-1rm-link">Modifier le 1RM connu</button>
          <button type="button" class="record-link record-link-danger delete-1rm-link">Supprimer</button>
        </div>`
      : `<div class="record-manage"><button type="button" class="record-link add-1rm-link">+ Noter mon 1RM connu</button></div>`;

    let mainBlock;
    if (headline) {
      mainBlock = `
        <div class="record-main">
          <span class="record-value">${Math.round(headline.value)} <small>kg</small></span>
          <span class="record-label">${headline.source === "manual" ? "1RM connu (saisi)" : "1RM estimé*"}</span>
        </div>`;
    } else if (showRepsHeadline) {
      mainBlock = `
        <div class="record-main">
          <span class="record-value">${sessionRec.maxReps.value}</span>
          <span class="record-label">Reps max (poids de corps)</span>
        </div>`;
    } else if (showWeightOnlyHeadline) {
      mainBlock = `
        <div class="record-main">
          <span class="record-value">${sessionRec.maxWeight.value} <small>kg</small></span>
          <span class="record-label">Charge max utilisée (WOD)</span>
        </div>`;
    } else {
      mainBlock = `<div class="record-main"><span class="record-value">—</span></div>`;
    }

    const card = document.createElement("div");
    card.className = "record-card";
    card.innerHTML = `
      <span class="record-card-title">${exercise}</span>
      ${mainBlock}
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
  manual1rmDateInput.value = existingManualEntry ? existingManualEntry.date : todayLocalDateString();
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
      date: manual1rmDateInput.value || todayLocalDateString(),
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
  manualCfDateInput.value = existingManualEntry ? existingManualEntry.date : todayLocalDateString();
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
      date: manualCfDateInput.value || todayLocalDateString(),
      notes: manualCfNotesInput.value.trim(),
    });

    manualCfForm.style.display = "none";
    manualCfForm.reset();
    renderRecords();
  });
}

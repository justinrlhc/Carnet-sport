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
  "Back Squat", "Front Squat", "Overhead Squat", "Air Squat",
  "Deadlift", "Sumo Deadlift", "Romanian Deadlift",
  "Bench Press", "Incline Bench Press",
  "Strict Press", "Push Press", "Push Jerk", "Split Jerk",
  "Bent-Over Row", "Rowing barre", "Rowing haltères",
  "Barbell Lunge", "Barbell Reverse Lunge", "Walking Lunge",
  "Snatch", "Power Snatch", "Snatch Pull", "Snatch Balance",
  "Clean", "Power Clean", "Clean & Jerk", "Squat Clean", "Hang Power Clean", "Clean Pull",
  "Barbell Thruster", "Curl barre", "Curl haltères",
  "Dumbbell Bench Press", "Dumbbell Incline Bench Press", "Dumbbell Floor Press",
  "Dumbbell Shoulder Press", "Dumbbell Clean & Jerk", "Dumbbell Snatch",
  "Dumbbell Thruster", "Dumbbell Walking Lunge",
  "Pull-up", "Bar Muscle-Up", "Ring Muscle-Up", "Chest-to-Bar Pull-Up",
  "Toes-to-Bar", "Push-Up", "Handstand Push-Up", "Dips",
  "Burpee", "Burpee over the bar", "Burpee Box Jump-Over", "Box Jump", "Box Step-Up",
  "V-Up", "Sit-Up",
  "Farmer Carry", "Hip Thrust",
];

// Exercices "au poids du corps" : la charge y est facultative (on peut juste
// noter des répétitions), mais on peut quand même ajouter un lest si la
// série est réalisée avec une charge supplémentaire (ex : dips lestés).
const BODYWEIGHT_EXERCISES = [
  "Dips", "Burpee over the bar", "Pull-up", "V-Up", "Toes-to-Bar",
  "Box Jump", "Box Step-Up", "Burpee Box Jump-Over", "Sit-Up", "Air Squat",
  "Burpee", "Push-Up", "Handstand Push-Up", "Ring Muscle-Up", "Bar Muscle-Up",
  "Chest-to-Bar Pull-Up",
];

/** Un exercice au poids du corps n'exige pas de charge pour valider une série. */
function isBodyweightExercise(exerciseName) {
  return BODYWEIGHT_EXERCISES.includes(exerciseName);
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
    .flatMap((s) => (s.exercises || []).map((ex) => ex.exercise));
  return Array.from(new Set([...DEFAULT_EXERCISES, ...used])).sort();
}

/** Remplit un <select> donné avec la liste des exercices connus + option "Autre". */
function populateExerciseSelectElement(selectEl) {
  selectEl.innerHTML = "";
  getAllKnownExercises().forEach((ex) => {
    const opt = document.createElement("option");
    opt.value = ex;
    opt.textContent = ex;
    selectEl.appendChild(opt);
  });
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
  getAllKnownExercises().forEach((ex) => {
    const opt = document.createElement("option");
    opt.value = ex;
    opt.textContent = ex;
    muscuFilterSelect.appendChild(opt);
  });
}

// --------------------------------------------------------------------------
// SÉRIES DYNAMIQUES (ajouter / enlever des lignes reps x poids)
// --------------------------------------------------------------------------

function createSetRow() {
  const row = document.createElement("div");
  row.className = "set-row";
  row.innerHTML = `
    <input type="number" class="set-reps" placeholder="Répétitions" min="0">
    <span class="set-x">×</span>
    <input type="number" class="set-weight" placeholder="Poids (kg)" min="0" step="0.5">
    <button type="button" class="set-remove" title="Supprimer cette série">✕</button>
  `;
  row.querySelector(".set-remove").addEventListener("click", () => row.remove());
  return row;
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

  populateExerciseSelectElement(select);

  /** Renvoie le nom d'exercice actuellement choisi dans ce bloc (liste ou saisie libre). */
  function getBlockExerciseName() {
    return select.value === "__custom__" ? customInput.value.trim() : select.value;
  }

  /** Adapte l'indice et les placeholders "Poids" selon que l'exercice est au poids du corps ou non. */
  function updateBodyweightUI() {
    const isBW = isBodyweightExercise(getBlockExerciseName());
    hint.style.display = isBW ? "block" : "none";
    setsList.querySelectorAll(".set-weight").forEach((input) => {
      input.placeholder = isBW ? "Lest (kg, optionnel)" : "Poids (kg)";
    });
  }

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

  const blocks = [...muscuExercisesList.querySelectorAll(".exercise-block")];
  const exercises = [];

  for (const block of blocks) {
    const select = block.querySelector(".exercise-block-select");
    const customInput = block.querySelector(".exercise-block-custom");
    const isCustom = select.value === "__custom__";
    const exerciseName = isCustom ? customInput.value.trim() : select.value;

    if (!exerciseName) {
      showMuscuFeedback("Merci d'indiquer un nom pour chaque exercice de la séance.", true);
      return;
    }

    const isBW = isBodyweightExercise(exerciseName);
    const sets = [...block.querySelectorAll(".set-row")]
      .map((row) => ({
        reps: Number(row.querySelector(".set-reps").value) || 0,
        weight: Number(row.querySelector(".set-weight").value) || 0,
      }))
      // Pour un exercice au poids du corps, une série est valide dès qu'il y a
      // des répétitions — la charge (un éventuel lest) reste optionnelle.
      // Pour un exercice avec barre/haltères, on garde l'exigence habituelle.
      .filter((set) => (isBW ? set.reps > 0 : set.reps > 0 && set.weight > 0));

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
    date: muscuDateInput.value || new Date().toISOString().split("T")[0],
    exercises,
    notes: muscuNotesInput.value.trim(),
  };

  if (muscuEditingId) {
    updateSession(muscuEditingId, sessionData);
    showMuscuFeedback("Séance mise à jour !", false);
  } else {
    const recordsBefore = typeof computeMuscuRecords === "function" ? computeMuscuRecords() : {};
    addSession(sessionData);

    const newRecords = typeof detectMuscuNewRecords === "function"
      ? detectMuscuNewRecords(recordsBefore, exercises, sessionData.date)
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
  const list = newRecords.map((r) => `${r.exercise} : ${r.value} kg`).join(" · ");
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

  muscuDateInput.value = new Date().toISOString().split("T")[0];
  muscuNotesInput.value = "";

  muscuExercisesList.innerHTML = "";
  session.exercises.forEach((entry) => {
    muscuExercisesList.appendChild(createExerciseBlock(entry));
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
  session.exercises.forEach((entry) => {
    muscuExercisesList.appendChild(createExerciseBlock(entry));
  });

  muscuSubmitBtn.textContent = "Mettre à jour la séance";
  muscuCancelEditBtn.style.display = "inline-block";
}

/** Sort du mode édition et remet le formulaire à son état "ajout". */
function cancelMuscuEdit() {
  muscuEditingId = null;
  muscuDateInput.value = new Date().toISOString().split("T")[0];
  muscuNotesInput.value = "";
  resetExerciseBlocks();
  muscuSubmitBtn.textContent = "Enregistrer la séance";
  muscuCancelEditBtn.style.display = "none";
}

muscuCancelEditBtn.addEventListener("click", cancelMuscuEdit);

// --------------------------------------------------------------------------
// HISTORIQUE (liste des séances de musculation, filtrable par exercice)
// --------------------------------------------------------------------------

muscuFilterSelect.addEventListener("change", () => renderMuscuHistory());

function renderMuscuHistory() {
  const filter = muscuFilterSelect.value || "all";

  const sessions = getAllSessions()
    .filter((s) => s.type === "musculation")
    .filter((s) => filter === "all" || s.exercises.some((ex) => ex.exercise === filter))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  muscuHistoryList.innerHTML = "";

  if (sessions.length === 0) {
    muscuHistoryList.innerHTML = `<p class="empty-text">Aucune séance enregistrée pour ce filtre.</p>`;
    return;
  }

  sessions.forEach((session) => {
    const card = document.createElement("div");
    card.className = "history-card";

    const exercisesHtml = session.exercises
      .map((entry) => {
        const setsText = entry.sets
          .map((s) => (s.weight > 0 ? `${s.weight} kg × ${s.reps}` : `${s.reps} reps`))
          .join(" · ");
        return `
          <div class="history-card-exercise">
            <span class="history-card-exercise-name">${entry.exercise}</span>
            <span class="history-card-sets">${setsText}</span>
            ${entry.rpe ? `<span class="badge-rpe ${getRpeBadgeClass(entry.rpe)}">RPE ${entry.rpe}</span>` : ""}
          </div>`;
      })
      .join("");

    card.innerHTML = `
      <div class="history-card-header">
        <span class="history-card-title">Séance</span>
        <span class="history-card-date">${new Date(session.date).toLocaleDateString("fr-FR")}</span>
      </div>
      ${exercisesHtml}
      ${session.notes ? `<p class="history-card-notes">${session.notes}</p>` : ""}
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
      if (typeof renderDashboard === "function") renderDashboard();
      if (typeof renderRecords === "function") renderRecords();
    });
    muscuHistoryList.appendChild(card);
  });
}

// --------------------------------------------------------------------------
// INITIALISATION DE LA PAGE
// --------------------------------------------------------------------------

muscuDateInput.value = new Date().toISOString().split("T")[0]; // aujourd'hui par défaut
populateExerciseFilterSelect();
resetExerciseBlocks();
renderMuscuHistory();

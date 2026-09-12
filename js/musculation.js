// ==========================================================================
// musculation.js — tout ce qui concerne la page Musculation :
//   - remplir la liste déroulante d'exercices
//   - ajouter/enlever des lignes de séries dans le formulaire
//   - enregistrer une séance (via addSession, fourni par data.js)
//   - afficher l'historique, filtrable par exercice
// ==========================================================================

// Liste des exercices proposés par défaut. Le joueur peut aussi taper
// le nom d'un exercice personnalisé grâce à l'option "Autre".
const DEFAULT_EXERCISES = [
  "Back Squat",
  "Front Squat",
  "Bench Press",
  "Deadlift",
  "Overhead Press",
  "Pull-up",
  "Barbell Row",
  "Romanian Deadlift",
];

// --------------------------------------------------------------------------
// ÉLÉMENTS DU FORMULAIRE
// --------------------------------------------------------------------------

const muscuForm = document.getElementById("muscu-form");
const muscuDateInput = document.getElementById("muscu-date");
const muscuExerciseSelect = document.getElementById("muscu-exercise-select");
const muscuExerciseCustom = document.getElementById("muscu-exercise-custom");
const muscuSetsList = document.getElementById("muscu-sets-list");
const muscuAddSetBtn = document.getElementById("muscu-add-set");
const muscuRpeInput = document.getElementById("muscu-rpe");
const muscuNotesInput = document.getElementById("muscu-notes");
const muscuFeedback = document.getElementById("muscu-feedback");
const muscuFilterSelect = document.getElementById("muscu-filter-exercise");
const muscuHistoryList = document.getElementById("muscu-history-list");
const muscuSubmitBtn = document.getElementById("muscu-submit-btn");
const muscuCancelEditBtn = document.getElementById("muscu-cancel-edit");

// Quand cette variable contient un id, le formulaire est en mode "édition"
// plutôt qu'en mode "ajout" : la soumission met à jour la séance existante
// au lieu d'en créer une nouvelle.
let muscuEditingId = null;

/**
 * Renvoie la liste des exercices déjà utilisés dans l'historique,
 * fusionnée avec la liste par défaut (sans doublons).
 * Ça permet aux exercices "personnalisés" ajoutés une fois de
 * réapparaître ensuite dans les listes déroulantes.
 */
function getAllKnownExercises() {
  const used = getAllSessions()
    .filter((s) => s.type === "musculation")
    .map((s) => s.exercise);
  return Array.from(new Set([...DEFAULT_EXERCISES, ...used])).sort();
}

/**
 * Remplit une balise <select> avec la liste des exercices connus,
 * plus une option "Autre" à la fin pour en saisir un nouveau.
 */
function populateExerciseSelects() {
  const exercises = getAllKnownExercises();

  // ----- Select du formulaire -----
  muscuExerciseSelect.innerHTML = "";
  exercises.forEach((ex) => {
    const opt = document.createElement("option");
    opt.value = ex;
    opt.textContent = ex;
    muscuExerciseSelect.appendChild(opt);
  });
  const customOpt = document.createElement("option");
  customOpt.value = "__custom__";
  customOpt.textContent = "+ Autre exercice…";
  muscuExerciseSelect.appendChild(customOpt);

  // ----- Select du filtre d'historique -----
  muscuFilterSelect.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = "Tous les exercices";
  muscuFilterSelect.appendChild(allOpt);
  exercises.forEach((ex) => {
    const opt = document.createElement("option");
    opt.value = ex;
    opt.textContent = ex;
    muscuFilterSelect.appendChild(opt);
  });
}

// Affiche/cache le champ texte "Autre exercice" selon le choix du select
muscuExerciseSelect.addEventListener("change", () => {
  const isCustom = muscuExerciseSelect.value === "__custom__";
  muscuExerciseCustom.style.display = isCustom ? "block" : "none";
  if (isCustom) muscuExerciseCustom.focus();
});

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

function resetSetRows() {
  muscuSetsList.innerHTML = "";
  // On propose 3 lignes vides par défaut, un bon point de départ pour la plupart des séances
  for (let i = 0; i < 3; i++) {
    muscuSetsList.appendChild(createSetRow());
  }
}

muscuAddSetBtn.addEventListener("click", () => {
  muscuSetsList.appendChild(createSetRow());
});

// --------------------------------------------------------------------------
// SOUMISSION DU FORMULAIRE
// --------------------------------------------------------------------------

muscuForm.addEventListener("submit", (event) => {
  event.preventDefault(); // empêche la page de se recharger, comportement par défaut d'un formulaire

  // 1. Déterminer le nom de l'exercice (liste ou saisie personnalisée)
  const isCustom = muscuExerciseSelect.value === "__custom__";
  const exerciseName = isCustom
    ? muscuExerciseCustom.value.trim()
    : muscuExerciseSelect.value;

  if (!exerciseName) {
    showMuscuFeedback("Merci d'indiquer un nom d'exercice.", true);
    return;
  }

  // 2. Récupérer les séries remplies (on ignore les lignes vides)
  const sets = [...muscuSetsList.querySelectorAll(".set-row")]
    .map((row) => ({
      reps: Number(row.querySelector(".set-reps").value) || 0,
      weight: Number(row.querySelector(".set-weight").value) || 0,
    }))
    .filter((set) => set.reps > 0 && set.weight > 0);

  if (sets.length === 0) {
    showMuscuFeedback("Merci de renseigner au moins une série (répétitions et poids).", true);
    return;
  }

  // 3. Enregistrer la séance : mise à jour si on est en mode édition,
  //    sinon création d'une nouvelle séance.
  const sessionData = {
    type: "musculation",
    date: muscuDateInput.value || new Date().toISOString().split("T")[0],
    exercise: exerciseName,
    sets: sets,
    rpe: muscuRpeInput.value ? Number(muscuRpeInput.value) : null,
    notes: muscuNotesInput.value.trim(),
  };

  if (muscuEditingId) {
    updateSession(muscuEditingId, sessionData);
    showMuscuFeedback("Séance mise à jour !", false);
  } else {
    addSession(sessionData);
    showMuscuFeedback("Séance enregistrée !", false);
  }

  // 4. Réinitialiser le formulaire et rafraîchir tout ce qui dépend des données
  cancelMuscuEdit(); // remet le formulaire à zéro et sort du mode édition
  populateExerciseSelects();
  renderMuscuHistory();
  if (typeof renderDashboard === "function") renderDashboard();
  if (typeof renderHistorique === "function") renderHistorique();
});

/**
 * Remplit le formulaire avec les valeurs d'une séance existante et bascule
 * en mode édition. Appelée depuis la page Historique quand on clique
 * sur "Modifier".
 */
function startEditMuscuSession(session) {
  muscuEditingId = session.id;

  muscuDateInput.value = session.date;

  populateExerciseSelects(); // s'assure que l'exercice de la séance est bien dans la liste
  const exists = [...muscuExerciseSelect.options].some((o) => o.value === session.exercise);
  if (exists) {
    muscuExerciseSelect.value = session.exercise;
    muscuExerciseCustom.style.display = "none";
  } else {
    muscuExerciseSelect.value = "__custom__";
    muscuExerciseCustom.style.display = "block";
    muscuExerciseCustom.value = session.exercise;
  }

  muscuSetsList.innerHTML = "";
  session.sets.forEach((set) => {
    const row = createSetRow();
    row.querySelector(".set-reps").value = set.reps;
    row.querySelector(".set-weight").value = set.weight;
    muscuSetsList.appendChild(row);
  });

  muscuRpeInput.value = session.rpe || "";
  muscuNotesInput.value = session.notes || "";

  muscuSubmitBtn.textContent = "Mettre à jour la séance";
  muscuCancelEditBtn.style.display = "inline-block";
}

/** Sort du mode édition et remet le formulaire à son état "ajout". */
function cancelMuscuEdit() {
  muscuEditingId = null;
  muscuForm.reset();
  resetSetRows();
  muscuExerciseCustom.style.display = "none";
  muscuDateInput.value = new Date().toISOString().split("T")[0];
  muscuSubmitBtn.textContent = "Enregistrer la séance";
  muscuCancelEditBtn.style.display = "none";
}

muscuCancelEditBtn.addEventListener("click", cancelMuscuEdit);

function showMuscuFeedback(message, isError) {
  muscuFeedback.textContent = message;
  muscuFeedback.className = "form-feedback " + (isError ? "form-feedback-error" : "form-feedback-success");
  setTimeout(() => { muscuFeedback.textContent = ""; }, 3000);
}

// --------------------------------------------------------------------------
// HISTORIQUE (liste des séances de musculation, filtrable par exercice)
// --------------------------------------------------------------------------

muscuFilterSelect.addEventListener("change", () => renderMuscuHistory());

function renderMuscuHistory() {
  const filter = muscuFilterSelect.value || "all";

  const sessions = getAllSessions()
    .filter((s) => s.type === "musculation")
    .filter((s) => filter === "all" || s.exercise === filter)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  muscuHistoryList.innerHTML = "";

  if (sessions.length === 0) {
    muscuHistoryList.innerHTML = `<p class="empty-text">Aucune séance enregistrée pour cet exercice.</p>`;
    return;
  }

  sessions.forEach((session) => {
    const card = document.createElement("div");
    card.className = "history-card";

    const setsText = session.sets
      .map((s) => `${s.weight} kg × ${s.reps}`)
      .join(" · ");

    card.innerHTML = `
      <div class="history-card-header">
        <span class="history-card-title">${session.exercise}</span>
        <span class="history-card-date">${new Date(session.date).toLocaleDateString("fr-FR")}</span>
      </div>
      <p class="history-card-sets">${setsText}</p>
      ${session.rpe ? `<span class="badge-rpe">RPE ${session.rpe}</span>` : ""}
      ${session.notes ? `<p class="history-card-notes">${session.notes}</p>` : ""}
      <div class="history-card-actions">
        <button type="button" class="btn btn-secondary btn-small hist-edit-btn">Modifier</button>
        <button type="button" class="btn btn-secondary btn-small hist-delete-btn">Supprimer</button>
      </div>
    `;
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
populateExerciseSelects();
resetSetRows();
renderMuscuHistory();

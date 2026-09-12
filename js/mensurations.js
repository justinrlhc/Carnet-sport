// ==========================================================================
// mensurations.js — la page qui permet de noter manuellement son poids
// de corps, avec la date, et de consulter/modifier/supprimer l'historique.
//
// C'est ce qui alimente la carte "Poids actuel" du Dashboard et le
// graphique "Poids de corps" de la page Statistiques.
// ==========================================================================

const weightForm = document.getElementById("weight-form");
const weightDateInput = document.getElementById("weight-date");
const weightValueInput = document.getElementById("weight-value");
const weightFeedback = document.getElementById("weight-feedback");
const weightHistoryList = document.getElementById("weight-history-list");
const weightSubmitBtn = document.getElementById("weight-submit-btn");
const weightCancelEditBtn = document.getElementById("weight-cancel-edit");

// Quand cette variable contient un id, le formulaire est en mode édition.
let weightEditingId = null;

weightForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const date = weightDateInput.value;
  const weight = Number(weightValueInput.value);

  if (!date || !weight || weight <= 0) {
    showWeightFeedback("Merci d'indiquer une date et un poids valides.", true);
    return;
  }

  if (weightEditingId) {
    updateBodyweightEntry(weightEditingId, { date, weight });
    showWeightFeedback("Mesure mise à jour !", false);
  } else {
    addBodyweightEntry(date, weight);
    showWeightFeedback("Mesure enregistrée !", false);
  }

  cancelWeightEdit();
  renderWeightHistory();
  if (typeof renderDashboard === "function") renderDashboard();
});

function showWeightFeedback(message, isError) {
  weightFeedback.textContent = message;
  weightFeedback.className = "form-feedback " + (isError ? "form-feedback-error" : "form-feedback-success");
  setTimeout(() => { weightFeedback.textContent = ""; }, 3000);
}

function startEditWeightEntry(entry) {
  weightEditingId = entry.id;
  weightDateInput.value = entry.date;
  weightValueInput.value = entry.weight;
  weightSubmitBtn.textContent = "Mettre à jour";
  weightCancelEditBtn.style.display = "inline-block";
}

function cancelWeightEdit() {
  weightEditingId = null;
  weightForm.reset();
  weightDateInput.value = new Date().toISOString().split("T")[0];
  weightSubmitBtn.textContent = "Enregistrer";
  weightCancelEditBtn.style.display = "none";
}

weightCancelEditBtn.addEventListener("click", cancelWeightEdit);

// --------------------------------------------------------------------------
// HISTORIQUE
// --------------------------------------------------------------------------

function renderWeightHistory() {
  const entries = [...getAllBodyweightEntries()].sort((a, b) => new Date(b.date) - new Date(a.date));

  weightHistoryList.innerHTML = "";

  if (entries.length === 0) {
    weightHistoryList.innerHTML = `<p class="empty-text">Aucune mesure enregistrée pour l'instant.</p>`;
    return;
  }

  entries.forEach((entry) => {
    const card = document.createElement("div");
    card.className = "history-card";
    card.innerHTML = `
      <div class="history-card-header">
        <span class="history-card-title">${entry.weight.toString().replace(".", ",")} kg</span>
        <span class="history-card-date">${new Date(entry.date).toLocaleDateString("fr-FR")}</span>
      </div>
      <div class="history-card-actions">
        <button type="button" class="btn btn-secondary btn-small weight-edit-btn">Modifier</button>
        <button type="button" class="btn btn-secondary btn-small weight-delete-btn">Supprimer</button>
      </div>
    `;
    card.querySelector(".weight-edit-btn").addEventListener("click", () => {
      startEditWeightEntry(entry);
      document.querySelector("#section-mensurations .form-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    card.querySelector(".weight-delete-btn").addEventListener("click", () => {
      const confirmed = confirm("Supprimer définitivement cette mesure ?");
      if (!confirmed) return;
      deleteBodyweightEntry(entry.id);
      renderWeightHistory();
      if (typeof renderDashboard === "function") renderDashboard();
    });
    weightHistoryList.appendChild(card);
  });
}

// --------------------------------------------------------------------------
// INITIALISATION
// --------------------------------------------------------------------------

weightDateInput.value = new Date().toISOString().split("T")[0];
renderWeightHistory();

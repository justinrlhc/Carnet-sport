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
  if (typeof renderBmiGauge === "function") renderBmiGauge();
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
      if (typeof renderBmiGauge === "function") renderBmiGauge();
    });
    weightHistoryList.appendChild(card);
  });
}

// --------------------------------------------------------------------------
// INITIALISATION
// --------------------------------------------------------------------------

weightDateInput.value = new Date().toISOString().split("T")[0];
renderWeightHistory();

// --------------------------------------------------------------------------
// TAILLE
// --------------------------------------------------------------------------

const heightInput = document.getElementById("height-input");
const heightSaveBtn = document.getElementById("height-save-btn");

heightInput.value = getHeight() || "";

heightSaveBtn.addEventListener("click", () => {
  const value = Number(heightInput.value);
  if (!value || value <= 0) return;
  setHeight(value);
  renderBmiGauge();
  if (typeof renderDashboard === "function") renderDashboard();
});

// --------------------------------------------------------------------------
// JAUGE D'IMC (demi-cercle coloré par catégorie, avec une aiguille)
// --------------------------------------------------------------------------

// Catégories officielles de l'OMS. L'échelle visuelle est bornée à
// [BMI_SCALE_MIN, BMI_SCALE_MAX] pour que le demi-cercle reste lisible —
// une valeur au-delà est simplement affichée collée au bord.
const BMI_CATEGORIES = [
  { max: 18.5, label: "Sous-poids", color: "#5B9BD9" },
  { max: 25, label: "Poids normal", color: "#4CAF7D" },
  { max: 30, label: "Surpoids", color: "#D3A24E" },
  { max: Infinity, label: "Obésité", color: "#E1584F" },
];
const BMI_SCALE_MIN = 15;
const BMI_SCALE_MAX = 40;

function bmiCategoryFor(bmi) {
  return BMI_CATEGORIES.find((cat) => bmi < cat.max) || BMI_CATEGORIES[BMI_CATEGORIES.length - 1];
}

/** Convertit un point du cadran (angle en degrés, 180°=gauche, 0°=droite) en coordonnées x/y. */
function polarPoint(cx, cy, r, angleDeg) {
  const angleRad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy - r * Math.sin(angleRad) };
}

/** Transforme une valeur d'IMC en angle sur le cadran, en la limitant à l'échelle affichée. */
function bmiToAngle(bmi) {
  const clamped = Math.min(Math.max(bmi, BMI_SCALE_MIN), BMI_SCALE_MAX);
  const ratio = (clamped - BMI_SCALE_MIN) / (BMI_SCALE_MAX - BMI_SCALE_MIN);
  return 180 - ratio * 180;
}

/** Construit le tracé SVG d'un arc entre deux angles (sens gauche → droite, par le haut). */
function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarPoint(cx, cy, r, startAngle);
  const end = polarPoint(cx, cy, r, endAngle);
  const largeArcFlag = Math.abs(startAngle - endAngle) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

function renderBmiGauge() {
  const container = document.getElementById("bmi-gauge-container");
  if (!container) return;

  const height = getHeight();
  const weight = typeof getCurrentBodyweight === "function" ? getCurrentBodyweight() : null;

  if (height === null) {
    container.innerHTML = `<p class="empty-text">Renseigne ta taille ci-dessus pour voir ton IMC.</p>`;
    return;
  }
  if (weight === null) {
    container.innerHTML = `<p class="empty-text">Ajoute une mesure de poids pour voir ton IMC.</p>`;
    return;
  }

  const bmi = computeBmi();
  const category = bmiCategoryFor(bmi);

  // Géométrie du cadran (demi-cercle)
  const cx = 130, cy = 118, radius = 96, strokeWidth = 20;

  // Un arc coloré par catégorie, découpé selon l'échelle visuelle
  let bandsSvg = "";
  let previousBoundary = BMI_SCALE_MIN;
  BMI_CATEGORIES.forEach((cat) => {
    if (previousBoundary >= BMI_SCALE_MAX) return;
    const boundary = Math.min(cat.max, BMI_SCALE_MAX);
    const startAngle = bmiToAngle(previousBoundary);
    const endAngle = bmiToAngle(boundary);
    bandsSvg += `<path d="${describeArc(cx, cy, radius, startAngle, endAngle)}" stroke="${cat.color}" stroke-width="${strokeWidth}" fill="none"/>`;
    previousBoundary = boundary;
  });

  // L'aiguille qui pointe la valeur actuelle sur le cadran
  const needleAngle = bmiToAngle(bmi);
  const needleTip = polarPoint(cx, cy, radius - strokeWidth / 2 - 6, needleAngle);

  const gaugeSvg = `
    <svg viewBox="0 0 260 150" class="bmi-gauge-svg">
      ${bandsSvg}
      <line x1="${cx}" y1="${cy}" x2="${needleTip.x}" y2="${needleTip.y}" stroke="var(--text-primary)" stroke-width="3" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="6" fill="var(--text-primary)"/>
    </svg>
  `;

  const legendHtml = BMI_CATEGORIES
    .map((cat) => `
      <span class="bmi-legend-item">
        <span class="bmi-legend-dot" style="background:${cat.color};"></span>
        ${cat.label}
      </span>`)
    .join("");

  container.innerHTML = `
    <div class="bmi-gauge-wrapper">
      ${gaugeSvg}
      <div class="bmi-gauge-value" style="color:${category.color};">
        ${bmi.toFixed(1)}
        <span class="bmi-gauge-category">${category.label}</span>
      </div>
    </div>
    <div class="bmi-legend">${legendHtml}</div>
  `;
}

renderBmiGauge();

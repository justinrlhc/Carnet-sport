// ==========================================================================
// settings.js — export / import / réinitialisation de toutes les données.
// ==========================================================================

const btnExportData = document.getElementById("btn-export-data");
const btnImportData = document.getElementById("btn-import-data");
const importFileInput = document.getElementById("import-file-input");
const btnResetData = document.getElementById("btn-reset-data");
const settingsFeedback = document.getElementById("settings-feedback");

function showSettingsFeedback(message, isError) {
  settingsFeedback.textContent = message;
  settingsFeedback.className = "form-feedback " + (isError ? "form-feedback-error" : "form-feedback-success");
}

/**
 * Redessine toutes les pages de l'application. Utile après un import ou
 * une réinitialisation, puisque ces actions changent les données de
 * plusieurs pages à la fois, même celles qu'on ne regarde pas en ce moment.
 */
function refreshEntireApp() {
  if (typeof populateExerciseSelects === "function") populateExerciseSelects();
  if (typeof resetExerciseBlocks === "function") resetExerciseBlocks();
  if (typeof renderMuscuHistory === "function") renderMuscuHistory();

  if (typeof populateWodSelects === "function") populateWodSelects();
  if (typeof resetExerciseRows === "function") resetExerciseRows();
  if (typeof renderCfHistory === "function") renderCfHistory();

  if (typeof renderWeightHistory === "function") renderWeightHistory();
  const heightInputEl = document.getElementById("height-input");
  if (heightInputEl && typeof getHeight === "function") heightInputEl.value = getHeight() || "";
  if (typeof renderBmiGauge === "function") renderBmiGauge();
  if (typeof renderRecords === "function") renderRecords();
  if (typeof renderAllStatsCharts === "function") renderAllStatsCharts();
  if (typeof renderDashboard === "function") renderDashboard();
}

// --------------------------------------------------------------------------
// EXPORT
// --------------------------------------------------------------------------

btnExportData.addEventListener("click", () => {
  const json = exportAllData();
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const today = todayLocalDateString();
  const link = document.createElement("a");
  link.href = url;
  link.download = `carnet-sauvegarde-${today}.json`;
  link.click();

  URL.revokeObjectURL(url);
  showSettingsFeedback("Export téléchargé ! Range-le dans un endroit sûr (Drive, clé USB...).", false);
});

// --------------------------------------------------------------------------
// IMPORT
// --------------------------------------------------------------------------

btnImportData.addEventListener("click", () => {
  importFileInput.click();
});

importFileInput.addEventListener("change", () => {
  const file = importFileInput.files[0];
  if (!file) return;

  const confirmed = confirm(
    "Importer cette sauvegarde va REMPLACER toutes les données actuellement dans l'application " +
    "(séances, poids, records). Cette action est irréversible. Continuer ?"
  );
  if (!confirmed) {
    importFileInput.value = ""; // on réinitialise le champ pour pouvoir réessayer
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const result = importAllData(reader.result);
    if (result.success) {
      showSettingsFeedback("Sauvegarde importée avec succès !", false);
      refreshEntireApp();
    } else {
      showSettingsFeedback("Échec de l'import : " + result.error, true);
    }
    importFileInput.value = "";
  };
  reader.onerror = () => {
    showSettingsFeedback("Impossible de lire ce fichier.", true);
    importFileInput.value = "";
  };
  reader.readAsText(file);
});

// --------------------------------------------------------------------------
// RÉINITIALISATION
// --------------------------------------------------------------------------

btnResetData.addEventListener("click", () => {
  const confirmed = confirm(
    "Supprimer DÉFINITIVEMENT toutes tes séances, mesures de poids et records ? " +
    "Cette action est irréversible. Pense à exporter une sauvegarde avant si tu n'es pas sûr."
  );
  if (!confirmed) return;

  clearAllData();
  refreshEntireApp();
  showSettingsFeedback("Toutes les données ont été supprimées.", false);
});

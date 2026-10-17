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
  const birthYearInputEl = document.getElementById("birth-year-input");
  if (birthYearInputEl && typeof getBirthYear === "function") birthYearInputEl.value = getBirthYear() || "";
  if (typeof renderBmiGauge === "function") renderBmiGauge();
  if (typeof renderRecords === "function") renderRecords();
  if (typeof renderAllStatsCharts === "function") renderAllStatsCharts();
  // Rangs : nouvelle "photo" calculée sans annonce (pas de fenêtre "Rang
  // supérieur" juste parce qu'on vient d'importer une sauvegarde)
  if (typeof syncRanksAndAchievements === "function") syncRanksAndAchievements({ silent: true });
  if (typeof renderProfile === "function") renderProfile();
  if (typeof renderDashboard === "function") renderDashboard();
}

// --------------------------------------------------------------------------
// EXPORT
// --------------------------------------------------------------------------

/** Téléchargement classique (ordinateur, ou si le partage n'est pas possible). */
function downloadBackup(json, fileName) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showSettingsFeedback("Export téléchargé ! Range-le dans un endroit sûr (Fichiers, Drive, clé USB...).", false);
}

btnExportData.addEventListener("click", () => {
  const json = exportAllData();
  const fileName = `carnet-sauvegarde-${todayLocalDateString()}.json`;

  // Sur téléphone, on ouvre le menu de partage : sur iPhone il propose
  // "Enregistrer dans Fichiers", AirDrop, Mail... (plus fiable qu'un
  // téléchargement dans l'appli installée sur l'écran d'accueil).
  const isTouchDevice = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  if (isTouchDevice && typeof File === "function" && navigator.canShare) {
    const file = new File([json], fileName, { type: "application/json" });
    if (navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: "Sauvegarde Carnet" })
        .then(() => showSettingsFeedback("Sauvegarde partagée ! Vérifie qu'elle est bien dans Fichiers.", false))
        .catch((error) => {
          if (error && error.name === "AbortError") return; // tu as fermé le menu : rien à faire
          downloadBackup(json, fileName);
        });
      return;
    }
  }
  downloadBackup(json, fileName);
});

// --------------------------------------------------------------------------
// INSTALLATION SUR L'ÉCRAN D'ACCUEIL
// --------------------------------------------------------------------------

/** Vrai quand l'appli est ouverte depuis son icône (et non dans Safari). */
function isInstalledApp() {
  return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
}

function renderInstallPanel() {
  const container = document.getElementById("install-content");
  if (!container) return;
  if (isInstalledApp()) {
    container.innerHTML = `
      <p class="install-status"><span class="install-check" aria-hidden="true">✓</span> Appli installée</p>
      <p class="settings-text">Elle s'ouvre sans réseau et Safari n'efface pas ses données, même après plusieurs semaines sans l'ouvrir. Continue quand même d'exporter une sauvegarde de temps en temps : si tu supprimes l'icône ou changes de téléphone, les données partent avec.</p>
      <p class="form-hint">Pour avoir une nouvelle version mise en ligne : ferme complètement l'appli (balaye-la vers le haut) puis rouvre-la.</p>`;
    return;
  }
  container.innerHTML = `
    <p class="settings-text">Installe Carnet comme une vraie appli : icône sur l'écran d'accueil, plein écran, fonctionne sans réseau à la salle, et tes données ne risquent plus l'effacement automatique de Safari.</p>
    <ol class="install-steps">
      <li>Dans Safari, touche le bouton <strong>Partager</strong> <span class="install-share-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1"/></svg></span></li>
      <li>Choisis <strong>Sur l'écran d'accueil</strong> (fais défiler le menu si besoin)</li>
      <li>Touche <strong>Ajouter</strong></li>
    </ol>
    <div class="install-warning">
      <strong>Important :</strong> sur iPhone, l'appli installée a son propre espace de stockage. Tes séances ne la suivent pas toutes seules :
      <ol>
        <li>Ici, dans Safari : touche <strong>Exporter mes données</strong> ci-dessous, puis « Enregistrer dans Fichiers ».</li>
        <li>Ouvre l'appli installée → Réglages → <strong>Importer une sauvegarde</strong> → choisis ce fichier.</li>
      </ol>
    </div>`;
}

renderInstallPanel();

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
    "Supprimer DÉFINITIVEMENT toutes tes séances, mesures de poids, records, rangs et succès ? " +
    "Cette action est irréversible. Pense à exporter une sauvegarde avant si tu n'es pas sûr."
  );
  if (!confirmed) return;

  clearAllData();
  refreshEntireApp();
  showSettingsFeedback("Toutes les données ont été supprimées.", false);
});

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
  renderSexChoice(document.getElementById("settings-sex-choice"), getSex());
  renderBackupStatus();
  renderBackupReminder();
}

// --------------------------------------------------------------------------
// TON PROFIL : barèmes hommes / femmes
// --------------------------------------------------------------------------

/** Allume le bon bouton d'un groupe Homme / Femme. */
function renderSexChoice(group, sex) {
  if (!group) return;
  group.querySelectorAll("button[data-sex]").forEach((button) => {
    const selected = button.dataset.sex === sex;
    button.classList.toggle("on", selected);
    button.setAttribute("aria-checked", selected ? "true" : "false");
  });
}

const settingsSexChoice = document.getElementById("settings-sex-choice");
if (settingsSexChoice) {
  renderSexChoice(settingsSexChoice, getSex());
  settingsSexChoice.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-sex]");
    if (!button) return;
    const sex = button.dataset.sex === "female" ? "female" : "male";
    const feedback = document.getElementById("sex-feedback");
    if (sex === getSex()) return;
    setSex(sex);
    renderSexChoice(settingsSexChoice, sex);
    // Recalcul sans fenêtre "Rang supérieur" : rien n'a été soulevé de plus
    if (typeof syncRanksAndAchievements === "function") syncRanksAndAchievements({ silent: true });
    if (typeof renderProfile === "function") renderProfile();
    if (typeof renderDashboard === "function") renderDashboard();
    if (feedback) {
      feedback.textContent = sex === "female"
        ? "Barèmes femmes appliqués : rangs et succès recalculés."
        : "Barèmes hommes appliqués : rangs et succès recalculés.";
      feedback.className = "form-feedback form-feedback-success";
    }
  });
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
  onBackupExported();
  showSettingsFeedback("Export téléchargé ! Range-le dans un endroit sûr (Fichiers, Drive, clé USB...).", false);
}

// --------------------------------------------------------------------------
// DERNIÈRE SAUVEGARDE ET RAPPEL
// --------------------------------------------------------------------------

/** "aujourd'hui", "hier", "il y a 23 jours". */
function describeDaysAgo(days) {
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  return `il y a ${days} jours`;
}

/** Ligne "Dernière sauvegarde : …" dans Réglages (en orange quand elle est trop ancienne). */
function renderBackupStatus() {
  const el = document.getElementById("backup-status");
  if (!el) return;
  const last = getLastExportDate();
  if (!last) {
    el.textContent = hasAnyUserData() ? "Dernière sauvegarde : aucune enregistrée depuis cette appli" : "";
  } else {
    el.textContent = `Dernière sauvegarde : ${describeDaysAgo(daysSinceDate(last))} (${parseLocalDate(last).toLocaleDateString("fr-FR")})`;
  }
  const overdue = hasAnyUserData() && (!last || daysSinceDate(last) >= BACKUP_REMINDER_DAYS);
  el.classList.toggle("is-overdue", overdue);
}

/** Petit rappel sur le tableau de bord quand la dernière sauvegarde a plus de 30 jours. */
function renderBackupReminder() {
  const el = document.getElementById("backup-reminder");
  if (!el) return;
  const state = getBackupReminderState();
  if (!state.due) {
    el.style.display = "none";
    el.innerHTML = "";
    return;
  }
  const message = state.days === null
    ? "Aucune sauvegarde enregistrée depuis cette appli : tes séances ne sont que sur ce téléphone."
    : `Ta dernière sauvegarde date de ${state.days} jours. Exporte-la pour ne rien perdre.`;
  el.innerHTML = `
    <p class="backup-reminder-text"><strong>Pense à ta sauvegarde</strong>${escapeHtml(message)}</p>
    <div class="backup-reminder-actions">
      <button type="button" class="btn btn-primary btn-small" data-backup-action="export">Exporter maintenant</button>
      <button type="button" class="btn btn-secondary btn-small" data-backup-action="later">Plus tard</button>
    </div>`;
  el.style.display = "";
}

/** Après un export réussi : on note la date et on retire le rappel. */
function onBackupExported() {
  markBackupExported();
  renderBackupStatus();
  renderBackupReminder();
}

const backupReminderEl = document.getElementById("backup-reminder");
if (backupReminderEl) {
  backupReminderEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-backup-action]");
    if (!button) return;
    if (button.dataset.backupAction === "later") {
      snoozeBackupReminder(7);
      renderBackupReminder();
    } else {
      // Même export que dans Réglages (le menu de partage s'ouvre directement)
      btnExportData.click();
    }
  });
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
        .then(() => {
          onBackupExported();
          showSettingsFeedback("Sauvegarde partagée ! Vérifie qu'elle est bien dans Fichiers.", false);
        })
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
// VERSION DE L'APPLI
// --------------------------------------------------------------------------

function renderVersionPanel() {
  const label = document.getElementById("app-version-label");
  if (label) label.textContent = typeof APP_VERSION !== "undefined" && APP_VERSION ? `Version ${APP_VERSION}` : "Version locale";
}

const btnCheckUpdate = document.getElementById("btn-check-update");
if (btnCheckUpdate) {
  btnCheckUpdate.addEventListener("click", () => {
    if (typeof checkForUpdate === "function") checkForUpdate(true);
  });
}

// --------------------------------------------------------------------------
// IMPORT
// --------------------------------------------------------------------------

btnImportData.addEventListener("click", () => {
  importFileInput.click();
});

importFileInput.addEventListener("change", () => {
  const file = importFileInput.files[0];
  if (!file) return;

  // Depuis l'accueil, l'appli est vide : rien à écraser, pas besoin de prévenir
  const fromOnboarding = isOnboardingVisible();
  const confirmed = fromOnboarding || confirm(
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
      const skippedText = result.skipped > 0
        ? ` ${result.skipped} élément${result.skipped > 1 ? "s" : ""} illisible${result.skipped > 1 ? "s" : ""} mis de côté.`
        : "";
      showSettingsFeedback("Sauvegarde importée avec succès !" + skippedText, false);
      if (fromOnboarding) {
        markOnboardingDone();
        hideOnboarding();
      }
      refreshEntireApp();
    } else if (fromOnboarding) {
      showOnboardingImportError("Échec de l'import : " + result.error);
    } else {
      showSettingsFeedback("Échec de l'import : " + result.error, true);
    }
    importFileInput.value = "";
  };
  reader.onerror = () => {
    if (fromOnboarding) showOnboardingImportError("Impossible de lire ce fichier.");
    else showSettingsFeedback("Impossible de lire ce fichier.", true);
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

// --------------------------------------------------------------------------
// ACCUEIL DU PREMIER LANCEMENT (3 écrans : bienvenue, profil, prêt)
// Ne s'affiche que sur une appli vide qui ne l'a jamais montré (data.js
// pose le drapeau d'office chez les personnes qui ont déjà des données).
// --------------------------------------------------------------------------

const ONBOARDING_SCREEN_IDS = ["onboarding-1", "onboarding-2", "onboarding-3"];
let onboardingSex = getSex();

function isOnboardingVisible() {
  return ONBOARDING_SCREEN_IDS.some((id) => {
    const el = document.getElementById(id);
    return el && el.classList.contains("is-visible");
  });
}

function showOnboardingScreen(index) {
  ONBOARDING_SCREEN_IDS.forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("is-visible", i === index);
    if (i === index) el.scrollTop = 0;
  });
  document.body.classList.add("ob-open");
}

function hideOnboarding() {
  ONBOARDING_SCREEN_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("is-visible");
  });
  document.body.classList.remove("ob-open");
}

function showOnboardingImportError(message) {
  const el = document.getElementById("ob-import-feedback");
  if (!el) return;
  el.textContent = message;
  el.className = "form-feedback form-feedback-error";
}

function finishOnboarding() {
  markOnboardingDone();
  hideOnboarding();
  refreshEntireApp();
  window.scrollTo(0, 0);
}

/** Lit un nombre écrit à la française ("70,5") ; null si vide, NaN si illisible. */
function readOnboardingNumber(id) {
  const el = document.getElementById(id);
  const raw = el ? el.value.trim().replace(",", ".") : "";
  if (!raw) return null;
  return Number(raw);
}

/** Vérifie puis enregistre les infos de l'écran 2. Renvoie false si une valeur est fausse. */
function saveOnboardingProfile() {
  const feedback = document.getElementById("ob-profile-feedback");
  const currentYear = new Date().getFullYear();
  const birthYear = readOnboardingNumber("ob-birth-year");
  const weight = readOnboardingNumber("ob-weight");
  const height = readOnboardingNumber("ob-height");

  let error = "";
  if (birthYear !== null && (!Number.isInteger(birthYear) || birthYear < 1930 || birthYear > currentYear - 10)) {
    error = `Année de naissance entre 1930 et ${currentYear - 10}, s'il te plaît.`;
  } else if (weight !== null && (!Number.isFinite(weight) || weight < 25 || weight > 300)) {
    error = "Indique un poids entre 25 et 300 kg.";
  } else if (height !== null && (!Number.isFinite(height) || height < 100 || height > 250)) {
    error = "Indique une taille entre 100 et 250 cm.";
  }
  if (feedback) feedback.textContent = error;
  if (error) return false;

  setSex(onboardingSex);
  if (birthYear !== null) setBirthYear(birthYear);
  if (weight !== null) addBodyweightEntry(todayLocalDateString(), Math.round(weight * 10) / 10);
  if (height !== null) setHeight(Math.round(height));
  return true;
}

function renderOnboardingInstallTip() {
  const tip = document.getElementById("ob-install-tip");
  if (tip && isInstalledApp()) {
    tip.innerHTML = "<b>L'appli est installée</b> : elle s'ouvre en plein écran depuis ton écran d'accueil, même sans réseau à la salle.";
  }
}

function setupOnboarding() {
  const first = document.getElementById("onboarding-1");
  if (!first) return;

  const on = (id, handler) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", handler);
  };
  on("ob-start", () => showOnboardingScreen(1));
  on("ob-import", () => {
    showOnboardingImportError("");
    importFileInput.click();
  });
  on("ob-profile-next", () => {
    if (saveOnboardingProfile()) showOnboardingScreen(2);
  });
  on("ob-profile-skip", () => {
    const feedback = document.getElementById("ob-profile-feedback");
    if (feedback) feedback.textContent = "";
    showOnboardingScreen(2);
  });
  on("ob-finish", finishOnboarding);

  const sexGroup = document.getElementById("ob-sex-choice");
  renderSexChoice(sexGroup, onboardingSex);
  if (sexGroup) {
    sexGroup.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-sex]");
      if (!button) return;
      onboardingSex = button.dataset.sex === "female" ? "female" : "male";
      renderSexChoice(sexGroup, onboardingSex);
    });
  }

  renderOnboardingInstallTip();
  if (!isOnboardingDone() && !hasAnyUserData()) showOnboardingScreen(0);
}

setupOnboarding();

// État de la sauvegarde au démarrage (Réglages + rappel du tableau de bord)
renderBackupStatus();
renderBackupReminder();

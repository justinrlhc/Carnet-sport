// ==========================================================================
// app.js — le "chef d'orchestre" de l'application.
// Rôle :
//   1. Gérer la navigation entre les sections (comme à l'étape 1).
//   2. Charger les données (via data.js) et remplir le tableau de bord.
// ==========================================================================

// --------------------------------------------------------------------------
// 1. NAVIGATION (inchangé depuis l'étape 1)
// --------------------------------------------------------------------------

const navItems = document.querySelectorAll(".nav-item");
const pageTitle = document.getElementById("page-title");

const titles = {
  dashboard: "Tableau de bord",
  profil: "Profil",
  musculation: "Musculation",
  crossfit: "CrossFit",
  mensurations: "Mensurations",
  records: "Records personnels",
  statistiques: "Statistiques",
  reglages: "Réglages",
};

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    const targetId = item.dataset.section;
    goToSection(targetId);
  });
});

/**
 * Affiche une section donnée et rafraîchit ses données si nécessaire.
 * Centralisé ici pour être réutilisable par le menu ET par la fenêtre
 * de choix "Nouvelle séance".
 */
function goToSection(targetId) {
  navItems.forEach((el) => el.classList.toggle("is-active", el.dataset.section === targetId));

  document.querySelectorAll(".section").forEach((section) => {
    section.classList.remove("is-active");
  });
  document.getElementById(`section-${targetId}`).classList.add("is-active");

  pageTitle.textContent = titles[targetId];
  revealActiveNavItem();

  // On rafraîchit la page avec les données les plus récentes à chaque visite
  if (targetId === "dashboard") renderDashboard();
  if (targetId === "profil" && typeof renderProfile === "function") renderProfile();
  if (targetId === "musculation" && typeof renderMuscuHistory === "function") renderMuscuHistory();
  if (targetId === "crossfit" && typeof renderCfHistory === "function") renderCfHistory();
  if (targetId === "mensurations" && typeof renderWeightHistory === "function") {
    renderWeightHistory();
    if (typeof renderBmiGauge === "function") renderBmiGauge();
  }
  if (targetId === "records" && typeof renderRecords === "function") renderRecords();
  if (targetId === "statistiques" && typeof renderAllStatsCharts === "function") renderAllStatsCharts();
}

/**
 * Sur mobile, le menu est une rangée d'icônes qui défile de côté : on fait
 * glisser l'onglet actif au centre pour qu'il soit toujours visible.
 */
function revealActiveNavItem() {
  const nav = document.querySelector(".nav");
  const active = document.querySelector(".nav-item.is-active");
  if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
  // .nav est en position: relative (style.css), donc offsetLeft se mesure depuis le début du menu
  const target = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  try { nav.scrollTo({ left: Math.max(0, target), behavior: "smooth" }); } catch { nav.scrollLeft = Math.max(0, target); }
}

// --------------------------------------------------------------------------
// FENÊTRE "NOUVELLE SÉANCE" (choix Musculation / CrossFit)
// --------------------------------------------------------------------------

const addSessionModal = document.getElementById("add-session-modal");

document.getElementById("btn-add-session").addEventListener("click", () => {
  addSessionModal.classList.add("is-visible");
});

document.getElementById("modal-cancel-btn").addEventListener("click", () => {
  addSessionModal.classList.remove("is-visible");
});

// Cliquer en dehors de la fenêtre (sur le fond assombri) la referme aussi
addSessionModal.addEventListener("click", (event) => {
  if (event.target === addSessionModal) addSessionModal.classList.remove("is-visible");
});

document.querySelectorAll(".modal-choice").forEach((button) => {
  button.addEventListener("click", () => {
    const choice = button.dataset.choice; // "musculation" ou "crossfit"
    addSessionModal.classList.remove("is-visible");
    goToSection(choice);
  });
});

// --------------------------------------------------------------------------
// 2. CALCULS SIMPLES POUR LE DASHBOARD
// (des calculs plus avancés — 1RM, vrais records — arriveront à l'étape 6)
// --------------------------------------------------------------------------

// (computeSessionVolume et isWithinLastDays sont maintenant définies dans stats.js,
// chargé avant ce fichier, pour pouvoir être réutilisées par les graphiques aussi)

function renderDashboard() {
  // Rappel de sauvegarde (settings.js), en haut du tableau de bord
  if (typeof renderBackupReminder === "function") renderBackupReminder();

  const sessions = getAllSessions();
  const bodyweightEntries = getAllBodyweightEntries();

  // ----- Poids actuel -----
  const weightEl = document.getElementById("stat-weight");
  const weightTrendEl = document.getElementById("stat-weight-trend");

  if (bodyweightEntries.length > 0) {
    const latest = bodyweightEntries[bodyweightEntries.length - 1];
    weightEl.innerHTML = `${formatNumberFr(latest.weight, 1)} <small>kg</small>`;

    // On compare à la mesure la plus ancienne dont on dispose (approx. "récemment")
    const oldest = bodyweightEntries[0];
    const diff = Number((latest.weight - oldest.weight).toFixed(1));
    if (diff !== 0) {
      const sign = diff > 0 ? "+" : "";
      weightTrendEl.textContent = `${sign}${diff.toString().replace(".", ",")} kg récemment`;
      weightTrendEl.className = "stat-trend " + (diff > 0 ? "stat-trend-up" : "stat-trend-down");
    } else {
      weightTrendEl.textContent = "Stable";
      weightTrendEl.className = "stat-trend";
    }
  } else {
    weightEl.textContent = "—";
    weightTrendEl.textContent = "Aucune mesure";
  }

  // ----- Séances cette semaine -----
  const weekStart = getWeekStartDate(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const sessionsThisWeek = sessions.filter((s) => {
    const d = parseLocalDate(s.date);
    return d >= weekStart && d <= weekEnd;
  });
  document.getElementById("stat-sessions").textContent = sessionsThisWeek.length;
  document.getElementById("stat-sessions-trend").textContent =
    sessionsThisWeek.length > 0 ? "Continue comme ça" : "Aucune séance encore";

  // ----- Volume d'entraînement (cette semaine) -----
  // Arrondi au kilo : le poids de corps (ex : 55,2 kg) donne sinon des décimales inutiles
  const weeklyVolume = Math.round(sessionsThisWeek.reduce((total, s) => total + computeSessionVolume(s), 0));
  document.getElementById("stat-volume").innerHTML =
    `${weeklyVolume.toLocaleString("fr-FR")} <small>kg</small>`;

  // ----- Records battus ce mois-ci -----
  // Records d'avant le 1er du mois comparés à ceux d'aujourd'hui (stats.js).
  const now = new Date();
  const monthStart = toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
  const beaten = typeof countRecordsBeatenSince === "function" ? countRecordsBeatenSince(monthStart) : 0;
  document.getElementById("stat-pr").textContent = beaten;
  document.getElementById("stat-pr-trend").textContent = beaten > 0 ? "ce mois-ci" : "ce mois-ci, pour l'instant";

  // ----- Dernières séances -----
  // ----- Prochain palier (rangs, voir ranks.js) -----
  if (typeof renderNextMilestoneCard === "function") renderNextMilestoneCard();

  const recentList = document.getElementById("recent-sessions-list");
  recentList.innerHTML = "";

  const sorted = [...sessions].sort((a, b) => new Date(b.date) - new Date(a.date));
  const recent = sorted.slice(0, 5);

  if (recent.length === 0) {
    recentList.innerHTML = `<li class="session-row"><span class="session-meta">Aucune séance enregistrée pour l'instant.</span></li>`;
    if (typeof renderDashboardChart === "function") renderDashboardChart();
    return;
  }

  recent.forEach((session) => {
    const li = document.createElement("li");
    li.className = "session-row";

    const isMuscu = session.type === "musculation";
    const tagClass = isMuscu ? "session-tag-muscu" : "session-tag-cf";
    const tagLabel = isMuscu ? "Muscu" : "CrossFit";
    const name = isMuscu ? (session.exercises || []).map((ex) => ex.exercise).join(", ") : session.wodName;

    li.innerHTML = `
      <span class="session-tag ${tagClass}">${tagLabel}</span>
      <span class="session-name">${escapeHtml(name)}</span>
      <span class="session-meta">${formatRelativeDate(session.date)}</span>
    `;
    recentList.appendChild(li);
  });

  if (typeof renderDashboardChart === "function") renderDashboardChart();
}

// Carte "Records battus" : un toucher ouvre le fil des derniers records
const statPrCard = document.getElementById("stat-pr-card");
if (statPrCard) {
  const openRecordFeed = () => {
    goToSection("records");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  statPrCard.addEventListener("click", openRecordFeed);
  statPrCard.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openRecordFeed(); }
  });
}

// Transforme "2026-09-10" en "Aujourd'hui", "Hier", ou "Il y a X jours"
function formatRelativeDate(dateStr) {
  const date = new Date(dateStr);
  const today = new Date();
  date.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.round((today - date) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  if (diffDays > 1) return `Il y a ${diffDays} jours`;
  return date.toLocaleDateString("fr-FR");
}

// --------------------------------------------------------------------------
// 3. DÉMARRAGE DE L'APPLICATION
// --------------------------------------------------------------------------

renderDashboard();
// Lignes "Dernière fois" du formulaire de musculation : les records sont
// calculés par stats.js, chargé après musculation.js
if (typeof refreshExerciseLastSeen === "function") refreshExerciseLastSeen();

// --------------------------------------------------------------------------
// 4. MODE HORS LIGNE ET INSTALLATION
// Le service worker (sw.js) garde une copie de l'appli sur l'appareil pour
// qu'elle s'ouvre sans réseau. Il ne fonctionne qu'une fois en ligne
// (https), pas en ouvrant le fichier index.html directement.
// --------------------------------------------------------------------------

const IS_ONLINE_SITE = location.protocol === "https:" || location.hostname === "localhost";

if ("serviceWorker" in navigator && IS_ONLINE_SITE) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("Mode hors ligne indisponible :", error));
  });
}

// --------------------------------------------------------------------------
// 5. MISES À JOUR
// Le numéro de version est celui des liens "?v=13" de index.html (une seule
// source, rien d'autre à modifier à chaque version). L'appli compare sa
// version à celle en ligne au démarrage et chaque fois qu'on y revient
// (l'iPhone garde souvent l'appli en mémoire sans la recharger), puis
// propose de se mettre à jour d'un toucher.
// --------------------------------------------------------------------------

const APP_VERSION = (() => {
  const script = document.querySelector('script[src*="js/app.js"]');
  if (!script) return null;
  return new URL(script.getAttribute("src"), location.href).searchParams.get("v");
})();

let lastUpdateCheck = 0;

/** Va lire la version en ligne. Renvoie le numéro, ou null (hors ligne, fichier ouvert en local...). */
async function fetchOnlineVersion() {
  if (!APP_VERSION || !IS_ONLINE_SITE || navigator.onLine === false) return null;
  try {
    const response = await fetch(`./index.html?check=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    const match = (await response.text()).match(/js\/app\.js\?v=(\d+)/);
    return match ? match[1] : null;
  } catch (error) {
    return null; // pas de réseau : on réessaiera plus tard
  }
}

async function checkForUpdate(fromButton) {
  const now = Date.now();
  if (!fromButton && now - lastUpdateCheck < 60 * 1000) return; // au plus une fois par minute
  lastUpdateCheck = now;
  const online = await fetchOnlineVersion();
  if (online && online !== APP_VERSION) {
    showUpdateBanner(online);
  } else if (fromButton && typeof showSettingsFeedback === "function") {
    showSettingsFeedback(online ? `Tu as déjà la dernière version (version ${APP_VERSION}).` : "Impossible de vérifier : pas de connexion.", !online);
  }
}

/** Recharge l'appli sur la nouvelle version (le service worker récupère d'abord les nouveaux fichiers). */
async function applyUpdate() {
  try {
    const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (registration) await registration.update();
  } catch (error) { /* on recharge quand même */ }
  location.reload();
}

function showUpdateBanner(onlineVersion) {
  if (document.getElementById("update-banner")) return;
  const banner = document.createElement("div");
  banner.id = "update-banner";
  banner.className = "update-banner";
  banner.setAttribute("role", "status");
  banner.innerHTML = `
    <span>Nouvelle version disponible <small>(version ${escapeHtml(onlineVersion)})</small></span>
    <button type="button" class="btn btn-primary btn-small">Mettre à jour</button>`;
  banner.querySelector("button").addEventListener("click", applyUpdate);
  document.body.appendChild(banner);
}

if (APP_VERSION && IS_ONLINE_SITE) {
  window.addEventListener("load", () => setTimeout(() => checkForUpdate(false), 1500));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate(false);
  });
}

// On demande au navigateur de ne jamais effacer les données de l'appli
// d'office (il peut refuser ; l'appli installée est de toute façon protégée).
if (navigator.storage && typeof navigator.storage.persist === "function") {
  navigator.storage.persist().catch(() => {});
}

// Affiche le numéro de version dans Réglages (settings.js est chargé avant ce fichier)
if (typeof renderVersionPanel === "function") renderVersionPanel();

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

  // On rafraîchit la page avec les données les plus récentes à chaque visite
  if (targetId === "dashboard") renderDashboard();
  if (targetId === "musculation" && typeof renderMuscuHistory === "function") renderMuscuHistory();
  if (targetId === "crossfit" && typeof renderCfHistory === "function") renderCfHistory();
  if (targetId === "mensurations" && typeof renderWeightHistory === "function") {
    renderWeightHistory();
    if (typeof renderBmiGauge === "function") renderBmiGauge();
  }
  if (targetId === "records" && typeof renderRecords === "function") renderRecords();
  if (targetId === "statistiques" && typeof renderAllStatsCharts === "function") renderAllStatsCharts();
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
  const sessions = getAllSessions();
  const bodyweightEntries = getAllBodyweightEntries();

  // ----- Poids actuel -----
  const weightEl = document.getElementById("stat-weight");
  const weightTrendEl = document.getElementById("stat-weight-trend");

  if (bodyweightEntries.length > 0) {
    const latest = bodyweightEntries[bodyweightEntries.length - 1];
    weightEl.innerHTML = `${latest.weight.toString().replace(".", ",")} <small>kg</small>`;

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
  const weeklyVolume = sessionsThisWeek.reduce((total, s) => total + computeSessionVolume(s), 0);
  document.getElementById("stat-volume").innerHTML =
    `${weeklyVolume.toLocaleString("fr-FR")} <small>kg</small>`;

  // ----- Records personnels (version simple pour l'instant) -----
  // Ici on compte juste le nombre d'exercices différents pratiqués comme
  // approximation temporaire. Le vrai calcul de PR (1RM estimé, etc.)
  // se trouve sur la page Records, qui utilise cette même fonction.
  const exerciseCount = typeof computeMuscuRecords === "function" ? Object.keys(computeMuscuRecords()).length : 0;
  document.getElementById("stat-pr").textContent = exerciseCount;

  // ----- Dernières séances -----
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
    const name = isMuscu ? session.exercises.map((ex) => ex.exercise).join(", ") : session.wodName;

    li.innerHTML = `
      <span class="session-tag ${tagClass}">${tagLabel}</span>
      <span class="session-name">${name}</span>
      <span class="session-meta">${formatRelativeDate(session.date)}</span>
    `;
    recentList.appendChild(li);
  });

  if (typeof renderDashboardChart === "function") renderDashboardChart();
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

renderDashboard(); // ensureDemoData() a déjà été exécuté par data.js, avant ce fichier

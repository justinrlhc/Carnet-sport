// ==========================================================================
// charts.js — dessine tous les graphiques de l'application avec Chart.js,
// une bibliothèque toute faite pour créer des graphiques propres sans
// avoir à tout coder à la main.
//
// Petit point important : un graphique Chart.js est "accroché" à une
// balise <canvas>. Si on veut redessiner un graphique (par exemple parce
// que l'utilisateur vient d'ajouter une séance), il faut d'abord DÉTRUIRE
// l'ancien graphique avec .destroy(), sinon Chart.js refuse de redessiner
// sur le même canvas. C'est pour ça qu'on garde une variable par graphique.
// ==========================================================================

// Couleurs communes, cohérentes avec le thème sombre de l'application
const CHART_COLORS = {
  text: "#90949B",
  grid: "rgba(255, 255, 255, 0.06)",
  accent: "#D3A24E",
  accentFill: "rgba(211, 162, 78, 0.15)",
  success: "#4CAF7D",
};

/** Options communes à tous les graphiques (couleurs des axes, légende...). */
function getBaseChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: CHART_COLORS.text } },
    },
    scales: {
      x: {
        ticks: { color: CHART_COLORS.text },
        grid: { color: CHART_COLORS.grid },
      },
      y: {
        ticks: { color: CHART_COLORS.text },
        grid: { color: CHART_COLORS.grid },
      },
    },
  };
}

// --------------------------------------------------------------------------
// DÉCOUPAGE PAR SEMAINE (utilisé par plusieurs graphiques)
// --------------------------------------------------------------------------

/** Renvoie le lundi de la semaine d'une date donnée. */
function getWeekStartDate(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = dimanche, 1 = lundi, ...
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Construit les nbWeeks dernières semaines (de la plus ancienne à la plus récente). */
function buildWeeklyBuckets(nbWeeks) {
  const buckets = [];
  const currentWeekStart = getWeekStartDate(new Date());

  for (let i = nbWeeks - 1; i >= 0; i--) {
    const start = new Date(currentWeekStart);
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    buckets.push({
      start,
      end,
      label: `${start.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} → ${end.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}`,
    });
  }
  return buckets;
}

function computeWeeklyVolumeSeries(nbWeeks) {
  const sessions = getAllSessions().filter((s) => s.type === "musculation");
  return buildWeeklyBuckets(nbWeeks).map(({ start, end }) =>
    sessions
      .filter((s) => { const d = new Date(s.date); return d >= start && d <= end; })
      .reduce((total, s) => total + computeSessionVolume(s), 0)
  );
}

function computeWeeklySessionsSeries(nbWeeks) {
  const sessions = getAllSessions();
  return buildWeeklyBuckets(nbWeeks).map(({ start, end }) =>
    sessions.filter((s) => { const d = new Date(s.date); return d >= start && d <= end; }).length
  );
}

// --------------------------------------------------------------------------
// GRAPHIQUE DU DASHBOARD (mini aperçu du volume des dernières semaines)
// --------------------------------------------------------------------------

let dashboardChartInstance = null;

function renderDashboardChart() {
  const canvas = document.getElementById("chart-dashboard-recent");
  if (!canvas) return;

  const buckets = buildWeeklyBuckets(6);
  const volumes = computeWeeklyVolumeSeries(6);

  if (dashboardChartInstance) dashboardChartInstance.destroy();
  dashboardChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels: buckets.map((b) => b.label),
      datasets: [{ label: "Volume (kg)", data: volumes, backgroundColor: CHART_COLORS.accent, borderRadius: 4 }],
    },
    options: { ...getBaseChartOptions(), plugins: { legend: { display: false } } },
  });
}

// --------------------------------------------------------------------------
// GRAPHIQUE : POIDS DE CORPS
// --------------------------------------------------------------------------

let bodyweightChartInstance = null;

function renderBodyweightChart() {
  const canvas = document.getElementById("chart-bodyweight");
  if (!canvas) return;

  const entries = getAllBodyweightEntries();

  if (bodyweightChartInstance) bodyweightChartInstance.destroy();
  bodyweightChartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels: entries.map((e) => new Date(e.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })),
      datasets: [{
        label: "Poids (kg)",
        data: entries.map((e) => e.weight),
        borderColor: CHART_COLORS.accent,
        backgroundColor: CHART_COLORS.accentFill,
        fill: true,
        tension: 0.3,
      }],
    },
    options: { ...getBaseChartOptions(), plugins: { legend: { display: false } } },
  });
}

// --------------------------------------------------------------------------
// GRAPHIQUE : PROGRESSION D'UN EXERCICE (1RM estimé au fil du temps)
// --------------------------------------------------------------------------

let exerciseChartInstance = null;

function populateStatsExerciseSelect() {
  const select = document.getElementById("stats-exercise-select");
  if (!select) return;

  const exercises = Object.keys(computeMuscuRecords()).sort();
  const previousValue = select.value;
  select.innerHTML = "";
  exercises.forEach((ex) => {
    const opt = document.createElement("option");
    opt.value = ex;
    opt.textContent = ex;
    select.appendChild(opt);
  });
  if (exercises.includes(previousValue)) select.value = previousValue;
}

function renderExerciseChart() {
  const canvas = document.getElementById("chart-exercise");
  const select = document.getElementById("stats-exercise-select");
  if (!canvas || !select || !select.value) return;

  const sessions = getAllSessions()
    .filter((s) => s.type === "musculation" && s.exercise === select.value)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const labels = sessions.map((s) => new Date(s.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }));
  const data = sessions.map((s) => Math.round(Math.max(...s.sets.map((set) => estimateOneRepMax(set.weight, set.reps)))));

  if (exerciseChartInstance) exerciseChartInstance.destroy();
  exerciseChartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: `1RM estimé — ${select.value} (kg)`,
        data,
        borderColor: CHART_COLORS.success,
        backgroundColor: "rgba(76, 175, 125, 0.15)",
        fill: true,
        tension: 0.3,
      }],
    },
    options: getBaseChartOptions(),
  });
}

document.addEventListener("change", (event) => {
  if (event.target.id === "stats-exercise-select") renderExerciseChart();
});

// --------------------------------------------------------------------------
// GRAPHIQUES : VOLUME PAR SEMAINE / SÉANCES PAR SEMAINE
// --------------------------------------------------------------------------

let volumeChartInstance = null;
let sessionsChartInstance = null;

function renderVolumeChart() {
  const canvas = document.getElementById("chart-volume");
  if (!canvas) return;

  const buckets = buildWeeklyBuckets(10);
  const volumes = computeWeeklyVolumeSeries(10);

  if (volumeChartInstance) volumeChartInstance.destroy();
  volumeChartInstance = new Chart(canvas, {
    type: "bar",
    data: { labels: buckets.map((b) => b.label), datasets: [{ label: "Volume (kg)", data: volumes, backgroundColor: CHART_COLORS.accent, borderRadius: 4 }] },
    options: { ...getBaseChartOptions(), plugins: { legend: { display: false } } },
  });
}

function renderSessionsChart() {
  const canvas = document.getElementById("chart-sessions");
  if (!canvas) return;

  const buckets = buildWeeklyBuckets(10);
  const counts = computeWeeklySessionsSeries(10);

  if (sessionsChartInstance) sessionsChartInstance.destroy();
  sessionsChartInstance = new Chart(canvas, {
    type: "bar",
    data: { labels: buckets.map((b) => b.label), datasets: [{ label: "Séances", data: counts, backgroundColor: CHART_COLORS.success, borderRadius: 4 }] },
    options: { ...getBaseChartOptions(), plugins: { legend: { display: false } }, scales: { ...getBaseChartOptions().scales, y: { ...getBaseChartOptions().scales.y, ticks: { color: CHART_COLORS.text, stepSize: 1 } } } },
  });
}

// --------------------------------------------------------------------------
// GRAPHIQUE : PROGRESSION SUR UN WOD (temps ou rounds selon le type de WOD)
// --------------------------------------------------------------------------

let wodChartInstance = null;

function populateStatsWodSelect() {
  const select = document.getElementById("stats-wod-select");
  if (!select) return;

  const wods = Object.keys(computeCfRecords()).sort();
  const previousValue = select.value;
  select.innerHTML = "";
  wods.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
  if (wods.includes(previousValue)) select.value = previousValue;
}

function renderWodChart() {
  const canvas = document.getElementById("chart-wod");
  const select = document.getElementById("stats-wod-select");
  if (!canvas || !select || !select.value) return;

  const sessions = getAllSessions()
    .filter((s) => s.type === "crossfit" && s.wodName === select.value)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const labels = sessions.map((s) => new Date(s.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }));

  // On regarde si ce WOD est plutôt suivi en "temps" ou en "rounds"
  const isTimeBased = sessions.some((s) => s.timeSeconds !== null && s.timeSeconds !== undefined);

  const data = isTimeBased
    ? sessions.map((s) => s.timeSeconds ?? null)
    : sessions.map((s) => (s.rounds ?? 0) + (s.extraReps ?? 0) / 100);

  const options = getBaseChartOptions();
  if (isTimeBased) {
    // Sur un graphique de temps, plus la courbe descend, mieux c'est !
    options.scales.y.ticks.callback = (value) => (typeof formatSecondsToTime === "function" ? formatSecondsToTime(value) : value);
  }

  if (wodChartInstance) wodChartInstance.destroy();
  wodChartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: isTimeBased ? "Temps" : "Rounds",
        data,
        borderColor: CHART_COLORS.accent,
        backgroundColor: CHART_COLORS.accentFill,
        fill: true,
        tension: 0.3,
      }],
    },
    options,
  });
}

document.addEventListener("change", (event) => {
  if (event.target.id === "stats-wod-select") renderWodChart();
});

// --------------------------------------------------------------------------
// FONCTION GLOBALE : tout redessiner d'un coup (appelée en arrivant sur la page)
// --------------------------------------------------------------------------

function renderAllStatsCharts() {
  populateStatsExerciseSelect();
  populateStatsWodSelect();
  renderBodyweightChart();
  renderExerciseChart();
  renderVolumeChart();
  renderSessionsChart();
  renderWodChart();
}

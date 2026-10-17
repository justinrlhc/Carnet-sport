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

/**
 * Chart.js vient d'internet. Si l'appli s'ouvre hors ligne avant d'avoir pu
 * le garder en réserve, on saute simplement les graphiques au lieu de
 * bloquer le reste de la page.
 */
function chartsAvailable() {
  return typeof Chart !== "undefined";
}

/** Vrai sur un écran de téléphone (même seuil que le CSS mobile). */
function isNarrowScreen() {
  return Boolean(window.matchMedia) && window.matchMedia("(max-width: 720px)").matches;
}

/** Options communes à tous les graphiques (couleurs des axes, légende...). */
function getBaseChartOptions() {
  const narrow = isNarrowScreen();
  return {
    responsive: true,
    maintainAspectRatio: false,
    locale: "fr-FR", // nombres à la française : 5 000 et non 5,000
    plugins: {
      legend: { labels: { color: CHART_COLORS.text } },
    },
    scales: {
      x: {
        ticks: {
          color: CHART_COLORS.text,
          // Sur téléphone : étiquettes droites et courtes ("03/08" au lieu de
          // "03/08 → 09/08" penché) ; l'info complète reste dans l'infobulle
          maxRotation: narrow ? 0 : 50,
          autoSkipPadding: 8,
          callback(value) {
            const label = this.getLabelForValue(value);
            return narrow && typeof label === "string" ? label.split(" → ")[0] : label;
          },
        },
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
  const sessions = getAllSessions(); // musculation ET crossfit : computeSessionVolume gère les deux
  return buildWeeklyBuckets(nbWeeks).map(({ start, end }) =>
    sessions
      .filter((s) => { const d = parseLocalDate(s.date); return d >= start && d <= end; })
      .reduce((total, s) => total + computeSessionVolume(s), 0)
  );
}

function computeWeeklySessionsSeries(nbWeeks) {
  const sessions = getAllSessions();
  return buildWeeklyBuckets(nbWeeks).map(({ start, end }) =>
    sessions.filter((s) => { const d = parseLocalDate(s.date); return d >= start && d <= end; }).length
  );
}

// --------------------------------------------------------------------------
// GRAPHIQUE DU DASHBOARD (mini aperçu du volume des dernières semaines)
// --------------------------------------------------------------------------

let dashboardChartInstance = null;

function renderDashboardChart() {
  if (!chartsAvailable()) return;
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
  if (!chartsAvailable()) return;
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

/**
 * Les exercices qui ont une vraie progression à montrer : ceux notés en
 * séries réelles (Musculation, cours de spé) et les tests cardio. Un
 * exercice vu seulement dans un WOD n'y figure pas : on ne sait pas s'il a
 * été fait d'une traite, aucune courbe fiable n'est possible.
 */
function getChartableExercises() {
  const lifts = new Set();
  const cardio = new Set();
  getAllSessions().forEach((session) => {
    if (session.type === "musculation") {
      (session.exercises || []).forEach((entry) => {
        if (!entry) return;
        if (entry.kind === "cardio") { if (entry.timeSeconds > 0) cardio.add(entry.exercise); }
        else if (Array.isArray(entry.sets) && entry.sets.some((set) => set.reps > 0)) lifts.add(entry.exercise);
      });
    } else if (session.type === "crossfit" && typeof isSpeSession === "function" && isSpeSession(session.wodName)) {
      (session.exercises || []).forEach((entry) => {
        if (typeof entry === "object" && entry !== null && entry.reps > 0 && getEntryUnit(entry) === "reps") lifts.add(entry.exercise);
      });
    }
  });
  return { lifts: [...lifts].sort(), cardio: [...cardio].sort() };
}

function populateStatsExerciseSelect() {
  const select = document.getElementById("stats-exercise-select");
  if (!select) return;

  const { lifts, cardio } = getChartableExercises();
  const previousValue = select.value;
  select.innerHTML = "";
  [...lifts, ...cardio].forEach((ex) => {
    const opt = document.createElement("option");
    opt.value = ex;
    opt.textContent = cardio.includes(ex) ? `${ex} (test chrono)` : ex;
    select.appendChild(opt);
  });
  if ([...lifts, ...cardio].includes(previousValue)) select.value = previousValue;
}

/**
 * Ce que mesure la courbe, selon l'exercice :
 *  - test cardio : le temps (plus bas = mieux) ;
 *  - exercice au poids du corps : les répétitions max en une série ;
 *  - exercice avec charge : le 1RM estimé (même règle que partout :
 *    Epley jusqu'à 10 reps, au-delà la charge soulevée).
 * Seules les vraies séries comptent (Musculation et cours de spé).
 */
function renderExerciseChart() {
  if (!chartsAvailable()) return;
  const canvas = document.getElementById("chart-exercise");
  const select = document.getElementById("stats-exercise-select");
  if (!canvas || !select) return;
  if (!select.value) {
    if (exerciseChartInstance) { exerciseChartInstance.destroy(); exerciseChartInstance = null; }
    return;
  }

  const name = select.value;
  const isBW = typeof isBodyweightExercise === "function" && isBodyweightExercise(name);
  const points = [];
  let mode = isBW ? "reps" : "load";

  getAllSessions().forEach((session) => {
    let sets = [];
    if (session.type === "musculation") {
      (session.exercises || []).forEach((entry) => {
        if (!entry || entry.exercise !== name) return;
        if (entry.kind === "cardio") {
          mode = "time";
          if (entry.timeSeconds > 0) points.push({ date: session.date, value: entry.timeSeconds });
        } else if (Array.isArray(entry.sets)) {
          sets = sets.concat(entry.sets);
        }
      });
    } else if (session.type === "crossfit" && typeof isSpeSession === "function" && isSpeSession(session.wodName)) {
      sets = (session.exercises || [])
        .filter((ex) => typeof ex === "object" && ex !== null && ex.exercise === name && ex.reps > 0 && getEntryUnit(ex) === "reps")
        .map((ex) => ({ reps: ex.reps, weight: ex.weight || 0 }));
    }
    if (sets.length === 0 || mode === "time") return;
    const values = mode === "reps"
      ? sets.map((set) => set.reps || 0)
      : sets.filter((set) => set.weight > 0 && set.reps > 0).map((set) => estimateOneRepMax(set.weight, set.reps));
    if (values.length > 0) points.push({ date: session.date, value: Math.max(...values) });
  });

  points.sort((a, b) => parseLocalDate(a.date) - parseLocalDate(b.date));

  const labels = points.map((p) => parseLocalDate(p.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }));
  const data = points.map((p) => (mode === "load" ? Math.round(p.value * 10) / 10 : p.value));
  const labelByMode = {
    load: `1RM estimé — ${name} (kg)`,
    reps: `Reps max en une série — ${name}`,
    time: `Temps — ${name} (plus bas = mieux)`,
  };

  const options = getBaseChartOptions();
  if (mode === "time") options.scales.y.ticks.callback = (value) => formatDuration(value);
  if (mode === "reps") options.scales.y.ticks.precision = 0;

  if (exerciseChartInstance) exerciseChartInstance.destroy();
  exerciseChartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: labelByMode[mode],
        data,
        borderColor: CHART_COLORS.success,
        backgroundColor: "rgba(76, 175, 125, 0.15)",
        fill: mode !== "time",
        tension: 0.3,
      }],
    },
    options,
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
  if (!chartsAvailable()) return;
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
  if (!chartsAvailable()) return;
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
  if (!chartsAvailable()) return;
  const canvas = document.getElementById("chart-wod");
  const select = document.getElementById("stats-wod-select");
  if (!canvas || !select) return;
  if (!select.value) {
    if (wodChartInstance) { wodChartInstance.destroy(); wodChartInstance = null; }
    return;
  }

  const sessions = getAllSessions()
    .filter((s) => s.type === "crossfit" && s.wodName === select.value)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // Une seule chronologie de dates, puis une courbe par niveau (RX, Inter,
  // Scaled) : un Fran Scaled ne doit pas se mélanger à un Fran RX.
  const labels = sessions.map((s) => parseLocalDate(s.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }));
  const isTimeBased = sessions.some((s) => s.timeSeconds !== null && s.timeSeconds !== undefined);
  const levelColors = { RX: "#E1584F", Inter: CHART_COLORS.accent, Scaled: "#5B9BD9" };

  const datasets = CF_LEVEL_ORDER
    .filter((level) => sessions.some((s) => getCfLevel(s) === level))
    .map((level) => ({
      label: level,
      data: sessions.map((s) => {
        if (getCfLevel(s) !== level) return null;
        if (isTimeBased) return s.timeSeconds ?? null;
        return s.rounds !== null && s.rounds !== undefined ? s.rounds + (s.extraReps ?? 0) / 100 : null;
      }),
      borderColor: levelColors[level],
      backgroundColor: levelColors[level],
      spanGaps: true, // relie les points d'un même niveau même s'il y a d'autres niveaux entre
      tension: 0.3,
    }));

  const options = getBaseChartOptions();
  if (isTimeBased) {
    // Sur un graphique de temps, plus la courbe descend, mieux c'est !
    options.scales.y.ticks.callback = (value) => (typeof formatSecondsToTime === "function" ? formatSecondsToTime(value) : value);
  }

  if (wodChartInstance) wodChartInstance.destroy();
  wodChartInstance = new Chart(canvas, { type: "line", data: { labels, datasets }, options });
}

document.addEventListener("change", (event) => {
  if (event.target.id === "stats-wod-select") renderWodChart();
});

// --------------------------------------------------------------------------
// CALENDRIER D'ASSIDUITÉ (façon "heatmap" GitHub)
// Une grille d'un petit carré par jour, plus foncé si une séance a eu lieu
// ce jour-là (musculation ET CrossFit comptent). Les colonnes sont des
// semaines (lundi en haut), avec le nom du mois affiché au-dessus dès
// qu'on change de mois. Réutilisée en version compacte sur le Dashboard
// et en version complète sur la page Statistiques.
// --------------------------------------------------------------------------

function buildAttendanceHeatmapHtml(nbWeeks) {
  // On compte le nombre de séances par jour (tous types confondus)
  const countByDate = {};
  getAllSessions().forEach((s) => {
    countByDate[s.date] = (countByDate[s.date] || 0) + 1;
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentWeekStart = getWeekStartDate(today);
  const firstWeekStart = new Date(currentWeekStart);
  firstWeekStart.setDate(firstWeekStart.getDate() - (nbWeeks - 1) * 7);

  let monthsHtml = "";
  let columnsHtml = "";
  let lastMonthLabel = null;
  let lastPrintedColumnIndex = -Infinity;
  const MIN_GAP_BETWEEN_LABELS = 3; // en nombre de colonnes, pour éviter que deux mois se chevauchent visuellement

  for (let w = 0; w < nbWeeks; w++) {
    const weekStart = new Date(firstWeekStart);
    weekStart.setDate(weekStart.getDate() + w * 7);

    // On repère un changement de mois, mais on ne l'affiche que s'il y a
    // assez de place depuis la dernière étiquette affichée, sinon le texte
    // du mois précédent et celui du suivant se chevauchent.
    const monthLabel = weekStart.toLocaleDateString("fr-FR", { month: "short" });
    const isNewMonth = monthLabel !== lastMonthLabel;
    if (isNewMonth) lastMonthLabel = monthLabel;

    // Pas d'étiquette dans les 2 dernières colonnes : elle serait coupée au bord droit
    if (isNewMonth && (w - lastPrintedColumnIndex) >= MIN_GAP_BETWEEN_LABELS && w <= nbWeeks - 3) {
      monthsHtml += `<span class="hm-month-label">${monthLabel}</span>`;
      lastPrintedColumnIndex = w;
    } else {
      monthsHtml += `<span class="hm-month-label"></span>`;
    }

    let cellsHtml = "";
    for (let d = 0; d < 7; d++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + d);

      if (date > today) {
        cellsHtml += `<div class="hm-cell hm-future"></div>`;
        continue;
      }

      // ATTENTION : surtout pas toISOString() ici — il convertit en UTC, ce
      // qui décale la date d'un jour en France (minuit le 13 en local = 22h
      // le 12 en UTC) et chaque case afficherait les séances de la veille.
      const dateStr = toLocalDateString(date);
      const count = countByDate[dateStr] || 0;
      const level = count === 0 ? 0 : count === 1 ? 1 : 2;
      const label = `${date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} — ${count} séance${count > 1 ? "s" : ""}`;

      cellsHtml += `<div class="hm-cell hm-level-${level}" title="${label}"></div>`;
    }
    columnsHtml += `<div class="hm-column">${cellsHtml}</div>`;
  }

  return `
    <div class="hm-wrapper">
      <div class="hm-months">${monthsHtml}</div>
      <div class="hm-grid">${columnsHtml}</div>
      <div class="hm-legend">
        <span>Moins</span>
        <div class="hm-cell hm-level-0"></div>
        <div class="hm-cell hm-level-1"></div>
        <div class="hm-cell hm-level-2"></div>
        <span>Plus</span>
      </div>
    </div>
  `;
}

/** Version complète (≈5-6 mois), affichée sur la page Statistiques. */
function renderAttendanceHeatmap() {
  const container = document.getElementById("attendance-heatmap");
  if (!container) return;
  container.innerHTML = buildAttendanceHeatmapHtml(24);
}

// --------------------------------------------------------------------------
// COMPTEUR DE SÉRIE (STREAK) HEBDOMADAIRE
// Nombre de semaines consécutives (lundi-dimanche) avec au moins
// MIN_SESSIONS_PER_WEEK séances. La semaine en cours n'est comptée que si
// elle a déjà atteint ce seuil ; sinon, comme elle n'est pas terminée, elle
// n'est ni comptée ni considérée comme une rupture de série.
// --------------------------------------------------------------------------

const STREAK_MIN_SESSIONS_PER_WEEK = 2;

function countSessionsInWeek(weekStart) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  return getAllSessions().filter((s) => {
    const d = parseLocalDate(s.date);
    return d >= weekStart && d <= weekEnd;
  }).length;
}

function computeWeeklyStreak() {
  const currentWeekStart = getWeekStartDate(new Date());
  let cursor = new Date(currentWeekStart);

  // La semaine en cours n'est pas terminée : si elle n'a pas encore
  // atteint le seuil, on ne la compte pas, mais elle ne casse rien non
  // plus — on démarre alors le décompte à la semaine précédente.
  if (countSessionsInWeek(cursor) < STREAK_MIN_SESSIONS_PER_WEEK) {
    cursor.setDate(cursor.getDate() - 7);
  }

  let streak = 0;
  while (countSessionsInWeek(cursor) >= STREAK_MIN_SESSIONS_PER_WEEK) {
    streak++;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}

function renderStreakBadge() {
  const badge = document.getElementById("streak-badge");
  if (!badge) return;

  const streak = computeWeeklyStreak();
  if (streak === 0) {
    badge.style.display = "none";
    return;
  }
  badge.textContent = `${streak} semaine${streak > 1 ? "s" : ""} d'affilée`;
  badge.style.display = "inline-block";
}

// --------------------------------------------------------------------------
// FONCTION GLOBALE : tout redessiner d'un coup (appelée en arrivant sur la page)
// --------------------------------------------------------------------------

function renderAllStatsCharts() {
  populateStatsExerciseSelect();
  populateStatsWodSelect();
  renderAttendanceHeatmap();
  renderStreakBadge();
  renderBodyweightChart();
  renderExerciseChart();
  renderVolumeChart();
  renderSessionsChart();
  renderWodChart();
}

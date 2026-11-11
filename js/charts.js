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
    Math.round(sessions
      .filter((s) => { const d = parseLocalDate(s.date); return d >= start && d <= end; })
      .reduce((total, s) => total + computeSessionVolume(s), 0))
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
// PAGE STATISTIQUES (refaite en version 27)
//   - une période en haut (Semaine / Mois / 3 mois / Année, glissante) ;
//   - 4 chiffres clés comparés à la période d'avant ;
//   - le graphique « Activité » (séances, volume en kg ou séries) ;
//   - le calendrier de régularité du mois (toucher un jour : ses séances) ;
//   - des liens vers Records et Mensurations (les courbes y sont déjà).
// --------------------------------------------------------------------------

const STATS_PERIODS = {
  week: { label: "Semaine", days: 7, sub: "7 derniers jours · comparé aux 7 jours d'avant" },
  month: { label: "Mois", days: 30, sub: "30 derniers jours · comparé aux 30 jours d'avant" },
  quarter: { label: "3 mois", days: 90, sub: "90 derniers jours · comparé aux 90 jours d'avant" },
  year: { label: "Année", days: 365, sub: "365 derniers jours · comparé à l'année d'avant" },
};
const STATS_METRICS = {
  sessions: { label: "Séances", unit: ["séance", "séances"] },
  volume: { label: "Volume", unit: ["kg", "kg"] },
  sets: { label: "Séries", unit: ["série", "séries"] },
};

let statsPeriod = "month";
let statsMetric = "sessions";
let statsCalendarMonth = null; // { year, month } ; null = mois en cours
let activityChartInstance = null;

/** "AAAA-MM-JJ" décalé de n jours (n négatif = dans le passé). */
function shiftDateString(dateStr, days) {
  const date = parseLocalDate(dateStr);
  date.setDate(date.getDate() + days);
  return toLocalDateString(date);
}

/**
 * Séries d'une séance : les vraies séries de musculation et chaque série
 * d'un cours de spé (échauffements exclus). Un WOD n'a pas de séries.
 */
function countSessionSets(session) {
  if (!session || !Array.isArray(session.exercises)) return 0;
  if (session.type === "musculation") {
    return session.exercises.reduce((total, entry) => {
      if (!entry || entry.kind === "cardio" || !Array.isArray(entry.sets)) return total;
      return total + entry.sets.filter((set) => set && set.warmup !== true && Number(set.reps) > 0).length;
    }, 0);
  }
  if (session.type === "crossfit" && typeof isSpeSession === "function" && isSpeSession(session.wodName)) {
    return session.exercises.filter((entry) => typeof entry === "object" && entry !== null && entry.warmup !== true && Number(entry.reps) > 0).length;
  }
  return 0;
}

const statsSessionVolume = (session) => (typeof computeSessionVolume === "function" ? computeSessionVolume(session) : 0);

/** Les chiffres d'une période [start ; end] (dates "AAAA-MM-JJ" incluses). */
function computeStatsForRange(sessions, recordEvents, start, end) {
  const list = sessions.filter((s) => s.date >= start && s.date <= end);
  return {
    sessions: list.length,
    volume: Math.round(list.reduce((total, s) => total + statsSessionVolume(s), 0)),
    sets: list.reduce((total, s) => total + countSessionSets(s), 0),
    records: recordEvents.filter((e) => e.date >= start && e.date <= end).length,
  };
}

/** Écart avec la période d'avant : { text, cls }. */
function describeStatsDelta(current, previous, asPercent) {
  if (current === previous) return { text: "= pareil", cls: "" };
  if (asPercent) {
    if (previous === 0) return { text: "rien avant", cls: "" };
    const pct = Math.round(((current - previous) / previous) * 100);
    if (pct === 0) return { text: "= pareil", cls: "" };
    return { text: `${pct > 0 ? "+" : "−"}${Math.abs(pct)} %`, cls: pct > 0 ? "up" : "dn" };
  }
  const diff = current - previous;
  return { text: `${diff > 0 ? "+" : "−"}${formatNumberFr(Math.abs(diff))}`, cls: diff > 0 ? "up" : "dn" };
}

function renderStatsPeriod() {
  document.querySelectorAll("#stats-period [data-period]").forEach((button) => {
    const on = button.dataset.period === statsPeriod;
    button.classList.toggle("on", on);
    button.setAttribute("aria-pressed", String(on));
  });
  const sub = document.getElementById("stats-period-sub");
  if (sub) sub.textContent = STATS_PERIODS[statsPeriod].sub;
}

function renderStatsTiles() {
  const container = document.getElementById("stats-tiles");
  if (!container) return;
  const days = STATS_PERIODS[statsPeriod].days;
  const today = todayLocalDateString();
  const sessions = getAllSessions().filter((s) => isValidDateString(s.date));
  const events = typeof computeRecordHistory === "function" ? computeRecordHistory() : [];
  const current = computeStatsForRange(sessions, events, shiftDateString(today, -(days - 1)), today);
  const previous = computeStatsForRange(sessions, events, shiftDateString(today, -(2 * days - 1)), shiftDateString(today, -days));
  const tiles = [
    { key: "sessions", label: "Séances", value: formatNumberFr(current.sessions) },
    { key: "volume", label: "Volume soulevé", value: formatNumberFr(current.volume), unit: "kg", percent: true },
    { key: "sets", label: "Séries", value: formatNumberFr(current.sets) },
    { key: "records", label: "Records battus", value: formatNumberFr(current.records), gold: true },
  ];
  container.innerHTML = tiles.map((tile) => {
    const delta = describeStatsDelta(current[tile.key], previous[tile.key], tile.percent);
    // Un très grand nombre (volume sur un an) prend une taille plus petite
    const length = tile.value.length + (tile.unit ? tile.unit.length + 1 : 0);
    const size = length > 10 ? " xl" : length > 7 ? " l" : "";
    return `<div class="st-t${tile.gold ? " gold" : ""}" data-tile="${tile.key}">
      <span>${tile.label}</span>
      <b class="${size.trim()}">${escapeHtml(tile.value)}${tile.unit ? ` <small>${tile.unit}</small>` : ""}</b>
      <em class="${delta.cls}">${escapeHtml(delta.text)}</em>
    </div>`;
  }).join("");
}

/**
 * Les barres du graphique Activité, selon la période :
 * Semaine → 7 jours, Mois → 5 semaines, 3 mois → 13 semaines, Année → 12 mois.
 */
function buildActivityBuckets() {
  const today = parseLocalDate(todayLocalDateString());
  if (statsPeriod === "week") {
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(today);
      day.setDate(day.getDate() - (6 - i));
      const label = day.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
      return { start: toLocalDateString(day), end: toLocalDateString(day), label, step: "day" };
    });
  }
  if (statsPeriod === "year") {
    return Array.from({ length: 12 }, (_, i) => {
      const first = new Date(today.getFullYear(), today.getMonth() - (11 - i), 1);
      const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
      const label = first.toLocaleDateString("fr-FR", first.getMonth() === 0 ? { month: "short", year: "2-digit" } : { month: "short" });
      return { start: toLocalDateString(first), end: toLocalDateString(last), label, step: "month" };
    });
  }
  return buildWeeklyBuckets(statsPeriod === "quarter" ? 13 : 5).map((b) => ({
    start: toLocalDateString(b.start), end: toLocalDateString(b.end), label: b.label, step: "week",
  }));
}

function computeActivitySeries(buckets, metric) {
  const sessions = getAllSessions().filter((s) => isValidDateString(s.date));
  return buckets.map(({ start, end }) => {
    const list = sessions.filter((s) => s.date >= start && s.date <= end);
    if (metric === "volume") return Math.round(list.reduce((total, s) => total + statsSessionVolume(s), 0));
    if (metric === "sets") return list.reduce((total, s) => total + countSessionSets(s), 0);
    return list.length;
  });
}

function renderActivityChart() {
  document.querySelectorAll("#stats-metric [data-metric]").forEach((button) => {
    const on = button.dataset.metric === statsMetric;
    button.classList.toggle("on", on);
    button.setAttribute("aria-pressed", String(on));
  });
  const buckets = buildActivityBuckets();
  const values = computeActivitySeries(buckets, statsMetric);
  const step = buckets[0].step;

  // Moyenne : sans la semaine / le mois en cours (pas encore terminé)
  const counted = step === "day" ? values : values.slice(0, -1);
  const average = counted.length ? counted.reduce((a, b) => a + b, 0) / counted.length : 0;
  const unit = STATS_METRICS[statsMetric].unit;
  const per = { day: "jour", week: "semaine", month: "mois" }[step];
  const avgValue = statsMetric === "volume" ? Math.round(average) : Math.round(average * 10) / 10;
  const span = { day: "7 derniers jours", week: `${buckets.length} dernières semaines`, month: "12 derniers mois" }[step];
  const avgEl = document.getElementById("stats-activity-avg");
  if (avgEl) avgEl.innerHTML = `<span>${span}</span><span>moyenne <b>${formatNumberFr(avgValue, 1)} ${avgValue > 1 ? unit[1] : unit[0]} / ${per}</b></span>`;

  const canvas = document.getElementById("chart-activity");
  const fallback = document.getElementById("stats-activity-offline");
  if (!canvas) return;
  if (!chartsAvailable()) {
    if (fallback) fallback.hidden = false;
    return;
  }
  if (fallback) fallback.hidden = true;

  const base = getBaseChartOptions();
  const yTicks = { color: CHART_COLORS.text };
  if (statsMetric !== "volume") yTicks.precision = 0;
  if (activityChartInstance) activityChartInstance.destroy();
  activityChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels: buckets.map((b) => b.label),
      datasets: [{
        label: statsMetric === "volume" ? "Volume (kg)" : STATS_METRICS[statsMetric].label,
        data: values,
        backgroundColor: statsMetric === "sessions" ? CHART_COLORS.success : CHART_COLORS.accent,
        borderRadius: 4,
      }],
    },
    options: { ...base, plugins: { legend: { display: false } }, scales: { ...base.scales, y: { ...base.scales.y, beginAtZero: true, ticks: yTicks } } },
  });
}

// --------------------------------------------------------------------------
// CALENDRIER DE RÉGULARITÉ (un mois ; doré = musculation, vert = CrossFit)
// --------------------------------------------------------------------------

function getCalendarMonth() {
  const today = parseLocalDate(todayLocalDateString());
  return statsCalendarMonth || { year: today.getFullYear(), month: today.getMonth() };
}

/** Le premier mois navigable : celui de la plus ancienne séance (au moins le mois en cours). */
function getEarliestCalendarMonth() {
  const today = parseLocalDate(todayLocalDateString());
  const dates = getAllSessions().map((s) => s.date).filter(isValidDateString).sort();
  const first = dates.length ? parseLocalDate(dates[0]) : today;
  const earliest = first < today ? first : today;
  return { year: earliest.getFullYear(), month: earliest.getMonth() };
}

const monthIndex = ({ year, month }) => year * 12 + month;

function renderRegularityCalendar() {
  const container = document.getElementById("stats-calendar");
  if (!container) return;
  const todayStr = todayLocalDateString();
  const today = parseLocalDate(todayStr);
  const current = { year: today.getFullYear(), month: today.getMonth() };
  const earliest = getEarliestCalendarMonth();
  let shown = getCalendarMonth();
  if (monthIndex(shown) > monthIndex(current)) shown = current;
  if (monthIndex(shown) < monthIndex(earliest)) shown = earliest;
  statsCalendarMonth = shown;

  const sessionsByDate = {};
  getAllSessions().forEach((s) => {
    if (!isValidDateString(s.date)) return;
    (sessionsByDate[s.date] = sessionsByDate[s.date] || []).push(s);
  });

  const first = new Date(shown.year, shown.month, 1);
  const nbDays = new Date(shown.year, shown.month + 1, 0).getDate();
  const shift = (first.getDay() + 6) % 7; // lundi en premier
  let cells = ["L", "M", "M", "J", "V", "S", "D"].map((d) => `<div class="st-wd" aria-hidden="true">${d}</div>`).join("");
  for (let i = 0; i < shift; i++) cells += `<div class="st-day out" aria-hidden="true"></div>`;
  let monthCount = 0;
  for (let day = 1; day <= nbDays; day++) {
    const date = toLocalDateString(new Date(shown.year, shown.month, day));
    const list = sessionsByDate[date] || [];
    monthCount += list.length;
    const muscu = list.some((s) => s.type === "musculation");
    const cf = list.some((s) => s.type === "crossfit");
    const kind = date > todayStr ? "future" : muscu && cf ? "mc" : muscu ? "m" : cf ? "c" : "";
    const cls = `st-day ${kind}${date === todayStr ? " today" : ""}`.trim();
    if (list.length) {
      const what = list.map((s) => (s.type === "musculation" ? "musculation" : s.wodName || "CrossFit")).join(", ");
      cells += `<button type="button" class="${cls}" data-date="${date}" aria-label="${escapeHtml(`${day} : ${what}`)}">${day}</button>`;
    } else {
      cells += `<div class="${cls}">${day}</div>`;
    }
  }

  // Les 8 dernières semaines : allumée dès 2 séances (comme le compteur de série)
  const weekCounts = countSessionsByWeek();
  const weeks = buildWeeklyBuckets(8).map(({ start }, i, all) => {
    const count = countSessionsInWeek(start, weekCounts);
    const ok = count >= STREAK_MIN_SESSIONS_PER_WEEK;
    const isCurrent = i === all.length - 1;
    return `<i class="${ok ? "ok" : isCurrent ? "now" : ""}" title="${count} séance${count > 1 ? "s" : ""}"></i>`;
  }).join("");

  const streak = computeWeeklyStreak(weekCounts);
  const monthName = first.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const canPrev = monthIndex(shown) > monthIndex(earliest);
  const canNext = monthIndex(shown) < monthIndex(current);
  container.innerHTML = `
    <div class="st-h"><h3>Régularité</h3>${streak > 0 ? `<span class="st-streak" id="streak-badge">${streak} semaine${streak > 1 ? "s" : ""} d'affilée</span>` : ""}</div>
    <div class="st-cal-h">
      <button type="button" data-cal="-1" aria-label="Mois précédent"${canPrev ? "" : " disabled"}>‹</button>
      <b>${escapeHtml(monthName)}</b>
      <button type="button" data-cal="1" aria-label="Mois suivant"${canNext ? "" : " disabled"}>›</button>
    </div>
    <div class="st-cal">${cells}</div>
    <div class="st-leg"><span class="m">Musculation</span><span class="c">CrossFit / spé</span><span class="n">${monthCount} séance${monthCount > 1 ? "s" : ""} ce mois-ci</span></div>
    <div class="st-weeks" title="Allumée quand tu fais au moins ${STREAK_MIN_SESSIONS_PER_WEEK} séances dans la semaine"><span>8 dernières sem.</span>${weeks}</div>`;

  container.querySelectorAll("[data-cal]").forEach((button) => button.addEventListener("click", () => {
    const target = new Date(shown.year, shown.month + Number(button.dataset.cal), 1);
    statsCalendarMonth = { year: target.getFullYear(), month: target.getMonth() };
    renderRegularityCalendar();
  }));
  container.querySelectorAll(".st-day[data-date]").forEach((button) => button.addEventListener("click", () => openCalendarDaySheet(button.dataset.date)));
}

/** Une séance en quelques lignes, pour la fenêtre d'un jour du calendrier. */
function describeSessionForDay(session) {
  if (session.type === "musculation") {
    const lines = (session.exercises || []).filter(Boolean).map((entry) => {
      if (entry.kind === "cardio") return `${entry.exercise} : ${entry.timeSeconds > 0 ? formatDuration(entry.timeSeconds) : "—"}`;
      const isBW = typeof isBodyweightExercise === "function" && isBodyweightExercise(entry.exercise);
      return `${entry.exercise} : ${formatSetsCompact(entry.sets, isBW) || "—"}`;
    });
    return {
      tag: `Musculation${session.durationSeconds > 0 ? ` · ${formatSessionDuration(session.durationSeconds)}` : ""}`,
      cf: false,
      title: session.name || "Séance",
      lines,
    };
  }
  const spe = typeof isSpeSession === "function" && isSpeSession(session.wodName);
  const lines = (session.exercises || []).map((entry) => {
    if (typeof entry === "string") return entry;
    if (!entry || typeof entry !== "object") return null;
    const amount = typeof formatAmount === "function" ? formatAmount(entry.reps, getEntryUnit(entry)) : `${entry.reps}`;
    return `${entry.exercise} : ${entry.warmup === true ? "échauff. " : ""}${amount}${entry.weight > 0 ? ` à ${formatNumberFr(entry.weight)} kg` : ""}`;
  }).filter(Boolean);
  const score = !spe && typeof formatWodResult === "function" ? formatWodResult(session) : "—";
  const tagParts = [spe ? "Cours de spé" : "CrossFit"];
  if (!spe && session.wodType) tagParts.push(session.wodType);
  if (!spe && session.rxOrScaled) tagParts.push(session.rxOrScaled);
  return {
    tag: tagParts.join(" · "),
    cf: true,
    title: `${session.wodName || "WOD"}${score !== "—" ? ` — ${score}` : ""}`,
    lines,
  };
}

function openCalendarDaySheet(date) {
  const sessions = getAllSessions().filter((s) => s.date === date);
  if (sessions.length === 0) return;
  openSheet((sheet, close) => {
    const title = parseLocalDate(date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: date.slice(0, 4) === todayLocalDateString().slice(0, 4) ? undefined : "numeric" });
    sheet.insertAdjacentHTML("beforeend", `<h2>${escapeHtml(title)}</h2>`);
    sessions.forEach((session) => {
      const info = describeSessionForDay(session);
      // Une séance de musculation en cours cache l'historique : pas de lien dans ce cas
      const canShow = session.type === "crossfit" || !(typeof muscuDraft !== "undefined" && muscuDraft);
      const block = document.createElement("div");
      block.className = "st-sess";
      block.innerHTML = `
        <span class="tag${info.cf ? " c" : ""}">${escapeHtml(info.tag)}</span>
        <b>${escapeHtml(info.title)}</b>
        ${info.lines.length ? `<span>${info.lines.map(escapeHtml).join("<br>")}</span>` : ""}
        ${session.notes ? `<span class="notes">${escapeHtml(session.notes)}</span>` : ""}
        ${canShow ? `<button type="button" class="rf-btn rf-btn-ghost st-sess-link">Voir dans l'historique ${session.type === "musculation" ? "de Musculation" : "de CrossFit"}</button>` : ""}`;
      const link = block.querySelector(".st-sess-link");
      if (link) link.addEventListener("click", () => { close(); showSessionInHistory(session); });
      sheet.appendChild(block);
    });
  });
}

/** Ouvre l'onglet de la séance, filtres effacés, et la montre dans l'historique. */
function showSessionInHistory(session) {
  const isMuscu = session.type === "musculation";
  if (isMuscu) {
    if (typeof muscuFilterSelect !== "undefined") muscuFilterSelect.value = "all";
    if (typeof muscuHistorySearch !== "undefined") muscuHistorySearch.value = "";
  } else {
    if (typeof cfFilterSelect !== "undefined") cfFilterSelect.value = "all";
    if (typeof cfFilterLevelSelect !== "undefined") cfFilterLevelSelect.value = "all";
    if (typeof cfHistorySearch !== "undefined") cfHistorySearch.value = "";
  }
  goToSection(isMuscu ? "musculation" : "crossfit");
  const list = document.getElementById(isMuscu ? "muscu-history-list" : "cf-history-list");
  const total = getAllSessions().filter((s) => s.type === session.type).length;
  const find = () => (list ? [...list.querySelectorAll(".history-card")].find((card) => card.dataset.sessionId === String(session.id)) : null);
  // Séance ancienne : on affiche assez de « Voir plus » pour l'atteindre
  for (let guard = 0; !find() && guard < 100; guard++) {
    if (isMuscu) {
      if (muscuHistoryLimit >= total) break;
      muscuHistoryLimit += HISTORY_PAGE_SIZE;
      renderMuscuHistory();
    } else {
      if (cfHistoryLimit >= total) break;
      cfHistoryLimit += HISTORY_PAGE_SIZE;
      renderCfHistory();
    }
  }
  const card = find();
  if (!card) return;
  if (typeof card.scrollIntoView === "function") card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.classList.add("hist-flash");
  setTimeout(() => card.classList.remove("hist-flash"), 2200);
}

// Boutons de période et de mesure (posés une fois, la page est redessinée ensuite)
document.querySelectorAll("#stats-period [data-period]").forEach((button) => button.addEventListener("click", () => {
  if (!STATS_PERIODS[button.dataset.period]) return;
  statsPeriod = button.dataset.period;
  renderStatsPeriod();
  renderStatsTiles();
  renderActivityChart();
}));
document.querySelectorAll("#stats-metric [data-metric]").forEach((button) => button.addEventListener("click", () => {
  if (!STATS_METRICS[button.dataset.metric]) return;
  statsMetric = button.dataset.metric;
  renderActivityChart();
}));
document.querySelectorAll("#section-statistiques [data-go]").forEach((button) => button.addEventListener("click", () => {
  goToSection(button.dataset.go);
  window.scrollTo(0, 0);
}));

// --------------------------------------------------------------------------
// COMPTEUR DE SÉRIE (STREAK) HEBDOMADAIRE
// Nombre de semaines consécutives (lundi-dimanche) avec au moins
// MIN_SESSIONS_PER_WEEK séances. La semaine en cours n'est comptée que si
// elle a déjà atteint ce seuil ; sinon, comme elle n'est pas terminée, elle
// n'est ni comptée ni considérée comme une rupture de série.
// --------------------------------------------------------------------------

const STREAK_MIN_SESSIONS_PER_WEEK = 2;

/**
 * v28 : le nombre de séances de chaque semaine, calculé en UN SEUL passage
 * sur toutes les séances ({ "AAAA-MM-JJ" du lundi → nombre }). Avant, chaque
 * semaine relisait toutes les séances : la page ralentissait avec les années.
 */
function countSessionsByWeek(sessions) {
  const counts = new Map();
  (sessions || getAllSessions()).forEach((session) => {
    if (!session || !isValidDateString(session.date)) return;
    const monday = toLocalDateString(getWeekStartDate(parseLocalDate(session.date)));
    counts.set(monday, (counts.get(monday) || 0) + 1);
  });
  return counts;
}

/** Séances de la semaine qui commence ce lundi (counts : le tableau ci-dessus, s'il est déjà calculé). */
function countSessionsInWeek(weekStart, counts) {
  return (counts || countSessionsByWeek()).get(toLocalDateString(getWeekStartDate(weekStart))) || 0;
}

function computeWeeklyStreak(counts) {
  const byWeek = counts || countSessionsByWeek();
  const cursor = getWeekStartDate(new Date());

  // La semaine en cours n'est pas terminée : si elle n'a pas encore
  // atteint le seuil, on ne la compte pas, mais elle ne casse rien non
  // plus — on démarre alors le décompte à la semaine précédente.
  if (countSessionsInWeek(cursor, byWeek) < STREAK_MIN_SESSIONS_PER_WEEK) {
    cursor.setDate(cursor.getDate() - 7);
  }

  let streak = 0;
  while (countSessionsInWeek(cursor, byWeek) >= STREAK_MIN_SESSIONS_PER_WEEK) {
    streak++;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}

// --------------------------------------------------------------------------
// FONCTION GLOBALE : tout redessiner d'un coup (appelée en arrivant sur la page)
// --------------------------------------------------------------------------

function renderAllStatsCharts() {
  renderStatsPeriod();
  renderStatsTiles();
  renderActivityChart();
  renderRegularityCalendar();
}

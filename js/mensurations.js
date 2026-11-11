// ==========================================================================
// mensurations.js — l'onglet Mensurations (refait en version 26) :
//   - carte « Poids actuel » (tendance sur 30 jours, IMC en petit)
//   - nouvelle pesée en un geste (−1 / −0,1 / +0,1 / +1)
//   - courbe du poids avec la moyenne sur 7 jours, et le rythme par semaine
//   - objectif de poids
//   - mensurations (6 tours en cm), avec leur courbe
//   - historique compact par mois (glisser vers la gauche pour supprimer)
// La taille et l'année de naissance se règlent dans Réglages → Ton profil
// (le code de ces deux champs est en bas de ce fichier).
// ==========================================================================

const MEASURE_LABELS = {
  arm: { name: "Bras (contracté)", short: "Bras", help: "milieu du biceps, bras fléchi" },
  chest: { name: "Poitrine", short: "Poitrine", help: "sous les aisselles, à l'expiration" },
  waist: { name: "Taille", short: "Taille", help: "au niveau du nombril" },
  thigh: { name: "Cuisse", short: "Cuisse", help: "partie la plus large" },
  calf: { name: "Mollet", short: "Mollet", help: "partie la plus large" },
  neck: { name: "Cou", short: "Cou", help: "sous la pomme d'Adam" },
};

const mzHero = document.getElementById("mz-hero");
const weightFormCard = document.getElementById("weight-form");
const weightFormTitle = document.getElementById("weight-form-title");
const weightValueInput = document.getElementById("weight-value");
const weightDateInput = document.getElementById("weight-date");
const weightDateLabel = document.getElementById("weight-date-label");
const weightSubmitBtn = document.getElementById("weight-submit-btn");
const weightCancelEditBtn = document.getElementById("weight-cancel-edit");
const weightDeleteBtn = document.getElementById("weight-delete-btn");
const weightFeedback = document.getElementById("weight-feedback");
const mzChartCard = document.getElementById("mz-chart");
const mzGoalCard = document.getElementById("mz-goal");
const mzMeasuresCard = document.getElementById("mz-measures");
const weightHistoryList = document.getElementById("weight-history-list");

const DAY_MS = 86400000;
let weightEditingId = null;
let weightDateTouched = false; // date de la pesée changée à la main
let weightChartPeriod = "3m";
let weightHistoryMonths = 3;

const daysBetween = (a, b) => Math.round((parseLocalDate(b) - parseLocalDate(a)) / DAY_MS);
/** Poids avec une décimale : 55 → "55,0" (comme sur une balance). */
const kgText = (v) => (Math.round(v * 10) / 10).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** Poids sans décimale inutile : 60 → "60", 60.5 → "60,5". */
const kgShort = (v) => formatNumberFr(Math.round(v * 10) / 10, 1);
/** Rythme : "+0,25" / "−0,1". */
const signedRate = (v) => `${v >= 0 ? "+" : "−"}${formatNumberFr(Math.abs(Math.round(v * 100) / 100), 2)}`;
/** "+0,7" / "−0,3" / "0" */
const signedKg = (v) => {
  const r = Math.round(v * 10) / 10;
  if (r === 0) return "0";
  return `${r > 0 ? "+" : "−"}${formatNumberFr(Math.abs(r), 1)}`;
};
const dayMonth = (date) => parseLocalDate(date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

/** Pesées triées de la plus ancienne à la plus récente (à date égale : ordre d'ajout). */
function sortedWeights() {
  return getAllBodyweightEntries()
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e && Number(e.weight) > 0 && isValidDateString(e.date))
    .sort((a, b) => (a.e.date < b.e.date ? -1 : a.e.date > b.e.date ? 1 : a.i - b.i))
    .map(({ e }) => ({ ...e, weight: Number(e.weight) }));
}

/** Moyenne des pesées des 7 derniers jours, pour chaque pesée (lisse l'eau, les repas…). */
function movingAverage(entries) {
  return entries.map((entry) => {
    const window = entries.filter((x) => x.date <= entry.date && daysBetween(x.date, entry.date) < 7);
    return { date: entry.date, value: window.reduce((sum, x) => sum + x.weight, 0) / window.length };
  });
}

/**
 * Rythme en kg par semaine sur les 4 dernières semaines (droite de tendance
 * des pesées). null s'il n'y a pas assez de pesées (au moins 2, sur 7 jours).
 */
function weeklyWeightRate(entries) {
  if (entries.length < 2) return null;
  const last = entries[entries.length - 1].date;
  const recent = entries.filter((e) => daysBetween(e.date, last) <= 28);
  if (recent.length < 2 || daysBetween(recent[0].date, last) < 7) return null;
  const xs = recent.map((e) => daysBetween(recent[0].date, e.date));
  const ys = recent.map((e) => e.weight);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) * (x - mx); });
  return den > 0 ? (num / den) * 7 : null;
}

/** Sens voulu : +1 prise de masse (par défaut), −1 si l'objectif est plus bas que le départ. */
function weightDirection() {
  const goal = getWeightGoal();
  if (goal && goal.startWeight && goal.target < goal.startWeight) return -1;
  return 1;
}

/** Appréciation du rythme : { cls, text }. */
function describeWeightRate(rate) {
  const dir = weightDirection();
  const r = rate * dir; // dans le bon sens = positif
  const value = `${signedRate(rate)} kg / semaine`;
  if (dir > 0) {
    if (r < 0) return { cls: "slow", value, text: "en baisse : mange un peu plus pour ta prise de masse." };
    if (r < 0.1) return { cls: "slow", value, text: "un peu lent pour une prise de masse." };
    if (r <= 0.5) return { cls: "good", value, text: "idéal pour une prise de masse propre." };
    return { cls: "fast", value, text: "rapide : au-delà de 0,5 kg par semaine, c'est surtout du gras." };
  }
  if (r < 0) return { cls: "slow", value, text: "en hausse, alors que ton objectif est plus bas." };
  if (r < 0.1) return { cls: "slow", value, text: "perte lente." };
  if (r <= 0.75) return { cls: "good", value, text: "bon rythme de perte." };
  return { cls: "fast", value, text: "perte rapide : attention à ne pas perdre de muscle." };
}

/**
 * Évolution du poids sur environ 30 jours : la dernière pesée comparée à la
 * pesée la plus proche d'il y a 30 jours (ou la première). Même calcul pour
 * Mensurations et le tableau de bord. { diff, span, last } ou null.
 */
function computeWeightTrend() {
  const entries = sortedWeights();
  if (entries.length < 2) return null;
  const last = entries[entries.length - 1];
  const before = entries.filter((e) => daysBetween(e.date, last.date) >= 30).pop() || entries[0];
  if (before === last || before.date === last.date) return null;
  return { diff: last.weight - before.weight, span: daysBetween(before.date, last.date), last };
}

// --------------------------------------------------------------------------
// CARTE « POIDS ACTUEL » + IMC EN PETIT
// --------------------------------------------------------------------------

const BMI_CATEGORIES = [
  { max: 18.5, label: "sous-poids", color: "#5B9BD9" },
  { max: 25, label: "normal", color: "#4CAF7D" },
  { max: 30, label: "surpoids", color: "#D3A24E" },
  { max: Infinity, label: "obésité", color: "#E1584F" },
];
const BMI_SCALE_MIN = 16;
const BMI_SCALE_MAX = 35;

function bmiCategoryFor(bmi) {
  return BMI_CATEGORIES.find((cat) => bmi < cat.max) || BMI_CATEGORIES[BMI_CATEGORIES.length - 1];
}

function renderWeightHero() {
  const entries = sortedWeights();
  if (entries.length === 0) {
    mzHero.innerHTML = `
      <div class="mz-lbl">Poids actuel</div>
      <div class="mz-big"><b>—</b></div>
      <div class="mz-meta">Note ta première pesée juste en dessous : elle sert à ton IMC, au volume des exercices au poids du corps et aux barèmes de tes rangs.</div>`;
    return;
  }
  const last = entries[entries.length - 1];
  const today = todayLocalDateString();
  // Écart sur 30 jours (même calcul que le tableau de bord)
  const weightTrend = computeWeightTrend();
  let trend = "";
  if (weightTrend) {
    const { diff, span } = weightTrend;
    const arrow = Math.round(diff * 10) === 0 ? "=" : diff > 0 ? "↑" : "↓";
    const good = Math.round(diff * 10) === 0 ? "eq" : (diff * weightDirection() > 0 ? "up" : "down");
    trend = `<span class="mz-trend ${good}">${arrow} ${signedKg(diff)} kg en ${span} j</span>`;
  } else {
    trend = `<span class="mz-trend eq">Première pesée</span>`;
  }
  const ago = daysBetween(last.date, today);
  const agoText = ago <= 0 ? "aujourd'hui" : ago === 1 ? "hier" : `il y a ${ago} j`;
  const height = getHeight();
  const bmi = computeBmi();
  let bmiHtml = "";
  let bmiBar = "";
  if (bmi !== null) {
    // Catégorie d'après la valeur affichée (18,5 s'affiche « normal », pas « sous-poids »)
    const cat = bmiCategoryFor(Math.round(bmi * 10) / 10);
    const pos = Math.min(100, Math.max(0, ((bmi - BMI_SCALE_MIN) / (BMI_SCALE_MAX - BMI_SCALE_MIN)) * 100));
    bmiHtml = `<div class="mz-imc"><div class="mz-lbl">IMC</div><b>${kgText(bmi)}</b><span style="color:${cat.color}">${cat.label}</span></div>`;
    bmiBar = `<div class="mz-bar" aria-hidden="true"><i style="left:calc(${pos.toFixed(1)}% - 2px)"></i></div>
      <div class="mz-bar-l" aria-hidden="true"><span>16</span><span>18,5</span><span>25</span><span>30</span><span>35</span></div>`;
  }
  mzHero.innerHTML = `
    <div class="mz-row">
      <div><div class="mz-lbl">Poids actuel</div><div class="mz-big"><b>${kgText(last.weight)}</b><span>kg</span></div>${trend}</div>
      ${bmiHtml}
    </div>
    ${bmiBar}
    <div class="mz-meta">Dernière pesée ${agoText}${height ? ` · taille ${formatNumberFr(height)} cm · l'IMC compte mal le muscle, c'est juste un repère` : ""}</div>
    ${height ? "" : `<button type="button" class="mz-link" id="mz-go-height">Indique ta taille dans Réglages pour voir ton IMC ›</button>`}`;
  const goHeight = document.getElementById("mz-go-height");
  if (goHeight) goHeight.addEventListener("click", focusHeightSetting);
}

function focusHeightSetting() {
  goToSection("reglages");
  const input = document.getElementById("height-input");
  if (input) {
    if (typeof input.scrollIntoView === "function") input.scrollIntoView({ behavior: "smooth", block: "center" });
    input.focus({ preventScroll: true });
  }
}

// --------------------------------------------------------------------------
// NOUVELLE PESÉE EN UN GESTE
// --------------------------------------------------------------------------

/** Libellé de la date choisie : « Aujourd'hui », « Hier » ou « lun. 3 nov. ». */
function updateWeightDateLabel() {
  const date = weightDateInput.value;
  const today = todayLocalDateString();
  if (!date || date === today) weightDateLabel.textContent = "Aujourd'hui";
  else if (daysBetween(date, today) === 1) weightDateLabel.textContent = "Hier";
  else weightDateLabel.textContent = parseLocalDate(date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

/** Remet la saisie à zéro : date du jour, dernier poids prérempli. */
function resetWeightEntry() {
  weightEditingId = null;
  const entries = sortedWeights();
  weightValueInput.value = entries.length ? kgText(entries[entries.length - 1].weight) : "";
  weightDateInput.value = todayLocalDateString();
  weightDateTouched = false;
  weightFormTitle.textContent = "Nouvelle pesée";
  weightSubmitBtn.textContent = "Enregistrer";
  weightCancelEditBtn.hidden = true;
  weightDeleteBtn.hidden = true;
  weightFormCard.classList.remove("is-edit");
  updateWeightDateLabel();
}

function readWeightInput() {
  const value = rfParseNumber(weightValueInput.value);
  return Number.isFinite(value) && value > 0 ? value : null;
}

weightFormCard.querySelectorAll("[data-step]").forEach((button) => {
  button.addEventListener("click", () => {
    const current = readWeightInput();
    if (current === null) {
      weightValueInput.focus();
      return;
    }
    const next = Math.max(1, Math.round((current + Number(button.dataset.step)) * 10) / 10);
    weightValueInput.value = kgText(next);
  });
});

weightDateInput.addEventListener("change", () => {
  if (!isValidDateString(weightDateInput.value)) weightDateInput.value = todayLocalDateString();
  weightDateTouched = weightDateInput.value !== todayLocalDateString();
  updateWeightDateLabel();
});

/** v28 : appli restée ouverte d'un jour à l'autre → « Aujourd'hui » reste vrai. */
function refreshWeightDateIfStale() {
  if (weightEditingId || weightDateTouched) return;
  const today = todayLocalDateString();
  if (weightDateInput.value === today) return;
  weightDateInput.value = today;
  updateWeightDateLabel();
}
// iPhone : l'étiquette suit la roue des dates pendant qu'on la tourne
weightDateInput.addEventListener("input", () => {
  if (isValidDateString(weightDateInput.value)) updateWeightDateLabel();
});

function showWeightFeedback(message, isError) {
  weightFeedback.textContent = message;
  weightFeedback.className = "form-feedback rf-toast " + (isError ? "form-feedback-error" : "form-feedback-success");
  setTimeout(() => { weightFeedback.textContent = ""; }, 3000);
}

/** Après chaque changement de poids : tout ce qui en dépend est recalculé. */
function afterWeightChange() {
  renderMensurations();
  // Le poids de corps change les seuils de rang (avant le tableau de bord,
  // pour que la carte « Prochain palier » soit à jour)
  if (typeof notifyRankProgress === "function") notifyRankProgress();
  if (typeof renderDashboard === "function") renderDashboard();
}

weightSubmitBtn.addEventListener("click", () => {
  refreshWeightDateIfStale();
  const date = weightDateInput.value;
  const weight = readWeightInput();
  if (!isValidDateString(date) || weight === null || weight > 400) {
    showWeightFeedback("Merci d'indiquer une date et un poids valides.", true);
    return;
  }
  const rounded = Math.round(weight * 10) / 10;
  if (weightEditingId) {
    updateBodyweightEntry(weightEditingId, { date, weight: rounded });
    showWeightFeedback("Pesée mise à jour !", false);
  } else {
    addBodyweightEntry(date, rounded);
    showWeightFeedback("Pesée enregistrée !", false);
  }
  weightEditingId = null;
  afterWeightChange();
});

weightCancelEditBtn.addEventListener("click", () => {
  resetWeightEntry();
});

/** Supprimer la pesée en cours de modification (sur ordinateur, pas de glissement). */
weightDeleteBtn.addEventListener("click", () => {
  const entry = getAllBodyweightEntries().find((e) => e.id === weightEditingId);
  if (!entry) { resetWeightEntry(); return; }
  if (!confirm(`Supprimer la pesée du ${dayMonth(entry.date)} (${kgText(entry.weight)} kg) ?`)) return;
  deleteBodyweightEntry(entry.id);
  weightEditingId = null;
  afterWeightChange();
  showWeightFeedback("Pesée supprimée.", false);
});

/** Toucher une ligne de l'historique : la pesée revient dans la carte pour être modifiée. */
function startEditWeightEntry(entry) {
  weightEditingId = entry.id;
  weightValueInput.value = kgText(entry.weight);
  weightDateInput.value = entry.date;
  updateWeightDateLabel();
  weightFormTitle.textContent = `Modifier · ${dayMonth(entry.date)}`;
  weightSubmitBtn.textContent = "Mettre à jour";
  weightCancelEditBtn.hidden = false;
  weightDeleteBtn.hidden = false;
  weightFormCard.classList.add("is-edit");
  if (typeof weightFormCard.scrollIntoView === "function") weightFormCard.scrollIntoView({ behavior: "smooth", block: "center" });
}

// --------------------------------------------------------------------------
// COURBE DU POIDS (pesées + moyenne sur 7 jours)
// --------------------------------------------------------------------------

const WEIGHT_PERIODS = [
  { id: "1m", label: "1 mois", days: 31 },
  { id: "3m", label: "3 mois", days: 92 },
  { id: "1y", label: "1 an", days: 366 },
  { id: "all", label: "Tout", days: Infinity },
];

/**
 * Courbe en SVG : les points gris (valeurs) et la ligne dorée (tendance).
 * points : [{ date, value }], line : [{ date, value }]
 */
function renderTrendSvg(points, line, options) {
  const W = 340;
  const H = options.height || 150;
  const pl = 34, pr = 10, pt = 10, pb = 22;
  const all = [...points, ...line].map((p) => p.value);
  let min = Math.min(...all);
  let max = Math.max(...all);
  const pad = Math.max((max - min) * 0.12, options.minPad || 0.3);
  min -= pad;
  max += pad;
  const range = max - min;
  const step = [0.5, 1, 2, 5, 10, 20].find((s) => range / s <= 5) || 50;
  const t0 = parseLocalDate(points[0].date).getTime();
  const t1 = parseLocalDate(points[points.length - 1].date).getTime();
  const x = (date) => (t1 === t0 ? (pl + W - pr) / 2 : pl + ((parseLocalDate(date).getTime() - t0) / (t1 - t0)) * (W - pl - pr));
  const y = (v) => pt + (1 - (v - min) / range) * (H - pt - pb);
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(Math.round(v * 10) / 10);
  const path = line.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const lastLine = line[line.length - 1];
  const today = todayLocalDateString();
  const endLabel = points[points.length - 1].date === today ? "aujourd'hui" : dayMonth(points[points.length - 1].date);
  return `<svg class="mz-svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${escapeHtml(options.label || "Courbe")}">
    ${ticks.map((v) => `<line x1="${pl}" x2="${W - pr}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#2A2D32"/><text x="${pl - 6}" y="${(y(v) + 3).toFixed(1)}" fill="#7B7F86" font-size="10" text-anchor="end">${formatNumberFr(v)}</text>`).join("")}
    ${line.length > 1 ? `<path d="${path} L${x(lastLine.date).toFixed(1)} ${H - pb} L${x(line[0].date).toFixed(1)} ${H - pb}Z" fill="rgba(211,162,78,.12)"/>` : ""}
    ${options.showPoints ? points.map((p) => `<circle cx="${x(p.date).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3" fill="#7B7F86"/>`).join("") : ""}
    ${line.length > 1 ? `<path d="${path}" fill="none" stroke="#E3B566" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
    <circle cx="${x(lastLine.date).toFixed(1)}" cy="${y(lastLine.value).toFixed(1)}" r="5" fill="#17191C" stroke="#E3B566" stroke-width="3"/>
    <text x="${pl}" y="${H - 4}" fill="#7B7F86" font-size="10">${escapeHtml(dayMonth(points[0].date))}</text>
    <text x="${W - pr}" y="${H - 4}" fill="#7B7F86" font-size="10" text-anchor="end">${escapeHtml(endLabel)}</text>
  </svg>`;
}

function renderWeightChart() {
  const entries = sortedWeights();
  if (entries.length < 2) {
    mzChartCard.innerHTML = `<div class="mz-lbl">Évolution</div><p class="mz-empty">Note au moins 2 pesées pour voir ta courbe et ton rythme de prise de masse.</p>`;
    return;
  }
  const period = WEIGHT_PERIODS.find((p) => p.id === weightChartPeriod) || WEIGHT_PERIODS[1];
  const lastDate = entries[entries.length - 1].date;
  const averages = movingAverage(entries);
  let visible = entries.filter((e) => daysBetween(e.date, lastDate) < period.days);
  let avgVisible = averages.filter((a) => daysBetween(a.date, lastDate) < period.days);
  if (visible.length < 2) { visible = entries.slice(-2); avgVisible = averages.slice(-2); }
  const rate = weeklyWeightRate(entries);
  const rateInfo = rate === null ? null : describeWeightRate(rate);
  mzChartCard.innerHTML = `
    <div class="mz-lbl">Évolution</div>
    <div class="mz-chips" role="group" aria-label="Période">${WEIGHT_PERIODS.map((p) => `<button type="button" class="mz-chip${p.id === period.id ? " on" : ""}" data-period="${p.id}" aria-pressed="${p.id === period.id}">${p.label}</button>`).join("")}</div>
    ${renderTrendSvg(visible.map((e) => ({ date: e.date, value: e.weight })), avgVisible, { showPoints: true, label: "Courbe du poids" })}
    <div class="mz-leg"><span class="p">pesées</span><span>moyenne sur 7 jours (ta vraie tendance)</span></div>
    ${rateInfo
      ? `<div class="mz-rate ${rateInfo.cls}"><span>Rythme : <b>${rateInfo.value}</b> sur 4 semaines — ${escapeHtml(rateInfo.text)}</span></div>`
      : `<p class="mz-meta">Le rythme par semaine s'affiche dès que tes pesées couvrent au moins 7 jours.</p>`}`;
  mzChartCard.querySelectorAll("[data-period]").forEach((chip) => chip.addEventListener("click", () => {
    weightChartPeriod = chip.dataset.period;
    renderWeightChart();
  }));
}

// --------------------------------------------------------------------------
// OBJECTIF DE POIDS
// --------------------------------------------------------------------------

function renderWeightGoal() {
  const goal = getWeightGoal();
  const entries = sortedWeights();
  const current = entries.length ? entries[entries.length - 1].weight : null;
  if (!goal) {
    mzGoalCard.innerHTML = `
      <div class="mz-goal-top"><div class="mz-lbl">Objectif</div></div>
      <p class="mz-meta" style="margin-top:6px">Fixe un poids cible pour suivre ta progression et savoir quand tu l'atteindras à ton rythme actuel.</p>
      <button type="button" class="rf-btn rf-btn-ghost rf-btn-wide" id="mz-goal-set">Fixer un objectif</button>`;
    document.getElementById("mz-goal-set").addEventListener("click", openWeightGoalSheet);
    return;
  }
  const start = goal.startWeight || (entries.length ? entries[0].weight : goal.target);
  const span = goal.target - start;
  const done = current === null ? 0 : (span === 0 ? 1 : (current - start) / span);
  const pct = Math.max(0, Math.min(100, done * 100));
  const remaining = current === null ? null : Math.round((goal.target - current) * 10) / 10;
  const reached = remaining !== null && (span >= 0 ? remaining <= 0 : remaining >= 0);
  let note = "";
  if (current === null) {
    note = "Note une pesée pour suivre ta progression.";
  } else if (reached) {
    note = "<b>Objectif atteint !</b> Tu peux en fixer un nouveau.";
  } else {
    const rate = weeklyWeightRate(entries);
    if (rate !== null && Math.sign(rate) === Math.sign(remaining) && Math.abs(rate) >= 0.02) {
      const weeks = Math.abs(remaining / rate);
      const when = new Date(parseLocalDate(todayLocalDateString()).getTime() + weeks * 7 * DAY_MS);
      note = `À ce rythme (${signedRate(rate)} kg/sem.), atteint vers <b>${escapeHtml(when.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }))}</b>.`;
    } else {
      note = "Ton rythme actuel ne permet pas encore d'estimer une date.";
    }
  }
  mzGoalCard.innerHTML = `
    <div class="mz-goal-top"><div class="mz-lbl">Objectif</div><b>${kgShort(goal.target)} kg</b></div>
    <div class="mz-prog" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><div style="width:${pct.toFixed(1)}%"></div></div>
    <div class="mz-goal-l"><span>départ ${kgShort(start)} kg</span><span>${remaining === null ? "" : reached ? "atteint" : `encore ${formatNumberFr(Math.abs(remaining), 1)} kg`}</span></div>
    <div class="mz-goal-note">${note}</div>
    <button type="button" class="mz-link" id="mz-goal-edit">Modifier l'objectif ›</button>`;
  document.getElementById("mz-goal-edit").addEventListener("click", openWeightGoalSheet);
}

function openWeightGoalSheet() {
  const goal = getWeightGoal();
  const entries = sortedWeights();
  const current = entries.length ? entries[entries.length - 1].weight : null;
  openSheet((sheet, close) => {
    sheet.insertAdjacentHTML("beforeend", `
      <h2>${goal ? "Modifier l'objectif" : "Objectif de poids"}</h2>
      <p class="rc-info-p">${current !== null ? `Poids actuel : <b>${kgText(current)} kg</b>. ` : ""}Pour une prise de masse propre, vise 0,1 à 0,5 kg de plus par semaine.</p>
      <div class="mz-step mz-step-sheet">
        <button type="button" class="s" data-goal-step="-1">−1</button>
        <button type="button" data-goal-step="-0.5">−0,5</button>
        <label class="mz-step-val"><input type="text" inputmode="decimal" id="mz-goal-input" aria-label="Poids cible (kg)" autocomplete="off"><small>kg</small></label>
        <button type="button" data-goal-step="0.5">+0,5</button>
        <button type="button" class="s" data-goal-step="1">+1</button>
      </div>
      <p class="form-feedback" id="mz-goal-feedback"></p>
      <button type="button" class="rf-btn rf-btn-gold rf-btn-wide" data-act="save">Enregistrer l'objectif</button>
      ${goal ? `<button type="button" class="rf-link-danger" data-act="delete">Supprimer l'objectif</button>` : ""}`);
    const input = sheet.querySelector("#mz-goal-input");
    input.value = kgShort(goal ? goal.target : current !== null ? Math.round(current + 5) : 60);
    sheet.querySelectorAll("[data-goal-step]").forEach((b) => b.addEventListener("click", () => {
      const v = rfParseNumber(input.value);
      const base = Number.isFinite(v) && v > 0 ? v : (current || 60);
      input.value = kgShort(Math.max(20, Math.round((base + Number(b.dataset.goalStep)) * 10) / 10));
    }));
    sheet.querySelector('[data-act="save"]').addEventListener("click", () => {
      const target = rfParseNumber(input.value);
      if (!(target >= 20 && target <= 300)) {
        const fb = sheet.querySelector("#mz-goal-feedback");
        fb.textContent = "Indique un poids cible valide (entre 20 et 300 kg).";
        fb.className = "form-feedback form-feedback-error";
        return;
      }
      // Un nouvel objectif repart du poids actuel ; une simple retouche garde le départ
      const keepStart = goal && goal.startWeight && Math.sign(target - goal.startWeight) === Math.sign(goal.target - goal.startWeight);
      setWeightGoal({
        target: Math.round(target * 10) / 10,
        startWeight: keepStart ? goal.startWeight : current,
        startDate: keepStart ? goal.startDate : todayLocalDateString(),
      });
      close();
      renderMensurations();
    });
    const del = sheet.querySelector('[data-act="delete"]');
    if (del) del.addEventListener("click", () => {
      if (!confirm("Supprimer ton objectif de poids ?")) return;
      clearWeightGoal();
      close();
      renderMensurations();
    });
  });
}

// --------------------------------------------------------------------------
// MENSURATIONS (tours en cm)
// --------------------------------------------------------------------------

/** Dernière valeur de chaque tour, et celle d'il y a environ 2 mois pour l'écart. */
function measurementSummary() {
  const list = getAllMeasurements();
  const summary = {};
  MEASUREMENT_KEYS.forEach((key) => {
    const withKey = list.filter((m) => m.values[key] > 0);
    if (withKey.length === 0) return;
    const last = withKey[withKey.length - 1];
    const ref = withKey.filter((m) => daysBetween(m.date, last.date) >= 56).pop() || withKey[0];
    summary[key] = { value: last.values[key], date: last.date, ref: ref !== last ? { value: ref.values[key], date: ref.date } : null };
  });
  return { list, summary };
}

const cmText = (v) => formatNumberFr(Math.round(v * 10) / 10, 1);

function renderMeasurements() {
  const { list, summary } = measurementSummary();
  if (list.length === 0) {
    mzMeasuresCard.innerHTML = `
      <div class="mz-h"><h3>Mensurations</h3><button type="button" class="mz-add" id="mz-measure-add">+ Mesurer</button></div>
      <p class="mz-empty">Note tes tours (bras, poitrine, taille…) une fois par mois : le tour de bras qui monte et le tour de taille stable, c'est le signe que tu prends du muscle.</p>`;
  } else {
    const refs = Object.values(summary).map((s) => s.ref && s.ref.date).filter(Boolean).sort();
    const lastDate = list[list.length - 1].date;
    mzMeasuresCard.innerHTML = `
      <div class="mz-h"><h3>Mensurations</h3><button type="button" class="mz-add" id="mz-measure-add">+ Mesurer</button></div>
      <div class="mz-grid">${MEASUREMENT_KEYS.map((key) => {
        const s = summary[key];
        if (!s) return `<button type="button" class="mz-m empty" data-measure="${key}"><span>${MEASURE_LABELS[key].name}</span><b>—</b><em class="eq">pas encore</em></button>`;
        let delta = `<em class="eq">première mesure</em>`;
        if (s.ref) {
          const d = Math.round((s.value - s.ref.value) * 10) / 10;
          // Tour de taille : on le garde neutre (en prise de masse, mieux vaut qu'il reste stable)
          const cls = d === 0 ? "eq" : key === "waist" ? "eq" : d > 0 ? "up" : "eq";
          delta = `<em class="${cls}">${d === 0 ? "= stable" : `${d > 0 ? "+" : "−"}${cmText(Math.abs(d))} cm`}</em>`;
        }
        return `<button type="button" class="mz-m" data-measure="${key}"><span>${MEASURE_LABELS[key].name}</span><b>${cmText(s.value)} <small>cm</small></b>${delta}</button>`;
      }).join("")}</div>
      <div class="mz-meta">${refs.length ? `Écarts depuis le ${escapeHtml(dayMonth(refs[0]))} · ` : ""}dernière mesure le ${escapeHtml(dayMonth(lastDate))}</div>`;
    mzMeasuresCard.querySelectorAll("[data-measure]").forEach((tile) => tile.addEventListener("click", () => openMeasureSheet(tile.dataset.measure)));
  }
  document.getElementById("mz-measure-add").addEventListener("click", () => openMeasureEntrySheet());
}

/** Fenêtre « Nouvelles mensurations », préremplie avec la dernière mesure. */
function openMeasureEntrySheet() {
  const { summary } = measurementSummary();
  openSheet((sheet, close) => {
    sheet.insertAdjacentHTML("beforeend", `
      <h2>Nouvelles mensurations</h2>
      <p class="rc-info-p">Préremplies avec ta dernière mesure : change seulement ce qui a bougé, laisse vide ce que tu ne mesures pas. Une fois par mois suffit, de préférence le matin.</p>
      <div class="mz-in-list">
      <label class="mz-in mz-in-date"><span>Date</span><input type="date" id="mz-measure-date"></label>
      ${MEASUREMENT_KEYS.map((key) => `<label class="mz-in"><span>${MEASURE_LABELS[key].name}<small>${MEASURE_LABELS[key].help}</small></span><span class="mz-in-cm"><input type="text" inputmode="decimal" data-key="${key}" autocomplete="off" aria-label="${MEASURE_LABELS[key].name} (cm)"><small>cm</small></span></label>`).join("")}
      </div>
      <p class="form-feedback" id="mz-measure-feedback"></p>
      <button type="button" class="rf-btn rf-btn-gold rf-btn-wide" data-act="save">Enregistrer</button>`);
    const dateInput = sheet.querySelector("#mz-measure-date");
    dateInput.value = todayLocalDateString();
    sheet.querySelectorAll("[data-key]").forEach((input) => {
      const s = summary[input.dataset.key];
      input.value = s ? cmText(s.value) : "";
    });
    sheet.querySelector('[data-act="save"]').addEventListener("click", () => {
      const fb = sheet.querySelector("#mz-measure-feedback");
      const values = {};
      for (const input of sheet.querySelectorAll("[data-key]")) {
        const text = input.value.trim();
        if (!text) continue;
        const v = rfParseNumber(text);
        if (!(v >= MEASUREMENT_MIN && v <= MEASUREMENT_MAX)) {
          fb.textContent = `${MEASURE_LABELS[input.dataset.key].name} : indique un tour en cm (entre ${MEASUREMENT_MIN} et ${MEASUREMENT_MAX}).`;
          fb.className = "form-feedback form-feedback-error";
          input.focus();
          return;
        }
        values[input.dataset.key] = Math.round(v * 10) / 10;
      }
      if (Object.keys(values).length === 0) {
        fb.textContent = "Indique au moins un tour.";
        fb.className = "form-feedback form-feedback-error";
        return;
      }
      if (!isValidDateString(dateInput.value)) {
        fb.textContent = "Merci d'indiquer une date valide.";
        fb.className = "form-feedback form-feedback-error";
        return;
      }
      const result = saveMeasurement(dateInput.value, values);
      close();
      renderMeasurements();
      showWeightFeedback(result === "updated" ? "Mensurations du jour mises à jour !" : "Mensurations enregistrées !", false);
    });
  });
}

/** Fiche d'un tour : sa courbe et toutes ses mesures. */
function openMeasureSheet(key) {
  const label = MEASURE_LABELS[key];
  const list = getAllMeasurements().filter((m) => m.values[key] > 0);
  openSheet((sheet, close) => {
    const last = list[list.length - 1];
    const first = list[0];
    let deltaText = "";
    if (list.length > 1) {
      const d = Math.round((last.values[key] - first.values[key]) * 10) / 10;
      deltaText = d === 0 ? "stable" : `${d > 0 ? "+" : "−"}${cmText(Math.abs(d))} cm depuis le ${dayMonth(first.date)}`;
    }
    sheet.insertAdjacentHTML("beforeend", `
      <h2>${escapeHtml(label.name)}</h2>
      <p class="rc-info-p" style="margin-top:-8px">${escapeHtml(label.help)}</p>
      ${last ? `<div class="rc-big"><b>${cmText(last.values[key])}</b><span>cm · le ${escapeHtml(dayMonth(last.date))}</span></div>` : `<p class="mz-empty">Pas encore mesuré.</p>`}
      ${deltaText ? `<div class="rc-origin">${escapeHtml(deltaText)}</div>` : ""}
      ${list.length > 1 ? `<div class="rc-chart">${renderTrendSvg(list.map((m) => ({ date: m.date, value: m.values[key] })), list.map((m) => ({ date: m.date, value: m.values[key] })), { height: 120, minPad: 0.5, label: label.name })}</div>` : ""}
      ${list.length ? `<div class="rf-cmp-h">Toutes tes mesures</div><div class="mz-mlist">${list.slice().reverse().map((m) => `<div><span>${escapeHtml(dayMonth(m.date))}</span><b>${cmText(m.values[key])} cm</b><button type="button" class="mz-mdel" data-id="${escapeHtml(m.id)}" aria-label="Supprimer les mensurations du ${escapeHtml(dayMonth(m.date))}">${RF_ICONS.close}</button></div>`).join("")}</div>` : ""}
      <button type="button" class="rf-btn rf-btn-gold rf-btn-wide" data-act="add">+ Mesurer</button>`);
    sheet.querySelectorAll(".mz-mdel").forEach((b) => b.addEventListener("click", () => {
      const entry = getAllMeasurements().find((m) => m.id === b.dataset.id);
      if (!entry) return;
      const count = Object.keys(entry.values).length;
      if (!confirm(`Supprimer les mensurations du ${dayMonth(entry.date)}${count > 1 ? ` (les ${count} tours notés ce jour-là)` : ""} ?`)) return;
      deleteMeasurement(entry.id);
      close();
      renderMeasurements();
      if (getAllMeasurements().some((m) => m.values[key] > 0)) openMeasureSheet(key);
    }));
    sheet.querySelector('[data-act="add"]').addEventListener("click", () => { close(); openMeasureEntrySheet(); });
  });
}

// --------------------------------------------------------------------------
// HISTORIQUE COMPACT (par mois ; glisser vers la gauche pour supprimer)
// --------------------------------------------------------------------------

function renderWeightHistory() {
  const entries = sortedWeights();
  weightHistoryList.innerHTML = "";
  if (entries.length === 0) {
    weightHistoryList.innerHTML = `<p class="mz-empty">Aucune pesée enregistrée pour l'instant.</p>`;
    return;
  }
  const newestFirst = entries.slice().reverse();
  const months = [];
  newestFirst.forEach((entry, index) => {
    const key = entry.date.slice(0, 7);
    let month = months[months.length - 1];
    if (!month || month.key !== key) {
      month = { key, label: parseLocalDate(entry.date).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }), rows: [] };
      months.push(month);
    }
    const previous = newestFirst[index + 1];
    month.rows.push({ entry, diff: previous ? entry.weight - previous.weight : null });
  });

  months.slice(0, weightHistoryMonths).forEach((month) => {
    weightHistoryList.insertAdjacentHTML("beforeend", `<div class="mz-hist-m">${escapeHtml(month.label)}</div>`);
    const box = document.createElement("div");
    box.className = "mz-list";
    month.rows.forEach(({ entry, diff }) => {
      const wrap = document.createElement("div");
      wrap.className = "rf-row-wrap mz-li-w";
      wrap.innerHTML = `<button type="button" class="rf-swipe-del" tabindex="-1">Supprimer</button>`;
      const row = document.createElement("button");
      row.type = "button";
      row.className = "mz-li";
      row.dataset.id = entry.id;
      const r = diff === null ? 0 : Math.round(diff * 10) / 10;
      row.innerHTML = `
        <span class="d">${escapeHtml(parseLocalDate(entry.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }))}</span>
        <b>${kgText(entry.weight)} kg</b>
        <em class="${diff === null || r === 0 ? "eq" : r * weightDirection() > 0 ? "up" : "dn"}">${diff === null ? "" : signedKg(diff)}</em>`;
      row.addEventListener("click", () => startEditWeightEntry(entry));
      wrap.appendChild(row);
      attachSwipeToDelete(wrap, row, () => {
        deleteBodyweightEntry(entry.id);
        if (weightEditingId === entry.id) weightEditingId = null;
        afterWeightChange();
        showWeightFeedback("Pesée supprimée.", false);
      });
      box.appendChild(wrap);
    });
    weightHistoryList.appendChild(box);
  });

  if (months.length > weightHistoryMonths) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "mz-more";
    more.textContent = "Voir les mois précédents";
    more.addEventListener("click", () => { weightHistoryMonths += 3; renderWeightHistory(); });
    weightHistoryList.appendChild(more);
  }
}

// --------------------------------------------------------------------------
// TOUTE LA PAGE
// --------------------------------------------------------------------------

/** options.keepEntry : ne pas vider la carte « Nouvelle pesée » (changement de jour). */
function renderMensurations(options) {
  renderWeightHero();
  if (!weightEditingId && !(options && options.keepEntry)) resetWeightEntry();
  renderWeightChart();
  renderWeightGoal();
  renderMeasurements();
  renderWeightHistory();
}

renderMensurations();

// --------------------------------------------------------------------------
// RÉGLAGES → TON PROFIL : TAILLE ET ANNÉE DE NAISSANCE
// Enregistrées dès qu'on quitte le champ.
// --------------------------------------------------------------------------

const heightInput = document.getElementById("height-input");
const birthYearInput = document.getElementById("birth-year-input");
const profileFieldsFeedback = document.getElementById("birth-year-feedback");

function showProfileFieldFeedback(message, isError) {
  profileFieldsFeedback.textContent = message;
  profileFieldsFeedback.className = "form-feedback " + (isError ? "form-feedback-error" : "form-feedback-success");
  setTimeout(() => { profileFieldsFeedback.textContent = ""; }, 3500);
}

heightInput.value = getHeight() || "";
birthYearInput.value = getBirthYear() || "";

heightInput.addEventListener("change", () => {
  const value = rfParseNumber(heightInput.value);
  if (heightInput.value.trim() === "") return;
  if (!(value >= 100 && value <= 250)) {
    showProfileFieldFeedback("Merci d'indiquer ta taille en cm (ex : 172).", true);
    heightInput.value = getHeight() || "";
    return;
  }
  setHeight(Math.round(value * 10) / 10);
  showProfileFieldFeedback(`Taille enregistrée : ${formatNumberFr(getHeight())} cm.`, false);
  renderWeightHero();
  if (typeof renderDashboard === "function") renderDashboard();
});

birthYearInput.addEventListener("change", () => {
  if (birthYearInput.value.trim() === "") return;
  const year = Number(birthYearInput.value);
  const currentYear = parseLocalDate(todayLocalDateString()).getFullYear();
  if (!Number.isInteger(year) || year < 1930 || year > currentYear - 10) {
    showProfileFieldFeedback("Merci d'indiquer une année valide (ex : 1998).", true);
    birthYearInput.value = getBirthYear() || "";
    return;
  }
  setBirthYear(year);
  showProfileFieldFeedback(`Enregistré : barème d'endurance pour ${getAge()} ans.`, false);
  // L'âge change les seuils d'endurance : on recalcule les rangs
  if (typeof notifyRankProgress === "function") notifyRankProgress();
  if (typeof renderDashboard === "function") renderDashboard();
});

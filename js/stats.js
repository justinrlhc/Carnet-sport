// ==========================================================================
// stats.js — les calculs automatiques de l'application.
// Pour cette étape : les Records personnels.
// (Le volume, déjà calculé dans app.js pour le dashboard, pourrait être
// déplacé ici plus tard pour tout centraliser — pas obligatoire pour l'instant.)
// ==========================================================================

/**
 * Calcule le volume d'une séance de musculation : somme de (poids x répétitions)
 * pour chaque série. Une séance de CrossFit n'a pas de volume au sens classique,
 * donc elle renvoie 0 ici.
 * Utilisée par le dashboard ET par les graphiques de statistiques.
 */
/**
 * Calcule le volume d'un exercice donné, dans une séance de musculation :
 *  - pour un exercice classique (barre/haltères) : reps × poids soulevé
 *  - pour un exercice au poids du corps (pull-up, dips, burpee...) :
 *    reps × (poids de corps actuel + éventuel lest ajouté)
 * Si l'exercice est au poids du corps mais qu'aucun poids de corps n'est
 * encore connu (onglet Mensurations vide), ses séries sont simplement
 * ignorées dans le calcul — sans jamais empêcher d'enregistrer la séance.
 */
function computeExerciseVolume(exerciseEntry) {
  if (!exerciseEntry || !Array.isArray(exerciseEntry.sets)) return 0; // donnée malformée : on l'ignore sans planter
  if (typeof isNoVolumeExercise === "function" && isNoVolumeExercise(exerciseEntry.exercise)) return 0;

  const isBW = typeof isBodyweightExercise === "function" && isBodyweightExercise(exerciseEntry.exercise);

  if (!isBW) {
    return exerciseEntry.sets.reduce((total, set) => total + set.reps * set.weight, 0);
  }

  const bodyweight = typeof getCurrentBodyweight === "function" ? getCurrentBodyweight() : null;
  if (bodyweight === null) return 0; // poids de corps inconnu : pas de calcul possible pour l'instant

  return exerciseEntry.sets.reduce((total, set) => total + set.reps * (bodyweight + (set.weight || 0)), 0);
}

function computeSessionVolume(session) {
  if (session.type === "musculation" && session.exercises) {
    return session.exercises.reduce((total, ex) => total + computeExerciseVolume(ex), 0);
  }
  if (session.type === "crossfit" && session.exercises) {
    return session.exercises.reduce((total, entry) => {
      if (typeof entry !== "object" || entry === null) return total; // mouvement en texte libre : pas de volume calculable
      return total + computeCrossfitStructuredVolume(session, entry);
    }, 0);
  }
  return 0;
}

/**
 * Calcule le volume d'un exercice structuré au sein d'un WOD CrossFit.
 * Pour un AMRAP, les répétitions sont multipliées par le nombre de tours
 * complets réalisés, plus d'éventuelles répétitions supplémentaires du
 * tour partiel. Pour les autres formats (For Time, EMOM, Chipper...), les
 * répétitions saisies sont déjà le total réalisé sur tout le WOD.
 * Un exercice au poids du corps applique la même logique que dans
 * l'onglet Musculation (poids de corps actuel + éventuel lest).
 */
function computeCrossfitStructuredVolume(session, entry) {
  if (typeof isNoVolumeExercise === "function" && isNoVolumeExercise(entry.exercise)) return 0;
  if (typeof getEntryUnit === "function" && getEntryUnit(entry) !== "reps") return 0; // calories / mètres : pas de volume en kg

  const isBW = typeof isBodyweightExercise === "function" && isBodyweightExercise(entry.exercise);
  let perRepWeight;

  if (isBW) {
    const bodyweight = typeof getCurrentBodyweight === "function" ? getCurrentBodyweight() : null;
    if (bodyweight === null) return 0; // poids de corps inconnu : pas de calcul possible pour l'instant
    perRepWeight = bodyweight + (entry.weight || 0);
  } else {
    perRepWeight = entry.weight || 0;
  }

  const isAmrap = session.wodType === "AMRAP" && typeof session.rounds === "number";
  const totalReps = isAmrap
    ? (entry.reps || 0) * session.rounds + (entry.extraReps || 0)
    : (entry.reps || 0);

  return totalReps * perRepWeight;
}

/** Renvoie true si une date (format "AAAA-MM-JJ") tombe dans les X derniers jours. */
function isWithinLastDays(dateStr, nbDays) {
  const date = new Date(dateStr);
  const limit = new Date();
  limit.setDate(limit.getDate() - nbDays);
  return date >= limit;
}

/**
 * Estime le 1RM (la charge maximale que tu pourrais soulever une seule fois)
 * à partir d'une série réellement effectuée, grâce à la formule d'Epley,
 * une formule standard largement utilisée en musculation.
 *
 * Formule : 1RM ≈ poids × (1 + répétitions / 30)
 *
 * RÈGLE UNIQUE pour toute l'appli (Records, Statistiques, Profil) : au-delà
 * de 10 répétitions l'estimation n'est plus fiable, la série compte alors
 * simplement pour la charge réellement soulevée.
 */
const MAX_REPS_FOR_1RM_ESTIMATE = 10;

function estimateOneRepMax(weight, reps) {
  if (reps <= 1) return weight; // à 1 répétition, le "1RM" est simplement le poids soulevé
  if (reps > MAX_REPS_FOR_1RM_ESTIMATE) return weight; // série trop longue : charge soulevée
  return weight * (1 + reps / 30);
}

/**
 * Parcourt toutes les séances (musculation ET exercices structurés des
 * WOD CrossFit) et calcule, pour chaque exercice pratiqué :
 *  - le 1RM estimé le plus élevé jamais atteint (record de force estimé)
 *  - la charge la plus lourde jamais soulevée, quel que soit le nombre de reps
 *  - le plus grand nombre de répétitions jamais réalisé sur une série
 *
 * Important sur les données venant d'un WOD CrossFit : on ne sait jamais
 * si les répétitions saisies ont été faites d'un seul tenant ou réparties
 * en plusieurs petites séries pendant le WOD (que ce soit un total AMRAP
 * cumulé sur plusieurs tours, ou même un total "For Time" comme 50 reps
 * fractionnées). Un 1RM estimé ou un "reps max" calculés là-dessus
 * seraient donc trompeurs. Le CrossFit alimente donc uniquement la
 * charge maximale utilisée (un fait solide, peu importe le découpage des
 * séries) — jamais le 1RM estimé ni les reps max, qui restent réservés
 * aux vraies séries enregistrées dans l'onglet Musculation.
 */
function computeMuscuRecords(options) {
  const before = options && options.before; // "AAAA-MM-JJ" : ne compter que les séances antérieures
  const records = {}; // { "Back Squat": { oneRM: {...}, maxWeight: {...}, maxReps: {...} } }

  function ensureRecord(exercise) {
    if (!records[exercise]) {
      records[exercise] = { oneRM: null, maxWeight: null, maxReps: null };
    }
    return records[exercise];
  }

  /** Une vraie série (musculation) : alimente le 1RM, la charge max et les reps max. */
  function registerSet(exercise, set, date) {
    const rec = ensureRecord(exercise);
    const estimated1RM = estimateOneRepMax(set.weight, set.reps);

    if (!rec.oneRM || estimated1RM > rec.oneRM.value) {
      rec.oneRM = { value: estimated1RM, weight: set.weight, reps: set.reps, date };
    }
    if (!rec.maxWeight || set.weight > rec.maxWeight.value) {
      rec.maxWeight = { value: set.weight, reps: set.reps, date };
    }
    if (!rec.maxReps || set.reps > rec.maxReps.value) {
      rec.maxReps = { value: set.reps, weight: set.weight, date };
    }
  }

  /** Un exercice structuré vu dans un WOD : alimente uniquement la charge max utilisée. */
  function registerWeightUsage(exercise, weight, date) {
    if (!weight || weight <= 0) return; // rien de fiable à en tirer sans charge réelle
    const rec = ensureRecord(exercise);
    if (!rec.maxWeight || weight > rec.maxWeight.value) {
      rec.maxWeight = { value: weight, reps: null, date, source: "crossfit" };
    }
  }

  getAllSessions().forEach((session) => {
    if (before && session.date >= before) return;
    if (session.type === "musculation") {
      (session.exercises || []).forEach((entry) => {
        if (!entry || !Array.isArray(entry.sets)) return; // donnée malformée : on l'ignore sans planter
        entry.sets.forEach((set) => registerSet(entry.exercise, set, session.date));
      });
    } else if (session.type === "crossfit") {
      // Un cours de spé (gym, haltéro) se fait en séries techniques, pas en
      // WOD chronométré : ses exercices structurés comptent comme de vraies
      // séries de musculation. Dans un WOD classique, seule la charge utilisée compte.
      const isSpe = typeof isSpeSession === "function" && isSpeSession(session.wodName);
      (session.exercises || []).forEach((entry) => {
        if (typeof entry === "object" && entry !== null && entry.reps > 0) {
          if (typeof getEntryUnit === "function" && getEntryUnit(entry) !== "reps") return; // calories / mètres
          if (isSpe) {
            registerSet(entry.exercise, { reps: entry.reps, weight: entry.weight || 0 }, session.date);
          } else {
            registerWeightUsage(entry.exercise, entry.weight || 0, session.date);
          }
        }
      });
    }
  });

  return records;
}

/**
 * Compare les charges avant/après l'ajout d'un WOD pour détecter si un
 * exercice structuré vient de battre la charge maximale connue pour cet
 * exercice. Utilisée à la place de detectMuscuNewRecords pour le
 * CrossFit, puisque le CrossFit n'alimente que la charge max, pas le 1RM.
 */
function detectStructuredWeightRecords(recordsBefore, structuredEntries) {
  const hits = [];
  structuredEntries.forEach((entry) => {
    if (!entry.weight || entry.weight <= 0) return;
    const before = recordsBefore[entry.exercise];
    const isNewRecord = !before || !before.maxWeight || entry.weight > before.maxWeight.value;
    if (isNewRecord) hits.push({ exercise: entry.exercise, value: entry.weight });
  });
  return hits;
}

/** Ordre d'affichage des niveaux CrossFit (du plus exigeant au plus adapté). */
const CF_LEVEL_ORDER = ["RX", "Inter", "Scaled"];

/** Niveau d'une séance ou d'un résultat noté ; les anciennes données sans niveau comptent comme RX. */
function getCfLevel(entry) {
  return entry && CF_LEVEL_ORDER.includes(entry.rxOrScaled || entry.level) ? (entry.rxOrScaled || entry.level) : "RX";
}

/** Un WOD "avec un nom" peut avoir des records : pas le WOD du jour (différent à chaque fois), ni les cours de spé. */
function isRecordableWod(wodName) {
  if (!wodName) return false;
  if (typeof DAILY_WOD_LABEL !== "undefined" && wodName === DAILY_WOD_LABEL) return false;
  if (typeof isSpeSession === "function" && isSpeSession(wodName)) return false;
  return true;
}

/** Vrai si la performance a (rounds + reps) bat la performance b. */
function isBetterPerformance(a, b) {
  return !b || a.rounds > b.rounds || (a.rounds === b.rounds && (a.extraReps || 0) > (b.extraReps || 0));
}

/**
 * Parcourt les séances de CrossFit et calcule, pour chaque WOD et chaque
 * NIVEAU (RX, Inter, Scaled) — un Fran en Scaled ne se compare pas à un Fran RX :
 *  - le meilleur temps (le plus petit, pour les WOD chronométrés)
 *  - la meilleure performance en rounds/reps (la plus grande, pour les AMRAP)
 * Le "WOD du jour" et les cours de spé sont exclus : ce ne sont pas des WOD
 * comparables d'une fois sur l'autre.
 * Forme : { "Fran": { "RX": { bestTime, bestPerformance }, "Scaled": {...} } }
 */
function computeCfRecords(options) {
  const before = options && options.before;
  const records = {};

  getAllSessions().forEach((session) => {
    if (session.type !== "crossfit" || !isRecordableWod(session.wodName)) return;
    if (before && session.date >= before) return;
    const hasTime = session.timeSeconds !== null && session.timeSeconds !== undefined;
    const hasRounds = session.rounds !== null && session.rounds !== undefined;
    if (!hasTime && !hasRounds) return; // WOD sans score (EMOM, Tabata...) : rien à comparer
    const level = getCfLevel(session);
    records[session.wodName] = records[session.wodName] || {};
    const rec = (records[session.wodName][level] = records[session.wodName][level] || { bestTime: null, bestPerformance: null });

    if (session.timeSeconds !== null && session.timeSeconds !== undefined) {
      if (!rec.bestTime || session.timeSeconds < rec.bestTime.value) {
        rec.bestTime = { value: session.timeSeconds, date: session.date };
      }
    }
    if (session.rounds !== null && session.rounds !== undefined) {
      const perf = { rounds: session.rounds, extraReps: session.extraReps || 0, date: session.date };
      if (isBetterPerformance(perf, rec.bestPerformance)) rec.bestPerformance = perf;
    }
  });

  return records;
}

/**
 * Compare les records d'AVANT et d'APRÈS l'ajout d'une séance de musculation
 * pour détecter si l'un des exercices de cette séance vient de battre un
 * record de 1RM estimé. Utilisée juste après addSession() pour afficher
 * un petit badge "Nouveau record !" à l'utilisateur.
 */
function detectMuscuNewRecords(recordsBeforeSave, newExercises, sessionDate) {
  const recordsAfterSave = computeMuscuRecords();
  const hits = [];

  newExercises.forEach((entry) => {
    const before = recordsBeforeSave[entry.exercise];
    const after = recordsAfterSave[entry.exercise];
    if (!after || !after.oneRM || after.oneRM.date !== sessionDate) return;

    const isNewRecord = !before || !before.oneRM || after.oneRM.value > before.oneRM.value;
    if (isNewRecord) {
      hits.push({ exercise: entry.exercise, value: Math.round(after.oneRM.value) });
    }
  });

  return hits;
}

/**
 * Même principe pour le CrossFit : détecte si le WOD qu'on vient d'enregistrer
 * bat le meilleur temps ou la meilleure performance précédente AU MÊME NIVEAU
 * (comme en musculation, un tout premier résultat compte comme un record).
 */
function detectCfNewRecords(recordsBeforeSave, wodName, level, sessionDate) {
  if (!isRecordableWod(wodName)) return null;
  const before = (recordsBeforeSave[wodName] && recordsBeforeSave[wodName][level]) || { bestTime: null, bestPerformance: null };
  const afterAll = computeCfRecords()[wodName];
  const after = afterAll && afterAll[level];
  if (!after) return null;

  if (after.bestTime && after.bestTime.date === sessionDate && (!before.bestTime || after.bestTime.value < before.bestTime.value)) {
    return { type: "time", level, value: formatSecondsToTime(after.bestTime.value) };
  }
  if (after.bestPerformance && after.bestPerformance.date === sessionDate &&
      isBetterPerformance(after.bestPerformance, before.bestPerformance)) {
    const extra = after.bestPerformance.extraReps ? ` + ${after.bestPerformance.extraReps}` : "";
    return { type: "performance", level, value: `${after.bestPerformance.rounds}${extra}` };
  }
  return null;
}

// --------------------------------------------------------------------------
// AFFICHAGE DE LA PAGE RECORDS
// (avec fusion des records calculés à partir des séances ET des records
// saisis manuellement — le plus élevé des deux est affiché en priorité,
// avec toujours une indication claire de sa source)
// --------------------------------------------------------------------------

// ----- Éléments du formulaire "1RM connu" (musculation) -----
const manual1rmForm = document.getElementById("manual-1rm-form");
const manual1rmExerciseSelect = document.getElementById("manual-1rm-exercise-select");
const manual1rmExerciseCustom = document.getElementById("manual-1rm-exercise-custom");
const manual1rmWeightInput = document.getElementById("manual-1rm-weight");
const manual1rmDateInput = document.getElementById("manual-1rm-date");
const manual1rmNotesInput = document.getElementById("manual-1rm-notes");
const btnToggle1rmForm = document.getElementById("btn-toggle-1rm-form");
const btnCancel1rmForm = document.getElementById("btn-cancel-1rm-form");

// ----- Éléments du formulaire "résultat connu" (CrossFit) -----
const manualCfForm = document.getElementById("manual-cf-record-form");
const manualCfWodSelect = document.getElementById("manual-cf-wod-select");
const manualCfWodCustom = document.getElementById("manual-cf-wod-custom");
const manualCfTimeInput = document.getElementById("manual-cf-time");
const manualCfRoundsInput = document.getElementById("manual-cf-rounds");
const manualCfExtraRepsInput = document.getElementById("manual-cf-extra-reps");
const manualCfDateInput = document.getElementById("manual-cf-date");
const manualCfNotesInput = document.getElementById("manual-cf-notes");
const manualCfLevelSelect = document.getElementById("manual-cf-level");
const btnToggleCfForm = document.getElementById("btn-toggle-cf-record-form");
const btnCancelCfForm = document.getElementById("btn-cancel-cf-record-form");

function renderRecords() {
  const muscuGrid = document.getElementById("records-muscu-grid");
  const cfGrid = document.getElementById("records-cf-grid");
  if (!muscuGrid || !cfGrid) return; // sécurité si la page n'est pas encore dans le DOM

  renderRecordFeed();

  // Exercices / WOD qui ont un graphique dans Statistiques
  const chartable = typeof getChartableExercises === "function" ? getChartableExercises() : { lifts: [], cardio: [] };

  // ========== MUSCULATION ==========
  const sessionRecords = computeMuscuRecords();
  const manualOneRMs = getManualOneRMs();
  const exerciseNames = Array.from(new Set([...Object.keys(sessionRecords), ...Object.keys(manualOneRMs)])).sort();

  muscuGrid.innerHTML = "";
  if (exerciseNames.length === 0) {
    muscuGrid.innerHTML = `<p class="empty-text">Ajoute une séance ou note un 1RM connu pour voir apparaître tes records ici.</p>`;
  }

  exerciseNames.forEach((exercise) => {
    const sessionRec = sessionRecords[exercise] || null;
    const manual = manualOneRMs[exercise] || null;
    const isBW = typeof isBodyweightExercise === "function" && isBodyweightExercise(exercise);

    // Exercice au poids du corps (pull-up, dips...) : ce qui compte, ce sont
    // les répétitions max en une série. Un "1RM" n'aurait pas de sens (il
    // vaudrait 0 kg sans lest) : le lest max apparaît seulement en dessous.
    const showRepsHeadline = isBW && sessionRec && sessionRec.maxReps && sessionRec.maxReps.value > 0;

    // Sinon : la valeur la plus élevée entre l'estimation calculée et la
    // valeur saisie manuellement, en gardant toujours une trace de sa source.
    const estimate = sessionRec && sessionRec.oneRM && sessionRec.oneRM.value > 0 ? sessionRec.oneRM : null;
    let headline = null;
    if (!showRepsHeadline) {
      if (manual && (!estimate || manual.weight >= estimate.value)) {
        headline = { value: manual.weight, source: "manual", date: manual.date };
      } else if (estimate) {
        headline = { value: estimate.value, source: "estimated", date: estimate.date };
      }
    }
    // Exercice jamais vu en musculation, seulement dans un WOD : on n'a
    // qu'une charge max utilisée, jamais de 1RM (voir note plus haut).
    const showWeightOnlyHeadline = !headline && !showRepsHeadline && sessionRec && sessionRec.maxWeight;

    let otherValueNote = "";
    if (manual && showRepsHeadline) {
      otherValueNote = `<span>Lest max noté (1 rep) : ${formatKgValue(manual.weight)} kg</span>`;
    } else if (manual && estimate && Math.round(estimate.value) !== Math.round(manual.weight)) {
      otherValueNote = `<span>Estimé à partir des séances : ${Math.round(estimate.value)} kg</span>`;
    }

    const subLineParts = [];
    if (sessionRec && sessionRec.maxWeight && sessionRec.maxWeight.value > 0) {
      const repsText = sessionRec.maxWeight.reps ? ` × ${sessionRec.maxWeight.reps}` : "";
      const fromWod = sessionRec.maxWeight.source === "crossfit" ? " (vu en WOD)" : "";
      subLineParts.push(`<span>${isBW ? "Lest max" : "Charge max"} : ${formatKgValue(sessionRec.maxWeight.value)} kg${repsText}${fromWod}</span>`);
    }
    if (sessionRec && sessionRec.maxReps && !showRepsHeadline) {
      subLineParts.push(`<span>Reps max : ${sessionRec.maxReps.value}${sessionRec.maxReps.weight > 0 ? ` (à ${formatKgValue(sessionRec.maxReps.weight)} kg)` : ""}</span>`);
    }
    if (otherValueNote) subLineParts.push(otherValueNote);

    let subLines = "";
    if (subLineParts.length > 0) {
      subLines = `<div class="record-sub">${subLineParts.join("")}</div>`;
    } else if (!showRepsHeadline) {
      subLines = `<p class="empty-text" style="margin-top:8px;">Aucune séance de musculation enregistrée pour cet exercice.</p>`;
    }

    const progressLink = chartable.lifts.includes(exercise)
      ? `<button type="button" class="record-link record-progress-link">Voir la progression ›</button>`
      : "";
    const manageLinks = manual
      ? `
        <div class="record-manage">
          ${progressLink}
          <button type="button" class="record-link edit-1rm-link">Modifier le 1RM connu</button>
          <button type="button" class="record-link record-link-danger delete-1rm-link">Supprimer</button>
        </div>`
      : `<div class="record-manage">${progressLink}<button type="button" class="record-link add-1rm-link">${isBW ? "+ Noter mon lest max (1 rep)" : "+ Noter mon 1RM connu"}</button></div>`;

    let mainBlock;
    if (headline) {
      mainBlock = `
        <div class="record-main">
          <span class="record-value">${Math.round(headline.value)} <small>kg</small></span>
          <span class="record-label">${headline.source === "manual" ? "1RM connu (saisi)" : "1RM estimé*"}</span>
        </div>`;
    } else if (showRepsHeadline) {
      mainBlock = `
        <div class="record-main">
          <span class="record-value">${sessionRec.maxReps.value} <small>reps</small></span>
          <span class="record-label">Reps max en une série${sessionRec.maxReps.weight > 0 ? ` (lesté ${formatKgValue(sessionRec.maxReps.weight)} kg)` : ""}</span>
        </div>`;
    } else if (showWeightOnlyHeadline) {
      mainBlock = `
        <div class="record-main">
          <span class="record-value">${formatKgValue(sessionRec.maxWeight.value)} <small>kg</small></span>
          <span class="record-label">Charge max utilisée (WOD)</span>
        </div>`;
    } else {
      mainBlock = `<div class="record-main"><span class="record-value">—</span></div>`;
    }

    const card = document.createElement("div");
    card.className = "record-card";
    card.innerHTML = `
      <span class="record-card-title">${escapeHtml(exercise)}</span>
      ${mainBlock}
      ${subLines}
      ${manageLinks}
    `;

    const progress = card.querySelector(".record-progress-link");
    if (progress) progress.addEventListener("click", () => openProgressChart("exercise", exercise));

    const editLink = card.querySelector(".edit-1rm-link");
    if (editLink) editLink.addEventListener("click", () => open1rmForm(exercise, manual));

    const addLink = card.querySelector(".add-1rm-link");
    if (addLink) addLink.addEventListener("click", () => open1rmForm(exercise, null));

    const deleteLink = card.querySelector(".delete-1rm-link");
    if (deleteLink) {
      deleteLink.addEventListener("click", () => {
        const confirmed = confirm(`Supprimer le 1RM connu que tu as saisi pour ${exercise} ?`);
        if (!confirmed) return;
        deleteManualOneRM(exercise);
        renderRecords();
        if (typeof notifyRankProgress === "function") notifyRankProgress();
        if (typeof renderDashboard === "function") renderDashboard();
      });
    }

    muscuGrid.appendChild(card);
  });

  // ========== CROSSFIT ==========
  // Un record par WOD ET par niveau (RX, Inter, Scaled) : un Fran Scaled ne
  // se compare pas à un Fran RX. Le WOD du jour n'a pas de record.
  const sessionCfRecords = computeCfRecords();
  const manualCfBests = getManualCfBests();
  const wodNames = Array.from(new Set([
    ...Object.keys(sessionCfRecords),
    ...Object.keys(manualCfBests).filter((name) => isRecordableWod(name)),
  ])).sort();

  cfGrid.innerHTML = "";
  if (wodNames.length === 0) {
    cfGrid.innerHTML = `<p class="empty-text">Ajoute un WOD avec un nom (Fran, Murph...) ou note un résultat connu pour voir apparaître tes records ici. Le « WOD du jour » change à chaque fois : il n'a pas de record.</p>`;
  }

  wodNames.forEach((wodName) => {
    const byLevel = JSON.parse(JSON.stringify(sessionCfRecords[wodName] || {}));
    const manual = manualCfBests[wodName] || null;

    // Le résultat noté à la main rejoint son niveau (RX par défaut pour les anciens)
    if (manual) {
      const level = getCfLevel(manual);
      const rec = (byLevel[level] = byLevel[level] || { bestTime: null, bestPerformance: null });
      if (manual.timeSeconds !== null && manual.timeSeconds !== undefined && (!rec.bestTime || manual.timeSeconds < rec.bestTime.value)) {
        rec.bestTime = { value: manual.timeSeconds, date: manual.date, source: "manual" };
      }
      if (manual.rounds !== null && manual.rounds !== undefined) {
        const perf = { rounds: manual.rounds, extraReps: manual.extraReps || 0, date: manual.date, source: "manual" };
        if (isBetterPerformance(perf, rec.bestPerformance)) rec.bestPerformance = perf;
      }
    }

    const levels = CF_LEVEL_ORDER.filter((level) => byLevel[level]);
    const mainBlock = levels.map((level) => {
      const rec = byLevel[level];
      const parts = [];
      if (rec.bestTime) {
        parts.push(`
          <div class="record-main">
            <span class="record-value">${formatSecondsToTime(rec.bestTime.value)}</span>
            <span class="record-label">Meilleur temps${rec.bestTime.source === "manual" ? " (saisi)" : ""}</span>
          </div>`);
      }
      if (rec.bestPerformance) {
        const extraText = rec.bestPerformance.extraReps ? ` + ${rec.bestPerformance.extraReps}` : "";
        parts.push(`
          <div class="record-main">
            <span class="record-value">${rec.bestPerformance.rounds}${extraText}</span>
            <span class="record-label">rounds${rec.bestPerformance.source === "manual" ? " (saisi)" : ""}</span>
          </div>`);
      }
      return `
        <div class="record-level">
          <span class="badge-rpe ${getLevelBadgeClass(level)} record-level-badge">${level}</span>
          ${parts.join("")}
        </div>`;
    }).join("");

    const wodProgressLink = sessionCfRecords[wodName]
      ? `<button type="button" class="record-link record-progress-link">Voir la progression ›</button>`
      : "";
    const manageLinks = manual
      ? `
        <div class="record-manage">
          ${wodProgressLink}
          <button type="button" class="record-link edit-cf-link">Modifier le résultat connu</button>
          <button type="button" class="record-link record-link-danger delete-cf-link">Supprimer</button>
        </div>`
      : `<div class="record-manage">${wodProgressLink}<button type="button" class="record-link add-cf-link">+ Noter un résultat connu</button></div>`;

    const card = document.createElement("div");
    card.className = "record-card";
    card.innerHTML = `<span class="record-card-title">${escapeHtml(wodName)}</span>${mainBlock}${manageLinks}`;

    const wodProgress = card.querySelector(".record-progress-link");
    if (wodProgress) wodProgress.addEventListener("click", () => openProgressChart("wod", wodName));

    const editLink = card.querySelector(".edit-cf-link");
    if (editLink) editLink.addEventListener("click", () => openCfRecordForm(wodName, manual));

    const addLink = card.querySelector(".add-cf-link");
    if (addLink) addLink.addEventListener("click", () => openCfRecordForm(wodName, null));

    const deleteLink = card.querySelector(".delete-cf-link");
    if (deleteLink) {
      deleteLink.addEventListener("click", () => {
        const confirmed = confirm(`Supprimer le résultat connu que tu as saisi pour ${wodName} ?`);
        if (!confirmed) return;
        deleteManualCfBest(wodName);
        renderRecords();
      });
    }

    cfGrid.appendChild(card);
  });
}

/**
 * HISTORIQUE DES RECORDS BATTUS
 * On rejoue toutes les séances dans l'ordre chronologique et on note chaque
 * fois qu'un record est BATTU (la toute première fois ne compte pas : il n'y
 * avait rien à battre). Mêmes règles que le reste de l'appli :
 *  - exercice avec charge : 1RM estimé (Epley jusqu'à 10 reps) — Musculation
 *    et cours de spé ;
 *  - exercice au poids du corps : reps max en une série ;
 *  - test cardio (rameur, course) : meilleur temps ;
 *  - WOD avec un nom : meilleur temps ou meilleure performance, à niveau égal.
 * Renvoie la liste, du plus récent au plus ancien :
 * { date, title, value, gain, detail, target: { section, name } }
 */
function computeRecordHistory() {
  const sessions = getAllSessions()
    .map((session, index) => ({ session, index }))
    .sort((a, b) => (a.session.date < b.session.date ? -1 : a.session.date > b.session.date ? 1 : a.index - b.index))
    .map((item) => item.session);

  const best = {};
  const events = [];
  const kg = (v) => `${formatNumberFr(Math.round(v * 10) / 10)} kg`;

  sessions.forEach((session) => {
    // ---- Musculation, cours de spé et tests cardio ----
    let entries = [];
    if (session.type === "musculation") {
      (session.exercises || []).forEach((entry) => {
        if (!entry) return;
        if (entry.kind === "cardio") {
          if (entry.timeSeconds > 0) entries.push({ name: entry.exercise, time: entry.timeSeconds });
        } else if (Array.isArray(entry.sets)) {
          entries.push({ name: entry.exercise, sets: entry.sets });
        }
      });
    } else if (session.type === "crossfit" && typeof isSpeSession === "function" && isSpeSession(session.wodName)) {
      entries = (session.exercises || [])
        .filter((e) => typeof e === "object" && e !== null && e.reps > 0 && getEntryUnit(e) === "reps")
        .map((e) => ({ name: e.exercise, sets: [{ reps: e.reps, weight: e.weight || 0 }] }));
    }

    // Une même séance peut contenir plusieurs fois l'exercice : on garde sa meilleure série
    const top = {};
    entries.forEach((entry) => {
      if (entry.time) {
        const key = "time:" + entry.name;
        if (!top[key] || entry.time < top[key].value) top[key] = { name: entry.name, value: entry.time, mode: "time" };
        return;
      }
      const isBW = typeof isBodyweightExercise === "function" && isBodyweightExercise(entry.name);
      entry.sets.forEach((set) => {
        const value = isBW ? set.reps || 0 : set.weight > 0 && set.reps > 0 ? estimateOneRepMax(set.weight, set.reps) : 0;
        const key = (isBW ? "reps:" : "load:") + entry.name;
        if (value > 0 && (!top[key] || value > top[key].value)) top[key] = { name: entry.name, value, set, mode: isBW ? "reps" : "load" };
      });
    });

    Object.entries(top).forEach(([key, t]) => {
      const previous = best[key];
      const better = previous === undefined ? false : t.mode === "time" ? t.value < previous : t.value > previous + 1e-9;
      if (better) {
        let value, gain, detail = "";
        if (t.mode === "time") {
          value = formatDuration(t.value);
          gain = `−${formatDuration(previous - t.value)}`;
          detail = "test chrono";
        } else if (t.mode === "reps") {
          value = `${t.value} reps`;
          gain = `+${t.value - previous} rep${t.value - previous > 1 ? "s" : ""}`;
          detail = t.set.weight > 0 ? `lesté ${formatNumberFr(t.set.weight)} kg` : "";
        } else {
          value = kg(t.value);
          gain = `+${kg(t.value - previous)}`;
          detail = `${formatNumberFr(t.set.weight)} kg × ${t.set.reps}`;
        }
        events.push({ date: session.date, title: t.name, value, gain, detail, target: { section: "exercise", name: t.name } });
      }
      if (previous === undefined || better) best[key] = t.value;
    });

    // ---- WOD avec un nom, par niveau ----
    if (session.type === "crossfit" && isRecordableWod(session.wodName)) {
      const level = getCfLevel(session);
      const title = `${session.wodName} ${level}`;
      if (session.timeSeconds !== null && session.timeSeconds !== undefined) {
        const key = `wodtime:${session.wodName}:${level}`;
        const previous = best[key];
        if (previous !== undefined && session.timeSeconds < previous) {
          events.push({ date: session.date, title, value: formatSecondsToTime(session.timeSeconds), gain: `−${formatSecondsToTime(previous - session.timeSeconds)}`, detail: "", target: { section: "wod", name: session.wodName } });
        }
        if (previous === undefined || session.timeSeconds < previous) best[key] = session.timeSeconds;
      }
      if (session.rounds !== null && session.rounds !== undefined) {
        const key = `wodperf:${session.wodName}:${level}`;
        const perf = { rounds: session.rounds, extraReps: session.extraReps || 0 };
        const previous = best[key];
        if (previous !== undefined && isBetterPerformance(perf, previous)) {
          const roundGain = perf.rounds - previous.rounds;
          const gain = roundGain > 0 ? `+${roundGain} round${roundGain > 1 ? "s" : ""}` : `+${perf.extraReps - previous.extraReps} reps`;
          events.push({ date: session.date, title, value: `${perf.rounds}${perf.extraReps ? ` + ${perf.extraReps}` : ""} rounds`, gain, detail: "", target: { section: "wod", name: session.wodName } });
        }
        if (previous === undefined || isBetterPerformance(perf, previous)) best[key] = perf;
      }
    }
  });

  return events.reverse();
}

/**
 * Nombre de records battus depuis une date ("AAAA-MM-JJ") : chaque fois que
 * tu fais mieux qu'avant compte (même règle que le fil de la page Records).
 */
function countRecordsBeatenSince(startDate) {
  return computeRecordHistory().filter((event) => event.date >= startDate).length;
}

// --------------------------------------------------------------------------
// FIL "DERNIERS RECORDS BATTUS" (en haut de la page Records)
// --------------------------------------------------------------------------

let recordFeedLimit = 6;

function renderRecordFeed() {
  const container = document.getElementById("record-feed");
  if (!container) return;
  const events = computeRecordHistory();
  const now = new Date();
  const monthStart = toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
  const thisMonth = events.filter((e) => e.date >= monthStart).length;

  const badge = document.getElementById("record-feed-count");
  if (badge) badge.textContent = `${thisMonth} ce mois-ci`;

  if (events.length === 0) {
    container.innerHTML = `<p class="empty-text">Aucun record battu pour l'instant. Ils apparaîtront ici dès que tu feras mieux qu'avant sur un exercice, un test chrono ou un WOD.</p>`;
    return;
  }

  container.innerHTML = `<ol class="pr-timeline">${events.slice(0, recordFeedLimit).map((e) => `
    <li>
      <span class="pr-dot" aria-hidden="true"></span>
      <div class="pr-line">
        <div class="pr-line-top"><strong>${escapeHtml(e.title)}</strong><span class="pr-date">${parseLocalDate(e.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span></div>
        <div class="pr-line-bottom">
          <span class="pr-value">${escapeHtml(e.value)}</span>
          <span class="pr-gain">${escapeHtml(e.gain)}</span>
          ${e.detail ? `<span class="pr-detail">${escapeHtml(e.detail)}</span>` : ""}
        </div>
      </div>
    </li>`).join("")}</ol>`;
  appendShowMoreButton(container, events.length - recordFeedLimit, () => {
    recordFeedLimit += 6;
    renderRecordFeed();
  });
}

// --------------------------------------------------------------------------
// LIENS "VOIR LA PROGRESSION" (carte de record → graphique de Statistiques)
// --------------------------------------------------------------------------

/** Ouvre Statistiques sur le graphique d'un exercice (ou d'un WOD) précis. */
function openProgressChart(kind, name) {
  if (typeof goToSection !== "function") return;
  goToSection("statistiques");
  const selectId = kind === "wod" ? "stats-wod-select" : "stats-exercise-select";
  const select = document.getElementById(selectId);
  if (!select || ![...select.options].some((o) => o.value === name)) return;
  select.value = name;
  if (kind === "wod") { if (typeof renderWodChart === "function") renderWodChart(); }
  else if (typeof renderExerciseChart === "function") renderExerciseChart();
  const panel = select.closest(".panel");
  if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** 87.5 → "87,5" ; 60 → "60" (kilos à la française). */
function formatKgValue(value) {
  return formatNumberFr(value);
}

// --------------------------------------------------------------------------
// FORMULAIRE "1RM CONNU" — ouverture, remplissage des listes, soumission
// --------------------------------------------------------------------------

function populateManual1rmExerciseSelect() {
  if (!manual1rmExerciseSelect) return;
  const exercises = typeof getAllKnownExercises === "function" ? getAllKnownExercises() : [];
  manual1rmExerciseSelect.innerHTML = "";
  exercises.forEach((ex) => {
    const opt = document.createElement("option");
    opt.value = ex;
    opt.textContent = typeof exerciseOptionLabel === "function" ? exerciseOptionLabel(ex) : ex;
    manual1rmExerciseSelect.appendChild(opt);
  });
  const customOpt = document.createElement("option");
  customOpt.value = "__custom__";
  customOpt.textContent = "+ Autre exercice…";
  manual1rmExerciseSelect.appendChild(customOpt);
}

function open1rmForm(exerciseToPrefill, existingManualEntry) {
  populateManual1rmExerciseSelect();

  if (exerciseToPrefill) {
    const exists = [...manual1rmExerciseSelect.options].some((o) => o.value === exerciseToPrefill);
    if (exists) {
      manual1rmExerciseSelect.value = exerciseToPrefill;
      manual1rmExerciseCustom.style.display = "none";
    } else {
      manual1rmExerciseSelect.value = "__custom__";
      manual1rmExerciseCustom.style.display = "block";
      manual1rmExerciseCustom.value = exerciseToPrefill;
    }
  }

  manual1rmWeightInput.value = existingManualEntry ? existingManualEntry.weight : "";
  manual1rmDateInput.value = existingManualEntry ? existingManualEntry.date : todayLocalDateString();
  manual1rmNotesInput.value = existingManualEntry ? existingManualEntry.notes || "" : "";

  manual1rmForm.style.display = "block";
  manual1rmForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

if (manual1rmExerciseSelect) {
  manual1rmExerciseSelect.addEventListener("change", () => {
    const isCustom = manual1rmExerciseSelect.value === "__custom__";
    manual1rmExerciseCustom.style.display = isCustom ? "block" : "none";
  });
}

if (btnToggle1rmForm) {
  btnToggle1rmForm.addEventListener("click", () => open1rmForm(null, null));
}
if (btnCancel1rmForm) {
  btnCancel1rmForm.addEventListener("click", () => { manual1rmForm.style.display = "none"; manual1rmForm.reset(); });
}

if (manual1rmForm) {
  manual1rmForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const isCustom = manual1rmExerciseSelect.value === "__custom__";
    const exercise = isCustom ? manual1rmExerciseCustom.value.trim() : manual1rmExerciseSelect.value;
    const weight = Number(manual1rmWeightInput.value);

    if (!exercise || !weight || weight <= 0) return;

    setManualOneRM(exercise, {
      weight,
      date: manual1rmDateInput.value || todayLocalDateString(),
      notes: manual1rmNotesInput.value.trim(),
    });

    manual1rmForm.style.display = "none";
    manual1rmForm.reset();
    renderRecords();
    // Un 1RM noté compte pour les rangs (force et haltéro)
    if (typeof notifyRankProgress === "function") notifyRankProgress();
    if (typeof renderDashboard === "function") renderDashboard();
  });
}

// --------------------------------------------------------------------------
// FORMULAIRE "RÉSULTAT CONNU" (CrossFit) — même principe
// --------------------------------------------------------------------------

function populateManualCfWodSelect() {
  if (!manualCfWodSelect) return;
  const wods = typeof getAllKnownWods === "function" ? getAllKnownWods() : [];
  manualCfWodSelect.innerHTML = "";
  wods.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    manualCfWodSelect.appendChild(opt);
  });
  const customOpt = document.createElement("option");
  customOpt.value = "__custom__";
  customOpt.textContent = "+ Autre WOD…";
  manualCfWodSelect.appendChild(customOpt);
}

function openCfRecordForm(wodToPrefill, existingManualEntry) {
  populateManualCfWodSelect();

  if (wodToPrefill) {
    const exists = [...manualCfWodSelect.options].some((o) => o.value === wodToPrefill);
    if (exists) {
      manualCfWodSelect.value = wodToPrefill;
      manualCfWodCustom.style.display = "none";
    } else {
      manualCfWodSelect.value = "__custom__";
      manualCfWodCustom.style.display = "block";
      manualCfWodCustom.value = wodToPrefill;
    }
  }

  manualCfTimeInput.value = existingManualEntry && existingManualEntry.timeSeconds != null
    ? formatSecondsToTime(existingManualEntry.timeSeconds) : "";
  manualCfRoundsInput.value = existingManualEntry && existingManualEntry.rounds != null ? existingManualEntry.rounds : "";
  manualCfExtraRepsInput.value = existingManualEntry && existingManualEntry.extraReps != null ? existingManualEntry.extraReps : "";
  manualCfDateInput.value = existingManualEntry ? existingManualEntry.date : todayLocalDateString();
  manualCfNotesInput.value = existingManualEntry ? existingManualEntry.notes || "" : "";
  if (manualCfLevelSelect) manualCfLevelSelect.value = existingManualEntry ? getCfLevel(existingManualEntry) : "RX";

  manualCfForm.style.display = "block";
  manualCfForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

if (manualCfWodSelect) {
  manualCfWodSelect.addEventListener("change", () => {
    const isCustom = manualCfWodSelect.value === "__custom__";
    manualCfWodCustom.style.display = isCustom ? "block" : "none";
  });
}

if (btnToggleCfForm) {
  btnToggleCfForm.addEventListener("click", () => openCfRecordForm(null, null));
}
if (btnCancelCfForm) {
  btnCancelCfForm.addEventListener("click", () => { manualCfForm.style.display = "none"; manualCfForm.reset(); });
}

if (manualCfForm) {
  manualCfForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const isCustom = manualCfWodSelect.value === "__custom__";
    const wodName = isCustom ? manualCfWodCustom.value.trim() : manualCfWodSelect.value;
    if (!wodName) return;

    const timeSeconds = typeof parseTimeToSeconds === "function" ? parseTimeToSeconds(manualCfTimeInput.value) : null;
    const rounds = manualCfRoundsInput.value ? Number(manualCfRoundsInput.value) : null;
    const extraReps = manualCfExtraRepsInput.value ? Number(manualCfExtraRepsInput.value) : null;

    if (timeSeconds === null && rounds === null) return;

    setManualCfBest(wodName, {
      timeSeconds,
      rounds,
      extraReps,
      level: manualCfLevelSelect ? manualCfLevelSelect.value : "RX",
      date: manualCfDateInput.value || todayLocalDateString(),
      notes: manualCfNotesInput.value.trim(),
    });

    manualCfForm.style.display = "none";
    manualCfForm.reset();
    renderRecords();
  });
}

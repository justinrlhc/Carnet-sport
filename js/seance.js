// ==========================================================================
// seance.js — briques communes aux séances "en direct" de Musculation et
// aux cours de spé du CrossFit :
//   - les fenêtres qui montent du bas de l'écran (choix d'un exercice,
//     petits menus d'actions, récapitulatif)
//   - les cartes d'exercice et leurs séries à cocher (✓), façon appli de muscu
//   - le minuteur de repos
// Chargé juste après data.js : les fonctions d'aide de musculation.js
// (isBodyweightExercise, getLastExercisePerformance...) ne sont appelées
// qu'au moment où l'on s'en sert, jamais au chargement.
// ==========================================================================

const RF_ICONS = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>',
  dots: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 3h11a2 2 0 0 1 2 2v11h-2V5H8V3Zm-3 4h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm0 2v10h10V9H5Z"/></svg>',
  bar: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2 10h2V8h2v8H4v-2H2v-4Zm4-3h2v10H6V7Zm10 0h2v10h-2V7Zm2 1h2v2h2v4h-2v2h-2V8ZM8 11h8v2H8v-2Z"/></svg>',
  ring: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="7" cy="15" r="4"/><circle cx="17" cy="15" r="4"/><path d="M7 11V3M17 11V3"/></svg>',
  run: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="15" cy="4.5" r="2"/><path d="M6 21l3.5-6 3 2.5V22M8 11l3-3.5 3.5 1.5 2 3.5H20M11 7.5l-1.5 6"/></svg>',
  text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h9"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

/** Icône d'une carte : une barre, des anneaux (poids du corps) ou un coureur (cardio). */
function exerciseIconSvg(name, isCardio) {
  if (isCardio || (typeof isMeasuredExercise === "function" && isMeasuredExercise(name))) return RF_ICONS.run;
  if (typeof isBodyweightExercise === "function" && isBodyweightExercise(name)) return RF_ICONS.ring;
  return RF_ICONS.bar;
}

/** Nombre écrit dans une case : "62,5" → 62.5 ; vide → null ; illisible → NaN. */
function rfParseNumber(text) {
  const clean = String(text ?? "").trim().replace(",", ".");
  if (!clean) return null;
  return /^\d+(\.\d+)?$/.test(clean) ? Number(clean) : NaN;
}

/** Nombre à réécrire dans une case, avec la virgule française : 62.5 → "62,5". */
function rfInputNumber(value) {
  return String(Math.round(Number(value) * 100) / 100).replace(".", ",");
}

/** "62,5 × 8", "+10 × 8" (lest), "8 reps" (poids du corps), "250 m". */
function formatSetShort(set, isBW, unit) {
  const reps = Number(set.reps) || 0;
  if (unit && unit !== "reps") return formatAmount(reps, unit);
  const weight = Number(set.weight) || 0;
  if (weight > 0) return `${isBW ? "+" : ""}${formatNumberFr(weight)} × ${reps}`;
  return `${reps} rep${reps > 1 ? "s" : ""}`;
}

// --------------------------------------------------------------------------
// FENÊTRES DU BAS ("feuilles")
// --------------------------------------------------------------------------

/**
 * Ouvre une feuille qui monte du bas de l'écran. build(sheet, close) la
 * remplit. Toucher le fond sombre la referme.
 */
function openSheet(build, options) {
  const background = document.createElement("div");
  background.className = "rf-sheet-bg";
  background.innerHTML = `<div class="rf-sheet" role="dialog" aria-modal="true"><span class="rf-grab" aria-hidden="true"></span></div>`;
  const sheet = background.querySelector(".rf-sheet");
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    background.remove();
    if (!document.querySelector(".rf-sheet-bg")) document.body.classList.remove("rf-sheet-open");
    if (options && typeof options.onClose === "function") options.onClose();
  };
  background.addEventListener("click", (event) => { if (event.target === background) close(); });
  document.body.appendChild(background);
  document.body.classList.add("rf-sheet-open");
  build(sheet, close);
  return { el: sheet, close };
}

/** Petit menu d'actions : [{ label, danger?, onClick }]. */
function openActionSheet(title, actions) {
  return openSheet((sheet, close) => {
    sheet.insertAdjacentHTML("beforeend", `<h2 class="rf-sheet-title">${escapeHtml(title)}</h2><div class="rf-actions"></div>`);
    const list = sheet.querySelector(".rf-actions");
    actions.forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "rf-action" + (action.danger ? " danger" : "");
      button.textContent = action.label;
      button.addEventListener("click", () => { close(); action.onClick(); });
      list.appendChild(button);
    });
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "rf-btn rf-btn-ghost rf-btn-wide";
    cancel.textContent = "Fermer";
    cancel.addEventListener("click", close);
    sheet.appendChild(cancel);
  });
}

/**
 * Choix d'un exercice : recherche (français ou anglais), les 5 derniers
 * utilisés en premier, puis toute la liste. Si le nom tapé n'existe pas,
 * "Ajouter « … »" le crée (exercice perso).
 * options : { title, includeMeasured, choices (liste imposée), allowCustom, onPick(name) }
 */
function openExercisePicker(options) {
  return openSheet((sheet, close) => {
    sheet.classList.add("rf-sheet-tall");
    const allowCustom = options.allowCustom !== false;
    sheet.insertAdjacentHTML("beforeend", `
      <h2 class="rf-sheet-title">${escapeHtml(options.title || "Ajouter un exercice")}</h2>
      ${options.choices ? "" : `<input type="search" class="rf-search" placeholder="Rechercher (ex : squat, tractions, arraché)" autocomplete="off" aria-label="Rechercher un exercice">`}
      <div class="rf-pick-list"></div>`);
    const input = sheet.querySelector(".rf-search");
    const list = sheet.querySelector(".rf-pick-list");
    const measured = options.includeMeasured ? Object.keys(MEASURED_EXERCISES).sort() : [];

    const itemHtml = (name) => {
      const hint = EXERCISE_FRENCH_HINTS[name] || (isMeasuredExercise(name) ? MEASURED_EXERCISES[name].map((u) => UNIT_LABELS[u]).join(" ou ") : "");
      return `<button type="button" class="rf-pick" data-name="${escapeHtml(name)}">
        <span class="rf-pick-ic">${exerciseIconSvg(name, CARDIO_TESTS.includes(name))}</span>
        <span class="rf-pick-name">${escapeHtml(name)}${hint ? `<small>${escapeHtml(hint)}</small>` : ""}</span>
      </button>`;
    };

    function render() {
      if (options.choices) {
        list.innerHTML = options.choices.map(itemHtml).join("");
        return;
      }
      const raw = input.value.trim().replace(/\s+/g, " ");
      const query = normalizeSearchText(raw);
      const all = [...getAllKnownExercises(), ...measured];
      let html = "";
      if (query) {
        const matches = all.filter((name) => exerciseMatchesSearch(name, query));
        const exact = all.some((name) => normalizeSearchText(name) === query);
        html += matches.map(itemHtml).join("");
        // Exercice perso : proposé après les résultats, pour ne pas le choisir par erreur
        if (allowCustom && !exact) {
          html += `<button type="button" class="rf-pick rf-pick-custom" data-name="${escapeHtml(raw)}"><span class="rf-pick-ic">+</span><span class="rf-pick-name">Ajouter « ${escapeHtml(raw)} »<small>nouvel exercice</small></span></button>`;
        }
        if (matches.length === 0 && !allowCustom) html += `<p class="empty-text">Aucun exercice trouvé.</p>`;
      } else {
        const recent = getRecentExercises(RECENT_EXERCISES_COUNT, Boolean(options.includeMeasured));
        if (recent.length) html += `<div class="rf-pick-group">Récents</div>${recent.map(itemHtml).join("")}`;
        html += `<div class="rf-pick-group">Tous les exercices</div>${getAllKnownExercises().map(itemHtml).join("")}`;
        if (measured.length) html += `<div class="rf-pick-group">Cardio et distance</div>${measured.map(itemHtml).join("")}`;
      }
      list.innerHTML = html;
    }

    list.addEventListener("click", (event) => {
      const button = event.target.closest(".rf-pick");
      if (!button) return;
      close();
      options.onPick(button.dataset.name);
    });
    if (input) input.addEventListener("input", render);
    render();
  });
}

// --------------------------------------------------------------------------
// VALIDATION D'UNE SÉRIE
// Mêmes règles et mêmes messages qu'avant : reps entières, charge
// obligatoire avec barre ou haltères, facultative au poids du corps (lest).
// --------------------------------------------------------------------------

/** Renvoie { reps, weight } ou { error }. measured : calories ou mètres (pas de charge). */
function validateSetInput(exercise, repsText, weightText, label, measured) {
  const repsClean = String(repsText ?? "").trim();
  const weightClean = String(weightText ?? "").trim();
  if (measured) {
    if (!repsClean) return { error: `${label} : il manque la quantité.` };
    const amount = rfParseNumber(repsClean);
    if (!(amount > 0)) return { error: `${label} : la quantité n'est pas valide.` };
    return { reps: amount, weight: 0 };
  }
  const isBW = isBodyweightExercise(exercise);
  if (!repsClean) return { error: `${label} : il manque le nombre de reps.` };
  const reps = rfParseNumber(repsClean);
  if (!Number.isInteger(reps) || reps <= 0) return { error: `${label} : le nombre de reps doit être un nombre entier.` };
  if (!isBW && !weightClean) return { error: `${label} : il manque la charge (kg).` };
  const weight = weightClean ? rfParseNumber(weightClean) : 0;
  if (!Number.isFinite(weight) || weight < 0 || (!isBW && weight === 0)) return { error: `${label} : la charge n'est pas valide.` };
  return { reps, weight };
}

/** "Série 2 de Bench Press" ou "Échauffement de Bench Press". */
function setLabel(exercise, set, number) {
  return set.warmup ? `Échauffement de ${exercise}` : `Série ${number} de ${exercise}`;
}

/** Une ligne compte (et sera enregistrée) si elle est cochée ou si on y a tapé quelque chose. */
function isSetFilled(set) {
  return Boolean(set.done) || String(set.reps ?? "").trim() !== "" || String(set.weight ?? "").trim() !== "";
}

// --------------------------------------------------------------------------
// RECORDS "À BATTRE" (pour les badges PR pendant la séance)
// --------------------------------------------------------------------------

/** Meilleure valeur connue avant la séance : 1RM estimé (charge) ou reps (poids du corps), notes manuelles comprises. */
function getRecordBestBefore(name, recordsBefore) {
  const record = recordsBefore ? recordsBefore[name] : null;
  if (isBodyweightExercise(name)) {
    const manual = typeof getManualReps === "function" ? getManualReps()[name] : null;
    return Math.max(record && record.maxReps ? record.maxReps.value : 0, manual ? Number(manual.reps) || 0 : 0);
  }
  const manual = typeof getManualOneRMs === "function" ? getManualOneRMs()[name] : null;
  return Math.max(record && record.oneRM ? record.oneRM.value : 0, manual ? Number(manual.weight) || 0 : 0);
}

/** Valeur d'une série pour les records : reps (poids du corps) ou 1RM estimé (charge). */
function setRecordValue(name, reps, weight) {
  if (!(reps > 0) || typeof estimateOneRepMax !== "function") return 0; // stats.js pas encore chargé
  if (isBodyweightExercise(name)) return reps;
  return weight > 0 ? estimateOneRepMax(weight, reps) : 0;
}

// --------------------------------------------------------------------------
// CARTE D'EXERCICE AVEC SÉRIES À COCHER
// item : { kind: "sets", exercise, unit?, rpe?, sets: [{ reps, weight, done, warmup }] }
//   (reps et weight sont gardés tels que tapés, en texte)
// ctx : {
//   excludeSessionId  séance en cours de modification (pas de "précédent" tiré d'elle)
//   showRpe           pastille RPE (musculation)
//   showPR            badges PR
//   recordsBefore     computeMuscuRecords() avant la séance
//   persist()         sauvegarde du brouillon
//   onSetChecked(item, set)   après une série cochée (minuteur de repos)
//   menu(item)        actions du menu ⋮ : [{ label, danger?, onClick }]
//   feedback(message, isError)
// }
// --------------------------------------------------------------------------

/** Unité d'une carte : "reps", ou "cal" / "m" pour un exercice de cardio ou de distance. */
function getSetItemUnit(item) {
  if (!isMeasuredExercise(item.exercise)) return "reps";
  const units = MEASURED_EXERCISES[item.exercise];
  return units.includes(item.unit) ? item.unit : units[0];
}

/** Séries de la dernière fois (musculation ou cours de spé), pour la colonne "Précédent". */
function getPreviousSets(name, excludeSessionId) {
  const last = getLastExercisePerformance(name, excludeSessionId);
  return last && Array.isArray(last.sets) ? last.sets : [];
}

function createSetCard(item, ctx) {
  const card = document.createElement("div");
  card.className = "rf-card rf-sets-card";
  const unit = getSetItemUnit(item);
  const measured = unit !== "reps";
  const isBW = !measured && isBodyweightExercise(item.exercise);
  const previous = measured ? [] : getPreviousSets(item.exercise, ctx.excludeSessionId);
  const recordBest = ctx.showPR && !measured ? getRecordBestBefore(item.exercise, ctx.recordsBefore) : 0;
  const record = measured ? "" : describeExerciseRecord(item.exercise);
  // Exercice vu seulement dans un WOD : on rappelle cette dernière fois
  const lastWod = !measured && previous.length === 0 ? getLastExercisePerformance(item.exercise, ctx.excludeSessionId) : null;
  const wodText = lastWod && lastWod.source === "wod"
    ? `En WOD le ${escapeHtml(formatShortDate(lastWod.date))} : ${lastWod.reps} rep${lastWod.reps > 1 ? "s" : ""}${lastWod.perRound ? "/tour" : ""}${lastWod.weight > 0 ? ` à ${formatNumberFr(lastWod.weight)} kg` : ""} (${escapeHtml(lastWod.wodName || "WOD")})`
    : "";
  const subText = record
    ? `${isBW ? "Poids du corps · " : ""}<b>${escapeHtml(record)}</b>${wodText ? ` · ${wodText}` : ""}`
    : (measured ? `En ${escapeHtml(UNIT_LABELS[unit])}` : (wodText || (isBW ? "Poids du corps · lest facultatif" : "Premier passage : pas encore de record")));
  const units = measured ? MEASURED_EXERCISES[item.exercise] : [];

  card.innerHTML = `
    <div class="rf-card-head">
      <span class="rf-ex-ic">${exerciseIconSvg(item.exercise)}</span>
      <div class="rf-card-title"><div class="rf-ex-name">${escapeHtml(item.exercise)}</div><div class="rf-ex-sub">${subText}</div></div>
      <span class="rf-pill"></span>
      <button type="button" class="rf-more" aria-label="Options de l'exercice">${RF_ICONS.dots}</button>
    </div>
    <div class="rf-grid rf-thead" aria-hidden="true"><span>SÉRIE</span><span>PRÉCÉDENT</span><span>${measured ? "" : isBW ? "+KG" : "KG"}</span><span>${measured ? escapeHtml(UNIT_LABELS[unit].toUpperCase()) : "REPS"}</span><span></span><span></span></div>
    <div class="rf-rows"></div>
    <div class="rf-card-foot">
      <button type="button" class="rf-add">+ Série</button>
      ${units.length > 1 ? `<div class="rf-units">${units.map((u) => `<button type="button" class="rf-chip${u === unit ? " on" : ""}" data-unit="${u}">${u === "cal" ? "Calories" : "Mètres"}</button>`).join("")}</div>` : ""}
      ${ctx.showRpe ? `<select class="rf-chip rf-rpe" aria-label="RPE (effort ressenti, facultatif)"><option value="">RPE</option>${Array.from({ length: 19 }, (_, i) => 1 + i * 0.5).map((v) => `<option value="${v}">RPE ${String(v).replace(".", ",")}</option>`).join("")}</select>` : ""}
    </div>`;

  const rowsEl = card.querySelector(".rf-rows");
  const pill = card.querySelector(".rf-pill");
  let rowEls = [];
  let infos = [];

  /** Numéros, valeurs en grisé (dernière fois, ou ligne du dessus) et badges PR. */
  function computeInfos() {
    let number = 0;
    let bestInSession = 0;
    const list = [];
    item.sets.forEach((set, index) => {
      if (!set.warmup) number += 1;
      const prev = previous[index] || null;
      const above = index > 0 ? list[index - 1] : null;
      const phReps = prev ? prev.reps : (above ? above.effReps : null);
      const phWeight = prev ? (prev.weight || 0) : (above ? above.effWeight : null);
      const typedReps = rfParseNumber(set.reps);
      const typedWeight = rfParseNumber(set.weight);
      const info = {
        number,
        label: set.warmup ? "É" : String(number),
        prev,
        phReps,
        phWeight,
        effReps: typedReps > 0 ? typedReps : phReps,
        effWeight: typedWeight !== null && typedWeight >= 0 ? typedWeight : phWeight,
        pr: false,
      };
      if (ctx.showPR && !measured && set.done && !set.warmup) {
        const value = setRecordValue(item.exercise, typedReps || 0, typedWeight || 0);
        if (value > recordBest && value > bestInSession) info.pr = true;
        bestInSession = Math.max(bestInSession, value);
      }
      list.push(info);
    });
    infos = list;
  }

  /** Met à jour l'affichage sans reconstruire les lignes (le clavier reste ouvert). */
  function refresh() {
    computeInfos();
    let done = 0;
    item.sets.forEach((set, index) => {
      const row = rowEls[index];
      const info = infos[index];
      if (set.done) done += 1;
      row.classList.toggle("done", Boolean(set.done));
      row.classList.toggle("warm", Boolean(set.warmup));
      const setButton = row.querySelector(".rf-set");
      setButton.textContent = info.label;
      setButton.classList.toggle("w", Boolean(set.warmup));
      const prevButton = row.querySelector(".rf-prev");
      prevButton.textContent = info.prev ? formatSetShort(info.prev, isBW, unit) : "—";
      prevButton.classList.toggle("none", !info.prev);
      const repsInput = row.querySelector(".rf-in-reps");
      repsInput.placeholder = info.phReps > 0 ? rfInputNumber(info.phReps) : (measured ? UNIT_LABELS[unit] : "reps");
      const weightInput = row.querySelector(".rf-in-kg");
      if (weightInput) weightInput.placeholder = info.phWeight > 0 ? rfInputNumber(info.phWeight) : (isBW ? "—" : "kg");
      row.querySelector(".rf-pr").hidden = !info.pr;
    });
    const total = item.sets.length;
    pill.textContent = total > 0 && done === total ? `${done} / ${total} ✓` : `${done} / ${total}`;
    pill.classList.toggle("ok", total > 0 && done === total);
    card.classList.toggle("is-done", total > 0 && done === total);
  }

  function rebuild() {
    rowsEl.innerHTML = "";
    rowEls = item.sets.map((set, index) => {
      const row = createRow(set, index);
      rowsEl.appendChild(row);
      return row;
    });
    refresh();
  }

  function insertCopy(index) {
    const source = item.sets[index];
    item.sets.splice(index + 1, 0, { reps: source.reps, weight: source.weight, done: false, warmup: Boolean(source.warmup) });
    ctx.persist();
    rebuild();
  }

  function toggleDone(index) {
    const set = item.sets[index];
    const row = rowEls[index];
    if (set.done) {
      set.done = false;
      ctx.persist();
      refresh();
      return;
    }
    const info = infos[index];
    const repsText = String(set.reps ?? "").trim() || (info.phReps > 0 ? rfInputNumber(info.phReps) : "");
    const weightText = measured ? "" : (String(set.weight ?? "").trim() || (info.phWeight > 0 ? rfInputNumber(info.phWeight) : ""));
    const result = validateSetInput(item.exercise, repsText, weightText, setLabel(item.exercise, set, info.number), measured);
    if (result.error) {
      ctx.feedback(result.error, true);
      row.classList.remove("shake");
      void row.offsetWidth; // relance l'animation
      row.classList.add("shake");
      return;
    }
    set.reps = rfInputNumber(result.reps);
    set.weight = result.weight > 0 ? rfInputNumber(result.weight) : "";
    set.done = true;
    row.querySelector(".rf-in-reps").value = set.reps;
    const weightInput = row.querySelector(".rf-in-kg");
    if (weightInput) weightInput.value = set.weight;
    if (document.activeElement && row.contains(document.activeElement)) document.activeElement.blur();
    ctx.persist();
    refresh();
    if (typeof ctx.onSetChecked === "function") ctx.onSetChecked(item, set);
  }

  function createRow(set, index) {
    const row = document.createElement("div");
    row.className = "rf-grid rf-row";
    row.innerHTML = `
      <button type="button" class="rf-set" aria-label="Options de la série"></button>
      <button type="button" class="rf-prev" aria-label="Reprendre la valeur précédente"></button>
      <span class="rf-cell">${measured ? `<span class="rf-in rf-in-off">—</span>` : `<input type="text" class="rf-in rf-in-kg" inputmode="decimal" autocomplete="off" aria-label="${isBW ? "Lest (kg)" : "Charge (kg)"}">`}</span>
      <span class="rf-cell"><input type="text" class="rf-in rf-in-reps" inputmode="${measured ? "decimal" : "numeric"}" autocomplete="off" aria-label="${measured ? "Quantité" : "Répétitions"}"><span class="rf-pr" hidden>PR</span></span>
      <button type="button" class="rf-copy" aria-label="Copier cette série">${RF_ICONS.copy}</button>
      <button type="button" class="rf-ck" aria-label="Valider la série">${RF_ICONS.check}</button>`;
    const repsInput = row.querySelector(".rf-in-reps");
    const weightInput = row.querySelector(".rf-in-kg");
    repsInput.value = set.reps ?? "";
    if (weightInput) weightInput.value = set.weight ?? "";

    repsInput.addEventListener("input", () => { set.reps = repsInput.value; ctx.persist(); refresh(); });
    if (weightInput) weightInput.addEventListener("input", () => { set.weight = weightInput.value; ctx.persist(); refresh(); });

    row.querySelector(".rf-ck").addEventListener("click", () => toggleDone(item.sets.indexOf(set)));
    row.querySelector(".rf-copy").addEventListener("click", () => insertCopy(item.sets.indexOf(set)));
    row.querySelector(".rf-prev").addEventListener("click", () => {
      const info = infos[item.sets.indexOf(set)];
      if (!info || !info.prev) return;
      set.reps = rfInputNumber(info.prev.reps);
      set.weight = info.prev.weight > 0 ? rfInputNumber(info.prev.weight) : "";
      repsInput.value = set.reps;
      if (weightInput) weightInput.value = set.weight;
      ctx.persist();
      refresh();
    });
    row.querySelector(".rf-set").addEventListener("click", () => {
      const position = item.sets.indexOf(set);
      openActionSheet(setLabel(item.exercise, set, infos[position].number), [
        { label: set.warmup ? "En faire une série normale" : "Marquer comme échauffement", onClick: () => { set.warmup = !set.warmup; ctx.persist(); refresh(); } },
        { label: "Copier cette série", onClick: () => insertCopy(item.sets.indexOf(set)) },
        { label: "Supprimer cette série", danger: true, onClick: () => { item.sets.splice(item.sets.indexOf(set), 1); ctx.persist(); rebuild(); } },
      ]);
    });
    return row;
  }

  card.querySelector(".rf-add").addEventListener("click", () => {
    item.sets.push({ reps: "", weight: "", done: false, warmup: false });
    ctx.persist();
    rebuild();
  });
  card.querySelectorAll(".rf-units .rf-chip").forEach((chip) => chip.addEventListener("click", () => {
    item.unit = chip.dataset.unit;
    ctx.persist();
    card.replaceWith(createSetCard(item, ctx));
  }));
  const rpeSelect = card.querySelector(".rf-rpe");
  if (rpeSelect) {
    const syncRpe = () => {
      rpeSelect.classList.toggle("on", rpeSelect.value !== "");
    };
    rpeSelect.value = item.rpe ? String(item.rpe) : "";
    syncRpe();
    rpeSelect.addEventListener("change", () => {
      item.rpe = rpeSelect.value ? Number(rpeSelect.value) : null;
      syncRpe();
      ctx.persist();
    });
  }
  card.querySelector(".rf-more").addEventListener("click", () => openActionSheet(item.exercise, ctx.menu(item)));

  card.refreshCard = refresh;
  rebuild();
  return card;
}

/**
 * Carte "test cardio" (Row 2000 m, Run 5 km) : minutes + secondes, puis ✓.
 * item : { kind: "cardio", exercise, min, sec, done }
 */
function createCardioCard(item, ctx) {
  const card = document.createElement("div");
  card.className = "rf-card rf-cardio-card";
  const { last, best } = getCardioLastAndBest(item.exercise, ctx.excludeSessionId);
  const parts = [];
  if (last) parts.push(`Dernière fois : ${escapeHtml(formatDuration(last.timeSeconds))}`);
  if (best !== null) parts.push(`<b>Record : ${escapeHtml(formatDuration(best))}</b>`);
  card.innerHTML = `
    <div class="rf-card-head">
      <span class="rf-ex-ic">${RF_ICONS.run}</span>
      <div class="rf-card-title"><div class="rf-ex-name">${escapeHtml(item.exercise)}</div><div class="rf-ex-sub">${parts.join(" · ") || "Test chronométré : premier essai"}</div></div>
      <span class="rf-pill"></span>
      <button type="button" class="rf-more" aria-label="Options du test">${RF_ICONS.dots}</button>
    </div>
    <div class="rf-cardio-row">
      <label class="rf-cardio-field"><span>MIN</span><input type="text" class="rf-in cardio-block-min" inputmode="numeric" placeholder="${best !== null ? Math.floor(best / 60) : "0"}" autocomplete="off" aria-label="Minutes"></label>
      <span class="rf-cardio-sep">:</span>
      <label class="rf-cardio-field"><span>S</span><input type="text" class="rf-in cardio-block-sec" inputmode="decimal" placeholder="00" autocomplete="off" aria-label="Secondes"></label>
      <span class="rf-pr" hidden>Record</span>
      <button type="button" class="rf-ck" aria-label="Valider le temps">${RF_ICONS.check}</button>
    </div>`;
  const minInput = card.querySelector(".cardio-block-min");
  const secInput = card.querySelector(".cardio-block-sec");
  const pill = card.querySelector(".rf-pill");
  minInput.value = item.min ?? "";
  secInput.value = item.sec ?? "";

  function refresh() {
    card.classList.toggle("is-done", Boolean(item.done));
    card.querySelector(".rf-cardio-row").classList.toggle("done", Boolean(item.done));
    pill.textContent = item.done ? "✓" : "0 / 1";
    pill.classList.toggle("ok", Boolean(item.done));
    const time = item.done ? readCardioTime(card) : null;
    card.querySelector(".rf-pr").hidden = !(ctx.showPR && time !== null && (best === null || time < best));
  }
  minInput.addEventListener("input", () => { item.min = minInput.value; ctx.persist(); refresh(); });
  secInput.addEventListener("input", () => { item.sec = secInput.value; ctx.persist(); refresh(); });
  card.querySelector(".rf-ck").addEventListener("click", () => {
    if (item.done) {
      item.done = false;
    } else {
      if (readCardioTime(card) === null) {
        ctx.feedback(`Merci d'indiquer ton temps pour le test ${item.exercise} (minutes et secondes, ex : 1 min 43 s).`, true);
        return;
      }
      item.done = true;
      if (document.activeElement && card.contains(document.activeElement)) document.activeElement.blur();
    }
    ctx.persist();
    refresh();
  });
  card.querySelector(".rf-more").addEventListener("click", () => openActionSheet(item.exercise, ctx.menu(item)));
  card.refreshCard = refresh;
  refresh();
  return card;
}

// --------------------------------------------------------------------------
// MINUTEUR DE REPOS
// Démarre à chaque série cochée (2:00 par défaut, réglable dans Réglages).
// −15 s / +15 s / Passer. À la fin : il disparaît, sans son ni vibration.
// --------------------------------------------------------------------------

const STORAGE_KEY_REST_SECONDS = "carnet_rest_seconds";
const DEFAULT_REST_SECONDS = 120;
const REST_CHOICES = [0, 60, 90, 120, 150, 180, 240, 300];

function getRestSeconds() {
  const raw = localStorage.getItem(STORAGE_KEY_REST_SECONDS);
  if (raw === null) return DEFAULT_REST_SECONDS;
  const value = Number(raw);
  return REST_CHOICES.includes(value) ? value : DEFAULT_REST_SECONDS;
}

function setRestSeconds(seconds) {
  localStorage.setItem(STORAGE_KEY_REST_SECONDS, String(seconds));
}

/** 90 → "1:30" */
function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const restTimer = {
  state: null, // { endsAt, total, label }
  interval: null,
  el: null,
  onChange: null, // appelé à chaque changement (pour le garder dans le brouillon)
  visibleWhen: null, // () => booléen : n'apparaît que sur la page de la séance
};

function ensureRestTimerElement() {
  if (restTimer.el) return restTimer.el;
  const el = document.createElement("div");
  el.className = "rf-rest";
  el.id = "rest-timer";
  el.hidden = true;
  el.setAttribute("role", "timer");
  el.innerHTML = `
    <div class="rf-rest-top">
      <div><div class="rf-rest-lbl"></div><div class="rf-rest-time">0:00</div></div>
      <div class="rf-rest-btns">
        <button type="button" data-rest="-15">−15 s</button>
        <button type="button" data-rest="15">+15 s</button>
        <button type="button" class="skip" data-rest="skip">Passer</button>
      </div>
    </div>
    <div class="rf-bar"><div></div></div>`;
  el.querySelectorAll("[data-rest]").forEach((button) => button.addEventListener("click", () => {
    const action = button.dataset.rest;
    if (!restTimer.state) return;
    if (action === "skip") stopRestTimer();
    else adjustRestTimer(Number(action));
  }));
  document.body.appendChild(el);
  restTimer.el = el;
  return el;
}

function startRestTimer(label, seconds) {
  if (!(seconds > 0)) return;
  restTimer.state = { endsAt: Date.now() + seconds * 1000, total: seconds, label };
  if (restTimer.onChange) restTimer.onChange(restTimer.state);
  runRestTimer();
}

/** Reprend un minuteur sauvegardé (appli fermée puis rouverte pendant le repos). */
function restoreRestTimer(state) {
  if (!state || !(state.endsAt > Date.now()) || !(state.total > 0)) {
    restTimer.state = null;
    renderRestTimer();
    return;
  }
  restTimer.state = { endsAt: state.endsAt, total: state.total, label: state.label || "" };
  runRestTimer();
}

function adjustRestTimer(deltaSeconds) {
  if (!restTimer.state) return;
  restTimer.state.endsAt += deltaSeconds * 1000;
  const remaining = (restTimer.state.endsAt - Date.now()) / 1000;
  if (remaining <= 0) { stopRestTimer(); return; }
  restTimer.state.total = Math.max(restTimer.state.total, remaining);
  if (restTimer.onChange) restTimer.onChange(restTimer.state);
  renderRestTimer();
}

function stopRestTimer() {
  restTimer.state = null;
  if (restTimer.interval) clearInterval(restTimer.interval);
  restTimer.interval = null;
  if (restTimer.onChange) restTimer.onChange(null);
  renderRestTimer();
}

function runRestTimer() {
  if (restTimer.interval) clearInterval(restTimer.interval);
  restTimer.interval = setInterval(renderRestTimer, 250);
  renderRestTimer();
}

function renderRestTimer() {
  const el = ensureRestTimerElement();
  const state = restTimer.state;
  if (state && state.endsAt - Date.now() <= 0) {
    // Fin du repos : le minuteur disparaît, tout simplement
    stopRestTimer();
    return;
  }
  const visible = Boolean(state) && (!restTimer.visibleWhen || restTimer.visibleWhen());
  el.hidden = !visible;
  document.body.classList.toggle("rf-rest-on", visible);
  if (!state) return;
  const remaining = (state.endsAt - Date.now()) / 1000;
  el.querySelector(".rf-rest-lbl").textContent = state.label ? `Repos · ${state.label}` : "Repos";
  el.querySelector(".rf-rest-time").textContent = formatClock(remaining);
  el.querySelector(".rf-bar > div").style.width = `${Math.max(0, Math.min(100, (remaining / state.total) * 100))}%`;
}

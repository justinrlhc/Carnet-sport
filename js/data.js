// ==========================================================================
// data.js — le "gardien" de toutes tes données.
//
// C'est le seul fichier qui parle directement à localStorage.
// localStorage, c'est une petite boîte de rangement fournie par ton
// navigateur : tout ce qu'on y met reste enregistré même si tu fermes
// la page ou éteins ton ordinateur. Elle est simplement liée à CE
// navigateur, sur CET ordinateur (d'où l'intérêt de l'export, ajouté
// plus tard).
//
// --------------------------------------------------------------------------
// PIÈGE À CONNAÎTRE : `new Date("2026-09-13")` (une date SANS heure) est
// interprétée par JavaScript comme minuit... en UTC, pas en heure locale.
// En France (UTC+2 l'été), ça décale la date vers 2h du matin une fois
// reconvertie en heure locale — invisible la plupart du temps, mais ça
// peut faire "sortir" une séance de sa semaine si on la compare à une
// limite calculée, elle, en heure locale (minuit pile). D'où cette
// fonction : à utiliser PARTOUT où on compare une date stockée à une
// limite de plage (début/fin de semaine par exemple), plutôt que
// `new Date(dateString)` directement.
// --------------------------------------------------------------------------
function parseLocalDate(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day); // minuit en heure LOCALE
}

/**
 * Convertit un objet Date en chaîne "AAAA-MM-JJ" en heure LOCALE.
 * Même piège que ci-dessus, dans l'autre sens : `toISOString()` bascule en
 * UTC et peut renvoyer la veille (ou le lendemain) selon l'heure qu'il est.
 * À utiliser partout où on veut "la date du jour" ou la clé d'un jour donné.
 */
function toLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Rend un texte saisi (note, nom d'exercice perso, mouvement libre...) sans
 * danger avant de l'insérer dans la page : "<", ">", "&" et les guillemets
 * sont affichés tels quels au lieu d'être interprétés comme du code. À
 * utiliser pour TOUT texte venant de l'utilisateur ou d'un fichier importé.
 */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Historiques longs : on affiche les plus récents par paquets de
 * HISTORY_PAGE_SIZE, avec un bouton "Voir plus" à la fin de la liste.
 * onMore est appelée quand on touche le bouton (elle augmente la limite
 * puis redessine la liste).
 */
const HISTORY_PAGE_SIZE = 20;

function appendShowMoreButton(listEl, remaining, onMore) {
  if (remaining <= 0) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-secondary history-more-btn";
  button.textContent = `Voir plus (${remaining} de plus)`;
  button.addEventListener("click", onMore);
  listEl.appendChild(button);
}

/** Nombre à la française : 87.5 → "87,5", 1500 → "1 500" (2 décimales max). */
function formatNumberFr(value, maxDecimals = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return escapeHtml(value);
  return number.toLocaleString("fr-FR", { maximumFractionDigits: maxDecimals });
}

/** Raccourci : la date d'aujourd'hui au format "AAAA-MM-JJ", en heure locale. */
function todayLocalDateString() {
  return toLocalDateString(new Date());
}
//
// Les autres fichiers (app.js, plus tard musculation.js, crossfit.js...)
// ne doivent JAMAIS écrire directement dans localStorage : ils passent
// toujours par les fonctions ci-dessous. Ça évite les erreurs et ça
// rend le code beaucoup plus facile à modifier.
// ==========================================================================

// Les "clés" sous lesquelles on range nos données dans la boîte localStorage
const STORAGE_KEY_SESSIONS = "carnet_sessions";
const STORAGE_KEY_BODYWEIGHT = "carnet_bodyweight";
const STORAGE_KEY_MANUAL_1RM = "carnet_manual_1rm";
const STORAGE_KEY_MANUAL_CF_BEST = "carnet_manual_cf_best";

// --------------------------------------------------------------------------
// FORME D'UNE SÉANCE (à titre indicatif, ce n'est pas du code exécuté)
//
// Séance de musculation (une séance peut contenir PLUSIEURS exercices) :
// {
//   id: "s1",
//   type: "musculation",
//   date: "2026-09-10",
//   exercises: [
//     { exercise: "Back Squat", sets: [{ reps: 5, weight: 120 }], rpe: 8 },
//     { exercise: "Bench Press", sets: [{ reps: 5, weight: 80 }], rpe: 7 }
//   ],
//   notes: "Bonne séance"
// }
//
// Séance de CrossFit :
// {
//   id: "s2",
//   type: "crossfit",
//   date: "2026-09-08",
//   wodName: "Fran",
//   scheme: "21-15-9",
//   exercises: ["Thrusters 42,5 kg", "Pull-ups"],
//   rxOrScaled: "RX",
//   timeSeconds: 402,   // 6:42, stocké en secondes pour faciliter les calculs
//   notes: ""
// }
// --------------------------------------------------------------------------


/**
 * Lit toutes les séances enregistrées.
 * Retourne toujours un tableau (vide si rien n'est encore enregistré).
 */
function getAllSessions() {
  const raw = localStorage.getItem(STORAGE_KEY_SESSIONS);
  if (!raw) return [];
  try {
    const sessions = JSON.parse(raw);
    return Array.isArray(sessions) ? sessions : [];
  } catch (error) {
    console.error("Impossible de lire les séances enregistrées :", error);
    return [];
  }
}

/**
 * Sauvegarde le tableau complet de séances (remplace tout ce qui existait).
 * Fonction interne : les autres fichiers utilisent plutôt addSession,
 * updateSession ou deleteSession ci-dessous.
 */
function saveAllSessions(sessions) {
  localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
}

/**
 * Ajoute une nouvelle séance et la sauvegarde.
 * Génère automatiquement un identifiant unique et une date de création.
 */
function addSession(sessionData) {
  const sessions = getAllSessions();
  const newSession = {
    id: "s_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
    createdAt: new Date().toISOString(),
    ...sessionData,
  };
  sessions.push(newSession);
  saveAllSessions(sessions);
  return newSession;
}

/**
 * Modifie une séance existante à partir de son id.
 */
function updateSession(id, updatedFields) {
  const sessions = getAllSessions();
  const index = sessions.findIndex((s) => s.id === id);
  if (index === -1) return null;
  sessions[index] = { ...sessions[index], ...updatedFields };
  saveAllSessions(sessions);
  return sessions[index];
}

/**
 * Supprime une séance à partir de son id.
 */
function deleteSession(id) {
  const sessions = getAllSessions().filter((s) => s.id !== id);
  saveAllSessions(sessions);
}

// --------------------------------------------------------------------------
// POIDS DE CORPS (suivi séparé des séances)
// Forme : { id: "w_...", date: "2026-09-10", weight: 82.4 }
// --------------------------------------------------------------------------

function getAllBodyweightEntries() {
  const raw = localStorage.getItem(STORAGE_KEY_BODYWEIGHT);
  if (!raw) return [];
  try {
    const entries = JSON.parse(raw);
    return Array.isArray(entries) ? entries : [];
  } catch (error) {
    console.error("Impossible de lire le poids de corps :", error);
    return [];
  }
}

function saveAllBodyweightEntries(entries) {
  entries.sort((a, b) => new Date(a.date) - new Date(b.date));
  localStorage.setItem(STORAGE_KEY_BODYWEIGHT, JSON.stringify(entries));
}

function addBodyweightEntry(date, weight) {
  const entries = getAllBodyweightEntries();
  entries.push({ id: "w_" + Date.now() + "_" + Math.floor(Math.random() * 1000), date, weight });
  saveAllBodyweightEntries(entries);
}

function updateBodyweightEntry(id, updatedFields) {
  const entries = getAllBodyweightEntries();
  const index = entries.findIndex((e) => e.id === id);
  if (index === -1) return null;
  entries[index] = { ...entries[index], ...updatedFields };
  saveAllBodyweightEntries(entries);
  return entries[index];
}

function deleteBodyweightEntry(id) {
  const entries = getAllBodyweightEntries().filter((e) => e.id !== id);
  saveAllBodyweightEntries(entries);
}

/**
 * Les toutes premières mesures de poids créées par l'application (avant
 * l'ajout de cette fonctionnalité) n'ont pas d'id. Cette fonction leur en
 * attribue un, une seule fois, pour que modifier/supprimer fonctionne
 * aussi sur ces anciennes mesures.
 */
function ensureBodyweightIds() {
  const entries = getAllBodyweightEntries();
  let changed = false;
  entries.forEach((entry) => {
    if (!entry.id) {
      entry.id = "w_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
      changed = true;
    }
  });
  if (changed) saveAllBodyweightEntries(entries);
}

/**
 * Renvoie le poids de corps actuel de l'athlète (la mesure la plus récente
 * enregistrée dans l'onglet Mensurations), ou null si aucune mesure n'a
 * encore été prise. Utilisée pour calculer le volume des exercices au
 * poids du corps (pull-ups, dips, burpees...).
 */
function getCurrentBodyweight() {
  const entries = getAllBodyweightEntries();
  if (entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
  return sorted[sorted.length - 1].weight;
}

// Pesées triées par date, gardées en mémoire tant qu'elles ne changent pas
// (le volume de chaque séance en a besoin : on évite de relire à chaque fois).
let bodyweightCacheRaw = null;
let bodyweightCacheSorted = [];

/**
 * Poids de corps À UNE DATE donnée : la dernière pesée faite ce jour-là ou
 * avant. Si la date est antérieure à ta toute première pesée, on prend
 * celle-ci (la plus proche). null si aucune pesée n'existe.
 * Sert au volume des exercices au poids du corps : une séance d'il y a
 * 3 mois garde le volume calculé avec ton poids d'il y a 3 mois.
 */
function getBodyweightAt(dateStr) {
  const raw = localStorage.getItem(STORAGE_KEY_BODYWEIGHT);
  if (raw !== bodyweightCacheRaw) {
    bodyweightCacheRaw = raw;
    bodyweightCacheSorted = getAllBodyweightEntries()
      .filter((e) => e && typeof e.date === "string" && Number(e.weight) > 0)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  const sorted = bodyweightCacheSorted;
  if (sorted.length === 0) return null;
  if (!dateStr) return Number(sorted[sorted.length - 1].weight);
  let found = sorted[0];
  for (const entry of sorted) {
    if (entry.date <= dateStr) found = entry;
    else break;
  }
  return Number(found.weight);
}

// --------------------------------------------------------------------------
// TAILLE ET IMC
// La taille change rarement une fois adulte : on la garde comme une seule
// valeur (pas un historique daté comme le poids), simple à modifier si besoin.
// --------------------------------------------------------------------------

const STORAGE_KEY_HEIGHT = "carnet_height_cm";

/** Renvoie la taille enregistrée (en cm), ou null si elle n'a jamais été saisie. */
function getHeight() {
  const raw = localStorage.getItem(STORAGE_KEY_HEIGHT);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function setHeight(heightCm) {
  localStorage.setItem(STORAGE_KEY_HEIGHT, String(heightCm));
}

/**
 * Calcule l'IMC (indice de masse corporelle) à partir du poids actuel et
 * de la taille enregistrée. Renvoie null si l'une des deux valeurs manque
 * — sans jamais bloquer le reste de l'application.
 * Formule : poids (kg) / taille (m)².
 */
function computeBmi() {
  const weight = getCurrentBodyweight();
  const heightCm = getHeight();
  if (weight === null || heightCm === null) return null;
  const heightM = heightCm / 100;
  return weight / (heightM * heightM);
}

// --------------------------------------------------------------------------
// ANNÉE DE NAISSANCE
// Sert aux barèmes d'endurance (Row 2000 m, Run 5 km), qui dépendent de
// l'âge. On garde l'année plutôt que l'âge pour que celui-ci suive tout seul
// au fil des années.
// --------------------------------------------------------------------------

const STORAGE_KEY_BIRTH_YEAR = "carnet_birth_year";

// Barèmes des rangs : "male" (par défaut) ou "female". Les standards de
// force, de gym et d'endurance ne sont pas les mêmes selon le sexe.
const STORAGE_KEY_SEX = "carnet_sex";

function getSex() {
  return localStorage.getItem(STORAGE_KEY_SEX) === "female" ? "female" : "male";
}

function setSex(sex) {
  localStorage.setItem(STORAGE_KEY_SEX, sex === "female" ? "female" : "male");
}

/** Année de naissance enregistrée, ou null. */
function getBirthYear() {
  const value = Number(localStorage.getItem(STORAGE_KEY_BIRTH_YEAR));
  return Number.isInteger(value) && value > 1900 ? value : null;
}

function setBirthYear(year) {
  localStorage.setItem(STORAGE_KEY_BIRTH_YEAR, String(year));
}

/**
 * Âge approximatif : l'âge atteint cette année (année en cours − année de
 * naissance). Sans le jour exact on peut avoir un an d'avance avant
 * l'anniversaire, sans effet sensible sur les barèmes. Null si inconnu.
 */
function getAge() {
  const birthYear = getBirthYear();
  if (birthYear === null) return null;
  return parseLocalDate(todayLocalDateString()).getFullYear() - birthYear;
}

// --------------------------------------------------------------------------
// RECORDS SAISIS MANUELLEMENT
// Certains records (1RM connu en conditions optimales, meilleur temps
// obtenu avant même d'utiliser l'application...) ne viennent pas d'une
// séance enregistrée : l'athlète les connaît déjà et veut juste les noter.
// On garde un seul record manuel par exercice / par WOD (la dernière
// valeur saisie remplace la précédente).
// --------------------------------------------------------------------------

function getManualOneRMs() {
  const raw = localStorage.getItem(STORAGE_KEY_MANUAL_1RM);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

/** data : { weight, date, notes } */
function setManualOneRM(exercise, data) {
  const all = getManualOneRMs();
  all[exercise] = data;
  localStorage.setItem(STORAGE_KEY_MANUAL_1RM, JSON.stringify(all));
}

function deleteManualOneRM(exercise) {
  const all = getManualOneRMs();
  delete all[exercise];
  localStorage.setItem(STORAGE_KEY_MANUAL_1RM, JSON.stringify(all));
}

// Perfs notées à la main pour les exercices au poids du corps (reps max
// d'affilée, sans lest) et pour les tests cardio (meilleur temps). Elles
// comptent pour les rangs, comme le 1RM noté.
const STORAGE_KEY_MANUAL_REPS = "carnet_manual_reps";
const STORAGE_KEY_MANUAL_TIMES = "carnet_manual_times";

function readJsonObject(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return {};
  try { const value = JSON.parse(raw); return value && typeof value === "object" ? value : {}; } catch { return {}; }
}

function getManualReps() { return readJsonObject(STORAGE_KEY_MANUAL_REPS); }

/** data : { reps, date, notes } */
function setManualReps(exercise, data) {
  const all = getManualReps();
  all[exercise] = data;
  localStorage.setItem(STORAGE_KEY_MANUAL_REPS, JSON.stringify(all));
}

function deleteManualReps(exercise) {
  const all = getManualReps();
  delete all[exercise];
  localStorage.setItem(STORAGE_KEY_MANUAL_REPS, JSON.stringify(all));
}

function getManualTimes() { return readJsonObject(STORAGE_KEY_MANUAL_TIMES); }

/** data : { timeSeconds, date, notes } */
function setManualTime(exercise, data) {
  const all = getManualTimes();
  all[exercise] = data;
  localStorage.setItem(STORAGE_KEY_MANUAL_TIMES, JSON.stringify(all));
}

function deleteManualTime(exercise) {
  const all = getManualTimes();
  delete all[exercise];
  localStorage.setItem(STORAGE_KEY_MANUAL_TIMES, JSON.stringify(all));
}

function getManualCfBests() {
  const raw = localStorage.getItem(STORAGE_KEY_MANUAL_CF_BEST);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

/** data : { timeSeconds, rounds, extraReps, date, notes } */
function setManualCfBest(wodName, data) {
  const all = getManualCfBests();
  all[wodName] = data;
  localStorage.setItem(STORAGE_KEY_MANUAL_CF_BEST, JSON.stringify(all));
}

function deleteManualCfBest(wodName) {
  const all = getManualCfBests();
  delete all[wodName];
  localStorage.setItem(STORAGE_KEY_MANUAL_CF_BEST, JSON.stringify(all));
}

// --------------------------------------------------------------------------
// PREMIÈRE OUVERTURE
// L'appli démarre VIDE : pas de séances d'exemple ni de faux poids de corps,
// qui fausseraient les rangs et débloqueraient des succès non mérités chez
// quelqu'un qui découvre l'appli. STORAGE_KEY_INITIALIZED marque simplement
// la première ouverture (il n'est jamais retiré, même par un reset).
// --------------------------------------------------------------------------

const STORAGE_KEY_INITIALIZED = "carnet_initialized";

function ensureInitialized() {
  if (localStorage.getItem(STORAGE_KEY_INITIALIZED)) return;
  localStorage.setItem(STORAGE_KEY_INITIALIZED, "1");
}

// --------------------------------------------------------------------------
// ACCUEIL DU PREMIER LANCEMENT
// "carnet_onboarded" est posé quand l'accueil a été vu (ou passé). Les
// personnes qui utilisaient déjà l'appli avant son arrivée ont des données :
// on pose le drapeau d'office pour qu'elles ne le voient jamais.
// --------------------------------------------------------------------------

const STORAGE_KEY_ONBOARDED = "carnet_onboarded";

function hasAnyUserData() {
  return getAllSessions().length > 0 ||
    getAllBodyweightEntries().length > 0 ||
    Object.keys(getManualOneRMs()).length > 0 ||
    Object.keys(getManualCfBests()).length > 0 ||
    Object.keys(getManualReps()).length > 0 ||
    Object.keys(getManualTimes()).length > 0 ||
    getBirthYear() !== null || getHeight() !== null;
}

function isOnboardingDone() {
  return localStorage.getItem(STORAGE_KEY_ONBOARDED) === "1";
}

function markOnboardingDone() {
  localStorage.setItem(STORAGE_KEY_ONBOARDED, "1");
}

function ensureOnboardingFlag() {
  if (!isOnboardingDone() && hasAnyUserData()) markOnboardingDone();
}

/**
 * Les séances de musculation créées avant cette mise à jour n'avaient
 * qu'un seul exercice chacune (champs "exercise", "sets", "rpe" directement
 * sur la séance). Cette fonction les transforme, une seule fois, vers le
 * nouveau format où une séance contient un tableau "exercises" — pour
 * pouvoir enregistrer plusieurs exercices dans la même séance sans perdre
 * tes anciennes données.
 */
function ensureMuscuSessionsMigrated() {
  const sessions = getAllSessions();
  let changed = false;

  const migrated = sessions.map((session) => {
    if (session.type === "musculation" && !session.exercises) {
      changed = true;
      const { exercise, sets, rpe, ...rest } = session;
      return { ...rest, exercises: [{ exercise, sets, rpe }] };
    }
    return session;
  });

  if (changed) saveAllSessions(migrated);
}

/**
 * Supprime toutes les données (séances + poids de corps).
 * Utile pour repartir de zéro une fois les données de test plus nécessaires.
 * Pas encore reliée à un bouton dans l'interface — ça viendra avec l'export/import.
 */
function clearAllData() {
  localStorage.removeItem(STORAGE_KEY_SESSIONS);
  localStorage.removeItem(STORAGE_KEY_BODYWEIGHT);
  localStorage.removeItem(STORAGE_KEY_MANUAL_1RM);
  localStorage.removeItem(STORAGE_KEY_MANUAL_CF_BEST);
  localStorage.removeItem(STORAGE_KEY_MANUAL_REPS);
  localStorage.removeItem(STORAGE_KEY_MANUAL_TIMES);
  localStorage.removeItem(STORAGE_KEY_HEIGHT);
  localStorage.removeItem(STORAGE_KEY_BIRTH_YEAR);
  localStorage.removeItem(STORAGE_KEY_SEX);
  // L'appli redevient neuve : l'accueil reviendra à la prochaine ouverture
  localStorage.removeItem(STORAGE_KEY_ONBOARDED);
  localStorage.removeItem(STORAGE_KEY_LAST_EXPORT);
  localStorage.removeItem(STORAGE_KEY_BACKUP_SNOOZE);
  // Rangs et succès : on repart de zéro aussi
  localStorage.removeItem("carnet_achievements");
  localStorage.removeItem("carnet_rank_snapshot");
}

// --------------------------------------------------------------------------
// DATE DE LA DERNIÈRE SAUVEGARDE (pour le rappel d'export)
// --------------------------------------------------------------------------

const STORAGE_KEY_LAST_EXPORT = "carnet_last_export";
const STORAGE_KEY_BACKUP_SNOOZE = "carnet_backup_snooze";
const BACKUP_REMINDER_DAYS = 30;

function getLastExportDate() {
  const value = localStorage.getItem(STORAGE_KEY_LAST_EXPORT);
  return isValidDateString(value) ? value : null;
}

function markBackupExported(dateStr) {
  localStorage.setItem(STORAGE_KEY_LAST_EXPORT, dateStr || todayLocalDateString());
  localStorage.removeItem(STORAGE_KEY_BACKUP_SNOOZE);
}

/** Nombre de jours entiers entre une date "AAAA-MM-JJ" et aujourd'hui. */
function daysSinceDate(dateStr) {
  const today = parseLocalDate(todayLocalDateString());
  return Math.round((today - parseLocalDate(dateStr)) / 86400000);
}

/** Date de la toute première donnée enregistrée (séance ou pesée), ou null. */
function getOldestDataDate() {
  const dates = [
    ...getAllSessions().map((s) => s && s.date),
    ...getAllBodyweightEntries().map((e) => e && e.date),
  ].filter(isValidDateString).sort();
  return dates.length ? dates[0] : null;
}

/**
 * Faut-il rappeler d'exporter ? Oui si la dernière sauvegarde date de plus
 * de 30 jours, ou si tu n'as jamais exporté alors que tes premières données
 * ont plus de 30 jours. "Plus tard" repousse le rappel de 7 jours.
 * Renvoie { due, days (null = jamais) }.
 */
function getBackupReminderState() {
  const last = getLastExportDate();
  const days = last ? daysSinceDate(last) : null;
  if (!hasAnyUserData()) return { due: false, days };
  const snooze = localStorage.getItem(STORAGE_KEY_BACKUP_SNOOZE);
  if (isValidDateString(snooze) && daysSinceDate(snooze) < 0) return { due: false, days };
  if (last) return { due: days >= BACKUP_REMINDER_DAYS, days };
  const oldest = getOldestDataDate();
  return { due: Boolean(oldest) && daysSinceDate(oldest) >= BACKUP_REMINDER_DAYS, days };
}

function snoozeBackupReminder(nbDays) {
  const until = parseLocalDate(todayLocalDateString());
  until.setDate(until.getDate() + nbDays);
  localStorage.setItem(STORAGE_KEY_BACKUP_SNOOZE, toLocalDateString(until));
}

// --------------------------------------------------------------------------
// EXPORT / IMPORT
// Comme toutes les données vivent uniquement dans le navigateur, l'export
// est la seule façon de les sauvegarder ailleurs (autre ordinateur,
// nettoyage du navigateur, etc.). L'import restaure une sauvegarde et
// REMPLACE toutes les données actuelles — c'est prévenu clairement dans
// l'interface avant de le faire.
// --------------------------------------------------------------------------

/** Rassemble toutes les données de l'app dans un seul objet, prêt à être exporté en JSON. */
function exportAllData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    sessions: getAllSessions(),
    bodyweight: getAllBodyweightEntries(),
    manualOneRMs: getManualOneRMs(),
    manualCfBests: getManualCfBests(),
    manualReps: getManualReps(),
    manualTimes: getManualTimes(),
    heightCm: getHeight(),
    birthYear: getBirthYear(),
    sex: getSex(),
    // Succès débloqués (avec leur date) : ils restent acquis même après un import
    achievements: JSON.parse(localStorage.getItem("carnet_achievements") || "{}"),
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Restaure une sauvegarde à partir d'un texte JSON.
 * Renvoie { success: true } ou { success: false, error: "..." }.
 */
function importAllData(jsonString) {
  let payload;
  try {
    payload = JSON.parse(jsonString);
  } catch (error) {
    return { success: false, error: "Ce fichier n'est pas un JSON valide." };
  }

  if (!payload || !Array.isArray(payload.sessions)) {
    return { success: false, error: "Ce fichier ne ressemble pas à une sauvegarde de Carnet." };
  }

  // Écrits tels quels : ensureDataSanitized() les répare juste après
  localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(payload.sessions));
  localStorage.setItem(STORAGE_KEY_BODYWEIGHT, JSON.stringify(Array.isArray(payload.bodyweight) ? payload.bodyweight : []));
  const asObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
  localStorage.setItem(STORAGE_KEY_MANUAL_1RM, JSON.stringify(asObject(payload.manualOneRMs)));
  localStorage.setItem(STORAGE_KEY_MANUAL_CF_BEST, JSON.stringify(asObject(payload.manualCfBests)));
  localStorage.setItem(STORAGE_KEY_MANUAL_REPS, JSON.stringify(asObject(payload.manualReps)));
  localStorage.setItem(STORAGE_KEY_MANUAL_TIMES, JSON.stringify(asObject(payload.manualTimes)));
  if (payload.heightCm) setHeight(payload.heightCm);
  if (Number.isInteger(payload.birthYear) && payload.birthYear > 1900) setBirthYear(payload.birthYear);
  if (payload.sex === "female" || payload.sex === "male") setSex(payload.sex);

  // Succès : on restaure ceux de la sauvegarde (une ancienne sauvegarde n'en a pas)
  const achievements = payload.achievements && typeof payload.achievements === "object" ? payload.achievements : {};
  localStorage.setItem("carnet_achievements", JSON.stringify(achievements));
  // La "photo" des rangs est recalculée sans annonce au prochain calcul
  localStorage.removeItem("carnet_rank_snapshot");
  // Le fichier importé EST une sauvegarde : ses données sont à l'abri depuis
  // la date où il a été créé (sinon le rappel d'export viendrait aussitôt)
  const exportedAt = typeof payload.exportedAt === "string" ? new Date(payload.exportedAt) : null;
  if (exportedAt && !isNaN(exportedAt.getTime())) {
    const exportedDay = toLocalDateString(exportedAt);
    const last = getLastExportDate();
    if (!last || exportedDay > last) localStorage.setItem(STORAGE_KEY_LAST_EXPORT, exportedDay);
  }

  // Réparation des données importées (une sauvegarde peut être abîmée),
  // puis mêmes mises à niveau qu'au démarrage
  const skipped = ensureDataSanitized();
  ensureBodyweightIds();
  ensureMuscuSessionsMigrated();
  // Une sauvegarde d'avant la version 18 a encore des noms en français
  ensureExerciseRenames();

  return { success: true, skipped };
}

// --------------------------------------------------------------------------
// RENOMMAGE D'EXERCICES
// Quand un exercice est retiré de la liste parce qu'il faisait doublon avec
// un autre, on convertit les anciennes données vers le nom conservé, pour
// que l'historique et les records restent regroupés sous un seul nom.
// --------------------------------------------------------------------------
const EXERCISE_RENAMES = {
  "Bent-Over Row": "Barbell Row",
  // Version 18 : tous les noms d'exercices en anglais
  "Rowing barre": "Barbell Row",
  "Rowing haltères": "Dumbbell Row",
  "Fente bulgare": "Bulgarian Split Squat",
  "Oiseau deltoïdes": "Rear Delt Fly",
  "Curl barre": "Barbell Curl",
  "Curl haltères": "Dumbbell Curl",
  "Barre au front": "Skull Crusher",
  "Élévations latérales": "Lateral Raise",
  "Rameur": "Row",
  "Course": "Run",
  "Rameur 2000 m": "Row 2000 m",
  "Course 5 km": "Run 5 km",
  "Rameur 500 m": "Row 500 m",
  "Course 400 m": "Run 400 m",
};

function ensureExerciseRenames() {
  const rename = (name) => EXERCISE_RENAMES[name] || name;

  // Séances : exercices de musculation et exercices structurés des WOD
  let sessionsChanged = false;
  const sessions = getAllSessions().map((session) => {
    if (!Array.isArray(session.exercises)) return session;
    const exercises = session.exercises.map((entry) => {
      if (typeof entry === "object" && entry !== null && EXERCISE_RENAMES[entry.exercise]) {
        sessionsChanged = true;
        return { ...entry, exercise: rename(entry.exercise) };
      }
      return entry;
    });
    return { ...session, exercises };
  });
  if (sessionsChanged) saveAllSessions(sessions);

  // 1RM saisis à la main : en cas de doublon, on garde la valeur la plus haute
  const manual = getManualOneRMs();
  let manualChanged = false;
  Object.keys(EXERCISE_RENAMES).forEach((oldName) => {
    if (!manual[oldName]) return;
    const newName = EXERCISE_RENAMES[oldName];
    if (!manual[newName] || manual[oldName].weight > manual[newName].weight) {
      manual[newName] = manual[oldName];
    }
    delete manual[oldName];
    manualChanged = true;
  });
  if (manualChanged) localStorage.setItem(STORAGE_KEY_MANUAL_1RM, JSON.stringify(manual));

  // Reps et temps notés à la main : en cas de doublon, on garde le nouveau nom
  [STORAGE_KEY_MANUAL_REPS, STORAGE_KEY_MANUAL_TIMES].forEach((key) => {
    const store = readJsonObject(key);
    let changed = false;
    Object.keys(EXERCISE_RENAMES).forEach((oldName) => {
      if (!store[oldName]) return;
      const newName = EXERCISE_RENAMES[oldName];
      if (!store[newName]) store[newName] = store[oldName];
      delete store[oldName];
      changed = true;
    });
    if (changed) localStorage.setItem(key, JSON.stringify(store));
  });
}

// --------------------------------------------------------------------------
// NETTOYAGE DES DONNÉES (au démarrage et à chaque import)
// Une sauvegarde abîmée ou modifiée à la main (séance sans date, série
// vide, nombre écrit en texte...) ne doit jamais bloquer l'appli. On répare
// ce qui peut l'être (nombres en texte, identifiant manquant...) et on met
// de côté ce qui est illisible, sans le détruire : une copie est gardée
// dans "carnet_rejected_items" pour pouvoir le récupérer si besoin.
// --------------------------------------------------------------------------

const STORAGE_KEY_REJECTED = "carnet_rejected_items";
const SANITIZE_DAILY_WOD_LABEL = "WOD du jour";

function isValidDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseLocalDate(value);
  return !isNaN(date.getTime()) && toLocalDateString(date) === value;
}

/** Nombre lu dans un champ (accepte "80" ou "42,5") ; fallback si vide ou illisible. */
function readStoredNumber(value, fallback) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return fallback;
  const number = typeof value === "string" ? Number(value.trim().replace(",", ".")) : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const cleanName = (value) => (typeof value === "string" ? value.trim() : "");

function sanitizeMuscuEntry(entry) {
  if (!isPlainObject(entry)) return null;
  const exercise = cleanName(entry.exercise);
  if (!exercise) return null;
  if (entry.kind === "cardio") {
    const timeSeconds = readStoredNumber(entry.timeSeconds, 0);
    return timeSeconds > 0 ? { ...entry, exercise, timeSeconds } : null;
  }
  const sets = (Array.isArray(entry.sets) ? entry.sets : [])
    .filter(isPlainObject)
    .map((set) => ({ ...set, reps: readStoredNumber(set.reps, 0), weight: Math.max(0, readStoredNumber(set.weight, 0)) }))
    .filter((set) => set.reps > 0);
  if (sets.length === 0) return null;
  const rpe = readStoredNumber(entry.rpe, null);
  return { ...entry, exercise, sets, rpe: rpe !== null && rpe > 0 ? rpe : null };
}

function sanitizeCfEntry(entry) {
  if (typeof entry === "string") return entry.trim() ? entry : null;
  if (!isPlainObject(entry)) return null;
  const exercise = cleanName(entry.exercise);
  const reps = readStoredNumber(entry.reps, 0);
  if (!exercise || !(reps > 0)) return null;
  const clean = { ...entry, exercise, reps, weight: Math.max(0, readStoredNumber(entry.weight, 0)), extraReps: Math.max(0, readStoredNumber(entry.extraReps, 0)) };
  if (clean.unit !== "cal" && clean.unit !== "m") delete clean.unit;
  return clean;
}

/** Renvoie la séance réparée, ou null si elle est illisible (pas de type ou pas de date valable). */
function sanitizeSession(raw) {
  if (!isPlainObject(raw)) return null;
  if (raw.type !== "musculation" && raw.type !== "crossfit") return null;
  if (!isValidDateString(raw.date)) return null;
  const session = { ...raw };
  if (typeof session.id === "number") session.id = String(session.id);
  if (typeof session.id !== "string" || !session.id) session.id = "s_" + Date.now() + "_" + Math.floor(Math.random() * 1000000);
  session.notes = typeof raw.notes === "string" ? raw.notes : "";

  if (raw.type === "musculation") {
    // Très ancien format : un seul exercice directement sur la séance
    let entries = raw.exercises;
    if (!Array.isArray(entries) && raw.exercise) {
      entries = [{ exercise: raw.exercise, sets: raw.sets, rpe: raw.rpe }];
      delete session.exercise; delete session.sets; delete session.rpe;
    }
    session.exercises = (Array.isArray(entries) ? entries : []).map(sanitizeMuscuEntry).filter(Boolean);
    return session.exercises.length > 0 ? session : null;
  }

  session.wodName = cleanName(raw.wodName) || SANITIZE_DAILY_WOD_LABEL;
  const time = readStoredNumber(raw.timeSeconds, null);
  session.timeSeconds = time !== null && time > 0 ? time : null;
  const rounds = readStoredNumber(raw.rounds, null);
  session.rounds = rounds !== null && rounds >= 0 ? rounds : null;
  const extra = readStoredNumber(raw.extraReps, null);
  session.extraReps = extra !== null && extra >= 0 ? extra : null;
  if (session.wodType !== null && typeof session.wodType !== "string") session.wodType = null;
  if (session.rxOrScaled !== null && session.rxOrScaled !== undefined && typeof session.rxOrScaled !== "string") session.rxOrScaled = null;
  session.exercises = (Array.isArray(raw.exercises) ? raw.exercises : []).map(sanitizeCfEntry).filter(Boolean);
  return session;
}

function sanitizeBodyweightEntry(raw) {
  if (!isPlainObject(raw) || !isValidDateString(raw.date)) return null;
  const weight = readStoredNumber(raw.weight, 0);
  return weight > 0 ? { ...raw, weight } : null;
}

/** Garde une copie de ce qui a été écarté (jamais détruit sans trace). */
function keepRejectedItems(kind, items) {
  if (items.length === 0) return;
  let store = [];
  try { store = JSON.parse(localStorage.getItem(STORAGE_KEY_REJECTED)) || []; } catch { store = []; }
  if (!Array.isArray(store)) store = [];
  items.forEach((item) => store.push({ kind, at: new Date().toISOString(), item }));
  localStorage.setItem(STORAGE_KEY_REJECTED, JSON.stringify(store.slice(-200)));
}

/** Filtre un carnet de records notés à la main : { "Nom": { ...valeur } }. */
function sanitizeManualStore(key, isValidEntry) {
  const raw = localStorage.getItem(key);
  if (!raw) return 0;
  let store;
  try { store = JSON.parse(raw); } catch { store = null; }
  if (!isPlainObject(store)) {
    keepRejectedItems(key, [raw]);
    localStorage.removeItem(key);
    return 1;
  }
  const rejected = [];
  Object.keys(store).forEach((name) => {
    if (!name.trim() || !isPlainObject(store[name]) || !isValidEntry(store[name])) {
      rejected.push({ [name]: store[name] });
      delete store[name];
    }
  });
  if (rejected.length > 0) {
    keepRejectedItems(key, rejected);
    localStorage.setItem(key, JSON.stringify(store));
  }
  return rejected.length;
}

/**
 * Répare et filtre toutes les données enregistrées.
 * Renvoie le nombre d'éléments illisibles mis de côté.
 */
function ensureDataSanitized() {
  let rejectedCount = 0;

  const rawSessions = localStorage.getItem(STORAGE_KEY_SESSIONS);
  if (rawSessions) {
    let parsed = null;
    try { parsed = JSON.parse(rawSessions); } catch { parsed = null; }
    if (Array.isArray(parsed)) {
      const kept = [];
      const rejected = [];
      parsed.forEach((raw) => {
        const clean = sanitizeSession(raw);
        if (clean) kept.push(clean); else rejected.push(raw);
      });
      keepRejectedItems("session", rejected);
      rejectedCount += rejected.length;
      const serialized = JSON.stringify(kept);
      if (serialized !== rawSessions) localStorage.setItem(STORAGE_KEY_SESSIONS, serialized);
    } else {
      // Fichier illisible : on le garde de côté plutôt que de l'écraser plus tard
      keepRejectedItems("sessions-file", [rawSessions]);
      localStorage.setItem(STORAGE_KEY_SESSIONS, "[]");
      rejectedCount += 1;
    }
  }

  const rawWeights = localStorage.getItem(STORAGE_KEY_BODYWEIGHT);
  if (rawWeights) {
    let parsed = null;
    try { parsed = JSON.parse(rawWeights); } catch { parsed = null; }
    if (Array.isArray(parsed)) {
      const kept = [];
      const rejected = [];
      parsed.forEach((raw) => {
        const clean = sanitizeBodyweightEntry(raw);
        if (clean) kept.push(clean); else rejected.push(raw);
      });
      keepRejectedItems("bodyweight", rejected);
      rejectedCount += rejected.length;
      // Toujours rangées par date (la dernière pesée = le poids actuel)
      kept.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      const serialized = JSON.stringify(kept);
      if (serialized !== rawWeights) localStorage.setItem(STORAGE_KEY_BODYWEIGHT, serialized);
    } else {
      keepRejectedItems("bodyweight-file", [rawWeights]);
      localStorage.setItem(STORAGE_KEY_BODYWEIGHT, "[]");
      rejectedCount += 1;
    }
  }

  rejectedCount += sanitizeManualStore(STORAGE_KEY_MANUAL_1RM, (e) => readStoredNumber(e.weight, 0) > 0);
  rejectedCount += sanitizeManualStore(STORAGE_KEY_MANUAL_REPS, (e) => readStoredNumber(e.reps, 0) > 0);
  rejectedCount += sanitizeManualStore(STORAGE_KEY_MANUAL_TIMES, (e) => readStoredNumber(e.timeSeconds, 0) > 0);
  rejectedCount += sanitizeManualStore(STORAGE_KEY_MANUAL_CF_BEST, (e) => readStoredNumber(e.timeSeconds, 0) > 0 || readStoredNumber(e.rounds, -1) >= 0);
  return rejectedCount;
}

ensureInitialized();
ensureDataSanitized();
ensureBodyweightIds();
ensureMuscuSessionsMigrated();
ensureExerciseRenames();
ensureOnboardingFlag();

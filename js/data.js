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
    return JSON.parse(raw);
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
    return JSON.parse(raw);
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
// Sert aux barèmes d'endurance (rameur 2000 m, course 5 km), qui dépendent de
// l'âge. On garde l'année plutôt que l'âge pour que celui-ci suive tout seul
// au fil des années.
// --------------------------------------------------------------------------

const STORAGE_KEY_BIRTH_YEAR = "carnet_birth_year";

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
  localStorage.removeItem(STORAGE_KEY_HEIGHT);
  localStorage.removeItem(STORAGE_KEY_BIRTH_YEAR);
  // Rangs et succès : on repart de zéro aussi
  localStorage.removeItem("carnet_achievements");
  localStorage.removeItem("carnet_rank_snapshot");
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
    heightCm: getHeight(),
    birthYear: getBirthYear(),
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

  saveAllSessions(payload.sessions || []);
  saveAllBodyweightEntries(payload.bodyweight || []);
  localStorage.setItem(STORAGE_KEY_MANUAL_1RM, JSON.stringify(payload.manualOneRMs || {}));
  localStorage.setItem(STORAGE_KEY_MANUAL_CF_BEST, JSON.stringify(payload.manualCfBests || {}));
  if (payload.heightCm) setHeight(payload.heightCm);
  if (Number.isInteger(payload.birthYear) && payload.birthYear > 1900) setBirthYear(payload.birthYear);

  // Succès : on restaure ceux de la sauvegarde (une ancienne sauvegarde n'en a pas)
  const achievements = payload.achievements && typeof payload.achievements === "object" ? payload.achievements : {};
  localStorage.setItem("carnet_achievements", JSON.stringify(achievements));
  // La "photo" des rangs est recalculée sans annonce au prochain calcul
  localStorage.removeItem("carnet_rank_snapshot");

  return { success: true };
}

// --------------------------------------------------------------------------
// RENOMMAGE D'EXERCICES
// Quand un exercice est retiré de la liste parce qu'il faisait doublon avec
// un autre, on convertit les anciennes données vers le nom conservé, pour
// que l'historique et les records restent regroupés sous un seul nom.
// --------------------------------------------------------------------------
const EXERCISE_RENAMES = {
  "Bent-Over Row": "Rowing barre",
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
}

ensureInitialized();
ensureBodyweightIds();
ensureMuscuSessionsMigrated();
ensureExerciseRenames();

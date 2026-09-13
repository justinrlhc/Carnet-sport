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
// DONNÉES DE DÉMONSTRATION
// Ne s'exécute QUE si aucune séance n'existe encore, pour ne jamais
// écraser tes vraies données. Utile pour ne pas ouvrir une app vide.
// --------------------------------------------------------------------------

function ensureDemoData() {
  if (getAllSessions().length > 0) return; // on ne touche à rien si des données existent déjà

  const today = new Date();

  // Petite aide pour générer une date "il y a X jours" au format AAAA-MM-JJ
  function daysAgo(n) {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d.toISOString().split("T")[0];
  }

  const demoSessions = [
    { type: "musculation", date: daysAgo(1), notes: "Bonne séance, technique stable",
      exercises: [
        { exercise: "Back Squat", sets: [{ reps: 5, weight: 120 }, { reps: 5, weight: 120 }, { reps: 4, weight: 120 }], rpe: 8 },
        { exercise: "Romanian Deadlift", sets: [{ reps: 8, weight: 80 }, { reps: 8, weight: 80 }], rpe: 6 },
      ] },

    { type: "crossfit", date: daysAgo(2), wodName: "Fran", scheme: "21-15-9",
      exercises: ["Thrusters 42,5 kg", "Pull-ups"], rxOrScaled: "RX",
      timeSeconds: 402, notes: "" },

    { type: "musculation", date: daysAgo(4), notes: "",
      exercises: [
        { exercise: "Bench Press", sets: [{ reps: 5, weight: 85 }, { reps: 5, weight: 85 }, { reps: 3, weight: 90 }], rpe: 9 },
        { exercise: "Incline Bench Press", sets: [{ reps: 8, weight: 60 }, { reps: 8, weight: 60 }], rpe: 7 },
      ] },

    { type: "musculation", date: daysAgo(6), notes: "",
      exercises: [
        { exercise: "Deadlift", sets: [{ reps: 3, weight: 150 }, { reps: 3, weight: 150 }], rpe: 8 },
      ] },

    { type: "crossfit", date: daysAgo(9), wodName: "Cindy", scheme: "AMRAP 20",
      exercises: ["Pull-ups", "Push-ups", "Air Squats"], rxOrScaled: "RX",
      timeSeconds: null, rounds: 18, notes: "" },

    { type: "musculation", date: daysAgo(11), notes: "",
      exercises: [
        { exercise: "Back Squat", sets: [{ reps: 5, weight: 115 }, { reps: 5, weight: 115 }, { reps: 5, weight: 115 }], rpe: 7 },
      ] },
  ];

  demoSessions.forEach((s) => addSession(s));

  // Quelques mesures de poids de corps sur les dernières semaines
  addBodyweightEntry(daysAgo(30), 83.0);
  addBodyweightEntry(daysAgo(20), 82.8);
  addBodyweightEntry(daysAgo(10), 82.6);
  addBodyweightEntry(daysAgo(1), 82.4);
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

  return { success: true };
}

// On s'assure que des données de démo existent dès le chargement de ce
// fichier, AVANT que musculation.js ou app.js ne tentent d'afficher quoi
// que ce soit. C'est pour ça que data.js doit toujours être chargé en
// premier dans index.html.
ensureDemoData();
ensureBodyweightIds();
ensureMuscuSessionsMigrated();

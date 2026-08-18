// =====================================================================
//  historiquePdfService.js
//
//  Module réutilisable, indépendant de historique.html.
//  Permet à n'importe quel autre code (autre page, autre script, autre
//  onglet) d'obtenir le PDF d'historique d'UNE hospitalisation, à partir
//  de son id, SANS le journal des modifications.
//
//  Utilisation depuis un autre fichier :
//
//    import { genererDocumentHistoriquePDF } from "./historiquePdfService.js";
//
//    const blob = await genererDocumentHistoriquePDF(patientId, hospiId);
//    // `blob` est un objet Blob (type "application/pdf") que l'appelant
//    // peut ensuite télécharger, afficher dans un <iframe>, l'ouvrir avec
//    // URL.createObjectURL(blob), l'envoyer ailleurs, etc.
//
//  Prérequis : la page qui importe ce module doit charger jsPDF et
//  jspdf-autotable (le module les charge lui-même automatiquement s'ils
//  ne sont pas déjà présents, voir assurerJsPdfCharge()).
// =====================================================================

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBKp5-7NNy0Gyl0tNbDgD-BxucYdg8ArWo",
  authDomain: "urgences-a8ed4.firebaseapp.com",
  projectId: "urgences-a8ed4"
};

// Réutilise l'app Firebase déjà initialisée par la page hôte si elle existe
// (évite l'erreur "Firebase App named '[DEFAULT]' already exists").
function obtenirDb() {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return getFirestore(app);
}

// ---------------------------------------------------------------------
// Chargement paresseux de jsPDF / jspdf-autotable si pas déjà présents
// ---------------------------------------------------------------------
let promesseJsPdf = null;
function chargerScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Impossible de charger ${src}`));
    document.head.appendChild(s);
  });
}
function assurerJsPdfCharge() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
  if (promesseJsPdf) return promesseJsPdf;
  promesseJsPdf = (async () => {
    await chargerScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    await chargerScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js");
  })();
  return promesseJsPdf;
}

// ---------------------------------------------------------------------
// Helpers repris tels quels de historique.html
// ---------------------------------------------------------------------
function calculerAge(dateNaissance) {
  if (!dateNaissance) return null;
  const parts = dateNaissance.split(/[\/\-]/);
  let d;
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      d = new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
      d = new Date(parts[2], parts[1] - 1, parts[0]);
    }
  } else {
    d = new Date(dateNaissance);
  }
  if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

function formatRapport(rapport) {
  if (!rapport) return null;
  if (typeof rapport === "string") return rapport;
  if (typeof rapport === "object") {
    const labels = {
      identite: "Identité",
      hospitalisation: "Hospitalisation",
      medical: "Dossier médical",
      evolution: "Évolution aux urgences",
      constantes: "Constantes vitales",
      examens: "Examens complémentaires",
      actes: "Actes réalisés",
      medicaments: "Médicaments administrés",
      sortie: "Sortie"
    };
    return Object.entries(labels)
      .filter(([cle]) => rapport[cle] && String(rapport[cle]).trim() !== "")
      .map(([cle, lbl]) => `${lbl} :\n${rapport[cle]}`)
      .join("\n\n");
  }
  return null;
}

function parseDateSouple(str) {
  if (!str) return null;
  str = String(str).trim();
  let m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, d, mo, y, h, mi, s] = m;
    return new Date(+y, +mo - 1, +d, +h, +mi, s ? +s : 0);
  }
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return new Date(+y, +mo - 1, +d, 0, 0, 0);
  }
  const d2 = new Date(str);
  if (!isNaN(d2.getTime())) return d2;
  return null;
}

function documentsDeLHospitalisation(tousLesDocuments, hospiId, hospi, estActive) {
  const debut = parseDateSouple(hospi.dateDebut);
  const fin = estActive ? new Date() : (parseDateSouple(hospi.dateFin) || new Date());

  return tousLesDocuments.filter(d => {
    if (d.hospitalisationId && d.hospitalisationId === hospiId) return true;
    if (d.hospitalisationId && d.hospitalisationId !== hospiId) return false;
    const dateDoc = parseDateSouple(d.dateCreation);
    if (!dateDoc || !debut) return false;
    return dateDoc >= debut && dateDoc <= fin;
  });
}

function chargerLogoPourPdf() {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "https://junior2704.github.io/GestUrg2/logo.png";
  });
}

async function obtenirSignatureMedecin(db) {
  // Optionnel : si la page appelante est authentifiée, on récupère
  // le nom du médecin connecté pour la mention "Document généré par...".
  try {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return null;
    const snap = await getDoc(doc(db, "medecins", user.uid));
    if (snap.exists()) {
      const data = snap.data();
      return { nom: data.nom || "", type: data.type || "" };
    }
  } catch (e) {
    console.error("Erreur récupération médecin connecté :", e);
  }
  return null;
}

// ---------------------------------------------------------------------
// Helpers de mise en page PDF (identiques à historique.html)
// ---------------------------------------------------------------------
function addTitreSection(pdf, titre, y, marginX, pageWidth, bleu) {
  if (y > pdf.internal.pageSize.getHeight() - 100) {
    pdf.addPage();
    y = 40;
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(...bleu);
  pdf.text(titre, marginX, y);
  y += 8;
  pdf.setDrawColor(...bleu);
  pdf.setLineWidth(0.8);
  pdf.line(marginX, y, pageWidth - marginX, y);
  return y + 16;
}

function addBlock(pdf, titre, contenu, y, marginX, pageWidth, bleu) {
  y = addTitreSection(pdf, titre, y, marginX, pageWidth, bleu);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(40, 40, 40);
  const maxWidth = pageWidth - marginX * 2;
  const lignes = pdf.splitTextToSize(contenu || "—", maxWidth);
  lignes.forEach(ligne => {
    if (y > pdf.internal.pageSize.getHeight() - 60) {
      pdf.addPage();
      y = 40;
    }
    pdf.text(ligne, marginX, y);
    y += 13;
  });
  return y + 14;
}

function addExamenBloc(pdf, ex, y, marginX, pageWidth, bleu) {
  const maxWidth = pageWidth - marginX * 2;
  const estRealise = !!ex.realise;

  const verifierSaut = (hauteurNecessaire) => {
    if (y + hauteurNecessaire > pdf.internal.pageSize.getHeight() - 60) {
      pdf.addPage();
      y = 40;
    }
  };

  verifierSaut(16);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(30, 30, 30);
  pdf.text(ex.type || "Examen", marginX, y);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(...(estRealise ? [46, 125, 50] : [230, 140, 0]));
  pdf.text(estRealise ? "✔ Réalisé" : "⏳ En attente", pageWidth - marginX, y, { align: "right" });
  y += 15;

  const meta = [];
  if (ex.dateDemande) meta.push(`Demandé le ${ex.dateDemande}`);
  if (ex.dateRealisation) meta.push(`Réalisé le ${ex.dateRealisation}`);
  if (meta.length > 0) {
    verifierSaut(13);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(110, 110, 110);
    pdf.text(meta.join("    "), marginX, y);
    y += 15;
  }

  if (ex.commentaire) {
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(9.5);
    pdf.setTextColor(70, 70, 70);
    const lignesCom = pdf.splitTextToSize(`Commentaire : ${ex.commentaire}`, maxWidth);
    lignesCom.forEach(ligne => {
      verifierSaut(13);
      pdf.text(ligne, marginX, y);
      y += 13;
    });
  }

  if (ex.compteRendu) {
    verifierSaut(14);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    pdf.setTextColor(50, 50, 50);
    pdf.text("Compte-rendu :", marginX, y);
    y += 13;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.setTextColor(40, 40, 40);
    const lignesCR = pdf.splitTextToSize(ex.compteRendu, maxWidth);
    lignesCR.forEach(ligne => {
      verifierSaut(13);
      pdf.text(ligne, marginX, y);
      y += 13;
    });
  }

  return y + 8;
}

function addListeTable(pdf, titre, items, statutFait, statutFaitAff, champDateRealise, champCommentRealise, y, marginX, pageWidth, bleu) {
  y = addTitreSection(pdf, titre, y, marginX, pageWidth, bleu);
  if (!items || items.length === 0) {
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(10);
    pdf.setTextColor(120, 120, 120);
    pdf.text("Aucune entrée enregistrée.", marginX, y);
    return y + 24;
  }
  pdf.autoTable({
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [["Libellé", "Statut", "Demandé le", `${statutFaitAff} le`, "Commentaire"]],
    body: items.map(it => [
      it.product || "—",
      (it.status === statutFait) ? "Fait" : "En attente",
      it.createdAt || "—",
      it[champDateRealise] || "—",
      it[champCommentRealise] || it.comment || "—"
    ]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: bleu, textColor: 255 },
    theme: "grid"
  });
  return pdf.lastAutoTable.finalY + 20;
}

// =====================================================================
//  FONCTION PRINCIPALE — à appeler depuis un autre code
// =====================================================================
/**
 * Génère le PDF d'historique d'une hospitalisation, SANS le journal des
 * modifications, et le renvoie sous forme de Blob (ne l'affiche pas,
 * ne le télécharge pas, ne le stocke nulle part : c'est à l'appelant
 * de décider quoi en faire).
 *
 * @param {string} patientId  id du document dans la collection "patients"
 * @param {string} hospiId    id du document dans la collection "hospitalisations"
 * @returns {Promise<Blob>}   le PDF, type "application/pdf"
 */
export async function genererDocumentHistoriquePDF(patientId, hospiId) {
  if (!patientId) throw new Error("patientId manquant.");
  if (!hospiId) throw new Error("hospiId manquant.");

  await assurerJsPdfCharge();
  const db = obtenirDb();

  const patientSnap = await getDoc(doc(db, "patients", patientId));
  if (!patientSnap.exists()) throw new Error("Patient introuvable.");
  const patient = patientSnap.data();

  const hospiSnap = await getDoc(doc(db, "hospitalisations", hospiId));
  if (!hospiSnap.exists()) throw new Error("Hospitalisation introuvable.");
  const hospi = hospiSnap.data();

  const estActive = hospiId === patient.hospitalisationActiveId;
  const idsHospi = Array.isArray(patient.hospitalisations) ? patient.hospitalisations : [];
  const position = idsHospi.indexOf(hospiId);
  const numero = position >= 0 ? position + 1 : "?";

  let tousLesDocuments = [];
  try {
    const docsSnap = await getDocs(query(collection(db, "documents"), where("patientId", "==", patientId)));
    tousLesDocuments = docsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("Erreur chargement des documents :", e);
  }

  const medecin = await obtenirSignatureMedecin(db);

  return construirePdf({ patient, patientId, hospi, hospiId, numero, estActive, tousLesDocuments, medecin });
}

async function construirePdf({ patient, patientId, hospi, hospiId, numero, estActive, tousLesDocuments, medecin }) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "pt", format: "a4" });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const marginX = 40;
  let y = 40;
  const bleu = [26, 115, 232]; // #1a73e8

  // ---- En-tête ----
  const logo = await chargerLogoPourPdf();
  if (logo) {
    try { pdf.addImage(logo, "PNG", marginX, y, 46, 46); } catch (e) {}
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(...bleu);
  pdf.text("Rapport d'hospitalisation", marginX + (logo ? 58 : 0), y + 20);
  pdf.setFontSize(11);
  pdf.setTextColor(90, 90, 90);
  pdf.text(`Hospitalisation ${hospiId}${estActive ? " — EN COURS" : ""}`, marginX + (logo ? 58 : 0), y + 38);

  y += 60;
  pdf.setDrawColor(...bleu);
  pdf.setLineWidth(1.2);
  pdf.line(marginX, y, pageWidth - marginX, y);
  y += 20;

  // ---- Identité patient ----
  const age = calculerAge(patient.dateNaissance);
  const identiteTexte =
    `Nom : ${patient.nom || "—"}    Prénom : ${patient.prenom || "—"}    Sexe : ${patient.sexe || "—"}\n` +
    `Date de naissance : ${patient.dateNaissance || "—"}${age !== null ? " (" + age + " ans)" : ""}    ID patient : ${patientId}\n` +
    `Médecin traitant : ${patient.medtraitant || "—"}\n` +
    `Allergies : ${patient.importanceAllergies ? "🚨 " : ""}${patient.allergies || "aucune"}    Vigilances : ${patient.vigilances || "aucune"}`;
  y = addBlock(pdf, "Identité du patient", identiteTexte, y, marginX, pageWidth, bleu);

  // ---- Hospitalisation ----
  const hospitalisationTexte =
    `Admission : ${hospi.dateDebut || "—"}    Sortie : ${hospi.dateFin || (estActive ? "En cours" : "—")}\n` +
    `Motif : ${hospi.motif || "—"}\n` +
    `Gravité : ${hospi.gravite || "—"}    Moyen d'entrée : ${hospi.moyen || "—"}    Circuit : ${hospi.circuit || "—"}\n`;
  y = addBlock(pdf, "Hospitalisation", hospitalisationTexte, y, marginX, pageWidth, bleu);

  // ---- Équipe référente ----
  const equipe = hospi.equipe || {};
  const equipeTexte =
    `Médecin : ${equipe.medecinReferent?.nom || "—"}\n` +
    `Infirmier(e) : ${equipe.infirmierReferent?.nom || "—"}\n` +
    `Interne : ${equipe.interneReferent?.nom || "—"}\n` +
    `Externe : ${equipe.externeReferent?.nom || "—"}`;
  y = addBlock(pdf, "Équipe référente", equipeTexte, y, marginX, pageWidth, bleu);

  // ---- Dossier médical ----
  const dossier = hospi.dossierMedical || {};
  const medicalTexte =
    `Questionnaire IAO :\n${dossier.questionnaire || "—"}\n\n` +
    `Antécédents :\n${dossier.antecedents || "—"}\n\n` +
    `Traitements :\n${dossier.traitements || "—"}\n\n` +
    `Histoire de la maladie :\n${dossier.histoire || "—"}\n\n` +
    `CR Auscultation :\n${dossier.auscultation || "—"}`;
  y = addBlock(pdf, "Dossier médical", medicalTexte, y, marginX, pageWidth, bleu);

  // ---- Évolution ----
  y = addBlock(pdf, "Évolution aux urgences", hospi.evolution || "Aucune évolution enregistrée.", y, marginX, pageWidth, bleu);

  // ---- Constantes ----
  const constantes = Array.isArray(hospi.constantesReleves) ? hospi.constantesReleves : [];
  y = addTitreSection(pdf, "Constantes vitales", y, marginX, pageWidth, bleu);
  if (constantes.length > 0) {
    const tries = [...constantes].sort((a, b) => `${a.date || ""} ${a.heure || ""}`.localeCompare(`${b.date || ""} ${b.heure || ""}`));
    pdf.autoTable({
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [["Date", "Heure", "Temp", "FC", "TA", "Sat", "FR", "Douleur", "GCS", "Obs"]],
      body: tries.map(r => [
        r.date || "—", r.heure || "—", r.temperature || "—", r.fc || "—",
        r.ta || "—", r.saturation || "—", r.fr || "—", r.douleur || "—",
        r.glasgowTotal || "—", r.observation || "—"
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: bleu, textColor: 255 },
      theme: "grid"
    });
    y = pdf.lastAutoTable.finalY + 20;
  } else {
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(10);
    pdf.setTextColor(120, 120, 120);
    pdf.text("Aucune constante enregistrée.", marginX, y);
    y += 24;
  }

  // ---- Examens ----
  const examens = Array.isArray(hospi.examens) ? hospi.examens : [];
  y = addTitreSection(pdf, "Examens complémentaires", y, marginX, pageWidth, bleu);
  if (examens.length > 0) {
    examens.forEach((ex, idx) => {
      y = addExamenBloc(pdf, ex, y, marginX, pageWidth, bleu);
      if (idx < examens.length - 1) {
        if (y > pdf.internal.pageSize.getHeight() - 60) { pdf.addPage(); y = 40; }
        pdf.setDrawColor(225, 225, 225);
        pdf.setLineWidth(0.5);
        pdf.line(marginX, y, pageWidth - marginX, y);
        y += 14;
      }
    });
    y += 10;
  } else {
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(10);
    pdf.setTextColor(120, 120, 120);
    pdf.text("Aucun examen demandé.", marginX, y);
    y += 24;
  }

  // ---- Actes ----
  const actes = Array.isArray(hospi.actes) ? hospi.actes : [];
  y = addListeTable(pdf, "Actes réalisés", actes, "realise", "Réalisé", "realiseAt", "realiseComment", y, marginX, pageWidth, bleu);

  // ---- Médicaments ----
  const meds = Array.isArray(hospi.meds) ? hospi.meds : [];
  y = addListeTable(pdf, "Médicaments administrés aux urgences", meds, "pris", "Administré", "takenAt", "takeComment", y, marginX, pageWidth, bleu);

  // ---- Documents ----
  const documentsHospi = documentsDeLHospitalisation(tousLesDocuments, hospiId, hospi, estActive);
  y = addTitreSection(pdf, "Documents", y, marginX, pageWidth, bleu);
  if (documentsHospi.length > 0) {
    pdf.autoTable({
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [["Type", "Date de création", "Créé par"]],
      body: documentsHospi.map(d => [d.type || "Document", d.dateCreation || "—", d.contenu?.medecin?.nom || "—"]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: bleu, textColor: 255 },
      theme: "grid"
    });
    y = pdf.lastAutoTable.finalY + 20;
  } else {
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(10);
    pdf.setTextColor(120, 120, 120);
    pdf.text("Aucun document rattaché à cette hospitalisation.", marginX, y);
    y += 24;
  }

  // ---- Sortie ----
  const sortie = hospi.sortie;
  if (sortie) {
    const sortieLignes = [`Type : ${sortie.type || "—"}`];
    if (sortie.serviceHospitalisation) sortieLignes.push(`Service hospitalisation : ${sortie.serviceHospitalisation}`);
    if (sortie.destinationTransfert) sortieLignes.push(`Destination transfert : ${sortie.destinationTransfert}`);
    if (sortie.avisSpecialiste) sortieLignes.push(`Avis spécialiste : ${sortie.avisSpecialiste}`);
    if (Array.isArray(sortie.options) && sortie.options.length > 0) sortieLignes.push(`Options : ${sortie.options.join(", ")}`);
    if (sortie.traitementSortie) sortieLignes.push(`Traitement de sortie :\n${sortie.traitementSortie}`);
    if (sortie.autreSortieTexte) sortieLignes.push(`Autre : ${sortie.autreSortieTexte}`);
    if (sortie.autreOptionTexte) sortieLignes.push(`Autre option : ${sortie.autreOptionTexte}`);
    y = addBlock(pdf, "Sortie", sortieLignes.join("\n"), y, marginX, pageWidth, bleu);
  }

  // ---- Rapport de clôture ----
  const rapportTexte = formatRapport(hospi.rapport);
  if (rapportTexte) {
    y = addBlock(pdf, "Clôture", rapportTexte, y, marginX, pageWidth, bleu);
  }

  // ---- Signature ----
  if (hospi.signatureImage) {
    if (y > pdf.internal.pageSize.getHeight() - 140) { pdf.addPage(); y = 40; }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(50, 50, 50);
    pdf.text("Signature du patient :", marginX, y);
    y += 8;
    try {
      const formatImg = /^data:image\/jpeg/i.test(hospi.signatureImage) ? "JPEG" : "PNG";
      pdf.addImage(hospi.signatureImage, formatImg, marginX, y, 160, 80);
      y += 96;
    } catch (e) {
      console.error("Erreur insertion signature dans le PDF :", e);
    }
  } else if (hospi.signatureStatut === "Refus de signer") {
    if (y > pdf.internal.pageSize.getHeight() - 60) { pdf.addPage(); y = 40; }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(200, 60, 0);
    pdf.text("Signature du patient : ⚠️ Refus de signer", marginX, y);
    y += 20;
  }

  // ---- PAS de journal des modifications ici (exclu volontairement) ----

  // ---- Pied de page ----
  if (y > pdf.internal.pageSize.getHeight() - 80) {
    pdf.addPage();
    y = 40;
  }
  pdf.setDrawColor(220, 220, 220);
  pdf.setLineWidth(0.6);
  pdf.line(marginX, y, pageWidth - marginX, y);
  y += 18;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(120, 120, 120);
  const auteurExport = medecin
    ? `Document généré par ${medecin.nom}${medecin.type ? " (" + medecin.type + ")" : ""} le ${new Date().toLocaleString("fr-FR")}`
    : `Document généré le ${new Date().toLocaleString("fr-FR")}`;
  pdf.text(auteurExport, marginX, y);

  return pdf.output("blob");
}
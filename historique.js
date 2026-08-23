// ======================================================
// historique.js
// ------------------------------------------------------
// Construit le document "historique d'hospitalisation"
// au format .ord (celui consommé par ordToPdf.js).
//
// Utilisation :
//
//   import { construireHistoriqueOrd } from "./historique.js";
//
//   const ord = await construireHistoriqueOrd(db, patientId, hospitalisationId, {
//       inclureJournal: true,
//       medecin: { nom: "Dr Dupont", specialite: "Urgentiste", type: "doc" },
//       logo: "logo.png",
//       lieu: "Urgences - HOPJ"
//   });
//
//   const blob = await window.ordToPDF(ord);
//
// Ce module ne s'occupe QUE de fabriquer l'objet .ord.
// L'affichage à l'écran (cartes HTML) reste géré par historique.html.
// La génération du PDF reste gérée par ordToPdf.js.
// ======================================================

import {
    doc,
    getDoc,
    collection,
    getDocs,
    query,
    where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// ==============================
// UTILITAIRES
// ==============================

function echapper(texte) {
    return String(texte ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

function calculerAge(dateNaissance) {

    if (!dateNaissance) return null;

    const parts = String(dateNaissance).split(/[\/\-]/);
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

function formatHorodatage(entree) {
    try {
        if (entree.horodatage && typeof entree.horodatage.toDate === "function") {
            return entree.horodatage.toDate();
        }
    } catch (e) {}
    return null;
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


// ==============================
// HELPERS DE CONSTRUCTION .ord
// ==============================
//
// Le format "contenu" de l'ord accepte des items :
//   { type: "text", value: "<html ou texte>" }   -> inséré tel quel (HTML autorisé)
//   { type: "bold", value: "..." }                -> <b>...</b>
//   { type: "newline" }                            -> saut de ligne
//   { type: "separator" }                          -> ligne de séparation bleue
//
// NB : "text" insère la valeur SANS échappement (pour permettre les tableaux
// HTML), donc tout texte "utilisateur" doit être échappé manuellement avec
// echapper() avant d'être placé dans un item "text".

function titreSection(titre) {
    return [
        { type: "bold", value: echapper(titre) },
        { type: "newline" }
    ];
}

function ligneChamp(label, valeur) {
    return {
        type: "text",
        value: `<b>${echapper(label)} :</b> ${echapper(valeur ?? "—")}<br>`
    };
}

function paragrapheLibre(label, texte) {
    return {
        type: "text",
        value:
            `<b>${echapper(label)} :</b><br>` +
            `${echapper(texte || "—").replaceAll("\n", "<br>")}<br>`
    };
}

function tableConstantes(constantes) {

    if (!constantes || constantes.length === 0) {
        return {
            type: "text",
            value: `<i>Aucune constante enregistrée.</i><br>`
        };
    }

    const tries = [...constantes].sort((a, b) =>
        `${a.date || ""} ${a.heure || ""}`.localeCompare(`${b.date || ""} ${b.heure || ""}`)
    );

    const lignes = tries.map(r => `
        <tr>
            <td>${echapper(r.date || "—")}</td>
            <td>${echapper(r.heure || "—")}</td>
            <td>${echapper(r.temperature || "—")}</td>
            <td>${echapper(r.fc || "—")}</td>
            <td>${echapper(r.ta || "—")}</td>
            <td>${echapper(r.saturation || "—")}</td>
            <td>${echapper(r.fr || "—")}</td>
            <td>${echapper(r.douleur || "—")}</td>
            <td>${echapper(r.glasgowTotal || "—")}</td>
            <td>${echapper(r.observation || "—")}</td>
        </tr>
    `).join("");

    return {
        type: "text",
        value: `
            <table style="width:100%;border-collapse:collapse;font-size:11px;margin:6px 0;">
                <thead>
                    <tr style="background:#eef3fb;color:#1a73e8;">
                        <th style="border:1px solid #cfd8e3;padding:4px 6px;">Date</th>
                        <th style="border:1px solid #cfd8e3;padding:4px 6px;">Heure</th>
                        <th style="border:1px solid #cfd8e3;padding:4px 6px;">Temp</th>
                        <th style="border:1px solid #cfd8e3;padding:4px 6px;">FC</th>
                        <th style="border:1px solid #cfd8e3;padding:4px 6px;">TA</th>
                        <th style="border:1px solid #cfd8e3;padding:4px 6px;">Sat</th>
                        <th style="border:1px solid #cfd8e3;padding:4px 6px;">FR</th>
                        <th style="border:1px solid #cfd8e3;padding:4px 6px;">Douleur</th>
                        <th style="border:1px solid #cfd8e3;padding:4px 6px;">GCS</th>
                        <th style="border:1px solid #cfd8e3;padding:4px 6px;">Obs</th>
                    </tr>
                </thead>
                <tbody>${lignes}</tbody>
            </table>
        `
    };
}

function blocExamens(examens) {

    if (!examens || examens.length === 0) {
        return [{ type: "text", value: `<i>Aucun examen demandé.</i><br>` }];
    }

    const items = [];

    examens.forEach(ex => {

        const estRealise = !!ex.realise;

        items.push({
            type: "text",
            value:
                `<b>${echapper(ex.type || "Examen")}</b> — ` +
                `${estRealise ? "✅ Réalisé" : "⏳ En attente"}<br>` +
                (ex.dateDemande ? `Demandé le ${echapper(ex.dateDemande)}<br>` : "") +
                (ex.dateRealisation ? `Réalisé le ${echapper(ex.dateRealisation)}<br>` : "") +
                (ex.commentaire ? `<i>Commentaire : ${echapper(ex.commentaire)}</i><br>` : "") +
                (ex.compteRendu ? `Compte-rendu :<br>${echapper(ex.compteRendu).replaceAll("\n", "<br>")}<br>` : "")
        });

        items.push({ type: "newline" });
    });

    return items;
}

function tableListeActesOuMeds(items, statutFait, statutFaitAff, champDateRealise, champCommentRealise) {

    if (!items || items.length === 0) {
        return {
            type: "text",
            value: `<i>Aucune entrée enregistrée.</i><br>`
        };
    }

    const lignes = items.map(it => `
        <tr>
            <td>${echapper(it.product || "—")}</td>
            <td>${it.status === statutFait ? statutFaitAff : "En attente"}</td>
            <td>${echapper(it.createdAt || "—")}</td>
            <td>${echapper(it[champDateRealise] || "—")}</td>
            <td>${echapper(it[champCommentRealise] || it.comment || "—")}</td>
        </tr>
    `).join("");

    return {
        type: "text",
        value: `
            <table style="width:100%;border-collapse:collapse;font-size:11px;margin:6px 0;">
                <thead>
                    <tr style="background:#eef3fb;color:#1a73e8;">
                        <th style="border:1px solid #cfd8e3;padding:4px 6px;">Libellé</th>
                        <th style="border:1px solid #cfd8e3;padding:4px 6px;">Statut</th>
                        <th style="border:1px solid #cfd8e3;padding:4px 6px;">Demandé le</th>
                        <th style="border:1px solid #cfd8e3;padding:4px 6px;">${echapper(statutFaitAff)} le</th>
                        <th style="border:1px solid #cfd8e3;padding:4px 6px;">Commentaire</th>
                    </tr>
                </thead>
                <tbody>${lignes}</tbody>
            </table>
        `
    };
}

function tableDocuments(documents) {

    if (!documents || documents.length === 0) {
        return {
            type: "text",
            value: `<i>Aucun document rattaché à cette hospitalisation.</i><br>`
        };
    }

    const lignes = documents.map(d => `
        <tr>
            <td>${echapper(d.type || "Document")}</td>
            <td>${echapper(d.dateCreation || "—")}</td>
            <td>${echapper(d.contenu?.medecin?.nom || d.creePar || "—")}</td>
        </tr>
    `).join("");

    return {
        type: "text",
        value: `
            <table style="width:100%;border-collapse:collapse;font-size:11px;margin:6px 0;">
                <thead>
                    <tr style="background:#eef3fb;color:#1a73e8;">
                        <th style="border:1px solid #cfd8e3;padding:4px 6px;">Type</th>
                        <th style="border:1px solid #cfd8e3;padding:4px 6px;">Date de création</th>
                        <th style="border:1px solid #cfd8e3;padding:4px 6px;">Créé par</th>
                    </tr>
                </thead>
                <tbody>${lignes}</tbody>
            </table>
        `
    };
}

function tableJournal(historique) {

    const entrees = Array.isArray(historique) ? [...historique] : [];

    entrees.sort((a, b) => {
        const da = formatHorodatage(a);
        const dbb = formatHorodatage(b);
        if (da && dbb) return da - dbb;
        return 0;
    });

    if (entrees.length === 0) {
        return {
            type: "text",
            value: `<i>Aucune modification enregistrée pour cette hospitalisation.</i><br>`
        };
    }

    const lignes = entrees.map(e => {

        const d = formatHorodatage(e);

        const dateAffichee = d
            ? d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
            : `${e.date || ""} ${e.heure || ""}`.trim() || "—";

        return `
            <tr>
                <td>${echapper(dateAffichee)}</td>
                <td>${echapper(e.action || e.texte || "—")}</td>
                <td>${echapper(e.auteurNom || "—")}</td>
                <td>${echapper(e.auteurType || e.auteurSpecialite || "—")}</td>
            </tr>
        `;
    }).join("");

    return {
        type: "text",
        value: `
            <table style="width:100%;border-collapse:collapse;font-size:11px;margin:6px 0;">
                <thead>
                    <tr style="background:#eef3fb;color:#1a73e8;">
                        <th style="border:1px solid #cfd8e3;padding:4px 6px;">Date / Heure</th>
                        <th style="border:1px solid #cfd8e3;padding:4px 6px;">Action</th>
                        <th style="border:1px solid #cfd8e3;padding:4px 6px;">Auteur</th>
                        <th style="border:1px solid #cfd8e3;padding:4px 6px;">Rôle</th>
                    </tr>
                </thead>
                <tbody>${lignes}</tbody>
            </table>
        `
    };
}


// ==============================
// CONSTRUCTION PRINCIPALE
// ==============================

/**
 * Construit le document .ord représentant l'historique complet
 * d'une hospitalisation.
 *
 * @param {Firestore} db - instance Firestore déjà initialisée
 * @param {string} patientId
 * @param {string} hospitalisationId
 * @param {object} [options]
 * @param {boolean} [options.inclureJournal=false] - inclure le journal des modifications
 * @param {object} [options.medecin] - { nom, specialite, type, signature } du soignant qui exporte
 * @param {string} [options.logo="logo.png"]
 * @param {string} [options.lieu="Urgences"]
 * @param {number} [options.numero] - numéro d'ordre de l'hospitalisation (affichage uniquement)
 * @returns {Promise<object>} objet .ord prêt pour window.ordToPDF(ord)
 */
export async function construireHistoriqueOrd(db, patientId, hospitalisationId, options = {}) {

    if (!db) throw new Error("Instance Firestore (db) manquante");
    if (!patientId) throw new Error("patientId manquant");
    if (!hospitalisationId) throw new Error("hospitalisationId manquant");

    const {
        inclureJournal = false,
        medecin = {},
        logo = "logo.png",
        lieu = "Urgences",
        numero = null
    } = options;


    // ---- Patient ----

    const patientSnap = await getDoc(doc(db, "patients", patientId));

    if (!patientSnap.exists()) {
        throw new Error("Patient introuvable");
    }

    const patient = patientSnap.data();


    // ---- Hospitalisation ----

    const hospiSnap = await getDoc(doc(db, "hospitalisations", hospitalisationId));

    if (!hospiSnap.exists()) {
        throw new Error("Hospitalisation introuvable");
    }

    const hospi = hospiSnap.data();

    const estActive = hospitalisationId === patient.hospitalisationActiveId;


    // ---- Documents liés ----

    let tousLesDocuments = [];

    try {
        const docsSnap = await getDocs(
            query(collection(db, "documents"), where("patientId", "==", patientId))
        );
        tousLesDocuments = docsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.error("Erreur chargement des documents :", e);
    }

    const documentsHospi = documentsDeLHospitalisation(
        tousLesDocuments,
        hospitalisationId,
        hospi,
        estActive
    );


    // ==================================================
    // CONSTRUCTION DU CONTENU
    // ==================================================

    const contenu = [];

    // ---- Identité patient ----

    const age = calculerAge(patient.dateNaissance);
    const allergiesImportantes = patient.importanceAllergies === true;

    contenu.push(...titreSection("🧑‍⚕️ Identité du patient"));
    contenu.push(ligneChamp("Nom", patient.nom));
    contenu.push(ligneChamp("Prénom", patient.prenom));
    contenu.push(ligneChamp("Sexe", patient.sexe));
    contenu.push(ligneChamp(
        "Date de naissance",
        `${patient.dateNaissance || "—"}${age !== null ? " (" + age + " ans)" : ""}`
    ));
    contenu.push(ligneChamp("ID patient", patientId));
    contenu.push(ligneChamp("Médecin traitant", patient.medtraitant));
    contenu.push(ligneChamp(
        "Allergies",
        `${allergiesImportantes ? "🚨 " : ""}${patient.allergies || "aucune"}`
    ));
    contenu.push(ligneChamp("Vigilances", patient.vigilances || "aucune"));
    contenu.push({ type: "newline" });
    contenu.push({ type: "separator" });

    // ---- Hospitalisation ----

    contenu.push(...titreSection(
        `🏥 Hospitalisation${numero ? " n°" + numero : " " + hospitalisationId}${estActive ? " (EN COURS)" : ""}`
    ));
    contenu.push(ligneChamp("Admission", hospi.dateDebut));
    contenu.push(ligneChamp("Sortie", hospi.dateFin || (estActive ? "En cours" : "—")));
    contenu.push(ligneChamp("Motif", hospi.motif));
    contenu.push(ligneChamp("Gravité", hospi.gravite));
    contenu.push({ type: "newline" });
    contenu.push({ type: "separator" });

    // ---- Équipe référente ----

    const equipe = hospi.equipe || {};

    contenu.push(...titreSection("👥 Équipe référente"));
    contenu.push(ligneChamp("Médecin", equipe.medecinReferent?.nom));
    contenu.push(ligneChamp("Infirmier(e)", equipe.infirmierReferent?.nom));
    contenu.push(ligneChamp("Interne", equipe.interneReferent?.nom));
    contenu.push(ligneChamp("Externe", equipe.externeReferent?.nom));
    contenu.push({ type: "newline" });
    contenu.push({ type: "separator" });

    // ---- Dossier médical ----

    const dossier = hospi.dossierMedical || {};

    contenu.push(...titreSection("📋 Dossier médical"));
    contenu.push(paragrapheLibre("Questionnaire IAO", dossier.questionnaire));
    contenu.push(paragrapheLibre("Antécédents", dossier.antecedents));
    contenu.push(paragrapheLibre("Traitements", dossier.traitements));
    contenu.push(paragrapheLibre("Histoire de la maladie", dossier.histoire));
    contenu.push(paragrapheLibre("CR Auscultation", dossier.auscultation));
    contenu.push({ type: "newline" });
    contenu.push({ type: "separator" });

    // ---- Évolution ----

    contenu.push(...titreSection("📈 Évolution aux urgences"));
    contenu.push(paragrapheLibre("Évolution", hospi.evolution || "Aucune évolution enregistrée."));
    contenu.push({ type: "newline" });
    contenu.push({ type: "separator" });

    // ---- Constantes ----

    contenu.push(...titreSection("🌡️ Constantes vitales"));
    contenu.push(tableConstantes(hospi.constantesReleves));
    contenu.push({ type: "newline" });
    contenu.push({ type: "separator" });

    // ---- Examens ----

    const examens = Array.isArray(hospi.examens) ? hospi.examens : [];

    contenu.push(...titreSection("🩻 Examens complémentaires"));
    contenu.push(...blocExamens(examens));
    contenu.push({ type: "separator" });

    // ---- Actes ----

    const actes = Array.isArray(hospi.actes) ? hospi.actes : [];

    contenu.push(...titreSection("🩺 Actes réalisés"));
    contenu.push(tableListeActesOuMeds(actes, "realise", "Réalisé", "realiseAt", "realiseComment"));
    contenu.push({ type: "newline" });
    contenu.push({ type: "separator" });

    // ---- Médicaments ----

    const meds = Array.isArray(hospi.meds) ? hospi.meds : [];

    contenu.push(...titreSection("💊 Médicaments administrés aux urgences"));
    contenu.push(tableListeActesOuMeds(meds, "pris", "Administré", "takenAt", "takeComment"));
    contenu.push({ type: "newline" });
    contenu.push({ type: "separator" });

    // ---- Documents ----

    contenu.push(...titreSection("📄 Documents"));
    contenu.push(tableDocuments(documentsHospi));
    contenu.push({ type: "newline" });
    contenu.push({ type: "separator" });

    // ---- Sortie ----

    const sortie = hospi.sortie || null;

    if (sortie) {

        contenu.push(...titreSection("🚪 Sortie"));
        contenu.push(ligneChamp("Type", sortie.type));

        if (sortie.serviceHospitalisation) contenu.push(ligneChamp("Service hospitalisation", sortie.serviceHospitalisation));
        if (sortie.destinationTransfert) contenu.push(ligneChamp("Destination transfert", sortie.destinationTransfert));
        if (sortie.avisSpecialiste) contenu.push(ligneChamp("Avis spécialiste", sortie.avisSpecialiste));
        if (Array.isArray(sortie.options) && sortie.options.length > 0) contenu.push(ligneChamp("Options", sortie.options.join(", ")));
        if (sortie.traitementSortie) contenu.push(paragrapheLibre("Traitement de sortie", sortie.traitementSortie));
        if (sortie.autreSortieTexte) contenu.push(ligneChamp("Autre", sortie.autreSortieTexte));
        if (sortie.autreOptionTexte) contenu.push(ligneChamp("Autre option", sortie.autreOptionTexte));

        contenu.push({ type: "newline" });
        contenu.push({ type: "separator" });
    }

    // ---- Clôture ----

    const rapportTexte = formatRapport(hospi.rapport);

    if (rapportTexte) {
        contenu.push(...titreSection("🧾 Clôture"));
        contenu.push(paragrapheLibre("Clôture", rapportTexte));
        contenu.push({ type: "newline" });
        contenu.push({ type: "separator" });
    }

    // ---- Signature du patient ----

    if (hospi.signatureImage) {

        contenu.push(...titreSection("✍️ Signature du patient"));
        contenu.push({
            type: "text",
            value: `<img src="${hospi.signatureImage}" style="max-width:280px;border:1px solid #e0e6ec;border-radius:6px;background:white;padding:6px;"><br>`
        });
        contenu.push({ type: "newline" });
        contenu.push({ type: "separator" });

    } else if (hospi.signatureStatut === "Refus de signer") {

        contenu.push(...titreSection("✍️ Signature du patient"));
        contenu.push({
            type: "text",
            value: `<span style="color:#c62828;font-weight:700;">⚠️ Refus de signer</span><br>`
        });
        contenu.push({ type: "newline" });
        contenu.push({ type: "separator" });
    }

    // ---- Journal des modifications (optionnel) ----

    if (inclureJournal) {
        contenu.push(...titreSection("🕘 Journal des modifications"));
        contenu.push(tableJournal(hospi.historique));
    }


    // ==================================================
    // OBJET .ord FINAL
    // ==================================================

    const nomPatient = `${patient.prenom || ""} ${patient.nom || ""}`.trim();

    const ord = {

        logo,

        date: new Date().toLocaleDateString("fr-FR"),

        lieu,

        titre: `Rapport d'hospitalisation${numero ? " n°" + numero : " " + hospitalisationId}${estActive ? " — EN COURS" : ""}`,

        patient: {
            prenom: patient.prenom || "",
            nom: patient.nom || "",
            date_Naissance: patient.dateNaissance || "—"
        },

        medecin: {
            nom: medecin.nom || "Utilisateur inconnu",
            specialite: medecin.specialite || medecin.type || "",
            signature: medecin.signature || null
        },

        contenu,
        hospitalisationId : hospitalisationId

    };

    return ord;
}


// ==============================
// EXPORT GLOBAL (compat script classique)
// ==============================

if (typeof window !== "undefined") {
    window.construireHistoriqueOrd = construireHistoriqueOrd;
}
(function () {

// ==============================
// RÉGLAGES DE PAGINATION
// ==============================
// Marge HAUT/BAS appliquée sur CHAQUE page du PDF (mm). La marge gauche/droite
// reste gérée par le padding de #ordonnance (sinon html2pdf rétrécit le contenu).
const PDF_MARGE_VERTICALE_MM = 15;

// Un bloc de plus de MAX_LIGNES_BLOC lignes n'est pas gardé d'un seul tenant :
// il est coupé ligne par ligne (voir decouperEnGroupes). Les petits blocs
// restent entiers. La page peut donc changer au milieu d'une catégorie, mais
// jamais au milieu d'une ligne, et sans grand vide en bas de page.
const MAX_LIGNES_BLOC = 3;

const NEWLINE_HTML = `<div class="newline"></div>`;
const SEPARATOR_HTML = `<div class="separator"></div>`;

// ==============================
// CONTENU RENDER
// ==============================
//
// Le contenu structuré est découpé en "blocs" indépendants, chacun avec
// page-break-inside: avoid (html2pdf, mode 'css').
//
//  - "separator"  : trait bleu. Il est collé au bloc SUIVANT (jamais seul en
//                   bas de page, "keep with next").
//  - "break"      : frontière silencieuse entre deux blocs (l'auteur du
//                   document choisit ainsi la granularité).
//  - blocs longs  : redécoupés automatiquement en groupes de lignes.
// ==============================
function echapper(txt) {
    return String(txt)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

// Une "ligne" = texte + saut de ligne. Pour un bloc long, chaque ligne devient
// une unité qui ne sera jamais coupée par un saut de page, avec ces exceptions
// (ce qui doit rester collé) :
//  - une ligne "libellé :" reste avec la ligne qui la suit (libellé + valeur) ;
//  - titre de section (juste après un séparateur) : séparateur + titre + premier
//    élément restent ensemble (pas de titre seul en bas de page) ;
//  - lignes numérotées ("1. ...", "2) ...") : chacune ouvre un groupe (un
//    médicament et ses détails restent ensemble) ;
//  - une ligne vide reste attachée à la ligne précédente (pas de page qui
//    commence par un blanc) ;
//  - jamais une ligne orpheline seule sur la dernière page du bloc.
function decouperEnGroupes(lignes, apresSeparateur) {

    const texteDe = l => l.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
    const estNumerotee = l => /^\d+\s*[.)]\s/.test(texteDe(l));
    const estLibelle = l => /[:：]$/.test(texteDe(l));
    const estVide = l => texteDe(l) === "";
    const groupes = [];

    if (lignes.some(estNumerotee)) {

        lignes.forEach((l, i) => {
            if (i === 0 || (estNumerotee(l) && groupes[groupes.length - 1].some(estNumerotee))) {
                groupes.push([l]);
            } else {
                groupes[groupes.length - 1].push(l);
            }
        });

    } else {

        lignes.forEach(l => {
            const prec = groupes[groupes.length - 1];
            if (prec && (estVide(l) || (prec.length === 1 && estLibelle(prec[0])))) {
                prec.push(l);
            } else {
                groupes.push([l]);
            }
        });

        // séparateur + titre + premier élément : un seul groupe
        if (apresSeparateur && groupes.length > 1) {
            groupes[0].push(...groupes.splice(1, 1)[0]);
        }

    }

    if (groupes.length > 1 && groupes[groupes.length - 1].length === 1) {
        const dernier = groupes.pop();
        groupes[groupes.length - 1].push(...dernier);
    }

    return groupes;
}

function renderContenu(contenu) {

    // ---- Contenu texte simple ----
    if (typeof contenu === "string") {

        return `
    <div class="bloc">
        <div class="line">${echapper(contenu).replaceAll("\n", "<br>")}</div>
    </div>
`;

    }

    // ---- Contenu vide ----
    if (!Array.isArray(contenu)) {

        return "";

    }

    // ---- Contenu structuré -> blocs ----
    let html = "";
    let lignes = [];            // lignes terminées du bloc courant
    let ligneCourante = "";     // texte de la ligne en cours
    let separateurEnAttente = false;

    const bloc = (contenuHTML, avecSeparateur) => `
            <div class="bloc">
                ${avecSeparateur ? SEPARATOR_HTML : ""}
                <div class="line">${contenuHTML}</div>
            </div>
        `;

    function emettreSeparateurSeul() {
        html += `<div class="bloc separator-bloc">${SEPARATOR_HTML}</div>`;
        separateurEnAttente = false;
    }

    function flushBloc() {

        if (ligneCourante.trim() !== "") {
            lignes.push(ligneCourante);
        }
        ligneCourante = "";

        // lignes "vides" seules (que des sauts de ligne) : on les ignore
        const aDuTexte = lignes.some(l => l.replace(/<[^>]*>/g, "").trim() !== "");

        if (!aDuTexte) {
            lignes = [];
            return;
        }

        const groupes = lignes.length > MAX_LIGNES_BLOC
            ? decouperEnGroupes(lignes, separateurEnAttente)
            : [lignes];

        groupes.forEach(g => {
            html += bloc(g.join(""), separateurEnAttente);
            separateurEnAttente = false;   // le séparateur n'est posé qu'avant le 1er groupe
        });

        lignes = [];
    }

    contenu.forEach(item => {

        switch (item.type) {

            case "text":

                ligneCourante += item.value || "";

                break;


            case "bold":

                ligneCourante += `<b>${item.value || ""}</b>`;

                break;


            case "newline":

                // Le saut de ligne reste À L'INTÉRIEUR du bloc courant
                // (un label et sa valeur restent ensemble).
                lignes.push(ligneCourante + NEWLINE_HTML);
                ligneCourante = "";

                break;


            case "separator":

                flushBloc();

                // deux séparateurs d'affilée : le premier part seul
                if (separateurEnAttente) {
                    emettreSeparateurSeul();
                }

                separateurEnAttente = true;   // sera collé au prochain bloc

                break;


            case "break":

                flushBloc();

                break;

        }

    });

    flushBloc();

    // séparateur final sans contenu derrière lui
    if (separateurEnAttente) {
        emettreSeparateurSeul();
    }

    return html;

}

// ==============================
// HTML GENERATOR
// ==============================

function generateHTML(ord) {

    const contenuHTML = renderContenu(ord.contenu);

    return `
    <html>
    <head>
        <meta charset="UTF-8">
        <style>

            body {
                margin: 0;
                font-family: "Segoe UI", Arial;
                background: white;
            }

            #ordonnance {
                width: 210mm;
                padding: 0 18mm;
                box-sizing: border-box;
                color: #1f2937;
            }

            .header {
                display: flex;
                justify-content: space-between;
                border-bottom: 2px solid #2563eb;
                padding-bottom: 10px;
                page-break-inside: avoid;
                break-inside: avoid;
            }

            .logo { height: 70px; }

            .titre {
                text-align: center;
                font-size: 24px;
                margin: 20px 0;
                color: #2563eb;
                page-break-inside: avoid;
                break-inside: avoid;
            }

        .patient {
    background: #f3f4f6;
    padding: 12px;
    border-radius: 8px;
    margin-bottom: 20px;
    font-size: 14px;
    page-break-inside: avoid;
    break-inside: avoid;
}


            .signature {
                margin-top: 30px;
                text-align: right;
                page-break-inside: avoid;
                break-inside: avoid;
            }
.separator {
    border-top: 2px solid #2563eb;
    margin: 12px 0;
}
.contenu {
    font-size: 15px;
    line-height: 1.6;
    white-space: normal;
}

.line {
    display: block;
    white-space: pre-wrap;
}

b {
    font-weight: bold;
}
    .bold {
    font-weight: bold;
    display: inline;
    white-space: pre-wrap;
}


/* ==============================
   CORRECTIF PAGINATION
   Chaque bloc (section / paragraphe) ne doit jamais
   être coupé au milieu par un saut de page. S'il ne
   tient pas dans l'espace restant, il bascule entier
   sur la page suivante.
   ============================== */
.bloc {
    page-break-inside: avoid;
    break-inside: avoid;
    margin-bottom: 4px;
}

.bloc.separator-bloc {
    margin-bottom: 8px;
}

.line {
    display: inline;
}

b {
    font-weight: bold;
    display: inline;
}
   .newline {
    height: 1em;
}

.separator {
    display: block;
    width: 100%;
    height: 2px;
    background: #2563eb;
    margin: 12px 0;
}
    .signature-img {
    max-height: 60px;
    max-width: 150px;
    margin-top: 8px;
}

/* Tableaux (constantes, actes, médicaments, documents, journal) :
   jamais coupés au milieu d'une ligne */
table {
    page-break-inside: avoid;
    break-inside: avoid;
}
tr {
    page-break-inside: avoid;
    break-inside: avoid;
}
    .line {
    display: block;
}

b {
    font-weight: bold;
}

.newline {
    height: 1em;
}
        ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

::-webkit-scrollbar-track {
    background: transparent;
}

::-webkit-scrollbar-thumb {
    background-color: rgba(33, 150, 243, 0.35);
    border-radius: 20px;
    transition: background-color 0.2s ease;
}

::-webkit-scrollbar-thumb:hover {
    background-color: rgba(21, 101, 192, 0.6);
}

/* Firefox */
* {
    scrollbar-width: thin;
    scrollbar-color: rgba(33, 150, 243, 0.35) transparent;
}
</style>
    </head>
    <body>

        <div id="ordonnance">

            <div class="header">
                <img src="${ord.logo || 'logo.png'}" class="logo">
                <div>Le ${ord.date}, ${ord.lieu}</div>
            </div>

            <div class="titre">${ord.titre}</div>

             <div class="patient">
                <strong>Patient :</strong> ${ord.patient.prenom} ${ord.patient.nom}<br>
                Né(e) le : ${ord.patient.date_Naissance}
            </div>

            <div class="contenu">
                ${contenuHTML}
            </div>

            <div class="signature">
                ${ord.medecin.nom}<br>
                ${ord.medecin.specialite || ""}
                ${ord.medecin.signature ? `<br><img src="${ord.medecin.signature}" class="signature-img">` : ""}
            </div>

        </div>

    </body>
    </html>
    `;
}


// ==============================
// SAFE PDF ENGINE (CORE FIX)
// ==============================

function cleanContainer() {
    document.querySelectorAll(".html2pdf-container").forEach(e => e.remove());
}


// ==============================
// UNIVERSAL ORD TO PDF
// ==============================

// Options html2pdf à utiliser PARTOUT où l'on génère un PDF depuis generateHTML()
// (ex. : html2pdf().set(ordPdfOptions()).from(container)).
// margin = [haut, gauche, bas, droite] en mm : haut/bas sur CHAQUE page.
function ordPdfOptions() {

    return {
        margin: [PDF_MARGE_VERTICALE_MM, 0, PDF_MARGE_VERTICALE_MM, 0],
        html2canvas: {
            scale: 2,
            scrollY: 0,
            useCORS: true
        },
        jsPDF: {
            unit: 'mm',
            format: 'a4',
            orientation: 'portrait'
        },
        pagebreak: {
            mode: ['css']
        }
    };

}

async function ordToPDF(ord) {

    cleanContainer();

    const html = generateHTML(ord);

    const container = document.createElement("div");
    container.className = "html2pdf-container";
    container.innerHTML = html;

    document.body.appendChild(container);

    const pdf = await html2pdf()
        .set(ordPdfOptions())
        .from(container)
        .outputPdf('blob');

    container.remove();

    return pdf;
}

window.ordToPDF = ordToPDF;
// ==============================
// PATCH html2pdf (COMPAT MODE)
// ==============================
//
// Tout rendu d'une ordonnance (élément #ordonnance issu de generateHTML) reçoit
// automatiquement les marges haut/bas par page et la pagination CSS, même si
// l'appelant passe margin: 0 ou aucune option de saut de page.
//
// Le patch est posé sur le PROTOTYPE du worker html2pdf : un patch posé sur
// une instance est perdu dès le premier appel chaîné (.set().from()...).
// Si html2pdf n'est pas encore chargé quand ce fichier s'exécute, le patch
// s'installe au moment où il est défini.
// ==============================

function estRenduOrdonnance(src) {
    return !!(src && src.nodeType === 1 && src.querySelector &&
        (src.id === "ordonnance" || src.querySelector("#ordonnance")));
}

function patcherHtml2pdf(h2p) {

    let instance;
    try { instance = h2p(); } catch (e) { return; }

    const proto = instance && Object.getPrototypeOf(instance);

    if (!proto || proto.__ordPatche ||
        typeof proto.from !== "function" || typeof proto.set !== "function") {
        return;
    }

    const oldFrom = proto.from;
    const oldSet = proto.set;

    proto.from = function (src, type) {

        const worker = estRenduOrdonnance(src)
            ? oldSet.call(this, {
                margin: ordPdfOptions().margin,
                pagebreak: ordPdfOptions().pagebreak
            })
            : this;

        return oldFrom.call(worker, src, type);
    };

    proto.__ordPatche = true;
}

(function installerPatchHtml2pdf() {

    if (typeof window.html2pdf === "function") {
        patcherHtml2pdf(window.html2pdf);
        return;
    }

    let valeur = window.html2pdf;

    try {
        Object.defineProperty(window, "html2pdf", {
            configurable: true,
            enumerable: true,
            get() { return valeur; },
            set(v) {
                valeur = v;
                if (typeof v === "function") {
                    try { patcherHtml2pdf(v); } catch (e) { /* non bloquant */ }
                }
            }
        });
    } catch (e) { /* non bloquant */ }

})();


// ==============================
// EXPORT GLOBALS
// ==============================

window.ordToPDF = ordToPDF;
window.generateHTML = generateHTML;
window.ordPdfOptions = ordPdfOptions;
window.renderContenu = renderContenu;
})();
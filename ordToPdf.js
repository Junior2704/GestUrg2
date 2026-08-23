(function () {

// ==============================
// CONTENU RENDER
// ==============================
//
// CORRECTIF PAGINATION :
// Le contenu structuré n'est plus injecté dans UN SEUL <span> géant
// (impossible à protéger d'une coupure de page). Il est maintenant
// découpé en "blocs" indépendants (un par groupe de lignes entre deux
// "newline"/"separator"), chacun avec page-break-inside: avoid.
// html2pdf (mode 'css') peut ainsi éviter de couper un bloc en deux
// et le fait basculer entier sur la page suivante si besoin.
// ==============================
function renderContenu(contenu) {

    // ==================================================
    // CONTENU TEXTE SIMPLE
    // ==================================================

    if (typeof contenu === "string") {

      return `
    <div class="bloc">
        <div class="line">
            ${contenu
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")
                .replaceAll("\n", "<br>")
            }
        </div>
    </div>
`;

    }


    // ==================================================
    // CONTENU VIDE
    // ==================================================

    if (!Array.isArray(contenu)) {

        return "";

    }


    // ==================================================
    // CONTENU STRUCTURÉ -> DÉCOUPAGE EN BLOCS
    // ==================================================

    let html = "";
    let blocCourant = "";

function flushBloc() {

    if (blocCourant.trim() !== "") {

        html += `
            <div class="bloc">
                <div class="line">${blocCourant}</div>
            </div>
        `;

    }

    blocCourant = "";
}

    contenu.forEach(item => {

        switch (item.type) {

            case "text":

                blocCourant +=
                    item.value || "";

                break;


            case "bold":

                blocCourant +=
                    `<b>${item.value || ""}</b>`;

                break;


            case "newline":

                // Un saut de ligne reste À L'INTÉRIEUR du bloc courant
                // (on veut garder un label + sa valeur ensemble).
                blocCourant +=
                    `<div class="newline"></div>`;

                break;


            case "separator":

                // Le séparateur ferme le bloc courant (nouvelle section)
                // et devient lui-même un bloc protégé.
                flushBloc();

                html +=
                    `<div class="bloc separator-bloc"><div class="separator"></div></div>`;

                break;


            case "break":

                // Frontière "silencieuse" entre deux blocs : ferme le bloc
                // courant SANS ajouter de trait visible. Permet de garder
                // les blocs protégés petits (un champ = un bloc) pour que
                // la pagination puisse remplir l'espace disponible au lieu
                // de pousser un gros paquet entier sur la page suivante.
                flushBloc();

                break;

        }

    });

    flushBloc();

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
                padding: 18mm;
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

async function ordToPDF(ord) {

    cleanContainer();

    const html = generateHTML(ord);

    const container = document.createElement("div");
    container.className = "html2pdf-container";
    container.innerHTML = html;

    document.body.appendChild(container);

    const pdf = await html2pdf()
        .set({
            margin: 0,
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
        })
        .from(container)
        .outputPdf('blob');

    container.remove();

    return pdf;
}

window.ordToPDF = ordToPDF;
// ==============================
// PATCH html2pdf (COMPAT MODE)
// ==============================

const _oldHtml2pdf = window.html2pdf;

if (_oldHtml2pdf) {

    window.html2pdf = function () {

        const instance = _oldHtml2pdf();

        const oldSet = instance.set;

        instance.set = function (opts) {

            const r = oldSet.call(this, opts);

            const oldFrom = this.from;

            this.from = function (el) {

                // 🔥 CLEAN AUTO (évite page blanche)
                cleanContainer();

                return oldFrom.call(this, el);
            };

            return r;
        };

        return instance;
    };
}


// ==============================
// EXPORT GLOBALS
// ==============================

window.ordToPDF = ordToPDF;
window.generateHTML = generateHTML;
window.renderContenu = renderContenu;
})();
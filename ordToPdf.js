(function () {

// =====================================================================
// PAGINATION "VRAI PDF"
// =====================================================================
//
// Principe : au lieu de laisser html2pdf couper l'image au hasard (ou de
// repousser des blocs entiers, ce qui laisse de grands vides), le document
// est PAGINÉ ICI, page par page, avant d'être converti :
//
//   1. le contenu est découpé en lignes ;
//   2. il est mesuré une fois (rendu invisible) pour connaître la position
//      de chaque ligne ;
//   3. on choisit pour chaque page le DERNIER endroit où l'on peut couper
//      (entre deux lignes, ou entre deux lignes d'un long paragraphe) ;
//   4. chaque page est une "fenêtre" A4 de hauteur exacte (marges incluses)
//      qui montre sa portion du document.
//
// Règles de coupure :
//   - jamais au milieu d'une ligne de texte ;
//   - le trait bleu n'est jamais en haut d'une page : s'il tombe à la
//     coupure, il reste en bas de la page précédente (ou, s'il n'y a pas la
//     place, il est supprimé) ;
//   - un titre de section reste avec la ligne qui le suit ;
//   - un libellé "xxx :" reste avec sa valeur ;
//   - une ligne numérotée ("1. ...") reste avec ses détails ;
//   - pas de ligne seule (veuve/orpheline) en haut ou en bas d'un paragraphe ;
//   - une page ne commence jamais par une ligne vide.
//
// Les marges haut/bas sont dans la page elle-même : l'appelant doit donc
// utiliser html2pdf avec margin: 0 (c'est déjà le cas partout).
// =====================================================================

const PDF_MARGE_VERTICALE_MM = 15;
const PDF_MARGE_LATERALE_MM = 18;
const MM_PX = 96 / 25.4;
// hauteur utile d'une page (297 mm - 2 marges), arrondie vers le bas (-1 px de sécurité)
const HAUTEUR_UTILE_PX = Math.floor((297 - 2 * PDF_MARGE_VERTICALE_MM) * MM_PX) - 1;

const NEWLINE_HTML = `<div class="newline"></div>`;
const SEPARATOR_HTML = `<div class="separator"></div>`;

function echapper(txt) {
    return String(txt)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

const texteDe = h => String(h).replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();


// ==============================
// CONTENU -> LIGNES
// ==============================

function creerLigne(html, avecNewline, sep) {

    const t = texteDe(html);

    return {
        html: html + (avecNewline ? NEWLINE_HTML : ""),
        sep: sep,                                   // un trait bleu précède cette ligne
        seulSep: false,
        vide: t === "",
        label: /[:：]$/.test(t),                    // "Libellé :"
        numerote: /^\d+\s*[.)]\s/.test(t),          // "1. ..." / "2) ..."
        // lignes contenant du HTML "lourd" (tableau, image...) : jamais coupées en interne
        decoupable: !/<(table|img|tr|ul|ol|pre|svg|canvas)\b/i.test(html)
    };
}

function parseLignes(contenu) {

    // ---- contenu texte simple ----
    if (typeof contenu === "string") {

        const l = creerLigne(echapper(contenu).replaceAll("\n", "<br>"), false, false);
        return [l];

    }

    if (!Array.isArray(contenu)) {
        return [];
    }

    const lignes = [];
    let courante = "";
    let sepEnAttente = false;

    const pousser = (html, avecNewline) => {
        lignes.push(creerLigne(html, avecNewline, sepEnAttente));
        sepEnAttente = false;
    };

    const finir = () => {
        if (courante.trim() !== "") {
            pousser(courante, false);
        }
        courante = "";
    };

    const sepSeul = () => {
        const l = creerLigne("", false, true);
        l.seulSep = true;
        lignes.push(l);
        sepEnAttente = false;
    };

    contenu.forEach(item => {

        switch (item.type) {

            case "text":
                courante += item.value || "";
                break;

            case "bold":
                courante += `<b>${item.value || ""}</b>`;
                break;

            case "newline":
                pousser(courante, true);
                courante = "";
                break;

            case "separator":
                finir();
                if (sepEnAttente) sepSeul();   // deux traits d'affilée
                sepEnAttente = true;
                break;

            case "break":
                finir();
                break;

        }

    });

    finir();

    if (sepEnAttente) sepSeul();

    return lignes;
}

function renderLigne(l) {

    return `<div class="bloc">${l.sep ? SEPARATOR_HTML : ""}${l.seulSep ? "" : `<div class="line">${l.html}</div>`}</div>`;

}

// Compatibilité : ancien rendu "à plat" du contenu
function renderContenu(contenu) {

    return parseLignes(contenu).map(renderLigne).join("");

}


// ==============================
// CSS
// ==============================

function cssOrd() {

    return `
        body {
            margin: 0;
            font-family: "Segoe UI", Arial, sans-serif;
            background: white;
        }

        #ordonnance {
            width: 210mm;
            color: #1f2937;
            font-family: "Segoe UI", Arial, sans-serif;
            font-size: 16px;
            line-height: normal;
            text-align: left;
        }

        /* une page = une feuille A4 de hauteur exacte, marges incluses */
        .ord-page {
            width: 210mm;
            height: 297mm;
            box-sizing: border-box;
            padding: ${PDF_MARGE_VERTICALE_MM}mm ${PDF_MARGE_LATERALE_MM}mm;
            overflow: hidden;
            background: white;
        }

        .ord-fen {
            width: ${210 - 2 * PDF_MARGE_LATERALE_MM}mm;
            overflow: hidden;
        }

        .ord-flux {
            width: ${210 - 2 * PDF_MARGE_LATERALE_MM}mm;
            display: flow-root;
        }

        /* repli (si la mesure est impossible) : ancien mode, coupures gérées par html2pdf */
        #ordonnance.ord-simple {
            padding: ${PDF_MARGE_VERTICALE_MM}mm ${PDF_MARGE_LATERALE_MM}mm;
            box-sizing: border-box;
        }
        .ord-simple .bloc { page-break-inside: avoid; break-inside: avoid; }
        .ord-simple table, .ord-simple tr { page-break-inside: avoid; break-inside: avoid; }

        .header {
            display: flex;
            justify-content: space-between;
            border-bottom: 2px solid #2563eb;
            padding-bottom: 10px;
        }

        .logo { height: 70px; }

        .titre {
            text-align: center;
            font-size: 24px;
            margin: 20px 0;
            color: #2563eb;
        }

        .patient {
            background: #f3f4f6;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            font-size: 14px;
        }

        .signature {
            margin-top: 30px;
            text-align: right;
        }

        .contenu {
            font-size: 15px;
            line-height: 1.6;
            white-space: normal;
        }

        .bloc {
            margin: 0;
        }

        .line {
            display: block;
            white-space: pre-wrap;
        }

        b {
            font-weight: bold;
            display: inline;
        }

        .bold {
            font-weight: bold;
            display: inline;
            white-space: pre-wrap;
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

        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb {
            background-color: rgba(33, 150, 243, 0.35);
            border-radius: 20px;
        }
        * {
            scrollbar-width: thin;
            scrollbar-color: rgba(33, 150, 243, 0.35) transparent;
        }
    `;

}


// ==============================
// FLUX COMPLET (en-tête + contenu + signature), sans pagination
// ==============================

function fluxHTML(ord, lignes) {

    const patient = ord.patient || {};
    const medecin = ord.medecin || {};

    return `<div class="header">
                <img src="${ord.logo || 'logo.png'}" class="logo">
                <div>Le ${ord.date}, ${ord.lieu}</div>
            </div>
            <div class="titre">${ord.titre}</div>
            <div class="patient">
                <strong>Patient :</strong> ${patient.prenom} ${patient.nom}<br>
                Né(e) le : ${patient.date_Naissance}
            </div>
            <div class="contenu">${lignes.map(renderLigne).join("")}</div>
            <div class="signature"${medecin.signature ? ' style="min-height:110px"' : ""}>
                ${medecin.nom}<br>
                ${medecin.specialite || ""}
                ${medecin.signature ? `<br><img src="${medecin.signature}" class="signature-img">` : ""}
            </div>`;

}


// ==============================
// MESURE (rendu invisible dans la page)
// ==============================

function mesurerLignes(ord, lignes, css) {

    if (typeof document === "undefined" || !document.body) return null;

    const wrap = document.createElement("div");
    wrap.setAttribute("aria-hidden", "true");
    wrap.style.cssText = "position:absolute;left:-100000px;top:0;visibility:hidden;pointer-events:none;";
    wrap.innerHTML = `<style>${css}</style><div id="ordonnance"><div class="ord-flux" id="ord-mesure">${fluxHTML(ord, lignes)}</div></div>`;
    document.body.appendChild(wrap);

    try {

        const flux = wrap.querySelector("#ord-mesure");
        const fr = flux.getBoundingClientRect();
        const y = el => el.getBoundingClientRect().top - fr.top;
        const bas = el => el.getBoundingClientRect().bottom - fr.top;

        const blocs = flux.querySelectorAll(".contenu > .bloc");
        if (blocs.length !== lignes.length) return null;

        const contenuEl = flux.querySelector(".contenu");
        const LH = parseFloat(getComputedStyle(contenuEl).lineHeight) || 24;

        const mesures = Array.from(blocs).map(b => {

            const ligne = b.querySelector(":scope > .line");
            const bTop = y(b);
            const bBas = bas(b);
            const lTop = ligne ? y(ligne) : bBas;
            const nl = ligne ? ligne.querySelector(":scope > .newline:last-child") : null;
            const texteBas = ligne ? (nl ? y(nl) : bas(ligne)) : lTop;

            return { bTop, bBas, lTop, texteH: texteBas - lTop };

        });

        return { total: fr.height, LH, mesures };

    } finally {

        wrap.remove();

    }

}


// ==============================
// CHOIX DES COUPURES
// ==============================

function calculerPages(lignes, m, hauteurUtile) {

    const HC = hauteurUtile || HAUTEUR_UTILE_PX;
    const LH = m.LH;
    const cands = [];       // { y : endroit de la coupure, skip : début de la page suivante }

    lignes.forEach((l, i) => {

        const M = m.mesures[i];
        const prev = lignes[i - 1];

        const interdit =
            l.vide ||
            i === lignes.length - 1 ||                           // pas de dernière ligne seule sur la dernière page
            !!(prev && (
                (prev.sep && !prev.vide && !prev.seulSep) ||     // titre -> ligne suivante
                prev.label ||                                    // libellé -> valeur
                (prev.numerote && !l.numerote && !l.sep)         // "1. xxx" -> détails
            ));

        if (l.sep) {

            // (b) le trait reste en bas de la page précédente
            cands.push({ y: M.lTop, skip: M.lTop });
            // (a) pas la place pour le trait : coupure avant, le trait est supprimé
            cands.push({ y: M.bTop, skip: M.lTop });

        } else if (!interdit && i > 0) {

            cands.push({ y: M.bTop, skip: M.bTop });

        }

        // coupure possible entre deux lignes d'un long paragraphe (2 lignes mini de chaque côté)
        if (l.decoupable && !l.seulSep) {

            const n = Math.round(M.texteH / LH);

            if (n >= 4 && Math.abs(M.texteH - n * LH) < 2) {
                for (let j = 2; j <= n - 2; j++) {
                    const yy = M.lTop + j * LH;
                    cands.push({ y: yy, skip: yy });
                }
            }

        }

    });

    const pages = [];
    let y0 = 0;

    for (let garde = 0; garde < 500; garde++) {

        const limite = y0 + HC;

        if (m.total - y0 <= HC + 0.5) {
            pages.push({ y0: y0, y1: m.total });
            break;
        }

        let best = null;

        cands.forEach(c => {
            if (c.y > y0 + LH && c.y <= limite + 0.5 && (!best || c.y > best.y)) best = c;
        });

        if (!best) {
            // rien de coupable (bloc géant) : coupure forcée
            pages.push({ y0: y0, y1: limite });
            y0 = limite;
        } else {
            pages.push({ y0: y0, y1: best.y });
            y0 = best.skip;
        }

    }

    return pages;

}


// ==============================
// ASSEMBLAGE : une feuille A4 par page
// ==============================

function assemblerPages(ord, lignes, pages, css) {

    const flux = fluxHTML(ord, lignes);
    const N = pages.length;

    // La dernière feuille est raccourcie de quelques px (prélevés sur sa marge
    // du bas) : évite qu'un arrondi d'html2pdf ajoute une page blanche.
    const reduc = (4 + 1.5 * N).toFixed(1);

    const feuilles = pages.map((p, i) => {

        const h = Math.max(1, p.y1 - p.y0).toFixed(2);
        const derniere = i === N - 1;
        const styleFeuille = derniere
            ? ` style="height:calc(297mm - ${reduc}px);padding-bottom:calc(${PDF_MARGE_VERTICALE_MM}mm - ${reduc}px)"`
            : "";

        return `<div class="ord-page"${styleFeuille}><div class="ord-fen" style="height:${h}px"><div class="ord-flux" style="margin-top:-${p.y0.toFixed(2)}px">${flux}</div></div></div>`;

    }).join("");

    return `
    <html>
    <head>
        <meta charset="UTF-8">
        <style>${css}</style>
    </head>
    <body>
        <div id="ordonnance">${feuilles}</div>
    </body>
    </html>
    `;

}

function htmlSimple(ord, lignes, css) {

    return `
    <html>
    <head>
        <meta charset="UTF-8">
        <style>${css}</style>
    </head>
    <body>
        <div id="ordonnance" class="ord-simple">${fluxHTML(ord, lignes)}</div>
    </body>
    </html>
    `;

}


// ==============================
// HTML GENERATOR
// ==============================

function generateHTML(ord) {

    const lignes = parseLignes(ord.contenu);
    const css = cssOrd();

    try {

        const m = mesurerLignes(ord, lignes, css);

        if (m) {
            return assemblerPages(ord, lignes, calculerPages(lignes, m), css);
        }

    } catch (e) {

        console.warn("Pagination avancée indisponible, mode simple :", e);

    }

    return htmlSimple(ord, lignes, css);

}


// ==============================
// SAFE PDF ENGINE (CORE FIX)
// ==============================

function cleanContainer() {
    document.querySelectorAll(".html2pdf-container").forEach(e => e.remove());
}


// ==============================
// OPTIONS html2pdf pour generateHTML()
// ==============================
// margin: 0 -> les marges sont dans les pages elles-mêmes.

function ordPdfOptions() {

    return {
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
    };

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
window.ordPdfOptions = ordPdfOptions;
window.renderContenu = renderContenu;
})();
(function () {

// ==============================
// CONTENU RENDER
// ==============================

function renderContenu(contenu) {
    let html = "";

    contenu.forEach(item => {
        switch (item.type) {

            case "text":
                html += `<span>${item.value}</span>`;
                break;

            case "bold":
html += `<span style="font-weight: bold;">${item.value}</span>`;
                break;

            case "newline":
                html += `<br>`;
                break;

            case "separator":
                html += `<div class="separator"></div>`;
                break;
        }
    });

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


            .contenu {
                font-size: 15px;
                line-height: 1.6;
            }

            .signature {
                margin-top: 30px;
                text-align: right;
            }
.separator {
    border-top: 2px solid #2563eb;
    margin: 12px 0;
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
                Né(e) le : ${ord.patient.date_naissance}
            </div>

            <div class="contenu">
                ${contenuHTML}
            </div>

            <div class="signature">
                ${ord.medecin.nom}
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
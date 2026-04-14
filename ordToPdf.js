// ==============================
// ORD → PDF CONVERTER
// ==============================

function renderContenu(contenu) {
    let html = "";

    contenu.forEach(item => {
        switch(item.type) {

            case "text":
                html += `<span>${item.value}</span>`;
                break;

            case "bold":
                html += `<strong>${item.value}</strong>`;
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
// TEMPLATE HTML
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
                padding: 0;
                font-family: Arial, sans-serif;
            }

            #ordonnance {
                width: 210mm;
                min-height: 297mm;
                padding: 30px;
                position: relative;
                box-sizing: border-box;
            }

            .header {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .logo {
                height: 80px;
            }

            .date-lieu {
                font-size: 14px;
            }

            .titre {
                text-align: center;
                font-size: 28px;
                margin: 30px 0;
                font-weight: bold;
            }

            .patient {
                margin-bottom: 20px;
                font-size: 15px;
            }

            .contenu {
                margin-top: 20px;
                font-size: 16px;
                line-height: 1.6;
            }

            .separator {
                border-top: 1px solid black;
                margin: 15px 0;
            }

            .signature {
                position: absolute;
                bottom: 40px;
                right: 40px;
                text-align: right;
                font-weight: bold;
                font-size: 16px;
            }

        </style>
    </head>

    <body>

        <div id="ordonnance">

            <!-- HEADER -->
            <div class="header">
                <img src="${ord.logo || 'logo.png'}" class="logo">
                <div class="date-lieu">
                    Le ${ord.date}, à ${ord.lieu}
                </div>
            </div>

            <!-- TITRE -->
            <div class="titre">${ord.titre}</div>

            <!-- PATIENT -->
            <div class="patient">
                <strong>Patient :</strong> ${ord.patient.prenom} ${ord.patient.nom}<br>
                Né(e) le : ${ord.patient.date_naissance}
            </div>

            <!-- CONTENU -->
            <div class="contenu">
                ${contenuHTML}
            </div>

            <!-- SIGNATURE -->
            <div class="signature">
                ${ord.medecin.nom}
            </div>

        </div>

    </body>
    </html>
    `;
}


// ==============================
// EXPORT PDF
// ==============================

function ordToPDF(ord) {

    const html = generateHTML(ord);

    const container = document.createElement("div");
    container.innerHTML = html;

    return html2pdf()
        .set({
            margin: 0,
            filename: `${ord.titre || "document"}.pdf`,
            html2canvas: { scale: 2 },
            jsPDF: {
                unit: 'mm',
                format: 'a4',
                orientation: 'portrait'
            }
        })
        .from(container)
        .save();
}


// ==============================
// EXPORT
// ==============================
window.ordToPDF = ordToPDF;
window.generateHTML = generateHTML;

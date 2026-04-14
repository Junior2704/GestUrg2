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
    font-family: "Segoe UI", Arial, sans-serif;
    background: white;
}

#ordonnance {
    width: 210mm;
    min-height: 297mm;
    padding: 18mm;
    box-sizing: border-box;
    color: #1f2937;
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #2563eb;
    padding-bottom: 10px;
}

.logo {
    height: 70px;
}

.date-lieu {
    font-size: 13px;
    color: #6b7280;
}

.titre {
    text-align: center;
    font-size: 24px;
    margin: 25px 0;
    font-weight: 700;
    letter-spacing: 1px;
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
    line-height: 1.7;
    padding: 10px;
}

.separator {
    border-top: 1px solid #e5e7eb;
    margin: 15px 0;
}

.signature {
    margin-top: 50px;
    text-align: right;
    font-weight: 600;
    font-size: 15px;
    color: #111827;
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
        html2canvas: { scale: 2, scrollY: 0 },
        jsPDF: {
            unit: 'mm',
            format: 'a4',
            orientation: 'portrait'
        },
        pagebreak: { mode: ['css', 'legacy'] }
    })
    .from(container)
    .save();
}


// ==============================
// EXPORT
// ==============================
window.ordToPDF = ordToPDF;
window.generateHTML = generateHTML;

const ord = await construireHistoriqueOrd(db, patientId, hospiId, {
      inclureJournal: inclure,
      numero: null,
      logo: "https://junior2704.github.io/GestUrg2/logo.png",
      lieu: "Urgences - HOPJ",
      medecin: {
        nom: window.medecinNom || "",
        specialite: window.medecinSpecialite || "",
        type: window.medecinType || ""
      }
    });
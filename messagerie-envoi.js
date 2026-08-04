import { initializeApp, getApps, getApp }
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getFirestore,
  doc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  serverTimestamp,
  getDoc,
  increment
}
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBKp5-7NNy0Gyl0tNbDgD-BxucYdg8ArWo",
  authDomain: "urgences-a8ed4.firebaseapp.com",
  projectId: "urgences-a8ed4",
  storageBucket: "urgences-a8ed4.firebasestorage.app",
  messagingSenderId: "392921498200",
  appId: "1:392921498200:web:7ccce767332c67c697c02d",
  measurementId: "G-C74MK2KYDL"
};

const app=initializeApp(firebaseConfig);


/* ==================================================================
   COMPTES EXPÉDITEURS AUTORISÉS

   ⚠️ À garder synchronisé manuellement avec COMPTES_ADMIN dans
   messagerie-administration.html : si tu ajoutes un compte
   là-bas, ajoute-le ici aussi.
   ================================================================== */

const COMPTES_ADMIN = {

  systeme: { nom:"Système", icon:"⚙️" },
  "admin-medical": { nom:"Administration médicale", icon:"🏥" },
  rh: { nom:"Ressources Humaines", icon:"🗂️" }

};




async function trouverOuCreerConversation(uid, compteId, compte){


  const q = query(

    collection(db,"messageries"),

    where("participants","array-contains",uid),
    where("compteId","==",compteId)

  );


  const snap = await getDocs(q);


  if(!snap.empty){

    return snap.docs[0].id;

  }


  const ref = await addDoc(

    collection(db,"messageries"),

    {

      participants:[uid],
      compteId,
      titre:compte.nom,
      icon:compte.icon,
      lastMessage:"",
      createdAt:serverTimestamp(),
      updatedAt:serverTimestamp()

    }

  );


  return ref.id;


}



function creerStatutsInitiaux(destinataires){


  const statuts = {};


  destinataires.forEach(uid=>{

    statuts[uid] = {

      distribue:true,
      lu:false,
      luLe:null

    };

  });


  return statuts;


}
const auth = getAuth(app);
async function verifierAutorisation() {

  const user = auth.currentUser;

  if (!user) {
    throw new Error("Utilisateur non connecté.");
  }

  const userSnap = await getDoc(doc(db, "medecins", user.uid));

  if (!userSnap.exists()) {
    throw new Error("Utilisateur introuvable.");
  }

  const pages = userSnap.data().pages || {};

  if (pages.messagerieadministration !== true) {
    throw new Error("Accès refusé.");
  }

}


/**
 * Envoie un message automatique à un ou plusieurs utilisateurs.
 * Le message apparaît dans messagerie.html comme s'il avait été
 * envoyé depuis messagerie-administration.html.
 *
 * @param {Object} options
 * @param {string} options.compteId - "systeme", "admin-medical", "rh"...
 * @param {string} options.texte - contenu du message
 * @param {string[]} options.destinataires - uids (collection medecins) des destinataires
 * @returns {Promise<string>} l'identifiant de la diffusion créée
 */

export async function envoyerMessageSysteme({ compteId, texte, destinataires }){

  await verifierAutorisation();
  const compte = COMPTES_ADMIN[compteId];


  if(!compte){

    throw new Error(`Compte expéditeur inconnu : "${compteId}". Ajoute-le dans COMPTES_ADMIN (messagerie-envoi.js).`);

  }


  if(!texte || !texte.trim()){

    throw new Error("Le texte du message ne peut pas être vide.");

  }


  if(!destinataires || destinataires.length===0){

    throw new Error("Aucun destinataire fourni.");

  }


  const diffusionRef = await addDoc(

    collection(db,"diffusions"),

    {

      type:"message",
      texte,
      compteId,
      compteNom:compte.nom,
      destinataires,
      statuts:creerStatutsInitiaux(destinataires),
      createdAt:serverTimestamp()

    }

  );


  for(const uid of destinataires){

    const convId = await trouverOuCreerConversation(uid, compteId, compte);


    await addDoc(

      collection(db,"messageries",convId,"messages"),

      {

        auteur:compteId,
        auteurNom:compte.nom,
        type:"message",
        texte,
        diffusionId:diffusionRef.id,
        date:serverTimestamp(),
        luPar:[]

      }

    );


    await updateDoc(

      doc(db,"messageries",convId),

      {

        lastMessage:texte,
        updatedAt:serverTimestamp(),
        [`nonLus.${uid}`]:increment(1)

      }

    );


  }


  return diffusionRef.id;


}
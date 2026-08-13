importScripts(
    "https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js"
);

importScripts(
    "https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js"
);

firebase.initializeApp({
    apiKey: "AIzaSyBKp5-7NNy0Gyl0tNbDgD-BxucYdg8ArWo",
    authDomain: "urgences-a8ed4.firebaseapp.com",
    projectId: "urgences-a8ed4",
    storageBucket: "urgences-a8ed4.firebasestorage.app",
    messagingSenderId: "392921498200",
    appId: "1:392921498200:web:7ccce767332c67c697c02d"
});

const messaging = firebase.messaging();
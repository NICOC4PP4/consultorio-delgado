// Import Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDw5zqrr5YFqmAii3bpnIOk0QnkfHTWbwM",
    authDomain: "consultorio-delgado.firebaseapp.com",
    projectId: "consultorio-delgado",
    storageBucket: "consultorio-delgado.firebasestorage.app",
    messagingSenderId: "81769593262",
    appId: "1:81769593262:web:bc2d210f7a1452b56e303f",
    measurementId: "G-W30M37079G"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
const db = getFirestore(app);
const auth = getAuth(app);

// Export services for use in other files
export { db, auth };
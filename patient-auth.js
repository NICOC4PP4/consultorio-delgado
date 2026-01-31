import { auth, db } from './firebase-config.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
    doc,
    setDoc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Auto-redirect if already logged in
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
onAuthStateChanged(auth, (user) => {
    if (user) {
        // If user is already on login page, redirect them.
        const urlParams = new URLSearchParams(window.location.search);
        const redirect = urlParams.get('redirect');
        if (redirect) {
            window.location.href = redirect;
        } else {
            window.location.href = 'mis-turnos.html';
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // Tabs
    const tabs = document.querySelectorAll('.auth-tab');
    const forms = document.querySelectorAll('.auth-form');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            forms.forEach(f => f.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(`form-${tab.dataset.target}`).classList.add('active');
        });
    });

    // Switch links
    document.querySelector('.switch-to-register').onclick = (e) => {
        e.preventDefault();
        document.querySelector('[data-target="register"]').click();
    };
    document.querySelector('.switch-to-login').onclick = (e) => {
        e.preventDefault();
        document.querySelector('[data-target="login"]').click();
    };

    // REGISTER
    const regForm = document.getElementById('register-form');
    regForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = regForm.querySelector('button');
        const errDiv = document.getElementById('reg-error');
        errDiv.style.display = 'none';
        btn.disabled = true;
        btn.innerText = "Creando cuenta...";

        const name = document.getElementById('reg-name').value;
        const lastname = document.getElementById('reg-lastname').value;
        const dni = document.getElementById('reg-dni').value;
        const gender = document.getElementById('reg-gender').value;
        const insurance = document.getElementById('reg-insurance').value;
        const phone = document.getElementById('reg-phone').value;
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;

        try {
            // 1. Create Auth User
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // 2. Update Display Name
            await updateProfile(user, {
                displayName: `${name} ${lastname}`
            });

            // 3. Create Profile Doc
            await setDoc(doc(db, "patients", user.uid), {
                firstName: name,
                lastName: lastname,
                dni: dni,
                gender: gender,
                phone: phone,
                email: email,
                insurance: insurance,
                createdAt: new Date(),
                role: 'patient'
            });

            handleSuccessRedirect();

        } catch (error) {
            console.error(error);
            errDiv.innerText = getErrorMessage(error.code);
            errDiv.style.display = 'block';
            btn.disabled = false;
            btn.innerText = "Crear Cuenta";
        }
    });

    // LOGIN
    const loginForm = document.getElementById('login-form');
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = loginForm.querySelector('button');
        const errDiv = document.getElementById('login-error');
        errDiv.style.display = 'none';
        btn.disabled = true;
        btn.innerText = "Ingresando...";

        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        try {
            await signInWithEmailAndPassword(auth, email, password);
            handleSuccessRedirect();
        } catch (error) {
            console.error(error);
            errDiv.innerText = getErrorMessage(error.code);
            errDiv.style.display = 'block';
            btn.disabled = false;
            btn.innerText = "Ingresar";
        }
    });

    function handleSuccessRedirect() {
        const urlParams = new URLSearchParams(window.location.search);
        const redirect = urlParams.get('redirect');
        if (redirect) {
            window.location.href = redirect;
        } else {
            // Default to 'Mis Turnos' if no specific redirect asked
            window.location.href = 'mis-turnos.html';
        }
    }

    function getErrorMessage(code) {
        switch (code) {
            case 'auth/email-already-in-use': return "El email ya está registrado.";
            case 'auth/invalid-email': return "El email no es válido.";
            case 'auth/weak-password': return "La contraseña es muy débil.";
            case 'auth/wrong-password': return "Contraseña incorrecta.";
            case 'auth/user-not-found': return "Usuario no encontrado.";
            default: return "Error al ingresar. Intente nuevamente.";
        }
    }
});

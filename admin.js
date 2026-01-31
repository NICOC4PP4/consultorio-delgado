import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, where, getDocs, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// DOM Elements
const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const doctorTitle = document.getElementById('doctor-title');

// Auth State Observer
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is signed in
        showDashboard(user);
    } else {
        // User is signed out
        showLogin();
    }
});

// Login Handler
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';

    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // Observer will handle UI switch
    } catch (error) {
        console.error("Login Error:", error);
        loginError.textContent = "Error: Usuario o contraseña incorrectos.";
        loginError.style.display = 'block';
    }
});

// Logout Handler
logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Logout Error:", error);
    }
});

// UI Switchers
function showLogin() {
    loginSection.style.display = 'block';
    dashboardSection.style.display = 'none';
}

function showDashboard(user) {
    loginSection.style.display = 'none';
    dashboardSection.style.display = 'block';

    // Determine Doctor based on email (Simple logic for now)
    let doctorName = "Médico";
    if (user.email.includes("secondi")) doctorName = "Dra. Secondi";
    if (user.email.includes("capparelli")) doctorName = "Dr. Capparelli";

    doctorTitle.textContent = `Panel de Control - ${doctorName}`;

    // Initialize Dashboard Logic (Load appointments for today)
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('admin-date').value = today;
    loadAppointments(today);
}

// Load Appointments
async function loadAppointments(dateString) {
    const tableBody = document.getElementById('appointments-table');
    tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Cargando turnos...</td></tr>';

    // Identify doctor from logged in user email (simple check)
    // In a real app we might store this in a user profile document
    const user = auth.currentUser;
    if (!user) return;

    const doctorId = user.email.includes("secondi") ? "secondi" : "capparelli";

    try {
        const q = query(
            collection(db, "appointments"),
            where("doctor", "==", doctorId),
            where("date", "==", dateString)
        );

        const querySnapshot = await getDocs(q);
        tableBody.innerHTML = '';

        if (querySnapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 2rem;">No hay turnos registrados para esta fecha.</td></tr>';
            return;
        }

        // Sort by time
        const appointments = [];
        querySnapshot.forEach((doc) => {
            appointments.push({ id: doc.id, ...doc.data() });
        });
        appointments.sort((a, b) => a.time.localeCompare(b.time));

        // Render
        appointments.forEach(appt => {
            const row = document.createElement('tr');
            row.style.borderBottom = '1px solid #eee';

            const isBlocked = appt.status === 'blocked';
            const statusColor = isBlocked ? 'red' : 'green';
            const statusText = isBlocked ? 'Bloqueado' : 'Confirmado';

            row.innerHTML = `
                <td style="padding: 1rem;">${appt.time} hs</td>
                <td style="padding: 1rem;">
                    <strong>${appt.patientName || 'Bloqueo Manual'}</strong><br>
                    <small>${appt.patientEmail || ''}</small>
                </td>
                <td style="padding: 1rem; color: ${statusColor}; font-weight: bold;">
                    ${statusText}
                </td>
                <td style="padding: 1rem;">
                    <!-- Future: Add Cancel Button -->
                    <button class="btn-sm" disabled>Ver</button>
                </td>
            `;
            tableBody.appendChild(row);
        });

    } catch (error) {
        console.error("Error loading appointments:", error);
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: red;">Error al cargar turnos.</td></tr>';
    }
}

// Date picker change listener configuration
const dateInput = document.getElementById('admin-date');
dateInput.addEventListener('change', (e) => {
    loadAppointments(e.target.value);
});

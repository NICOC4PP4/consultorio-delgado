/* Admin Dashboard Logic - Weekly View */
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    // Auth Elements
    const loginSection = document.getElementById('login-section');
    const dashboardSection = document.getElementById('dashboard-section');
    const loginForm = document.getElementById('login-form');
    const logoutBtn = document.getElementById('logout-btn');
    const authError = document.getElementById('login-error');

    // Dashboard Elements
    const doctorSelect = document.getElementById('doctor-select');
    const calendarGrid = document.getElementById('calendar-grid');
    const prevWeekBtn = document.getElementById('prev-week');
    const nextWeekBtn = document.getElementById('next-week');
    const currentWeekLabel = document.getElementById('current-week-label');
    const modal = document.getElementById('appt-modal');
    const modalContent = document.getElementById('modal-content');

    // Config
    const startHour = 14;
    const endHour = 18;
    const intervalMinutes = 20;

    // State
    let currentUser = null;
    let currentMonday = getStartOfWeek(new Date());

    // --- AUTHENTICATION ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            loginSection.style.display = 'none';
            dashboardSection.style.display = 'block';

            // Auto-select doctor based on email (optional)
            if (user.email.includes('secondi')) doctorSelect.value = 'secondi';
            if (user.email.includes('capparelli')) doctorSelect.value = 'capparelli';

            renderAdminWeek(currentMonday);
        } else {
            currentUser = null;
            loginSection.style.display = 'block';
            dashboardSection.style.display = 'none';
        }
    });

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('admin-email').value;
            const password = document.getElementById('admin-password').value;
            authError.style.display = 'none';

            try {
                await signInWithEmailAndPassword(auth, email, password);
            } catch (error) {
                console.error("Login failed:", error);
                authError.textContent = "Credenciales inválidas.";
                authError.style.display = 'block';
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => signOut(auth));
    }

    // --- DASHBOARD LOGIC ---

    // Nav Listeners
    prevWeekBtn.addEventListener('click', () => changeWeek(-1));
    nextWeekBtn.addEventListener('click', () => changeWeek(1));
    doctorSelect.addEventListener('change', () => renderAdminWeek(currentMonday));

    function getStartOfWeek(d) {
        d = new Date(d);
        var day = d.getDay(),
            diff = d.getDate() - day + (day == 0 ? -6 : 1);
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function changeWeek(offset) {
        currentMonday.setDate(currentMonday.getDate() + (offset * 7));
        renderAdminWeek(currentMonday);
    }

    async function renderAdminWeek(mondayDate) {
        const doctorId = doctorSelect.value;

        // Update Label
        const fridayDate = new Date(mondayDate);
        fridayDate.setDate(mondayDate.getDate() + 4);
        const options = { day: 'numeric', month: 'numeric' };
        currentWeekLabel.textContent = `Semana del ${mondayDate.toLocaleDateString('es-AR', options)} al ${fridayDate.toLocaleDateString('es-AR', options)}`;

        calendarGrid.innerHTML = '<div style="padding: 2rem; text-align: center; grid-column: 1/-1;">Cargando turnos...</div>';

        try {
            // Generate dates
            const weekDates = [];
            let tempDate = new Date(mondayDate);
            for (let i = 0; i < 5; i++) {
                weekDates.push(tempDate.toISOString().split('T')[0]);
                tempDate.setDate(tempDate.getDate() + 1);
            }

            // Fetch Appointments
            const appointmentsMap = await getAppointmentsForWeek(doctorId, weekDates);

            // Render
            calendarGrid.innerHTML = '';

            weekDates.forEach(dateStr => {
                const dateObj = new Date(dateStr + 'T00:00:00');
                const dayName = dateObj.toLocaleDateString('es-AR', { weekday: 'long' });
                const dayNum = dateObj.getDate();

                const col = document.createElement('div');
                col.className = 'day-column';

                const header = document.createElement('div');
                header.className = 'day-header';
                header.innerHTML = `<span>${capitalize(dayName)}</span><small>${dayNum}</small>`;
                col.appendChild(header);

                const slotsContainer = document.createElement('div');
                slotsContainer.className = 'slots-column';

                let slotTime = new Date(dateStr + 'T00:00:00');
                slotTime.setHours(startHour, 0, 0, 0);
                const slotEndTime = new Date(dateStr + 'T00:00:00');
                slotEndTime.setHours(endHour, 0, 0, 0);

                while (slotTime < slotEndTime) {
                    const timeStr = slotTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

                    const slotDiv = document.createElement('div');
                    slotDiv.className = 'time-slot';

                    const appt = appointmentsMap[dateStr] && appointmentsMap[dateStr][timeStr];

                    if (appt) {
                        slotDiv.classList.add('taken');
                        slotDiv.style.cursor = 'pointer';
                        slotDiv.style.fontSize = '0.75rem';
                        slotDiv.style.lineHeight = '1.2';
                        slotDiv.style.textAlign = 'left';
                        slotDiv.style.height = 'auto'; // allow grow
                        slotDiv.style.minHeight = '60px'; // bigger for info

                        slotDiv.innerHTML = `
                            <strong>${timeStr}</strong><br>
                            ${appt.patientName.split(' ')[0]}<br>
                            <span style="font-size:0.7rem; color:#666;">${appt.insurance}</span>
                        `;
                        slotDiv.onclick = () => showAppointmentDetails(appt);
                    } else {
                        // Empty slot
                        slotDiv.textContent = timeStr;
                        slotDiv.style.color = '#ccc';
                    }

                    slotsContainer.appendChild(slotDiv);
                    slotTime.setMinutes(slotTime.getMinutes() + intervalMinutes);
                }
                col.appendChild(slotsContainer);
                calendarGrid.appendChild(col);
            });

        } catch (error) {
            console.error("Error rendering admin:", error);
            calendarGrid.innerHTML = `<div style="padding: 2rem; color:red; grid-column:1/-1;">Error: ${error.message}</div>`;
        }
    }

    async function getAppointmentsForWeek(doctorId, dates) {
        const startDate = dates[0];
        const endDate = dates[dates.length - 1];

        // Fallback query logic similar to booking.js
        try {
            const q = query(
                collection(db, "appointments"),
                where("doctor", "==", doctorId),
                where("date", ">=", startDate),
                where("date", "<=", endDate)
            );
            const snap = await getDocs(q);
            return processSnap(snap);
        } catch (e) {
            console.warn("Index missing, falling back", e);
            const q = query(
                collection(db, "appointments"),
                where("doctor", "==", doctorId)
            );
            const snap = await getDocs(q);
            // Filter locally
            const map = {};
            snap.forEach(doc => {
                const data = doc.data();
                if (data.date >= startDate && data.date <= endDate) {
                    if (!map[data.date]) map[data.date] = {};
                    map[data.date][data.time] = data; // Store full object
                }
            });
            return map;
        }
    }

    function processSnap(snap) {
        const map = {};
        snap.forEach(doc => {
            const data = doc.data();
            if (!map[data.date]) map[data.date] = {};
            map[data.date][data.time] = data;
        });
        return map;
    }

    function showAppointmentDetails(appt) {
        modalContent.innerHTML = `
            <p><strong>Paciente:</strong> ${appt.patientName}</p>
            <p><strong>Fecha:</strong> ${appt.date} - ${appt.time}hs</p>
            <p><strong>Cobertura:</strong> ${appt.insurance}</p>
            <p><strong>Email:</strong> ${appt.patientEmail}</p>
            <p><strong>Teléfono:</strong> <a href="tel:${appt.patientPhone}">${appt.patientPhone}</a></p>
            <p><strong>Estado:</strong> ${appt.status}</p>
        `;
        modal.style.display = 'block';
    }

    function capitalize(s) {
        return s && s[0].toUpperCase() + s.slice(1);
    }
});

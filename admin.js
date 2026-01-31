/* Admin Dashboard Logic - Dual View */
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

    // Dashboard Base Elements
    const doctorSelect = document.getElementById('doctor-select');

    // View Tabs & Containers
    const viewDaily = document.getElementById('view-daily');
    const viewWeekly = document.getElementById('view-weekly');
    const tabDaily = document.getElementById('tab-daily');
    const tabWeekly = document.getElementById('tab-weekly');

    // Daily View Elements
    const dailyDatePicker = document.getElementById('daily-date-picker');
    const dailyLabel = document.getElementById('daily-label');
    const dailyList = document.getElementById('daily-agenda-list');
    const dailyPrev = document.getElementById('daily-prev');
    const dailyNext = document.getElementById('daily-next');

    // Weekly View Elements
    const calendarGrid = document.getElementById('calendar-grid');
    const prevWeekBtn = document.getElementById('prev-week');
    const nextWeekBtn = document.getElementById('next-week');
    const currentWeekLabel = document.getElementById('current-week-label');

    // Modal
    const modal = document.getElementById('appt-modal');
    const modalContent = document.getElementById('modal-content');

    // Config
    const startHour = 14;
    const endHour = 18;
    const intervalMinutes = 20;

    // State
    let currentUser = null;
    let currentMonday = getStartOfWeek(new Date()); // For weekly view
    let currentDailyDate = getNextBusinessDay(new Date()); // For daily view

    // --- AUTHENTICATION ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            loginSection.style.display = 'none';
            dashboardSection.style.display = 'block';

            // Auto-select doctor
            if (user.email.includes('secondi')) doctorSelect.value = 'secondi';
            if (user.email.includes('capparelli')) doctorSelect.value = 'capparelli';

            // Init Default View (Daily)
            updateDailyView();
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

    // --- NAVIGATION & TABS ---

    tabDaily.addEventListener('click', () => switchView('daily'));
    tabWeekly.addEventListener('click', () => switchView('weekly'));

    doctorSelect.addEventListener('change', () => {
        if (viewDaily.style.display !== 'none') updateDailyView();
        else renderAdminWeek(currentMonday);
    });

    function switchView(viewName) {
        if (viewName === 'daily') {
            viewDaily.style.display = 'block';
            viewWeekly.style.display = 'none';
            tabDaily.classList.add('active');
            tabDaily.classList.remove('btn-outline');
            tabWeekly.classList.remove('active');
            tabWeekly.classList.add('btn-outline');
            updateDailyView();
        } else {
            viewDaily.style.display = 'none';
            viewWeekly.style.display = 'block';
            tabDaily.classList.remove('active');
            tabDaily.classList.add('btn-outline');
            tabWeekly.classList.add('active');
            tabWeekly.classList.remove('btn-outline');
            renderAdminWeek(currentMonday);
        }
    }

    // --- DAILY VIEW LOGIC ---

    dailyPrev.addEventListener('click', () => changeDailyDate(-1));
    dailyNext.addEventListener('click', () => changeDailyDate(1));
    dailyDatePicker.addEventListener('change', (e) => {
        // e.target.value is YYYY-MM-DD. Need to force local timezone handling.
        currentDailyDate = new Date(e.target.value + 'T00:00:00');
        updateDailyView();
    });

    function getNextBusinessDay(date) {
        let d = new Date(date);
        // Start from today. If today is Sat(6), skip to Mon (+2). If Sun(0), skip to Mon (+1).
        if (d.getDay() === 6) d.setDate(d.getDate() + 2);
        else if (d.getDay() === 0) d.setDate(d.getDate() + 1);
        return d;
    }

    function changeDailyDate(offset) {
        currentDailyDate.setDate(currentDailyDate.getDate() + offset);
        // Skip weekend if navigating
        // If landed on Sun(0), go to Mon(+1) if forward, or Fri(-2) if back? 
        // Simple logic: if Sun or Sat, keep moving in same direction until Mon-Fri
        while (currentDailyDate.getDay() === 0 || currentDailyDate.getDay() === 6) {
            currentDailyDate.setDate(currentDailyDate.getDate() + (offset > 0 ? 1 : -1));
        }
        updateDailyView();
    }

    async function updateDailyView() {
        if (!currentUser) return;

        // UI Updates
        dailyDatePicker.value = currentDailyDate.toISOString().split('T')[0];
        const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
        dailyLabel.textContent = capitalize(currentDailyDate.toLocaleDateString('es-AR', options));

        // Setup container
        dailyList.innerHTML = '<div style="padding: 2rem; text-align: center; color: #888;">Cargando turnos...</div>';

        const doctorId = doctorSelect.value;
        const dateStr = currentDailyDate.toISOString().split('T')[0];

        try {
            // Fetch appointments for this specific day
            const q = query(
                collection(db, "appointments"),
                where("doctor", "==", doctorId),
                where("date", "==", dateStr)
            );

            const snapshot = await getDocs(q);
            const appointments = [];
            snapshot.forEach(doc => appointments.push({ id: doc.id, ...doc.data() }));

            renderDailyList(appointments, dateStr);

        } catch (e) {
            console.error("Daily view error:", e);
            dailyList.innerHTML = `<div style="color:red; padding:1rem;">Error al cargar: ${e.message}</div>`;
        }
    }

    function renderDailyList(appointments, dateStr) {
        dailyList.innerHTML = '';
        const apptMap = {};
        appointments.forEach(a => apptMap[a.time] = a);

        let slotTime = new Date(dateStr + 'T00:00:00');
        slotTime.setHours(startHour, 0, 0, 0);
        const slotEndTime = new Date(dateStr + 'T00:00:00');
        slotEndTime.setHours(endHour, 0, 0, 0);

        while (slotTime < slotEndTime) {
            const timeStr = slotTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            const appt = apptMap[timeStr];

            const row = document.createElement('div');
            row.className = 'daily-row';
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.padding = '0.75rem 1rem';
            row.style.borderBottom = '1px solid #f3f4f6';
            row.style.fontSize = '0.9rem';
            row.style.transition = 'background 0.2s';

            if (appt) {
                // Occupied
                row.innerHTML = `
                    <div style="width: 80px; font-weight:bold; color: #334155;">${timeStr}</div>
                    <div style="flex: 1;">
                        <div style="font-weight:600; color:#1e293b;">${appt.patientName}</div>
                        <div style="font-size:0.8rem; color:#64748b;">${appt.patientPhone || 'Sin teléfono'}</div>
                    </div>
                    <div style="width: 150px; color: #334155;">${appt.insurance || 'Particular'}</div>
                    <div style="width: 120px;">
                        <span style="background: #e0f2fe; color: #0369a1; padding: 4px 10px; border-radius: 99px; font-size: 0.75rem; font-weight: 600;">
                            Reservado
                        </span>
                    </div>
                    <div style="width: 50px; text-align:right;">
                        <button class="btn-icon-details" style="border:none; background:none; color:#94a3b8; cursor:pointer; font-size:1rem;"><i class="fas fa-info-circle"></i></button>
                    </div>
                `;
                row.querySelector('.btn-icon-details').onclick = () => showAppointmentDetails(appt);
                row.style.backgroundColor = '#fff';
            } else {
                // Empty
                row.innerHTML = `
                    <div style="width: 80px; color:#cbd5e1;">${timeStr}</div>
                    <div style="flex: 1; color:#94a3b8; font-style:italic;">Disponible</div>
                    <div style="width: 150px;"></div>
                    <div style="width: 120px;"></div>
                    <div style="width: 50px;"></div>
                `;
                row.classList.add('daily-row-empty'); // for potential styling
            }

            dailyList.appendChild(row);
            slotTime.setMinutes(slotTime.getMinutes() + intervalMinutes);
        }
    }

    // --- WEEKLY VIEW LOGIC (Existing functionality preserved) ---

    prevWeekBtn.addEventListener('click', () => changeWeek(-1));
    nextWeekBtn.addEventListener('click', () => changeWeek(1));

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

        // Label
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

            // Fetch
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
                        slotDiv.style.minHeight = '60px';
                        slotDiv.innerHTML = `
                            <strong>${timeStr}</strong><br>
                            ${appt.patientName.split(' ')[0]}
                        `;
                        slotDiv.onclick = () => showAppointmentDetails(appt);
                    } else {
                        slotDiv.textContent = timeStr;
                    }

                    slotsContainer.appendChild(slotDiv);
                    slotTime.setMinutes(slotTime.getMinutes() + intervalMinutes);
                }
                col.appendChild(slotsContainer);
                calendarGrid.appendChild(col);
            });

        } catch (error) {
            console.error("Week view error", error);
            calendarGrid.innerHTML = `<div style="padding: 2rem; color:red; grid-column:1/-1;">Error: ${error.message}</div>`;
        }
    }

    async function getAppointmentsForWeek(doctorId, dates) {
        const startDate = dates[0];
        const endDate = dates[dates.length - 1];

        // Fallback query identical to previous
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
            console.warn("Index missing, falling back to simpler query");
            const q = query(collection(db, "appointments"), where("doctor", "==", doctorId));
            const snap = await getDocs(q);
            // Filter locally
            const map = {};
            snap.forEach(doc => {
                const data = doc.data();
                if (data.date >= startDate && data.date <= endDate) {
                    if (!map[data.date]) map[data.date] = {};
                    map[data.date][data.time] = data;
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

    // Shared Details Modal
    window.showAppointmentDetails = function (appt) {
        modalContent.innerHTML = `
            <div style="border-bottom: 1px solid #eee; padding-bottom: 1rem; margin-bottom: 1rem;">
                <h4 style="margin-bottom:0.5rem; color: var(--primary);">
                    ${capitalize(appt.patientName)}
                </h4>
                <div style="font-size: 0.9rem; color: #666;">
                    ${capitalize(new Date(appt.date + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }))} - ${appt.time} hs
                </div>
            </div>
            
            <div style="display:grid; gap:0.5rem; font-size:0.95rem;">
                <p><strong>Cobertura:</strong> ${appt.insurance}</p>
                <p><strong>Email:</strong> ${appt.patientEmail}</p>
                <p><strong>Teléfono:</strong> <a href="tel:${appt.patientPhone}" style="color:var(--primary); font-weight:500;">${appt.patientPhone}</a></p>
                <p><strong>Estado:</strong> <span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:10px; font-size:0.85rem;">${appt.status || 'Confirmado'}</span></p>
            </div>
        `;
        modal.style.display = 'block';
    }

    function capitalize(s) {
        return s && s[0].toUpperCase() + s.slice(1);
    }
});

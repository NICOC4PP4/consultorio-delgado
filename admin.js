/* Admin Dashboard Logic - Dual View */
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, where, getDocs, doc, deleteDoc, updateDoc, setDoc, addDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
    const viewSchedule = document.getElementById('view-schedule');
    const tabDaily = document.getElementById('tab-daily');
    const tabWeekly = document.getElementById('tab-weekly');
    const tabSchedule = document.getElementById('tab-schedule');

    // Daily View Elements
    const dailyDatePicker = document.getElementById('daily-date-picker');
    const dailyLabel = document.getElementById('daily-label');
    const dailyList = document.getElementById('daily-agenda-list');
    const dailyPrev = document.getElementById('daily-prev');
    const dailyNext = document.getElementById('daily-next');

    // Schedule Elements
    const scheduleContainer = document.getElementById('schedule-container');
    const saveScheduleBtn = document.getElementById('save-schedule-btn');
    const maxBookingDaysInput = document.getElementById('max-booking-days');

    // Modals
    const editModal = document.getElementById('edit-modal');
    const editForm = document.getElementById('edit-form');
    const editCancel = document.getElementById('edit-cancel');
    const confirmModal = document.getElementById('confirm-modal');
    const confirmYes = document.getElementById('confirm-yes');
    const confirmNo = document.getElementById('confirm-no');

    // Config
    const startHour = 14;
    const endHour = 18;
    const intervalMinutes = 20;

    // State
    let currentUser = null;
    let currentMonday = getStartOfWeek(new Date());
    let currentDailyDate = getNextBusinessDay(new Date());
    let pendingDeleteId = null;
    let doctorScheduleConfig = null; // Store loaded config

    // --- AUTHENTICATION ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            loginSection.style.display = 'none';
            dashboardSection.style.display = 'block';

            if (user.email.includes('secondi')) doctorSelect.value = 'secondi';
            if (user.email.includes('capparelli')) doctorSelect.value = 'capparelli';

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
    tabSchedule.addEventListener('click', () => switchView('schedule'));

    doctorSelect.addEventListener('change', () => {
        if (viewDaily.style.display !== 'none') updateDailyView();
        else if (viewWeekly.style.display !== 'none') renderAdminWeek(currentMonday);
        else if (viewSchedule.style.display !== 'none') loadScheduleConfig();
    });

    function switchView(viewName) {
        // Reset ALL
        viewDaily.style.display = 'none';
        viewWeekly.style.display = 'none';
        viewSchedule.style.display = 'none';
        tabDaily.classList.remove('active', 'btn-primary'); // removing btn-primary just in case
        tabDaily.classList.add('btn-outline');
        tabWeekly.classList.remove('active');
        tabWeekly.classList.add('btn-outline');
        tabSchedule.classList.remove('active');
        tabSchedule.classList.add('btn-outline');

        if (viewName === 'daily') {
            viewDaily.style.display = 'block';
            tabDaily.classList.add('active');
            tabDaily.classList.remove('btn-outline');
            updateDailyView();
        } else if (viewName === 'weekly') {
            viewWeekly.style.display = 'block';
            tabWeekly.classList.add('active');
            tabWeekly.classList.remove('btn-outline');
            renderAdminWeek(currentMonday);
        } else if (viewName === 'schedule') {
            viewSchedule.style.display = 'block';
            tabSchedule.classList.add('active');
            tabSchedule.classList.remove('btn-outline');
            loadScheduleConfig();
        }
    }

    // --- SCHEDULE CONFIG LOGIC ---

    async function loadScheduleConfig() {
        const doctorId = doctorSelect.value;
        scheduleContainer.innerHTML = '<div style="text-align: center; padding: 2rem;">Cargando configuración...</div>';

        // Mock default
        let schedule = {
            1: { active: true, start: "14:00", end: "18:00" }, // Mon
            2: { active: true, start: "14:00", end: "18:00" }, // Tue
            3: { active: true, start: "14:00", end: "18:00" }, // Wed
            4: { active: true, start: "14:00", end: "18:00" }, // Thu
            5: { active: true, start: "14:00", end: "18:00" },  // Fri
            6: { active: false, start: "09:00", end: "13:00" }   // Sat
        };
        let maxBookingDays = 15;

        try {
            const docRef = doc(db, "doctor_schedules", doctorId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.schedule) {
                    schedule = { ...schedule, ...data.schedule };
                }
                if (data.maxBookingDays) {
                    maxBookingDays = data.maxBookingDays;
                }
            }
        } catch (e) {
            console.error("Error loading schedule:", e);
        }

        doctorScheduleConfig = schedule;
        maxBookingDaysInput.value = maxBookingDays;
        renderScheduleEditor(schedule);
    }

    function renderScheduleEditor(schedule) {
        scheduleContainer.innerHTML = '';
        const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

        // We iterate 1 (Mon) to 5 (Fri). Maybe 6 (Sat). User screenshot had Sat/Sun.
        // Let's support 1-6.
        for (let i = 1; i <= 6; i++) {
            const dayConfig = schedule[i] || { active: false, start: "14:00", end: "18:00" };
            const isChecked = dayConfig.active ? 'checked' : '';
            const opacity = dayConfig.active ? '1' : '0.5';
            const pointerEvents = dayConfig.active ? 'auto' : 'none';

            const row = document.createElement('div');
            row.className = 'schedule-row';
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.padding = '1rem';
            row.style.background = '#f8f9fa';
            row.style.borderRadius = '8px';
            row.style.justifyContent = 'space-between';
            row.style.border = '1px solid #eee';

            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:1rem;">
                    <label class="switch" style="position:relative; display:inline-block; width:60px; height:34px;">
                        <input type="checkbox" class="day-toggle" data-day="${i}" ${isChecked}>
                        <span class="slider round" style="position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background-color:#ccc; transition:.4s; border-radius:34px;"></span>
                        <style>
                            .switch input:checked + .slider { background-color: var(--primary); }
                            .switch input:checked + .slider:before { transform: translateX(26px); }
                            .slider:before { position: absolute; content: ""; height: 26px; width: 26px; left: 4px; bottom: 4px; background-color: white; transition: .4s; border-radius: 50%; }
                        </style>
                    </label>
                    <span style="font-weight:600; font-size:1.1rem; width:100px;">${days[i]}</span>
                </div>
                
                <div class="time-inputs" style="display:flex; align-items:center; gap:0.5rem; opacity: ${opacity}; pointer-events: ${pointerEvents}; transition: 0.3s;">
                    <input type="time" class="start-time" value="${dayConfig.start}" style="padding:0.5rem; border:1px solid #ddd; border-radius:4px;">
                    <span style="color:#666;">a</span>
                    <input type="time" class="end-time" value="${dayConfig.end}" style="padding:0.5rem; border:1px solid #ddd; border-radius:4px;">
                </div>
            `;

            // Toggle Handler
            row.querySelector('.day-toggle').addEventListener('change', (e) => {
                const inputs = row.querySelector('.time-inputs');
                if (e.target.checked) {
                    inputs.style.opacity = '1';
                    inputs.style.pointerEvents = 'auto';
                } else {
                    inputs.style.opacity = '0.5';
                    inputs.style.pointerEvents = 'none';
                }
            });

            scheduleContainer.appendChild(row);
        }
    }

    saveScheduleBtn.addEventListener('click', async () => {
        saveScheduleBtn.disabled = true;
        saveScheduleBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

        const config = {};
        const rows = document.querySelectorAll('.schedule-row');
        rows.forEach(row => {
            const toggle = row.querySelector('.day-toggle');
            const day = toggle.dataset.day;
            const start = row.querySelector('.start-time').value;
            const end = row.querySelector('.end-time').value;

            config[day] = {
                active: toggle.checked,
                start: start,
                end: end
            };
        });

        const maxBookingDays = parseInt(maxBookingDaysInput.value) || 15;

        try {
            await setDoc(doc(db, "doctor_schedules", doctorSelect.value), {
                schedule: config,
                maxBookingDays: maxBookingDays
            });
            doctorScheduleConfig = config; // Update local cache
            alert("Configuración guardada correctamente.");
        } catch (e) {
            console.error(e);
            alert("Error al guardar: " + e.message);
        } finally {
            saveScheduleBtn.disabled = false;
            saveScheduleBtn.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
        }
    });

    // --- DAILY VIEW LOGIC ---

    dailyPrev.addEventListener('click', () => changeDailyDate(-1));
    dailyNext.addEventListener('click', () => changeDailyDate(1));
    dailyDatePicker.addEventListener('change', (e) => {
        currentDailyDate = new Date(e.target.value + 'T00:00:00');
        updateDailyView();
    });

    function getNextBusinessDay(date) {
        let d = new Date(date);
        if (d.getDay() === 6) d.setDate(d.getDate() + 2); // Sat -> Mon
        else if (d.getDay() === 0) d.setDate(d.getDate() + 1); // Sun -> Mon
        return d;
    }

    function changeDailyDate(offset) {
        currentDailyDate.setDate(currentDailyDate.getDate() + offset);
        while (currentDailyDate.getDay() === 0 || currentDailyDate.getDay() === 6) {
            currentDailyDate.setDate(currentDailyDate.getDate() + (offset > 0 ? 1 : -1));
        }
        updateDailyView();
    }

    async function updateDailyView() {
        if (!currentUser) return;
        dailyDatePicker.value = currentDailyDate.toISOString().split('T')[0];
        const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
        dailyLabel.textContent = capitalize(currentDailyDate.toLocaleDateString('es-AR', options));
        dailyList.innerHTML = '<div style="padding: 2rem; text-align: center; color: #888;">Cargando turnos...</div>';

        const doctorId = doctorSelect.value;
        const dateStr = currentDailyDate.toISOString().split('T')[0];

        try {
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

            if (appt) {
                // Occupied / Blocked
                const isBlocked = appt.status === 'blocked';
                row.style.backgroundColor = isBlocked ? '#fef2f2' : '#fff';

                // Format CreatedAt
                let createdStr = '';
                if (appt.createdAt && !isBlocked) {
                    try {
                        const dateObj = appt.createdAt.seconds ? new Date(appt.createdAt.seconds * 1000) : new Date(appt.createdAt);
                        createdStr = dateObj.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                    } catch (e) { }
                }

                row.innerHTML = `
                    <div style="width: 80px; font-weight:bold; color: #334155;">${timeStr}</div>
                    <div style="width: 200px; font-weight:600; color:#1e293b; display:flex; flex-direction:column;">
                        <span>${isBlocked ? '<span style="color:#dc2626;">BLOQUEADO</span>' : appt.patientName}</span>
                        ${createdStr ? `<span style="font-size:0.75rem; color:#94a3b8; font-weight:400; margin-top:2px;">Creado: ${createdStr}</span>` : ''}
                    </div>
                    <div style="width: 200px; font-size:0.8rem; color:#64748b; display:flex; flex-direction:column;">
                        <span>${isBlocked ? '-' : (appt.patientPhone || 'Sin tel')}</span>
                        ${!isBlocked && appt.patientEmail ? `<a href="mailto:${appt.patientEmail}" style="color:#0ea5e9; text-decoration:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:block;" title="${appt.patientEmail}">${appt.patientEmail}</a>` : ''}
                    </div>
                    <div style="width: 150px; color: #334155;">
                        ${isBlocked ? '-' : (appt.insurance || 'Particular')}
                    </div>
                    <div style="width: 100px;">
                        ${isBlocked
                        ? '<span style="background:#fee2e2; color:#b91c1c; padding:2px 8px; border-radius:10px; font-size:0.75rem;">Bloqueado</span>'
                        : `<span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:10px; font-size:0.75rem;">${appt.status || 'Reservado'}</span>`
                    }
                    </div>
                    <div style="flex: 1; text-align:right; display:flex; gap:0.5rem; justify-content:flex-end;">
                        <button class="btn-icon edit-btn" title="Editar"><i class="fas fa-pencil-alt"></i></button>
                        <button class="btn-icon delete-btn" title="${isBlocked ? 'Desbloquear' : 'Eliminar'}" style="color:#dc2626;">
                            <i class="fas ${isBlocked ? 'fa-lock-open' : 'fa-trash'}"></i>
                        </button>
                    </div>
                `;

                // Handlers
                row.querySelector('.edit-btn').onclick = () => openEditModal(appt);
                row.querySelector('.delete-btn').onclick = () => requestDelete(appt);

            } else {
                // Empty
                row.classList.add('daily-row-empty');
                row.innerHTML = `
                    <div style="width: 80px; color:#cbd5e1;">${timeStr}</div>
                    <div style="width: 200px; color:#94a3b8; font-style:italic;">Disponible</div>
                    <div style="flex: 1;"></div>
                    <div style="display:flex; gap:0.5rem;">
                         <button class="btn-icon add-btn" title="Agregar Turno" style="color:#16a34a;"><i class="fas fa-plus-circle"></i> Agregar</button>
                         <button class="btn-icon block-btn" title="Bloquear Horario" style="color:#dc2626;"><i class="fas fa-ban"></i> Bloquear</button>
                    </div>
                `;

                // Handlers
                row.querySelector('.add-btn').onclick = () => openAddModal(timeStr, dateStr);
                row.querySelector('.block-btn').onclick = () => createBlock(timeStr, dateStr);
            }

            dailyList.appendChild(row);
            slotTime.setMinutes(slotTime.getMinutes() + intervalMinutes);
        }
    }

    // --- ACTIONS ---

    // 1. DELETE / UNBLOCK
    window.requestDelete = async function (appt) {
        // If blocked, delete immediately without confirmation
        if (appt.status === 'blocked') {
            try {
                await deleteDoc(doc(db, "appointments", appt.id));
                updateDailyView();
            } catch (e) {
                console.error("Unblock failed", e);
                alert("Error al desbloquear");
            }
            return;
        }

        // If normal appointment, ask for confirmation
        pendingDeleteId = appt.id;
        confirmModal.style.display = 'flex';
    }

    confirmYes.addEventListener('click', async () => {
        if (pendingDeleteId) {
            try {
                await deleteDoc(doc(db, "appointments", pendingDeleteId));
                confirmModal.style.display = 'none';
                updateDailyView();
            } catch (e) {
                console.error("Delete failed", e);
                alert("Error al eliminar turno");
            }
        }
    });

    confirmNo.addEventListener('click', () => {
        confirmModal.style.display = 'none';
        pendingDeleteId = null;
    });

    // 2. BLOCK
    async function createBlock(time, date) {
        try {
            await addDoc(collection(db, "appointments"), {
                doctor: doctorSelect.value,
                date: date,
                time: time,
                status: 'blocked',
                patientName: 'Bloqueado',
                createdAt: new Date()
            });
            updateDailyView();
        } catch (e) {
            console.error("Block failed", e);
        }
    }

    // 3. EDIT / ADD
    function openEditModal(appt) {
        document.getElementById('edit-modal-title').textContent = "Editar Turno";
        document.getElementById('edit-id').value = appt.id;
        document.getElementById('edit-time').value = appt.time;

        // If it's a blocked slot, we clear fields to allow easy conversion to appointment
        if (appt.status === 'blocked') {
            document.getElementById('edit-name').value = '';
            document.getElementById('edit-email').value = '';
            document.getElementById('edit-phone').value = '';
            document.getElementById('edit-insurance').value = 'Particular';
            document.getElementById('edit-status').value = 'Confirmado';
        } else {
            document.getElementById('edit-name').value = appt.patientName || '';
            document.getElementById('edit-email').value = appt.patientEmail || '';
            document.getElementById('edit-phone').value = appt.patientPhone || '';
            document.getElementById('edit-insurance').value = appt.insurance || 'Particular';
            document.getElementById('edit-status').value = appt.status || 'Confirmado';
        }

        editModal.style.display = 'flex';
    }

    function openAddModal(time, date) {
        document.getElementById('edit-modal-title').textContent = `Nuevo Turno (${time} hrs)`;
        document.getElementById('edit-id').value = ""; // Empty ID = New
        document.getElementById('edit-time').value = time;
        document.getElementById('edit-name').value = "";
        document.getElementById('edit-email').value = "";
        document.getElementById('edit-phone').value = "";
        document.getElementById('edit-insurance').value = "Particular";
        document.getElementById('edit-status').value = "Confirmado";

        editModal.style.display = 'flex';
    }

    editCancel.addEventListener('click', () => editModal.style.display = 'none');

    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-id').value;
        const time = document.getElementById('edit-time').value;
        const data = {
            patientName: document.getElementById('edit-name').value,
            patientEmail: document.getElementById('edit-email').value,
            patientPhone: document.getElementById('edit-phone').value,
            insurance: document.getElementById('edit-insurance').value,
            status: document.getElementById('edit-status').value,
            doctor: doctorSelect.value,
            date: currentDailyDate.toISOString().split('T')[0],
            time: time
        };

        try {
            if (id) {
                // Update
                await updateDoc(doc(db, "appointments", id), data);
            } else {
                // Create
                data.createdAt = new Date();
                await addDoc(collection(db, "appointments"), data);
            }
            editModal.style.display = 'none';
            updateDailyView();
        } catch (e) {
            console.error("Save failed", e);
            alert("Error al guardar");
        }
    });

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

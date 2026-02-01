/* Admin Dashboard Logic - Dual View */
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, where, getDocs, doc, deleteDoc, updateDoc, setDoc, addDoc, getDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
    const viewRecurrence = document.getElementById('view-recurrence');
    const viewConfig = document.getElementById('view-config');

    const tabDaily = document.getElementById('tab-daily');
    const tabWeekly = document.getElementById('tab-weekly');
    const tabRecurrence = document.getElementById('tab-recurrence');
    const tabConfig = document.getElementById('tab-config');

    // Daily View Elements
    const dailyDatePicker = document.getElementById('daily-date-picker');
    const dailyLabel = document.getElementById('daily-label');
    const dailyList = document.getElementById('daily-agenda-list');
    const dailyPrev = document.getElementById('daily-prev');
    const dailyNext = document.getElementById('daily-next');
    const dailyToday = document.getElementById('daily-today');

    // Schedule Elements
    const scheduleContainer = document.getElementById('schedule-container');
    const saveRecurrenceBtn = document.getElementById('save-recurrence-btn');
    const saveConfigBtn = document.getElementById('save-config-btn');
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
    const ALLOWED_ADMIN = 'turnosconsultoriodelgado@gmail.com';

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const email = user.email ? user.email.toLowerCase() : '';
            if (email !== ALLOWED_ADMIN.toLowerCase()) {
                // Not the admin -> Sign out and Redirect
                alert("Acceso denegado. Este usuario no tiene permisos de administrador.");
                await signOut(auth);
                window.location.href = 'index.html';
                return;
            }

            currentUser = user;
            loginSection.style.display = 'none';
            dashboardSection.style.display = 'block';

            // Default view or logic
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
            const emailInput = document.getElementById('admin-email');
            const passwordInput = document.getElementById('admin-password');
            const email = emailInput.value.trim();
            const password = passwordInput.value.trim();

            authError.style.display = 'none';
            authError.textContent = '';

            try {
                await signInWithEmailAndPassword(auth, email, password);
                // Listener handles redirect
            } catch (error) {
                console.error("Login failed:", error);

                // Specific error handling
                if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                    authError.textContent = "Contraseña incorrecta o usuario no encontrado.";
                } else if (error.code === 'auth/user-not-found') {
                    authError.textContent = "No existe un usuario con este email.";
                } else if (error.code === 'auth/invalid-email') {
                    authError.textContent = "El formato del email es inválido.";
                } else if (error.code === 'auth/too-many-requests') {
                    authError.textContent = "Demasiados intentos fallidos. Intente más tarde.";
                } else {
                    authError.textContent = "Error al iniciar sesión: " + error.message;
                }

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
    tabRecurrence.addEventListener('click', () => switchView('recurrence'));
    tabConfig.addEventListener('click', () => switchView('config'));

    doctorSelect.addEventListener('change', () => {
        if (viewDaily.style.display !== 'none') updateDailyView();
        else if (viewWeekly.style.display !== 'none') renderAdminWeek(currentMonday);
        else if (viewRecurrence.style.display !== 'none') loadScheduleConfig();
        else if (viewConfig.style.display !== 'none') loadScheduleConfig();
    });

    function switchView(viewName) {
        // Reset ALL
        viewDaily.style.display = 'none';
        viewWeekly.style.display = 'none';
        viewRecurrence.style.display = 'none';
        viewConfig.style.display = 'none';

        [tabDaily, tabWeekly, tabRecurrence, tabConfig].forEach(t => {
            t.classList.remove('active', 'btn-primary');
            t.classList.add('btn-outline');
        });

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
        } else if (viewName === 'recurrence') {
            viewRecurrence.style.display = 'block';
            tabRecurrence.classList.add('active');
            tabRecurrence.classList.remove('btn-outline');
            loadScheduleConfig();
        } else if (viewName === 'config') {
            viewConfig.style.display = 'block';
            tabConfig.classList.add('active');
            tabConfig.classList.remove('btn-outline');
            loadScheduleConfig();
        }
    }

    // --- SCHEDULE CONFIG LOGIC ---

    async function loadScheduleConfig() {
        // If we are already loading, maybe skip? But simple is fine.
        const doctorId = doctorSelect.value;
        const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

        // Default Data
        let schedule = {
            1: { active: true, start: "14:00", end: "18:00" },
            2: { active: true, start: "14:00", end: "18:00" },
            3: { active: true, start: "14:00", end: "18:00" },
            4: { active: true, start: "14:00", end: "18:00" },
            5: { active: true, start: "14:00", end: "18:00" },
            6: { active: false, start: "09:00", end: "13:00" }
        };
        let maxBookingDays = 15;

        try {
            const docRef = doc(db, "doctor_schedules", doctorId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.schedule) schedule = { ...schedule, ...data.schedule };
                if (data.maxBookingDays) maxBookingDays = data.maxBookingDays;
            }
        } catch (e) {
            console.error("Error loading schedule:", e);
        }

        doctorScheduleConfig = schedule;
        if (maxBookingDaysInput) maxBookingDaysInput.value = maxBookingDays;

        // Render Recurrence Editor only if container exists (it does)
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

    // SAVE RECURRENCE
    if (saveRecurrenceBtn) {
        saveRecurrenceBtn.addEventListener('click', async () => {
            saveRecurrenceBtn.disabled = true;
            saveRecurrenceBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

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

            try {
                // Merge Schedule
                await setDoc(doc(db, "doctor_schedules", doctorSelect.value), { schedule: config }, { merge: true });
                doctorScheduleConfig = config;
                alert("Horarios guardados correctamente.");
            } catch (e) {
                console.error(e);
                alert("Error al guardar: " + e.message);
            } finally {
                saveRecurrenceBtn.disabled = false;
                saveRecurrenceBtn.innerHTML = '<i class="fas fa-save"></i> Guardar Horarios';
            }
        });
    }

    // SAVE CONFIG
    if (saveConfigBtn) {
        saveConfigBtn.addEventListener('click', async () => {
            saveConfigBtn.disabled = true;
            saveConfigBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

            const maxBookingDays = parseInt(maxBookingDaysInput.value) || 15;

            try {
                // Merge Config
                await setDoc(doc(db, "doctor_schedules", doctorSelect.value), { maxBookingDays: maxBookingDays }, { merge: true });
                alert("Configuración guardada correctamente.");
            } catch (e) {
                console.error(e);
                alert("Error al guardar: " + e.message);
            } finally {
                saveConfigBtn.disabled = false;
                saveConfigBtn.innerHTML = '<i class="fas fa-save"></i> Guardar Configuración';
            }
        });
    }

    // --- DAILY VIEW LOGIC ---

    if (dailyToday) dailyToday.addEventListener('click', () => {
        currentDailyDate = new Date();
        updateDailyView();
    });

    dailyPrev.addEventListener('click', () => changeDailyDate(-1));
    dailyNext.addEventListener('click', () => changeDailyDate(1));
    dailyDatePicker.addEventListener('change', (e) => {
        // Fix timezone offset issue by treating input as local midnight
        const [y, m, d] = e.target.value.split('-').map(Number);
        currentDailyDate = new Date(y, m - 1, d);
        updateDailyView();
    });

    function getNextBusinessDay(date) {
        // Keep this for initial load if preferred, or just return date
        let d = new Date(date);
        return d;
    }

    function changeDailyDate(offset) {
        currentDailyDate.setDate(currentDailyDate.getDate() + offset);
        // Weekend skip removed to allow full navigation
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

    // --- WEEKLY VIEW LOGIC ---
    const weeklyTodayBtn = document.getElementById('weekly-today');
    const weeklyDatePicker = document.getElementById('weekly-date-picker');
    const prevWeekBtn = document.getElementById('prev-week');
    const nextWeekBtn = document.getElementById('next-week');

    if (prevWeekBtn) prevWeekBtn.addEventListener('click', () => changeWeek(-1));
    if (nextWeekBtn) nextWeekBtn.addEventListener('click', () => changeWeek(1));

    if (weeklyTodayBtn) {
        weeklyTodayBtn.addEventListener('click', () => {
            currentMonday = getStartOfWeek(new Date());
            renderAdminWeek(currentMonday);
        });
    }

    if (weeklyDatePicker) {
        weeklyDatePicker.addEventListener('change', (e) => {
            if (e.target.value) {
                // When picking a date, jump to the Monday of that week
                // Need to account for timezone offset to avoid previous day
                const parts = e.target.value.split('-');
                const selected = new Date(parts[0], parts[1] - 1, parts[2]);
                currentMonday = getStartOfWeek(selected);
                renderAdminWeek(currentMonday);
            }
        });
    }

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

    // Update DatePicker when rendering
    function updateWeeklyPicker(date) {
        if (weeklyDatePicker) {
            // Local date to YYYY-MM-DD
            const offset = date.getTimezoneOffset();
            const localDate = new Date(date.getTime() - (offset * 60 * 1000));
            weeklyDatePicker.value = localDate.toISOString().split('T')[0];
        }
    }

    async function blockDay(dateStr, doctorId) {
        if (!confirm(`¿Bloquear todos los horarios libres del ${dateStr}?`)) return;

        try {
            // 1. Get schedule for that day
            const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();
            const docSnap = await getDoc(doc(db, "doctor_schedules", doctorId));
            const rules = docSnap.exists() ? docSnap.data().schedule : null;

            if (!rules || !rules[dayOfWeek] || !rules[dayOfWeek].active) {
                alert("No hay horarios configurados para este día.");
                return;
            }

            const rule = rules[dayOfWeek];
            const [startH, startM] = rule.start.split(':').map(Number);
            const [endH, endM] = rule.end.split(':').map(Number);

            // 2. Get existing appointments
            const q = query(collection(db, "appointments"),
                where("doctor", "==", doctorId),
                where("date", "==", dateStr)
            );
            const querySnapshot = await getDocs(q);
            const existingTimes = new Set();
            querySnapshot.forEach(doc => existingTimes.add(doc.data().time));

            // 3. Batched Write
            const batch = writeBatch(db);
            let count = 0;

            let slotTime = new Date(dateStr + 'T00:00:00');
            slotTime.setHours(startH, startM, 0, 0);
            const slotEndTime = new Date(dateStr + 'T00:00:00');
            slotEndTime.setHours(endH, endM, 0, 0);

            while (slotTime < slotEndTime) {
                const timeStr = slotTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

                if (!existingTimes.has(timeStr)) {
                    const newRef = doc(collection(db, "appointments"));
                    batch.set(newRef, {
                        doctor: doctorId,
                        date: dateStr,
                        time: timeStr,
                        status: 'blocked',
                        patientName: 'Bloqueado (Admin)',
                        createdAt: new Date()
                    });
                    count++;
                }
                slotTime.setMinutes(slotTime.getMinutes() + 20);
            }

            if (count > 0) {
                await batch.commit();
                updateDailyView();
                renderAdminWeek(currentMonday);
            } else {
                alert("No hay horarios libres para bloquear.");
            }

        } catch (e) {
            console.error("Error blocking day:", e);
            alert("Error al bloquear el día.");
        }
    }

    async function unblockDay(dateStr, doctorId) {
        if (!confirm(`¿Desbloquear todos los bloqueos manuales del ${dateStr}?`)) return;

        try {
            const q = query(collection(db, "appointments"),
                where("doctor", "==", doctorId),
                where("date", "==", dateStr),
                where("status", "==", "blocked")
            );

            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                alert("No hay bloqueos manuales para eliminar en este día.");
                return;
            }

            const batch = writeBatch(db);
            querySnapshot.forEach(doc => {
                batch.delete(doc.ref);
            });

            await batch.commit();
            renderAdminWeek(currentMonday);

        } catch (e) {
            console.error("Error unblocking day:", e);
            alert("Error al desbloquear el día.");
        }
    }

    window.blockDay = blockDay;
    window.unblockDay = unblockDay;

    async function renderAdminWeek(mondayDate) {
        if (!mondayDate || isNaN(mondayDate.getTime())) {
            console.error("Invalid mondayDate passed to renderAdminWeek");
            return;
        }

        const doctorId = doctorSelect.value;
        const currentWeekLabel = document.getElementById('current-week-label');
        const calendarGrid = document.getElementById('calendar-grid');

        if (!currentWeekLabel || !calendarGrid) return;

        updateWeeklyPicker(mondayDate);



        // Label
        const fridayDate = new Date(mondayDate);
        fridayDate.setDate(mondayDate.getDate() + 4);
        const options = { day: 'numeric', month: 'numeric' };
        currentWeekLabel.textContent = `Semana del ${mondayDate.toLocaleDateString('es-AR', options)} al ${fridayDate.toLocaleDateString('es-AR', options)}`;

        calendarGrid.innerHTML = '<div style="padding: 2rem; text-align: center; grid-column: 1/-1;">Cargando turnos...</div>';

        // 1. Fetch Schedule Rules
        let scheduleRules = {};
        try {
            const docSnap = await getDoc(doc(db, "doctor_schedules", doctorId));
            if (docSnap.exists() && docSnap.data().schedule) {
                scheduleRules = docSnap.data().schedule;
            } else {
                // Fallback default
                scheduleRules = {
                    1: { active: true, start: "14:00", end: "18:00" },
                    2: { active: true, start: "14:00", end: "18:00" },
                    3: { active: true, start: "14:00", end: "18:00" },
                    4: { active: true, start: "14:00", end: "18:00" },
                    5: { active: true, start: "14:00", end: "18:00" }
                };
            }
        } catch (e) {
            console.error("Error loading schedule rules:", e);
            calendarGrid.innerHTML = `<div style="color:red; padding:2rem; grid-column:1/-1">Error al cargar configuración: ${e.message}</div>`;
            return;
        }

        try {
            // 2. Generate Dates (Mon-Fri)
            const weekDates = [];
            let tempDate = new Date(mondayDate);
            for (let i = 0; i < 5; i++) {
                weekDates.push(tempDate.toISOString().split('T')[0]);
                tempDate.setDate(tempDate.getDate() + 1);
            }

            // 3. Fetch Appointments
            const appointmentsMap = await getAppointmentsForWeek(doctorId, weekDates);

            // 4. Render Grid
            // ... (rest of weekly render logic if needed, but it seems cutoff in view_file. Assuming append works)


            calendarGrid.innerHTML = '';

            weekDates.forEach(dateStr => {
                const dateObj = new Date(dateStr + 'T00:00:00');
                const dayName = dateObj.toLocaleDateString('es-AR', { weekday: 'long' });
                const dayNum = dateObj.getDate();
                const dayOfWeek = dateObj.getDay(); // 1=Mon

                const col = document.createElement('div');
                col.className = 'day-column';

                const controlsDiv = `<div style="display:flex; gap:5px; justify-content:center; margin-bottom:5px;">
                                <button class="btn-icon-sm" onclick="blockDay('${dateStr}', '${doctorId}')" title="Bloquear día"><i class="fas fa-lock" style="font-size:0.8rem; color:#666;"></i></button>
                                <button class="btn-icon-sm" onclick="unblockDay('${dateStr}', '${doctorId}')" title="Desbloquear día"><i class="fas fa-unlock" style="font-size:0.8rem; color:#666;"></i></button>
                            </div>`;

                const header = document.createElement('div');
                header.className = 'day-header';
                header.innerHTML = `${controlsDiv}<span>${capitalize(dayName)}</span><small>${dayNum}</small>`;
                col.appendChild(header);

                const slotsContainer = document.createElement('div');
                slotsContainer.className = 'slots-column';

                const rule = scheduleRules[dayOfWeek];

                if (!rule || !rule.active || !rule.start || !rule.end) {
                    slotsContainer.innerHTML = '<div style="padding:1rem; text-align:center; color:#ccc; font-size:0.9rem;">No atiende</div>';
                } else {
                    const [startH, startM] = rule.start.split(':').map(Number);
                    const [endH, endM] = rule.end.split(':').map(Number);

                    let slotTime = new Date(dateStr + 'T00:00:00');
                    slotTime.setHours(startH, startM, 0, 0);
                    const slotEndTime = new Date(dateStr + 'T00:00:00');
                    slotEndTime.setHours(endH, endM, 0, 0);

                    // Safety limit
                    let iterations = 0;
                    while (slotTime < slotEndTime && iterations < 100) {
                        iterations++;
                        const timeStr = slotTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

                        const slotDiv = document.createElement('div');
                        slotDiv.className = 'time-slot';
                        slotDiv.style.cursor = 'pointer';

                        const appt = appointmentsMap[dateStr] && appointmentsMap[dateStr][timeStr];

                        if (appt) {
                            const isBlocked = appt.status === 'blocked';
                            slotDiv.classList.add('taken');
                            if (isBlocked) {
                                slotDiv.style.background = '#fee2e2';
                                slotDiv.style.color = '#b91c1c';
                            }

                            slotDiv.style.minHeight = '60px';
                            slotDiv.innerHTML = `
                                            <strong>${timeStr}</strong><br>
                                            ${isBlocked ? 'BLOQUEADO' : (appt.patientName ? appt.patientName.split(' ')[0] : 'Ocupado')}
                                        `;
                            slotDiv.onclick = () => openEditModal(appt);
                        } else {
                            slotDiv.textContent = timeStr;
                            slotDiv.onclick = () => openAddModal(timeStr, dateStr);
                        }

                        slotsContainer.appendChild(slotDiv);
                        slotTime.setMinutes(slotTime.getMinutes() + 20);
                    }
                }

                col.appendChild(slotsContainer);
                calendarGrid.appendChild(col);
            });

        } catch (error) {
            console.error("Week view critical error", error);
            calendarGrid.innerHTML = `<div style="padding: 2rem; color:red; grid-column:1/-1;">Error crítico: ${error.message}</div>`;
        }
    }

    async function getAppointmentsForWeek(doctorId, dates) {
        const startDate = dates[0];
        const endDate = dates[dates.length - 1];

        // Use client-side filtering to avoid index issues for now
        try {
            const q = query(collection(db, "appointments"), where("doctor", "==", doctorId));
            const snap = await getDocs(q);

            const map = {};
            snap.forEach(doc => {
                const data = { id: doc.id, ...doc.data() };
                // Filter by date range locally
                if (data.date >= startDate && data.date <= endDate) {
                    if (!map[data.date]) map[data.date] = {};
                    map[data.date][data.time] = data;
                }
            });
            return map;
        } catch (e) {
            console.error("Fetch appointments failed", e);
            throw e;
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

    // --- PATIENTS VIEW LOGIC ---

    const tabPatients = document.getElementById('tab-patients');
    const viewPatients = document.getElementById('view-patients');
    const patientSearchInput = document.getElementById('patient-search-input');
    const patientSearchBtn = document.getElementById('patient-search-btn');
    const patientsResults = document.getElementById('patients-results');
    const patientModal = document.getElementById('patient-modal');
    const patientEditForm = document.getElementById('patient-edit-form');

    if (tabPatients) {
        tabPatients.addEventListener('click', () => switchView('patients'));
    }

    if (patientSearchBtn) {
        patientSearchBtn.addEventListener('click', () => {
            const queryText = patientSearchInput.value.trim();
            if (queryText) searchPatients(queryText);
        });
        patientSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') patientSearchBtn.click();
        });
    }

    function switchView(viewName) {
        // Reset ALL
        viewDaily.style.display = 'none';
        viewWeekly.style.display = 'none';
        viewRecurrence.style.display = 'none';
        viewConfig.style.display = 'none';
        if (viewPatients) viewPatients.style.display = 'none';

        [tabDaily, tabWeekly, tabRecurrence, tabConfig, tabPatients].forEach(t => {
            if (t) {
                t.classList.remove('active', 'btn-primary');
                t.classList.add('btn-outline');
            }
        });

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
        } else if (viewName === 'recurrence') {
            viewRecurrence.style.display = 'block';
            tabRecurrence.classList.add('active');
            tabRecurrence.classList.remove('btn-outline');
            loadScheduleConfig();
        } else if (viewName === 'config') {
            viewConfig.style.display = 'block';
            tabConfig.classList.add('active');
            tabConfig.classList.remove('btn-outline');
            loadScheduleConfig();
        } else if (viewName === 'patients') {
            viewPatients.style.display = 'block';
            tabPatients.classList.add('active');
            tabPatients.classList.remove('btn-outline');
        }
    }

    async function searchPatients(queryText) {
        patientsResults.innerHTML = '<div style="padding:2rem; text-align:center;">Buscando...</div>';
        try {
            // Ideally we use a proper search index, but for now we fetch all and filter client-side 
            // OR use startAt/endAt for simple prefix search on Name if supported.
            // Given Firestore limitations, let's fetch 'patients' collection. 
            // Warning: If many patients, this is costly. Implementing "Client Side Filter" approach for < 1000 users.

            const q = query(collection(db, "patients")); // Get all for now (MVP optimization)
            const snapshot = await getDocs(q);

            const matches = [];
            const lowerQ = queryText.toLowerCase();

            snapshot.forEach(doc => {
                const data = doc.data();
                const fullName = `${data.name || ''} ${data.lastname || ''}`.toLowerCase();
                const dni = (data.dni || '').toString();

                if (fullName.includes(lowerQ) || dni.includes(lowerQ)) {
                    matches.push({ id: doc.id, ...data });
                }
            });

            renderPatientResults(matches);
        } catch (e) {
            console.error("Search error:", e);
            patientsResults.innerHTML = `<div style="color:red; padding:2rem;">Error al buscar: ${e.message}</div>`;
        }
    }

    function renderPatientResults(patients) {
        if (patients.length === 0) {
            patientsResults.innerHTML = '<div style="padding:2rem; text-align:center;">No se encontraron pacientes.</div>';
            return;
        }

        let html = `
            <table style="width:100%; border-collapse:collapse;">
                <thead style="background:#f8f9fa; border-bottom:2px solid #eee;">
                    <tr>
                        <th style="padding:1rem; text-align:left;">Nombre</th>
                        <th style="padding:1rem; text-align:left;">DNI</th>
                        <th style="padding:1rem; text-align:left;">Email</th>
                        <th style="padding:1rem; text-align:right;">Acciones</th>
                    </tr>
                </thead>
                <tbody>
        `;

        patients.forEach(p => {
            html += `
                <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:1rem;"><strong>${p.name || '-'} ${p.lastname || ''}</strong></td>
                    <td style="padding:1rem;">${p.dni || '-'}</td>
                    <td style="padding:1rem;">${p.email || '-'}</td>
                    <td style="padding:1rem; text-align:right;">
                        <button class="btn btn-primary btn-sm btn-view-patient" data-id="${p.id}">
                            <i class="fas fa-eye"></i> Ver / Editar
                        </button>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        patientsResults.innerHTML = html;

        document.querySelectorAll('.btn-view-patient').forEach(btn => {
            btn.addEventListener('click', () => openPatientModal(btn.dataset.id));
        });
    }

    async function openPatientModal(patientId) {
        // 1. Load Patient Data
        try {
            const pDoc = await getDoc(doc(db, "patients", patientId));
            if (!pDoc.exists()) return alert("Paciente no encontrado");
            const pData = pDoc.data();

            document.getElementById('p-id').value = patientId;
            document.getElementById('p-name').value = pData.name || '';
            document.getElementById('p-lastname').value = pData.lastname || '';
            document.getElementById('p-dni').value = pData.dni || '';
            document.getElementById('p-email').value = pData.email || '';
            document.getElementById('p-phone').value = pData.phone || '';
            document.getElementById('p-insurance').value = pData.insurance || '';

            // 2. Load History
            loadPatientHistory(pData.email);

            patientModal.style.display = 'flex';
        } catch (e) {
            console.error(e);
            alert("Error al cargar paciente");
        }
    }

    async function loadPatientHistory(email) {
        const listContainer = document.getElementById('p-history-list');
        listContainer.innerHTML = '<div style="padding:1rem; text-align:center;">Cargando historial...</div>';

        if (!email) {
            listContainer.innerHTML = '<div style="padding:1rem; color:#666;">El paciente no tiene email registrado para buscar historial.</div>';
            return;
        }

        try {
            const q = query(collection(db, "appointments"), where("patientEmail", "==", email)); // Index required?
            const snapshot = await getDocs(q);
            const appts = [];
            snapshot.forEach(doc => appts.push({ id: doc.id, ...doc.data() }));

            // Sort by date desc
            appts.sort((a, b) => {
                const dA = new Date(a.date + 'T' + a.time);
                const dB = new Date(b.date + 'T' + b.time);
                return dB - dA;
            });

            if (appts.length === 0) {
                listContainer.innerHTML = '<div style="padding:1rem; text-align:center;">Sin turnos registrados.</div>';
                return;
            }

            listContainer.innerHTML = appts.map(a => {
                const isUpcoming = new Date(a.date + 'T' + a.time) > new Date();
                const style = isUpcoming ? 'border-left: 4px solid #0ea5e9;' : 'border-left: 4px solid #cbd5e1; opacity:0.8;';

                return `
                    <div style="background:white; padding:0.8rem; margin-bottom:0.5rem; border-radius:4px; box-shadow:0 1px 2px rgba(0,0,0,0.05); ${style}">
                        <div style="font-weight:600; font-size:0.9rem;">${a.date.split('-').reverse().join('/')} - ${a.time} hs</div>
                        <div style="font-size:0.85rem; color:#666;">Dr/a. ${a.doctor === 'secondi' ? 'Secondi' : 'Capparelli'}</div>
                        <div style="font-size:0.8rem; margin-top:0.25rem;">Estado: <strong>${a.status || 'Confirmado'}</strong></div>
                        ${a.status === 'cancelled' ? `<div style="font-size:0.75rem; color:red;">Cancelado el: ${a.cancellationDate ? new Date(a.cancellationDate.seconds * 1000).toLocaleDateString() : '-'}</div>` : ''}
                    </div>
                `;
            }).join('');

        } catch (e) {
            console.error(e);
            listContainer.innerHTML = '<div style="color:red; padding:1rem;">Error cargando historial (puede faltar índice). Revisa la consola.</div>';
        }
    }

    patientEditForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('p-id').value;
        const data = {
            name: document.getElementById('p-name').value,
            lastname: document.getElementById('p-lastname').value,
            dni: document.getElementById('p-dni').value,
            phone: document.getElementById('p-phone').value,
            insurance: document.getElementById('p-insurance').value
        };
        // Email is readonly to avoid auth mismatch issues for now

        try {
            await updateDoc(doc(db, "patients", id), data);
            alert("Datos actualizados correctamente.");
            // Optional: Refresh search results or modal
        } catch (e) {
            console.error(e);
            alert("Error al actualizar.");
        }
    });

});

const header = document.createElement('div');
header.className = 'day-header';
header.innerHTML = `${controlsDiv}<span>${capitalize(dayName)}</span><small>${dayNum}</small>`;
col.appendChild(header);

const slotsContainer = document.createElement('div');
slotsContainer.className = 'slots-column';

const rule = scheduleRules[dayOfWeek];

if (!rule || !rule.active || !rule.start || !rule.end) {
    slotsContainer.innerHTML = '<div style="padding:1rem; text-align:center; color:#ccc; font-size:0.9rem;">No atiende</div>';
} else {
    const [startH, startM] = rule.start.split(':').map(Number);
    const [endH, endM] = rule.end.split(':').map(Number);

    let slotTime = new Date(dateStr + 'T00:00:00');
    slotTime.setHours(startH, startM, 0, 0);
    const slotEndTime = new Date(dateStr + 'T00:00:00');
    slotEndTime.setHours(endH, endM, 0, 0);

    // Safety limit
    let iterations = 0;
    while (slotTime < slotEndTime && iterations < 100) {
        iterations++;
        const timeStr = slotTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

        const slotDiv = document.createElement('div');
        slotDiv.className = 'time-slot';
        slotDiv.style.cursor = 'pointer';

        const appt = appointmentsMap[dateStr] && appointmentsMap[dateStr][timeStr];

        if (appt) {
            const isBlocked = appt.status === 'blocked';
            slotDiv.classList.add('taken');
            if (isBlocked) {
                slotDiv.style.background = '#fee2e2';
                slotDiv.style.color = '#b91c1c';
            }

            slotDiv.style.minHeight = '60px';
            slotDiv.innerHTML = `
                                <strong>${timeStr}</strong><br>
                                ${isBlocked ? 'BLOQUEADO' : (appt.patientName ? appt.patientName.split(' ')[0] : 'Ocupado')}
                            `;
            slotDiv.onclick = () => openEditModal(appt);
        } else {
            slotDiv.textContent = timeStr;
            slotDiv.onclick = () => openAddModal(timeStr, dateStr);
        }

        slotsContainer.appendChild(slotDiv);
        slotTime.setMinutes(slotTime.getMinutes() + intervalMinutes);
    }
}

col.appendChild(slotsContainer);
calendarGrid.appendChild(col);
    });

} catch (error) {
    console.error("Week view critical error", error);
    calendarGrid.innerHTML = `<div style="padding: 2rem; color:red; grid-column:1/-1;">Error crítico: ${error.message}</div>`;
}
    }

async function getAppointmentsForWeek(doctorId, dates) {
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    // Use client-side filtering to avoid index issues for now
    try {
        const q = query(collection(db, "appointments"), where("doctor", "==", doctorId));
        const snap = await getDocs(q);

        const map = {};
        snap.forEach(doc => {
            const data = { id: doc.id, ...doc.data() };
            // Filter by date range locally
            if (data.date >= startDate && data.date <= endDate) {
                if (!map[data.date]) map[data.date] = {};
                map[data.date][data.time] = data;
            }
        });
        return map;
    } catch (e) {
        console.error("Fetch appointments failed", e);
        throw e;
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
// --- PATIENTS VIEW LOGIC ---

const tabPatients = document.getElementById('tab-patients');
const viewPatients = document.getElementById('view-patients');
const patientSearchInput = document.getElementById('patient-search-input');
const patientSearchBtn = document.getElementById('patient-search-btn');
const patientsResults = document.getElementById('patients-results');
const patientModal = document.getElementById('patient-modal');
const patientEditForm = document.getElementById('patient-edit-form');

if (tabPatients) {
    tabPatients.addEventListener('click', () => switchView('patients'));
}

if (patientSearchBtn) {
    patientSearchBtn.addEventListener('click', () => {
        const queryText = patientSearchInput.value.trim();
        if (queryText) searchPatients(queryText);
    });
    patientSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') patientSearchBtn.click();
    });
}

function switchView(viewName) {
    // Reset ALL
    viewDaily.style.display = 'none';
    viewWeekly.style.display = 'none';
    viewRecurrence.style.display = 'none';
    viewConfig.style.display = 'none';
    if (viewPatients) viewPatients.style.display = 'none';

    [tabDaily, tabWeekly, tabRecurrence, tabConfig, tabPatients].forEach(t => {
        if (t) {
            t.classList.remove('active', 'btn-primary');
            t.classList.add('btn-outline');
        }
    });

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
    } else if (viewName === 'recurrence') {
        viewRecurrence.style.display = 'block';
        tabRecurrence.classList.add('active');
        tabRecurrence.classList.remove('btn-outline');
        loadScheduleConfig();
    } else if (viewName === 'config') {
        viewConfig.style.display = 'block';
        tabConfig.classList.add('active');
        tabConfig.classList.remove('btn-outline');
        loadScheduleConfig();
    } else if (viewName === 'patients') {
        viewPatients.style.display = 'block';
        tabPatients.classList.add('active');
        tabPatients.classList.remove('btn-outline');
    }
}

async function searchPatients(queryText) {
    patientsResults.innerHTML = '<div style="padding:2rem; text-align:center;">Buscando...</div>';
    try {
        // Ideally we use a proper search index, but for now we fetch all and filter client-side 
        // OR use startAt/endAt for simple prefix search on Name if supported.
        // Given Firestore limitations, let's fetch 'patients' collection. 
        // Warning: If many patients, this is costly. Implementing "Client Side Filter" approach for < 1000 users.

        const q = query(collection(db, "patients")); // Get all for now (MVP optimization)
        const snapshot = await getDocs(q);

        const matches = [];
        const lowerQ = queryText.toLowerCase();

        snapshot.forEach(doc => {
            const data = doc.data();
            const fullName = `${data.name || ''} ${data.lastname || ''}`.toLowerCase();
            const dni = (data.dni || '').toString();

            if (fullName.includes(lowerQ) || dni.includes(lowerQ)) {
                matches.push({ id: doc.id, ...data });
            }
        });

        renderPatientResults(matches);
    } catch (e) {
        console.error("Search error:", e);
        patientsResults.innerHTML = `<div style="color:red; padding:2rem;">Error al buscar: ${e.message}</div>`;
    }
}

function renderPatientResults(patients) {
    if (patients.length === 0) {
        patientsResults.innerHTML = '<div style="padding:2rem; text-align:center;">No se encontraron pacientes.</div>';
        return;
    }

    let html = `
            <table style="width:100%; border-collapse:collapse;">
                <thead style="background:#f8f9fa; border-bottom:2px solid #eee;">
                    <tr>
                        <th style="padding:1rem; text-align:left;">Nombre</th>
                        <th style="padding:1rem; text-align:left;">DNI</th>
                        <th style="padding:1rem; text-align:left;">Email</th>
                        <th style="padding:1rem; text-align:right;">Acciones</th>
                    </tr>
                </thead>
                <tbody>
        `;

    patients.forEach(p => {
        html += `
                <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:1rem;"><strong>${p.name || '-'} ${p.lastname || ''}</strong></td>
                    <td style="padding:1rem;">${p.dni || '-'}</td>
                    <td style="padding:1rem;">${p.email || '-'}</td>
                    <td style="padding:1rem; text-align:right;">
                        <button class="btn btn-primary btn-sm btn-view-patient" data-id="${p.id}">
                            <i class="fas fa-eye"></i> Ver / Editar
                        </button>
                    </td>
                </tr>
            `;
    });

    html += '</tbody></table>';
    patientsResults.innerHTML = html;

    document.querySelectorAll('.btn-view-patient').forEach(btn => {
        btn.addEventListener('click', () => openPatientModal(btn.dataset.id));
    });
}

async function openPatientModal(patientId) {
    // 1. Load Patient Data
    try {
        const pDoc = await getDoc(doc(db, "patients", patientId));
        if (!pDoc.exists()) return alert("Paciente no encontrado");
        const pData = pDoc.data();

        document.getElementById('p-id').value = patientId;
        document.getElementById('p-name').value = pData.name || '';
        document.getElementById('p-lastname').value = pData.lastname || '';
        document.getElementById('p-dni').value = pData.dni || '';
        document.getElementById('p-email').value = pData.email || '';
        document.getElementById('p-phone').value = pData.phone || '';
        document.getElementById('p-insurance').value = pData.insurance || '';

        // 2. Load History
        loadPatientHistory(pData.email);

        patientModal.style.display = 'flex';
    } catch (e) {
        console.error(e);
        alert("Error al cargar paciente");
    }
}

async function loadPatientHistory(email) {
    const listContainer = document.getElementById('p-history-list');
    listContainer.innerHTML = '<div style="padding:1rem; text-align:center;">Cargando historial...</div>';

    if (!email) {
        listContainer.innerHTML = '<div style="padding:1rem; color:#666;">El paciente no tiene email registrado para buscar historial.</div>';
        return;
    }

    try {
        const q = query(collection(db, "appointments"), where("patientEmail", "==", email)); // Index required?
        const snapshot = await getDocs(q);
        const appts = [];
        snapshot.forEach(doc => appts.push({ id: doc.id, ...doc.data() }));

        // Sort by date desc
        appts.sort((a, b) => {
            const dA = new Date(a.date + 'T' + a.time);
            const dB = new Date(b.date + 'T' + b.time);
            return dB - dA;
        });

        if (appts.length === 0) {
            listContainer.innerHTML = '<div style="padding:1rem; text-align:center;">Sin turnos registrados.</div>';
            return;
        }

        listContainer.innerHTML = appts.map(a => {
            const isUpcoming = new Date(a.date + 'T' + a.time) > new Date();
            const style = isUpcoming ? 'border-left: 4px solid #0ea5e9;' : 'border-left: 4px solid #cbd5e1; opacity:0.8;';

            return `
                    <div style="background:white; padding:0.8rem; margin-bottom:0.5rem; border-radius:4px; box-shadow:0 1px 2px rgba(0,0,0,0.05); ${style}">
                        <div style="font-weight:600; font-size:0.9rem;">${a.date.split('-').reverse().join('/')} - ${a.time} hs</div>
                        <div style="font-size:0.85rem; color:#666;">Dr/a. ${a.doctor === 'secondi' ? 'Secondi' : 'Capparelli'}</div>
                        <div style="font-size:0.8rem; margin-top:0.25rem;">Estado: <strong>${a.status || 'Confirmado'}</strong></div>
                        ${a.status === 'cancelled' ? `<div style="font-size:0.75rem; color:red;">Cancelado el: ${a.cancellationDate ? new Date(a.cancellationDate.seconds * 1000).toLocaleDateString() : '-'}</div>` : ''}
                    </div>
                `;
        }).join('');

    } catch (e) {
        console.error(e);
        listContainer.innerHTML = '<div style="color:red; padding:1rem;">Error cargando historial (puede faltar índice). Revisa la consola.</div>';
    }
}

patientEditForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('p-id').value;
    const data = {
        name: document.getElementById('p-name').value,
        lastname: document.getElementById('p-lastname').value,
        dni: document.getElementById('p-dni').value,
        phone: document.getElementById('p-phone').value,
        insurance: document.getElementById('p-insurance').value
    };
    // Email is readonly to avoid auth mismatch issues for now

    try {
        await updateDoc(doc(db, "patients", id), data);
        alert("Datos actualizados correctamente.");
        // Optional: Refresh search results or modal
    } catch (e) {
        console.error(e);
        alert("Error al actualizar.");
    }
});

});

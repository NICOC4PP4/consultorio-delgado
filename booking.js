/* Booking Logic with Firebase - Weekly View */
import { db, auth } from './firebase-config.js';
import {
    collection,
    query,
    where,
    getDocs,
    addDoc,
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// DOM Elements
// DOM Elements (Initialized in DOMContentLoaded)
let calendarGrid, currentWeekLabel, prevWeekBtn, nextWeekBtn, selectedSlotDisplay, selectedSlotInput, submitBtn;
let form = null;

if (typeof document !== 'undefined') {
    // Attempt early bind, but re-bind in DOMContentLoaded is safer
    form = document.forms['turno-secondi'] || document.forms['turno-capparelli'];
}

// Auth State
let currentUser = null;

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        // Pre-fill Form
        try {
            const docSnap = await getDoc(doc(db, "patients", user.uid));
            // Ensure form is available (if auth loads fast)
            if (!form && typeof document !== 'undefined') {
                form = document.forms['turno-secondi'] || document.forms['turno-capparelli'];
            }

            if (docSnap.exists() && form) {
                const data = docSnap.data();

                // Autofill
                if (form.nombre) form.nombre.value = data.firstName || '';
                if (form.apellido) form.apellido.value = data.lastName || '';
                if (form.email) form.email.value = data.email || user.email || '';
                if (form.telefono) form.telefono.value = data.phone || '';
                if (form.cobertura) form.cobertura.value = data.insurance || '';
                if (form.dni) form.dni.value = data.dni || '';
                if (form.sexo) form.sexo.value = data.gender || '';

                // Dr. Secondi Specific Autofill
                if (form.primera_vez && data.isReturningPatient_secondi && doctorId === 'secondi') {
                    form.primera_vez.value = "No";
                }

                // Dr. Capparelli Specific Autofill
                if (form.primera_vez && data.isReturningPatient_capparelli && doctorId === 'capparelli') {
                    form.primera_vez.value = "No";
                }

                // Validation
                const requiredFields = ['firstName', 'lastName', 'email', 'phone', 'insurance', 'dni', 'gender'];
                const missing = requiredFields.some(field => !data[field]);

                const warningBox = document.getElementById('profile-warning');
                const submitButton = document.getElementById('submit-btn');

                if (missing) {
                    if (warningBox) warningBox.style.display = 'block';
                    if (submitButton) {
                        submitButton.disabled = true;
                        submitButton.title = "Complete su perfil para reservar";
                    }
                } else {
                    if (warningBox) warningBox.style.display = 'none';
                    // Enable submit only if slot is selected (logic elsewhere handles this usually, 
                    // but we ensure it's not disabled by profile check)
                    // We leave it disabled by default until slot selection? 
                    // Usually submit is disabled until slot selected. 
                    // We just ensure we don't BLOCK it if slot is selected later.
                    // Actually, let's leave it to the slot selection logic to enable it, 
                    // but if missing profile data, we should probably force disable.
                    // For now, if missing, we disable. If not missing, we don't interfere (let slot logic handle).
                }
            } else {
                // No profile doc? 
                const warningBox = document.getElementById('profile-warning');
                if (warningBox) warningBox.style.display = 'block';
            }
        } catch (e) {
            console.error("Error auto-filling form", e);
        }
    } else {
        // Not Logged In -> Redirect
        // Store current URL to redirect back after login
        window.location.href = 'login-paciente.html?redirect=turnos.html';
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // Initialize DOM Elements
    calendarGrid = document.getElementById('calendar-grid');
    currentWeekLabel = document.getElementById('current-week-label');
    prevWeekBtn = document.getElementById('prev-week');
    nextWeekBtn = document.getElementById('next-week');
    selectedSlotDisplay = document.getElementById('slot-display');
    selectedSlotInput = document.getElementById('selected-slot');
    submitBtn = document.getElementById('submit-btn');

    // Re-query form to be safe
    if (!form) {
        form = document.forms['turno-secondi'] || document.forms['turno-capparelli'];
    }

    // Identify Doctor
    const formName = form ? form.name : '';
    const doctorId = formName.includes('secondi') ? 'secondi' : 'capparelli';

    // Configuration
    const intervalMinutes = 20;

    // State
    // Calculate start date (Next week if weekend, or current week if Mon-Fri)
    let initialDate = new Date();
    if (initialDate.getDay() === 0 || initialDate.getDay() === 6) {
        // If weekend, move to next Monday
        const daysToAdd = initialDate.getDay() === 6 ? 2 : 1;
        initialDate.setDate(initialDate.getDate() + daysToAdd);
    }

    let currentMonday = getStartOfWeek(initialDate);
    // Min date is slightly complex: if we moved to next week automatically, we might want to prevent going back to "this" empty week.
    // But simplest is: lock to the week we decided is the "start".
    const minDate = new Date(currentMonday);

    // Init
    initCalendar();

    function initCalendar() {
        renderWeek(currentMonday);

        prevWeekBtn.addEventListener('click', () => changeWeek(-1));
        nextWeekBtn.addEventListener('click', () => changeWeek(1));
    }

    function getStartOfWeek(d) {
        d = new Date(d);
        var day = d.getDay(),
            diff = d.getDate() - day + (day == 0 ? -6 : 1); // adjust when day is sunday
        d.setDate(diff);
        d.setHours(0, 0, 0, 0); // Normalize time
        return d;
    }

    function changeWeek(offset) {
        const newDate = new Date(currentMonday);
        newDate.setDate(newDate.getDate() + (offset * 7));

        // Prevent going back past minDate
        if (offset < 0 && newDate < minDate) return;

        // Prevent going forward too much (loose 21 day cap just in case)
        const today = new Date();
        const maxForwardDate = new Date(today);
        maxForwardDate.setDate(today.getDate() + 21);
        if (offset > 0 && newDate > maxForwardDate) return;

        currentMonday = newDate;
        renderWeek(currentMonday);
    }

    async function renderWeek(mondayDate) {
        // Update Label
        const fridayDate = new Date(mondayDate);
        fridayDate.setDate(mondayDate.getDate() + 4);

        const options = { day: 'numeric', month: 'numeric' };
        currentWeekLabel.textContent = `Semana del ${mondayDate.toLocaleDateString('es-AR', options)} al ${fridayDate.toLocaleDateString('es-AR', options)}`;

        // Clear Grid
        calendarGrid.innerHTML = '<div style="padding: 2rem; text-align: center; grid-column: 1/-1;">Cargando disponibilidad...</div>';

        // 1. Fetch Doctor Schedule Rules
        let scheduleRules = {
            // Default Fallback
            1: { active: true, start: "14:00", end: "18:00" },
            2: { active: true, start: "14:00", end: "18:00" },
            3: { active: true, start: "14:00", end: "18:00" },
            4: { active: true, start: "14:00", end: "18:00" },
            5: { active: true, start: "14:00", end: "18:00" }
        };
        let maxDaysLimit = 15;

        try {
            const docSnap = await getDoc(doc(db, "doctor_schedules", doctorId));
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.schedule) scheduleRules = { ...scheduleRules, ...data.schedule };
                if (data.maxBookingDays) maxDaysLimit = parseInt(data.maxBookingDays);
            }
        } catch (e) {
            console.warn("Could not load dynamic schedule, using default.", e);
        }

        // Calculate Max Date based on dynamic limit
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const maxDate = new Date(today);
        maxDate.setDate(today.getDate() + maxDaysLimit);
        const maxDateStr = maxDate.toISOString().split('T')[0];

        // Hide/Disable Buttons using the new maxDate
        prevWeekBtn.style.visibility = mondayDate <= minDate ? 'hidden' : 'visible';

        const nextMonday = new Date(mondayDate);
        nextMonday.setDate(nextMonday.getDate() + 7);
        if (nextMonday > maxDate) {
            nextWeekBtn.style.visibility = 'hidden';
        } else {
            nextWeekBtn.style.visibility = 'visible';
        }

        try {
            // 2. Generate dates
            const weekDates = [];
            let tempDate = new Date(mondayDate);
            for (let i = 0; i < 5; i++) {
                weekDates.push(tempDate.toISOString().split('T')[0]);
                tempDate.setDate(tempDate.getDate() + 1);
            }

            // 3. Fetch taken slots
            const takenSlotsMap = await getTakenSlotsForWeek(weekDates);

            // 4. Clear Loading
            calendarGrid.innerHTML = '';

            const todayStr = new Date().toISOString().split('T')[0];

            // 5. Render Columns
            weekDates.forEach(dateStr => {
                const dateObj = new Date(dateStr + 'T00:00:00');
                const dayName = dateObj.toLocaleDateString('es-AR', { weekday: 'long' });
                const dayNum = dateObj.getDate();
                const dayOfWeek = dateObj.getDay(); // 1=Mon, 5=Fri

                const col = document.createElement('div');
                col.className = 'day-column';

                // Header
                const header = document.createElement('div');
                header.className = 'day-header';
                header.innerHTML = `<span>${capitalize(dayName)}</span><small>${dayNum}</small>`;
                col.appendChild(header);

                // Slots Container
                const slotsContainer = document.createElement('div');
                slotsContainer.className = 'slots-column';

                // CHECK RESTRICTION
                // If this specific date is beyond maxDate, show "No disponible yet" or simply empty
                // User requirement: "solo se pueda sacar turno si es un paciente en los proximos 15 dias"
                if (dateStr > maxDateStr) {
                    slotsContainer.innerHTML = '<div style="padding:1rem; text-align:center; color:#ccc; font-size:0.8rem; font-style:italic;">Aún no habilitado</div>';
                    col.appendChild(slotsContainer);
                    calendarGrid.appendChild(col);
                    return; // Skip generation
                }

                const rule = scheduleRules[dayOfWeek];

                if (!rule || !rule.active) {
                    // Closed/Inactive Day
                    slotsContainer.innerHTML = '<div style="padding:1rem; text-align:center; color:#ccc; font-size:0.9rem;">No atiende</div>';
                } else {
                    // Generate Slots based on Rule
                    const [startH, startM] = rule.start.split(':').map(Number);
                    const [endH, endM] = rule.end.split(':').map(Number);

                    let slotTime = new Date(dateStr + 'T00:00:00');
                    slotTime.setHours(startH, startM, 0, 0);

                    const slotEndTime = new Date(dateStr + 'T00:00:00');
                    slotEndTime.setHours(endH, endM, 0, 0);

                    const isPast = dateStr < todayStr; // Simplified past check (whole day)

                    while (slotTime < slotEndTime) {
                        const timeStr = slotTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

                        const btn = document.createElement('div');
                        btn.className = 'time-slot';
                        btn.textContent = timeStr;

                        const isTaken = takenSlotsMap[dateStr] && takenSlotsMap[dateStr].includes(timeStr);

                        // Specific logic for today timestamps could be added here

                        if (isPast || isTaken) {
                            btn.classList.add('taken');
                        } else {
                            btn.addEventListener('click', () => selectWeekSlot(btn, dateStr, timeStr));
                        }

                        slotsContainer.appendChild(btn);
                        slotTime.setMinutes(slotTime.getMinutes() + intervalMinutes);
                    }
                }

                col.appendChild(slotsContainer);
                calendarGrid.appendChild(col);
            });

        } catch (error) {
            console.error("Error rendering week:", error);
            calendarGrid.innerHTML = `<div style="padding: 2rem; text-align: center; color: red; grid-column: 1/-1;">
                Error al cargar disponibilidad.<br>
                <small>${error.message}</small>
            </div>`;
        }
    }

    function capitalize(s) {
        return s && s[0].toUpperCase() + s.slice(1);
    }

    async function getTakenSlotsForWeek(dates) {
        // Range query
        const startDate = dates[0];
        const endDate = dates[dates.length - 1];

        // IMPORTANT: Firestore requires an index for compound queries.
        // If this fails, check console for the index creation link.
        // Fallback: Query ONLY by doctor and filter client-side if index is missing

        try {
            const q = query(
                collection(db, "appointments"),
                where("doctor", "==", doctorId),
                where("date", ">=", startDate),
                where("date", "<=", endDate)
            );

            const querySnapshot = await getDocs(q);
            const map = {};

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                // Filter out cancelled appointments
                if (data.status !== 'cancelled') {
                    if (!map[data.date]) map[data.date] = [];
                    map[data.date].push(data.time);
                }
            });

            return map;
        } catch (e) {
            console.warn("Compound query failed (likely missing index). Falling back to simpler query.", e);
            // Fallback: Fetch all future appointments for doctor (or just by doctor and filter locally)
            // Ideally we should create the index, but for immediate fix:
            const q = query(
                collection(db, "appointments"),
                where("doctor", "==", doctorId)
            );
            const querySnapshot = await getDocs(q);
            const map = {};
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                if (data.date >= startDate && data.date <= endDate) {
                    // Filter out cancelled appointments
                    if (data.status !== 'cancelled') {
                        if (!map[data.date]) map[data.date] = [];
                        map[data.date].push(data.time);
                    }
                }
            });
            return map;
        }
    }

    function selectWeekSlot(btn, dateStr, timeStr) {
        document.querySelectorAll('.time-slot').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        selectedSlotInput.value = `${dateStr} ${timeStr}`;
        selectedSlotDisplay.textContent = `Turno seleccionado: ${dateStr} a las ${timeStr}hs`;

        if (submitBtn) {
            submitBtn.disabled = false;
        }

        form.dataset.date = dateStr;
        form.dataset.time = timeStr;
    }

    // --- SUBMISSION LOGIC ---

    if (typeof document !== 'undefined') {
        const localSubmitBtn = document.getElementById('submit-btn');

        console.log("Checking for submit button:", localSubmitBtn);
        console.log("Checking for form:", form);

        if (localSubmitBtn && form) {
            console.log("Replacing submit listener with direct click listener");

            // Clone to strip old listeners
            const newSubmitBtn = localSubmitBtn.cloneNode(true);
            localSubmitBtn.parentNode.replaceChild(newSubmitBtn, localSubmitBtn);

            // CRITICAL FIX: Update global reference so selectWeekSlot enables the REAL button
            submitBtn = newSubmitBtn;

            // Validate references after replace
            console.log("New submit button reference:", newSubmitBtn);

            newSubmitBtn.addEventListener('click', async function (event) {
                event.preventDefault(); // Stop any form default
                console.log("🟢 BUTTON CLICKED - Starting Submission Process");

                const btn = newSubmitBtn;
                const originalText = btn.innerText;

                // 1. Initial Checks
                console.log("1. Checking slot selection...");
                if (!selectedSlotInput.value) {
                    console.warn("❌ No slot selected");
                    alert("Por favor, selecciona un horario disponible.");
                    return;
                }
                console.log("✅ Slot selected:", selectedSlotInput.value);

                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';

                const formData = new FormData(form);
                const cleanDate = form.dataset.date;
                const cleanTime = form.dataset.time;
                console.log("Data to submit:", { cleanDate, cleanTime });

                if (!cleanDate || !cleanTime) {
                    console.error("❌ Missing date/time in dataset");
                    alert("Error: No se ha seleccionado fecha u hora.");
                    btn.disabled = false;
                    btn.innerText = "Confirmar Solicitud";
                    return;
                }

                // 2. Auth Check
                console.log("2. Checking Auth...");
                if (!currentUser) {
                    console.warn("❌ User not logged in");
                    alert("Debes iniciar sesión.");
                    btn.disabled = false;
                    btn.innerText = "Confirmar Solicitud";
                    return;
                }
                console.log("✅ User logged in:", currentUser.uid);

                // 3. Strict Profile Check
                try {
                    console.log("3. Validating profile for:", currentUser.uid);
                    const docSnap = await getDoc(doc(db, "patients", currentUser.uid));

                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        const requiredFields = ['firstName', 'lastName', 'email', 'phone', 'insurance', 'dni', 'gender'];
                        const missing = requiredFields.filter(field => {
                            const val = data[field];
                            return val === null || val === undefined || String(val).trim() === '';
                        });

                        // New Fields Validation (Strict)
                        const motivo = formData.get('motivo_consulta');
                        const primeraVez = formData.get('primera_vez');

                        // Validate specific to doctor
                        if (doctorId === 'secondi' && !motivo) missing.push("Tipo de Consulta");

                        // Validate for both if element exists in form (checked via formData)
                        // If the field exists in DOM but not selected, formData usually has it as empty string if required or not present if disabled selected empty
                        if (form.primera_vez && (!primeraVez || primeraVez === '')) {
                            missing.push("¿Es primera vez?");
                        }

                        if (doctorId === 'secondi' && (form.motivo_consulta && (!motivo || motivo === ''))) {
                            missing.push("Tipo de Consulta");
                        }

                        if (missing.length > 0) {
                            console.warn("❌ Missing profile fields:", missing);
                            alert(`Faltan datos en tu perfil: ${missing.join(', ')}. Por favor complétalos.`);
                            window.location.href = 'perfil-paciente.html';
                            return;
                        }
                        console.log("✅ Profile valid");
                    } else {
                        console.warn("❌ Profile document not found");
                        alert("Perfil no encontrado. Por favor completa tu registro.");
                        window.location.href = 'perfil-paciente.html';
                        return;
                    }
                } catch (err) {
                    console.error("❌ Profile validation error", err);
                    alert("Error validando perfil: " + (err.message || err));
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                    return;
                }

                // 4. Booking
                try {
                    console.log("4. Checking active appointments limit...");
                    const activeApptsCount = await checkActiveAppointmentsLimit(currentUser.email);
                    if (activeApptsCount >= 3) {
                        console.warn("❌ Limit reached:", activeApptsCount);
                        alert("Ya tenés 3 turnos vigentes. Cancelá alguno antes de sacar otro.");
                        btn.disabled = false;
                        btn.innerHTML = originalText;
                        return;
                    }

                    console.log("5. Checking slot availability...");
                    const isTaken = await checkSlotTaken(cleanDate, cleanTime);
                    if (isTaken) {
                        console.warn("❌ Slot taken");
                        alert("Lo sentimos, este turno acaba de ser reservado por otra persona.");
                        btn.disabled = false;
                        btn.innerHTML = originalText;
                        renderWeek(currentMonday);
                        return;
                    }
                    console.log("✅ Slot available");

                    // Extra fields for Secondi
                    const motivo = formData.get('motivo_consulta') || 'Consulta General';
                    const primeraVez = formData.get('primera_vez') || 'No especificado';

                    // Logic to update patient profile if they say "No" to first time (meaning they are returning)
                    // We only do this for Secondi relevant logic, but good to store general "returning" status?
                    // User request: "cuando clickea primera vez no, que lo guarde... y lo copie la proxima vez"
                    if (doctorId === 'secondi' && primeraVez === 'No') {
                        try {
                            const userRef = doc(db, "patients", currentUser.uid);
                            await setDoc(userRef, { isReturningPatient_secondi: true }, { merge: true });
                            console.log("✅ Updated patient profile as Returning for Secondi");
                        } catch (err) {
                            console.warn("Could not update patient return status", err);
                        }
                    }

                    if (doctorId === 'capparelli' && primeraVez === 'No') {
                        try {
                            const userRef = doc(db, "patients", currentUser.uid);
                            await setDoc(userRef, { isReturningPatient_capparelli: true }, { merge: true });
                            console.log("✅ Updated patient profile as Returning for Capparelli");
                        } catch (err) {
                            console.warn("Could not update patient return status", err);
                        }
                    }

                    console.log("5. Saving to Firestore...");
                    await addDoc(collection(db, "appointments"), {
                        doctor: doctorId,
                        date: cleanDate,
                        time: cleanTime,
                        patientName: formData.get('nombre') + ' ' + formData.get('apellido'),
                        patientEmail: formData.get('email'),
                        patientPhone: formData.get('telefono'),
                        insurance: formData.get('cobertura'),
                        status: 'confirmed',
                        timestamp: new Date(),
                        patientUid: currentUser.uid,
                        // New Fields
                        consultationType: motivo,
                        isFirstTime: primeraVez
                    });
                    console.log("✅ Firestore save successful");

                    // Email Logic
                    try {
                        console.log("6. Sending Email...");
                        const EMAILJS_PUBLIC_KEY = "yp2cTT12Ti6VmL4iN";
                        const EMAILJS_SERVICE_ID = "service_0wgkq1l";
                        const EMAILJS_TEMPLATE_ID = "template_zkapdb6";

                        if (typeof emailjs !== 'undefined') {
                            emailjs.init(EMAILJS_PUBLIC_KEY);
                            const doctorNamePretty = doctorId === 'secondi' ? 'Dra. Secondi' : 'Dr. Capparelli';
                            emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
                                email: formData.get('email'),
                                to_name: formData.get('nombre') + ' ' + formData.get('apellido'),
                                doctor_name: doctorNamePretty,
                                date_time: `${cleanDate} ${cleanTime}`
                            });
                            console.log("✅ Email sent command issued");
                        } else {
                            console.warn("⚠️ EmailJS not found");
                        }
                    } catch (e) { console.warn("Email error (non-fatal)", e); }

                    console.log("🚀 Redirecting to gracias.html");
                    window.location.href = 'gracias.html';

                } catch (error) {
                    console.error("❌ CRTICAL ERROR during booking:", error);
                    alert("Hubo un error al procesar el turno: " + error.message);
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                }
            });
        } else {
            console.error("❌ Submit button or Form NOT found in DOM. Button:", localSubmitBtn, "Form:", form);
        }
    }

    async function checkActiveAppointmentsLimit(email) {
        const todayStr = new Date().toISOString().split('T')[0];

        // Query user's appointments
        // Ideally compound query: where email==email AND date>=today AND status!=cancelled
        // But Firestore requires index. We fetch by email and filter locally which is safe for this scale.
        const q = query(
            collection(db, "appointments"),
            where("patientEmail", "==", email)
        );

        const snap = await getDocs(q);
        let activeCount = 0;

        snap.forEach(doc => {
            const data = doc.data();
            // Check if "active":
            // 1. Not cancelled
            // 2. Not attended (future proofing as requested)
            // 3. Date is today or future

            const isActiveStatus = data.status !== 'cancelled' && data.status !== 'attended';
            const isFutureOrToday = data.date >= todayStr;

            if (isActiveStatus && isFutureOrToday) {
                activeCount++;
            }
        });

        return activeCount;
    }

    async function checkSlotTaken(date, time) {
        const q = query(
            collection(db, "appointments"),
            where("doctor", "==", doctorId),
            where("date", "==", date),
            where("time", "==", time)
        );
        const snap = await getDocs(q);

        // Check if any finding is NOT cancelled
        // If empty, it's free. If not empty, we check if all are cancelled (unlikely duplicates, but safe)
        if (snap.empty) return false;

        let taken = false;
        snap.forEach(doc => {
            const data = doc.data();
            if (data.status !== 'cancelled') {
                taken = true;
            }
        });
        return taken;
    }
});

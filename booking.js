/* Booking Logic with Firebase - Weekly View */
import { db } from './firebase-config.js';
import { collection, query, where, getDocs, addDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const calendarGrid = document.getElementById('calendar-grid');
    const selectedSlotInput = document.getElementById('selected-slot');
    const slotDisplay = document.getElementById('slot-display');
    const submitBtn = document.getElementById('submit-btn');
    const form = document.querySelector('form');
    const prevWeekBtn = document.getElementById('prev-week');
    const nextWeekBtn = document.getElementById('next-week');
    const currentWeekLabel = document.getElementById('current-week-label');

    // Identify Doctor
    const formName = form ? form.name : '';
    const doctorId = formName.includes('secondi') ? 'secondi' : 'capparelli';

    // Configuration
    const startHour = 14;
    const endHour = 18;
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

        // Calculate Max Date (15 days from today)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const maxDate = new Date(today);
        maxDate.setDate(today.getDate() + 15);
        const maxDateStr = maxDate.toISOString().split('T')[0];

        // Hide/Disable Buttons based on limits
        prevWeekBtn.style.visibility = mondayDate <= minDate ? 'hidden' : 'visible';

        // Disable next if next Monday is beyond maxDate (or reasonably close)
        // If the start of next week is > maxDate, block logic
        const nextMonday = new Date(mondayDate);
        nextMonday.setDate(nextMonday.getDate() + 7);
        if (nextMonday > maxDate) {
            nextWeekBtn.style.visibility = 'hidden';
        } else {
            nextWeekBtn.style.visibility = 'visible';
        }

        // Clear Grid
        calendarGrid.innerHTML = '<div style="padding: 2rem; text-align: center; grid-column: 1/-1;">Cargando disponibilidad...</div>';

        // 1. Fetch Doctor Schedule Rules
        let scheduleRules = {
            // Default Fallback (Monday=1, Sunday=0)
            1: { active: true, start: "14:00", end: "18:00" },
            2: { active: true, start: "14:00", end: "18:00" },
            3: { active: true, start: "14:00", end: "18:00" },
            4: { active: true, start: "14:00", end: "18:00" },
            5: { active: true, start: "14:00", end: "18:00" }
        };

        try {
            const docSnap = await getDoc(doc(db, "doctor_schedules", doctorId));
            if (docSnap.exists() && docSnap.data().schedule) {
                scheduleRules = { ...scheduleRules, ...docSnap.data().schedule };
            }
        } catch (e) {
            console.warn("Could not load dynamic schedule, using default.", e);
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
                if (!map[data.date]) map[data.date] = [];
                map[data.date].push(data.time);
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
                    if (!map[data.date]) map[data.date] = [];
                    map[data.date].push(data.time);
                }
            });
            return map;
        }
    }

    function selectWeekSlot(btn, dateStr, timeStr) {
        document.querySelectorAll('.time-slot').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        selectedSlotInput.value = `${dateStr} ${timeStr}`;
        slotDisplay.textContent = `Turno seleccionado: ${dateStr} a las ${timeStr}hs`;
        submitBtn.disabled = false;

        form.dataset.date = dateStr;
        form.dataset.time = timeStr;
    }

    // --- SUBMISSION LOGIC ---
    if (form) {
        form.addEventListener('submit', async function (event) {
            event.preventDefault();
            const btn = document.getElementById('submit-btn');
            btn.disabled = true;
            btn.textContent = 'Procesando...';

            const formData = new FormData(form);
            const cleanDate = form.dataset.date;
            const cleanTime = form.dataset.time;

            try {
                // Check if slot was taken just now
                const isTaken = await checkSlotTaken(cleanDate, cleanTime);
                if (isTaken) {
                    alert("Lo sentimos, este turno acaba de ser reservado por otra persona. Por favor elija otro.");
                    btn.disabled = false;
                    btn.textContent = 'Confirmar Solicitud';
                    renderWeek(currentMonday);
                    return;
                }

                // 1. SAVE TO FIREBASE
                await addDoc(collection(db, "appointments"), {
                    doctor: doctorId,
                    date: cleanDate,
                    time: cleanTime,
                    patientName: formData.get('nombre') + ' ' + formData.get('apellido'),
                    patientEmail: formData.get('email'),
                    patientPhone: formData.get('telefono'),
                    insurance: formData.get('cobertura'),
                    status: 'confirmed',
                    timestamp: new Date()
                });

                // 2. SEND EMAIL
                const EMAILJS_PUBLIC_KEY = "yp2cTT12Ti6VmL4iN";
                const EMAILJS_SERVICE_ID = "service_0wgkq1l";
                const EMAILJS_TEMPLATE_ID = "template_zkapdb6";

                if (typeof emailjs !== 'undefined') {
                    emailjs.init(EMAILJS_PUBLIC_KEY);
                    const doctorNamePretty = doctorId === 'secondi' ? 'Dra. Secondi' : 'Dr. Capparelli';

                    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
                        email: formData.get('email'),
                        to_name: formData.get('nombre') + ' ' + formData.get('apellido'),
                        doctor_name: doctorNamePretty,
                        date_time: `${cleanDate} ${cleanTime}`
                    });
                }

                window.location.href = 'gracias.html';

            } catch (error) {
                console.error("Error booking:", error);
                alert("Hubo un error al procesar el turno. " + error.message);
                btn.disabled = false;
                btn.textContent = 'Confirmar Solicitud';
            }
        });
    }

    async function checkSlotTaken(date, time) {
        const q = query(
            collection(db, "appointments"),
            where("doctor", "==", doctorId),
            where("date", "==", date),
            where("time", "==", time)
        );
        const snap = await getDocs(q);
        return !snap.empty;
    }
});

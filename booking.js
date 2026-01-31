/* Booking Logic with Firebase */
import { db } from './firebase-config.js';
import { collection, addDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('date-picker');
    const slotsContainer = document.getElementById('slots-container');
    const selectedSlotInput = document.getElementById('selected-slot');
    const slotDisplay = document.getElementById('slot-display');
    const submitBtn = document.getElementById('submit-btn');
    const form = document.querySelector('form');

    // Identify Doctor
    const formName = form ? form.name : '';
    const doctorId = formName.includes('secondi') ? 'secondi' : 'capparelli';

    // Configuration
    const startHour = 8;
    const endHour = 17;
    const intervalMinutes = 20;

    // Set min date to today
    const today = new Date().toISOString().split('T')[0];
    dateInput.min = today;

    dateInput.addEventListener('change', (e) => {
        loadSlotsForDate(e.target.value);
        selectedSlotInput.value = '';
        slotDisplay.textContent = '';
        submitBtn.disabled = true;
    });

    async function loadSlotsForDate(dateString) {
        slotsContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">Cargando disponibilidad...</p>';

        const date = new Date(dateString + 'T00:00:00');
        const day = date.getDay();

        // 0 = Sunday, 6 = Saturday
        if (day === 0 || day === 6) {
            slotsContainer.innerHTML = '<p class="error-msg" style="grid-column: 1/-1;">Por favor seleccione un día de lunes a viernes.</p>';
            return;
        }

        // Fetch taken slots from Firestore
        const takenSlots = await getTakenSlots(dateString);

        // Generate all possible slots
        const slots = [];
        let currentTime = new Date(date);
        currentTime.setHours(startHour, 0, 0, 0);
        const endTime = new Date(date);
        endTime.setHours(endHour, 0, 0, 0);

        while (currentTime < endTime) {
            const timeString = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            slots.push(timeString);
            currentTime.setMinutes(currentTime.getMinutes() + intervalMinutes);
        }

        renderSlots(slots, takenSlots);
    }

    async function getTakenSlots(dateString) {
        const q = query(
            collection(db, "appointments"),
            where("date", "==", dateString),
            where("doctor", "==", doctorId)
        );

        const querySnapshot = await getDocs(q);
        const taken = [];
        querySnapshot.forEach((doc) => {
            taken.push(doc.data().time);
        });
        return taken;
    }

    function renderSlots(allSlots, takenSlots) {
        slotsContainer.innerHTML = '';

        allSlots.forEach(time => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'slot-btn';
            btn.textContent = time;

            if (takenSlots.includes(time)) {
                btn.disabled = true;
                btn.classList.add('taken');
                btn.title = "Horario no disponible";
            } else {
                btn.addEventListener('click', () => selectSlot(btn, time));
            }

            slotsContainer.appendChild(btn);
        });
    }

    function selectSlot(btn, time) {
        document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        selectedSlotInput.value = `${dateInput.value} ${time}`;
        // Store just date and time for cleaner DB usage, logic splits them later if needed
        slotDisplay.textContent = `Turno seleccionado: ${dateInput.value} a las ${time}hs`;
        submitBtn.disabled = false;

        // Save "clean" values for DB
        form.dataset.date = dateInput.value;
        form.dataset.time = time;
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

                // 2. SEND TO NETLIFY (Backup)
                await fetch('/', {
                    method: 'POST',
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams(formData).toString()
                });

                // 3. SEND EMAIL (EmailJS)
                // --- EMAIL JS INTEGRATION ---
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

                // 4. REDIRECT
                window.location.href = 'gracias.html';

            } catch (error) {
                console.error("Error booking:", error);
                alert("Hubo un error al procesar el turno. Por favor intente nuevamente.");
                btn.disabled = false;
                btn.textContent = 'Confirmar Solicitud';
            }
        });
    }
});

/* Booking Logic for Consultorio Delgado */

document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('date-picker');
    const slotsContainer = document.getElementById('slots-container');
    const selectedSlotInput = document.getElementById('selected-slot');
    const slotDisplay = document.getElementById('slot-display');
    const submitBtn = document.getElementById('submit-btn');

    // Configuration
    const startHour = 8;
    const endHour = 17;
    const intervalMinutes = 20;

    // Set min date to today
    const today = new Date().toISOString().split('T')[0];
    dateInput.min = today;

    dateInput.addEventListener('change', (e) => {
        generateSlots(e.target.value);
        selectedSlotInput.value = '';
        slotDisplay.textContent = '';
        submitBtn.disabled = true;
    });

    function generateSlots(dateString) {
        slotsContainer.innerHTML = '';
        const date = new Date(dateString + 'T00:00:00');
        const day = date.getDay();

        // 0 = Sunday, 6 = Saturday
        if (day === 0 || day === 6) {
            slotsContainer.innerHTML = '<p class="error-msg">Por favor seleccione un día de lunes a viernes.</p>';
            return;
        }

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

        // Render buttons
        slots.forEach(time => {
            const btn = document.createElement('button');
            btn.type = 'button'; // Prevent form submission
            btn.className = 'slot-btn';
            btn.textContent = time;
            btn.addEventListener('click', () => selectSlot(btn, time));
            slotsContainer.appendChild(btn);
        });
    }

    function selectSlot(btn, time) {
        // Remove active class from all
        document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('active'));

        // Add to clicked
        btn.classList.add('active');

        // Update form data
        selectedSlotInput.value = `${dateInput.value} ${time}`;
        slotDisplay.textContent = `Turno seleccionado: ${dateInput.value} a las ${time}hs`;
        submitBtn.disabled = false;
    }

    // --- EMAIL JS INTEGRATION ---
    // REEMPLAZAR CON TUS CLAVES:
    const EMAILJS_PUBLIC_KEY = "yp2cTT12Ti6VmL4iN";
    const EMAILJS_SERVICE_ID = "service_0wgkq1l";
    const EMAILJS_TEMPLATE_ID = "template_zkapdb6";

    // Inicializar EmailJS si está cargado
    if (typeof emailjs !== 'undefined') {
        emailjs.init(EMAILJS_PUBLIC_KEY);
    }

    const form = document.querySelector('form');
    if (form) {
        form.addEventListener('submit', function (event) {
            // Si NO están configuradas las claves, dejamos que Netlify maneje el submit normal
            if (EMAILJS_PUBLIC_KEY === "TU_PUBLIC_KEY") {
                return; // Submit normal
            }

            event.preventDefault();
            const btn = document.getElementById('submit-btn');
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Procesando...';

            const formData = new FormData(form);

            // 1. Enviar a Netlify (para que quede en el dashboard)
            fetch('/', {
                method: 'POST',
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams(formData).toString()
            })
                .then(() => {
                    // 2. Enviar mail al usuario con EmailJS
                    const doctorName = document.querySelector('h1').textContent.includes('Ginecología') ? 'Dra. Secondi' : 'Dr. Capparelli';

                    const templateParams = {
                        email: form.email.value, // Changed from to_email to match template {{email}}
                        to_name: form.nombre.value + ' ' + form.apellido.value,
                        doctor_name: doctorName,
                        date_time: selectedSlotInput.value
                    };

                    return emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams);
                })
                .then(() => {
                    // 3. Redirigir
                    window.location.href = 'gracias.html';
                })
                .catch((error) => {
                    console.error('Error:', error);
                    // Si falla el mail, igual redirigimos porque Netlify ya guardó el dato
                    window.location.href = 'gracias.html';
                });
        });
    }
});

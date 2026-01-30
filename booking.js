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
});

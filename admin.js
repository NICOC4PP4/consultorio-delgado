/* Admin Dashboard Logic - Weekly View */
import { auth, db } from './firebase-config.js';
const dateInput = document.getElementById('admin-date');
dateInput.addEventListener('change', (e) => {
    loadAppointments(e.target.value);
});

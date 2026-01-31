# Hoja de Ruta - Consultorio Delgado

## ✅ Completado

### 1. Reconstrucción del Sitio Web
- [x] **Diseño Premium**: Sitio moderno, responsive y estético (HTML5, CSS3).
- [x] **Páginas**: Inicio, Turnos (Hub), Perfiles de Médicos, Recetas, Gracias.
- [x] **Integraciones**: Google Maps, FontAwesome, EmailJS.

### 2. Backend & Base de Datos
- [x] **Firebase Integration**: Configuración de Firebase Firestore para persistencia de datos.
- [x] **Autenticación**: Sistema de login simple para médicos/admin.

### 3. Sistema de Turnos (Booking)
- [x] **Lógica Inteligente**: `booking.js` con chequeo de disponibilidad en tiempo real.
- [x] **Reglas de Negocio**:
    - Bloqueo de turnos ocupados.
    - Límite de anticipación configurable (ej. 15 días).
    - Horarios dinámicos según configuración del médico.
    - Confirmación vía Email.

### 4. Panel de Administración (Panel Médico)
- [x] **Agenda Diaria**: Vista detallada de turnos, datos de paciente (con email clickable) y acciones (Bloquear/Desbloquear).
- [x] **Calendario Semanal**: Vista general de la semana, respetando horarios y bloqueos.
- [x] **Configuración de Horarios**: Pestaña para definir días y hora inicio/fin por día de la semana.
- [x] **Configuración General**: Ajuste de días de anticipación de turnos.

---

## 🚀 Próximos Pasos (Backlog)

### 5. Optimizaciones
- [ ] **Email Gratuito (Google Apps Script)**: Migrar el sistema de notificaciones de EmailJS a Google Apps Script para eliminar límites mensuales y usar cuota de Gmail.
- [ ] **Validaciones Avanzadas**: Mejorar validación de teléfonos en formularios.
- [ ] **Recordatorios Automáticos**: Script para enviar mails 24hs antes (requiere Cloud Functions o cron externo).

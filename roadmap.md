# Hoja de Ruta - Consultorio Delgado

## ✅ Completado

### 1. Reconstrucción del Sitio Web
- [x] Migración del diseño a una estructura moderna y responsive (HTML5, CSS3).
- [x] Creación de página de inicio (`index.html`) con secciones de Profesionales, Especialidades y Contacto.
- [x] Corrección de estilos, tipografías y colores (Look "Premium").
- [x] Integración de Google Maps y dirección correcta.

### 2. Páginas Internas
- [x] **Turnos**: `turnos.html` como hub central, derivando a páginas específicas.
- [x] **Turno Dra. Secondi**: `turno-secondi.html` con formulario personalizado.
- [x] **Turno Dr. Capparelli**: `turno-capparelli.html` con formulario personalizado.
- [x] **Recetas**: `receta-secondi.html` y `receta-capparelli.html` con información de pago y formularios.
- [x] **Gracias**: Página de confirmación `gracias.html`.

### 3. Sistema de Turnos (Frontend)
- [x] Lógica de generación de turnos en JavaScript (`booking.js`).
- [x] Grilla de horarios (Lunes a Viernes, 8:00 - 17:00, cada 20 min).
- [x] Selección de fecha y hora interactiva.
- [x] Captura de datos del paciente (Nombre, Email, Teléfono, Obra Social).

### 4. Integraciones y Despliegue
- [x] Configuración de **Netlify Forms** para la recepción de datos.
- [x] Integración de **EmailJS** para envío automático de confirmaciones al paciente.
- [x] Despliegue automático desde GitHub.
- [x] Corrección de rutas de formularios y parámetros de email.

---

## 🚧 Pendiente / Próximos Pasos

### 5. Gestión Avanzada de Turnos (Requiere Base de Datos)
- [ ] **Disponibilidad en Tiempo Real**:
    - Evitar que dos pacientes reserven el mismo horario.
    - Deshabilitar visualmente los turnos ya ocupados.
- [ ] **Persistencia de Datos**: Conectar una base de datos (ej. Firebase o Supabase) para guardar los turnos confirmados.

### 6. Panel de Administración para Médicos
- [ ] **Acceso Privado**: Página de login con contraseña para los doctores.
- [ ] **Gestión de Agenda**:
    - Ver lista de turnos tomados.
    - Bloquear días específicos (vacaciones, feriados).
    - Modificar franjas horarias (ej. cambiar de 8-17 a 9-15 un día puntual).
    - Liberar turnos cancelados.

### 7. Mejoras de UX/UI
- [ ] Spinner de carga visual durante el envío del turno.
- [ ] Validación avanzada de teléfonos y emails.

---

## 📋 Nota Técnica
Para implementar las funciones de "Pendiente", necesitamos migrar de un sitio estático puro a una **Web App Dinámica**.
**Propuesta:** Usar **Firebase** (de Google) por su facilidad de integración gratuita para:
1.  **Auth**: Login de médicos.
2.  **Firestore Database**: Guardar turnos y bloqueos en tiempo real.

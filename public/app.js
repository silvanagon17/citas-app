// State Management
let appointments = [];
let currentFilter = 'all';
let deleteTargetId = null;

// DOM Elements
const appointmentsGrid = document.getElementById('appointmentsGrid');
const loadingIndicator = document.getElementById('loadingIndicator');
const emptyState = document.getElementById('emptyState');
const filterButtons = document.querySelectorAll('.filter-btn');

// Stats Elements
const statTotal = document.getElementById('statTotal');
const statScheduled = document.getElementById('statScheduled');
const statCompleted = document.getElementById('statCompleted');
const statCancelled = document.getElementById('statCancelled');

// Toast Element
const toast = document.getElementById('notificationToast');

// Dialog Elements
const appointmentModal = document.getElementById('appointmentModal');
const deleteConfirmModal = document.getElementById('deleteConfirmModal');
const btnOpenNewAppointment = document.getElementById('btnOpenNewAppointment');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnCancelModal = document.getElementById('btnCancelModal');
const btnCancelDelete = document.getElementById('btnCancelDelete');
const btnConfirmDelete = document.getElementById('btnConfirmDelete');
const appointmentForm = document.getElementById('appointmentForm');

// Base API URL
const API_URL = '/api/appointments';

// Color map for service border accent
const SERVICE_COLORS = {
  'Medicina General': '#0284c7', // Sky Blue
  'Odontología': '#8b5cf6',      // Purple
  'Pediatría': '#f97316',        // Orange
  'Cardiología': '#ef4444',      // Red
  'Dermatología': '#ec4899',      // Pink
  'Nutrición': '#10b981'         // Emerald Green
};

// ----------------------------------------------------
// Initialization
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  fetchAppointments();
  setupEventListeners();
  setupDialogLightDismissFallback();
});

// ----------------------------------------------------
// Event Listeners Setup
// ----------------------------------------------------
function setupEventListeners() {
  // Modal toggle listeners
  btnOpenNewAppointment.addEventListener('click', () => {
    resetForm();
    // Set default date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('date').value = tomorrow.toISOString().split('T')[0];
    
    appointmentModal.showModal();
  });

  btnCloseModal.addEventListener('click', () => appointmentModal.close());
  btnCancelModal.addEventListener('click', () => appointmentModal.close());
  
  btnCancelDelete.addEventListener('click', () => {
    deleteConfirmModal.close();
    deleteTargetId = null;
  });

  btnConfirmDelete.addEventListener('click', () => {
    if (deleteTargetId) {
      deleteAppointment(deleteTargetId);
    }
  });

  // Filters
  filterButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      filterButtons.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.dataset.filter;
      renderAppointments();
    });
  });

  // Form Submission
  appointmentForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (validateForm()) {
      createAppointment();
    }
  });

  // Form input validation clearing
  const inputs = appointmentForm.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    input.addEventListener('input', () => {
      input.classList.remove('invalid');
      const errEl = document.getElementById(`error${capitalizeFirstLetter(input.id)}`);
      if (errEl) errEl.classList.remove('visible');
    });
  });
}

// Capitalize helper
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// ----------------------------------------------------
// Dialog Backdrop Light Dismiss Fallback
// ----------------------------------------------------
function setupDialogLightDismissFallback() {
  [appointmentModal, deleteConfirmModal].forEach(modal => {
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      modal.addEventListener('click', (event) => {
        if (event.target !== modal) return;
        const rect = modal.getBoundingClientRect();
        const isDialogContent = (
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width
        );
        if (!isDialogContent) {
          modal.close();
        }
      });
    }
  });
}

// ----------------------------------------------------
// API Operations
// ----------------------------------------------------
async function fetchAppointments() {
  showLoading(true);
  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error('No se pudieron obtener las citas.');
    appointments = await response.json();
    renderAppointments();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function createAppointment() {
  const formData = new FormData(appointmentForm);
  const data = Object.fromEntries(formData.entries());

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Error al agendar la cita.');
    }

    const newAppointment = await response.json();
    appointments.push(newAppointment);
    renderAppointments();
    appointmentModal.close();
    showToast('Cita agendada correctamente.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function updateStatus(id, newStatus) {
  try {
    const response = await fetch(`${API_URL}/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: newStatus })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Error al actualizar el estado.');
    }

    const updatedAppt = await response.json();
    appointments = appointments.map(appt => appt.id === id ? updatedAppt : appt);
    renderAppointments();
    
    const statusMsgs = {
      completed: 'Cita marcada como completada.',
      cancelled: 'Cita cancelada.',
      scheduled: 'Cita restaurada/programada.'
    };
    showToast(statusMsgs[newStatus] || 'Estado de cita actualizado.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function deleteAppointment(id) {
  try {
    const response = await fetch(`${API_URL}/${id}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Error al eliminar la cita.');
    }

    appointments = appointments.filter(appt => appt.id !== id);
    renderAppointments();
    deleteConfirmModal.close();
    deleteTargetId = null;
    showToast('Cita eliminada correctamente.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ----------------------------------------------------
// UI Render Functions
// ----------------------------------------------------
function renderAppointments() {
  // Clear grid
  appointmentsGrid.innerHTML = '';
  
  // Apply Filter
  const filtered = appointments.filter(appt => {
    if (currentFilter === 'all') return true;
    return appt.status === currentFilter;
  });

  // Calculate and update stats
  updateStats();

  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    appointmentsGrid.classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  appointmentsGrid.classList.remove('hidden');

  filtered.forEach(appt => {
    const cardAccent = SERVICE_COLORS[appt.service] || '#0f766e';
    const statusLabel = {
      scheduled: 'Programada',
      completed: 'Completada',
      cancelled: 'Cancelada'
    }[appt.status];

    const card = document.createElement('article');
    card.className = 'appointment-card';
    card.style.setProperty('--card-accent', cardAccent);
    
    // Format date beautifully
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateFormatted = new Date(`${appt.date}T00:00:00`).toLocaleDateString('es-ES', options);

    // Conditional notes rendering
    const notesHtml = appt.notes ? `<div class="card-notes">"${appt.notes}"</div>` : '';

    // Action buttons depending on status
    let actionButtons = '';
    if (appt.status === 'scheduled') {
      actionButtons = `
        <button class="action-btn-icon complete" title="Marcar como Completada" onclick="updateStatus('${appt.id}', 'completed')">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        </button>
        <button class="action-btn-icon cancel" title="Cancelar Cita" onclick="updateStatus('${appt.id}', 'cancelled')">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
        </button>
      `;
    } else if (appt.status === 'completed' || appt.status === 'cancelled') {
      actionButtons = `
        <button class="action-btn-icon" title="Volver a Programar" onclick="updateStatus('${appt.id}', 'scheduled')">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        </button>
      `;
    }

    card.innerHTML = `
      <div class="card-header">
        <div class="patient-info">
          <h3 class="patient-name">${escapeHTML(appt.patientName)}</h3>
          <span class="patient-email">${escapeHTML(appt.email)}</span>
        </div>
        <span class="status-pill status-${appt.status}">${statusLabel}</span>
      </div>
      
      <div class="card-details">
        <div class="detail-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
          <span>${capitalizeFirstLetter(dateFormatted)}</span>
        </div>
        <div class="detail-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span>${appt.time} hs</span>
        </div>
        <div class="detail-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0Z"/></svg>
          <span style="font-weight: 600; color: ${cardAccent};">${appt.service}</span>
        </div>
      </div>

      ${notesHtml}

      <div class="card-actions">
        ${actionButtons}
        <button class="action-btn-icon delete" title="Eliminar Cita" onclick="triggerDeleteConfirmation('${appt.id}')">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      </div>
    `;

    appointmentsGrid.appendChild(card);
  });
}

function updateStats() {
  const total = appointments.length;
  const scheduled = appointments.filter(a => a.status === 'scheduled').length;
  const completed = appointments.filter(a => a.status === 'completed').length;
  const cancelled = appointments.filter(a => a.status === 'cancelled').length;

  // Animate stat counters
  animateCounter(statTotal, total);
  animateCounter(statScheduled, scheduled);
  animateCounter(statCompleted, completed);
  animateCounter(statCancelled, cancelled);
}

function animateCounter(element, targetValue) {
  const start = parseInt(element.textContent) || 0;
  if (start === targetValue) return;
  
  const duration = 400; // ms
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Ease out cubic
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const currentValue = Math.floor(start + easeProgress * (targetValue - start));
    
    element.textContent = currentValue;

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = targetValue;
    }
  }

  requestAnimationFrame(update);
}

function triggerDeleteConfirmation(id) {
  deleteTargetId = id;
  deleteConfirmModal.showModal();
}

// ----------------------------------------------------
// Validation & Form Helpers
// ----------------------------------------------------
function validateForm() {
  let isValid = true;

  const patientName = document.getElementById('patientName');
  const email = document.getElementById('email');
  const date = document.getElementById('date');
  const time = document.getElementById('time');
  const service = document.getElementById('service');

  // Name check
  if (!patientName.value.trim()) {
    showError(patientName, 'errorPatientName');
    isValid = false;
  }

  // Email check
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email.value.trim() || !emailPattern.test(email.value)) {
    showError(email, 'errorEmail');
    isValid = false;
  }

  // Date check
  if (!date.value) {
    showError(date, 'errorDate');
    isValid = false;
  }

  // Time check
  if (!time.value) {
    showError(time, 'errorTime');
    isValid = false;
  }

  // Service check
  if (!service.value) {
    showError(service, 'errorService');
    isValid = false;
  }

  return isValid;
}

function showError(element, errorId) {
  element.classList.add('invalid');
  document.getElementById(errorId).classList.add('visible');
}

function resetForm() {
  appointmentForm.reset();
  const errorMsgs = appointmentForm.querySelectorAll('.error-message');
  errorMsgs.forEach(err => err.classList.remove('visible'));
  const inputs = appointmentForm.querySelectorAll('input, select, textarea');
  inputs.forEach(input => input.classList.remove('invalid'));
}

// ----------------------------------------------------
// UI Helpers & Utilities
// ----------------------------------------------------
function showLoading(show) {
  if (show) {
    loadingIndicator.classList.remove('hidden');
    appointmentsGrid.classList.add('hidden');
    emptyState.classList.add('hidden');
  } else {
    loadingIndicator.classList.add('hidden');
  }
}

function showToast(message, type = 'success') {
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 4000);
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Expose updateStatus & triggerDeleteConfirmation to window scope for onclick handlers
window.updateStatus = updateStatus;
window.triggerDeleteConfirmation = triggerDeleteConfirmation;

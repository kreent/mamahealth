// ============================================================
// HealthMama Dashboard — Lógica del Cliente y Gráficos
// ============================================================

let stepsChartInstance = null;
let heartRateChartInstance = null;
let sleepHistoryChartInstance = null;
let sleepScheduleChartInstance = null;
let sleepTimelineChartInstance = null;
let correlationScatterChartInstance = null;
let currentHealthData = null;
let lastCorrelationPairs = null;
let lastCorrelationData = null;

// Elementos del DOM
const elements = {
  selectedDate: document.getElementById('selected-date'),
  prevDayBtn: document.getElementById('prev-day-btn'),
  nextDayBtn: document.getElementById('next-day-btn'),
  todayBtn: document.getElementById('today-btn'),
  syncBtn: document.getElementById('sync-btn'),
  openConfigBtn: document.getElementById('open-config-btn'),
  connectionStatusBadge: document.getElementById('connection-status-badge'),
  connectionStatusText: document.getElementById('connection-status-text'),
  
  // Banner del dispositivo
  deviceName: document.getElementById('device-name'),
  deviceBattery: document.getElementById('device-battery'),
  deviceSyncTime: document.getElementById('device-sync-time'),
  modeNoticeBadge: document.getElementById('mode-notice-badge'),
  alertBanner: document.getElementById('alert-banner'),
  alertMessage: document.getElementById('alert-message'),

  // Tarjeta Pasos
  stepsCardDate: document.getElementById('steps-card-date'),
  stepsCount: document.getElementById('steps-count'),
  stepsGoal: document.getElementById('steps-goal'),
  stepsPercentage: document.getElementById('steps-percentage'),
  stepsProgressBar: document.getElementById('steps-progress-bar'),
  distanceValue: document.getElementById('distance-value'),
  activeMinutesValue: document.getElementById('active-minutes-value'),

  // Tarjeta Cardíaca
  heartRateCurrent: document.getElementById('heart-rate-current'),
  heartRateResting: document.getElementById('heart-rate-resting'),
  heartRateMin: document.getElementById('heart-rate-min'),
  heartRateMax: document.getElementById('heart-rate-max'),

  // Tarjeta Sueño
  cardSleepTrigger: document.getElementById('card-sleep-trigger'),
  sleepTotal: document.getElementById('sleep-total'),
  sleepScoreBadge: document.getElementById('sleep-score-badge'),
  sleepDeep: document.getElementById('sleep-deep'),
  sleepRem: document.getElementById('sleep-rem'),
  sleepLight: document.getElementById('sleep-light'),
  sleepStatTotal: document.getElementById('sleep-stat-total'),
  sleepStatEfficiency: document.getElementById('sleep-stat-efficiency'),
  sleepStatScore: document.getElementById('sleep-stat-score'),
  sleepBarVisual: document.getElementById('sleep-bar-visual'),

  // Modal Detalle de Sueño
  sleepModal: document.getElementById('sleep-modal'),
  closeSleepModalBtn: document.getElementById('close-sleep-modal-btn'),
  closeSleepModalFooterBtn: document.getElementById('close-sleep-modal-footer-btn'),
  modalSleepTotal: document.getElementById('modal-sleep-total'),
  modalSleepScore: document.getElementById('modal-sleep-score'),
  modalSleepEfficiency: document.getElementById('modal-sleep-efficiency'),
  modalSleepAwake: document.getElementById('modal-sleep-awake'),
  modalSleepDeep: document.getElementById('modal-sleep-deep'),
  modalSleepRem: document.getElementById('modal-sleep-rem'),
  modalSleepLight: document.getElementById('modal-sleep-light'),
  modalSleepSchedule: document.getElementById('modal-sleep-schedule'),
  hypnogramSection: document.getElementById('hypnogram-section'),

  // Tarjeta Calorías
  caloriesTotal: document.getElementById('calories-total'),
  caloriesActive: document.getElementById('calories-active'),
  caloriesBmr: document.getElementById('calories-bmr'),
  spo2Value: document.getElementById('spo2-value'),

  // Modal Configuración
  configModal: document.getElementById('config-modal'),
  closeModalBtn: document.getElementById('close-modal-btn'),
  closeModalFooterBtn: document.getElementById('close-modal-footer-btn'),
  tabBtns: document.querySelectorAll('.tab-btn'),
  tabContents: document.querySelectorAll('.tab-content'),
  configForm: document.getElementById('config-form'),
  inputClientId: document.getElementById('input-client-id'),
  inputClientSecret: document.getElementById('input-client-secret'),
  toggleDemoMode: document.getElementById('toggle-demo-mode'),
  authConnectedSection: document.getElementById('auth-connected-section'),
  connectedUserEmail: document.getElementById('connected-user-email'),
  btnDisconnect: document.getElementById('btn-disconnect'),
  
  // Toast
  toast: document.getElementById('toast'),
  toastMessage: document.getElementById('toast-message'),

  // Carga
  loadingOverlay: document.getElementById('loading-overlay'),
  dashboardContent: document.querySelector('.dashboard-content'),

  // Correlación Actividad vs Sueño
  runCorrelationBtn: document.getElementById('run-correlation-btn'),
  correlationDaysSelect: document.getElementById('correlation-days-select'),
  correlationResults: document.getElementById('correlation-results')
};

// Formato de fecha YYYY-MM-DD en hora local
function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Etiqueta legible para la fecha seleccionada: "Hoy", "Ayer" o "6 oct"
function getDateLabel(dateStr) {
  const today = getLocalDateString();
  const yesterday = getLocalDateString(new Date(Date.now() - 86400000));
  if (dateStr === today) return 'Hoy';
  if (dateStr === yesterday) return 'Ayer';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

// Muestra "--" en vez de "null"/"undefined" cuando todavía no hay un dato real
function fmtOrDash(value, suffix = '') {
  return (value === null || value === undefined) ? '--' : `${value}${suffix}`;
}

// Mostrar notificación Toast
function showToast(message, duration = 3000) {
  elements.toastMessage.textContent = message;
  elements.toast.classList.remove('hidden');
  setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, duration);
}

// Inicializar fecha
let currentDate = getLocalDateString();
if (elements.selectedDate) {
  elements.selectedDate.value = currentDate;
  // No tiene sentido ver "datos" de un día que todavía no ocurre: la banda
  // no puede haber sincronizado nada futuro, así que no se permite navegar ahí.
  elements.selectedDate.max = getLocalDateString();
}

// Actualiza el estado visual del botón "siguiente día" y evita pasarse de hoy
function updateDateNavState() {
  const isToday = currentDate >= getLocalDateString();
  if (elements.nextDayBtn) elements.nextDayBtn.disabled = isToday;
}
updateDateNavState();

// --- Manejo de Fechas ---
elements.selectedDate?.addEventListener('change', (e) => {
  const today = getLocalDateString();
  currentDate = e.target.value > today ? today : e.target.value;
  elements.selectedDate.value = currentDate;
  updateDateNavState();
  loadHealthData();
});

elements.prevDayBtn?.addEventListener('click', () => {
  const d = new Date(currentDate + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  currentDate = getLocalDateString(d);
  if (elements.selectedDate) elements.selectedDate.value = currentDate;
  updateDateNavState();
  loadHealthData();
});

elements.nextDayBtn?.addEventListener('click', () => {
  const today = getLocalDateString();
  if (currentDate >= today) return; // ya estamos en hoy, no hay "mañana" que mostrar
  const d = new Date(currentDate + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  currentDate = getLocalDateString(d);
  if (elements.selectedDate) elements.selectedDate.value = currentDate;
  updateDateNavState();
  loadHealthData();
});

elements.todayBtn?.addEventListener('click', () => {
  currentDate = getLocalDateString();
  if (elements.selectedDate) elements.selectedDate.value = currentDate;
  updateDateNavState();
  loadHealthData();
});

// --- Modal de Configuración ---
elements.openConfigBtn?.addEventListener('click', () => {
  elements.configModal?.classList.remove('hidden');
  loadStatus();
});

const closeModal = () => elements.configModal?.classList.add('hidden');
elements.closeModalBtn?.addEventListener('click', closeModal);
elements.closeModalFooterBtn?.addEventListener('click', closeModal);

elements.configModal?.addEventListener('click', (e) => {
  if (e.target === elements.configModal) closeModal();
});

// Pestañas del Modal
elements.tabBtns?.forEach(btn => {
  btn.addEventListener('click', () => {
    elements.tabBtns.forEach(b => b.classList.remove('active'));
    elements.tabContents.forEach(c => c.classList.remove('active'));

    btn.classList.add('active');
    const tabId = btn.getAttribute('data-tab');
    document.getElementById(tabId)?.classList.add('active');
  });
});

// Guardar credenciales de Google
elements.configForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const clientId = elements.inputClientId.value.trim();
  const clientSecret = elements.inputClientSecret.value.trim();

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Credenciales guardadas correctamente');
      loadStatus();
    }
  } catch (err) {
    showToast('Error al guardar credenciales');
  }
});

// Alternar Modo Demo
elements.toggleDemoMode?.addEventListener('change', async (e) => {
  const isDemo = e.target.checked;
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demoMode: isDemo })
    });
    showToast(isDemo ? 'Modo Demostración activado' : 'Modo API en vivo activado');
    loadStatus();
    loadHealthData();
  } catch (err) {
    console.error(err);
  }
});

// Desconectar cuenta
elements.btnDisconnect?.addEventListener('click', async () => {
  try {
    await fetch('/auth/disconnect', { method: 'POST' });
    showToast('Cuenta de Google desconectada');
    loadStatus();
    loadHealthData();
  } catch (err) {
    showToast('Error al desconectar');
  }
});

// Botón de sincronización manual
elements.syncBtn?.addEventListener('click', () => {
  elements.syncBtn.classList.add('rotating');
  loadHealthData(() => {
    elements.syncBtn.classList.remove('rotating');
    showToast('Datos de la banda sincronizados');
  });
});

// --- Consultar Estado del Sistema ---
async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const status = await res.json();

    // Actualizar badge del header
    if (status.authenticated && !status.demoMode) {
      elements.connectionStatusBadge.className = 'status-pill status-online';
      elements.connectionStatusText.textContent = 'Google Health Conectado';
      elements.modeNoticeBadge.textContent = 'Datos en Vivo (Google Health)';
      elements.modeNoticeBadge.style.color = '#34d399';
      elements.modeNoticeBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
      elements.modeNoticeBadge.style.background = 'rgba(16, 185, 129, 0.15)';
      
      elements.authConnectedSection.classList.remove('hidden');
      elements.connectedUserEmail.textContent = status.userEmail || 'Conectado';
    } else {
      elements.connectionStatusBadge.className = 'status-pill status-demo';
      elements.connectionStatusText.textContent = 'Modo Demostración';
      elements.modeNoticeBadge.textContent = 'Modo Simulado Activo';
      elements.modeNoticeBadge.style.color = '';
      elements.modeNoticeBadge.style.borderColor = '';
      elements.modeNoticeBadge.style.background = '';
      
      elements.authConnectedSection.classList.add('hidden');
    }

    elements.toggleDemoMode.checked = Boolean(status.demoMode);
  } catch (err) {
    console.error('Error al cargar status:', err);
  }
}

// --- Cargar Métricas de Salud ---
async function loadHealthData(callback) {
  elements.dashboardContent?.classList.add('is-refreshing');
  if (elements.stepsCardDate) elements.stepsCardDate.textContent = getDateLabel(currentDate);
  try {
    const res = await fetch(`/api/health/data?date=${currentDate}`);
    const data = await res.json();

    // Notificaciones o avisos
    if (data.notice) {
      elements.alertMessage.textContent = data.notice;
      elements.alertBanner.classList.remove('hidden');
    } else {
      elements.alertBanner.classList.add('hidden');
    }

    // Dispositivo
    if (data.device) {
      elements.deviceName.textContent = data.device.model;
      elements.deviceBattery.textContent = data.device.battery;
      elements.deviceSyncTime.textContent = data.device.lastSync;
    }

    // Pasos
    const steps = data.summary.steps;
    elements.stepsCount.textContent = steps.total.toLocaleString();
    elements.stepsGoal.textContent = steps.goal.toLocaleString();
    elements.stepsPercentage.textContent = `${steps.percentage}%`;
    elements.stepsProgressBar.style.width = `${Math.min(steps.percentage, 100)}%`;
    elements.distanceValue.textContent = `${data.summary.distance.km} ${data.summary.distance.unit}`;
    elements.activeMinutesValue.textContent = `${data.summary.activeMinutes.total} min`;

    // Ritmo Cardíaco
    const hr = data.summary.heartRate;
    elements.heartRateCurrent.textContent = fmtOrDash(hr.current);
    elements.heartRateResting.textContent = fmtOrDash(hr.resting, ' BPM');
    elements.heartRateMin.textContent = fmtOrDash(hr.min, ' BPM');
    elements.heartRateMax.textContent = fmtOrDash(hr.max, ' BPM');

    // Sueño
    const sleep = data.summary.sleep;
    elements.sleepTotal.textContent = sleep.totalHours;
    elements.sleepScoreBadge.textContent = sleep.score === null ? 'Sin datos' : `${sleep.score} / 100`;
    elements.sleepDeep.textContent = sleep.deep;
    elements.sleepRem.textContent = sleep.rem;
    elements.sleepLight.textContent = sleep.light;
    elements.sleepStatTotal.textContent = sleep.totalHours;
    elements.sleepStatEfficiency.textContent = sleep.efficiency;
    elements.sleepStatScore.textContent = sleep.score === null ? 'Sin datos' : `${sleep.score} / 100`;

    // Barra visual de sueño
    if (data.charts?.sleepStages) {
      const stages = data.charts.sleepStages;
      const totalMin = stages.reduce((acc, s) => acc + s.minutes, 0);
      if (totalMin > 0) {
        const segDeep = (stages[0].minutes / totalMin) * 100;
        const segRem = (stages[1].minutes / totalMin) * 100;
        const segLight = (stages[2].minutes / totalMin) * 100;

        elements.sleepBarVisual.innerHTML = `
          <div class="sleep-segment seg-deep" style="width: ${segDeep}%" title="Profundo: ${Math.round(segDeep)}%"></div>
          <div class="sleep-segment seg-rem" style="width: ${segRem}%" title="REM: ${Math.round(segRem)}%"></div>
          <div class="sleep-segment seg-light" style="width: ${segLight}%" title="Ligero: ${Math.round(segLight)}%"></div>
        `;
      }
    }

    // Calorías & SpO2
    elements.caloriesTotal.textContent = data.summary.calories.total.toLocaleString();
    elements.caloriesActive.textContent = `${data.summary.calories.active.toLocaleString()} kcal`;
    elements.caloriesBmr.textContent = `${data.summary.calories.bmr.toLocaleString()} kcal`;
    elements.spo2Value.textContent = data.summary.spo2.avgPercentage;

    currentHealthData = data;

    // Si el modal de sueño está abierto, refrescarlo
    if (!elements.sleepModal.classList.contains('hidden')) {
      openSleepModal();
    }

    // Renderizar Gráficos
    renderStepsChart(data.charts.stepsPerHour);
    renderHeartRateChart(data.charts.heartRateTimeline);

  } catch (err) {
    console.error('Error al cargar datos de salud:', err);
  } finally {
    elements.dashboardContent?.classList.remove('is-refreshing');
    elements.loadingOverlay?.classList.add('hidden');
    if (callback) callback();
  }
}

// --- Renderizar Gráfico de Pasos ---
function renderStepsChart(hourlyData) {
  const ctx = document.getElementById('stepsChart').getContext('2d');
  const labels = hourlyData.map(d => d.hour);
  const values = hourlyData.map(d => d.steps);

  if (stepsChartInstance) {
    stepsChartInstance.destroy();
  }

  // Gradiente
  const gradient = ctx.createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, '#10b981');
  gradient.addColorStop(1, 'rgba(16, 185, 129, 0.15)');

  stepsChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Pasos',
        data: values,
        backgroundColor: gradient,
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          titleColor: '#fff',
          bodyColor: '#34d399',
          padding: 10,
          displayColors: false
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#64748b',
            maxTicksLimit: 12,
            font: { size: 11 }
          }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#64748b',
            font: { size: 11 }
          }
        }
      }
    }
  });
}

// --- Renderizar Gráfico de Ritmo Cardíaco ---
function renderHeartRateChart(hourlyData) {
  const ctx = document.getElementById('heartRateChart').getContext('2d');
  const labels = hourlyData.map(d => d.hour);
  const values = hourlyData.map(d => d.bpm);

  if (heartRateChartInstance) {
    heartRateChartInstance.destroy();
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, 'rgba(244, 63, 94, 0.35)');
  gradient.addColorStop(1, 'rgba(244, 63, 94, 0.0)');

  heartRateChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'BPM',
        data: values,
        borderColor: '#f43f5e',
        borderWidth: 2.5,
        backgroundColor: gradient,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#f43f5e'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          titleColor: '#fff',
          bodyColor: '#fda4af',
          padding: 10,
          displayColors: false,
          callbacks: {
            label: (ctx) => `${ctx.parsed.y} BPM`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#64748b',
            maxTicksLimit: 12,
            font: { size: 11 }
          }
        },
        y: {
          min: 45,
          max: 150,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#64748b',
            font: { size: 11 },
            stepSize: 25
          }
        }
      }
    }
  });
}

// --- Manejo del Modal de Sueño ---
if (elements.cardSleepTrigger) {
  elements.cardSleepTrigger.addEventListener('click', openSleepModal);
}

const closeSleepModal = () => {
  if (elements.sleepModal) elements.sleepModal.classList.add('hidden');
};
if (elements.closeSleepModalBtn) elements.closeSleepModalBtn.addEventListener('click', closeSleepModal);
if (elements.closeSleepModalFooterBtn) elements.closeSleepModalFooterBtn.addEventListener('click', closeSleepModal);
if (elements.sleepModal) {
  elements.sleepModal.addEventListener('click', (e) => {
    if (e.target === elements.sleepModal) closeSleepModal();
  });
}

function openSleepModal() {
  if (!currentHealthData) return;
  const sleep = currentHealthData.summary?.sleep;
  const details = currentHealthData.sleepDetails;

  // Actualizar KPIs del modal
  if (elements.modalSleepTotal) elements.modalSleepTotal.textContent = sleep?.totalHours || '--';
  if (elements.modalSleepScore) elements.modalSleepScore.textContent = `${sleep?.score || '--'} / 100`;
  if (elements.modalSleepEfficiency) elements.modalSleepEfficiency.textContent = sleep?.efficiency || '--';
  if (elements.modalSleepDeep) elements.modalSleepDeep.textContent = sleep?.deep || '--';
  if (elements.modalSleepRem) elements.modalSleepRem.textContent = sleep?.rem || '--';
  if (elements.modalSleepLight) elements.modalSleepLight.textContent = sleep?.light || '--';

  // Buscar horario en el historial de la noche actual
  const history = details?.history || [];
  const currentNight = history.find(h => h.fullDate === currentDate) || history[history.length - 1];
  if (currentNight && elements.modalSleepSchedule) {
    elements.modalSleepSchedule.textContent = `Acostado: ${currentNight.startClock} • Despierto: ${currentNight.endClock}`;
    if (elements.modalSleepAwake) {
      elements.modalSleepAwake.textContent = `Despierto: ${currentNight.awakeMinutes} min`;
    }
  }

  if (elements.sleepModal) {
    elements.sleepModal.classList.remove('hidden');
  }

  // Renderizar las gráficas de sueño
  renderSleepHistoryChart(history);
  renderSleepScheduleChart(history);
  renderSleepTimelineChart(details?.timeline || []);
}

// Convierte "HH:MM" a horas decimales, extendiendo la madrugada (ej. 00:30 -> 24.5)
// para que el horario de dormir/despertar se vea continuo en el eje en vez de saltar.
function clockToDecimalHours(clockStr, isBedtime) {
  if (!clockStr || clockStr === '--:--') return null;
  const [h, m] = clockStr.split(':').map(Number);
  let decimal = h + m / 60;
  if (isBedtime && decimal < 12) decimal += 24; // acostarse después de medianoche
  if (!isBedtime && decimal < 10) decimal += 24; // despertar de madrugada (turno nocturno)
  return decimal;
}

function decimalHoursToClock(decimal) {
  const h = Math.floor(decimal) % 24;
  const m = Math.round((decimal % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// --- Gráfica Diaria de Fases de Sueño (Apilada por Noche) ---
function renderSleepHistoryChart(historyData) {
  const canvas = document.getElementById('sleepHistoryChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (sleepHistoryChartInstance) {
    sleepHistoryChartInstance.destroy();
  }

  if (!historyData || historyData.length === 0) return;

  const labels = historyData.map(d => d.date);
  const deepValues = historyData.map(d => d.deepHours);
  const remValues = historyData.map(d => d.remHours);
  const lightValues = historyData.map(d => d.lightHours);
  const awakeValues = historyData.map(d => +(d.awakeMinutes / 60).toFixed(1));

  sleepHistoryChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Profundo',
          data: deepValues,
          backgroundColor: '#3b82f6',
          borderRadius: 4,
          stack: 'sleep'
        },
        {
          label: 'REM',
          data: remValues,
          backgroundColor: '#8b5cf6',
          borderRadius: 4,
          stack: 'sleep'
        },
        {
          label: 'Ligero',
          data: lightValues,
          backgroundColor: '#10b981',
          borderRadius: 4,
          stack: 'sleep'
        },
        {
          label: 'Despierto',
          data: awakeValues,
          backgroundColor: '#f59e0b',
          borderRadius: 4,
          stack: 'sleep'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          titleColor: '#fff',
          bodyColor: '#e2e8f0',
          padding: 12,
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y}h`,
            footer: (items) => {
              const idx = items[0].dataIndex;
              const item = historyData[idx];
              return [
                `Total dormido: ${item.totalFormatted} • Score: ${item.score}/100`,
                `Acostado: ${item.startClock || '--:--'} • Despierto: ${item.endClock || '--:--'}`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { size: 11, weight: '600' } }
        },
        y: {
          stacked: true,
          grid: { color: 'rgba(255, 255, 255, 0.06)' },
          title: {
            display: true,
            text: 'Horas de Sueño',
            color: '#64748b',
            font: { size: 11 }
          },
          ticks: {
            color: '#94a3b8',
            font: { size: 11 },
            stepSize: 2
          }
        }
      }
    }
  });
}

// --- Horario de Sueño: hora de dormir y hora de despertar por noche ---
function renderSleepScheduleChart(historyData) {
  const canvas = document.getElementById('sleepScheduleChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (sleepScheduleChartInstance) {
    sleepScheduleChartInstance.destroy();
  }

  if (!historyData || historyData.length === 0) return;

  const labels = historyData.map(d => d.date);
  const bedtimes = historyData.map(d => clockToDecimalHours(d.startClock, true));
  const waketimes = historyData.map(d => clockToDecimalHours(d.endClock, false));

  sleepScheduleChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Hora de Dormir',
          data: bedtimes,
          borderColor: '#6366f1',
          backgroundColor: '#6366f1',
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.3,
          spanGaps: true
        },
        {
          label: 'Hora de Despertar',
          data: waketimes,
          borderColor: '#f59e0b',
          backgroundColor: '#f59e0b',
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.3,
          spanGaps: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          titleColor: '#fff',
          bodyColor: '#e2e8f0',
          padding: 10,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${decimalHoursToClock(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { size: 11, weight: '600' } }
        },
        y: {
          min: 18,
          max: 34,
          grid: { color: 'rgba(255, 255, 255, 0.06)' },
          title: {
            display: true,
            text: 'Hora del día',
            color: '#64748b',
            font: { size: 11 }
          },
          ticks: {
            color: '#94a3b8',
            font: { size: 11 },
            stepSize: 2,
            callback: (val) => decimalHoursToClock(val)
          }
        }
      }
    }
  });
}

// --- Hipnograma / Cronología de Fases de la Noche ---
function renderSleepTimelineChart(timelineData) {
  const container = document.getElementById('hypnogram-section');
  const canvas = document.getElementById('sleepTimelineChart');
  if (!canvas || !container) return;

  if (!timelineData || timelineData.length === 0) {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');

  const ctx = canvas.getContext('2d');

  if (sleepTimelineChartInstance) {
    sleepTimelineChartInstance.destroy();
  }

  const labels = timelineData.map(d => d.startLabel);
  const levelMap = { 'AWAKE': 4, 'REM': 3, 'LIGHT': 2, 'DEEP': 1 };
  const values = timelineData.map(d => levelMap[d.type] || 2);

  sleepTimelineChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Fase',
        data: values,
        borderColor: '#a855f7',
        backgroundColor: 'rgba(168, 85, 247, 0.15)',
        stepped: 'before',
        borderWidth: 2,
        fill: true,
        pointRadius: 3,
        pointBackgroundColor: timelineData.map(d => {
          if (d.type === 'DEEP') return '#3b82f6';
          if (d.type === 'REM') return '#8b5cf6';
          if (d.type === 'LIGHT') return '#10b981';
          return '#f59e0b';
        }),
        pointBorderColor: '#fff',
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          titleColor: '#fff',
          bodyColor: '#e2e8f0',
          padding: 10,
          displayColors: false,
          callbacks: {
            label: (ctx) => {
              const item = timelineData[ctx.dataIndex];
              return `Fase: ${item.stageName} (${item.duration} min, ${item.startLabel} - ${item.endLabel})`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#64748b',
            maxTicksLimit: 10,
            font: { size: 10 }
          }
        },
        y: {
          min: 0.5,
          max: 4.5,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            stepSize: 1,
            color: '#94a3b8',
            font: { size: 11, weight: '600' },
            callback: (val) => {
              if (val === 4) return 'Despierto';
              if (val === 3) return 'REM';
              if (val === 2) return 'Ligero';
              if (val === 1) return 'Profundo';
              return '';
            }
          }
        }
      }
    }
  });
}

// --- Manejo de Retorno de Autorización OAuth ---
function handleAuthUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('auth_success')) {
    showToast('¡Conectado exitosamente con Google Health API!', 4000);
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (urlParams.has('auth_error')) {
    showToast(`Error de autorización: ${urlParams.get('auth_error')}`, 5000);
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// --- Análisis de Correlación: Actividad del Día vs Sueño de Esa Noche ---
const CORRELATION_METRIC_LABELS = {
  steps: 'Pasos',
  calories: 'Calorías',
  restingHeartRate: 'Ritmo cardíaco en reposo',
  activeMinutes: 'Minutos activos'
};

elements.runCorrelationBtn?.addEventListener('click', runCorrelationAnalysis);

async function runCorrelationAnalysis() {
  const days = elements.correlationDaysSelect?.value || 14;
  if (elements.runCorrelationBtn) {
    elements.runCorrelationBtn.disabled = true;
    elements.runCorrelationBtn.textContent = 'Analizando...';
  }
  if (elements.correlationResults) {
    elements.correlationResults.innerHTML = '<p class="correlation-placeholder">Consultando tu historial, puede tardar unos segundos...</p>';
  }

  try {
    const res = await fetch(`/api/health/correlation?days=${days}&endDate=${currentDate}`);
    const data = await res.json();
    renderCorrelationResults(data);
  } catch (err) {
    console.error('Error al analizar correlación:', err);
    if (elements.correlationResults) {
      elements.correlationResults.innerHTML = '<p class="correlation-placeholder">Ocurrió un error al analizar los datos. Intenta de nuevo.</p>';
    }
  } finally {
    if (elements.runCorrelationBtn) {
      elements.runCorrelationBtn.disabled = false;
      elements.runCorrelationBtn.textContent = 'Analizar';
    }
  }
}

function renderCorrelationResults(data) {
  if (!elements.correlationResults) return;

  if (!data.ok) {
    elements.correlationResults.innerHTML = `<p class="correlation-placeholder">${data.message}</p>`;
    return;
  }

  lastCorrelationPairs = data.pairs;
  lastCorrelationData = data;

  const sleepScoreCorrs = data.correlations.filter(c => c.target === 'sleepScore');
  const boxesHtml = sleepScoreCorrs.map(c => {
    const tagClass = c.r > 0.15 ? 'corr-positive' : c.r < -0.15 ? 'corr-negative' : 'corr-neutral';
    return `
      <div class="corr-stat-box">
        <span class="corr-label">${c.metricLabel} → Sueño</span>
        <span class="corr-value">r = ${c.r}</span>
        <span class="corr-tag ${tagClass}">${c.strength}</span>
      </div>
    `;
  }).join('');

  elements.correlationResults.innerHTML = `
    <div class="correlation-summary-grid">${boxesHtml}</div>
    <div class="metric-select-row">
      <label for="scatter-metric-select">Ver dispersión de:</label>
      <select id="scatter-metric-select">
        <option value="steps">Pasos</option>
        <option value="calories">Calorías</option>
        <option value="restingHeartRate">Ritmo cardíaco en reposo</option>
        <option value="activeMinutes" selected>Minutos activos</option>
      </select>
    </div>
    <div class="chart-container correlation-chart-container">
      <canvas id="correlationScatterChart"></canvas>
    </div>
    <p class="correlation-note">
      ${data.demoMode ? 'Modo demostración (datos simulados). ' : ''}
      Basado en ${data.nights} noche(s) con datos completos de los últimos ${data.days} días.
      Cada punto compara la actividad de un día con el sueño de la noche que sigue.
    </p>
    <div class="ai-insight-section">
      <button id="run-ai-insight-btn" class="btn btn-ai">✨ Analizar con IA</button>
      <div id="ai-insight-result"></div>
    </div>
  `;

  document.getElementById('scatter-metric-select')?.addEventListener('change', (e) => {
    renderCorrelationScatter(lastCorrelationPairs, e.target.value);
  });
  renderCorrelationScatter(lastCorrelationPairs, 'activeMinutes');

  document.getElementById('run-ai-insight-btn')?.addEventListener('click', runAiInsight);
}

// Escapa HTML y convierte **negrita** / líneas "- " en texto legible y seguro
function formatAiInsight(text) {
  const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      let escaped = escapeHtml(line.trim()).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      if (escaped.startsWith('- ')) escaped = `• ${escaped.slice(2)}`;
      return `<p>${escaped}</p>`;
    })
    .join('');
}

async function runAiInsight() {
  const btn = document.getElementById('run-ai-insight-btn');
  const resultBox = document.getElementById('ai-insight-result');
  if (!lastCorrelationData || !btn || !resultBox) return;

  btn.disabled = true;
  btn.textContent = 'Pensando...';
  resultBox.innerHTML = '<p class="correlation-placeholder">Generando análisis con IA...</p>';

  try {
    const res = await fetch('/api/health/ai-insight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lastCorrelationData)
    });
    const data = await res.json();
    if (data.ok) {
      resultBox.innerHTML = `<div class="ai-insight-box">${formatAiInsight(data.insight)}</div>`;
    } else {
      resultBox.innerHTML = `<p class="correlation-placeholder">${data.message || 'No se pudo generar el análisis.'}</p>`;
    }
  } catch (err) {
    console.error('Error en análisis de IA:', err);
    resultBox.innerHTML = '<p class="correlation-placeholder">Ocurrió un error al conectar con la IA. Intenta de nuevo.</p>';
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ Analizar con IA';
  }
}

function renderCorrelationScatter(pairs, metricKey) {
  const canvas = document.getElementById('correlationScatterChart');
  if (!canvas || !pairs) return;
  const ctx = canvas.getContext('2d');

  if (correlationScatterChartInstance) {
    correlationScatterChartInstance.destroy();
  }

  const label = CORRELATION_METRIC_LABELS[metricKey] || metricKey;
  const points = pairs
    .filter(p => p[metricKey] != null && p.sleepScore != null)
    .map(p => ({ x: p[metricKey], y: p.sleepScore, date: p.nightOf }));

  correlationScatterChartInstance = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: `${label} vs Puntuación de Sueño`,
        data: points,
        backgroundColor: 'rgba(16, 185, 129, 0.7)',
        pointRadius: 6,
        pointHoverRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          titleColor: '#fff',
          bodyColor: '#e2e8f0',
          padding: 10,
          callbacks: {
            title: (items) => `Noche del ${points[items[0].dataIndex]?.date || ''}`,
            label: (ctx) => `${label}: ${ctx.parsed.x} · Sueño: ${ctx.parsed.y}/100`
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: label, color: '#64748b' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b' }
        },
        y: {
          title: { display: true, text: 'Puntuación de Sueño (0-100)', color: '#64748b' },
          min: 0,
          max: 100,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b' }
        }
      }
    }
  });
}

// Inicializar la aplicación
handleAuthUrlParams();
loadStatus();
loadHealthData();


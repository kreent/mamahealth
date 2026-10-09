import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isServerless,
  readConfig,
  writeConfig,
  readTokens,
  writeTokens,
  clearTokens,
  readRequestBody
} from './store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DEFAULT_PORT = process.env.PORT || 3000;

// Scopes de Google Health API
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
].join(' ');

// --- Obtener (y si hace falta, renovar) un access_token válido ---
async function getValidAccessToken() {
  const config = readConfig();
  const tokens = readTokens();

  // En local reusamos el access_token cacheado mientras siga vigente, para no
  // golpear el endpoint de refresh en cada carga. En serverless nunca hay uno
  // cacheado (writeTokens no persiste), así que esto simplemente no aplica ahí.
  if (!isServerless() && tokens.access_token && tokens.expires_at && tokens.expires_at > Date.now() + 60000) {
    return tokens.access_token;
  }

  if (!tokens.refresh_token) {
    if (tokens.access_token) return tokens.access_token;
    console.warn('No hay refresh_token disponible. El usuario debe volver a autenticarse.');
    return null;
  }

  try {
    console.log('Renovando access_token de Google Health API...');
    const params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token'
    });

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const data = await res.json();
    if (data.error) {
      console.error('Error al renovar token:', data);
      return null;
    }

    writeTokens({
      ...tokens,
      access_token: data.access_token,
      expires_at: Date.now() + (data.expires_in * 1000)
    });
    return data.access_token;
  } catch (err) {
    console.error('Fallo en la llamada de refresh token:', err.message);
    return null;
  }
}

function dateSeedFactor(dateStr) {
  const seed = dateStr.split('-').reduce((acc, part) => acc + parseInt(part, 10), 0);
  return (seed % 10) / 10; // entre 0.0 y 0.9
}

function formatClock(decimalHours) {
  const h = Math.floor(decimalHours) % 24;
  const m = Math.floor((decimalHours % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Historial demo de sueño (últimos N días hasta dateStr), con horario de dormir/despertar
function generateDemoSleepHistory(dateStr, days = 14) {
  const history = [];
  const endDate = new Date(`${dateStr}T00:00:00Z`);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endDate);
    d.setUTCDate(d.getUTCDate() - i);
    const fullDate = d.toISOString().split('T')[0];
    const factor = dateSeedFactor(fullDate);

    const totalAsleep = Math.floor(360 + factor * 180); // 6h a 9h
    const deep = Math.floor(totalAsleep * 0.22);
    const rem = Math.floor(totalAsleep * 0.24);
    const light = totalAsleep - deep - rem;
    const awake = Math.floor(10 + factor * 60);
    const score = Math.min(98, Math.floor(68 + factor * 28));

    const bedtimeDecimal = (22 + factor * 2.5) % 24; // ~22:00 a 00:30
    const waketimeDecimal = (bedtimeDecimal + (totalAsleep + awake) / 60) % 24;

    history.push({
      date: new Date(`${fullDate}T12:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
      fullDate,
      totalAsleepHours: +(totalAsleep / 60).toFixed(1),
      totalAsleepMinutes: totalAsleep,
      totalFormatted: `${Math.floor(totalAsleep / 60)}h ${totalAsleep % 60}m`,
      deepHours: +(deep / 60).toFixed(1),
      deepMinutes: deep,
      remHours: +(rem / 60).toFixed(1),
      remMinutes: rem,
      lightHours: +(light / 60).toFixed(1),
      lightMinutes: light,
      awakeMinutes: awake,
      efficiency: Math.round((totalAsleep / (totalAsleep + awake)) * 100),
      score,
      startClock: formatClock(bedtimeDecimal),
      endClock: formatClock(waketimeDecimal)
    });
  }
  return history;
}

// --- Generador de Datos Demo Realistas ---
function generateRealisticData(dateStr) {
  const factor = dateSeedFactor(dateStr);

  const baseSteps = Math.floor(7500 + factor * 5000);
  const targetSteps = 10000;
  const baseDistance = +(baseSteps * 0.00078).toFixed(2); // km
  const calories = Math.floor(1800 + factor * 600);
  const activeMinutes = Math.floor(35 + factor * 40);

  const avgRestingHeartRate = Math.floor(62 + factor * 8);
  const currentHeartRate = Math.floor(68 + Math.random() * 15);

  const hourlySteps = [];
  const hourlyHeartRate = [];

  for (let h = 0; h < 24; h++) {
    let stepsInHour = 0;
    let bpm = 58 + Math.floor(Math.sin(h / 3) * 6);

    if (h >= 6 && h <= 22) {
      if (h === 7 || h === 8 || h === 18 || h === 19) {
        stepsInHour = Math.floor(800 + factor * 700 + Math.random() * 400);
        bpm = Math.floor(95 + factor * 25 + Math.random() * 15);
      } else if (h === 13 || h === 14) {
        stepsInHour = Math.floor(400 + Math.random() * 300);
        bpm = Math.floor(78 + Math.random() * 10);
      } else {
        stepsInHour = Math.floor(150 + Math.random() * 250);
        bpm = Math.floor(68 + Math.random() * 12);
      }
    } else {
      stepsInHour = 0;
      bpm = Math.floor(54 + Math.random() * 8);
    }

    hourlySteps.push({ hour: `${h}:00`, steps: stepsInHour });
    hourlyHeartRate.push({ hour: `${h}:00`, bpm });
  }

  const totalSleepMinutes = Math.floor(420 + factor * 60); // 7h a 8h
  const deepSleepMinutes = Math.floor(totalSleepMinutes * 0.22);
  const remSleepMinutes = Math.floor(totalSleepMinutes * 0.24);
  const lightSleepMinutes = totalSleepMinutes - deepSleepMinutes - remSleepMinutes;
  const sleepScore = Math.min(98, Math.floor(75 + factor * 20));

  return {
    date: dateStr,
    isDemo: true,
    device: {
      model: 'Banda Inteligente (Google Health)',
      battery: '82%',
      lastSync: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    },
    summary: {
      steps: {
        total: baseSteps,
        goal: targetSteps,
        percentage: Math.round((baseSteps / targetSteps) * 100)
      },
      heartRate: {
        current: currentHeartRate,
        resting: avgRestingHeartRate,
        min: 52,
        max: 138
      },
      calories: {
        total: calories,
        active: Math.floor(calories * 0.38),
        bmr: Math.floor(calories * 0.62)
      },
      distance: {
        km: baseDistance,
        unit: 'km'
      },
      activeMinutes: {
        total: activeMinutes,
        goal: 60
      },
      sleep: {
        score: sleepScore,
        totalHours: `${Math.floor(totalSleepMinutes / 60)}h ${totalSleepMinutes % 60}m`,
        totalMinutes: totalSleepMinutes,
        deep: `${Math.floor(deepSleepMinutes / 60)}h ${deepSleepMinutes % 60}m`,
        rem: `${Math.floor(remSleepMinutes / 60)}h ${remSleepMinutes % 60}m`,
        light: `${Math.floor(lightSleepMinutes / 60)}h ${lightSleepMinutes % 60}m`,
        efficiency: '88%'
      },
      spo2: {
        avgPercentage: '97%'
      }
    },
    sleepDetails: {
      history: generateDemoSleepHistory(dateStr),
      timeline: []
    },
    charts: {
      stepsPerHour: hourlySteps,
      heartRateTimeline: hourlyHeartRate,
      sleepStages: [
        { stage: 'Profundo', minutes: deepSleepMinutes, color: '#3b82f6' },
        { stage: 'REM', minutes: remSleepMinutes, color: '#8b5cf6' },
        { stage: 'Ligero', minutes: lightSleepMinutes, color: '#10b981' }
      ]
    }
  };
}

// --- Elegir, por cada día, la sesión de sueño PRINCIPAL (descarta siestas) ---
function pickMainSleepPerDay(sleepPoints) {
  const byDay = new Map();
  for (const dp of sleepPoints || []) {
    const s = dp.sleep;
    if (!s) continue;
    const civilEnd = s.interval?.civilEndTime?.date;
    const key = civilEnd
      ? `${civilEnd.year}-${String(civilEnd.month).padStart(2, '0')}-${String(civilEnd.day).padStart(2, '0')}`
      : (s.interval?.endTime || '').split('T')[0];
    if (!key) continue;

    const existing = byDay.get(key);
    if (!existing) {
      byDay.set(key, s);
      continue;
    }
    const isMain = s.metadata?.mainSleep === true;
    const existingIsMain = existing.metadata?.mainSleep === true;
    const dur = Number(s.summary?.minutesAsleep) || 0;
    const existingDur = Number(existing.summary?.minutesAsleep) || 0;
    if (isMain && !existingIsMain) byDay.set(key, s);
    else if (isMain === existingIsMain && dur > existingDur) byDay.set(key, s);
  }
  return byDay;
}

// --- Consultar Google Health API Real ---
async function fetchGoogleHealthData(token, dateStr) {
  try {
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    };

    const maxPageSize = (dataType) => (dataType === 'sleep' || dataType === 'exercise') ? 25 : 10000;
    const buildUrl = (dataType, filterParam, pageSize, dataSourceFamily) => {
      let url = `https://health.googleapis.com/v4/users/me/dataTypes/${dataType}/dataPoints?pageSize=${pageSize}`;
      if (filterParam) url += `&filter=${encodeURIComponent(filterParam)}`;
      if (dataSourceFamily) url += `&dataSourceFamily=${encodeURIComponent(`users/me/dataSourceFamilies/${dataSourceFamily}`)}`;
      return url;
    };
    const fetchMetric = async (dataType, filterParam = null, { preferWearable = false } = {}) => {
      const pageSize = maxPageSize(dataType);
      let url = buildUrl(dataType, filterParam, pageSize, preferWearable ? 'google-wearables' : null);

      try {
        let res = await fetch(url, { headers });
        if (!res.ok && filterParam) {
          console.warn(`⚠️ [Google Health] Filtro rechazado para ${dataType} (${res.status}): ${await res.text()}. Reintentando SIN filtro de fecha (datos no estarán acotados al día pedido).`);
          url = buildUrl(dataType, null, pageSize, preferWearable ? 'google-wearables' : null);
          res = await fetch(url, { headers });
        }

        if (!res.ok) {
          console.warn(`Respuesta no-ok para ${dataType} (${res.status}):`, await res.text());
          return null;
        }

        let json = await res.json();

        if (preferWearable && (!json.dataPoints || json.dataPoints.length === 0)) {
          const fallbackUrl = buildUrl(dataType, filterParam, pageSize, null);
          const fallbackRes = await fetch(fallbackUrl, { headers });
          if (fallbackRes.ok) {
            json = await fallbackRes.json();
            if (json.dataPoints?.length) {
              console.log(`ℹ️ [Google Health] ${dataType}: sin datos de la banda ese día, usando todas las fuentes (${json.dataPoints.length} puntos)`);
            }
          }
        }

        console.log(`✅ [Google Health] ${dataType}:`, json.dataPoints ? `${json.dataPoints.length} puntos` : '0 puntos');
        return json;
      } catch (e) {
        console.warn(`Error al consultar ${dataType}:`, e.message);
        return null;
      }
    };

    const fetchSleepHistoryPaginated = async (filterParam, maxPages = 4) => {
      let allPoints = [];
      let pageToken = null;
      for (let page = 0; page < maxPages; page++) {
        let url = `https://health.googleapis.com/v4/users/me/dataTypes/sleep/dataPoints?pageSize=25&filter=${encodeURIComponent(filterParam)}`;
        if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
        try {
          const res = await fetch(url, { headers });
          if (!res.ok) {
            console.warn(`Respuesta no-ok para sleep (historial, ${res.status}):`, await res.text());
            break;
          }
          const json = await res.json();
          if (json.dataPoints) allPoints = allPoints.concat(json.dataPoints);
          if (!json.nextPageToken) break;
          pageToken = json.nextPageToken;
        } catch (e) {
          console.warn('Error al consultar sleep (historial):', e.message);
          break;
        }
      }
      console.log(`✅ [Google Health] sleep (historial 2 semanas): ${allPoints.length} puntos`);
      return { dataPoints: allPoints };
    };

    const nextDay = new Date(`${dateStr}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const nextDateStr = nextDay.toISOString().split('T')[0];

    const filterInterval = (type) => `${type}.interval.civil_start_time >= "${dateStr}" AND ${type}.interval.civil_start_time < "${nextDateStr}"`;
    const filterSample = (type) => `${type}.sample_time.civil_time >= "${dateStr}" AND ${type}.sample_time.civil_time < "${nextDateStr}"`;
    const filterSleep = `sleep.interval.civil_end_time >= "${dateStr}" AND sleep.interval.civil_end_time < "${nextDateStr}"`;
    const filterDailySummary = (type) => `${type}.date >= "${dateStr}" AND ${type}.date < "${nextDateStr}"`;

    const historyStart = new Date(`${dateStr}T00:00:00Z`);
    historyStart.setUTCDate(historyStart.getUTCDate() - 13);
    const historyStartStr = historyStart.toISOString().split('T')[0];
    const filterSleepHistory = `sleep.interval.civil_end_time >= "${historyStartStr}" AND sleep.interval.civil_end_time < "${nextDateStr}"`;

    const [stepsData, hrData, sleepData, distData, spo2Data, activeMinData, activeCalData, basalCalData, restingHrData, sleepHistoryData] = await Promise.all([
      fetchMetric('steps', filterInterval('steps'), { preferWearable: true }),
      fetchMetric('heart-rate', filterSample('heart_rate'), { preferWearable: true }),
      fetchMetric('sleep', filterSleep),
      fetchMetric('distance', filterInterval('distance'), { preferWearable: true }),
      fetchMetric('oxygen-saturation', filterSample('oxygen_saturation'), { preferWearable: true }),
      fetchMetric('active-minutes', filterInterval('active_minutes'), { preferWearable: true }),
      fetchMetric('active-energy-burned', filterInterval('active_energy_burned'), { preferWearable: true }),
      fetchMetric('basal-energy-burned', filterInterval('basal_energy_burned'), { preferWearable: true }),
      fetchMetric('daily-resting-heart-rate', filterDailySummary('daily_resting_heart_rate'), { preferWearable: true }),
      fetchSleepHistoryPaginated(filterSleepHistory)
    ]);

    const defaultData = generateRealisticData(dateStr);

    let hasRealData = false;
    let deviceDisplayName = 'Google Fitbit Air';

    for (const dataSet of [stepsData, hrData, sleepData, distData]) {
      const dev = dataSet?.dataPoints?.[0]?.dataSource?.device?.displayName;
      if (dev) {
        deviceDisplayName = dev;
        break;
      }
    }

    let totalSteps = 0;
    const hourlyStepsMap = {};
    if (stepsData?.dataPoints && stepsData.dataPoints.length > 0) {
      hasRealData = true;
      for (const dp of stepsData.dataPoints) {
        const count = Number(dp.steps?.count) || 0;
        totalSteps += count;

        const timeStr = dp.steps?.interval?.startTime || '';
        if (timeStr) {
          const hour = new Date(timeStr).getHours();
          hourlyStepsMap[hour] = (hourlyStepsMap[hour] || 0) + count;
        }
      }
    }

    let currentBpm = null;
    let minBpm = null;
    let maxBpm = null;
    const hrTimeline = [];
    if (hrData?.dataPoints && hrData.dataPoints.length > 0) {
      hasRealData = true;
      const bpms = [];
      for (const dp of hrData.dataPoints) {
        const bpm = Number(dp.heartRate?.beatsPerMinute) || 0;
        if (bpm > 30 && bpm < 220) {
          bpms.push(bpm);
          const timeStr = dp.heartRate?.sampleTime?.physicalTime || '';
          const hour = timeStr ? `${new Date(timeStr).getHours()}:00` : `${hrTimeline.length}:00`;
          hrTimeline.push({ hour, bpm });
        }
      }
      if (bpms.length > 0) {
        currentBpm = bpms[bpms.length - 1];
        minBpm = Math.min(...bpms);
        maxBpm = Math.max(...bpms);
      }
    }

    let restingBpm = null;
    if (restingHrData?.dataPoints && restingHrData.dataPoints.length > 0) {
      hasRealData = true;
      const bpm = Number(restingHrData.dataPoints[0].dailyRestingHeartRate?.beatsPerMinute) || 0;
      if (bpm > 0) restingBpm = bpm;
    }

    let realSleepSummary = null;
    let realSleepStages = null;
    let realSleepHistory = [];
    let realStagesTimeline = [];
    if (sleepData?.dataPoints && sleepData.dataPoints.length > 0) {
      hasRealData = true;

      const mainSleepByDay = pickMainSleepPerDay(sleepData.dataPoints);
      let targetSleep = mainSleepByDay.get(dateStr) || sleepData.dataPoints[0].sleep;

      if (targetSleep?.summary) {
        const sum = targetSleep.summary;
        const minAsleep = Number(sum.minutesAsleep) || 0;
        const minInBed = Number(sum.minutesInSleepPeriod) || minAsleep;

        let deepMin = 0;
        let remMin = 0;
        let lightMin = 0;
        let awakeMin = Number(sum.minutesAwake) || 0;

        if (Array.isArray(sum.stagesSummary)) {
          for (const stage of sum.stagesSummary) {
            const m = Number(stage.minutes) || 0;
            if (stage.type === 'DEEP') deepMin = m;
            else if (stage.type === 'REM') remMin = m;
            else if (stage.type === 'LIGHT') lightMin = m;
            else if (stage.type === 'AWAKE') awakeMin = m;
          }
        }

        const efficiencyPct = minInBed > 0 ? Math.round((minAsleep / minInBed) * 100) : 90;
        const sleepScore = Math.min(100, Math.max(50, Math.round(efficiencyPct * 0.96)));

        realSleepSummary = {
          score: sleepScore,
          totalHours: `${Math.floor(minAsleep / 60)}h ${minAsleep % 60}m`,
          totalMinutes: minAsleep,
          deep: `${Math.floor(deepMin / 60)}h ${deepMin % 60}m`,
          rem: `${Math.floor(remMin / 60)}h ${remMin % 60}m`,
          light: `${Math.floor(lightMin / 60)}h ${lightMin % 60}m`,
          efficiency: `${efficiencyPct}%`
        };

        realSleepStages = [
          { stage: 'Profundo', minutes: deepMin, color: '#3b82f6' },
          { stage: 'REM', minutes: remMin, color: '#8b5cf6' },
          { stage: 'Ligero', minutes: lightMin, color: '#10b981' }
        ];

        console.log(`✅ [Google Health] Sueño real procesado: ${realSleepSummary.totalHours} (Score: ${sleepScore})`);
      }

      const historySleepByDay = pickMainSleepPerDay(sleepHistoryData?.dataPoints);
      realSleepHistory = Array.from(historySleepByDay.values()).map(s => {
        const interval = s?.interval;
        const sEnd = interval?.endTime || '';
        const sStart = interval?.startTime || '';
        const dateObj = sEnd ? new Date(sEnd) : (sStart ? new Date(sStart) : new Date());
        const dateLabel = dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });

        const stages = s?.summary?.stagesSummary || [];
        const getMin = (t) => Number(stages.find(x => x.type === t)?.minutes) || 0;
        const totalAsleep = Number(s?.summary?.minutesAsleep) || 0;
        const deep = getMin('DEEP');
        const rem = getMin('REM');
        const light = getMin('LIGHT');
        const awake = getMin('AWAKE');
        const totalInBed = Number(s?.summary?.minutesInSleepPeriod) || (totalAsleep + awake);
        const eff = totalInBed > 0 ? Math.round((totalAsleep / totalInBed) * 100) : 90;
        const sc = Math.min(100, Math.max(50, Math.round(eff * 0.96)));

        return {
          date: dateLabel,
          fullDate: sEnd ? sEnd.split('T')[0] : (sStart ? sStart.split('T')[0] : ''),
          startClock: sStart ? new Date(sStart).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '--:--',
          endClock: sEnd ? new Date(sEnd).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '--:--',
          totalAsleepHours: +(totalAsleep / 60).toFixed(1),
          totalAsleepMinutes: totalAsleep,
          totalFormatted: `${Math.floor(totalAsleep / 60)}h ${totalAsleep % 60}m`,
          deepHours: +(deep / 60).toFixed(1),
          deepMinutes: deep,
          remHours: +(rem / 60).toFixed(1),
          remMinutes: rem,
          lightHours: +(light / 60).toFixed(1),
          lightMinutes: light,
          awakeMinutes: awake,
          efficiency: eff,
          score: sc
        };
      }).reverse();

      realStagesTimeline = (targetSleep?.stages || []).map(st => {
        const sStart = new Date(st.startTime);
        const sEnd = new Date(st.endTime);
        const durMin = Math.round((sEnd - sStart) / 60000);
        return {
          startTime: st.startTime,
          endTime: st.endTime,
          type: st.type,
          duration: durMin,
          startLabel: sStart.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
          endLabel: sEnd.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
          stageName: st.type === 'DEEP' ? 'Profundo' : st.type === 'REM' ? 'REM' : st.type === 'LIGHT' ? 'Ligero' : 'Despierto'
        };
      });
    }

    let totalKm = 0;
    if (distData?.dataPoints && distData.dataPoints.length > 0) {
      let totalMm = 0;
      for (const dp of distData.dataPoints) {
        totalMm += Number(dp.distance?.millimeters) || 0;
      }
      if (totalMm > 0) {
        totalKm = +(totalMm / 1000000).toFixed(2);
      }
    }

    let realSpo2 = null;
    if (spo2Data?.dataPoints && spo2Data.dataPoints.length > 0) {
      const pct = spo2Data.dataPoints[0].oxygenSaturation?.percentage;
      if (pct) realSpo2 = `${pct}%`;
    }

    let totalActiveMinutes = 0;
    if (activeMinData?.dataPoints && activeMinData.dataPoints.length > 0) {
      for (const dp of activeMinData.dataPoints) {
        const levels = dp.activeMinutes?.activeMinutesByActivityLevel || [];
        for (const l of levels) {
          totalActiveMinutes += Number(l.activeMinutes) || 0;
        }
      }
    }

    let activeKcal = 0;
    let basalKcal = 0;
    let hasCalorieData = false;
    if (activeCalData?.dataPoints && activeCalData.dataPoints.length > 0) {
      hasCalorieData = true;
      for (const dp of activeCalData.dataPoints) {
        activeKcal += Number(dp.activeEnergyBurned?.kcal) || 0;
      }
    }
    if (basalCalData?.dataPoints && basalCalData.dataPoints.length > 0) {
      hasCalorieData = true;
      for (const dp of basalCalData.dataPoints) {
        basalKcal += Number(dp.basalEnergyBurned?.kcal) || 0;
      }
    }
    if (hasCalorieData) hasRealData = true;
    const totalKcal = Math.round(activeKcal + basalKcal);

    if (hasRealData) {
      const hourlySteps = defaultData.charts.stepsPerHour.map(item => {
        const h = parseInt(item.hour, 10);
        return {
          hour: item.hour,
          steps: hourlyStepsMap[h] !== undefined ? hourlyStepsMap[h] : 0
        };
      });

      return {
        ...defaultData,
        isDemo: false,
        device: {
          model: deviceDisplayName,
          battery: 'Conectado',
          lastSync: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        },
        summary: {
          ...defaultData.summary,
          steps: {
            total: totalSteps,
            goal: 10000,
            percentage: Math.round((totalSteps / 10000) * 100)
          },
          heartRate: {
            current: currentBpm || defaultData.summary.heartRate.current,
            resting: restingBpm || defaultData.summary.heartRate.resting,
            min: minBpm || defaultData.summary.heartRate.min,
            max: maxBpm || defaultData.summary.heartRate.max
          },
          sleep: realSleepSummary || defaultData.summary.sleep,
          calories: hasCalorieData ? {
            total: totalKcal,
            active: Math.round(activeKcal),
            bmr: Math.round(basalKcal)
          } : defaultData.summary.calories,
          distance: {
            km: totalKm || defaultData.summary.distance.km,
            unit: 'km'
          },
          activeMinutes: {
            total: totalActiveMinutes || defaultData.summary.activeMinutes.total,
            goal: 60
          },
          spo2: {
            avgPercentage: realSpo2 || defaultData.summary.spo2.avgPercentage
          }
        },
        sleepDetails: {
          history: realSleepHistory && realSleepHistory.length > 0 ? realSleepHistory : defaultData.sleepDetails.history,
          timeline: realStagesTimeline || []
        },
        charts: {
          ...defaultData.charts,
          stepsPerHour: Object.keys(hourlyStepsMap).length > 0 ? hourlySteps : defaultData.charts.stepsPerHour,
          heartRateTimeline: hrTimeline.length > 0 ? hrTimeline : defaultData.charts.heartRateTimeline,
          sleepStages: realSleepStages || defaultData.charts.sleepStages
        }
      };
    }
  } catch (err) {
    console.error('Error al procesar Google Health API:', err);
  }

  const fallback = generateRealisticData(dateStr);
  fallback.isDemo = false;
  fallback.notice = 'Tu cuenta de Google Health está conectada con éxito. Si tu banda aún no ha sincronizado datos con la nube de Google para hoy, verás valores de referencia hasta que la app de tu banda sincronice.';
  return fallback;
}

// --- Obtener los datos de un día (demo o reales, según configuración) ---
async function getHealthDataForDate(dateStr) {
  const config = readConfig();

  if (config.demoMode) {
    return generateRealisticData(dateStr);
  }

  const token = await getValidAccessToken();
  if (!token) {
    const demoData = generateRealisticData(dateStr);
    demoData.notice = 'No hay sesión de Google activa o el token expiró. Mostrando datos de demostración.';
    return demoData;
  }

  return await fetchGoogleHealthData(token, dateStr);
}

// --- Correlación de Pearson entre dos listas numéricas ---
function pearsonCorrelation(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  if (den === 0) return 0;
  return num / den;
}

function correlationStrength(r) {
  const abs = Math.abs(r);
  let strength;
  if (abs < 0.2) strength = 'nula o muy débil';
  else if (abs < 0.4) strength = 'débil';
  else if (abs < 0.6) strength = 'moderada';
  else if (abs < 0.8) strength = 'fuerte';
  else strength = 'muy fuerte';
  if (abs < 0.2) return strength;
  return `${strength} ${r > 0 ? 'positiva' : 'negativa'}`;
}

// --- Prompt para el análisis con IA de la relación actividad/sueño ---
function buildAiInsightPrompt({ pairs = [], correlations = [], days, nights, demoMode }) {
  const tableRows = pairs.map(p =>
    `${p.date} → noche del ${p.nightOf}: ${p.steps} pasos, ${p.calories} kcal activas, ${p.restingHeartRate} bpm en reposo, ${p.activeMinutes} min activos | Sueño: score ${p.sleepScore}/100, ${p.sleepEfficiency}% eficiencia, ${p.sleepMinutes} min dormidos`
  ).join('\n');

  const corrLines = correlations
    .filter(c => c.target === 'sleepScore' && c.r !== null)
    .map(c => `- ${c.metricLabel} vs. puntuación de sueño: r = ${c.r} (${c.strength}, n=${c.n})`)
    .join('\n');

  return `Eres un asistente de salud y bienestar. Un usuario de una app de banda inteligente quiere entender si su actividad diaria (pasos, calorías activas, ritmo cardíaco en reposo, minutos activos) se relaciona con la calidad del sueño de esa misma noche.

${demoMode ? 'IMPORTANTE: estos son datos SIMULADOS de demostración, acláralo brevemente al usuario.' : ''}

Datos de los últimos ${days} días (${nights} noches con datos completos). Cada fila compara la actividad de un día con el sueño de la noche que sigue:
${tableRows}

Correlaciones de Pearson ya calculadas (coeficiente r, de -1 a 1):
${corrLines}

Escribe un análisis breve en español (máximo 180 palabras), tono cercano y claro, sin jerga estadística innecesaria:
1. Qué patrón(es) real(es) se observan en estos datos (o si no hay ninguno claro, dilo honestamente).
2. Una aclaración de que correlación no es causalidad y que la muestra es pequeña, en una sola frase breve.
3. 2 o 3 sugerencias prácticas y específicas basadas en los datos (no genéricas de internet).

No uses markdown con encabezados ni tablas, solo texto corrido o una lista corta con guiones.`;
}

// --- Página mostrada tras conectar en Vercel (no hay dónde guardar el token) ---
function renderServerlessTokenPage({ refreshToken, userEmail }) {
  const safeToken = refreshToken
    ? refreshToken.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    : '';
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Conectado con Google Health</title></head>
<body style="font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;line-height:1.6;color:#1f2937">
  <h2>✅ Conectado con Google Health</h2>
  <p>Vercel no tiene dónde guardar este token automáticamente (no hay disco persistente entre peticiones). Cópialo y agrégalo como variable de entorno en tu proyecto de Vercel para que el dashboard muestre datos reales:</p>
  <p><b>Nombre de la variable:</b> <code>GOOGLE_REFRESH_TOKEN</code></p>
  <p><b>Valor:</b></p>
  ${refreshToken
    ? `<textarea readonly style="width:100%;height:70px;font-family:monospace;padding:8px;box-sizing:border-box">${safeToken}</textarea>`
    : `<p style="color:#b91c1c">Google no devolvió un refresh_token nuevo esta vez (normalmente solo lo entrega la primera vez que autorizas la app). Si ya tienes uno guardado, puedes seguir usándolo. Si necesitas uno nuevo, revoca el acceso en <a href="https://myaccount.google.com/permissions" target="_blank">myaccount.google.com/permissions</a> y vuelve a conectar.</p>`
  }
  <p>Cuenta conectada: <b>${userEmail}</b></p>
  <p>Después de agregar la variable (Project Settings → Environment Variables), haz un <b>redeploy</b> para que tome efecto.</p>
  <p><a href="/">← Volver al dashboard</a></p>
</body></html>`;
}

// --- Manejador principal de peticiones (compartido entre servidor local y Vercel) ---
export async function handleRequest(req, res) {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  // /auth/* y /oauth2callback llegan vía un rewrite de Vercel (no son rutas
  // nativas bajo /api/), que pasa el path real explícitamente en __hm_path
  // para no depender de cómo Vercel reescriba req.url internamente.
  const pathname = reqUrl.searchParams.get('__hm_path') || reqUrl.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. Endpoint: Estado del Sistema y Autenticación
  if (pathname === '/api/status' && req.method === 'GET') {
    const config = readConfig();
    const tokens = readTokens();
    const hasConfig = Boolean(config.clientId && config.clientSecret);
    const hasTokens = Boolean(tokens.refresh_token || tokens.access_token);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      configured: hasConfig,
      authenticated: hasTokens,
      demoMode: Boolean(config.demoMode),
      clientId: config.clientId ? `${config.clientId.substring(0, 15)}...` : '',
      userEmail: tokens.userEmail || (hasTokens ? 'Usuario conectado' : null),
      serverless: isServerless()
    }));
    return;
  }

  // 2. Endpoint: Guardar Configuración (Client ID / Secret / Demo mode)
  if (pathname === '/api/config' && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      const current = readConfig();
      const updated = writeConfig({
        clientId: payload.clientId !== undefined ? payload.clientId.trim() : current.clientId,
        clientSecret: payload.clientSecret !== undefined ? payload.clientSecret.trim() : current.clientSecret,
        demoMode: payload.demoMode !== undefined ? Boolean(payload.demoMode) : current.demoMode
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        // Nunca devolver secretos en la respuesta HTTP (clientSecret, geminiApiKey)
        config: {
          clientId: updated.clientId,
          demoMode: updated.demoMode
        },
        serverless: isServerless()
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'JSON inválido' }));
    }
    return;
  }

  // 3. Endpoint: Iniciar Flujo OAuth de Google
  if (pathname === '/auth/google' && req.method === 'GET') {
    const config = readConfig();
    if (!config.clientId) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h3>Error: Primero debes configurar el Client ID en la aplicación.</h3><a href="/">Volver al dashboard</a>');
      return;
    }

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('redirect_uri', config.redirectUri || `http://localhost:${DEFAULT_PORT}/oauth2callback`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', GOOGLE_SCOPES);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');

    res.writeHead(302, { Location: authUrl.toString() });
    res.end();
    return;
  }

  // 4. Callback OAuth de Google
  if (pathname === '/oauth2callback' && req.method === 'GET') {
    const code = reqUrl.searchParams.get('code');
    const error = reqUrl.searchParams.get('error');

    if (error) {
      res.writeHead(302, { Location: `/?auth_error=${encodeURIComponent(error)}` });
      res.end();
      return;
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Código de autorización ausente.');
      return;
    }

    const config = readConfig();
    try {
      const tokenParams = new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri || `http://localhost:${DEFAULT_PORT}/oauth2callback`,
        grant_type: 'authorization_code'
      });

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString()
      });

      const tokenData = await tokenRes.json();
      if (tokenData.error) {
        console.error('Error al intercambiar token:', tokenData);
        res.writeHead(302, { Location: `/?auth_error=${encodeURIComponent(tokenData.error_description || tokenData.error)}` });
        res.end();
        return;
      }

      let userEmail = 'Usuario de Google';
      try {
        const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        if (userRes.ok) {
          const userData = await userRes.json();
          userEmail = userData.email || userData.name || userEmail;
        }
      } catch (e) {
        // Ignorar si falla
      }

      if (isServerless()) {
        // No hay archivo donde guardar: mostramos el refresh_token para que
        // el dueño lo copie a mano en las variables de entorno de Vercel.
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderServerlessTokenPage({ refreshToken: tokenData.refresh_token, userEmail }));
        return;
      }

      writeTokens({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: Date.now() + (tokenData.expires_in * 1000),
        userEmail
      });
      writeConfig({ demoMode: false });

      res.writeHead(302, { Location: '/?auth_success=true' });
      res.end();
      return;
    } catch (err) {
      console.error('Error en el callback de OAuth:', err);
      res.writeHead(302, { Location: `/?auth_error=${encodeURIComponent(err.message)}` });
      res.end();
      return;
    }
  }

  // 5. Endpoint: Desconectar / Cerrar Sesión
  if (pathname === '/auth/disconnect' && req.method === 'POST') {
    if (isServerless()) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'En Vercel, para desconectar elimina la variable de entorno GOOGLE_REFRESH_TOKEN y vuelve a desplegar.'
      }));
      return;
    }
    clearTokens();
    writeConfig({ demoMode: true });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Desconectado correctamente.' }));
    return;
  }

  // 6. Endpoint: Obtener Datos de Salud
  if (pathname === '/api/health/data' && req.method === 'GET') {
    const dateParam = reqUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];
    const healthData = await getHealthDataForDate(dateParam);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(healthData));
    return;
  }

  // 7. Endpoint: Correlación entre actividad del día y la calidad del sueño de ESA noche
  if (pathname === '/api/health/correlation' && req.method === 'GET') {
    const days = Math.min(Math.max(parseInt(reqUrl.searchParams.get('days'), 10) || 14, 5), 30);
    const endDateParam = reqUrl.searchParams.get('endDate') || new Date().toISOString().split('T')[0];
    const config = readConfig();

    const dates = [];
    const endDate = new Date(`${endDateParam}T00:00:00Z`);
    for (let i = days; i >= 0; i--) {
      const d = new Date(endDate);
      d.setUTCDate(d.getUTCDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }

    const results = [];
    for (const dateStr of dates) {
      results.push({ date: dateStr, data: await getHealthDataForDate(dateStr) });
    }

    const pairs = [];
    for (let i = 0; i < results.length - 1; i++) {
      const dayData = results[i].data;
      const nightData = results[i + 1].data;

      if (!config.demoMode && (dayData.notice || nightData.notice)) continue;

      const sleep = nightData.summary?.sleep;
      if (!sleep || !sleep.totalMinutes) continue;

      pairs.push({
        date: results[i].date,
        nightOf: results[i + 1].date,
        steps: dayData.summary.steps.total,
        calories: dayData.summary.calories.total,
        restingHeartRate: dayData.summary.heartRate.resting,
        activeMinutes: dayData.summary.activeMinutes.total,
        sleepScore: sleep.score,
        sleepEfficiency: parseInt(sleep.efficiency, 10) || null,
        sleepMinutes: sleep.totalMinutes
      });
    }

    if (pairs.length < 3) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: false,
        message: `Solo se encontraron ${pairs.length} noche(s) con datos completos en los últimos ${days} días. Se necesitan al menos 3 para calcular una correlación confiable — prueba con un rango mayor o espera a que tu banda sincronice más historial.`,
        pairs
      }));
      return;
    }

    const metrics = [
      { key: 'steps', label: 'Pasos' },
      { key: 'calories', label: 'Calorías' },
      { key: 'restingHeartRate', label: 'Ritmo cardíaco en reposo' },
      { key: 'activeMinutes', label: 'Minutos activos' }
    ];
    const targets = [
      { key: 'sleepScore', label: 'Puntuación de sueño' },
      { key: 'sleepEfficiency', label: 'Eficiencia de sueño' },
      { key: 'sleepMinutes', label: 'Duración del sueño' }
    ];

    const correlations = [];
    for (const m of metrics) {
      for (const t of targets) {
        const valid = pairs.filter(p => p[m.key] != null && p[t.key] != null);
        const xVals = valid.map(p => p[m.key]);
        const yVals = valid.map(p => p[t.key]);
        const r = pearsonCorrelation(xVals, yVals);
        correlations.push({
          metric: m.key,
          metricLabel: m.label,
          target: t.key,
          targetLabel: t.label,
          r: r === null ? null : +r.toFixed(2),
          n: xVals.length,
          strength: r === null ? null : correlationStrength(r)
        });
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      days,
      nights: pairs.length,
      demoMode: Boolean(config.demoMode),
      pairs,
      correlations
    }));
    return;
  }

  // 8. Endpoint: Análisis con IA (Gemini) de la correlación actividad/sueño
  if (pathname === '/api/health/ai-insight' && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      const config = readConfig();
      const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;

      if (!apiKey) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, message: 'Falta configurar la clave de Gemini API (geminiApiKey / GEMINI_API_KEY).' }));
        return;
      }

      const prompt = buildAiInsightPrompt(payload);

      const geminiRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      const geminiData = await geminiRes.json();
      if (!geminiRes.ok) {
        console.warn('Gemini API error:', JSON.stringify(geminiData));
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, message: geminiData.error?.message || 'Error al consultar el modelo de IA.' }));
        return;
      }

      const text = geminiData.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, insight: text.trim() }));
    } catch (err) {
      console.error('Error en análisis de IA:', err.message);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, message: 'No se pudo generar el análisis. Intenta de nuevo.' }));
    }
    return;
  }

  // 9. Servir archivos estáticos del frontend (solo relevante en el servidor local;
  //    en Vercel, la carpeta /public se sirve automáticamente antes de llegar aquí)
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '') safePath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache, must-revalidate' });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Recurso no encontrado');
}

# 🩺 HealthMama Dashboard — Panel de Salud para Banda Inteligente

Panel web local para visualizar y monitorear las métricas de tu banda inteligente (Fitbit / Pixel Watch u otros dispositivos sincronizados con Google) utilizando la **Google Health API** (`https://developers.google.com/health/get-started`).

---

## 🚀 Inicio Rápido (En 10 segundos)

Este proyecto está construido con **Node.js nativo**, por lo que **no requiere instalar dependencias pesadas ni configurar nada previo**:

1. Abre una terminal en esta carpeta (`/Users/caritoherrera/healtmama`).
2. Inicia el servidor local:
   ```bash
   node server.js
   ```
3. Abre en tu navegador favorito:
   👉 **`http://localhost:3000`**

¡El dashboard se abrirá de inmediato mostrando el **Modo Demostración** con métricas realistas (pasos, ritmo cardíaco, fases de sueño, calorías, SpO2) mientras conectas tu cuenta real de Google!

---

## 📱 ¿Cómo conectar los datos reales de tu banda con Google Health API?

Para traer las métricas reales de tu banda inteligente:

### Paso 1: Ir a Google Cloud Console
1. Entra a [Google Cloud Console](https://console.cloud.google.com/) con la misma cuenta de Google en la que tienes vinculada tu banda (o la app de Fitbit / Pixel Watch).
2. Crea un nuevo proyecto (ej. `HealthMama Banda`).

### Paso 2: Habilitar la Google Health API
1. Ve al menú lateral > **APIs y servicios** > **Biblioteca**.
2. Busca **"Google Health API"**.
3. Haz clic en **Habilitar** (Enable).

### Paso 3: Configurar la Pantalla de Consentimiento OAuth
1. En el menú lateral ve a **APIs y servicios** > **Pantalla de consentimiento de OAuth** (OAuth consent screen).
2. Selecciona Tipo de usuario: **Externo** (External) y haz clic en *Crear*.
3. Completa los datos básicos:
   - Nombre de la aplicación: `HealthMama`
   - Correo electrónico de asistencia: tu correo de Gmail.
4. En la pestaña **Permisos (Scopes)**, agrega los scopes de lectura de Google Health:
   - `.../auth/googlehealth.activity_and_fitness.readonly`
   - `.../auth/googlehealth.health_metrics_and_measurements.readonly`
   - `.../auth/googlehealth.sleep.readonly`
5. En la pestaña **Usuarios de prueba (Test users)**:
   - Agrega tu propio correo de Gmail (imprescindible mientras la app esté en modo desarrollo).
6. Guarda los cambios.

### Paso 4: Crear las Credenciales OAuth 2.0
1. Ve a **APIs y servicios** > **Credenciales**.
2. Haz clic en **+ Crear credenciales** > **ID de cliente de OAuth** (OAuth client ID).
3. Tipo de aplicación: **Aplicación web**.
4. Nombre: `HealthMama Local`.
5. En **URIs de redireccionamiento autorizados** (Authorized redirect URIs), agrega:
   ```
   http://localhost:3000/oauth2callback
   ```
6. Haz clic en **Crear**. Google te mostrará tu **Client ID** y **Client Secret**.

### Paso 5: Conectar en el Dashboard
1. En tu dashboard (`http://localhost:3000`), haz clic en el botón superior **"Conectar / API"**.
2. Pega tu **Client ID** y **Client Secret**.
3. Haz clic en **Guardar Credenciales** y luego en **"Conectar con Google Health"**.
4. Se abrirá la ventana de inicio de sesión de Google para que autorices a la aplicación a leer tus métricas de salud.
5. ¡Listo! El dashboard cambiará a estado verde **"Google Health Conectado"** y mostrará los datos de tu banda.

---

## 📊 Métricas Soportadas en el Dashboard

* 👟 **Pasos & Actividad**: Conteo diario, progreso hacia meta de 10,000 pasos, distancia en km y minutos activos.
* 📈 **Gráfico de Movimiento por Hora**: Distribución horaria del movimiento en 24 horas.
* ❤️ **Frecuencia Cardíaca**: BPM actual con animación de latido, BPM en reposo, valores mínimo y máximo.
* 💓 **Curva Cardíaca Continua**: Gráfico de pulsaciones a lo largo del día con detección de picos de esfuerzo.
* 🌙 **Sueño y Descanso**: Total de horas dormidas, puntuación de sueño (0-100), desglose visual en fases (Profundo, REM, Ligero).
* 🔥 **Gasto Energético**: Calorías totales quemadas, desglose de calorías en movimiento vs metabolismo basal.
* 🫁 **Métricas de Salud**: Nivel de oxígeno en sangre (SpO2).
* 📅 **Selector de Fechas**: Navega fácilmente hacia atrás o hacia adelante para comparar días previos.

---

## 🛠️ Tecnologías Empleadas

- **Backend**: Node.js v22 nativo (sin dependencias externas requeridas).
- **Frontend**: HTML5 Semántico, CSS3 moderno con paleta wellness (diseño responsivo, modo oscuro y efectos glassmorphism), y Vanilla JavaScript.
- **Gráficos**: Chart.js para visualización fluida de datos biométricos.
- **Autenticación**: Flujo OAuth 2.0 estándar con refresh tokens automáticos para Google Health API v4.

---

## ☁️ Desplegar en Vercel (para compartir el dashboard)

Localmente el servidor guarda la configuración y los tokens en `config.json` / `tokens.json`. **Vercel es serverless** — no hay disco persistente entre peticiones — así que ahí esos mismos datos viven en **variables de entorno** en vez de archivos. El código ya detecta automáticamente en qué entorno está corriendo (`process.env.VERCEL`).

### Paso 1: Conectar el repo
Importa este repositorio en [vercel.com/new](https://vercel.com/new). No hace falta configurar nada especial (`vercel.json` ya enruta todo correctamente).

### Paso 2: Variables de entorno
En **Project Settings → Environment Variables**, agrega:

| Variable | Valor |
|---|---|
| `GOOGLE_CLIENT_ID` | El mismo Client ID de tu `config.json` local |
| `GOOGLE_CLIENT_SECRET` | El mismo Client Secret |
| `GOOGLE_REFRESH_TOKEN` | Ver abajo cómo obtenerlo |
| `GEMINI_API_KEY` | Tu API key de Gemini (opcional, para el análisis con IA) |
| `DEMO_MODE` | `false` para mostrar datos reales (si se omite, se activa solo cuando no hay `GOOGLE_REFRESH_TOKEN`) |

**Para obtener `GOOGLE_REFRESH_TOKEN`:** si ya conectaste tu cuenta localmente, es el valor `refresh_token` de tu `tokens.json`. Si no, haz el flujo de conexión una vez en la URL ya desplegada (`/auth/google`) — como Vercel no puede guardar el token en disco, al terminar te mostrará una página con el valor para que lo copies aquí manualmente. Después de agregar la variable, haz un **redeploy**.

### Paso 3: Redirect URI en Google Cloud Console
Agrega `https://tu-proyecto.vercel.app/oauth2callback` como URI de redireccionamiento autorizado en las credenciales OAuth (Google Cloud Console), igual que hiciste con `http://localhost:3000/oauth2callback`.

**Nota:** en Vercel, desconectar la cuenta (botón "Desconectar") no borra nada automáticamente — hay que eliminar la variable `GOOGLE_REFRESH_TOKEN` y volver a desplegar.

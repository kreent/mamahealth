import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

const CONFIG_FILE = path.join(ROOT_DIR, 'config.json');
const TOKENS_FILE = path.join(ROOT_DIR, 'tokens.json');

function readJsonFile(filePath, defaultValue = {}) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (err) {
    console.error(`Error al leer ${filePath}:`, err.message);
  }
  return defaultValue;
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(`Error al escribir ${filePath}:`, err.message);
    return false;
  }
}

// Vercel pone VERCEL=1 automáticamente en runtime. En serverless el sistema de
// archivos no persiste entre invocaciones (cada petición puede caer en una
// instancia distinta), así que ahí la config/tokens viven en variables de
// entorno en vez de config.json/tokens.json.
export function isServerless() {
  return Boolean(process.env.VERCEL);
}

export function readConfig() {
  if (isServerless()) {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: process.env.OAUTH_REDIRECT_URI || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/oauth2callback` : ''),
      // Sin refresh token no hay nada que mostrar salvo demo, a menos que se fuerce explícitamente.
      demoMode: process.env.DEMO_MODE === 'true' ? true : process.env.DEMO_MODE === 'false' ? false : !process.env.GOOGLE_REFRESH_TOKEN,
      geminiApiKey: process.env.GEMINI_API_KEY || ''
    };
  }

  if (!fs.existsSync(CONFIG_FILE)) {
    writeJsonFile(CONFIG_FILE, {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: `http://localhost:${process.env.PORT || 3000}/oauth2callback`,
      demoMode: true, // Por defecto inicia en demo para que el usuario pueda ver el dashboard de inmediato
      geminiApiKey: process.env.GEMINI_API_KEY || ''
    });
  }
  return readJsonFile(CONFIG_FILE);
}

export function writeConfig(partial) {
  if (isServerless()) {
    // No hay dónde persistirlo; la config real vive en las env vars de Vercel.
    console.warn('⚠️ En Vercel la configuración no se guarda en disco. Define variables de entorno en el dashboard del proyecto.');
    return { ...readConfig(), ...partial };
  }
  const updated = { ...readJsonFile(CONFIG_FILE), ...partial };
  writeJsonFile(CONFIG_FILE, updated);
  return updated;
}

export function readTokens() {
  if (isServerless()) {
    return {
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN || '',
      userEmail: process.env.GOOGLE_USER_EMAIL || ''
    };
  }
  return readJsonFile(TOKENS_FILE);
}

export function writeTokens(tokens) {
  if (isServerless()) return false; // no-op: no hay almacenamiento persistente
  return writeJsonFile(TOKENS_FILE, tokens);
}

export function clearTokens() {
  if (isServerless()) return;
  if (fs.existsSync(TOKENS_FILE)) fs.unlinkSync(TOKENS_FILE);
}

// Compatible con el body ya parseado por Vercel (req.body) o con el stream
// crudo de un http.IncomingMessage normal (servidor local).
export function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === 'string') {
        try {
          resolve(req.body ? JSON.parse(req.body) : {});
        } catch (err) {
          reject(err);
        }
      } else {
        resolve(req.body);
      }
      return;
    }
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

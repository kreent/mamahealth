import { handleRequest } from '../lib/handler.js';

// Ruta dinámica nativa de Vercel: cualquier request bajo /api/* cae aquí con
// req.url exactamente igual al path original pedido (sin pasar por un rewrite),
// así que handleRequest puede rutear por pathname sin ambigüedad.
export default async function handler(req, res) {
  await handleRequest(req, res);
}

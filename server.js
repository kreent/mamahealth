import http from 'node:http';
import { handleRequest } from './lib/handler.js';

const PORT = process.env.PORT || 3000;

const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 HealthMama Dashboard está activo y listo.`);
  console.log(`👉 Abre en tu navegador: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});

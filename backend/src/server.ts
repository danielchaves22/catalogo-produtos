// backend/src/server.ts
// Importa setup como primeiro arquivo, antes de qualquer outro
import './setup';
import app from './app';
import { PORT } from './config';

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
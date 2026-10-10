/* Ajudante dos testes de navegador que sobem um servidor próprio.
 *
 * Esses servidores devolvem o index.html (ou o teste.html) para qualquer
 * endereço. Os arquivos soltos que a página carrega por conta própria (hoje,
 * o /medir.js da medição dos anúncios) precisam chegar como são: servidos
 * como HTML, o navegador acusa erro de sintaxe e o teste falha por isso.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SOLTOS = { '/medir.js': 'text/javascript; charset=utf-8' };

/* Responde e devolve true quando o pedido é de um arquivo solto. */
export function servirSolto(req, res) {
  const u = String(req.url || '').split('?')[0];
  const tipo = SOLTOS[u];
  if (!tipo) return false;
  res.writeHead(200, { 'Content-Type': tipo });
  res.end(fs.readFileSync(path.join(AQUI, u.slice(1))));
  return true;
}

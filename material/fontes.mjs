/* Baixa as fontes da marca e devolve um CSS com elas embutidas em base64.
 *
 * Embutir, e não apontar para o Google, é o que faz o PDF sair sempre igual:
 * na hora de imprimir não dá para o texto cair numa fonte de reserva porque
 * a rede demorou. O arquivo baixado fica em cache no disco.
 */
import fs from 'node:fs';
import path from 'node:path';

const AQUI = path.dirname(new URL(import.meta.url).pathname);
const CACHE = path.join(AQUI, '.fontes');

const PEDIDOS = [
  ['Inter', 'Inter:wght@300;400;500;600;700;800;900'],
  ['Instrument Serif', 'Instrument+Serif'],
  ['JetBrains Mono', 'JetBrains+Mono:wght@400;500;700'],
];

/* User-Agent de navegador moderno: sem ele o Google devolve TTF em vez de
   WOFF2, que é bem maior. */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/122.0 Safari/537.36';

async function baixar(url, bin) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${url} respondeu ${r.status}`);
  return bin ? Buffer.from(await r.arrayBuffer()) : r.text();
}

export async function cssDasFontes() {
  fs.mkdirSync(CACHE, { recursive: true });
  const pronto = path.join(CACHE, 'fontes.css');
  if (fs.existsSync(pronto)) return fs.readFileSync(pronto, 'utf8');

  let saida = '';
  for (const [nome, familia] of PEDIDOS) {
    const css = await baixar(`https://fonts.googleapis.com/css2?family=${familia}&display=swap`, false);
    /* só o pedaço latino: o resto do arquivo é cirílico e vietnamita, que
       este material não usa e só engordariam o PDF */
    const blocos = css.split('@font-face').slice(1)
      .map((b) => '@font-face' + b.slice(0, b.indexOf('}') + 1))
      .filter((b) => /unicode-range:[^;]*U\+0000/.test(b) || !/unicode-range/.test(b));
    for (const bloco of blocos) {
      const m = bloco.match(/url\((https:\/\/[^)]+\.woff2)\)/);
      if (!m) continue;
      const arquivo = path.join(CACHE, path.basename(m[1]));
      if (!fs.existsSync(arquivo)) fs.writeFileSync(arquivo, await baixar(m[1], true));
      const b64 = fs.readFileSync(arquivo).toString('base64');
      saida += bloco.replace(m[0], `url(data:font/woff2;base64,${b64}) format('woff2')`) + '\n';
    }
    console.log(`  ${nome}: ${blocos.length} corte(s)`);
  }
  fs.writeFileSync(pronto, saida);
  return saida;
}

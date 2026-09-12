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

/* User-Agent de um Chrome antigo, de propósito.
 *
 * Para navegador moderno o Google devolve fonte variável: um arquivo só
 * cobrindo todos os pesos. O Chromium até desenha certo, mas na hora de
 * imprimir ele instancia o peso pedido e grava as letras como Type3, que é
 * glifo desenhado, não fonte de verdade. O texto continua selecionável e o
 * desenho fica igual, mas quem abre o PDF num editor não consegue mexer no
 * texto, e é justamente disso que este material precisa.
 *
 * Este UA não anuncia suporte a fonte variável, então vem um arquivo
 * estático por peso e o PDF sai com fonte embutida de verdade. Continua
 * WOFF2: o TTF só apareceria com um UA bem mais velho. */
const UA = 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/50.0.2661.102 Safari/537.36';

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
      /* Troca só o endereço. O bloco que veio do Google já termina com
         format('woff2'), e acrescentar outro deixava a linha com o
         descritor repetido: CSS inválido, regra inteira descartada. Os dois
         PDF saíram assim, em fonte de reserva, sem nada denunciar. */
      saida += bloco.replace(m[0], `url(data:font/woff2;base64,${b64})`) + '\n';
    }
    console.log(`  ${nome}: ${blocos.length} corte(s)`);
  }
  fs.writeFileSync(pronto, saida);
  return saida;
}

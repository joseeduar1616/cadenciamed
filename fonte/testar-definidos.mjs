/* Nenhuma função pode ser CHAMADA sem existir.
 *
 * Este teste existe por causa de um estrago silencioso e total. Um commit
 * apagou a função resgatarCupom junto com um bloco que de fato estava
 * morto; os três lugares que a chamavam continuaram lá. O build passou (o
 * compilador não reclama de nome que ele não conhece, porque em
 * JavaScript ele pode aparecer em tempo de execução), os mil e tantos
 * testes passaram, e o site foi publicado.
 *
 * Na tela: clicar em "Resgatar" lançava ReferenceError dentro de uma
 * função async sem try, o erro sumia sem deixar rastro, e o botão ficava
 * em "Conferindo…" para sempre. Ninguém mais conseguiu resgatar cupom, e
 * nada na tela dizia por quê.
 *
 * COMO ELE ACHA. Procurar nome não declarado com expressão regular sobre
 * o código-fonte não funciona: texto e comentário enchem o resultado de
 * ruído, e foi o que aconteceu na primeira tentativa. Quem sabe de
 * verdade quais nomes existem é o compilador. Então o app é minificado
 * SOZINHO, sem as bibliotecas: aí todo nome que o esbuild consegue
 * resolver vira "a", "Nt", "u2" — e o que ele NÃO consegue resolver
 * sobrevive escrito por extenso, porque renomear o que não se conhece
 * quebraria o programa. Nome comprido que sobrou é variável livre.
 *
 *   node testar-definidos.mjs [arquivo.jsx]
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const alvo = path.resolve(process.argv[2] || 'app.jsx');
if (!fs.existsSync(alvo)) { console.error('não achei', alvo); process.exit(1); }

const erros = [];
const ok = (m) => console.log('ok   ' + m);
const falha = (m) => { console.log('FALHA ' + m); erros.push(m); };

const saida = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cadencia-')), 'so-nosso.js');
try {
  /* Sem --bundle de propósito: as bibliotecas não entram, e o que sobra é
     só o código desta casa. Com elas dentro, o ruído delas (nome de
     método em objeto literal, variável livre própria) afogaria o sinal. */
  execFileSync('npx', ['esbuild', alvo, '--loader:.jsx=jsx', '--minify',
    '--format=esm', '--outfile=' + saida], { stdio: 'pipe' });
} catch (e) {
  falha('não consegui minificar o app para conferir: ' + String(e.message).slice(0, 200));
}

if (!fs.existsSync(saida)) {
  console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
  process.exit(1);
}

let js = fs.readFileSync(saida, 'utf8');

/* Fora os textos. É dentro deles que moram as funções de CSS
   ("rotateX(...)", "minmax(...)") e as palavras em português, que não são
   chamada de nada.
 *
 * Numa varredura só, e não três expressões regulares em sequência: com
 * passes separados, um apóstrofo dentro de um texto entre aspas duplas
 * ("d'água") abre um texto de mentira e come tudo até o apóstrofo
 * seguinte. O resultado ficava salpicado de palavra solta em português,
 * e era ruído puro. Aqui quem abre primeiro é quem manda, como no
 * próprio JavaScript. */
const semTexto = (cru) => {
  let fora = '';
  let i = 0;
  while (i < cru.length) {
    const c = cru[i];
    if (c === '"' || c === "'" || c === '`') {
      const abre = c;
      fora += ' ';
      i += 1;
      while (i < cru.length) {
        if (cru[i] === '\\') { fora += '  '; i += 2; continue; }
        /* Interpolação dentro de crase: ${...} carrega CÓDIGO, e esse
           código pode ter outra crase dentro. Sem contar as chaves, a
           varredura terminava na crase aninhada e passava a ler o resto
           do texto como se fosse código — e o bloco de CSS do app, que é
           um texto de crase comprido com interpolação, despejava nomes de
           função de CSS e palavras de comentário no resultado. */
        if (abre === '`' && cru[i] === '$' && cru[i + 1] === '{') {
          let nivel = 1;
          fora += '  ';
          i += 2;
          while (i < cru.length && nivel > 0) {
            if (cru[i] === '{') nivel += 1;
            else if (cru[i] === '}') nivel -= 1;
            fora += cru[i] === '\n' ? '\n' : ' ';
            i += 1;
          }
          continue;
        }
        if (cru[i] === abre) { fora += ' '; i += 1; break; }
        fora += cru[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      continue;
    }
    fora += c;
    i += 1;
  }
  return fora;
};
js = semTexto(js);

/* O que vem de fora: linguagem, navegador e palavra reservada. Só entram
   aqui nomes compridos — os curtos foram renomeados pelo compilador e não
   chegam a ser conferidos. */
const DE_FORA = new Set([
  'Function', 'Number', 'String', 'Boolean', 'Promise', 'Symbol', 'BigInt',
  'RegExp', 'Object', 'Reflect', 'Uint8Array', 'Uint16Array', 'Int32Array',
  'Float32Array', 'ArrayBuffer', 'DataView', 'TextEncoder', 'TextDecoder',
  'parseInt', 'parseFloat', 'isFinite', 'structuredClone', 'queueMicrotask',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle',
  'matchMedia', 'IntersectionObserver', 'ResizeObserver', 'MutationObserver',
  'Notification', 'MediaRecorder', 'AudioContext', 'FileReader', 'FormData',
  'URLSearchParams', 'AbortController', 'CustomEvent', 'DOMParser',
  'SpeechSynthesisUtterance', 'ClipboardItem', 'OffscreenCanvas',
  'TypeError', 'RangeError', 'ReferenceError',
  'Error', 'fetch', 'Request', 'Response', 'Headers', 'Blob', 'Image',
  /* não são chamadas, são palavras da linguagem seguidas de parêntese */
  'return', 'typeof', 'import', 'switch', 'delete', 'instanceof',
  'async', 'await', 'catch', 'while', 'function', 'yield',
]);

/* Ruído conhecido, e por que ele existe.
 *
 * Duas fontes, as duas inofensivas. Nome de função do CSS (translateX,
 * clamp, gradient…) mora dentro de texto de estilo. E palavra solta em
 * português vem de dentro de expressão regular: saber se uma barra abre
 * uma expressão regular ou é uma divisão exige um analisador de
 * JavaScript inteiro, que não cabe aqui.
 *
 * A lista é fechada de propósito. Não é para crescer sozinha: nome NOVO
 * que apareça aqui é defeito até prova em contrário, e é esse o ponto do
 * teste. */
const RUIDO_CONHECIDO = new Set([
  /* funções de CSS e trechos de seletor, dentro do bloco de estilo */
  'bezier', 'clamp', 'gradient', 'rotate', 'scale', 'scaleX', 'shadow',
  'translate', 'translate3d', 'translateX', 'translateY', 'media', 'child',
  /* palavras dentro de expressão regular */
  'Descanso', 'Safari', 'baralho', 'cronograma', 'escaneado', 'semana',
  'verdade', 'escuras', 'u2717',
  /* pedaço de escape (\xED, \xF5) que sobra de acento escrito dentro de
     expressão regular: "v\xEDdeo", "quest\xF5es" */
  'xEDdeo', 'xF5es', 'xF3pria',
  /* propriedade passada entre componentes, que o compilador não renomeia */
  'aoLiberar',
]);

const chamados = new Map();
js.split('\n').forEach((linha, i) => {
  for (const m of linha.matchAll(/(^|[^.?A-Za-z0-9_$])([A-Za-z_$][A-Za-z0-9_$]{4,})\s*\(/g)) {
    if (!chamados.has(m[2])) chamados.set(m[2], i + 1);
  }
});

const sumidos = [...chamados.keys()]
  .filter((n) => !DE_FORA.has(n) && !RUIDO_CONHECIDO.has(n)).sort();

if (!sumidos.length) {
  ok(`toda função chamada existe (${chamados.size} nomes compridos conferidos)`);
} else {
  falha(`${sumidos.length} nome(s) chamado(s) sem existir no pacote:\n        ${sumidos.join('\n        ')}`
    + '\n        (se algum for legítimo, do navegador, acrescente em DE_FORA)');
}

/* E as que já sumiram uma vez, pelo nome. Barato, e fala a língua de quem
   for ler o resultado daqui a um ano. */
const fonte = fs.readFileSync(alvo, 'utf8');
for (const nome of ['resgatarCupom', 'textoDeAnexo', 'chamarApi', 'avisar']) {
  const declarada = new RegExp(`(function|const|let|var)\\s+${nome}\\b`).test(fonte);
  const usada = new RegExp(`\\b${nome}\\s*\\(`).test(fonte);
  if (!usada) ok(`${nome} não é mais chamada em lugar nenhum`);
  else if (declarada) ok(`${nome} é chamada e está declarada`);
  else falha(`${nome} é chamada e NÃO está declarada: foi apagada de novo`);
}

console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);

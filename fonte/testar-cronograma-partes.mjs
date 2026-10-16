/* O cronograma que a pessoa envia chega inteiro, até a última semana.
 *
 * Um calendário de 46 semanas parava na semana 36: o texto guardado era
 * cortado em 20 mil caracteres, e o que ia para a IA organizar, em 45 mil,
 * com a resposta da IA também tendo teto. Aqui:
 *
 *   - a divisão em partes (parte9.jsx → _cronograma.mjs) não perde texto,
 *     não passa do tamanho, e não parte uma semana ao meio;
 *   - a junção das listas mantém a ordem e só desfaz a repetição da emenda;
 *   - um organizar de ponta a ponta, com uma IA de mentira, devolve a
 *     última semana do curso;
 *   - o teto do texto guardado é o mesmo no envio e na leitura do disco,
 *     e cabe um curso anual com folga.
 *
 *   node testar-cronograma-partes.mjs
 */
import fs from 'node:fs';
import {
  PARTE_ORGANIZAR, MAX_PARTES_ORGANIZAR, partesParaOrganizar, juntarMaterias,
} from './_cronograma.mjs';

const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

/* Um calendário de curso como os de verdade: 46 semanas, quatro ou cinco
   aulas por semana, cerca de 550 caracteres cada uma. */
const ESPS = ['Cardiologia', 'Nefrologia', 'Pneumologia', 'Obstetrícia', 'Pediatria geral', 'Cirurgia do trauma'];
function calendario(semanas) {
  const linhas = [];
  for (let w = 1; w <= semanas; w++) {
    linhas.push(`Semana ${w} — ${String((w % 28) + 1).padStart(2, '0')}/0${(w % 9) + 1}`);
    for (let a = 1; a <= 4 + (w % 2); a++) {
      linhas.push(`- Aula ${w}.${a}: ${ESPS[(w + a) % ESPS.length]}, tema ${w}.${a} com revisão dirigida, questões comentadas e leitura da apostila`);
    }
    linhas.push(`  Estudo dirigido da semana ${w}: resumos, flashcards e simulado curto no fim de semana`);
    linhas.push('');
  }
  return linhas.join('\n');
}
const curso = calendario(46);

/* O caso que chegou: com o teto antigo de 20 mil caracteres, este curso
   parava na semana 36. O teste só prova alguma coisa se o curso for desse
   tamanho. */
const cortadoAntes = curso.slice(0, 20000);
const ultimaAntes = Math.max(...[...cortadoAntes.matchAll(/^Semana (\d+) —/gm)].map((m) => Number(m[1])));
if (curso.length > 20000 && ultimaAntes < 46) ok(`o curso de teste reproduz o defeito: com o corte antigo, parava na semana ${ultimaAntes}`);
else falha(`o curso de teste é pequeno demais para reproduzir o corte (${curso.length} caracteres)`);

/* ── a divisão ────────────────────────────────────────────────────────── */
const partes = partesParaOrganizar(curso);
if (partes.length > 1) ok(`um curso de 46 semanas (${curso.length} caracteres) vai em ${partes.length} partes`);
else falha('o curso inteiro foi numa parte só');
if (partes.every((p) => p.length <= PARTE_ORGANIZAR)) ok('nenhuma parte passa do tamanho combinado');
else falha('parte maior que o combinado: ' + partes.map((p) => p.length).join(', '));
if (partes.length <= MAX_PARTES_ORGANIZAR) ok('e cabe no número máximo de partes, sem cortar nada');
else falha(`o curso precisou de ${partes.length} partes, mais que o máximo ${MAX_PARTES_ORGANIZAR}`);

const juntas = partes.join('\n');
const faltam = [];
for (let w = 1; w <= 46; w++) if (!juntas.includes(`Semana ${w} —`)) faltam.push(w);
if (!faltam.length) ok('todas as 46 semanas estão em alguma parte');
else falha('semanas perdidas na divisão: ' + faltam.join(', '));
const aulasAntes = (curso.match(/^- Aula/gm) || []).length;
const aulasDepois = (juntas.match(/^- Aula/gm) || []).length;
if (aulasAntes === aulasDepois) ok(`nenhuma aula perdida nem repetida na divisão (${aulasAntes})`);
else falha(`aulas antes ${aulasAntes}, depois ${aulasDepois}`);

const partidas = partes.slice(1).filter((p) => !/^Semana \d+/.test(p));
if (!partidas.length) ok('toda parte começa numa semana: nenhuma semana fica dividida ao meio');
else falha('parte começando no meio de uma semana: ' + partidas.map((p) => p.slice(0, 40)).join(' | '));

/* PDF que vira uma linha só, sem quebra nenhuma */
const corrido = 'x'.repeat(PARTE_ORGANIZAR * 2 + 1234);
const partesCorrido = partesParaOrganizar(corrido);
if (partesCorrido.every((p) => p.length <= PARTE_ORGANIZAR) && partesCorrido.join('').length === corrido.length) {
  ok('texto sem quebra de linha é cortado seco, sem perder nada');
} else falha('texto corrido: ' + partesCorrido.map((p) => p.length).join(', '));

if (partesParaOrganizar('').length === 0 && partesParaOrganizar('   \n\n  ').length === 0) ok('texto vazio não vira parte');
else falha('texto vazio virou parte');

if (partesParaOrganizar('Semana 1\n- Aula única').length === 1) ok('cronograma curto continua indo numa chamada só');
else falha('cronograma curto foi dividido à toa');

/* ── a junção ─────────────────────────────────────────────────────────── */
const M = (titulo, area = 'CL', topicos = []) => ({ titulo, area, esp: 'x', topicos });
let j = juntarMaterias([[M('A'), M('B'), M('Síndrome nefrítica', 'CL', ['t1'])],
  [M('sindrome  NEFRITICA', 'CL', ['t2', 't1']), M('D')]]);
if (j.map((m) => m.titulo).join(',') === 'A,B,Síndrome nefrítica,D') ok('a aula repetida na emenda entre partes vira uma só, na ordem');
else falha('junção na emenda: ' + j.map((m) => m.titulo).join(','));
const sn = j.find((m) => m.titulo === 'Síndrome nefrítica');
if (sn && sn.topicos.join(',') === 't1,t2') ok('e soma os tópicos das duas pontas, sem repetir');
else falha('tópicos da emenda: ' + JSON.stringify(sn));

j = juntarMaterias([[M('A'), M('B'), M('C'), M('D'), M('E')], [M('F'), M('G'), M('H'), M('A')]]);
if (j.length === 9) ok('a mesma aula longe da emenda é do cronograma e fica (revisão em outro módulo)');
else falha('repetição legítima sumiu: ' + j.map((m) => m.titulo).join(','));

j = juntarMaterias([[M('Trauma', 'CI')], [M('Trauma', 'PE')]]);
if (j.length === 2) ok('mesmo título em áreas diferentes são aulas diferentes');
else falha('juntou áreas diferentes');

const muitos = juntarMaterias([[M('X', 'CL', ['1', '2', '3', '4', '5'])], [M('X', 'CL', ['6', '7', '8'])]]);
if (muitos[0].topicos.length === 6) ok('os tópicos somados param em 6, o teto do resto do app');
else falha('tópicos passaram de 6: ' + muitos[0].topicos.length);

/* ── de ponta a ponta, com uma IA de mentira ──────────────────────────── */
/* Faz o que a rota /api/cronograma-ia faz, sem IA: uma matéria por linha
   "- Aula", e ignora o aviso de trecho. */
function iaDeMentira(material) {
  return [...material.matchAll(/^- Aula (\d+)\.(\d+): ([^,]+)/gm)].map((m) => M(`Aula ${m[1]}.${m[2]} ${m[3]}`));
}
const listas = partes.map((p, i) => iaDeMentira(`(Trecho ${i + 1} de ${partes.length} do mesmo cronograma.)\n${p}`));
const final = juntarMaterias(listas);
const ultima = final[final.length - 1];
if (final.length === aulasAntes) ok(`o organizar em partes devolve todas as ${aulasAntes} aulas`);
else falha(`o organizar devolveu ${final.length} de ${aulasAntes} aulas`);
if (ultima && /^Aula 46\./.test(ultima.titulo)) ok('e a lista vai até a semana 46, não para na 36');
else falha('a lista parou antes do fim: ' + (ultima && ultima.titulo));

/* ── o teto do texto guardado ─────────────────────────────────────────── */
const base = fs.readFileSync(new URL('./base.jsx', import.meta.url), 'utf8');
const parte2 = fs.readFileSync(new URL('./parte2.jsx', import.meta.url), 'utf8');
const parte9 = fs.readFileSync(new URL('./parte9.jsx', import.meta.url), 'utf8');
const teto = Number((/const LIMITE_CRONOGRAMA = (\d+);/.exec(base) || [])[1]);
if (teto >= 100000) ok(`o texto do cronograma guardado cabe ${teto.toLocaleString('pt-BR')} caracteres`);
else falha('teto do cronograma guardado pequeno: ' + teto);
if (curso.length * 3 < teto) ok('um curso de 46 semanas cabe três vezes nesse teto');
else falha('um curso de 46 semanas não cabe com folga');
if (/texto: String\(obj\(d\.cronograma\)\.texto \|\| ""\)\.slice\(0, LIMITE_CRONOGRAMA\)/.test(parte2)) {
  ok('a leitura do disco e da nuvem usa o mesmo teto do envio');
} else falha('o normalize corta o cronograma com outro número — é o corte calado de antes');
if (/texto: limpo\.slice\(0, LIMITE_CRONOGRAMA\)/.test(parte9) && !/const LIMITE_CRONOGRAMA/.test(parte9)) {
  ok('o envio usa o teto único, sem uma cópia própria que possa divergir');
} else falha('o envio tem teto próprio no parte9.jsx');
if (/slice\(0, MAX_AULAS_PROPRIAS\)/.test(parte2) && Number((/const MAX_AULAS_PROPRIAS = (\d+);/.exec(base) || [])[1]) >= 1000) {
  ok('o currículo organizado guarda até 1000 aulas');
} else falha('o currículo organizado ainda é cortado cedo');

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;

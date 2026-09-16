/* O arquivo anexado tem de virar TEXTO.
 *
 * Este teste existe por um defeito que não dava erro nenhum: os leitores
 * de PDF e de Word devolvem { texto, imagens }, e o textoDeAnexo
 * embrulhava esse objeto de novo — { texto: { texto, imagens } }. Na hora
 * de juntar, o objeto virava a palavra "[object Object]". O arquivo
 * subia, a tela dizia que tinha lido, e a IA respondia sobre coisa
 * nenhuma. Valia para o assistente e para o duelo, que lê o material
 * pelo mesmo caminho.
 *
 * Aqui os leitores de verdade são trocados por leitores de mentira que
 * devolvem exatamente o formato dos originais.
 *
 *   node testar-anexo.mjs
 */
import { textoDeAnexo, juntarAnexos, TETO_ANEXO } from './_anexo.mjs';

const erros = [];
const ok = (m) => console.log('ok   ' + m);
const falha = (m) => { console.log('FALHA ' + m); erros.push(m); };

/* Um arquivo de mentira com a cara do File do navegador. */
const arquivo = (nome, tipo, conteudo) => ({
  name: nome,
  type: tipo,
  text: async () => conteudo || '',
});

/* Os leitores de verdade devolvem { texto, imagens } — imagens é a lista
   de figuras recortadas das páginas, que o assistente não usa. */
globalThis.lerPdfParaTexto = async () => ({
  texto: 'Nefrologia: a síndrome nefrítica cursa com hematúria.',
  imagens: [{ pagina: 1, dados: 'data:image/png;base64,AAAA' }],
});
globalThis.lerDocxParaTexto = async () => ({
  texto: 'Resumo de cardiologia, valvopatias.',
  imagens: [],
});
globalThis.lerFotosComIA = async () => ({ texto: 'o que estava escrito na foto', cortado: false });

const nada = () => undefined;

/* ── PDF ────────────────────────────────────────────────────────────── */
let r = await textoDeAnexo(arquivo('resumo.pdf', 'application/pdf'), null, nada);
if (typeof r.texto === 'string') ok('o PDF volta como texto, não como objeto');
else falha('o PDF voltou como ' + typeof r.texto + ': ' + JSON.stringify(r.texto).slice(0, 120));
if (/hematúria/.test(r.texto || '')) ok('e o texto é o que estava no PDF');
else falha('o texto do PDF não veio: ' + JSON.stringify(r.texto).slice(0, 120));

/* A prova do defeito: o que a IA recebe de verdade é o juntar. */
let junto = juntarAnexos([{ nome: 'resumo.pdf', texto: r.texto }]);
if (!/\[object Object\]/.test(junto)) ok('o material que sobe não tem "[object Object]"');
else falha('o material subiu como "[object Object]": ' + junto.slice(0, 120));
if (/hematúria/.test(junto)) ok('o material que sobe traz o conteúdo do arquivo');
else falha('o material subiu sem o conteúdo: ' + junto.slice(0, 120));

/* Sem extensão no tipo, só no nome — é assim que o iPhone manda. */
r = await textoDeAnexo(arquivo('Aula de nefro.PDF', ''), null, nada);
if (typeof r.texto === 'string' && /hematúria/.test(r.texto)) ok('PDF reconhecido só pelo nome, mesmo em maiúsculas');
else falha('PDF pelo nome falhou: ' + JSON.stringify(r).slice(0, 140));

/* ── Word ───────────────────────────────────────────────────────────── */
r = await textoDeAnexo(arquivo('resumo.docx', ''), null, nada);
if (typeof r.texto === 'string' && /valvopatias/.test(r.texto)) ok('o Word também volta como texto');
else falha('o Word voltou ' + JSON.stringify(r).slice(0, 140));

/* ── imagem e texto puro, que já funcionavam ─────────────────────────── */
r = await textoDeAnexo(arquivo('mural.jpg', 'image/jpeg'), {}, nada);
if (r.texto === 'o que estava escrito na foto') ok('a foto vira o texto que a IA enxergou');
else falha('a foto voltou ' + JSON.stringify(r).slice(0, 140));

r = await textoDeAnexo(arquivo('notas.txt', 'text/plain', 'linha um'), null, nada);
if (r.texto === 'linha um') ok('o texto puro vai direto');
else falha('o texto puro voltou ' + JSON.stringify(r).slice(0, 140));

/* ── o que não dá para ler avisa, em vez de subir vazio ──────────────── */
r = await textoDeAnexo(arquivo('planilha.xlsx', 'application/vnd.ms-excel'), null, nada);
if (r.erro && /xlsx|Não sei ler/i.test(r.erro)) ok('o que não dá para ler devolve recado, não texto vazio');
else falha('o arquivo desconhecido voltou ' + JSON.stringify(r).slice(0, 140));

/* Erro do leitor de foto passa adiante, sem virar texto vazio. */
globalThis.lerFotosComIA = async () => ({ erro: 'a foto ficou pesada demais' });
r = await textoDeAnexo(arquivo('foto.png', 'image/png'), {}, nada);
if (r.erro === 'a foto ficou pesada demais') ok('erro do leitor de foto chega na tela');
else falha('o erro da foto sumiu: ' + JSON.stringify(r).slice(0, 140));

/* ── juntar: nome do arquivo junto e teto ────────────────────────────── */
junto = juntarAnexos([
  { nome: 'cronograma.pdf', texto: 'segunda: nefro' },
  { nome: 'mural.jpg', texto: 'prova dia 12' },
]);
if (/cronograma\.pdf/.test(junto) && /mural\.jpg/.test(junto)) ok('cada anexo sobe com o nome do arquivo');
else falha('os nomes não subiram: ' + junto.slice(0, 160));
if (/segunda: nefro/.test(junto) && /prova dia 12/.test(junto)) ok('os dois anexos sobem juntos');
else falha('faltou anexo: ' + junto.slice(0, 160));

junto = juntarAnexos([{ nome: 'grande.pdf', texto: 'z'.repeat(TETO_ANEXO * 3) }]);
if (junto.length === TETO_ANEXO) ok('o material tem teto, e o corte acontece aqui e não no servidor');
else falha('o material subiu com ' + junto.length + ' caracteres');

console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);

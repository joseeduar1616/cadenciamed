/* Testa a transcrição e a organização da aula gravada, sem gastar cota.
 *
 * Roda contra o arquivo que vai para o ar (worker/api/aula-ia.js), com um
 * servidor falso no lugar do Gemini.
 *
 * Três coisas importam mais que o caminho feliz:
 *   · o áudio chega ao modelo como ÁUDIO, com o tipo certo;
 *   · quando o Gemini recusa o formato, a tela fica sabendo que é o formato
 *     — é isso que faz o navegador converter para MP3 e tentar de novo, em
 *     vez de mostrar erro e desistir de uma aula de duas horas;
 *   · o que a IA escreve entra na anotação ESCAPADO. O áudio é de fora:
 *     qualquer coisa dita perto do microfone vira texto, e texto vindo dali
 *     não pode virar HTML executável no editor.
 *
 *   node testar-aula-ia.mjs
 */
import http from 'node:http';

const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

let responder = () => ({ status: 200, corpo: {} });
let ultimoPedido = null;
let chamadasIA = 0;

const servidor = http.createServer((req, res) => {
  let cru = '';
  req.on('data', (d) => { cru += d; });
  req.on('end', () => {
    chamadasIA += 1;
    ultimoPedido = { url: req.url, corpo: JSON.parse(cru || '{}') };
    const r = responder(ultimoPedido);
    res.writeHead(r.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(r.corpo));
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${servidor.address().port}`;

let QUEM = { email: 'joseeduardo1616@gmail.com', localId: 'uid-dono' };
let PLANO_ATE = 0;
const { generateKeyPairSync } = await import('node:crypto');
const CONTA = {
  client_email: 'teste@exemplo.iam.gserviceaccount.com',
  private_key: generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs8', format: 'pem' }),
};

const fetchReal = globalThis.fetch;
globalThis.fetch = (url, opcoes) => {
  const u = String(url);
  if (u.includes('identitytoolkit.googleapis.com')) {
    return Promise.resolve(new Response(JSON.stringify(QUEM ? { users: [QUEM] } : { users: [] }),
      { status: QUEM ? 200 : 400, headers: { 'Content-Type': 'application/json' } }));
  }
  if (u.includes('generativelanguage.googleapis.com') || u.includes('api.anthropic.com')) {
    return fetchReal(base + new URL(u).pathname, opcoes);
  }
  if (u.includes('oauth2.googleapis.com/token')) {
    return Promise.resolve(new Response(JSON.stringify({ access_token: 't' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  if (u.includes('firestore.googleapis.com')) {
    /* assinatura e contador de uso */
    if (u.includes('/uso/')) return Promise.resolve(new Response('{}', { status: 404 }));
    return Promise.resolve(new Response(
      JSON.stringify(PLANO_ATE ? { fields: { validoAte: { doubleValue: PLANO_ATE } } } : {}),
      { status: PLANO_ATE ? 200 : 404, headers: { 'Content-Type': 'application/json' } }));
  }
  return fetchReal(url, opcoes);
};

const env = {
  FIREBASE_API_KEY: 'k', FIREBASE_SERVICE_ACCOUNT: JSON.stringify(CONTA), GEMINI_API_KEY: 'g',
};
const mod = await import('../worker/api/aula-ia.js');
const pedir = async (corpo, e = env) => {
  const res = await mod.onRequest({
    request: new Request('http://local/api/aula-ia', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 't', ...corpo }),
    }),
    env: e,
  });
  return { status: res.status, corpo: await res.json() };
};

const respostaIA = (texto) => ({
  status: 200,
  corpo: { candidates: [{ content: { parts: [{ text: texto }] }, finishReason: 'STOP' }] },
});
const AUDIO = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEA'.repeat(40);

/* ── transcrever ──────────────────────────────────────────────────────── */
responder = () => respostaIA('A insuficiência cardíaca de fração de ejeção reduzida…');
let r = await pedir({ acao: 'transcrever', parte: 2, total: 12, tema: 'Cardiologia',
  audio: { tipo: 'audio/webm;codecs=opus', dados: AUDIO } });
if (r.status === 200 && /insuficiência/.test(r.corpo.texto)) ok('o trecho volta transcrito');
else falha('transcrever: ' + JSON.stringify(r));

const partes = ultimoPedido?.corpo?.contents?.[0]?.parts || [];
const audio = partes.find((p) => p.inline_data);
if (audio && audio.inline_data.data === AUDIO) ok('o áudio sobe como áudio de verdade, e não como texto');
else falha('o áudio não chegou ao modelo');
if (audio && audio.inline_data.mime_type === 'audio/webm') ok('o tipo vai sem o ";codecs=…" do navegador');
else falha('tipo: ' + (audio && audio.inline_data.mime_type));
if (partes.some((p) => /Trecho 2 de 12/.test(p.text || ''))) ok('e o modelo sabe que é o trecho 2 de 12');
else falha('faltou dizer qual trecho');

r = await pedir({ acao: 'transcrever', audio: { tipo: 'audio/mpeg', dados: AUDIO } });
const tipoMp3 = (ultimoPedido?.corpo?.contents?.[0]?.parts || []).find((p) => p.inline_data)?.inline_data.mime_type;
if (tipoMp3 === 'audio/mp3') ok('MP3 da conversão de reserva vai como "audio/mp3", o nome que o Gemini documenta');
else falha('mp3: ' + tipoMp3);

/* Formato estranho ou áudio grande demais nem chegam à IA. */
chamadasIA = 0;
r = await pedir({ acao: 'transcrever', audio: { tipo: 'video/mp4', dados: AUDIO } });
if (r.status === 415 && chamadasIA === 0) ok('tipo que não é áudio é recusado antes de gastar a IA');
else falha('tipo errado: ' + JSON.stringify(r));
r = await pedir({ acao: 'transcrever', audio: { tipo: 'audio/webm', dados: 'A'.repeat(mod.MAX_AUDIO_BASE64 + 10) } });
if (r.status === 400 && chamadasIA === 0) ok('trecho grande demais é recusado antes de gastar a IA');
else falha('grande demais: ' + r.status);
r = await pedir({ acao: 'transcrever', audio: { tipo: 'audio/webm', dados: '' } });
if (r.status === 400) ok('trecho vazio é recusado');
else falha('vazio: ' + r.status);

/* ── o formato recusado ───────────────────────────────────────────────
 * É o que decide se a tela converte para MP3 e tenta de novo. */
responder = () => ({ status: 400, corpo: { error: { message: 'Unsupported MIME type: audio/webm' } } });
r = await pedir({ acao: 'transcrever', audio: { tipo: 'audio/webm', dados: AUDIO } });
if (r.status === 415 && r.corpo.formatoRecusado === true) ok('recusa de formato chega marcada, para o navegador converter e tentar de novo');
else falha('formato recusado: ' + JSON.stringify(r));

responder = () => ({ status: 400, corpo: { error: { message: 'Request payload size exceeds the limit' } } });
r = await pedir({ acao: 'transcrever', audio: { tipo: 'audio/webm', dados: AUDIO } });
if (!r.corpo.formatoRecusado) ok('um 400 por outro motivo não é confundido com formato — converter não resolveria');
else falha('confundiu outro erro com formato');

responder = () => ({ status: 429, corpo: { error: { message: 'quota' } } });
r = await pedir({ acao: 'transcrever', audio: { tipo: 'audio/webm', dados: AUDIO } });
if (r.status === 502 && !r.corpo.formatoRecusado && /Cota/.test(r.corpo.erro)) ok('cota esgotada vira recado claro');
else falha('cota: ' + JSON.stringify(r));

/* Sem Gemini, a transcrição avisa em vez de mandar áudio para quem não entende. */
chamadasIA = 0;
r = await pedir({ acao: 'transcrever', audio: { tipo: 'audio/webm', dados: AUDIO } },
  { ...env, GEMINI_API_KEY: '', ANTHROPIC_API_KEY: 'a' });
if (r.status === 500 && /Gemini/.test(r.corpo.erro) && chamadasIA === 0) ok('sem a chave do Gemini, diz que áudio precisa dele');
else falha('sem gemini: ' + JSON.stringify(r));

/* Quem não tem plano não transcreve. */
QUEM = { email: 'aluno@exemplo.com', localId: 'uid-aluno' };
PLANO_ATE = 0;
chamadasIA = 0;
r = await pedir({ acao: 'transcrever', audio: { tipo: 'audio/webm', dados: AUDIO } });
if (r.status === 403 && chamadasIA === 0) ok('sem plano, nada de transcrição — e nada de cota gasta');
else falha('sem plano: ' + JSON.stringify(r));
PLANO_ATE = Date.now() + 86400000;

/* ── organizar ────────────────────────────────────────────────────────── */
const TRANSCRICAO = 'Hoje vamos falar de insuficiência cardíaca. '.repeat(20);
const NOTAS = {
  titulo: 'Insuficiência cardíaca',
  resumo: 'A IC de fração reduzida tem quatro pilares de tratamento.',
  topicos: [{ titulo: 'Tratamento', pontos: ['IECA ou BRA ou INRA', 'Betabloqueador'] }],
  caiNaProva: ['Os quatro pilares'],
  condutas: ['Espironolactona 25 mg'],
  conferir: [],
};
responder = () => respostaIA('```json\n' + JSON.stringify(NOTAS) + '\n```');
r = await pedir({ acao: 'organizar', transcricao: TRANSCRICAO, tema: 'Cardiologia', quando: '26/09' });
if (r.status === 200 && r.corpo.notas.topicos.length === 1) ok('a transcrição vira notas, mesmo com a resposta dentro de cerca de código');
else falha('organizar: ' + JSON.stringify(r));
if (/<h2>Insuficiência cardíaca<\/h2>/.test(r.corpo.html) && /<h3>Cai na prova<\/h3>/.test(r.corpo.html)) {
  ok('e o HTML sai com título e seções prontas para a anotação');
} else falha('html: ' + r.corpo.html);
if (!/Para conferir/.test(r.corpo.html)) ok('seção vazia não aparece');
else falha('apareceu seção vazia');

const enviado = String(ultimoPedido?.corpo?.contents?.[0]?.parts?.[0]?.text || '');
if (/<transcricao>[\s\S]*<\/transcricao>/.test(enviado)) ok('a transcrição vai delimitada, como conteúdo e não como ordem');
else falha('a transcrição foi solta');

/* O ponto mais importante: o que a IA escreve entra ESCAPADO. */
responder = () => respostaIA(JSON.stringify({
  titulo: '<img src=x onerror=alert(1)>',
  resumo: 'ok',
  topicos: [{ titulo: '<script>alert(2)</script>', pontos: ['<a href="javascript:alert(3)">clique</a>', "aspas \" e ' juntas"] }],
  caiNaProva: [], condutas: [], conferir: [],
}));
r = await pedir({ acao: 'organizar', transcricao: TRANSCRICAO });
const h = r.corpo.html || '';
if (!/<script|<img|<a /i.test(h) && /&lt;script&gt;/.test(h) && /&lt;img/.test(h)) {
  ok('etiqueta escrita pela IA vira texto na anotação, e não HTML que executa');
} else falha('HTML da IA passou: ' + h);
if (/&quot;/.test(h) && /&#39;/.test(h)) ok('aspas também são escapadas');
else falha('aspas: ' + h);

/* Respostas ruins. */
responder = () => respostaIA('desculpe, não entendi a aula');
r = await pedir({ acao: 'organizar', transcricao: TRANSCRICAO });
if (r.status === 502 && /formato/.test(r.corpo.erro)) ok('resposta ilegível vira recado explicado');
else falha('ilegível: ' + JSON.stringify(r));

responder = () => respostaIA(JSON.stringify({ titulo: 'x', topicos: [] }));
r = await pedir({ acao: 'organizar', transcricao: TRANSCRICAO });
if (r.status === 502) ok('notas vazias não entram na anotação como se fossem resultado');
else falha('notas vazias: ' + JSON.stringify(r));

chamadasIA = 0;
r = await pedir({ acao: 'organizar', transcricao: 'curto demais' });
if (r.status === 400 && chamadasIA === 0) ok('transcrição curta demais nem chega na IA');
else falha('curta: ' + r.status);

/* ── as notas e seus tetos ────────────────────────────────────────────── */
const n = mod.notasDaAula({
  titulo: 'x'.repeat(500),
  topicos: Array.from({ length: 80 }, (_, i) => ({ titulo: 'T' + i, pontos: Array.from({ length: 90 }, () => 'p') })),
  caiNaProva: 'não é lista',
  conferir: [null, '', '  ', 'válido'],
});
if (n.titulo.length <= 140 && n.topicos.length <= 30 && n.topicos[0].pontos.length <= 25) ok('tamanhos têm teto: a anotação não incha com uma resposta desgovernada');
else falha('tetos: ' + JSON.stringify({ t: n.titulo.length, top: n.topicos.length, p: n.topicos[0].pontos.length }));
if (Array.isArray(n.caiNaProva) && n.caiNaProva.length === 0 && n.conferir.length === 1) ok('campo com tipo errado vira lista vazia, e itens vazios somem');
else falha('limpeza: ' + JSON.stringify(n));
if (mod.notasDaAula(null).topicos.length === 0) ok('resposta nula não estoura');
else falha('nula');

if (mod.tipoBase('audio/webm; codecs=opus') === 'audio/webm' && mod.tipoBase('AUDIO/MP4') === 'audio/mp4') ok('tipo normalizado');
else falha('tipoBase');

servidor.close();
console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
process.exit(erros.length ? 1 : 0);

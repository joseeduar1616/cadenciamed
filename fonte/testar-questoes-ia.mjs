/* Testa a rota que escreve as questões do duelo, sem gastar cota.
 *
 * Roda contra o arquivo que vai para o ar (worker/api/questoes-ia.js), com
 * a mesma técnica de servidor falso do testar-cronograma-ia.mjs.
 *
 * O que mais importa aqui não é o caminho feliz: é o que a rota faz com
 * resposta ruim da IA. Descanso de dez minutos, vinte séries num
 * exercício e grupo muscular inventado chegariam na tela como se fossem
 * prescrição, e o cronômetro contaria os dez minutos sem reclamar.
 *
 *   node testar-questoes-ia.mjs
 */
import http from 'node:http';

const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

let responder = () => ({ status: 200, corpo: {} });
let ultimoPedido = null;

const servidor = http.createServer((req, res) => {
  let cru = '';
  req.on('data', (d) => { cru += d; });
  req.on('end', () => {
    ultimoPedido = { url: req.url, headers: req.headers, corpo: JSON.parse(cru || '{}') };
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
    return Promise.resolve(new Response(
      JSON.stringify(QUEM ? { users: [QUEM] } : { users: [] }),
      { status: QUEM === null ? 400 : 200, headers: { 'Content-Type': 'application/json' } }));
  }
  if (u.includes('generativelanguage.googleapis.com') || u.includes('api.anthropic.com')) {
    return fetchReal(base + new URL(u).pathname, opcoes);
  }
  if (u.includes('oauth2.googleapis.com/token')) {
    return Promise.resolve(new Response(JSON.stringify({ access_token: 'token-falso' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  if (u.includes('firestore.googleapis.com')) {
    return Promise.resolve(new Response(
      JSON.stringify(PLANO_ATE ? { fields: { validoAte: { doubleValue: PLANO_ATE } } } : {}),
      { status: PLANO_ATE ? 200 : 404, headers: { 'Content-Type': 'application/json' } }));
  }
  return fetchReal(url, opcoes);
};

const pedir = async (fn, corpo) => {
  const req = new Request('http://local/api/questoes-ia', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const res = await fn({ request: req, env });
  return { status: res.status, corpo: await res.json() };
};

const PEDIDO = {
  token: 'token-de-teste',
  quantas: 3,
  texto: 'A síndrome nefrítica tem hematúria, hipertensão e edema. '.repeat(4),
};

const env = {};
const carregar = async () => (await import('../worker/api/questoes-ia.js?v=' + Math.random())).onRequest;

env.FIREBASE_API_KEY = 'chave-firebase';
env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify(CONTA);
env.GEMINI_API_KEY = 'chave-de-teste';
PLANO_ATE = Date.now() + 30 * 86400000;


/* Resposta da IA embrulhada como o Gemini embrulha. */

const TREINO_BOM = {
  nome: 'Puxar, empurrar, pernas',
  aviso: '',
  dias: [
    {
      nome: 'Costas e bíceps',
      exercicios: [
        { nome: 'Barra fixa', grupo: 'Costas', series: 4, reps: '6-10', descanso: 120, observacao: 'Escápula primeiro' },
        { nome: 'Rosca direta', grupo: 'Bíceps', series: 3, reps: '10-12', descanso: 60, observacao: '' },
      ],
    },
  ],
};


const respostaIA = (obj) => ({
  status: 200,
  corpo: {
    candidates: [{
      content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] },
      finishReason: 'STOP',
    }],
  },
});

const BOAS = {
  tema: 'Nefrologia',
  questoes: [
    { enunciado: 'Qual a tríade?', alternativas: ['a', 'b', 'c', 'd'], certa: 1, porque: 'porque sim' },
    { enunciado: 'E o tratamento?', alternativas: ['x', 'y', 'z', 'w'], certa: 3, porque: 'porque não' },
  ],
};

/* ── 1. material curto demais nem chega na IA ─────────────────────────── */
let chamouIA = false;
responder = () => { chamouIA = true; return respostaIA(BOAS); };
let r = await pedir(await carregar(), { ...PEDIDO, texto: 'oi' });
if (r.status === 400 && !chamouIA) ok('material curto demais: recusado antes de gastar a IA');
else falha('material curto: ' + JSON.stringify(r));

/* ── 2. caminho feliz ─────────────────────────────────────────────────── */
r = await pedir(await carregar(), PEDIDO);
if (r.status === 200 && r.corpo.questoes.length === 2) ok('as questões voltam prontas');
else falha('caminho feliz: ' + JSON.stringify(r));
if (r.corpo.tema === 'Nefrologia') ok('o tema vem junto, para dar nome ao duelo');
else falha('tema: ' + r.corpo.tema);

/* O material é texto que veio de fora, e vai delimitado com o aviso de que
   não são ordens. */
const mandado = String(ultimoPedido.corpo.contents?.[0]?.parts?.[0]?.text || '');
if (/"""/.test(mandado)) ok('o material vai delimitado, como dado e não como instrução');
else falha('o material foi enviado solto');

/* ── 3. questão que não dá para disputar é descartada ─────────────────── */
responder = () => respostaIA({
  tema: 'Ruim',
  questoes: [
    { enunciado: 'Só uma opção', alternativas: ['a'], certa: 0 },
    { enunciado: 'Gabarito fora', alternativas: ['a', 'b'], certa: 7 },
    { enunciado: 'Repetida', alternativas: ['igual', 'igual', 'b'], certa: 0 },
    { enunciado: 'Sem enunciado?', alternativas: ['a', 'b'], certa: 1 },
  ],
});
r = await pedir(await carregar(), PEDIDO);
const boas = r.corpo.questoes || [];
if (boas.length === 1 && boas[0].enunciado === 'Sem enunciado?') {
  ok('questão sem opção, com gabarito fora da lista ou com alternativa repetida é descartada');
} else falha('a limpeza deixou passar: ' + JSON.stringify(boas.map((q) => q.enunciado)));

/* ── 4. nenhuma aproveitável vira recado, não lista vazia ─────────────── */
responder = () => respostaIA({ tema: '', questoes: [{ enunciado: 'x', alternativas: ['a'], certa: 0 }] });
r = await pedir(await carregar(), PEDIDO);
if (/Não consegui tirar questões/.test(r.corpo.erro || '')) ok('material que não rende questão vira recado explicado');
else falha('sem questões: ' + JSON.stringify(r.corpo));

/* ── 5. resposta ilegível ─────────────────────────────────────────────── */
responder = () => respostaIA('desculpa, não consigo');
r = await pedir(await carregar(), PEDIDO);
if (r.status === 502 && /formato/.test(r.corpo.erro || '')) ok('resposta ilegível vira erro explicado');
else falha('ilegível: ' + JSON.stringify(r));

/* ── 6. teto de questões ──────────────────────────────────────────────── */
responder = () => respostaIA({
  tema: 'Muitas',
  questoes: Array.from({ length: 80 }, (_, i) => ({
    enunciado: 'Q' + i, alternativas: ['a', 'b', 'c', 'd'], certa: 0,
  })),
});
r = await pedir(await carregar(), { ...PEDIDO, quantas: 999 });
if ((r.corpo.questoes || []).length <= 30) ok('oitenta questões viram no máximo trinta');
else falha('passou ' + r.corpo.questoes.length + ' questões');

/* ── figuras do material ──────────────────────────────────────────────
   A IA precisa VER a figura: mandar só o nome do arquivo não diz nada
   sobre o que está na imagem, e foi por isso que a primeira versão quase
   nunca marcava figura nenhuma. */
const FIG_UM = { nome: 'ecg-1.jpg', dataUri: 'data:image/jpeg;base64,' + 'A'.repeat(120) };
const FIG_DOIS = { nome: 'lamina-2.png', dataUri: 'data:image/png;base64,' + 'B'.repeat(120) };
const COM_FIGURA = {
  ...PEDIDO,
  texto: 'Traçado de eletrocardiograma. [[img:ecg-1.jpg]] Observe o intervalo PR ao longo do exame completo.',
  figuras: [FIG_UM, FIG_DOIS],
};

responder = () => respostaIA({
  tema: 'ECG',
  questoes: [
    { enunciado: 'Que ritmo aparece na imagem?', alternativas: ['a', 'b', 'c', 'd'], certa: 0, imagem: 'ecg-1.jpg' },
    { enunciado: 'E aqui?', alternativas: ['a', 'b', 'c', 'd'], certa: 1, imagem: 'inventada.jpg' },
    { enunciado: 'Sem figura?', alternativas: ['a', 'b', 'c', 'd'], certa: 2 },
  ],
});
r = await pedir(await carregar(), COM_FIGURA);

/* O que mais importa: as imagens chegaram ao modelo, e não só os nomes. */
const partes = ultimoPedido.corpo.contents?.[0]?.parts || [];
const comImagem = partes.filter((p) => p.inline_data);
if (comImagem.length === 2) ok('as duas figuras sobem como imagem de verdade para a IA');
else falha('figuras enviadas ao modelo: ' + comImagem.length);
if (comImagem[0] && comImagem[0].inline_data.mime_type === 'image/jpeg') ok('o tipo da imagem vai junto');
else falha('tipo da imagem: ' + JSON.stringify(comImagem[0] && comImagem[0].inline_data.mime_type));
if (partes.some((p) => p.text === 'Figura: ecg-1.jpg')) ok('cada figura vai rotulada com o nome, que é como a IA a chama de volta');
else falha('faltou o rótulo da figura: ' + JSON.stringify(partes.map((p) => p.text).filter(Boolean)));

let qs = r.corpo.questoes || [];
if (qs[0] && qs[0].imagem === 'ecg-1.jpg') ok('a questão sobre a imagem leva o nome da figura');
else falha('nome da figura: ' + JSON.stringify(qs[0]));
if (qs[1] && qs[1].imagem === '') ok('nome de figura que não subiu é descartado');
else falha('aceitou figura inventada: ' + JSON.stringify(qs[1]));
if (qs[2] && qs[2].imagem === '') ok('questão sem figura continua sem figura');
else falha('apareceu figura onde não havia: ' + JSON.stringify(qs[2]));
if (r.corpo.figurasVistas === 2) ok('a tela fica sabendo quantas figuras a IA viu');
else falha('figurasVistas: ' + r.corpo.figurasVistas);

/* Sem figura nenhuma, nada muda: o material é só texto. */
responder = () => respostaIA(BOAS);
r = await pedir(await carregar(), PEDIDO);
if ((ultimoPedido.corpo.contents?.[0]?.parts || []).every((p) => !p.inline_data)) ok('material sem figura não manda imagem nenhuma');
else falha('mandou imagem sem ter figura');

/* Figura que não é imagem, ou grande demais, fica de fora. O pedido é só
   JSON, e nada impede alguém de mandar outra coisa. */
responder = () => respostaIA(BOAS);
r = await pedir(await carregar(), {
  ...PEDIDO,
  figuras: [
    { nome: 'x.jpg', dataUri: 'data:application/pdf;base64,AAAA' },
    { nome: 'y.jpg', dataUri: 'nem data uri' },
    { nome: '', dataUri: 'data:image/jpeg;base64,AAAA' },
    { nome: 'enorme.jpg', dataUri: 'data:image/jpeg;base64,' + 'C'.repeat(800000) },
  ],
});
if (r.corpo.figurasVistas === 0) ok('o que não é imagem, ou é grande demais, não sobe');
else falha('subiu figura inválida: ' + r.corpo.figurasVistas);

/* O marcador é endereço de arquivo, não texto para ler. */
responder = () => respostaIA({
  tema: 'ECG',
  questoes: [{
    enunciado: 'Veja [[img:ecg-1.jpg]] e diga o ritmo',
    alternativas: ['a [[img:ecg-1.jpg]]', 'b', 'c', 'd'], certa: 0, imagem: 'ecg-1.jpg',
  }],
});
r = await pedir(await carregar(), COM_FIGURA);
qs = r.corpo.questoes || [];
if (qs[0] && !/\[\[img:/.test(JSON.stringify(qs[0]))) ok('marcador copiado para dentro do texto é limpo');
else falha('o marcador vazou para a tela: ' + JSON.stringify(qs[0]));
if (qs[0] && qs[0].enunciado === 'Veja e diga o ritmo') ok('e o enunciado sobra legível depois da limpeza');
else falha('enunciado depois da limpeza: ' + JSON.stringify(qs[0] && qs[0].enunciado));

/* ── 7. sem conta, sem questões ───────────────────────────────────────── */
responder = () => respostaIA(BOAS);
r = await pedir(await carregar(), { ...PEDIDO, token: '' });
if (r.status === 403) ok('sem entrar na conta, a rota recusa');
else falha('sem token: ' + JSON.stringify(r));

servidor.close();
console.log(passos.join('\n'));
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);

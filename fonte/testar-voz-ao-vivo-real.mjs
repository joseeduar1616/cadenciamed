/* Uma conversa de verdade com o Gemini Live, para ouvir a voz.
 *
 * Os outros testes provam o código sem a Google. Este liga de verdade,
 * com a mesma configuração que a rota /api/voz tranca no token (voz,
 * idioma, instrução, detecção de fala), manda três falas por texto e
 * grava tudo o que ela responde num arquivo WAV, com as legendas no
 * terminal e o tempo até o primeiro áudio. É o que dá para conferir a
 * naturalidade antes de ligar para todo mundo. Gasta cota da chave.
 *
 *   GEMINI_API_KEY=... node testar-voz-ao-vivo-real.mjs
 *   GEMINI_API_KEY=... GEMINI_LIVE_MODELO=gemini-... node testar-voz-ao-vivo-real.mjs
 *
 * Sai em fonte/_amostra-voz-ao-vivo.wav (não vai para o repositório).
 */
import fs from 'node:fs';
import path from 'node:path';

const CHAVE = process.env.GEMINI_API_KEY;
if (!CHAVE) { console.error('Defina GEMINI_API_KEY no ambiente (a chave fica só na sua máquina).'); process.exit(2); }

const R = await import('../worker/api/voz.js');
const S = await import('../worker/api/_site.js');
const BASE = 'https://generativelanguage.googleapis.com';

/* o modelo: o forçado, ou o melhor que a chave enxerga */
const lista = await fetch(`${BASE}/v1beta/models?pageSize=200`, { headers: { 'x-goog-api-key': CHAVE } }).then((r) => r.json());
const modelo = R.escolherModeloAoVivo(lista.models || [], process.env.GEMINI_LIVE_MODELO || '');
if (!modelo) { console.error('Nenhum modelo com bidiGenerateContent nesta chave. Modelos vistos:', (lista.models || []).map((m) => m.name).join(', ')); process.exit(1); }
console.log('modelo:', modelo);

const { setup, fieldMask } = R.configuracaoDaSessao({
  modelo, voz: process.env.GEMINI_LIVE_VOZ || S.VOZ_PADRAO,
  instrucao: S.instrucaoDaAssistente({ nome: 'Teste', prova: '2027-03-10', faltam: 129, plano: 'teste grátis em dia' }),
});

/* o token efêmero, do mesmo jeito que a rota faz */
const agora = Date.now();
const t = await fetch(`${BASE}/v1alpha/auth_tokens`, {
  method: 'POST',
  headers: { 'x-goog-api-key': CHAVE, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    uses: 1, expireTime: new Date(agora + 10 * 60000).toISOString(), newSessionExpireTime: new Date(agora + 2 * 60000).toISOString(),
    bidiGenerateContentSetup: setup, fieldMask,
  }),
}).then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => null) }));
if (t.status !== 200 || !t.corpo || !t.corpo.name) { console.error('token recusado:', t.status, JSON.stringify(t.corpo)); process.exit(1); }
console.log('token efêmero criado');

const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(t.corpo.name)}`;
const ws = new WebSocket(url);
const pcm = [];
let legendaDela = '';
let legendaMinha = '';
let inicioDaVez = 0;
let primeiroAudio = 0;
const FALAS = [
  'Oi! Se apresente em uma frase, dizendo que é a assistente virtual do Cadência Med, e pergunte como pode ajudar.',
  'Quanto custa o plano e quantos dias de teste grátis eu tenho? Minha prova é dia dez de março.',
  'Como eu faço para trazer um baralho do Anki para os meus cartões?',
];
let i = 0;
const terminar = () => {
  const dados = Buffer.concat(pcm);
  const cab = Buffer.alloc(44);
  cab.write('RIFF', 0); cab.writeUInt32LE(36 + dados.length, 4); cab.write('WAVE', 8);
  cab.write('fmt ', 12); cab.writeUInt32LE(16, 16); cab.writeUInt16LE(1, 20); cab.writeUInt16LE(1, 22);
  cab.writeUInt32LE(24000, 24); cab.writeUInt32LE(24000 * 2, 28); cab.writeUInt16LE(2, 32); cab.writeUInt16LE(16, 34);
  cab.write('data', 36); cab.writeUInt32LE(dados.length, 40);
  const saida = path.resolve('_amostra-voz-ao-vivo.wav');
  fs.writeFileSync(saida, Buffer.concat([cab, dados]));
  console.log(`\náudio: ${saida} (${(dados.length / 48000).toFixed(1)} s)`);
  try { ws.close(); } catch (e) { /* segue */ }
  process.exit(0);
};
const proximaFala = () => {
  if (i >= FALAS.length) { terminar(); return; }
  const texto = FALAS[i++];
  console.log(`\n> ${texto}`);
  inicioDaVez = Date.now(); primeiroAudio = 0;
  ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: texto }] }], turnComplete: true } }));
};
ws.onopen = () => ws.send(JSON.stringify({ setup: { model: `models/${modelo}` } }));
ws.onmessage = async (ev) => {
  const texto = typeof ev.data === 'string' ? ev.data : Buffer.from(await ev.data.arrayBuffer()).toString('utf8');
  let m; try { m = JSON.parse(texto); } catch (e) { return; }
  if (m.setupComplete) { console.log('sessão pronta'); proximaFala(); return; }
  const sc = m.serverContent || {};
  for (const p of ((sc.modelTurn && sc.modelTurn.parts) || [])) {
    if (p.inlineData && p.inlineData.data) {
      if (!primeiroAudio) { primeiroAudio = Date.now(); console.log(`  primeiro áudio em ${primeiroAudio - inicioDaVez} ms`); }
      pcm.push(Buffer.from(p.inlineData.data, 'base64'));
    }
  }
  if (sc.outputTranscription && sc.outputTranscription.text) legendaDela += sc.outputTranscription.text;
  if (sc.inputTranscription && sc.inputTranscription.text) legendaMinha += sc.inputTranscription.text;
  if (sc.turnComplete) {
    console.log(`  ela: ${legendaDela.trim()}`);
    legendaDela = ''; legendaMinha = '';
    setTimeout(proximaFala, 800);
  }
  if (m.goAway) console.log('aviso de fim:', JSON.stringify(m.goAway));
};
ws.onerror = (e) => { console.error('erro no websocket', e && e.message); };
ws.onclose = (ev) => { console.log('fechou', ev.code, ev.reason || ''); if (pcm.length) terminar(); else process.exit(1); };
setTimeout(() => { console.error('tempo esgotado'); terminar(); }, 120000);

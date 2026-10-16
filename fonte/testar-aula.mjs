/* Testa a lógica da gravação de aula: formato, conversão e transcrição.
 *
 * O MP3 é gerado com o MESMO lame.min.js que vai para o ar, rodando aqui
 * no Node. E o resultado é conferido de fora: quadros MP3 válidos, com a
 * taxa pedida, e duração que bate com o áudio de entrada — um codificador
 * mal chamado entrega bytes que parecem certos e um arquivo que ninguém
 * consegue tocar, e isso só apareceria depois de a pessoa gravar uma aula.
 *
 *   node testar-aula.mjs
 */
import vm from 'node:vm';
import fs from 'node:fs';

const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const A = await import('./_aula.mjs');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('./lame.min.js', import.meta.url), 'utf8'), ctx);
const lame = ctx.lamejs;

/* ── o formato de gravação ────────────────────────────────────────────── */
const chrome = (t) => ['audio/webm;codecs=opus', 'audio/webm'].includes(t);
const firefox = (t) => ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'].includes(t);
const safari = (t) => t === 'audio/mp4';
if (A.tipoDeGravacao(chrome) === 'audio/webm;codecs=opus') ok('Chrome grava em Opus, o menor para fala');
else falha('chrome: ' + A.tipoDeGravacao(chrome));
if (A.tipoDeGravacao(safari) === 'audio/mp4') ok('Safari, que não tem Opus, grava em MP4');
else falha('safari: ' + A.tipoDeGravacao(safari));
if (A.tipoDeGravacao(firefox) === 'audio/webm;codecs=opus') ok('Firefox fica com a primeira opção que suporta');
else falha('firefox: ' + A.tipoDeGravacao(firefox));
if (A.tipoDeGravacao(() => false) === '') ok('sem formato nenhum, devolve vazio e o navegador escolhe');
else falha('nenhum');
if (A.tipoDeGravacao(() => { throw new Error('x'); }) === '') ok('navegador sem isTypeSupported não estoura');
else falha('isTypeSupported quebrado');

if (A.tipoBaseAudio('audio/webm;codecs=opus') === 'audio/webm') ok('o tipo perde o ";codecs"');
else falha('tipoBase');
for (const [t, e] of [['audio/webm;codecs=opus', 'webm'], ['audio/mp4', 'm4a'], ['audio/ogg', 'ogg'], ['audio/mpeg', 'mp3'], ['audio/wav', 'wav'], ['', 'webm']]) {
  if (A.extensaoDoAudio(t) !== e) falha(`extensão de ${t}: ${A.extensaoDoAudio(t)}`);
}
if (!erros.some((x) => x.startsWith('extensão'))) ok('cada formato baixa com a extensão certa');

/* ── amostras ─────────────────────────────────────────────────────────── */
const i16 = A.paraInt16(new Float32Array([0, 1, -1, 0.5, 2, -3, NaN]));
if (i16[0] === 0 && i16[1] === 32767 && i16[2] === -32768) ok('os extremos viram os limites de 16 bits');
else falha('extremos: ' + Array.from(i16));
if (i16[4] === 32767 && i16[5] === -32768) ok('pico acima do limite é aparado, e não dá a volta (que viraria estalo)');
else falha('pico: ' + Array.from(i16));
if (i16[6] === 0) ok('amostra inválida vira silêncio');
else falha('NaN: ' + i16[6]);

const mono = A.misturarMono([new Float32Array([1, 0, 0.5]), new Float32Array([0, 0, 0.5])]);
if (mono[0] === 0.5 && mono[1] === 0 && mono[2] === 0.5) ok('estéreo vira mono pela média');
else falha('mono: ' + Array.from(mono));
if (A.misturarMono([]).length === 0 && A.misturarMono(null).length === 0) ok('sem canal nenhum, sai vazio sem estourar');
else falha('sem canais');

/* ── WAV ──────────────────────────────────────────────────────────────── */
const tom = (seg, taxa) => {
  const n = Math.round(seg * taxa);
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = 0.4 * Math.sin(2 * Math.PI * 440 * i / taxa);
  return A.paraInt16(f);
};
const pcm = tom(3, A.TAXA_TRANSCRICAO);
const wav = A.wavDe(pcm, A.TAXA_TRANSCRICAO);
const dv = new DataView(wav.buffer);
const txt = (p, n) => String.fromCharCode(...wav.slice(p, p + n));
if (txt(0, 4) === 'RIFF' && txt(8, 4) === 'WAVE' && txt(12, 4) === 'fmt ' && txt(36, 4) === 'data') ok('WAV com o cabeçalho RIFF certo');
else falha('cabeçalho WAV');
if (dv.getUint16(22, true) === 1 && dv.getUint32(24, true) === 16000 && dv.getUint16(34, true) === 16) {
  ok('mono, 16 kHz, 16 bits — o que o cabeçalho diz é o que vem depois');
} else falha('formato WAV: ' + [dv.getUint16(22, true), dv.getUint32(24, true), dv.getUint16(34, true)]);
if (dv.getUint32(40, true) === pcm.length * 2 && dv.getUint32(4, true) === 36 + pcm.length * 2 && wav.length === 44 + pcm.length * 2) {
  ok('os tamanhos declarados batem com o arquivo, senão o serviço lê áudio cortado');
} else falha('tamanhos WAV');
if (dv.getInt16(44 + 200, true) === pcm[100]) ok('as amostras vão em little-endian, na ordem');
else falha('amostras WAV');

/* ── MP3 ──────────────────────────────────────────────────────────────── */
const mp3 = A.mp3De(pcm, A.TAXA_TRANSCRICAO, A.KBPS_MP3, lame);
/* Anda pelos quadros, lendo o cabeçalho de cada um — é como um tocador
   de verdade abre o arquivo. MPEG-2 camada III, 16 kHz. */
const TAXAS_BITS = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
let pos = 0, quadros = 0, taxaErrada = 0, kbps = new Set();
while (pos + 4 <= mp3.length) {
  if (mp3[pos] !== 0xff || (mp3[pos + 1] & 0xe0) !== 0xe0) break;
  const versao = (mp3[pos + 1] >> 3) & 3;       // 2 = MPEG-2
  const indiceBits = mp3[pos + 2] >> 4;
  const indiceTaxa = (mp3[pos + 2] >> 2) & 3;   // MPEG-2: 0=22050, 1=24000, 2=16000
  const preench = (mp3[pos + 2] >> 1) & 1;
  if (versao !== 2 || indiceTaxa !== 2) taxaErrada += 1;
  const k = TAXAS_BITS[indiceBits];
  kbps.add(k);
  const tam = Math.floor((72 * k * 1000) / 16000) + preench;
  if (!tam) break;
  pos += tam;
  quadros += 1;
}
if (quadros > 0 && pos === mp3.length) ok(`MP3 válido do começo ao fim: ${quadros} quadros, nenhum byte sobrando`);
else falha(`MP3: parou no byte ${pos} de ${mp3.length} depois de ${quadros} quadros`);
if (!taxaErrada) ok('todos os quadros em 16 kHz');
else falha(taxaErrada + ' quadros com taxa errada');
if (kbps.size === 1 && kbps.has(A.KBPS_MP3)) ok(`todos a ${A.KBPS_MP3} kbps`);
else falha('taxas de bits: ' + [...kbps]);
/* 576 amostras por quadro no MPEG-2 camada III. */
const duracao = (quadros * 576) / 16000;
if (Math.abs(duracao - 3) < 0.2) ok(`a duração bate com o áudio de entrada (${duracao.toFixed(2)} s de 3 s)`);
else falha('duração do MP3: ' + duracao);
/* Uma hora de aula: ~14 MB. Dez minutos, ~2,3 MB — cabe folgado num pedido. */
const porMinuto = (mp3.length / 3) * 60;
if (porMinuto * 10 < 3 * 1024 * 1024) ok(`dez minutos de aula dão ~${(porMinuto * 10 / 1024 / 1024).toFixed(1)} MB em MP3`);
else falha('MP3 grande demais: ' + porMinuto);

/* ── transcrições ─────────────────────────────────────────────────────── */
const junto = A.juntarTranscricoes({ 0: 'começo', 2: 'fim' }, 3);
if (junto === 'começo\n\n[trecho 2: sem transcrição]\n\nfim') ok('trecho que faltou fica marcado no lugar dele, e a ordem é mantida');
else falha('juntar: ' + JSON.stringify(junto));
if (A.juntarTranscricoes({ 1: 'b', 0: 'a' }, 2) === 'a\n\nb') ok('a ordem é a dos trechos, não a em que as transcrições chegaram');
else falha('ordem');
if (A.juntarTranscricoes(null, 0) === '') ok('sem trecho nenhum, vazio');
else falha('vazio');

const falta = A.faltamTranscrever({ trechos: 4, transcricoes: { 0: 'x', 2: '   ', 3: 'y' } });
if (JSON.stringify(falta) === '[1,2]') ok('retomar transcreve só os trechos que faltam — ninguém repaga o que deu certo');
else falha('faltam: ' + JSON.stringify(falta));
if (A.faltamTranscrever(null).length === 0) ok('ficha ausente não estoura');
else falha('ficha nula');

if (A.fmtDuracaoAula(0) === '00:00' && A.fmtDuracaoAula(65000) === '01:05' && A.fmtDuracaoAula(7384000) === '2:03:04') {
  ok('duração em mm:ss, e com hora quando passa de uma');
} else falha('duração: ' + [A.fmtDuracaoAula(0), A.fmtDuracaoAula(65000), A.fmtDuracaoAula(7384000)]);

/* ── os números do desenho ────────────────────────────────────────────── */
if (A.MINUTOS_POR_TRECHO * 60 > A.SEGUNDOS_ENTRE_SALVAMENTOS * 4) ok('cada trecho é salvo várias vezes antes de fechar');
else falha('salvamento raro demais para o tamanho do trecho');

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;

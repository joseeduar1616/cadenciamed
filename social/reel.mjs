/* Renderiza o reel.html quadro a quadro e grava social/publicado/<id>/reel.mp4
   (H.264, 1080x1920, 30 fps) com efeitos sonoros nas trocas de cena.

   node social/reel.mjs <id> [--previa 0,45,120]

   Precisa de playwright e de um ffmpeg com libx264: o caminho vem em FFMPEG
   (pip install imageio-ffmpeg dá um), ou usa o "ffmpeg" do PATH. CHROMIUM
   aponta o navegador, se o do playwright não estiver instalado. */
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path';
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const id = process.argv[2];
if (!id) { console.error('uso: node social/reel.mjs <id>'); process.exit(1); }
const FF = process.env.FFMPEG || 'ffmpeg';
const pasta = path.join(AQUI, 'saida', id);
const { quadros, fps } = JSON.parse(fs.readFileSync(path.join(pasta, 'reel.json'), 'utf8'));
const nav = await chromium.launch({ args: ['--no-sandbox'], ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
const p = await nav.newPage({ viewport: { width: 1080, height: 1920 } });
await p.goto('file://' + path.join(pasta, 'reel.html')); await p.evaluate(() => document.fonts.ready);
const TOTAL = await p.evaluate(() => window.TOTAL);

const iPrev = process.argv.indexOf('--previa');
if (iPrev > 0) {
  for (const t of process.argv[iPrev + 1].split(',').map(Number)) {
    await p.evaluate((t) => window.quadro(t), t);
    await p.screenshot({ path: path.join(pasta, `previa-${t}.png`) });
  }
  await nav.close(); process.exit(0);
}

/* trilha: um whoosh em cada troca de cena, um pop quando o título entra e
   um brilho na chamada final. Tudo sintetizado aqui, sem arquivo de fora. */
const sfx = path.join(pasta, 'sfx'); fs.mkdirSync(sfx, { recursive: true });
const gerar = (nome, args) => execFileSync(FF, ['-v', 'error', '-y', ...args, path.join(sfx, nome)]);
gerar('whoosh.wav', ['-f', 'lavfi', '-i', 'anoisesrc=color=pink:d=0.55:a=0.9:r=44100', '-af', 'highpass=f=300,lowpass=f=5000,afade=t=in:d=0.3:curve=exp,afade=t=out:st=0.3:d=0.25']);
gerar('pop.wav', ['-f', 'lavfi', '-i', "aevalsrc='0.8*sin(2*PI*t*(1100-5000*t))*exp(-28*t)':d=0.16:s=44100"]);
gerar('chime.wav', ['-f', 'lavfi', '-i', "aevalsrc='0.32*sin(2*PI*880*t)*exp(-5*t)+0.26*sin(2*PI*1318.5*t)*exp(-5*(t-0.09))*gt(t,0.09)+0.22*sin(2*PI*1760*t)*exp(-4*(t-0.18))*gt(t,0.18)':d=1.3:s=44100", '-af', 'aecho=0.8:0.6:120:0.35']);
const ev = [];
let ini = 0;
quadros.forEach((d, i) => {
  if (i > 0) ev.push(['whoosh', (ini - 8) / fps, .5]);
  ev.push(['pop', (ini + 4) / fps, .45]);
  if (i === quadros.length - 1) ev.push(['chime', (ini + 40) / fps, .5]);
  ini += d;
});
const ent = ev.flatMap(([s]) => ['-i', path.join(sfx, s + '.wav')]);
const filtros = ev.map(([, s, v], i) => { const ms = Math.max(0, Math.round(s * 1000)); return `[${i}:a]aformat=channel_layouts=stereo,adelay=${ms}|${ms},volume=${v}[e${i}]`; });
const mix = ev.map((_, i) => `[e${i}]`).join('') + `amix=inputs=${ev.length}:normalize=0,apad=whole_dur=${TOTAL / fps},atrim=0:${TOTAL / fps},alimiter=limit=0.9[s]`;
const trilha = path.join(pasta, 'trilha.wav');
execFileSync(FF, ['-v', 'error', '-y', ...ent, '-filter_complex', filtros.join(';') + ';' + mix, '-map', '[s]', '-ar', '44100', trilha]);

const dest = path.join(AQUI, 'publicado', id); fs.mkdirSync(dest, { recursive: true });
const saida = path.join(dest, 'reel.mp4');
const ff = spawn(FF, ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', '-i', trilha,
  '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(fps),
  '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', saida], { stdio: ['pipe', 'ignore', 'inherit'] });
for (let t = 0; t < TOTAL; t++) {
  await p.evaluate((t) => window.quadro(t), t);
  const buf = await p.screenshot({ type: 'jpeg', quality: 94 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
}
ff.stdin.end(); await new Promise((r) => ff.on('close', r));
await nav.close();
console.log('reel:', saida, (TOTAL / fps).toFixed(1) + ' s');

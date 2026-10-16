"""Transforma o JSON de um post num Reel 9:16 (1080x1920, 30 fps).

    python3 social/reel.py social/posts/<id>.json     -> social/saida/<id>/reel.html
    node social/reel.mjs <id>                         -> social/publicado/<id>/reel.mp4

Cada slide vira uma cena de ~3 s: o título entra palavra por palavra, o texto
aparece embaixo e o cartão de interface sobe flutuando. A capa já está
inteira no quadro 0 (o gancho precisa ser lido antes do dedo passar: nos
Reels do perfil, o que abria com o logo teve 92% de pulo nos 3 primeiros
segundos, contra uns 66% dos que abriam direto na frase). O último slide
fica mais tempo na tela, com a chamada.

Tudo é desenhado por quadro(t), sem animação CSS, para o render capturar
quadro a quadro.
"""
import json, os, sys
import carrossel as C

AQUI = os.path.dirname(os.path.abspath(__file__))
FPS = 30

CSS = C.CSS + """
html,body{width:1080px;height:1920px;overflow:hidden;background:#0B0A18;padding:0;display:block}
#v{position:relative;width:1080px;height:1920px;overflow:hidden;font-family:'Plus Jakarta Sans'}
.fundo,.grade{transition:none}
.camada{position:absolute;inset:0}
.cena{position:absolute;inset:0}
.cena.slide{width:1080px;height:1920px}
.cena .cab{top:262px;left:80px;right:80px}
.cena .conteudo{top:340px;left:80px;right:80px;bottom:auto}
.cena h1{font-size:96px;line-height:94px}
.cena.capa h1{font-size:128px;line-height:120px}
.cena h1 .w{display:inline-block;will-change:transform,opacity}
.cena p.texto{font-size:42px;line-height:60px}
.cena .uiwrap{position:absolute;left:80px;right:80px;top:980px;will-change:transform,opacity;transform-origin:50% 0}
.cena.capa .uiwrap{top:1000px}
.cena .card{padding:36px 40px}
.cena .botao{margin-top:40px}
.cena .seta{position:absolute;left:0;right:0;top:1500px;display:flex;justify-content:center}
.pt{position:absolute;width:6px;height:6px;border-radius:50%;background:#46D9F5;box-shadow:0 0 12px #46D9F5}
"""


def palavras(titulo):
    """O título com cada palavra num span, mantendo o {g}destaque{/g}."""
    out, g = [], False
    for w in titulo.replace('{g}', ' {g} ').replace('{/g}', ' {/g} ').split():
        if w == '{g}':
            g = True
            continue
        if w == '{/g}':
            g = False
            continue
        out.append(f'<span class="w{" g" if g else ""}">{C.esc(w)}</span>')
    return ' '.join(out)


def cena(s, i, n):
    tema, tipo = s.get('tema', 'escuro'), s.get('tipo', 'passo')
    topo = ''
    if s.get('tag'):
        topo += f'<div class="tag"><span class="traco"></span><span class="mono">{C.esc(s["tag"])}</span></div>'
    topo += f'<h1>{palavras(s["titulo"])}</h1>'
    if s.get('texto'):
        topo += f'<p class="texto">{C.rico(s["texto"])}</p>'
    baixo = C.ui_html(s.get('ui'), tema) if s.get('ui') else ''
    if s.get('botao'):
        baixo += f'<div class="botao">{C.esc(s["botao"])}</div>'
    if s.get('site'):
        baixo += f'<div class="site mono">{C.esc(s["site"])}</div>'
    return (f'<div class="cena slide {tema} {tipo}" data-i="{i}"><div class="fundo"></div><div class="grade"></div><div class="barra"></div>'
            f'<div class="cab"><img src="{C.MARCA}" alt=""><span class="mono">@CADENCIAMED</span><span class="mono dir">{i + 1}/{n}</span></div>'
            f'<div class="conteudo">{topo}</div><div class="uiwrap">{baixo}</div></div>')


JS = """
const DUR = __DUR__, N = DUR.length;
const INI = []; DUR.reduce((a, d, i) => (INI[i] = a, a + d), 0);
const TOTAL = INI[N - 1] + DUR[N - 1]; window.TOTAL = TOTAL;
const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const prog = (t, a, d) => cl((t - a) / d);
const io = (x) => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const sai = (x) => 1 - Math.pow(1 - x, 3);
const volta = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const cenas = [...document.querySelectorAll('.cena')];
const pts = [...document.querySelectorAll('.pt')];
window.quadro = async function (t) {
  cenas.forEach((c, i) => {
    const a = INI[i], d = DUR[i], fim = a + d;
    const entra = i === 0 ? 1 : io(prog(t, a - 8, 12));      // a cena nova cobre a anterior
    const vis = t >= a - 8 && t < fim + 6;
    c.style.display = vis ? 'block' : 'none'; if (!vis) return;
    c.style.zIndex = i; c.style.opacity = entra;
    c.style.clipPath = i === 0 ? 'none' : `circle(${entra * 2300}px at 540px 1500px)`;
    const lt = t - a;
    c.querySelectorAll('h1 .w').forEach((w, k) => {
      const kk = i === 0 ? 1 : prog(lt, 2 + k * 2, 8), e = volta(kk);
      w.style.opacity = cl(kk * 2.5); w.style.transform = `translateY(${(1 - kk) * 30}px) scale(${.55 + .45 * e})`;
    });
    const tag = c.querySelector('.tag'); if (tag) { const k = i === 0 ? 1 : sai(prog(lt, 0, 10)); tag.style.opacity = k; tag.style.transform = `translateX(${(1 - k) * -40}px)`; }
    const p = c.querySelector('p.texto'); if (p) { const k = i === 0 ? sai(prog(lt, 6, 14)) : sai(prog(lt, 16, 14)); p.style.opacity = k; p.style.transform = `translateY(${(1 - k) * 30}px)`; }
    const u = c.querySelector('.uiwrap');
    if (u) { const k = sai(prog(lt, i === 0 ? 10 : 22, 20)); const bob = Math.sin((t + i * 20) / 22) * 7;
      u.style.opacity = cl(k * 1.6); u.style.transform = `perspective(1800px) translateY(${(1 - k) * 260 + bob}px) rotateX(${(1 - k) * 18 + 2}deg) scale(${.92 + .08 * k})`; }
    const bt = c.querySelector('.botao'); if (bt) { const k = volta(prog(lt, 40, 16)); bt.style.transform = `scale(${(.6 + .4 * k) * (1 + (lt > 60 ? .03 * Math.max(0, Math.sin((lt - 60) / 6)) : 0))})`; bt.style.opacity = cl(prog(lt, 40, 5)); }
  });
  pts.forEach((p, i) => {
    const x = (i * 197 + 61) % 1040 + 20, v = .6 + (i % 5) * .25, y = ((i * 331 + 140) - t * v) % 2000;
    p.style.transform = `translate(${x + Math.sin((t + i * 40) / 40) * 14}px, ${(y < 0 ? y + 2000 : y) - 40}px)`;
    p.style.opacity = (.2 + .3 * (0.5 + 0.5 * Math.sin((t + i * 23) / 18)));
  });
  return true;
};
"""


def main():
    post = json.load(open(sys.argv[1], encoding='utf-8'))
    C.conferir(post)
    n = len(post['slides'])
    dur = []
    for i, s in enumerate(post['slides']):
        if i == n - 1:
            dur.append(5 * FPS)
        elif s.get('tipo') == 'capa':
            dur.append(int(2.6 * FPS))
        else:
            dur.append(int(3.4 * FPS))
    pontos = ''.join('<i class="pt"></i>' for _ in range(18))
    corpo = ''.join(cena(s, i, n) for i, s in enumerate(post['slides']))
    pagina = (f'<!doctype html><html><head><meta charset="utf-8"><style>{C.FONT_FACES}{CSS}</style></head><body><div id="v">'
              f'{corpo}<div class="camada" style="z-index:99;pointer-events:none">{pontos}</div></div>'
              f'<script>{JS.replace("__DUR__", json.dumps(dur))}</script></body></html>')
    saida = os.path.join(AQUI, 'saida', post['id'])
    os.makedirs(saida, exist_ok=True)
    open(os.path.join(saida, 'reel.html'), 'w', encoding='utf-8').write(pagina)
    open(os.path.join(saida, 'reel.json'), 'w').write(json.dumps({'quadros': dur, 'fps': FPS}))
    print(os.path.join(saida, 'reel.html'), sum(dur) / FPS, 's')


if __name__ == '__main__':
    main()

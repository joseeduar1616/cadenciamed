"""Monta um carrossel do Instagram (1080x1350) a partir de um JSON.

    python3 social/carrossel.py social/posts/2026-10-16-cronograma-atrasado.json

Gera social/saida/<id>/carrossel.html e, com o render.mjs, os JPEGs em
social/publicado/<id>/1.jpg, 2.jpg... O publicar.py copia social/publicado/
para publicar/s/, então cada imagem fica em
https://cadenciamed.com.br/s/<id>/<n>.jpg, que é o link público que o
Instagram exige para publicar.

O JSON tem {"id", "legenda", "slides": [...]}. Cada slide tem "tipo"
(capa, passo, final), "tema" (escuro, claro, degrade), e os textos:
"tag", "titulo" (com {g}destaque{/g}), "texto" (aceita <b>), e um "ui"
opcional com um dos blocos de interface desenhados aqui (lista, barras,
semana, checklist, cartao, questao, recursos). Veja LEIA-ME.md.

Regras de texto da marca (valem para todo JSON novo): português do Brasil,
tom de estudante, sem travessão, sem "não é X, é Y", sem marca de outro
app, sem número inventado, sem promessa de aprovação.
"""
import base64, html, json, os, re, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
FONTES = os.path.join(AQUI, 'fontes')


def b64(caminho):
    return base64.b64encode(open(caminho, 'rb').read()).decode()


def fonte(familia, peso, arquivo):
    return (f"@font-face{{font-family:'{familia}';font-weight:{peso};font-style:normal;"
            f"src:url(data:font/woff2;base64,{b64(os.path.join(FONTES, arquivo))}) format('woff2');}}")


FONT_FACES = '\n'.join([
    fonte('Space Grotesk', 700, 'space-grotesk-latin-700-normal.woff2'),
    fonte('Plus Jakarta Sans', 400, 'plus-jakarta-sans-latin-400-normal.woff2'),
    fonte('Plus Jakarta Sans', 700, 'plus-jakarta-sans-latin-700-normal.woff2'),
    fonte('Plus Jakarta Sans', 800, 'plus-jakarta-sans-latin-800-normal.woff2'),
    fonte('JetBrains Mono', 600, 'jetbrains-mono-latin-600-normal.woff2'),
])
MARCA = 'data:image/png;base64,' + b64(os.path.join(RAIZ, 'fonte', 'marca.png'))

CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{background:#000;display:flex;flex-direction:column;gap:30px;padding:30px;align-items:center}
.slide{position:relative;width:1080px;height:1350px;overflow:hidden;flex-shrink:0;font-family:'Plus Jakarta Sans'}
.fundo{position:absolute;inset:0}
.escuro .fundo{background:radial-gradient(circle at 100% 0%,rgba(168,107,255,.22),transparent 55%),radial-gradient(circle at 0% 100%,rgba(70,217,245,.12),transparent 55%),#0B0A18}
.claro .fundo{background:radial-gradient(circle at 100% 0%,rgba(168,107,255,.16),transparent 55%),radial-gradient(circle at 0% 100%,rgba(70,217,245,.12),transparent 55%),#F3F2F9}
.degrade .fundo{background:linear-gradient(160deg,#130C3A 0%,#4A20AE 55%,#1C8FB4 100%)}
.grade{position:absolute;inset:0;background-size:90px 90px}
.escuro .grade,.degrade .grade{background-image:linear-gradient(rgba(255,255,255,.028) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.028) 1px,transparent 1px)}
.claro .grade{background-image:linear-gradient(rgba(20,18,42,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(20,18,42,.035) 1px,transparent 1px)}
.barra{position:absolute;top:0;left:0;right:0;height:7px;background:linear-gradient(90deg,#46D9F5,#A86BFF)}
.cab{position:absolute;top:46px;left:72px;right:72px;height:44px;display:flex;align-items:center}
.cab img{height:30px;margin-right:14px}
.mono{font-family:'JetBrains Mono';font-weight:600;text-transform:uppercase}
.cab .mono{font-size:23px;letter-spacing:4px}
.cab .dir{margin-left:auto}
.escuro .cab .mono{color:#9C97B8}.claro .cab .mono{color:#7A7695}.degrade .cab .mono{color:#D6D0F2}
.conteudo{position:absolute;top:128px;left:72px;right:72px;bottom:120px;display:flex;flex-direction:column}
.tag{display:flex;align-items:center;gap:18px}
.tag .traco{width:50px;height:3px;border-radius:2px}
.tag .mono{font-size:25px;letter-spacing:5px}
.escuro .tag .traco{background:#46D9F5}.escuro .tag .mono{color:#46D9F5}
.claro .tag .traco{background:#7C3AED}.claro .tag .mono{color:#7C3AED}
.degrade .tag .traco{background:#9EF1FF}.degrade .tag .mono{color:#9EF1FF}
h1{font-family:'Space Grotesk';font-weight:700;text-transform:uppercase;font-size:88px;line-height:86px;letter-spacing:-2px;margin-top:18px}
.capa h1{font-size:122px;line-height:114px;margin-top:26px}
.escuro h1,.degrade h1{color:#fff}.claro h1{color:#14122A}
.g{-webkit-background-clip:text;background-clip:text;color:transparent}
.escuro .g{background-image:linear-gradient(90deg,#46D9F5,#A86BFF)}
.degrade .g{background-image:linear-gradient(90deg,#9EF1FF,#E2C6FF)}
.claro .g{background-image:linear-gradient(90deg,#7C3AED,#2F7BEA)}
p.texto{font-size:37px;line-height:54px;margin-top:24px}
.escuro p.texto{color:#C9C3DE}.escuro p b{color:#fff}
.claro p.texto{color:#4A4763}.claro p b{color:#14122A}
.degrade p.texto{color:#E6E1FA}.degrade p b{color:#fff}
p b{font-weight:800}
.num{position:absolute;right:52px;top:96px;font-family:'Space Grotesk';font-weight:700;font-size:330px;line-height:300px;letter-spacing:-14px;
  color:transparent;-webkit-text-stroke:3px rgba(168,107,255,.35)}
.claro .num{-webkit-text-stroke:3px rgba(124,58,237,.22)}
.ui{margin:auto 0}
.capa .conteudo{bottom:180px}
.degrade .card{background:rgba(255,255,255,.10);border-color:rgba(255,255,255,.22)}
.degrade .lin .t1{color:#fff}.degrade .lin .t2{color:#D6D0F2}.degrade .lin{border-top-color:rgba(255,255,255,.12)}
.degrade .chk .cx{border:2.5px solid rgba(255,255,255,.55)}
.degrade .card .ct{color:#9EF1FF}
.trilho{position:absolute;left:72px;right:170px;bottom:62px;height:6px;border-radius:3px}
.trilho i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#46D9F5,#A86BFF)}
.escuro .trilho,.degrade .trilho{background:rgba(255,255,255,.12)}.claro .trilho{background:rgba(20,18,42,.10)}
.cont{position:absolute;right:72px;bottom:48px;font-size:25px;letter-spacing:3px;line-height:34px}
.escuro .cont{color:#9C97B8}.claro .cont{color:#7A7695}.degrade .cont{color:#D6D0F2}
.arrasta{position:absolute;right:72px;bottom:110px;display:flex;align-items:center;gap:14px;font-size:24px;letter-spacing:4px;color:#E6E1FA}
/* cartões de interface */
.card{border-radius:30px;padding:30px 34px}
.escuro .card,.degrade .card{background:rgba(22,19,42,.92);border:1.5px solid rgba(255,255,255,.11);box-shadow:0 30px 70px rgba(0,0,0,.45)}
.claro .card{background:#fff;border:1.5px solid rgba(20,18,42,.07);box-shadow:0 24px 60px rgba(42,22,96,.14)}
.card .ct{font-size:22px;letter-spacing:4px;margin-bottom:8px}
.escuro .card .ct{color:#F5A524}.claro .card .ct{color:#7C3AED}
.lin{display:flex;align-items:center;gap:20px;padding:18px 0;border-top:1.5px solid rgba(255,255,255,.07)}
.claro .lin{border-top-color:rgba(20,18,42,.07)}
.lin:first-of-type{border-top:0}
.lin .k{width:6px;height:52px;border-radius:3px;flex-shrink:0}
.lin .t1{font-weight:800;font-size:31px}.lin .t2{font-weight:400;font-size:24px;margin-top:3px}
.escuro .lin .t1{color:#fff}.escuro .lin .t2{color:#9C97B8}
.claro .lin .t1{color:#14122A}.claro .lin .t2{color:#6B6785}
.selo{margin-left:auto;flex-shrink:0;border-radius:99px;padding:8px 18px;font-weight:800;font-size:22px}
.barras .lin .bar{flex:1;height:16px;border-radius:8px;background:rgba(255,255,255,.08);overflow:hidden}
.claro .barras .lin .bar{background:rgba(20,18,42,.07)}
.barras .lin .bar i{display:block;height:100%;border-radius:8px;background:linear-gradient(90deg,#46D9F5,#A86BFF)}
.barras .lin .nm{width:240px;font-weight:800;font-size:29px}
.escuro .barras .nm{color:#fff}.claro .barras .nm{color:#14122A}
.barras .lin .rt{width:200px;text-align:right;font-family:'JetBrains Mono';font-weight:600;font-size:21px;letter-spacing:2px;text-transform:uppercase}
.escuro .barras .rt{color:#9C97B8}.claro .barras .rt{color:#7A7695}
.semana{display:flex;gap:12px}
.dia{flex:1;border-radius:20px;padding:14px 10px;min-height:250px;display:flex;flex-direction:column;gap:10px;align-items:stretch}
.escuro .dia{background:rgba(255,255,255,.04);border:1.5px solid rgba(255,255,255,.08)}
.claro .dia{background:#F7F6FC;border:1.5px solid rgba(20,18,42,.06)}
.dia .d{text-align:center;font-size:20px;letter-spacing:3px}
.escuro .dia .d{color:#9C97B8}.claro .dia .d{color:#7A7695}
.bl{border-radius:10px;padding:8px 6px;font-weight:800;font-size:17px;line-height:21px;text-align:center;color:#0B0A18}
.chk .lin .cx{width:44px;height:44px;border-radius:12px;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.escuro .chk .cx{border:2.5px solid rgba(255,255,255,.25)}.claro .chk .cx{border:2.5px solid rgba(20,18,42,.2)}
.chk .cx.ok{background:linear-gradient(135deg,#46D9F5,#A86BFF);border:0}
.chk .lin .t1{font-weight:700;font-size:30px}
.cartao{display:flex;gap:22px}
.cartao .card{flex:1;text-align:center;padding:36px 28px}
.cartao .lbl{font-size:20px;letter-spacing:4px;color:#2DD4A0;margin-bottom:16px}
.cartao .q{font-weight:800;font-size:32px;line-height:42px}
.escuro .cartao .q{color:#fff}.claro .cartao .q{color:#14122A}
.alt{display:flex;align-items:center;gap:18px;margin-top:12px;border-radius:18px;padding:16px 20px;font-weight:700;font-size:28px}
.escuro .alt{background:rgba(255,255,255,.05);border:1.5px solid rgba(255,255,255,.09);color:#E9E5FA}
.claro .alt{background:#F5F4FA;border:1.5px solid rgba(20,18,42,.07);color:#14122A}
.alt b{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:23px;flex-shrink:0}
.escuro .alt b{background:rgba(255,255,255,.08)}.claro .alt b{background:rgba(20,18,42,.07)}
.alt.certa{background:rgba(45,212,160,.14)!important;border-color:#2DD4A0!important}
.alt.certa b{background:#2DD4A0;color:#0B0A18}
.enun{font-weight:700;font-size:31px;line-height:43px}
.escuro .enun{color:#fff}.claro .enun{color:#14122A}
.coment{margin-top:16px;border-radius:18px;padding:18px 22px;font-size:25px;line-height:36px}
.escuro .coment{background:rgba(45,212,160,.08);color:#D9F7EE}.claro .coment{background:rgba(45,212,160,.10);color:#14122A}
.recursos .lin .ic{width:62px;height:62px;border-radius:18px;flex-shrink:0;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(135deg,#46D9F5,#A86BFF);font-family:'Space Grotesk';font-weight:700;font-size:30px;color:#0B0A18}
.botao{display:inline-flex;align-self:flex-start;margin-top:34px;border-radius:99px;padding:26px 50px;font-weight:800;font-size:38px;color:#fff;
  background:linear-gradient(90deg,#7C3AED,#2F7BEA);box-shadow:0 20px 50px rgba(124,58,237,.35)}
.escuro .botao,.degrade .botao{background:#fff;color:#14122A;box-shadow:0 20px 50px rgba(0,0,0,.35)}
.site{margin-top:20px;font-size:25px;letter-spacing:3px}
.escuro .site,.degrade .site{color:#9EF1FF}.claro .site{color:#7C3AED}
"""


def esc(t):
    return html.escape(str(t), quote=False)


def rico(t):
    """Escapa o texto, mas deixa passar <b> e o {g}destaque{/g}."""
    t = esc(t).replace('&lt;b&gt;', '<b>').replace('&lt;/b&gt;', '</b>')
    return t.replace('{g}', '<span class="g">').replace('{/g}', '</span>')


CORES = ['#46D9F5', '#A86BFF', '#F5A524', '#2DD4A0', '#F2557A', '#5B8CFF']


def ui_html(ui, tema):
    if not ui:
        return ''
    tipo = ui['tipo']
    ct = f'<div class="ct mono">{esc(ui["titulo"])}</div>' if ui.get('titulo') else ''
    if tipo == 'lista':
        linhas = ''.join(
            f'<div class="lin"><span class="k" style="background:{it.get("cor", CORES[i % 6])}"></span>'
            f'<div><div class="t1">{esc(it["titulo"])}</div><div class="t2">{esc(it.get("sub", ""))}</div></div>'
            + (f'<span class="selo" style="background:{it.get("cor_selo", "rgba(245,165,36,.18)")};color:{it.get("cor_texto", "#F5A524")}">{esc(it["selo"])}</span>' if it.get('selo') else '')
            + '</div>' for i, it in enumerate(ui['itens']))
        return f'<div class="card">{ct}{linhas}</div>'
    if tipo == 'barras':
        linhas = ''.join(
            f'<div class="lin"><span class="nm">{esc(it["nome"])}</span><span class="bar"><i style="width:{round(float(it["valor"]) * 100)}%"></i></span>'
            f'<span class="rt">{esc(it.get("rotulo", ""))}</span></div>' for it in ui['itens'])
        return f'<div class="card barras">{ct}{linhas}</div>'
    if tipo == 'semana':
        dias = ''.join(
            f'<div class="dia"><div class="d mono">{esc(d["d"])}</div>'
            + ''.join(f'<div class="bl" style="background:{b.get("cor", CORES[j % 6])}">{esc(b["t"])}</div>' for j, b in enumerate(d.get('blocos', [])))
            + '</div>' for d in ui['dias'])
        return f'<div class="card">{ct}<div class="semana">{dias}</div></div>'
    if tipo == 'checklist':
        linhas = ''.join(
            f'<div class="lin"><span class="cx{" ok" if it.get("feito") else ""}">'
            + ('<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0B0A18" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>' if it.get('feito') else '')
            + f'</span><span class="t1">{esc(it["texto"])}</span></div>' for it in ui['itens'])
        return f'<div class="card chk">{ct}{linhas}</div>'
    if tipo == 'cartao':
        return ('<div class="cartao">'
                f'<div class="card"><div class="lbl mono">PERGUNTA</div><div class="q">{esc(ui["frente"])}</div></div>'
                f'<div class="card"><div class="lbl mono">RESPOSTA</div><div class="q">{esc(ui["verso"])}</div></div></div>')
    if tipo == 'questao':
        alts = ''.join(f'<div class="alt{" certa" if i == ui["certa"] else ""}"><b>{"ABCDE"[i]}</b>{esc(a)}</div>' for i, a in enumerate(ui['alternativas']))
        com = f'<div class="coment">{esc(ui["comentario"])}</div>' if ui.get('comentario') else ''
        return f'<div class="card">{ct}<div class="enun">{esc(ui["enunciado"])}</div>{alts}{com}</div>'
    if tipo == 'recursos':
        linhas = ''.join(
            f'<div class="lin"><span class="ic">{i + 1}</span><div><div class="t1">{esc(it["titulo"])}</div><div class="t2">{esc(it.get("texto", ""))}</div></div></div>'
            for i, it in enumerate(ui['itens']))
        return f'<div class="card recursos">{ct}{linhas}</div>'
    raise SystemExit('bloco de interface desconhecido: ' + tipo)


def slide_html(s, i, n):
    tema = s.get('tema', 'escuro')
    tipo = s.get('tipo', 'passo')
    corpo = ''
    if s.get('tag'):
        corpo += f'<div class="tag"><span class="traco"></span><span class="mono">{esc(s["tag"])}</span></div>'
    corpo += f'<h1>{rico(s["titulo"])}</h1>'
    if s.get('texto'):
        corpo += f'<p class="texto">{rico(s["texto"])}</p>'
    if s.get('ui'):
        corpo += f'<div class="ui">{ui_html(s["ui"], tema)}</div>'
    if s.get('botao'):
        corpo += f'<div class="botao">{esc(s["botao"])}</div>'
    if s.get('site'):
        corpo += f'<div class="site mono">{esc(s["site"])}</div>'
    extra = ''
    if tipo == 'capa' and n > 1:
        extra += ('<div class="arrasta mono">ARRASTA PRO LADO <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
                  'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div>')
    return (f'<section class="slide {tema} {tipo}"><div class="fundo"></div><div class="grade"></div><div class="barra"></div>'
            f'<div class="cab"><img src="{MARCA}" alt=""><span class="mono">@CADENCIAMED</span><span class="mono dir">{esc(s.get("direita", ""))}</span></div>'
            f'{extra}<div class="conteudo">{corpo}</div>'
            f'<div class="trilho"><i style="width:{(i + 1) / n * 100:.1f}%"></i></div><div class="cont mono">{i + 1}/{n}</div></section>')


VEDADO = [('—', 'travessão'), ('–', 'travessão')]


def conferir(post):
    textos = [post.get('legenda', '')] + [json.dumps(s, ensure_ascii=False) for s in post['slides']]
    for t in textos:
        for marca, nome in VEDADO:
            if marca in t:
                raise SystemExit(f'texto com {nome}: {t[:80]}')
        if re.search(r'n[ãa]o [ée] .{1,40}, [ée] ', t, re.I):
            raise SystemExit('texto no molde "não é X, é Y": ' + t[:80])
    if not 2 <= len(post['slides']) <= 10:
        raise SystemExit('o carrossel precisa de 2 a 10 slides')
    if len(post.get('legenda', '')) > 2200:
        raise SystemExit('legenda passa de 2200 caracteres')


def main():
    post = json.load(open(sys.argv[1], encoding='utf-8'))
    conferir(post)
    n = len(post['slides'])
    corpo = ''.join(slide_html(s, i, n) for i, s in enumerate(post['slides']))
    saida = os.path.join(AQUI, 'saida', post['id'])
    os.makedirs(saida, exist_ok=True)
    open(os.path.join(saida, 'carrossel.html'), 'w', encoding='utf-8').write(
        f'<!doctype html><html><head><meta charset="utf-8"><style>{FONT_FACES}{CSS}</style></head><body>{corpo}</body></html>')
    open(os.path.join(saida, 'legenda.txt'), 'w', encoding='utf-8').write(post.get('legenda', ''))
    print(os.path.join(saida, 'carrossel.html'))


if __name__ == '__main__':
    main()

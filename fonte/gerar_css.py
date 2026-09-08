"""Gera só as regras CSS das classes utilitárias realmente usadas.

Não é Tailwind: a lista de classes é varrida do app.jsx e cada uma é
traduzida à mão, aqui embaixo. Uma classe nova que o tradutor não conheça
para a compilação com "SEM REGRA", de propósito, para nunca ir ao ar um
elemento sem estilo.
"""
import re, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# ── varre as classes usadas ──────────────────────────────────────────────
# Pega tanto className="a b" quanto className={`a ${x} b`}, e joga fora o
# que está dentro de ${...}, que é código e não nome de classe.
fonte = open('app.jsx', encoding='utf-8').read()
achadas = set()
for trecho in re.findall(r'className=(?:"([^"]*)"|\{`([^`]*)`\})', fonte):
    texto = re.sub(r'\$\{[^}]*\}', ' ', trecho[0] or trecho[1])
    achadas.update(t for t in texto.split() if t)

# Estas não são utilitárias: são escritas no <style> do próprio app, junto
# das animações, então não devem ganhar regra aqui.
DO_APP = {
    'aba', 'aovivo', 'aura', 'aura-a', 'aura-b', 'aura-c', 'aura-d', 'brilhar',
    'breathe', 'marca', 'nota', 'pulso', 'rise', 'vidro',
    'toque', 'toque-larg',
}

classes = sorted(achadas - DO_APP)
open('classes.txt', 'w', encoding='utf-8').write(' '.join(classes) + '\n')

def rem(v): return f"{float(v)*0.25:g}rem"

def decl(c):
    simple = {
        "flex":"display:flex","grid":"display:grid","hidden":"display:none",
        "inline-flex":"display:inline-flex","inline":"display:inline","block":"display:block",
        "fixed":"position:fixed","flex-1":"flex:1 1 0%","flex-col":"flex-direction:column",
        "flex-row":"flex-direction:row","flex-wrap":"flex-wrap:wrap","w-full":"width:100%",
        "min-w-0":"min-width:0","mx-auto":"margin-left:auto;margin-right:auto",
        "overflow-hidden":"overflow:hidden","overflow-x-auto":"overflow-x:auto",
        "whitespace-nowrap":"white-space:nowrap","left-1/2":"left:50%",
    }
    if c in simple: return simple[c]
    m = re.match(r"^col-span-(\d+)$", c)
    if m: return f"grid-column:span {m.group(1)}/span {m.group(1)}"
    if c.startswith("items-"):
        return "align-items:" + {"center":"center","start":"flex-start","end":"flex-end","baseline":"baseline"}[c[6:]]
    if c.startswith("justify-"):
        return "justify-content:" + {"between":"space-between","center":"center","end":"flex-end"}[c[8:]]
    if c.startswith("text-"): return "text-align:" + c[5:]
    if c.startswith("rounded-"):
        # cantos quase retos, como nas referências técnicas
        return "border-radius:" + {"lg":"3px","xl":"4px","2xl":"5px","3xl":"7px","full":"9999px"}[c[8:]]
    if c.startswith("grid-cols-"):
        return f"grid-template-columns:repeat({c[10:]},minmax(0,1fr))"
    m = re.match(r"^(gap|gap-x|gap-y)-([\d.]+)$", c)
    if m:
        return {"gap":"gap","gap-x":"column-gap","gap-y":"row-gap"}[m.group(1)] + ":" + rem(m.group(2))
    m = re.match(r"^(m|p)([txbylr]?)-([\d.]+)$", c)
    if m:
        base = "margin" if m.group(1) == "m" else "padding"
        s, v = m.group(2), rem(m.group(3))
        return {"": f"{base}:{v}", "t": f"{base}-top:{v}", "b": f"{base}-bottom:{v}",
                "l": f"{base}-left:{v}", "r": f"{base}-right:{v}",
                "x": f"{base}-left:{v};{base}-right:{v}",
                "y": f"{base}-top:{v};{base}-bottom:{v}"}[s]
    m = re.match(r"^bottom-([\d.]+)$", c)
    if m: return f"bottom:{rem(m.group(1))}"
    raise SystemExit("SEM REGRA: " + c)

esc = lambda c: re.sub(r'([.:/])', r'\\\1', c)
base, sm, lg = [], [], []
for c in classes:
    if c.startswith("sm:"): sm.append(f'html:not([data-layout="movel"]) .{esc(c)}{{{decl(c[3:])}}}')
    elif c.startswith("lg:"): lg.append(f'html:not([data-layout="movel"]) .{esc(c)}{{{decl(c[3:])}}}')
    else: base.append(f".{esc(c)}{{{decl(c)}}}")

css = "\n".join(base)
css += "\n@media (min-width:640px){\n" + "\n".join(sm) + "\n}\n"
css += "@media (min-width:1024px){\n" + "\n".join(lg) + "\n}\n"
open('utils.css','w').write(css)
print("regras:", len(base)+len(sm)+len(lg))

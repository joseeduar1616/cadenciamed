"""Gera o cartao.png, a imagem que aparece quando alguém cola o link.

1200x630 é a medida que WhatsApp, Instagram, Twitter e LinkedIn recortam
sem cortar nada. É desenhada aqui, e não fotografada de uma tela, porque
captura de tela vira ilegível no tamanho de miniatura: o que se lê num
cartão desses é o nome, uma frase e pouco mais.

Usa a mesma marca e as mesmas cores do site (base.jsx), então trocar o
tema não deixa o cartão para trás.
"""
import os
from PIL import Image, ImageDraw, ImageFont

os.chdir(os.path.dirname(os.path.abspath(__file__)))

L, A = 1200, 630
FUNDO = (4, 3, 10)
CIANO = (53, 228, 255)
ROXO = (168, 85, 247)
TINTA = (245, 242, 255)
APAGADO = (150, 142, 180)

FONTES = [
    '.fontes/Inter-Bold.ttf', '../material/.fontes/Inter-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
]
FONTES_LEVES = [
    '.fontes/Inter-Regular.ttf', '../material/.fontes/Inter-Regular.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
]


def fonte(caminhos, tamanho):
    for c in caminhos:
        if os.path.exists(c):
            return ImageFont.truetype(c, tamanho)
    return ImageFont.load_default()


img = Image.new('RGB', (L, A), FUNDO)
d = ImageDraw.Draw(img)

# Brilho difuso à direita, como o do site.
#
# Desenhado pequeno e ampliado depois: círculo desenhado no tamanho final
# fica com a borda serrilhada e aparece como um disco, que é defeito. Numa
# imagem de 60 pixels a interpolação do LANCZOS faz a passagem inteira.
#
# E ele fica SÓ na direita de propósito: a marca tem um halo escuro
# assado no próprio PNG, e sobre um fundo clareado esse halo vira um
# retângulo visível atrás dela. Com o lado esquerdo no preto do fundo, o
# halo simplesmente não aparece.
PEQ = 60
brilho = Image.new('L', (PEQ, round(PEQ * A / L)), 0)
db = ImageDraw.Draw(brilho)
cx, cy, raio = PEQ * 0.78, -PEQ * 0.06, PEQ * 0.52
for i in range(40, 0, -1):
    r = raio * i / 40
    db.ellipse([cx - r, cy - r, cx + r, cy + r], fill=int(255 * (1 - i / 40) ** 1.6))
brilho = brilho.resize((L, A), Image.LANCZOS)
tinta = Image.new('RGB', (L, A), ROXO)
img = Image.composite(Image.blend(img, tinta, 0.16), img, brilho)
d = ImageDraw.Draw(img)

# A marca, se existir; senão o cartão sai só com texto, que ainda serve.
marca = 'marca.png'
if os.path.exists(marca):
    m = Image.open(marca).convert('RGBA')
    # O PNG da marca traz um halo assado em volta: pixel quase transparente
    # com cor cinza. Sobre o preto do cartão isso vira um retângulo visível
    # atrás do logo. Zerar o que está abaixo de 25% de opacidade apaga o
    # halo e não encosta no traçado, que é sólido.
    canais = list(m.split())
    canais[3] = canais[3].point(lambda v: v if v > 64 else 0)
    m = Image.merge('RGBA', canais)
    largura = 300
    m = m.resize((largura, round(m.height * largura / m.width)), Image.LANCZOS)
    img.paste(m, (86, 74), m)

f_titulo = fonte(FONTES, 82)
f_frase = fonte(FONTES_LEVES, 34)
f_pe = fonte(FONTES_LEVES, 27)

d.text((86, 222), 'A residência', font=f_titulo, fill=TINTA)
d.text((86, 316), 'pede ', font=f_titulo, fill=TINTA)
largura_pede = d.textlength('pede ', font=f_titulo)
d.text((86 + largura_pede, 316), 'cadência.', font=f_titulo, fill=CIANO)

d.text((86, 436),
       'O cronograma inteiro, a revisão que volta na hora certa\ne os seus flashcards, no mesmo lugar.',
       font=f_frase, fill=APAGADO, spacing=12)

d.text((86, 540), '90 aulas  ·  213 tópicos  ·  cadenciamed.com.br', font=f_pe, fill=(110, 103, 138))

# Fio de gradiente no rodapé, a mesma assinatura visual do site.
for x in range(L):
    t = x / L
    d.line([(x, A - 7), (x, A)], fill=(
        int(CIANO[0] + (ROXO[0] - CIANO[0]) * t),
        int(CIANO[1] + (ROXO[1] - CIANO[1]) * t),
        int(CIANO[2] + (ROXO[2] - CIANO[2]) * t)))

img.save('cartao.png', optimize=True)
print('cartao.png', img.size, round(os.path.getsize('cartao.png') / 1024), 'KB')

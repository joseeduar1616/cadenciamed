"""Gera os ícones do site a partir de logo-original.png.

Saem daqui: os PNG de 32, 180, 192 e 512, a versão maskable com folga nas
bordas para o recorte do Android, o favicon.ico multi-resolução e os dois
trechos base64 que o montar.py embute no HTML.

A logo vem com fundo transparente, então cada ícone recebe o mesmo preto do
site por baixo: sem isso o Android e o iOS pintam um fundo branco atrás.
"""
from PIL import Image, ImageFilter
import base64, io, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

FUNDO = (5, 7, 12, 255)            # o mesmo --bg2 do tema escuro
base = Image.open('logo-original.png').convert('RGBA')


def recortar(im, limiar=0):
    """Tira a moldura vazia em volta do desenho.

    Com limiar acima de zero o halo quase transparente é ignorado, senão a
    sobra de brilho conta como desenho e o recorte fica frouxo.
    """
    alfa = im.split()[3]
    if limiar:
        alfa = alfa.point(lambda v: 255 if v > limiar else 0)
    bb = alfa.getbbox()
    return im.crop(bb) if bb else im


def quadrado(im, folga=0.0, fundo=FUNDO):
    """Centraliza o desenho num quadrado, com a folga pedida nas bordas."""
    im = recortar(im)
    lado = int(max(im.size) * (1 + folga * 2))
    tela = Image.new('RGBA', (lado, lado), fundo)
    tela.alpha_composite(im, ((lado - im.size[0]) // 2, (lado - im.size[1]) // 2))
    return tela


def com_brilho(im, forca=0.55):
    """Halo roxo por trás do traço, para o ícone não sumir no preto."""
    halo = im.filter(ImageFilter.GaussianBlur(im.size[0] // 26))
    tela = Image.new('RGBA', im.size, (0, 0, 0, 0))
    tela.alpha_composite(Image.blend(Image.new('RGBA', im.size, (0, 0, 0, 0)), halo, forca))
    tela.alpha_composite(im)
    return tela


# ícone normal: desenho quase encostando na borda, com um respiro de 6%
icone = quadrado(com_brilho(recortar(base)), folga=0.06)

for tam in (32, 180, 192, 512):
    icone.resize((tam, tam), Image.LANCZOS).convert('RGB').save(
        f'icone-{tam}.png', optimize=True)
    print(f'icone-{tam}.png')

# maskable: o Android recorta num círculo, então o desenho fica na área segura
mask = quadrado(com_brilho(recortar(base)), folga=0.30)
mask.resize((512, 512), Image.LANCZOS).convert('RGB').save(
    'icone-512-maskable.png', optimize=True)
print('icone-512-maskable.png')

# favicon multi-resolução para a aba do navegador
icone.resize((48, 48), Image.LANCZOS).convert('RGB').save(
    'favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48)])
print('favicon.ico')

# a marca isolada, só a onda, sem o texto: é ela que vai no cabeçalho, porque
# o nome já aparece escrito logo abaixo. O limiar alto joga fora o halo, para
# a onda encostar nas bordas da imagem.
onda = recortar(base.crop((0, 0, base.size[0], int(base.size[1] * 0.72))), limiar=40)
larg = 440
onda = onda.resize((larg, max(1, round(onda.size[1] * larg / onda.size[0]))), Image.LANCZOS)
onda = onda.quantize(colors=128, method=Image.FASTOCTREE).convert('RGBA')
onda.save('marca.png', optimize=True)
print('marca.png', onda.size)


def b64(im, formato='PNG', **kw):
    buf = io.BytesIO()
    im.save(buf, format=formato, optimize=True, **kw)
    return base64.b64encode(buf.getvalue()).decode()


# os dois trechos que o montar.py embute no HTML, para o favicon e o ícone do
# iPhone funcionarem mesmo que os arquivos soltos não sejam publicados
marca64 = b64(onda)
with open('icones-embutidos.txt', 'w', encoding='utf-8') as f:
    f.write('FAVICON32=' + b64(icone.resize((32, 32), Image.LANCZOS).convert('RGB')) + '\n')
    f.write('APPLE180=' + b64(icone.resize((180, 180), Image.LANCZOS).convert('RGB')) + '\n')
print('icones-embutidos.txt')

# a marca do cabeçalho vive dentro do JS, então a linha do base.jsx é
# reescrita aqui: assim trocar a logo é rodar este script e recompilar
import re
alvo = 'base.jsx'
fonte = open(alvo, encoding='utf-8').read()
novo, trocas = re.subn(
    r'(?m)^const MARCA = "data:image/png;base64,[^"]*";$',
    'const MARCA = "data:image/png;base64,' + marca64 + '";',
    fonte)
if trocas != 1:
    raise SystemExit('não achei a linha do MARCA em base.jsx')
open(alvo, 'w', encoding='utf-8').write(novo)
print('base.jsx: marca embutida,', len(marca64), 'caracteres')

"""Extrai a matemática do recorte de figuras do PDF, de parte12.jsx, para um
módulo importável.

retangulosDeImagem só depende de pdfjsLib.OPS, page.getOperatorList() e
viewport.transform — nada de verdade do pdf.js —, então o teste consegue
chamá-la com objetos falsos, sem abrir um PDF de verdade nem precisar do
navegador. Em vez de manter duas cópias que divergem em silêncio, a cópia é
refeita a cada build a partir do original.
"""
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

s = open('parte12.jsx', encoding='utf-8').read()
inicio = 'const FIGURA_MIN_PX'
fim = '/* Recorta só as figuras da página'
if inicio not in s or fim not in s:
    raise SystemExit('não achei a matemática do recorte no parte12.jsx')
corpo = s[s.index(inicio):s.index(fim)].rstrip()

for nome in ('aplicarMatriz', 'combinarMatriz', 'FIGURA_MIN_PX'):
    alvo = f'const {nome}'
    if alvo not in corpo:
        raise SystemExit(f'não achei {nome} no trecho extraído')
    corpo = corpo.replace(alvo, f'export const {nome}', 1)

corpo = corpo.replace('async function retangulosDeImagem', 'export async function retangulosDeImagem')
if 'export async function retangulosDeImagem' not in corpo:
    raise SystemExit('não achei retangulosDeImagem no trecho extraído')

open('_recorte.mjs', 'w', encoding='utf-8').write(
    '/* Cópia automática, refeita pelo extrair_recorte.py a cada build.\n'
    '   Não edite aqui: edite o parte12.jsx. */\n' + corpo + '\n')
print('_recorte.mjs: cópia da matemática do recorte de PDF refeita')

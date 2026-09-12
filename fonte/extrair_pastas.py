"""Extrai o mapa de área → pasta grande (parte12.jsx) para um módulo
importável.

PASTAS_DE_AREA, chavePasta e pastaDaArea são puras — nada de navegador nem
de React —, então o teste chama direto. Em vez de manter duas cópias que
divergem em silêncio, a cópia é refeita a cada build a partir do original.
"""
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

s = open('parte12.jsx', encoding='utf-8').read()
inicio = 'const PASTAS_DE_AREA = {'
fim = '/* ── ajustes de cada baralho'
if inicio not in s or fim not in s:
    raise SystemExit('não achei o mapa de pastas de área no parte12.jsx')
corpo = s[s.index(inicio):s.index(fim)].rstrip()

for alvo in ('const PASTAS_DE_AREA', 'const chavePasta', 'function pastaDaArea'):
    if alvo not in corpo:
        raise SystemExit(f'não achei {alvo} no trecho extraído')
    corpo = corpo.replace(alvo, 'export ' + alvo, 1)

open('_pastas.mjs', 'w', encoding='utf-8').write(
    '/* Cópia automática, refeita pelo extrair_pastas.py a cada build.\n'
    '   Não edite aqui: edite o parte12.jsx. */\n' + corpo + '\n')
print('_pastas.mjs: cópia do mapa de pastas de área refeita')

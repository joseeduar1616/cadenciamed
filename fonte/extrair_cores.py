"""Extrai a matemática de cor do tema próprio (base.jsx) para um módulo
importável.

hexParaHsl, hslParaHex, corLegivel e corCombinando são puras — sem
depender de nada do navegador nem do React —, então o teste consegue
chamá-las direto. Em vez de manter duas cópias que divergem em silêncio, a
cópia é refeita a cada build a partir do original.
"""
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

s = open('base.jsx', encoding='utf-8').read()
inicio = 'function hexParaHsl'
fim = 'const T = {'
if inicio not in s or fim not in s:
    raise SystemExit('não achei a matemática de cor no base.jsx')
corpo = s[s.index(inicio):s.index(fim)].rstrip()

for nome in ('hexParaHsl', 'hslParaHex', 'corLegivel', 'corCombinando'):
    alvo = f'function {nome}'
    if alvo not in corpo:
        raise SystemExit(f'não achei {nome} no trecho extraído')
    corpo = corpo.replace(alvo, f'export function {nome}', 1)

open('_cores.mjs', 'w', encoding='utf-8').write(
    '/* Cópia automática, refeita pelo extrair_cores.py a cada build.\n'
    '   Não edite aqui: edite o base.jsx. */\n' + corpo + '\n')
print('_cores.mjs: cópia da matemática de cor refeita')

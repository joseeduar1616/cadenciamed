"""Extrai a divisão da prova em lotes (parte23.jsx) para um módulo testável.

dividirEmLotes e juntarQuestoes são puras, e são o que decide se a prova
inteira chega ou se metade das questões some no caminho. Um corte no meio
de uma questão vira duas questões inventadas, e ninguém percebe olhando a
tela. A cópia é refeita a cada build a partir do original.
"""
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

s = open('parte23.jsx', encoding='utf-8').read()
inicio = '/* ── a prova em lotes'
fim = '/* ── a aba ─'
if inicio not in s or fim not in s:
    raise SystemExit('não achei o trecho dos lotes no parte23.jsx')
corpo = s[s.index(inicio):s.index(fim)].rstrip()

for alvo in ('function dividirEmLotes', 'function juntarQuestoes',
             'const LOTE_ALVO', 'const MAX_LOTES', 'const POR_LOTE',
             'function contarQuestoesNoTexto'):
    if alvo not in corpo:
        raise SystemExit(f'não achei {alvo} no trecho extraído')
    corpo = corpo.replace(alvo, 'export ' + alvo, 1)

open('_lotes.mjs', 'w', encoding='utf-8').write(
    '/* Cópia automática, refeita pelo extrair_lotes.py a cada build.\n'
    '   Não edite aqui: edite o parte23.jsx. */\n' + corpo + '\n')
print('_lotes.mjs: cópia da divisão em lotes refeita')

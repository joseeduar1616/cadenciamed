"""Extrai o preparo da fala da mentoria (parte26.jsx) para um módulo importável.

O que a voz diz passa por funções puras: tirar o markdown, falar horários,
datas, dinheiro e abreviações do jeito que se fala, cortar em frases, e
escolher a voz do aparelho (feminina, pt-BR, natural). Nada disso precisa
de navegador, e um erro aqui vira uma ligação lendo "erre cifrão" ou
escolhendo uma voz masculina robótica. O testar-voz.mjs confere caso a
caso, e a cópia é refeita a cada build a partir do original.
"""
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

s = open('parte26.jsx', encoding='utf-8').read()
inicio = '/* ── o que a voz diz'
fim = '/* As vozes chegam depois da página'
if inicio not in s or fim not in s:
    raise SystemExit('não achei o preparo da fala no parte26.jsx')
corpo = s[s.index(inicio):s.index(fim)].rstrip()

for nome in ('textoParaFalar', 'frasesParaFalar', 'escolherVoz'):
    if f'function {nome}' not in corpo:
        raise SystemExit(f'não achei {nome} no trecho extraído')
    corpo = corpo.replace(f'function {nome}', f'export function {nome}', 1)

open('_voz.mjs', 'w', encoding='utf-8').write(
    '/* Cópia automática, refeita pelo extrair_voz.py a cada build.\n'
    '   Não edite aqui: edite o parte26.jsx. */\n' + corpo + '\n')
print('_voz.mjs: cópia do preparo da fala refeita')

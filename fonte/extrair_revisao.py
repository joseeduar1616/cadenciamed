"""Extrai a regra da revisão adaptativa (base.jsx) para um módulo testável.

fatorDoTopico, diasDoTopico e depoisDaRevisao são puras, e são elas que
decidem quando cada conteúdo volta para a frente de quem estuda. Errar aqui
não quebra a tela: só faz a pessoa revisar na hora errada durante meses,
sem nada aparecendo. Por isso a regra é testada sozinha, e a cópia é refeita
a cada build a partir do original.
"""
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

s = open('base.jsx', encoding='utf-8').read()
inicio = '/* ── a escada que se adapta a cada tópico'
fim = '/* A escada em uso, já com rótulo em cada degrau. */'
if inicio not in s or fim not in s:
    raise SystemExit('não achei a regra da revisão adaptativa no base.jsx')
corpo = s[s.index(inicio):s.index(fim)].rstrip()

for alvo in ('function fatorDoTopico', 'function diasDoTopico', 'function depoisDaRevisao',
             'const FATOR_MINIMO', 'const FATOR_MAXIMO'):
    if alvo not in corpo:
        raise SystemExit(f'não achei {alvo} no trecho extraído')
    corpo = corpo.replace(alvo, 'export ' + alvo, 1)

open('_revisao.mjs', 'w', encoding='utf-8').write(
    '/* Cópia automática, refeita pelo extrair_revisao.py a cada build.\n'
    '   Não edite aqui: edite o base.jsx. */\n' + corpo + '\n')
print('_revisao.mjs: cópia da regra de revisão refeita')

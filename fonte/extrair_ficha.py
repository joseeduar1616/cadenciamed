"""Extrai a ficha do tópico (base.jsx) para um módulo testável.

somarEstudo, aproveitamento, lerRegistro e fichaDoTopico são puras, e são
elas que dizem à pessoa como ela está em cada conteúdo. Um erro aqui não
quebra tela: mostra 80% de acerto onde havia 40, a pessoa confia, para de
revisar o que estava fraco e descobre na prova. A cópia é refeita a cada
build a partir do original.
"""
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

s = open('base.jsx', encoding='utf-8').read()
inicio = '/* ── a ficha de cada tópico'
fim = '/* ── a escada que se adapta a cada tópico'
if inicio not in s or fim not in s:
    raise SystemExit('não achei a ficha do tópico no base.jsx')
corpo = s[s.index(inicio):s.index(fim)].rstrip()

for alvo in ('function somarEstudo', 'function aproveitamento', 'function lerRegistro',
             'function fichaDoTopico', 'function dificuldadeSugerida',
             'function fazQuantoTempo', 'function diasDesde', 'function perfDeAproveitamento',
             'function fraseDoDia',
             'const MAX_MIN_REGISTRO', 'const MAX_QUESTOES_REGISTRO'):
    if alvo not in corpo:
        raise SystemExit(f'não achei {alvo} no trecho extraído')
    corpo = corpo.replace(alvo, 'export ' + alvo, 1)

open('_ficha.mjs', 'w', encoding='utf-8').write(
    '/* Cópia automática, refeita pelo extrair_ficha.py a cada build.\n'
    '   Não edite aqui: edite o base.jsx. */\n' + corpo + '\n')
print('_ficha.mjs: cópia da ficha do tópico refeita')

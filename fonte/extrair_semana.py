"""Extrai o gerador de semana (base.jsx) para um módulo testável.

montarSemana, notaDaEspecialidade e repartirPelosDias são puras, e são
elas que decidem no que a pessoa vai gastar as horas dela. Um erro aqui não
quebra tela: entrega uma semana que parece boa e é mal repartida, e ninguém
percebe olhando. A cópia é refeita a cada build a partir do original.
"""
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

s = open('base.jsx', encoding='utf-8').read()
inicio = '/* ── a semana montada a partir do tempo que existe'
fim = '/* A escada em uso, já com rótulo em cada degrau. */'
if inicio not in s or fim not in s:
    raise SystemExit('não achei o gerador de semana no base.jsx')
corpo = s[s.index(inicio):s.index(fim)].rstrip()

for alvo in ('function montarSemana', 'function notaDaEspecialidade',
             'function repartirPelosDias', 'const BLOCO_MINIMO', 'const BLOCO_MAXIMO'):
    if alvo not in corpo:
        raise SystemExit(f'não achei {alvo} no trecho extraído')
    corpo = corpo.replace(alvo, 'export ' + alvo, 1)

open('_semana.mjs', 'w', encoding='utf-8').write(
    '/* Cópia automática, refeita pelo extrair_semana.py a cada build.\n'
    '   Não edite aqui: edite o base.jsx. */\n' + corpo + '\n')
print('_semana.mjs: cópia do gerador de semana refeita')

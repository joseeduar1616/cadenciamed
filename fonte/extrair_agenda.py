"""Extrai a regra do envio automático para o Google Agenda (parte3.jsx)
para um módulo importável.

corpoDoEvento, marcaDoEvento, marcasDaLista e diferencaDaAgenda são puras —
nada de navegador nem de React —, e são justamente a parte que decide o que
sobe e o que é apagado da agenda de alguém. Em vez de manter duas cópias que
divergem em silêncio, a cópia é refeita a cada build a partir do original.
"""
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

s = open('parte3.jsx', encoding='utf-8').read()
inicio = '/* O evento como o Google quer receber'
fim = '/* ── a ligação que não vence'
if inicio not in s or fim not in s:
    raise SystemExit('não achei o trecho do envio automático no parte3.jsx')
corpo = s[s.index(inicio):s.index(fim)].rstrip()

for alvo in ('function corpoDoEvento', 'function marcaDoEvento',
             'function marcasDaLista', 'function diferencaDaAgenda',
             'const AUTO_PADRAO', 'const ESPERA_AUTO', 'const LIMITE_AUTO'):
    if alvo not in corpo:
        raise SystemExit(f'não achei {alvo} no trecho extraído')
    corpo = corpo.replace(alvo, 'export ' + alvo, 1)

open('_agenda.mjs', 'w', encoding='utf-8').write(
    '/* Cópia automática, refeita pelo extrair_agenda.py a cada build.\n'
    '   Não edite aqui: edite o parte3.jsx. */\n' + corpo + '\n')
print('_agenda.mjs: cópia da regra do envio automático refeita')

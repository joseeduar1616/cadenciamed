"""Extrai a regra de sincronização (parte3.jsx) para um módulo importável.

decidirNuvem é pura — nada de navegador, React ou Firebase — e é ela que
decide se os dados de alguém sobrevivem ao encontro entre um aparelho e a
conta. Um erro aqui apaga o estudo de meses sem mostrar erro nenhum na
tela, então ela é testada sozinha, e a cópia é refeita a cada build a
partir do original, para não existirem duas versões divergindo em silêncio.
"""
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

s = open('parte3.jsx', encoding='utf-8').read()
inicio = '/* ── quem vence no encontro entre o aparelho e a conta'
fim = 'function useNuvem('
if inicio not in s or fim not in s:
    raise SystemExit('não achei a regra de sincronização no parte3.jsx')
corpo = s[s.index(inicio):s.index(fim)].rstrip()

if 'function decidirNuvem' not in corpo:
    raise SystemExit('não achei decidirNuvem no trecho extraído')
corpo = corpo.replace('function decidirNuvem', 'export function decidirNuvem', 1)

open('_nuvem.mjs', 'w', encoding='utf-8').write(
    '/* Cópia automática, refeita pelo extrair_nuvem.py a cada build.\n'
    '   Não edite aqui: edite o parte3.jsx. */\n' + corpo + '\n')
print('_nuvem.mjs: cópia da regra de sincronização refeita')

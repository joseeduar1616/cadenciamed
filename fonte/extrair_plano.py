"""Extrai o motor do Meu plano (parte41.jsx) para um módulo importável.

O reajuste do plano é conta pura, sem navegador nem React, e é ele que
decide para que dia vai o que ficou para trás. A cópia é refeita a cada
build a partir do original, para o teste conferir o mesmo código que roda.
"""
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

s = open('parte41.jsx', encoding='utf-8').read()
inicio = '/* ── o plano, sem tela'
fim = '/* ── a tela'
if inicio not in s or fim not in s:
    raise SystemExit('não achei o motor do plano no parte41.jsx')
corpo = s[s.index(inicio):s.index(fim)].rstrip()
for nome in ['limparPlanoArquivo', 'planoDosItensLidos', 'reajustarPlano', 'acharItemDoPlano',
             'atualizarItemPlano', 'resumoDoPlanoParaIA', 'planoDetalhadoParaIA', 'minutosDoItemPlano', 'marcarPeloPainel', 'ritmoDoPlano']:
    if f'function {nome}(' not in corpo:
        raise SystemExit(f'não achei {nome} no motor do plano')
    corpo = corpo.replace(f'function {nome}(', f'export function {nome}(', 1)
open('_plano.mjs', 'w', encoding='utf-8').write(
    '/* Cópia automática, refeita pelo extrair_plano.py a cada build.\n'
    '   Não edite aqui: edite o parte41.jsx. */\n' + corpo + '\n')
print('_plano.mjs: cópia do motor do Meu plano refeita')

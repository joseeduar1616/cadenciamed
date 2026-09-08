"""Extrai lerRespostaDoServidor do parte2.jsx para um módulo importável.

A função vive dentro do bundle e não é exportada, mas o teste precisa
chamá-la. Em vez de manter duas cópias que divergem em silêncio, a cópia é
refeita a cada build a partir do original.
"""
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

s = open('parte2.jsx', encoding='utf-8').read()
inicio = '/* Lê a resposta de uma rota /api do servidor.'
fim = 'function subjectState(s, marks) {'
if inicio not in s or fim not in s:
    raise SystemExit('não achei lerRespostaDoServidor no parte2.jsx')
corpo = s[s.index(inicio):s.index(fim)].rstrip()

open('_leitor.mjs', 'w', encoding='utf-8').write(
    '/* Cópia automática, refeita pelo extrair_leitor.py a cada build.\n'
    '   Não edite aqui: edite lerRespostaDoServidor no parte2.jsx. */\n'
    + corpo.replace('async function lerRespostaDoServidor',
                    'export async function lerRespostaDoServidor')
    + '\n')
print('_leitor.mjs: cópia de lerRespostaDoServidor refeita')

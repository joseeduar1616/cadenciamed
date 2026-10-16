"""Extrai a lógica pura do plano do mês (parte25.jsx) para um módulo testável.

É ela que lê a planilha do plano, soma as calorias do dia e decide se a
semana foi boa: um erro aqui não quebra tela nenhuma, só faz o app mostrar
uma meta errada com toda a confiança. A cópia é refeita a cada build a
partir do original, para as duas nunca divergirem em silêncio.
"""
import os
import re
os.chdir(os.path.dirname(os.path.abspath(__file__)))

s = open('parte25.jsx', encoding='utf-8').read()
inicio = '/* ── a lógica pura do plano do mês'
fim = '/* ── telas do plano do mês'
if inicio not in s or fim not in s:
    raise SystemExit('não achei o trecho puro no parte25.jsx')
corpo = s[s.index(inicio):s.index(fim)].rstrip()

nomes = re.findall(r'^(?:const|function) ([A-Za-z_][A-Za-z0-9_]*)', corpo, re.M)
for alvo in ('lerXlsx', 'planoDaPlanilha', 'aplicarPlanilha', 'totaisDoDia', 'resumoSemanal',
             'projecaoDePeso', 'tabelaDeCargas', 'semanasDoPlano', 'limparAnalise'):
    if alvo not in nomes:
        raise SystemExit(f'não achei {alvo} no trecho extraído')
corpo = re.sub(r'^(const|function) ', r'export \1 ', corpo, flags=re.M)

open('_plano_mes.mjs', 'w', encoding='utf-8').write(
    '/* Cópia automática, refeita pelo extrair_plano_mes.py a cada build.\n'
    '   Não edite aqui: edite o parte25.jsx. */\n' + corpo + '\n')
print('_plano_mes.mjs: cópia da lógica do plano do mês refeita')

"""Extrai a lógica do currículo próprio (base.jsx e parte9.jsx) para um
módulo importável.

montarCurriculo, materiaParaAula e aplicarNoCronogramaProprio só dependem de
dados simples (arrays e objetos) — nada de React, Firestore ou navegador —,
então o teste consegue chamá-las direto, sem montar a interface. Em vez de
manter duas cópias que divergem em silêncio, a cópia é refeita a cada build
a partir do original.
"""
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

base = open('base.jsx', encoding='utf-8').read()
inicio_base = 'const CURRICULUM = CURSO.map'
fim_base = 'const AtivoContext'
if inicio_base not in base or fim_base not in base:
    raise SystemExit('não achei o currículo padrão / montarCurriculo no base.jsx')
bloco_curriculo = base[base.index(inicio_base):base.index(fim_base)].rstrip()
if 'function montarCurriculo' not in bloco_curriculo:
    raise SystemExit('não achei montarCurriculo no trecho extraído do base.jsx')
bloco_curriculo = bloco_curriculo.replace('function montarCurriculo', 'export function montarCurriculo', 1)

marca_uid = 'const uid = () =>'
if marca_uid not in base:
    raise SystemExit('não achei uid() no base.jsx')
linha_uid = next(l for l in base.splitlines() if l.strip().startswith(marca_uid))

parte9 = open('parte9.jsx', encoding='utf-8').read()
inicio_p9 = 'function materiaParaAula'
fim_p9 = 'function Cronograma'
if inicio_p9 not in parte9 or fim_p9 not in parte9:
    raise SystemExit('não achei materiaParaAula / aplicarNoCronogramaProprio no parte9.jsx')
bloco_aplicar = parte9[parte9.index(inicio_p9):parte9.index(fim_p9)].rstrip()
for nome in ('materiaParaAula', 'aplicarNoCronogramaProprio'):
    alvo = f'function {nome}'
    if alvo not in bloco_aplicar:
        raise SystemExit(f'não achei {nome} no trecho extraído')
    bloco_aplicar = bloco_aplicar.replace(alvo, f'export function {nome}', 1)

saida = (
    '/* Cópia automática, refeita pelo extrair_curriculo.py a cada build.\n'
    '   Não edite aqui: edite base.jsx e parte9.jsx. */\n'
    'import { CURSO } from "./curriculo.js";\n\n'
    + linha_uid + '\n\n'
    + bloco_curriculo + '\n\n'
    + bloco_aplicar + '\n'
)
open('_curriculo.mjs', 'w', encoding='utf-8').write(saida)
print('_curriculo.mjs: cópia da lógica do currículo próprio refeita')

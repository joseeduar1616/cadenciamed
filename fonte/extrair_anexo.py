"""Extrai textoDeAnexo e juntarAnexos do parte9.jsx para um módulo
importável.

Existe por causa de um defeito silencioso: os leitores de PDF e de Word
devolvem { texto, imagens }, e o textoDeAnexo devolvia { texto: aquele
objeto inteiro }. O anexo chegava na IA como "[object Object]" — o arquivo
subia, não dava erro nenhum, e a resposta saía sobre coisa nenhuma. Nenhum
teste pegava porque nada chamava esta função fora do navegador.

Os três leitores de verdade (PDF, Word, foto) ficam em outras partes do
bundle e dependem de rede. Aqui eles viram ganchos em globalThis, que o
teste troca por leitores de mentira.
"""
import os
import re
os.chdir(os.path.dirname(os.path.abspath(__file__)))

s = open('parte9.jsx', encoding='utf-8').read()
inicio = 'const TETO_ANEXO ='
fim = 'function Assistente('
if inicio not in s or fim not in s:
    raise SystemExit('não achei textoDeAnexo/juntarAnexos no parte9.jsx')
corpo = s[s.index(inicio):s.index(fim)].rstrip()

for nome in ('textoDeAnexo',):
    if f'async function {nome}' not in corpo:
        raise SystemExit(f'não achei {nome} no trecho extraído')
    corpo = corpo.replace(f'async function {nome}', f'export async function {nome}')
if 'function juntarAnexos' not in corpo:
    raise SystemExit('não achei juntarAnexos no trecho extraído')
corpo = corpo.replace('function juntarAnexos', 'export function juntarAnexos')
corpo = corpo.replace('const TETO_ANEXO =', 'export const TETO_ANEXO =')

# Os leitores vivem em outras partes do bundle. Fora do navegador eles
# passam a ser ganchos que o teste preenche.
for leitor in ('lerPdfParaTexto', 'lerDocxParaTexto', 'lerFotosComIA'):
    corpo = re.sub(rf'\b{leitor}\(', f'globalThis.{leitor}(', corpo)

open('_anexo.mjs', 'w', encoding='utf-8').write(
    '/* Cópia automática, refeita pelo extrair_anexo.py a cada build.\n'
    '   Não edite aqui: edite o parte9.jsx. */\n' + corpo + '\n')
print('_anexo.mjs: cópia de textoDeAnexo e juntarAnexos refeita')

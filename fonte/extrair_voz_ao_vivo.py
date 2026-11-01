"""Extrai o miolo puro da assistente por voz (parte39.jsx) para um módulo importável.

A conversão de áudio (PCM 16 bits, reamostragem, base64) e a leitura das
mensagens do Gemini Live não precisam de navegador. Um erro ali é áudio
picotado ou uma interrupção ignorada, sem erro na tela. O
testar-voz-ao-vivo.mjs confere caso a caso; a cópia é refeita a cada build.
"""
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

s = open('parte39.jsx', encoding='utf-8').read()
inicio = 'const ROTA_VOZ = "/api/voz";'
fim = '/* ── a sessão'
if inicio not in s or fim not in s:
    raise SystemExit('não achei o miolo da assistente por voz no parte39.jsx')
corpo = s[s.index(inicio):s.index(fim)].rstrip()

for nome in ('base64ParaBytes', 'bytesParaBase64', 'pcm16ParaFloat32', 'float32ParaPcm16', 'reamostrar', 'lerMensagemAoVivo'):
    if f'function {nome}' not in corpo:
        raise SystemExit(f'não achei {nome} no trecho extraído')
    corpo = corpo.replace(f'function {nome}', f'export function {nome}', 1)
for nome in ('mensagemDeTexto', 'mensagemDeAudio', 'TAXA_ENTRADA', 'TAXA_SAIDA'):
    corpo = corpo.replace(f'const {nome} =', f'export const {nome} =', 1)

open('_voz_ao_vivo.mjs', 'w', encoding='utf-8').write(
    '/* Cópia automática, refeita pelo extrair_voz_ao_vivo.py a cada build.\n'
    '   Não edite aqui: edite o parte39.jsx. */\n' + corpo + '\n')
print('_voz_ao_vivo.mjs: cópia do miolo da assistente por voz refeita')

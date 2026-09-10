/* Testa em qual pasta grande um baralho gerado por IA vai cair.
 *
 * A IA devolve a sigla da área (CL, CI, GO, PE, PR) e o app precisa
 * transformar isso na pasta certa — reaproveitando a que a pessoa já tem,
 * em vez de criar "PREVENTIVA" ao lado de "Medicina Preventiva".
 *
 * Roda contra _pastas.mjs, a cópia automática de PASTAS_DE_AREA/
 * chavePasta/pastaDaArea (do parte12.jsx), refeita pelo extrair_pastas.py
 * a cada build.
 *
 *   node testar-pastas.mjs
 */
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const { PASTAS_DE_AREA, chavePasta, pastaDaArea } = await import('./_pastas.mjs');

/* ── as cinco áreas do currículo, e só elas ──────────────────────────── */
{
  const siglas = Object.keys(PASTAS_DE_AREA).sort().join(',');
  if (siglas === 'CI,CL,GO,PE,PR') ok('há uma pasta grande para cada uma das cinco áreas');
  else falha('as siglas de área não são as cinco do app: ' + siglas);
}

/* ── conta nova: cada área cria a sua pasta, com nome próprio ────────── */
{
  const esperado = {
    CL: 'CLÍNICA MÉDICA', CI: 'CIRURGIA', GO: 'GO',
    PE: 'PEDIATRIA', PR: 'PREVENTIVA',
  };
  for (const [area, nome] of Object.entries(esperado)) {
    const achada = pastaDaArea([], area);
    if (achada === nome) ok(`${area} sem pasta nenhuma cria "${nome}"`);
    else falha(`${area} deveria criar "${nome}", mas devolveu "${achada}"`);
  }
  const nomes = Object.values(esperado);
  if (new Set(nomes).size === nomes.length) ok('as cinco pastas novas têm nomes diferentes entre si');
  else falha('duas áreas criariam a mesma pasta: ' + nomes.join(', '));
}

/* ── área desconhecida não inventa pasta ─────────────────────────────── */
for (const ruim of ['', null, undefined, 'XX', 'clinica', 'CL2', 0]) {
  const achada = pastaDaArea([], ruim);
  if (ruim === 'clinica') continue;   // conferida logo abaixo, em caixa baixa
  if (achada === '') ok(`área inválida (${JSON.stringify(ruim)}) devolve vazio, sem criar pasta`);
  else falha(`área inválida (${JSON.stringify(ruim)}) virou a pasta "${achada}"`);
}
if (pastaDaArea([], 'cl') === 'CLÍNICA MÉDICA') ok('a sigla em caixa baixa vale igual');
else falha('a sigla "cl" não foi reconhecida');

/* ── pasta que já existe é reaproveitada, mesmo escrita diferente ───── */
{
  const casos = [
    [['CLINICA MÉDICA'], 'CL', 'CLINICA MÉDICA', 'sem o acento em CLÍNICA'],
    [['clínica médica'], 'CL', 'clínica médica', 'em caixa baixa'],
    [['Medicina Preventiva'], 'PR', 'Medicina Preventiva', 'com outro nome da lista'],
    [['GO E PREVENTIVA'], 'PR', 'GO E PREVENTIVA', 'na pasta antiga, que juntava GO e Preventiva'],
    [['GO E PREVENTIVA'], 'GO', 'GO E PREVENTIVA', 'na pasta antiga, do lado de GO'],
    [['Cirurgia'], 'CI', 'Cirurgia', 'com só a inicial maiúscula'],
    [['PEDIATRIA E NEONATOLOGIA'], 'PE', 'PEDIATRIA E NEONATOLOGIA', 'com o nome comprido'],
    [['GO', 'GO E PREVENTIVA'], 'GO', 'GO', 'preferindo o nome oficial quando os dois existem'],
  ];
  for (const [pastas, area, esperado, porque] of casos) {
    const achada = pastaDaArea(pastas, area);
    if (achada === esperado) ok(`${area} cai em "${esperado}" (${porque})`);
    else falha(`${area} com ${JSON.stringify(pastas)} deveria cair em "${esperado}", mas devolveu "${achada}"`);
  }
}

/* ── pasta parecida, mas de outro assunto, não é confundida ──────────── */
{
  const achada = pastaDaArea(['Clínica do Intestino', 'Cirurgia Vascular'], 'CI');
  if (achada === 'CIRURGIA') ok('uma pasta de nome parecido não rouba a área: cria a pasta grande mesmo assim');
  else falha(`"Cirurgia Vascular" foi confundida com a pasta grande: devolveu "${achada}"`);
}

/* ── a chave ignora acento, caixa e pontuação, e nada mais ───────────── */
{
  const iguais = [['GO E PREVENTIVA', 'go e preventiva'], ['CLÍNICA MÉDICA', 'Clinica Medica'],
                  ['SAÚDE PÚBLICA', 'saude publica'], ['GO', ' go ']];
  for (const [a, b] of iguais) {
    if (chavePasta(a) === chavePasta(b)) ok(`"${a}" e "${b}" contam como a mesma pasta`);
    else falha(`"${a}" e "${b}" deveriam ser a mesma pasta`);
  }
  if (chavePasta('CIRURGIA') !== chavePasta('CIRURGIA GERAL')) ok('nomes de verdade diferentes continuam diferentes');
  else falha('"CIRURGIA" e "CIRURGIA GERAL" viraram a mesma chave');
  if (chavePasta(null) === '' && chavePasta(undefined) === '') ok('pasta sem nome não quebra a comparação');
  else falha('chavePasta(null) não devolveu vazio');
}

/* ── lista de pastas ausente não quebra ──────────────────────────────── */
if (pastaDaArea(null, 'PE') === 'PEDIATRIA' && pastaDaArea(undefined, 'PE') === 'PEDIATRIA') {
  ok('sem lista de pastas ainda dá para escolher a pasta da área');
} else falha('pastaDaArea quebrou com a lista de pastas ausente');

for (const p of passos) console.log(p);
console.log(erros.length ? `\n${erros.length} FALHA(S)` : `\n${passos.length} conferências, tudo certo`);
process.exit(erros.length ? 1 : 0);

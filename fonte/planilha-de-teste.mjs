/* A planilha de mentira dos testes do plano do mês.
 *
 * O mesmo formato da planilha que o dono usa (Início, Treino, Alimentação,
 * Controle Diário), com números e nome inventados: nada de dado real de
 * ninguém no repositório. Quem usa: testar-plano-mes.mjs (as contas) e
 * testar-plano-mes-tela.mjs (a tela, no navegador).
 */
import { zipSync, strToU8 } from 'fflate';

/* ── montar um .xlsx de mentira ──────────────────────────────────────── */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function xlsx(folhas, { inline = false } = {}) {
  const compart = [];
  const idx = (s) => { let i = compart.indexOf(s); if (i < 0) { compart.push(s); i = compart.length - 1; } return i; };
  const arquivos = {};
  const nomes = Object.keys(folhas);
  nomes.forEach((nome, k) => {
    const linhas = folhas[nome].map((cels, i) => {
      const n = i + 1;
      const xs = cels.map((v, j) => {
        if (v === null || v === undefined) return '';
        const r = String.fromCharCode(65 + j) + n;
        if (typeof v === 'number') return `<c r="${r}"><v>${v}</v></c>`;
        if (typeof v === 'boolean') return `<c r="${r}" t="b"><v>${v ? 1 : 0}</v></c>`;
        if (typeof v === 'object' && v.f) return `<c r="${r}"><f>${esc(v.f)}</f></c>`;
        if (inline) return `<c r="${r}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
        return `<c r="${r}" t="s"><v>${idx(v)}</v></c>`;
      }).join('');
      return `<row r="${n}">${xs}</row>`;
    }).join('');
    arquivos[`xl/worksheets/sheet${k + 1}.xml`] = strToU8(`<?xml version="1.0"?><worksheet><sheetData>${linhas}</sheetData></worksheet>`);
  });
  arquivos['xl/workbook.xml'] = strToU8(`<?xml version="1.0"?><workbook xmlns:r="x"><sheets>${nomes.map((n, k) => `<sheet name="${esc(n)}" sheetId="${k + 1}" r:id="rId${k + 1}"/>`).join('')}</sheets></workbook>`);
  arquivos['xl/_rels/workbook.xml.rels'] = strToU8(`<?xml version="1.0"?><Relationships>${nomes.map((_, k) => `<Relationship Id="rId${k + 1}" Type="w" Target="worksheets/sheet${k + 1}.xml"/>`).join('')}</Relationships>`);
  arquivos['xl/sharedStrings.xml'] = strToU8(`<?xml version="1.0"?><sst>${compart.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>`);
  return zipSync(arquivos);
}

const _ = null;
/* 45962 = 01/11/2025 no calendário do Excel */
export const DIA1 = 45962;
export const FOLHAS = {
  'Início': [
    ['🔥 Plano Novembro · Modo firme'],
    ['Fulano de Tal · 01/11 a 30/11/2025'],
    ['Seus dados iniciais', _, _, _, 'Metas diárias'],
    ['Altura (m)', _, 1.80, _, 'Calorias', '1.900 a 2.000 kcal'],
    ['Peso inicial (kg)', _, 90, _, 'Proteína', '150 a 160 g'],
    ['Cintura inicial (cm)', _, 95, _, 'Passos', '10.000 a 12.000'],
    ['IMC', _, { f: 'C5/C4^2' }, _, 'Sono', '8 h ou mais'],
    ['Relação cintura/altura', _, { f: 'C6/(C4*100)' }, _, 'Água', '2 a 3 litros'],
    ['Meta do mês'],
    ['Perda de peso alvo (kg)', _, 4, _, 'Último peso', { f: 'X' }],
    ['Redução de cintura alvo (cm)', _, 5],
    ['Modo firme: 4 kg e 5 cm no mês, sem pressa & sem rebote.'],
    ['Regras de ouro do mês'],
    ['• Proteína em todas as refeições.'],
    ['• Nada de ficar abaixo de 1.700 kcal.'],
  ],
  'Treino': [
    ['🏋️ Treino · Novembro 2025'],
    ['Dia', 'Atividade', 'O que fazer'],
    ['Segunda', 'Treino A', 'Superior + cardio'],
    ['Terça', 'Treino B', 'Inferior'],
    ['Quarta', 'Natação', '40 min'],
    ['Quinta', 'Treino A', 'Superior'],
    ['Sexta', 'Treino B', 'Inferior'],
    ['Sábado', 'Futebol', 'com amigos'],
    ['Domingo', 'Descanso', 'caminhada'],
    ['TREINO A · Empurrar'],
    ['Exercício', 'Séries', 'Repetições', 'Descanso', 'Dica'],
    ['Supino inclinado', 4, '8 a 10', '2 min', 'Escápula presa'],
    ['Tríceps na polia (corda)', 3, '12', '60 s', ''],
    ['TREINO B · Pernas'],
    ['Exercício', 'Séries', 'Repetições', 'Descanso', 'Dica'],
    ['Agachamento livre', 4, '6 a 8', '1min30', 'Coxa paralela'],
    ['Stiff', 3, '10', '90 s', ''],
    ['Regras que fazem o resultado'],
    ['• Aqueça antes.'],
    ['• Suba a carga quando fechar as repetições.'],
  ],
  'Alimentação': [
    ['🍽️ Alimentação'],
    ['Valores aproximados. Pese os alimentos na primeira semana para calibrar o olho, por favor.'],
    ['Refeição', 'Horário', 'Alimento', 'Quantidade', 'kcal', 'Proteína (g)'],
    ['Café da manhã', '07h', 'Ovos', '2 unidades', 140, 12],
    [_, _, 'Pão', '1 fatia', 70, 3.5],
    ['Subtotal café da manhã', _, _, _, { f: 'SUM(E4:E5)' }, { f: 'SUM(F4:F5)' }],
    ['Almoço', '12h30', 'Frango', '150 g', 240, 45],
    [_, _, 'Arroz', '100 g', 130, 2.5],
    ['Subtotal almoço', _, _, _, { f: 'SUM(E7:E8)' }, { f: 'SUM(F7:F8)' }],
    ['TOTAL DO DIA', _, _, _, { f: 'E6+E9' }, { f: 'F6+F9' }],
    [_, _, 'Meta de calorias (mín. / máx.)', 1900, 2000],
    [_, _, 'Status das calorias', { f: 'IF(1,"a","b")' }],
    ['⚡ Semana 1: troque metade do arroz por legumes, a balança anda mais rápido no começo.'],
    ['🔁 Substituições equivalentes'],
    ['Proteínas', 'no lugar de 150 g de frango', '• 130 g de patinho'],
    [_, _, '• 2 latas de atum'],
    ['Carboidratos', 'no lugar de 100 g de arroz', '• 1 pão francês'],
    ['🏥 Na rua'],
    ['• Peça grelhado.'],
    ['• Salada primeiro.'],
  ],
  'Controle Diário': [
    ['✅ Controle'],
    ['Data', 'Dia', 'Atividade do dia', 'Treino feito?', 'Peso (kg)', 'Cintura (cm)', 'Passos', 'Proteína ≥ 150 g?', 'Sono (h)', 'Sem álcool e refri?', 'Observações'],
    [DIA1, 'Sáb', { f: 'X' }, 'Sim', 89.6, _, 11200, 'Sim', 7.5, 'Sim', 'bom dia'],
    [DIA1 + 1, 'Dom', { f: 'X' }, _, _, _, _, _, _, _, _],
    [DIA1 + 2, 'Seg', { f: 'X' }, 'Não', 89.1, 94, _, 'Não', _, 'Sim', _],
    ['Semana 1', DIA1, DIA1 + 1],
  ],
};

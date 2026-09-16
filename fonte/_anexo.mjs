/* Cópia automática, refeita pelo extrair_anexo.py a cada build.
   Não edite aqui: edite o parte9.jsx. */
export const TETO_ANEXO = 30000;      // o mesmo teto da rota, para o corte ser visível aqui
const MAX_ANEXOS = 4;

export async function textoDeAnexo(arquivo, nuvem, aviso) {
  const nome = String(arquivo.name || "arquivo");
  const tipo = String(arquivo.type || "");
  const min = nome.toLowerCase();

  /* Os dois leitores devolvem { texto, imagens }, e não uma string.
     Embrulhar o objeto de novo fazia o anexo chegar como "[object Object]"
     na IA — o PDF subia, não dava erro nenhum, e a resposta saía sobre
     coisa nenhuma. */
  if (tipo === "application/pdf" || min.endsWith(".pdf")) {
    const r = await globalThis.lerPdfParaTexto(arquivo, aviso);
    return { texto: r.texto };
  }
  if (min.endsWith(".docx") || tipo.includes("wordprocessingml")) {
    const r = await globalThis.lerDocxParaTexto(arquivo, aviso);
    return { texto: r.texto };
  }
  if (tipo.startsWith("image/")) {
    const r = await globalThis.lerFotosComIA(nuvem, [arquivo], aviso);
    if (r.erro) return { erro: r.erro };
    return { texto: r.texto || "", cortado: !!r.cortado };
  }
  if (tipo.startsWith("text/") || /\.(txt|md|csv|json)$/.test(min)) {
    aviso("lendo o arquivo");
    return { texto: await arquivo.text() };
  }
  return { erro: `Não sei ler "${nome}". Mande PDF, Word, texto ou uma imagem.` };
}

/* O material anexado, junto, do jeito que a rota recebe. O nome de cada
   arquivo vai junto porque muda a resposta: "segundo o cronograma.pdf" é
   uma coisa, "segundo a foto do mural" é outra. */
export function juntarAnexos(anexos) {
  return anexos
    .map((a) => `--- ${a.nome} ---\n${a.texto}`)
    .join("\n\n")
    .slice(0, TETO_ANEXO);
}

/* ═══════════════════════════════════════════════════════════════════
   Faculdade e especialidade pretendida
   ═══════════════════════════════════════════════════════════════════

   Uma pergunta só, feita uma vez: em que faculdade a pessoa estuda e que
   especialidade ela pretende fazer (pode ser mais de uma). Se ela quiser,
   a faculdade vai para o perfil público, e a aba Amigos mostra quem é da
   mesma faculdade e também escolheu aparecer, para adicionar com um toque.

   As duas listas já vêm prontas, e o campo filtra enquanto a pessoa digita.
   A faculdade acha por sigla ou por nome, sem ligar para acento: "ufg",
   "UFG" e "universidade federal de goias" chegam no mesmo lugar. Quem não
   achar a sua escreve o nome e usa assim mesmo.

   O que fica guardado (profile):
     faculdade           id da lista, ou "outra-<nome>" para a escrita à mão
     faculdadeNome       como mostrar
     especialidades      lista de nomes
     mostrarFaculdade    se aparece para os colegas, e se vê os colegas
     perguntouFaculdade  a janela já apareceu (some para sempre depois)

   No perfil público (perfis/{uid}) só vai a faculdade de quem escolheu
   aparecer. Quem não escolheu grava ali o campo vazio, e a busca dos
   colegas, no servidor, nunca acha essa pessoa.
*/

function semAcento(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/* Para comparar: minúsculo, sem acento, sem pontuação. */
const chaveBusca = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/* As escolas médicas do Brasil: sigla; nome; cidade; UF. Federais e
   estaduais primeiro, depois as municipais, comunitárias e particulares. */
const FACULDADES_TEXTO = `
UFG;Universidade Federal de Goiás;Goiânia;GO
UFJ;Universidade Federal de Jataí;Jataí;GO
UFCAT;Universidade Federal de Catalão;Catalão;GO
UnB;Universidade de Brasília;Brasília;DF
ESCS;Escola Superior de Ciências da Saúde;Brasília;DF
UFMT;Universidade Federal de Mato Grosso;Cuiabá;MT
UFR;Universidade Federal de Rondonópolis;Rondonópolis;MT
UNEMAT;Universidade do Estado de Mato Grosso;Cáceres;MT
UFMS;Universidade Federal de Mato Grosso do Sul;Campo Grande;MS
UFGD;Universidade Federal da Grande Dourados;Dourados;MS
UEMS;Universidade Estadual de Mato Grosso do Sul;Campo Grande;MS
UFT;Universidade Federal do Tocantins;Palmas;TO
UFNT;Universidade Federal do Norte do Tocantins;Araguaína;TO
UFAM;Universidade Federal do Amazonas;Manaus;AM
UEA;Universidade do Estado do Amazonas;Manaus;AM
UFPA;Universidade Federal do Pará;Belém;PA
UEPA;Universidade do Estado do Pará;Belém;PA
UNIFESSPA;Universidade Federal do Sul e Sudeste do Pará;Marabá;PA
UFRR;Universidade Federal de Roraima;Boa Vista;RR
UNIFAP;Universidade Federal do Amapá;Macapá;AP
UFAC;Universidade Federal do Acre;Rio Branco;AC
UNIR;Universidade Federal de Rondônia;Porto Velho;RO
UFMA;Universidade Federal do Maranhão;São Luís;MA
UEMA;Universidade Estadual do Maranhão;Caxias;MA
UFPI;Universidade Federal do Piauí;Teresina;PI
UFDPar;Universidade Federal do Delta do Parnaíba;Parnaíba;PI
UESPI;Universidade Estadual do Piauí;Teresina;PI
UFC;Universidade Federal do Ceará;Fortaleza;CE
UFCA;Universidade Federal do Cariri;Barbalha;CE
UECE;Universidade Estadual do Ceará;Fortaleza;CE
UFRN;Universidade Federal do Rio Grande do Norte;Natal;RN
UFERSA;Universidade Federal Rural do Semi-Árido;Mossoró;RN
UERN;Universidade do Estado do Rio Grande do Norte;Mossoró;RN
UFPB;Universidade Federal da Paraíba;João Pessoa;PB
UFCG;Universidade Federal de Campina Grande;Campina Grande;PB
UEPB;Universidade Estadual da Paraíba;Campina Grande;PB
UFPE;Universidade Federal de Pernambuco;Recife;PE
UPE;Universidade de Pernambuco;Recife;PE
UNIVASF;Universidade Federal do Vale do São Francisco;Petrolina;PE
UFAL;Universidade Federal de Alagoas;Maceió;AL
UNCISAL;Universidade Estadual de Ciências da Saúde de Alagoas;Maceió;AL
UFS;Universidade Federal de Sergipe;Aracaju;SE
UFBA;Universidade Federal da Bahia;Salvador;BA
UFRB;Universidade Federal do Recôncavo da Bahia;Santo Antônio de Jesus;BA
UFSB;Universidade Federal do Sul da Bahia;Teixeira de Freitas;BA
UFOB;Universidade Federal do Oeste da Bahia;Barreiras;BA
UNEB;Universidade do Estado da Bahia;Salvador;BA
UEFS;Universidade Estadual de Feira de Santana;Feira de Santana;BA
UESC;Universidade Estadual de Santa Cruz;Ilhéus;BA
UESB;Universidade Estadual do Sudoeste da Bahia;Vitória da Conquista;BA
UFMG;Universidade Federal de Minas Gerais;Belo Horizonte;MG
UFJF;Universidade Federal de Juiz de Fora;Juiz de Fora;MG
UFU;Universidade Federal de Uberlândia;Uberlândia;MG
UFTM;Universidade Federal do Triângulo Mineiro;Uberaba;MG
UFOP;Universidade Federal de Ouro Preto;Ouro Preto;MG
UFSJ;Universidade Federal de São João del-Rei;São João del-Rei;MG
UFV;Universidade Federal de Viçosa;Viçosa;MG
UFLA;Universidade Federal de Lavras;Lavras;MG
UNIFAL;Universidade Federal de Alfenas;Alfenas;MG
UFVJM;Universidade Federal dos Vales do Jequitinhonha e Mucuri;Diamantina;MG
UNIMONTES;Universidade Estadual de Montes Claros;Montes Claros;MG
UEMG;Universidade do Estado de Minas Gerais;Passos;MG
UFES;Universidade Federal do Espírito Santo;Vitória;ES
UFRJ;Universidade Federal do Rio de Janeiro;Rio de Janeiro;RJ
UFF;Universidade Federal Fluminense;Niterói;RJ
UNIRIO;Universidade Federal do Estado do Rio de Janeiro;Rio de Janeiro;RJ
UERJ;Universidade do Estado do Rio de Janeiro;Rio de Janeiro;RJ
USP;Universidade de São Paulo, Faculdade de Medicina;São Paulo;SP
FMRP-USP;Faculdade de Medicina de Ribeirão Preto da USP;Ribeirão Preto;SP
FMBRU-USP;Faculdade de Medicina de Bauru da USP;Bauru;SP
UNIFESP;Universidade Federal de São Paulo, Escola Paulista de Medicina;São Paulo;SP
UNICAMP;Universidade Estadual de Campinas;Campinas;SP
UNESP;Universidade Estadual Paulista, Faculdade de Medicina de Botucatu;Botucatu;SP
UFSCar;Universidade Federal de São Carlos;São Carlos;SP
FAMERP;Faculdade de Medicina de São José do Rio Preto;São José do Rio Preto;SP
FAMEMA;Faculdade de Medicina de Marília;Marília;SP
UFPR;Universidade Federal do Paraná;Curitiba;PR
UNILA;Universidade Federal da Integração Latino-Americana;Foz do Iguaçu;PR
UEL;Universidade Estadual de Londrina;Londrina;PR
UEM;Universidade Estadual de Maringá;Maringá;PR
UEPG;Universidade Estadual de Ponta Grossa;Ponta Grossa;PR
UNIOESTE;Universidade Estadual do Oeste do Paraná;Cascavel;PR
UNICENTRO;Universidade Estadual do Centro-Oeste;Guarapuava;PR
UFSC;Universidade Federal de Santa Catarina;Florianópolis;SC
UFFS;Universidade Federal da Fronteira Sul;Chapecó;SC
UFFS;Universidade Federal da Fronteira Sul;Passo Fundo;RS
UFRGS;Universidade Federal do Rio Grande do Sul;Porto Alegre;RS
UFCSPA;Universidade Federal de Ciências da Saúde de Porto Alegre;Porto Alegre;RS
UFSM;Universidade Federal de Santa Maria;Santa Maria;RS
UFPel;Universidade Federal de Pelotas;Pelotas;RS
FURG;Universidade Federal do Rio Grande;Rio Grande;RS
UNIPAMPA;Universidade Federal do Pampa;Uruguaiana;RS
PUC Goiás;Pontifícia Universidade Católica de Goiás;Goiânia;GO
UniEVANGÉLICA;Universidade Evangélica de Goiás;Anápolis;GO
UniRV;Universidade de Rio Verde;Rio Verde;GO
UniRV Aparecida;Universidade de Rio Verde, campus Aparecida de Goiânia;Aparecida de Goiânia;GO
UniRV Goianésia;Universidade de Rio Verde, campus Goianésia;Goianésia;GO
UniRV Formosa;Universidade de Rio Verde, campus Formosa;Formosa;GO
UNIFAN;Centro Universitário Alfredo Nasser;Aparecida de Goiânia;GO
UNIFIMES;Centro Universitário de Mineiros;Mineiros;GO
FAMP;Faculdade Morgana Potrich;Mineiros;GO
Zarns Itumbiara;Faculdade Zarns;Itumbiara;GO
UNICERRADO;Centro Universitário de Goiatuba;Goiatuba;GO
UniCEUB;Centro Universitário de Brasília;Brasília;DF
UCB;Universidade Católica de Brasília;Brasília;DF
UNIEURO;Centro Universitário Euro-Americano;Brasília;DF
UNICEPLAC;Centro Universitário do Planalto Central Apparecido dos Santos;Brasília;DF
UNIC;Universidade de Cuiabá;Cuiabá;MT
UNIVAG;Centro Universitário de Várzea Grande;Várzea Grande;MT
FASIPE;Centro Universitário Fasipe;Sinop;MT
UNIDERP;Universidade Anhanguera-Uniderp;Campo Grande;MS
UNIRG;Universidade de Gurupi;Gurupi;TO
ITPAC Palmas;Afya Faculdade de Ciências Médicas de Palmas;Palmas;TO
ITPAC Porto;Afya Faculdade de Ciências Médicas de Porto Nacional;Porto Nacional;TO
UNITPAC;Centro Universitário Tocantinense Presidente Antônio Carlos;Araguaína;TO
Nilton Lins;Universidade Nilton Lins;Manaus;AM
FAMETRO;Centro Universitário Fametro;Manaus;AM
CESUPA;Centro Universitário do Estado do Pará;Belém;PA
UNAMA;Universidade da Amazônia;Belém;PA
FAMAZ;Faculdade Metropolitana da Amazônia;Belém;PA
São Lucas;Centro Universitário São Lucas;Porto Velho;RO
FIMCA;Centro Universitário Aparício Carvalho;Porto Velho;RO
FACIMED;Faculdade de Ciências Biomédicas de Cacoal;Cacoal;RO
UNINORTE;Centro Universitário Uninorte;Rio Branco;AC
CEUMA;Universidade Ceuma;São Luís;MA
UNDB;Centro Universitário Dom Bosco;São Luís;MA
UNINOVAFAPI;Centro Universitário Uninovafapi;Teresina;PI
UNIFACID;Centro Universitário Unifacid;Teresina;PI
IESVAP;Afya Faculdade de Ciências Médicas de Parnaíba;Parnaíba;PI
UNICHRISTUS;Centro Universitário Christus;Fortaleza;CE
UNIFOR;Universidade de Fortaleza;Fortaleza;CE
FMJ;Faculdade de Medicina Estácio de Juazeiro do Norte;Juazeiro do Norte;CE
UNINTA;Centro Universitário Inta;Sobral;CE
UnP;Universidade Potiguar;Natal;RN
UNIPÊ;Centro Universitário de João Pessoa;João Pessoa;PB
FCM-PB;Afya Faculdade de Ciências Médicas da Paraíba;Cabedelo;PB
FAMENE;Faculdade de Medicina Nova Esperança;João Pessoa;PB
UNIFACISA;Centro Universitário Unifacisa;Campina Grande;PB
FSM;Faculdade Santa Maria;Cajazeiras;PB
FPS;Faculdade Pernambucana de Saúde;Recife;PE
UNICAP;Universidade Católica de Pernambuco;Recife;PE
UNINASSAU;Centro Universitário Maurício de Nassau;Recife;PE
FMO;Faculdade de Medicina de Olinda;Olinda;PE
UNIT-PE;Centro Universitário Tiradentes;Jaboatão dos Guararapes;PE
CESMAC;Centro Universitário Cesmac;Maceió;AL
UNIT-AL;Centro Universitário Tiradentes;Maceió;AL
UNIT;Universidade Tiradentes;Aracaju;SE
EBMSP;Escola Bahiana de Medicina e Saúde Pública;Salvador;BA
UNIFACS;Universidade Salvador;Salvador;BA
UNIME;União Metropolitana de Educação e Cultura;Lauro de Freitas;BA
UNIFTC;Centro Universitário UniFTC;Salvador;BA
FASA;Afya Faculdade Santo Agostinho;Vitória da Conquista;BA
FAINOR;Faculdade Independente do Nordeste;Vitória da Conquista;BA
UNIFG;Centro Universitário UniFG;Guanambi;BA
FCMMG;Faculdade Ciências Médicas de Minas Gerais;Belo Horizonte;MG
PUC Minas;Pontifícia Universidade Católica de Minas Gerais;Betim;MG
UNIFENAS;Universidade José do Rosário Vellano;Alfenas;MG
UNIFENAS BH;Universidade José do Rosário Vellano, campus Belo Horizonte;Belo Horizonte;MG
UNIBH;Centro Universitário de Belo Horizonte;Belo Horizonte;MG
FASEH;Faculdade da Saúde e Ecologia Humana;Vespasiano;MG
FAMINAS-BH;Faculdade de Minas;Belo Horizonte;MG
UNIFAMINAS;Centro Universitário Faminas;Muriaé;MG
SUPREMA;Faculdade de Ciências Médicas e da Saúde de Juiz de Fora;Juiz de Fora;MG
UNIPAC JF;Universidade Presidente Antônio Carlos;Juiz de Fora;MG
FAME;Faculdade de Medicina de Barbacena;Barbacena;MG
FMIT;Faculdade de Medicina de Itajubá;Itajubá;MG
UNIFIPMoc;Centro Universitário Fip-Moc;Montes Claros;MG
UNIPTAN;Centro Universitário Presidente Tancredo de Almeida Neves;São João del-Rei;MG
UIT;Universidade de Itaúna;Itaúna;MG
UNIUBE;Universidade de Uberaba;Uberaba;MG
UNIPAM;Centro Universitário de Patos de Minas;Patos de Minas;MG
UNEC;Centro Universitário de Caratinga;Caratinga;MG
UNIVALE;Universidade Vale do Rio Doce;Governador Valadares;MG
UNIVAÇO;Afya Faculdade de Ciências Médicas de Ipatinga;Ipatinga;MG
FADIP;Faculdade Dinâmica do Vale do Piranga;Ponte Nova;MG
UNIFAGOC;Centro Universitário Governador Ozanam Coelho;Ubá;MG
UninCor;Universidade Vale do Rio Verde;Três Corações;MG
Atenas Paracatu;Centro Universitário Atenas;Paracatu;MG
Atenas Sete Lagoas;Faculdade Atenas;Sete Lagoas;MG
Atenas Passos;Faculdade Atenas;Passos;MG
EMESCAM;Escola Superior de Ciências da Santa Casa de Misericórdia de Vitória;Vitória;ES
UVV;Universidade Vila Velha;Vila Velha;ES
MULTIVIX;Faculdade Multivix;Vitória;ES
MULTIVIX Cachoeiro;Faculdade Multivix;Cachoeiro de Itapemirim;ES
UNESC-ES;Centro Universitário do Espírito Santo;Colatina;ES
UNIGRANRIO;Universidade do Grande Rio;Duque de Caxias;RJ
UNESA;Universidade Estácio de Sá;Rio de Janeiro;RJ
FTESM;Fundação Técnico-Educacional Souza Marques;Rio de Janeiro;RJ
UNIFESO;Centro Universitário Serra dos Órgãos;Teresópolis;RJ
Univassouras;Universidade de Vassouras;Vassouras;RJ
UNIG;Universidade Iguaçu;Nova Iguaçu;RJ
FMP;Faculdade de Medicina de Petrópolis;Petrópolis;RJ
UniFOA;Centro Universitário de Volta Redonda;Volta Redonda;RJ
FMC;Faculdade de Medicina de Campos;Campos dos Goytacazes;RJ
UNIREDENTOR;Centro Universitário Redentor;Itaperuna;RJ
UVA;Universidade Veiga de Almeida;Rio de Janeiro;RJ
FCMSCSP;Faculdade de Ciências Médicas da Santa Casa de São Paulo;São Paulo;SP
Einstein;Faculdade Israelita de Ciências da Saúde Albert Einstein;São Paulo;SP
FMABC;Centro Universitário FMABC;Santo André;SP
PUC-SP;Pontifícia Universidade Católica de São Paulo;Sorocaba;SP
PUC-Campinas;Pontifícia Universidade Católica de Campinas;Campinas;SP
São Leopoldo Mandic;Faculdade São Leopoldo Mandic;Campinas;SP
UNISA;Universidade Santo Amaro;São Paulo;SP
UNINOVE;Universidade Nove de Julho;São Paulo;SP
Anhembi Morumbi;Universidade Anhembi Morumbi;São Paulo;SP
UNICID;Universidade Cidade de São Paulo;São Paulo;SP
USCS;Universidade Municipal de São Caetano do Sul;São Caetano do Sul;SP
São Camilo;Centro Universitário São Camilo;São Paulo;SP
USJT;Universidade São Judas Tadeu;São Paulo;SP
UNIP;Universidade Paulista;São Paulo;SP
UMC;Universidade de Mogi das Cruzes;Mogi das Cruzes;SP
UNITAU;Universidade de Taubaté;Taubaté;SP
Humanitas;Faculdade de Ciências Médicas de São José dos Campos;São José dos Campos;SP
FMJ Jundiaí;Faculdade de Medicina de Jundiaí;Jundiaí;SP
USF;Universidade São Francisco;Bragança Paulista;SP
UNILUS;Centro Universitário Lusíada;Santos;SP
UNIMES;Universidade Metropolitana de Santos;Santos;SP
UNAERP;Universidade de Ribeirão Preto;Ribeirão Preto;SP
Barão de Mauá;Centro Universitário Barão de Mauá;Ribeirão Preto;SP
UNIFRAN;Universidade de Franca;Franca;SP
UNIMAR;Universidade de Marília;Marília;SP
UNOESTE;Universidade do Oeste Paulista;Presidente Prudente;SP
UNIFIPA;Centro Universitário Padre Albino;Catanduva;SP
FACERES;Faculdade de Medicina de São José do Rio Preto Faceres;São José do Rio Preto;SP
UNIFEV;Centro Universitário de Votuporanga;Votuporanga;SP
Universidade Brasil;Universidade Brasil;Fernandópolis;SP
FAI;Centro Universitário de Adamantina;Adamantina;SP
UNIARA;Universidade de Araraquara;Araraquara;SP
UNIFAE;Centro Universitário das Faculdades Associadas de Ensino;São João da Boa Vista;SP
PUCPR;Pontifícia Universidade Católica do Paraná;Curitiba;PR
FEMPAR;Faculdade Evangélica Mackenzie do Paraná;Curitiba;PR
UP;Universidade Positivo;Curitiba;PR
Pequeno Príncipe;Faculdades Pequeno Príncipe;Curitiba;PR
UNIPAR;Universidade Paranaense;Umuarama;PR
UNICESUMAR;Universidade Cesumar;Maringá;PR
UNINGÁ;Centro Universitário Ingá;Maringá;PR
FAG;Centro Universitário Assis Gurgacz;Cascavel;PR
Campo Real;Centro Universitário Campo Real;Guarapuava;PR
UNIVALI;Universidade do Vale do Itajaí;Itajaí;SC
FURB;Universidade Regional de Blumenau;Blumenau;SC
UNISUL;Universidade do Sul de Santa Catarina;Tubarão;SC
UNESC;Universidade do Extremo Sul Catarinense;Criciúma;SC
UNIVILLE;Universidade da Região de Joinville;Joinville;SC
UNOESC;Universidade do Oeste de Santa Catarina;Joaçaba;SC
UNIPLAC;Universidade do Planalto Catarinense;Lages;SC
UNOCHAPECÓ;Universidade Comunitária da Região de Chapecó;Chapecó;SC
UNIDAVI;Centro Universitário para o Desenvolvimento do Alto Vale do Itajaí;Rio do Sul;SC
PUCRS;Pontifícia Universidade Católica do Rio Grande do Sul;Porto Alegre;RS
ULBRA;Universidade Luterana do Brasil;Canoas;RS
UPF;Universidade de Passo Fundo;Passo Fundo;RS
UCS;Universidade de Caxias do Sul;Caxias do Sul;RS
UNISC;Universidade de Santa Cruz do Sul;Santa Cruz do Sul;RS
UCPel;Universidade Católica de Pelotas;Pelotas;RS
FEEVALE;Universidade Feevale;Novo Hamburgo;RS
UNISINOS;Universidade do Vale do Rio dos Sinos;São Leopoldo;RS
UNIVATES;Universidade do Vale do Taquari;Lajeado;RS
URI;Universidade Regional Integrada do Alto Uruguai e das Missões;Erechim;RS
UNIJUÍ;Universidade Regional do Noroeste do Estado do Rio Grande do Sul;Ijuí;RS
UFN;Universidade Franciscana;Santa Maria;RS
ATITUS;Atitus Educação;Passo Fundo;RS
`;

const FACULDADES = FACULDADES_TEXTO.trim().split("\n").map((linha) => {
  const [sigla, nome, cidade, uf] = linha.split(";");
  return {
    /* A UF entra no id porque a mesma sigla existe em mais de um estado
       (UFFS em Chapecó e em Passo Fundo, UNESC em Criciúma e Colatina). */
    id: chaveBusca(`${sigla} ${uf}`).replace(/ /g, "-"),
    sigla, nome, cidade, uf,
    busca: chaveBusca(`${sigla} ${nome} ${cidade} ${uf}`),
    siglaBusca: chaveBusca(sigla),
  };
});

/* As 55 especialidades médicas reconhecidas pelo CFM. */
const ESPECIALIDADES = [
  "Acupuntura", "Alergia e Imunologia", "Anestesiologia", "Angiologia", "Cardiologia",
  "Cirurgia Cardiovascular", "Cirurgia da Mão", "Cirurgia de Cabeça e Pescoço",
  "Cirurgia do Aparelho Digestivo", "Cirurgia Geral", "Cirurgia Oncológica", "Cirurgia Pediátrica",
  "Cirurgia Plástica", "Cirurgia Torácica", "Cirurgia Vascular", "Clínica Médica", "Coloproctologia",
  "Dermatologia", "Endocrinologia e Metabologia", "Endoscopia", "Gastroenterologia", "Genética Médica",
  "Geriatria", "Ginecologia e Obstetrícia", "Hematologia e Hemoterapia", "Homeopatia", "Infectologia",
  "Mastologia", "Medicina de Emergência", "Medicina de Família e Comunidade", "Medicina do Trabalho",
  "Medicina de Tráfego", "Medicina Esportiva", "Medicina Física e Reabilitação", "Medicina Intensiva",
  "Medicina Legal e Perícia Médica", "Medicina Nuclear", "Medicina Preventiva e Social", "Nefrologia",
  "Neurocirurgia", "Neurologia", "Nutrologia", "Oftalmologia", "Oncologia Clínica",
  "Ortopedia e Traumatologia", "Otorrinolaringologia", "Patologia", "Patologia Clínica e Medicina Laboratorial",
  "Pediatria", "Pneumologia", "Psiquiatria", "Radiologia e Diagnóstico por Imagem", "Radioterapia",
  "Reumatologia", "Urologia",
];
const AINDA_NAO_SEI = "Ainda não decidi";
const MAX_ESPECIALIDADES = 8;

/* Procura na lista. Sigla que começa com o que foi digitado vem primeiro,
   depois o resto que tem todas as palavras digitadas, em qualquer ordem. */
function buscarFaculdades(termo) {
  const t = chaveBusca(termo);
  if (!t) return FACULDADES;
  const palavras = t.split(" ");
  const achadas = FACULDADES.filter((f) => palavras.every((p) => f.busca.includes(p)));
  const nota = (f) => (f.siglaBusca === t ? 0 : f.siglaBusca.startsWith(t) ? 1 : chaveBusca(f.nome).startsWith(t) ? 2 : 3);
  return achadas.sort((a, b) => nota(a) - nota(b));
}

const faculdadeDoId = (id) => FACULDADES.find((f) => f.id === id) || null;
const nomeDaFaculdade = (f) => (f ? `${f.sigla} · ${f.nome}` : "");

/* Faculdade escrita à mão: vira um id estável a partir do nome, e quem
   escrever o mesmo nome cai no mesmo lugar. */
const idDeOutra = (nome) => {
  const k = chaveBusca(nome).replace(/ /g, "-").slice(0, 50);
  return k.length >= 2 ? `outra-${k}` : "";
};

/* Normaliza o que vem guardado (chamado no parte2). */
function limparPerfilFaculdade(pr) {
  const esp = Array.isArray(pr.especialidades) ? pr.especialidades : [];
  const vistas = new Set();
  return {
    faculdade: typeof pr.faculdade === "string" && /^[a-z0-9-]{2,60}$/.test(pr.faculdade) ? pr.faculdade : "",
    faculdadeNome: typeof pr.faculdadeNome === "string" ? pr.faculdadeNome.slice(0, 120) : "",
    especialidades: esp.filter((x) => {
      if (typeof x !== "string" || !x.trim() || vistas.has(x)) return false;
      vistas.add(x);
      return true;
    }).map((x) => x.trim().slice(0, 60)).slice(0, MAX_ESPECIALIDADES),
    mostrarFaculdade: pr.mostrarFaculdade === true,
    perguntouFaculdade: pr.perguntouFaculdade === true,
  };
}

/* ── os dois campos ───────────────────────────────────────────────────── */

const estiloLista = {
  marginTop: 8, maxHeight: 220, overflowY: "auto", borderRadius: 12,
  border: `1px solid ${T.line}`, background: T.card,
};

function CampoFaculdade({ id, nome, aoEscolher }) {
  const [termo, setTermo] = useState("");
  const achadas = useMemo(() => buscarFaculdades(termo), [termo]);
  const escolhida = id ? (faculdadeDoId(id) || { sigla: "", nome }) : null;

  if (escolhida) {
    return (
      <div className="flex items-center gap-2 flex-wrap" data-teste="faculdade-escolhida"
        style={{ padding: "10px 12px", borderRadius: 12, border: `1px solid ${soft("var(--neon)", 45)}`, background: soft("var(--neon)", 10) }}>
        <GraduationCap size={16} style={{ color: "var(--neon)" }} />
        <span style={{ color: T.ink, fontWeight: 600, fontSize: 14.5, flex: 1, minWidth: 0 }}>
          {escolhida.sigla ? nomeDaFaculdade(escolhida) : nome}
        </span>
        <Btn size="sm" tone="quiet" onClick={() => { aoEscolher("", ""); setTermo(""); }}>trocar</Btn>
      </div>
    );
  }

  const escrita = termo.trim();
  return (
    <div>
      <TextInput value={termo} data-teste="faculdade-busca" autoFocus
        placeholder="Digite a sigla ou o nome, ex.: UFG ou Universidade Federal de Goiás"
        onChange={(e) => setTermo(e.target.value)} />
      <div style={estiloLista} role="listbox" aria-label="Faculdades">
        {achadas.slice(0, 60).map((f) => (
          <button key={f.id} type="button" role="option" aria-selected="false" data-teste="faculdade-opcao"
            onClick={() => aoEscolher(f.id, nomeDaFaculdade(f))}
            style={{
              display: "block", width: "100%", textAlign: "left", padding: "9px 12px",
              background: "transparent", border: "none", borderBottom: `1px solid ${T.line}`, cursor: "pointer",
            }}>
            <span style={{ color: T.ink, fontWeight: 700, fontSize: 14 }}>{f.sigla}</span>
            <span style={{ color: T.dim, fontSize: 13.5 }}> · {f.nome}</span>
            <span style={{ color: T.ghost, fontSize: 12.5 }}> · {f.cidade}, {f.uf}</span>
          </button>
        ))}
        {achadas.length > 60 ? (
          <div style={{ padding: "8px 12px", fontSize: 12.5, color: T.ghost }}>
            Continue digitando para achar a sua entre as {achadas.length}.
          </div>
        ) : null}
        {escrita.length >= 3 ? (
          <button type="button" data-teste="faculdade-outra"
            onClick={() => aoEscolher(idDeOutra(escrita), escrita.slice(0, 120))}
            style={{
              display: "block", width: "100%", textAlign: "left", padding: "10px 12px",
              background: "transparent", border: "none", cursor: "pointer", color: "var(--neon)", fontSize: 14, fontWeight: 600,
            }}>
            {achadas.length ? "Não é nenhuma dessas? " : "Não achei. "}Usar "{escrita}"
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CampoEspecialidades({ escolhidas, aoMudar }) {
  const [termo, setTermo] = useState("");
  const t = chaveBusca(termo);
  const todas = [AINDA_NAO_SEI, ...ESPECIALIDADES];
  const achadas = t ? todas.filter((e) => t.split(" ").every((p) => chaveBusca(e).includes(p))) : todas;
  const cheio = escolhidas.length >= MAX_ESPECIALIDADES;

  const alternar = (e) => {
    if (escolhidas.indexOf(e) >= 0) { aoMudar(escolhidas.filter((x) => x !== e)); return; }
    if (e === AINDA_NAO_SEI) { aoMudar([AINDA_NAO_SEI]); return; }
    if (cheio) return;
    aoMudar([...escolhidas.filter((x) => x !== AINDA_NAO_SEI), e]);
  };

  const escrita = termo.trim();
  const jaTem = todas.some((e) => chaveBusca(e) === t);
  return (
    <div>
      {escolhidas.length ? (
        <div className="flex gap-2 flex-wrap" style={{ marginBottom: 8 }} data-teste="especialidades-escolhidas">
          {escolhidas.map((e) => (
            <button key={e} type="button" onClick={() => alternar(e)} title="Tirar"
              className="flex items-center gap-1 rounded-full"
              style={{
                padding: "5px 10px 5px 12px", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                background: soft("var(--neon2)", 16), color: "var(--neon2)", border: `1px solid ${soft("var(--neon2)", 40)}`,
              }}>
              {e} <X size={13} />
            </button>
          ))}
        </div>
      ) : null}
      <TextInput value={termo} data-teste="especialidade-busca"
        placeholder="Digite para filtrar, ex.: cardio, pediatria, cirurgia"
        onChange={(e) => setTermo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          if (achadas.length === 1) { alternar(achadas[0]); setTermo(""); }
        }} />
      <div style={estiloLista} role="listbox" aria-label="Especialidades">
        {achadas.map((e) => {
          const on = escolhidas.indexOf(e) >= 0;
          return (
            <button key={e} type="button" role="option" aria-selected={on} data-teste="especialidade-opcao"
              disabled={!on && cheio && e !== AINDA_NAO_SEI}
              onClick={() => alternar(e)}
              className="flex items-center gap-2"
              style={{
                width: "100%", textAlign: "left", padding: "9px 12px", fontSize: 14,
                background: on ? soft("var(--neon2)", 10) : "transparent", border: "none",
                borderBottom: `1px solid ${T.line}`, cursor: "pointer",
                color: on ? "var(--neon2)" : T.ink, fontWeight: on ? 700 : 500,
                opacity: !on && cheio && e !== AINDA_NAO_SEI ? 0.45 : 1,
              }}>
              <span style={{
                width: 18, height: 18, borderRadius: 6, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
                border: `1.5px solid ${on ? "var(--neon2)" : T.line}`, background: on ? "var(--neon2)" : "transparent", color: T.bg,
              }}>{on ? <Check size={12} /> : null}</span>
              {e}
            </button>
          );
        })}
        {escrita.length >= 3 && !jaTem && !cheio ? (
          <button type="button" onClick={() => { alternar(escrita.slice(0, 60)); setTermo(""); }}
            style={{
              display: "block", width: "100%", textAlign: "left", padding: "10px 12px",
              background: "transparent", border: "none", cursor: "pointer", color: "var(--neon2)", fontSize: 14, fontWeight: 600,
            }}>
            Adicionar "{escrita}"
          </button>
        ) : null}
      </div>
      <div style={{ fontSize: 12.5, color: T.ghost, marginTop: 6 }}>
        Pode marcar mais de uma, até {MAX_ESPECIALIDADES}.
      </div>
    </div>
  );
}

function OptarColegas({ ligado, aoMudar, logado }) {
  return (
    <label className="flex items-start gap-2.5" style={{ cursor: "pointer" }}>
      <input type="checkbox" checked={ligado} data-teste="faculdade-mostrar"
        style={{ marginTop: 3 }} onChange={(e) => aoMudar(e.target.checked)} />
      <span style={{ fontSize: 14, color: T.dim, lineHeight: 1.55 }}>
        <b style={{ color: T.ink }}>Quero achar colegas da minha faculdade</b>
        <span style={{ display: "block", color: T.ghost, fontSize: 13 }}>
          Na aba Amigos aparecem as pessoas da mesma faculdade que também marcaram isto, para adicionar
          como amigo. Elas veem o seu apelido, a sua foto e as especialidades. Dá para desligar quando quiser.
          {logado ? "" : " Precisa estar com a conta conectada."}
        </span>
      </span>
    </label>
  );
}

/* ── a janela, uma vez só ─────────────────────────────────────────────── */

/* A marca no localStorage é só dos testes automáticos que rodam contra a
   página de produção: sem ela a janela ficaria na frente de tudo. No build
   de teste o montar_teste.py troca isto, e a janela só aparece para o teste
   dela. */
const perguntaFaculdadeLigada = () => {
  try { return localStorage.getItem("cm-sem-pergunta-faculdade") !== "1"; } catch (e) { return true; }
};

function PerguntaFaculdade({ data, setData, nuvem, notify, irPara }) {
  const p = data.profile || {};
  const [rascunho, setRascunho] = useState({
    faculdade: p.faculdade || "", faculdadeNome: p.faculdadeNome || "",
    especialidades: p.especialidades || [], mostrarFaculdade: p.faculdade ? !!p.mostrarFaculdade : true,
  });
  const logado = !!(nuvem && nuvem.usuario);

  const fechar = (salvar) => {
    setData((x) => ({
      ...x,
      profile: {
        ...x.profile,
        ...(salvar ? {
          faculdade: rascunho.faculdade, faculdadeNome: rascunho.faculdadeNome,
          especialidades: rascunho.especialidades,
          mostrarFaculdade: !!rascunho.faculdade && rascunho.mostrarFaculdade,
        } : {}),
        perguntouFaculdade: true,
      },
    }));
    if (!salvar) return;
    if (rascunho.faculdade && rascunho.mostrarFaculdade && logado) {
      notify("Pronto! Seus colegas da faculdade aparecem na aba Amigos.");
    } else notify("Pronto, guardado no seu perfil.");
  };

  const podeSalvar = !!rascunho.faculdade || rascunho.especialidades.length > 0;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="pergunta-faculdade-titulo" data-teste="pergunta-faculdade"
      style={{
        position: "fixed", inset: 0, zIndex: 95, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, background: "rgba(0,0,0,.5)",
      }}>
      <div style={{
        width: "100%", maxWidth: 560, maxHeight: "calc(100vh - 32px)", overflowY: "auto",
        borderRadius: 22, padding: "22px 20px 18px", background: T.card,
        border: `1px solid ${soft("var(--neon)", 40)}`, boxShadow: "0 24px 60px -20px rgba(0,0,0,.6)",
      }}>
        <div className="flex items-start gap-3">
          <span className="flex items-center justify-center" style={{
            width: 40, height: 40, borderRadius: 13, flexShrink: 0, background: soft("var(--neon)", 16), color: "var(--neon)",
          }}><GraduationCap size={20} /></span>
          <div>
            <h2 id="pergunta-faculdade-titulo" style={{ margin: 0, fontSize: 19, fontWeight: 700, color: T.ink }}>
              Onde você estuda, e para onde quer ir?
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 14, lineHeight: 1.5, color: T.dim }}>
              Conta a sua faculdade e a especialidade que pretende fazer. Se quiser, a gente
              mostra quem é da sua faculdade para vocês se adicionarem como amigos.
            </p>
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <Label style={{ display: "flex", alignItems: "center", gap: 6 }}><GraduationCap size={13} /> Sua faculdade</Label>
          <div style={{ marginTop: 6 }}>
            <CampoFaculdade id={rascunho.faculdade} nome={rascunho.faculdadeNome}
              aoEscolher={(id, nome) => setRascunho((r) => ({ ...r, faculdade: id, faculdadeNome: nome }))} />
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <Label style={{ display: "flex", alignItems: "center", gap: 6 }}><Stethoscope size={13} /> Especialidade pretendida</Label>
          <div style={{ marginTop: 6 }}>
            <CampoEspecialidades escolhidas={rascunho.especialidades}
              aoMudar={(lista) => setRascunho((r) => ({ ...r, especialidades: lista }))} />
          </div>
        </div>

        {rascunho.faculdade ? (
          <div style={{ marginTop: 18 }}>
            <OptarColegas ligado={rascunho.mostrarFaculdade} logado={logado}
              aoMudar={(v) => setRascunho((r) => ({ ...r, mostrarFaculdade: v }))} />
          </div>
        ) : null}

        <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 20 }}>
          <span data-teste="faculdade-salvar">
            <Btn tone="primary" disabled={!podeSalvar} onClick={() => fechar(true)}>
              <Check size={15} /> Salvar
            </Btn>
          </span>
          <span data-teste="faculdade-depois">
            <Btn tone="quiet" onClick={() => fechar(false)}>Agora não</Btn>
          </span>
          <span style={{ fontSize: 12.5, color: T.ghost }}>Dá para mudar depois em Configurações, Seu perfil.</span>
        </div>
      </div>
    </div>
  );
}

/* ── em Configurações, dentro de "Seu perfil" ─────────────────────────── */

function FaculdadeNoPerfil({ data, setData, nuvem }) {
  const p = data.profile || {};
  const trocar = (m) => setData((x) => ({ ...x, profile: { ...x.profile, ...m, perguntouFaculdade: true } }));
  return (
    <div className="mt-6 pt-5 flex flex-col gap-4" style={{ borderTop: `1px solid ${T.line}` }} data-teste="faculdade-perfil">
      <div>
        <Label style={{ display: "flex", alignItems: "center", gap: 6 }}><GraduationCap size={13} /> Sua faculdade</Label>
        <div style={{ marginTop: 6 }}>
          <CampoFaculdade id={p.faculdade} nome={p.faculdadeNome}
            aoEscolher={(id, nome) => trocar({ faculdade: id, faculdadeNome: nome, ...(id ? {} : { mostrarFaculdade: false }) })} />
        </div>
      </div>
      <div>
        <Label style={{ display: "flex", alignItems: "center", gap: 6 }}><Stethoscope size={13} /> Especialidade pretendida</Label>
        <div style={{ marginTop: 6 }}>
          <CampoEspecialidades escolhidas={p.especialidades || []} aoMudar={(lista) => trocar({ especialidades: lista })} />
        </div>
      </div>
      {p.faculdade ? (
        <OptarColegas ligado={!!p.mostrarFaculdade} logado={!!(nuvem && nuvem.usuario)}
          aoMudar={(v) => trocar({ mostrarFaculdade: v })} />
      ) : null}
    </div>
  );
}

/* ── no perfil público ────────────────────────────────────────────────── */

/* Grava a faculdade em perfis/{uid}, com merge, ao lado do que o
   usePerfilPublico já grava. Quem não escolheu aparecer grava vazio: é o
   que tira a pessoa da busca dos colegas, inclusive quando ela desliga
   depois de ter ligado. */
function usePerfilFaculdade(nuvem, profile) {
  const pr = profile || {};
  const aparece = !!pr.mostrarFaculdade && !!pr.faculdade;
  const dados = useMemo(() => ({
    faculdade: aparece ? pr.faculdade : "",
    faculdadeNome: aparece ? String(pr.faculdadeNome || "").slice(0, 120) : "",
    especialidades: aparece ? (pr.especialidades || []).slice(0, MAX_ESPECIALIDADES) : [],
    mostrarFaculdade: aparece,
  }), [aparece, pr.faculdade, pr.faculdadeNome, JSON.stringify(pr.especialidades || [])]);
  const ultimo = useRef("");

  useEffect(() => {
    if (!nuvem || !nuvem.sdk || !nuvem.usuario) return undefined;
    const assinatura = nuvem.usuario.uid + JSON.stringify(dados);
    if (assinatura === ultimo.current) return undefined;
    const t = setTimeout(() => {
      ultimo.current = assinatura;
      const { F, db } = nuvem.sdk;
      F.setDoc(F.doc(db, "perfis", nuvem.usuario.uid), dados, { merge: true })
        .catch(() => { ultimo.current = ""; });
    }, 1500);
    return () => clearTimeout(t);
  }, [nuvem, dados]);
}

/* ── na aba Amigos ────────────────────────────────────────────────────── */

function ColegasDaFaculdade({ nuvem, notify, data, setData }) {
  const p = data.profile || {};
  const [colegas, setColegas] = useState(null);
  const [erro, setErro] = useState("");
  const [chamando, setChamando] = useState("");
  const [chamados, setChamados] = useState({});
  const [abrirEdicao, setAbrirEdicao] = useState(false);
  const aparece = !!p.faculdade && !!p.mostrarFaculdade;

  const carregar = useCallback(async () => {
    const j = await falarComDuplas(nuvem, { acao: "colegas" });
    if (j.erro) { setErro(j.erro); setColegas([]); return; }
    setErro("");
    setColegas(j.colegas || []);
  }, [nuvem]);

  /* O perfil público grava com um respiro; espera ele antes de perguntar,
     senão a primeira busca sai com a faculdade de antes. */
  useEffect(() => {
    if (!aparece) return undefined;
    const t = setTimeout(carregar, 1800);
    return () => clearTimeout(t);
  }, [aparece, p.faculdade, carregar]);

  const adicionar = async (c) => {
    setChamando(c.uid);
    const j = await falarComDuplas(nuvem, { acao: "convidar-colega", uid: c.uid });
    setChamando("");
    if (j.erro) { setErro(j.erro); return; }
    setChamados((x) => ({ ...x, [c.uid]: true }));
    notify(j.mensagem || "Convite enviado.");
  };

  const minhas = new Set((p.especialidades || []).filter((e) => e !== AINDA_NAO_SEI));

  return (
    <div data-teste="colegas-faculdade"><Card className="px-6 py-6" brilho="var(--neon)">
      <H color="var(--neon)" icon={<GraduationCap size={16} />}>Da sua faculdade</H>
      {!aparece && !abrirEdicao ? (
        <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginTop: 10 }}>
          <Texto>
            Escolha a sua faculdade e veja aqui quem estuda nela, para adicionar como amigo.
          </Texto>
          <span data-teste="colegas-escolher">
            <Btn size="sm" tone="primary" onClick={() => setAbrirEdicao(true)}>
              <GraduationCap size={14} /> Escolher minha faculdade
            </Btn>
          </span>
        </div>
      ) : abrirEdicao ? (
        <>
          <Texto style={{ marginTop: 10 }}>
            Escolha a sua faculdade e marque que quer achar colegas: aparecem aqui as pessoas
            da mesma faculdade que também marcaram, para adicionar como amigo.
          </Texto>
          <FaculdadeNoPerfil data={data} setData={setData} nuvem={nuvem} />
          <div className="mt-4"><Btn size="sm" tone="outline" onClick={() => setAbrirEdicao(false)}>Pronto</Btn></div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginTop: 8 }}>
            <Mini>{p.faculdadeNome}</Mini>
            <Btn size="sm" tone="quiet" onClick={() => setAbrirEdicao(true)}>mudar</Btn>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {colegas === null ? <Mini>procurando colegas…</Mini> : null}
            {colegas && !colegas.length && !erro ? (
              <Mini>Ninguém da sua faculdade apareceu ainda. Quando alguém marcar, aparece aqui.</Mini>
            ) : null}
            {(colegas || []).map((c) => {
              const iguais = (c.especialidades || []).filter((e) => minhas.has(e));
              return (
                <div key={c.uid} data-teste="colega" className="flex items-center gap-3 rounded-xl px-4 py-3"
                  style={{ border: `1px solid ${T.line}`, background: T.card2 }}>
                  <Face nome={c.nome} foto={c.foto} tamanho={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: T.ink, fontWeight: 600, fontSize: 15 }}>{c.nome}</div>
                    {c.especialidades && c.especialidades.length ? (
                      <div style={{ fontSize: 12.5, color: T.dim, marginTop: 2 }}>
                        {c.especialidades.join(", ")}
                        {iguais.length ? <span style={{ color: "var(--neon2)", fontWeight: 600 }}> · quer o mesmo que você</span> : null}
                      </div>
                    ) : null}
                  </div>
                  {chamados[c.uid] ? (
                    <Mini style={{ color: "var(--neon)" }}>convite enviado</Mini>
                  ) : (
                    <Btn size="sm" tone="primary" disabled={chamando === c.uid} onClick={() => adicionar(c)}>
                      <UserPlus size={14} /> {chamando === c.uid ? "Enviando…" : "Adicionar"}
                    </Btn>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {erro ? <Label style={{ marginTop: 12, color: T.bad }}>{erro}</Label> : null}
    </Card></div>
  );
}

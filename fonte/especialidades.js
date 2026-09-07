/* Especialidade de cada aula, definida uma a uma a partir do título.
   O índice é a posição da aula no SEED. Serve para a aba Temas, que
   agrupa o cronograma por assunto em vez de por semana. */

export const ESPECIALIDADE = {
  // ── Clínica médica ────────────────────────────────────────────
  1: "Nefrologia", 3: "Nefrologia", 7: "Nefrologia", 8: "Nefrologia", 9: "Nefrologia",
  14: "Reumatologia", 16: "Reumatologia", 20: "Reumatologia",
  26: "Hematologia", 27: "Hematologia", 28: "Hematologia", 29: "Hematologia", 31: "Hematologia",
  33: "Gastroenterologia", 35: "Gastroenterologia", 36: "Gastroenterologia",
  37: "Gastroenterologia", 39: "Gastroenterologia",
  41: "Hepatologia e vias biliares", 42: "Hepatologia e vias biliares",
  43: "Hepatologia e vias biliares", 44: "Hepatologia e vias biliares", 45: "Hepatologia e vias biliares",
  48: "Cardiologia", 50: "Cardiologia", 51: "Cardiologia", 53: "Cardiologia",
  54: "Cardiologia", 56: "Cardiologia",
  59: "Endocrinologia", 62: "Endocrinologia", 63: "Endocrinologia",
  65: "Pneumologia", 67: "Pneumologia", 69: "Pneumologia", 70: "Pneumologia",
  71: "Infectologia", 72: "Infectologia", 74: "Infectologia", 75: "Infectologia",
  77: "Neurologia", 78: "Neurologia", 80: "Neurologia",
  81: "Psiquiatria", 82: "Psiquiatria",
  86: "Dermatologia", 87: "Dermatologia",

  // ── Cirurgia ──────────────────────────────────────────────────
  4: "Trauma", 5: "Trauma",
  13: "Urologia",
  19: "Plástica e queimados",
  22: "Cirurgia pediátrica",
  30: "Pré-operatório e complicações",
  32: "Parede abdominal",
  83: "Oftalmologia",
  84: "Especialidades cirúrgicas", 85: "Especialidades cirúrgicas",
  88: "Ortopedia", 89: "Ortopedia",

  // ── Ginecologia e obstetrícia ─────────────────────────────────
  0: "Ginecologia", 2: "Ginecologia", 34: "Ginecologia", 46: "Ginecologia",
  52: "Ginecologia", 58: "Ginecologia", 76: "Ginecologia",
  6: "Obstetrícia", 18: "Obstetrícia", 38: "Obstetrícia", 40: "Obstetrícia",
  66: "Obstetrícia", 73: "Obstetrícia",

  // ── Pediatria ─────────────────────────────────────────────────
  11: "Neonatologia", 15: "Neonatologia",
  24: "Crescimento e nutrição", 25: "Crescimento e nutrição", 47: "Crescimento e nutrição",
  49: "Imunização",
  55: "Gastro e nefro pediátrica", 68: "Gastro e nefro pediátrica",
  61: "Respiratório pediátrico", 64: "Respiratório pediátrico",
  79: "Infectologia pediátrica",

  // ── Preventiva ────────────────────────────────────────────────
  10: "Indicadores e saúde coletiva", 12: "Epidemiologia", 17: "Epidemiologia",
  21: "Vigilância",
  23: "Saúde do trabalhador e ética",
  57: "SUS", 60: "SUS",
};

/* Ordem em que as especialidades aparecem dentro de cada área */
export const ORDEM_ESP = {
  CL: ["Cardiologia", "Pneumologia", "Nefrologia", "Gastroenterologia",
    "Hepatologia e vias biliares", "Endocrinologia", "Hematologia", "Infectologia",
    "Reumatologia", "Neurologia", "Psiquiatria", "Dermatologia"],
  CI: ["Trauma", "Parede abdominal", "Pré-operatório e complicações", "Urologia",
    "Plástica e queimados", "Cirurgia pediátrica", "Ortopedia", "Oftalmologia",
    "Especialidades cirúrgicas"],
  GO: ["Obstetrícia", "Ginecologia"],
  PE: ["Neonatologia", "Crescimento e nutrição", "Imunização",
    "Respiratório pediátrico", "Gastro e nefro pediátrica", "Infectologia pediátrica"],
  PR: ["SUS", "Epidemiologia", "Indicadores e saúde coletiva", "Vigilância",
    "Saúde do trabalhador e ética"],
};

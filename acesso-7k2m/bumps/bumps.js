// Contas dos order bumps do Raio-X do Imposto. Usa as regras do motor.js (Simples e Reforma)
// e acrescenta as da pessoa física (INSS e IR do sócio). A conta roda no aparelho de quem usa.
(() => {
  const Motor = typeof module !== 'undefined' ? require('../motor.js') : globalThis.Motor;
  const { REGRAS, SETORES, aliquotaSimples } = Motor;

  const PF = {
    inssSocio: 0.11,                      // contribuinte individual com retenção pela empresa: Lei 8.212/1991, art. 21 e art. 30, § 4º
    tetoINSS: 8475.55,                    // Portaria Interministerial MPS/MF nº 13/2026
    // IR mensal: [base até, alíquota, parcela a deduzir] · Lei 15.191/2025 (tabela em vigor desde maio de 2025)
    tabelaIR: [[2428.80, 0, 0], [2826.65, .075, 182.16], [3751.05, .15, 394.16], [4664.68, .225, 675.49], [Infinity, .275, 908.73]],
    descontoSimplificado: 607.20,         // 25% da faixa isenta, no lugar das deduções legais
    // Lei 15.270/2025: redução do IR para rendimento tributável de até R$ 7.350 por mês
    reducao: { ateIsento: 5000, maxima: 312.89, ate: 7350, a: 978.62, b: 0.133145 },
    salarioMinimo: REGRAS.mei.salarioMinimo,
  };

  function irMensal(rendimento, inss) {
    const tabela = base => { const [, a, d] = PF.tabelaIR.find(f => base <= f[0]); return Math.max(0, base * a - d); };
    const bruto = Math.min(tabela(rendimento - inss), tabela(rendimento - PF.descontoSimplificado));
    const R = PF.reducao;
    const reducao = rendimento <= R.ateIsento ? R.maxima : rendimento <= R.ate ? Math.max(0, R.a - R.b * rendimento) : 0;
    return Math.max(0, bruto - reducao);
  }

  // Custo do pró-labore na pessoa física (por sócio, por mês): INSS de 11% até o teto + IR na fonte.
  // No Simples (Anexos III e V) a parte da empresa já está no DAS: não há os 20% patronais.
  // A folha arredonda o INSS e o IR para centavos todo mês.
  const r2 = v => Math.round(v * 100) / 100;
  function custoProlabore(valor) {
    const inss = r2(Math.min(valor, PF.tetoINSS) * PF.inssSocio);
    return { inss, ir: r2(irMensal(valor, inss)) };
  }

  // Bump 1: o pró-labore que leva o Fator R a 28% e quanto isso economiza ou custa no ano.
  function proLaboreIdeal(x) {
    const F = Math.max(0, +x.faturamentoMes || 0), S = Math.max(0, +x.salariosMes || 0);
    const P = Math.max(0, +x.prolaboreMes || 0), socios = Math.max(1, Math.round(+x.socios || 1));
    const fgts = REGRAS.folha.fgts, alvo = REGRAS.simples.fatorR;
    const fator = F ? (S * (1 + fgts) + P) / F : 0;
    const RBT12 = F * 12;
    const dasV = aliquotaSimples('V', RBT12).efetiva * RBT12, dasIII = aliquotaSimples('III', RBT12).efetiva * RBT12;
    // mínimo para 28%, sem ficar abaixo de 1 salário mínimo por sócio
    const necessario = Math.max(alvo * F - S * (1 + fgts), PF.salarioMinimo * socios, 0);
    const custoAno = total => {
      const c = custoProlabore(total / socios);
      return (c.inss + c.ir) * socios * 12;
    };
    const atual = { prolabore: P, custoPF: r2(custoAno(P)), das: r2(fator >= alvo ? dasIII : dasV), anexo: fator >= alvo ? 'III' : 'V' };
    const ideal = { prolabore: r2(necessario), porSocio: r2(necessario / socios), custoPF: r2(custoAno(necessario)), das: r2(dasIII), anexo: 'III' };
    atual.total = r2(atual.das + atual.custoPF);
    ideal.total = r2(ideal.das + ideal.custoPF);
    return {
      fator, atual, ideal, dasV: r2(dasV), dasIII: r2(dasIII),
      economiaAno: r2(atual.total - ideal.total), // positivo: o pró-labore ideal sai mais barato no total
      acimaDoLimite: RBT12 > REGRAS.simples.limite,
    };
  }

  // Bump 2: o preço que mantém o que sobra para a empresa depois dos impostos sobre a venda,
  // ano a ano de 2026 a 2033. Vale para Lucro Presumido e Lucro Real; no Simples o DAS segue.
  function preco2027(x) {
    const s = SETORES[x.setor] || SETORES.servicos, R = REGRAS.reforma;
    const P = Math.max(0, +x.preco || 0), C = Math.max(0, +x.custo || 0);
    const iss = x.issAliq ?? 0.05, icms = x.icmsAliq ?? 0.18;
    const real = x.regime === 'real';
    const pisCofins = real ? Math.max(0, P - C) * (REGRAS.real.pis + REGRAS.real.cofins) : P * (REGRAS.presumido.pis + REGRAS.presumido.cofins);
    const local = (base, f) => (s.consumo === 'iss' ? base * iss * f : Math.max(0, base - C) * icms * f);
    const liquido = P - pisCofins - local(P, 1); // o que sobra hoje, por unidade
    const anos = R.anos.map(ano => {
      const f = R.icmsIss[ano];
      if (ano <= 2026) return { ano, semImposto: r2(P), cbsIbs: 0, cliente: r2(P), variacao: 0 };
      // preço sem CBS e IBS (B) que deixa o mesmo líquido depois do ICMS ou ISS que ainda resta
      const B = s.consumo === 'iss' ? liquido / (1 - iss * f) : (liquido - icms * f * C) / (1 - icms * f);
      const teste = ano <= 2028;
      const t = ((R.cbs - (teste ? R.reducaoTeste : 0)) + (teste ? R.reducaoTeste : R.ibs * (1 - f))) * (1 - s.reducao);
      return { ano, semImposto: r2(B), cbsIbs: r2(B * t), cliente: r2(B * (1 + t)), variacao: P ? (B * (1 + t)) / P - 1 : 0, aliquota: t };
    });
    return { liquido: r2(liquido), pisCofins: r2(pisCofins), anos };
  }

  const Bumps = { PF, irMensal, custoProlabore, proLaboreIdeal, preco2027 };
  if (typeof module !== 'undefined') module.exports = Bumps;
  else globalThis.Bumps = Bumps;
})();

// Motor do Simulador Tributário: todas as regras num bloco só (REGRAS), com a fonte de cada número.
// A conta roda no aparelho de quem usa; nada é enviado nem guardado.
// "aConfirmar" marca o número que o FISCO-4 ainda precisa conferir na fonte oficial.

(() => {
  const REGRAS = {
    vigencia: '2026',
    mei: {
      limiteAnual: 81000,                 // LC 123/2006, art. 18-A, § 1º (sem reajuste em 2026, conferido em 29/10/2026)
      toleranciaExcesso: 0.20,            // até 20% acima: sai do MEI no ano seguinte (art. 18-A, § 7º, III)
      salarioMinimo: 1621,                // Decreto 12.797/2025 (conferido em 29/10/2026)
      inss: 0.05,                         // 5% do salário mínimo (art. 18-A, § 3º, V, "a")
      icms: 1, iss: 5,                    // valores fixos mensais (art. 18-A, § 3º, V, "b" e "c")
      cppEmpregado: 0.03,                 // 3% sobre o salário do único empregado (art. 18-C, § 1º, I)
      maxEmpregados: 1,
    },
    simples: {
      limite: 4800000,                    // LC 123/2006, art. 3º, II
      sublimite: 3600000,                 // acima disso, ICMS e ISS saem do DAS (art. 13-A)
      fatorR: 0.28,                       // art. 18, § 5º-J e § 5º-M
      // [receita bruta 12 meses até, alíquota nominal, parcela a deduzir] · LC 123/2006, Anexos I a V (redação da LC 155/2016)
      anexos: {
        I:   [[180000, .04, 0], [360000, .073, 5940], [720000, .095, 13860], [1800000, .107, 22500], [3600000, .143, 87300], [4800000, .19, 378000]],
        II:  [[180000, .045, 0], [360000, .078, 5940], [720000, .10, 13860], [1800000, .112, 22500], [3600000, .147, 85500], [4800000, .30, 720000]],
        III: [[180000, .06, 0], [360000, .112, 9360], [720000, .135, 17640], [1800000, .16, 35640], [3600000, .21, 125640], [4800000, .33, 648000]],
        IV:  [[180000, .045, 0], [360000, .09, 8100], [720000, .102, 12420], [1800000, .14, 39780], [3600000, .22, 183780], [4800000, .33, 828000]],
        V:   [[180000, .155, 0], [360000, .18, 4500], [720000, .195, 9900], [1800000, .205, 17100], [3600000, .23, 62100], [4800000, .305, 540000]],
      },
    },
    presumido: {
      limite: 78000000,                   // Lei 9.718/1998, art. 13
      irpj: 0.15, adicional: 0.10, limiteAdicionalAno: 240000, // Lei 9.249/1995, art. 3º; RIR/2018, art. 624
      csll: 0.09,                         // Lei 7.689/1988, art. 3º, III
      pis: 0.0065, cofins: 0.03,          // regime cumulativo: Lei 9.718/1998
      acrescimoPresuncao: 0.10,           // LC 224/2025 e IN RFB 2.305/2025: +10% na presunção sobre a receita acima de R$ 5 mi (contestado no STF e no TRF-3)
      limiteAcrescimo: 5000000,
    },
    real: {
      irpj: 0.15, adicional: 0.10, limiteAdicionalAno: 240000,
      csll: 0.09,
      pis: 0.0165, cofins: 0.076,         // não cumulativo: Leis 10.637/2002 e 10.833/2003
    },
    folha: {
      inssPatronal: 0.20,                 // Lei 8.212/1991, art. 22, I e III
      ratTerceiros: 0.078,                // valor típico: RAT de 2% (vai de 1% a 3% conforme a atividade) + terceiros de 5,8% (salário-educação 2,5%, INCRA 0,2%, Sistema S 2,5%, Sebrae 0,6%)
      ratAnexoIV: 0.02,                   // no Anexo IV do Simples a CPP é paga à parte, sem terceiros
      fgts: 0.08,                         // Lei 8.036/1990: igual em todos os regimes, só entra no Fator R e no lucro
    },
    reforma: {
      // EC 132/2023 e LC 214/2025. As alíquotas de referência definitivas ainda vão ser fixadas pelo Senado.
      cbs: 0.113,                         // aConfirmar: cálculo do TCU para 2027, aprovado em 28/10/2026; o Senado fixa até 15/12/2026
      ibs: 0.187,                         // aConfirmar: estimativa da Resolução CGIBS nº 14/2026
      reducaoTeste: 0.001,                // 2027 e 2028: CBS menos 0,1 ponto; IBS de 0,1% (LC 214/2025, arts. 343 a 346)
      // fração do ICMS e do ISS que ainda vale em cada ano (EC 132/2023, art. 128 do ADCT)
      icmsIss: { 2026: 1, 2027: 1, 2028: 1, 2029: 0.9, 2030: 0.8, 2031: 0.7, 2032: 0.6, 2033: 0 },
      anos: [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033],
    },
    dividendos: { limiteMes: 50000, retencao: 0.10 }, // Lei 15.270/2025: 10% sobre o total do mês acima de R$ 50 mil por pessoa
  };

  // anexo: anexo do Simples; fatorR: troca V por III quando a folha chega a 28%;
  // consumo: imposto sobre a venda fora do Simples; reducao: redução de IBS e CBS na Reforma (LC 214/2025)
  const SETORES = {
    comercio:      { nome: 'Comércio (loja, revenda, e-commerce)', anexo: 'I', presIRPJ: .08, presCSLL: .12, consumo: 'icms', reducao: 0, mei: true },
    industria:     { nome: 'Indústria (fabrica o que vende)', anexo: 'II', presIRPJ: .08, presCSLL: .12, consumo: 'icms', reducao: 0, mei: true },
    servicos:      { nome: 'Serviços em geral (manutenção, beleza, academia, eventos...)', anexo: 'III', presIRPJ: .32, presCSLL: .32, consumo: 'iss', reducao: 0, mei: true },
    intelectual:   { nome: 'Tecnologia, consultoria, marketing e serviços intelectuais', anexo: 'V', fatorR: true, presIRPJ: .32, presCSLL: .32, consumo: 'iss', reducao: 0, mei: false },
    regulamentada: { nome: 'Profissão regulamentada (engenharia, arquitetura, contabilidade...)', anexo: 'V', fatorR: true, presIRPJ: .32, presCSLL: .32, consumo: 'iss', reducao: 0.30, mei: false },
    saude:         { nome: 'Saúde (clínica, consultório, odontologia)', anexo: 'V', fatorR: true, presIRPJ: .32, presCSLL: .32, consumo: 'iss', reducao: 0.60, mei: false },
    educacao:      { nome: 'Educação (escola, curso, treinamento)', anexo: 'III', presIRPJ: .32, presCSLL: .32, consumo: 'iss', reducao: 0.60, mei: false },
    construcao:    { nome: 'Obras, limpeza e vigilância', anexo: 'IV', presIRPJ: .32, presCSLL: .32, consumo: 'iss', reducao: 0, mei: true },
  };

  const MODALIDADES = {
    abrir: 'Ainda vou abrir', mei: 'MEI', simples: 'Simples Nacional', presumido: 'Lucro Presumido', real: 'Lucro Real',
  };

  const r2 = v => Math.round(v * 100) / 100;

  function aliquotaSimples(anexo, rbt12) {
    const faixas = REGRAS.simples.anexos[anexo];
    const [, nominal, deduzir] = faixas.find(f => rbt12 <= f[0]) || faixas[faixas.length - 1];
    if (rbt12 <= 0) return { nominal, efetiva: 0 };
    return { nominal, efetiva: (rbt12 * nominal - deduzir) / rbt12 };
  }

  // Fator R = folha de salários de 12 meses (salários + FGTS + pró-labore) / receita de 12 meses
  function fatorR(e) {
    const F = e.faturamentoMes * 12;
    if (!F) return 0;
    return ((e.salariosMes * (1 + REGRAS.folha.fgts) + e.prolaboreMes) * 12) / F;
  }

  function encargosFolha(e) {
    return e.salariosMes * 12 * (REGRAS.folha.inssPatronal + REGRAS.folha.ratTerceiros) + e.prolaboreMes * 12 * REGRAS.folha.inssPatronal;
  }

  // Imposto sobre a venda fora do Simples (hoje): ISS sobre o faturamento; ICMS sobre o que a empresa agrega (venda menos compra)
  function consumoAtual(e, s, fracao = 1) {
    const F = e.faturamentoMes * 12, C = e.comprasMes * 12;
    if (s.consumo === 'iss') return { ISS: F * e.issAliq * fracao };
    return { ICMS: Math.max(0, F - C) * e.icmsAliq * fracao };
  }

  function calcMEI(e, s) {
    const M = REGRAS.mei, F = e.faturamentoMes * 12;
    const motivo = !s.mei ? 'sua atividade não pode ser MEI'
      : F > M.limiteAnual ? `faturamento acima de R$ ${M.limiteAnual.toLocaleString('pt-BR')} por ano`
      : e.funcionarios > M.maxEmpregados ? 'MEI só pode ter 1 empregado' : null;
    const fixo = s.consumo === 'icms' ? M.icms : M.iss;
    const tributos = { 'DAS do MEI': 12 * (M.salarioMinimo * M.inss + fixo) };
    if (e.funcionarios > 0) tributos['INSS do empregado (parte da empresa)'] = e.salariosMes * 12 * M.cppEmpregado;
    return { id: 'mei', elegivel: !motivo, motivo, tributos };
  }

  function calcSimples(e, s) {
    const S = REGRAS.simples, F = e.faturamentoMes * 12;
    const fr = fatorR(e);
    const anexo = s.fatorR ? (fr >= S.fatorR ? 'III' : 'V') : s.anexo;
    const { nominal, efetiva } = aliquotaSimples(anexo, F);
    const tributos = { [`DAS (Anexo ${anexo})`]: F * efetiva };
    if (anexo === 'IV') tributos['INSS sobre a folha (fora do DAS)'] = e.salariosMes * 12 * (REGRAS.folha.inssPatronal + REGRAS.folha.ratAnexoIV) + e.prolaboreMes * 12 * REGRAS.folha.inssPatronal;
    return {
      id: 'simples', elegivel: F <= S.limite, motivo: F > S.limite ? 'faturamento acima de R$ 4,8 milhões por ano' : null,
      tributos, anexo, aliquotaNominal: nominal, aliquotaEfetiva: efetiva, fatorR: fr, acimaSublimite: F > S.sublimite,
    };
  }

  function calcPresumido(e, s, ano = 2026) {
    const P = REGRAS.presumido, R = REGRAS.reforma, F = e.faturamentoMes * 12;
    const excesso = Math.max(0, F - P.limiteAcrescimo);
    const baseIR = F * s.presIRPJ + excesso * s.presIRPJ * P.acrescimoPresuncao;
    const baseCS = F * s.presCSLL + excesso * s.presCSLL * P.acrescimoPresuncao;
    const tributos = {
      IRPJ: baseIR * P.irpj + Math.max(0, baseIR - P.limiteAdicionalAno) * P.adicional,
      CSLL: baseCS * P.csll,
      ...consumoReforma(e, s, ano, { PIS: F * P.pis, COFINS: F * P.cofins }),
      'INSS sobre a folha': encargosFolha(e),
    };
    return { id: 'presumido', elegivel: F <= P.limite, motivo: F > P.limite ? 'faturamento acima de R$ 78 milhões por ano' : null, tributos };
  }

  function calcReal(e, s, ano = 2026) {
    const L = REGRAS.real, F = e.faturamentoMes * 12, C = e.comprasMes * 12;
    const consumo = consumoReforma(e, s, ano, { PIS: Math.max(0, F - C) * L.pis, COFINS: Math.max(0, F - C) * L.cofins });
    const folha = encargosFolha(e);
    const custos = C + e.salariosMes * 12 * (1 + REGRAS.folha.fgts) + e.prolaboreMes * 12 + e.despesasMes * 12;
    const lucro = F - custos - folha - Object.values(consumo).reduce((a, b) => a + b, 0);
    const base = Math.max(0, lucro);
    const tributos = {
      IRPJ: base * L.irpj + Math.max(0, base - L.limiteAdicionalAno) * L.adicional,
      CSLL: base * L.csll,
      ...consumo,
      'INSS sobre a folha': folha,
    };
    return { id: 'real', elegivel: true, motivo: null, tributos, lucro };
  }

  // Impostos sobre a venda em Presumido e Real, ano a ano da transição.
  // Até 2026: PIS e COFINS de hoje. De 2027: CBS no lugar deles. De 2029 a 2033: ICMS e ISS caem e o IBS sobe.
  // CBS e IBS têm crédito amplo: incidem sobre a venda menos as compras e despesas com fornecedores.
  function consumoReforma(e, s, ano, pisCofinsHoje) {
    const R = REGRAS.reforma;
    const fracao = R.icmsIss[ano] ?? 0;
    const out = ano <= 2026 ? { ...pisCofinsHoje } : {};
    if (fracao > 0) Object.assign(out, consumoAtual(e, s, fracao));
    if (ano >= 2027) {
      const agregado = Math.max(0, (e.faturamentoMes - e.comprasMes - e.despesasMes) * 12) * (1 - s.reducao);
      const teste = ano <= 2028 ? R.reducaoTeste : 0;
      out.CBS = agregado * (R.cbs - teste);
      out.IBS = agregado * (ano <= 2028 ? R.reducaoTeste : R.ibs * (1 - fracao));
    }
    return out;
  }

  const total = r => Object.values(r.tributos).reduce((a, b) => a + b, 0);

  function normalizar(x) {
    const n = v => Math.max(0, Number(v) || 0);
    return {
      modalidade: x.modalidade || 'abrir', setor: x.setor || 'comercio',
      faturamentoMes: n(x.faturamentoMes), comprasMes: n(x.comprasMes), salariosMes: n(x.salariosMes),
      funcionarios: n(x.funcionarios), prolaboreMes: n(x.prolaboreMes), despesasMes: n(x.despesasMes),
      issAliq: x.issAliq == null ? 0.05 : n(x.issAliq), icmsAliq: x.icmsAliq == null ? 0.18 : n(x.icmsAliq),
      socios: Math.max(1, n(x.socios) || 1), clientesEmpresas: !!x.clientesEmpresas, pagaHojeMes: n(x.pagaHojeMes),
    };
  }

  function calcular(entrada) {
    const e = normalizar(entrada), s = SETORES[e.setor], F = e.faturamentoMes * 12;
    const regimes = [calcMEI(e, s), calcSimples(e, s), calcPresumido(e, s), calcReal(e, s)];
    for (const r of regimes) {
      r.nome = MODALIDADES[r.id];
      r.anual = r2(total(r));
      r.mensal = r2(r.anual / 12);
      r.carga = F ? r.anual / F : 0;
      for (const k in r.tributos) r.tributos[k] = r2(r.tributos[k]);
    }
    const elegiveis = regimes.filter(r => r.elegivel);
    const melhor = elegiveis.reduce((a, b) => (b.anual < a.anual ? b : a), elegiveis[0]);
    const atual = regimes.find(r => r.id === e.modalidade) || null;

    // Simples e MEI ficam como estão na transição; Presumido e Real são recalculados ano a ano
    const projecao = REGRAS.reforma.anos.map(ano => {
      const linha = { ano };
      for (const r of elegiveis) {
        linha[r.id] = r.id === 'presumido' ? r2(total(calcPresumido(e, s, ano)))
          : r.id === 'real' ? r2(total(calcReal(e, s, ano))) : r.anual;
      }
      return linha;
    });
    const fim = projecao[projecao.length - 1];
    const melhor2033 = elegiveis.reduce((a, b) => (fim[b.id] < fim[a.id] ? b : a), elegiveis[0]);

    const res = { entrada: e, setor: s, regimes, melhor, atual, projecao, melhor2033 };
    res.alertas = alertas(res);
    res.perguntas = perguntas(res);
    return res;
  }

  const brl = v => 'R$ ' + Math.round(v).toLocaleString('pt-BR');

  function alertas({ entrada: e, setor: s, regimes, melhor, atual, projecao }) {
    const out = [], F = e.faturamentoMes * 12, M = REGRAS.mei;
    const reg = id => regimes.find(r => r.id === id);
    const simples = reg('simples'), presumido = reg('presumido');

    if (atual && atual.elegivel && melhor && melhor.id !== atual.id) {
      out.push({ tipo: 'economia', titulo: `${melhor.nome} sai ${brl(atual.anual - melhor.anual)} por ano mais barato`,
        texto: `Pela simulação, você paga cerca de ${brl(atual.anual)} por ano no ${atual.nome} e pagaria ${brl(melhor.anual)} no ${melhor.nome}. Troca de regime tem prazo e regra: leve esta conta ao seu contador.` });
    }
    if (atual && !atual.elegivel) {
      out.push({ tipo: 'risco', titulo: `Pelos números informados, sua empresa não cabe mais no ${atual.nome}`, texto: `Motivo: ${atual.motivo}. Confirme com o contador o quanto antes: ficar num regime em que não cabe gera cobrança com multa.` });
    }
    if (e.modalidade === 'mei' && F > M.limiteAnual) {
      const dentro = F <= M.limiteAnual * (1 + M.toleranciaExcesso);
      out.push({ tipo: 'risco', titulo: dentro ? 'Você passou do limite do MEI (até 20% acima)' : 'Você passou mais de 20% do limite do MEI',
        texto: dentro ? 'Até 20% acima de R$ 81 mil, você paga um DAS sobre o excesso e vira microempresa a partir de janeiro do ano seguinte.'
          : 'Acima de 20% do limite, o desenquadramento vale desde janeiro do ano em que passou, com imposto de microempresa sobre todo o período. Fale com um contador já.' });
    }
    if (simples.elegivel && simples.acimaSublimite) {
      out.push({ tipo: 'atencao', titulo: 'Faturamento acima de R$ 3,6 milhões no Simples', texto: 'Acima desse valor, o ICMS ou o ISS deixam de ser pagos no DAS e passam a ser pagos à parte. Esta simulação não inclui essa parte: o Simples real tende a sair mais caro do que o mostrado.' });
    }
    if (s.fatorR && simples.elegivel && simples.fatorR < REGRAS.simples.fatorR) {
      const alvo = Math.max(0, (REGRAS.simples.fatorR * F) / 12 - e.salariosMes * (1 + REGRAS.folha.fgts));
      const comIII = aliquotaSimples('III', F).efetiva * F;
      const economia = simples.tributos[`DAS (Anexo ${simples.anexo})`] - comIII;
      if (economia > 0) out.push({ tipo: 'economia', titulo: `Fator R: o pró-labore certo pode cortar ${brl(economia)} por ano do DAS`,
        texto: `Sua folha é ${(simples.fatorR * 100).toFixed(1)}% do faturamento e por isso você cai no Anexo V. Com a folha em 28% (pró-labore de cerca de ${brl(alvo)} por mês), a atividade vai para o Anexo III. Aumentar o pró-labore tem custo de INSS e de Imposto de Renda na pessoa física: a conta final precisa incluir isso.` });
    }
    if (presumido.elegivel) {
      const hoje = projecao[0].presumido, depois = projecao[projecao.length - 1].presumido;
      if (depois > hoje * 1.1) out.push({ tipo: 'atencao', titulo: `Reforma: no Lucro Presumido seu imposto sobe para ${brl(depois)} por ano em 2033`,
        texto: `Hoje seriam ${brl(hoje)}. CBS e IBS incidem sobre o que você vende menos o que compra de fornecedores; quem compra pouco (serviço, principalmente) sente mais. Como esses tributos vêm destacados por fora do preço, parte pode ir para o preço: planeje antes de 2027.` });
    }
    if (e.clientesEmpresas && simples.elegivel) {
      out.push({ tipo: 'atencao', titulo: 'Clientes empresas e Simples: atenção ao crédito a partir de 2027',
        texto: 'Na Reforma, a empresa que compra de você aproveita como crédito só o IBS e a CBS que você paga. No Simples esse crédito é menor, e você pode perder espaço para fornecedores de outros regimes. O Simples vai poder escolher pagar IBS e CBS por fora: vale estudar com o contador.' });
    }
    if (s.consumo === 'icms') {
      out.push({ tipo: 'info', titulo: 'Produtos com substituição tributária ou PIS e COFINS monofásico', texto: 'Se o que você vende tem ICMS-ST ou PIS e COFINS monofásico (bebidas, cosméticos, autopeças, remédios, combustíveis e outros), parte do imposto já foi paga antes e o seu imposto real é menor do que o simulado. Muita empresa paga isso em dobro sem saber: pergunte ao contador.' });
    }
    if (e.setor === 'industria') {
      out.push({ tipo: 'info', titulo: 'IPI fora da conta', texto: 'Esta simulação não calcula o IPI. Pela Reforma, a alíquota do IPI vai a zero em 2027 para quase tudo, menos o que concorre com a Zona Franca de Manaus.' });
    }
    if (melhor) {
      const lucro = F - e.comprasMes * 12 - e.salariosMes * 12 * (1 + REGRAS.folha.fgts) - e.prolaboreMes * 12 - e.despesasMes * 12 - melhor.anual;
      const porSocio = lucro / 12 / e.socios;
      if (porSocio > REGRAS.dividendos.limiteMes) out.push({ tipo: 'atencao', titulo: 'Lucro distribuído acima de R$ 50 mil por mês por sócio',
        texto: `Pela simulação, cada sócio receberia cerca de ${brl(porSocio)} por mês. Desde 2026, quando a mesma empresa paga mais de R$ 50 mil no mês à mesma pessoa, há retenção de 10% de Imposto de Renda sobre o valor inteiro, além do imposto mínimo anual para quem ganha muito. Vale planejar a distribuição.` });
    }
    if (e.pagaHojeMes && atual && atual.elegivel) {
      const dif = (e.pagaHojeMes - atual.mensal) / (atual.mensal || 1);
      if (Math.abs(dif) > 0.15) out.push({ tipo: dif > 0 ? 'risco' : 'atencao',
        titulo: dif > 0 ? `Você paga ${Math.round(dif * 100)}% a mais do que a simulação` : `Você paga ${Math.round(-dif * 100)}% a menos do que a simulação`,
        texto: dif > 0 ? 'Pode ser algo que a simulação não pega (multa, parcelamento, outra atividade), mas também pode ser enquadramento errado: anexo, presunção, imposto pago em dobro. Peça ao contador a conta tributo por tributo.'
          : 'Pode ser um benefício que você tem (monofásico, ST, incentivo do estado) ou imposto que deixou de ser pago. Peça ao contador para conferir: imposto a menos vira cobrança com multa depois.' });
    }
    return out;
  }

  function perguntas({ entrada: e, setor: s, regimes, melhor, atual, alertas: _a }) {
    const q = [];
    const simples = regimes.find(r => r.id === 'simples');
    if (atual && melhor && melhor.id !== atual.id) q.push(`A simulação mostra o ${melhor.nome} mais barato que o ${atual.nome}. Faz sentido trocar? Qual o prazo e o que muda na rotina?`);
    if (!atual) q.push('Qual regime você recomenda para começar, olhando para o meu faturamento previsto e para a Reforma?');
    q.push('O CNAE da empresa bate com o que eu realmente faço? Ele leva ao anexo ou à presunção certa?');
    if (s.fatorR) q.push(`Minha atividade depende do Fator R. Qual pró-labore deixa a folha em 28% e quanto isso me custa na pessoa física?`);
    if (s.consumo === 'icms') q.push('Algum produto meu tem ICMS-ST ou PIS e COFINS monofásico? Estamos descontando isso no imposto?');
    q.push('Existe imposto pago a mais nos últimos 5 anos que dê para recuperar?');
    q.push('O que muda para mim em 2027 com a CBS? Preciso mudar preço, contrato ou nota fiscal?');
    if (e.clientesEmpresas && simples.elegivel) q.push('Vale a pena, a partir de 2027, pagar IBS e CBS por fora do Simples para dar crédito aos meus clientes?');
    q.push('Como está a distribuição de lucro para os sócios, com as regras de 2026?');
    return q;
  }

  const Motor = { REGRAS, SETORES, MODALIDADES, calcular, aliquotaSimples, fatorR };
  if (typeof module !== 'undefined') module.exports = Motor;
  else globalThis.Motor = Motor;
})();

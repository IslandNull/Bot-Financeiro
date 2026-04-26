const { V54_HEADERS, V54_SHEETS } = require('./v54-schema');

const V54_SEED_KEY_FIELDS = {
    [V54_SHEETS.CONFIG_CATEGORIAS]: 'id_categoria',
    [V54_SHEETS.CONFIG_FONTES]: 'id_fonte',
    [V54_SHEETS.RENDAS]: 'id_renda',
    [V54_SHEETS.CARTOES]: 'id_cartao',
    [V54_SHEETS.PATRIMONIO_ATIVOS]: 'id_ativo',
    [V54_SHEETS.DIVIDAS]: 'id_divida',
    [V54_SHEETS.ORCAMENTO_FUTURO_CASA]: 'item',
};

const V54_SEED_DATA = {
    [V54_SHEETS.CONFIG_CATEGORIAS]: [
        { id_categoria: 'OPEX_MERCADO_RANCHO', nome: 'Mercado rancho', grupo: 'Casa', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'recorrente', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'detalhada', ativo: true },
        { id_categoria: 'OPEX_MERCADO_SEMANA', nome: 'Mercado semana', grupo: 'Casa', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'variavel', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'detalhada', ativo: true },
        { id_categoria: 'OPEX_DELIVERY_CASAL', nome: 'Delivery casal', grupo: 'Lazer', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'limite_semanal', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'detalhada', ativo: true },
        { id_categoria: 'OPEX_RESTAURANTE_CASAL', nome: 'Restaurante casal', grupo: 'Lazer', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'limite_mensal', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'detalhada', ativo: true },
        { id_categoria: 'OPEX_LUZ', nome: 'Luz', grupo: 'Casa futura', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'forecast', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'resumo', ativo: true },
        { id_categoria: 'OPEX_AGUA', nome: 'Agua', grupo: 'Casa futura', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'forecast', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'resumo', ativo: true },
        { id_categoria: 'OPEX_INTERNET', nome: 'Internet', grupo: 'Casa futura', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'forecast', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'resumo', ativo: true },
        { id_categoria: 'OPEX_CELULARES', nome: 'Celulares', grupo: 'Casa futura', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'forecast', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'resumo', ativo: true },
        { id_categoria: 'OPEX_CONDOMINIO', nome: 'Condominio', grupo: 'Casa futura', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'forecast', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'resumo', ativo: true },
        { id_categoria: 'OPEX_COMBUSTIVEL_MOTO', nome: 'Combustivel moto', grupo: 'Transporte', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Gustavo', comportamento_orcamento: 'recorrente', afeta_acerto: false, afeta_dre: true, visibilidade_padrao: 'detalhada', ativo: true },
        { id_categoria: 'OPEX_MANUTENCAO_MOTO', nome: 'Manutencao moto', grupo: 'Transporte', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Gustavo', comportamento_orcamento: 'provisao', afeta_acerto: false, afeta_dre: true, visibilidade_padrao: 'detalhada', ativo: true },
        { id_categoria: 'OPEX_ROUPAS', nome: 'Roupas', grupo: 'Pessoal', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'pessoal_proporcional', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'resumo', ativo: true },
        { id_categoria: 'OPEX_CUIDADO_PESSOAL', nome: 'Cuidado pessoal', grupo: 'Pessoal', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'pessoal_proporcional', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'resumo', ativo: true },
        { id_categoria: 'OPEX_SAUDE_COPARTICIPACAO', nome: 'Coparticipacao medica', grupo: 'Saude', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'pessoal_proporcional', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'resumo', ativo: true },
        { id_categoria: 'OPEX_LANCHES_TRABALHO', nome: 'Lanches trabalho', grupo: 'Pessoal', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'pessoal_proporcional', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'resumo', ativo: true },
        { id_categoria: 'OPEX_FARMACIA', nome: 'Farmacia', grupo: 'Saude', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'variavel', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'resumo', ativo: true },
        { id_categoria: 'DEBT_FINANCIAMENTO_CAIXA', nome: 'Financiamento Caixa', grupo: 'Dividas', tipo_movimento: 'Despesa', classe_dre: 'Divida', escopo: 'Casal', comportamento_orcamento: 'obrigacao', afeta_acerto: true, afeta_dre: false, visibilidade_padrao: 'resumo', ativo: true },
        { id_categoria: 'DEBT_VASCO', nome: 'Vasco', grupo: 'Dividas', tipo_movimento: 'Despesa', classe_dre: 'Divida', escopo: 'Casal', comportamento_orcamento: 'obrigacao', afeta_acerto: true, afeta_dre: false, visibilidade_padrao: 'resumo', ativo: true },
        { id_categoria: 'INV_APORTE', nome: 'Aporte investimento', grupo: 'Patrimonio', tipo_movimento: 'Transferencia', classe_dre: 'Investimento', escopo: 'Casal', comportamento_orcamento: 'prioridade_pre_pessoal', afeta_acerto: true, afeta_dre: false, visibilidade_padrao: 'resumo', ativo: true },
        { id_categoria: 'RESERVA_EMERGENCIA', nome: 'Reserva emergencia', grupo: 'Patrimonio', tipo_movimento: 'Transferencia', classe_dre: 'Reserva', escopo: 'Casal', comportamento_orcamento: 'prioridade_pre_pessoal', afeta_acerto: true, afeta_dre: false, visibilidade_padrao: 'resumo', ativo: true },
        { id_categoria: 'REC_SALARIO', nome: 'Salario', grupo: 'Receitas', tipo_movimento: 'Receita', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'recorrente', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'resumo', ativo: true },
        { id_categoria: 'REC_BENEFICIO', nome: 'Beneficio VA/VR', grupo: 'Receitas', tipo_movimento: 'Receita', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'uso_restrito', afeta_acerto: false, afeta_dre: true, visibilidade_padrao: 'resumo', ativo: true },
        { id_categoria: 'REC_EVENTO', nome: 'Renda evento', grupo: 'Receitas', tipo_movimento: 'Receita', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'evento_recomendacao', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'resumo', ativo: true },
    ],
    [V54_SHEETS.CONFIG_FONTES]: [
        { id_fonte: 'FONTE_CONTA_GU', nome: 'Conta Gustavo', tipo: 'conta', titular: 'Gustavo', ativo: true },
        { id_fonte: 'FONTE_CONTA_LU', nome: 'Conta Luana', tipo: 'conta', titular: 'Luana', ativo: true },
        { id_fonte: 'FONTE_NUBANK_GU', nome: 'Nubank Gu', tipo: 'cartao', titular: 'Gustavo', ativo: true },
        { id_fonte: 'FONTE_MP_GU', nome: 'Mercado Pago Gu', tipo: 'cartao', titular: 'Gustavo', ativo: true },
        { id_fonte: 'FONTE_NUBANK_LU', nome: 'Nubank Lu', tipo: 'cartao', titular: 'Luana', ativo: true },
        { id_fonte: 'FONTE_ALELO_GU', nome: 'Alelo Gustavo', tipo: 'beneficio', titular: 'Gustavo', ativo: true },
        { id_fonte: 'FONTE_VA_LU', nome: 'VA Luana', tipo: 'beneficio', titular: 'Luana', ativo: true },
        { id_fonte: 'FONTE_MP_COFRE_CASA', nome: 'Mercado Pago Cofrinho Casa', tipo: 'investimento', titular: 'Casal', ativo: true },
        { id_fonte: 'FONTE_NUBANK_CAIXINHA_CASA', nome: 'Nubank Caixinha Casa', tipo: 'investimento', titular: 'Casal', ativo: true },
    ],
    [V54_SHEETS.RENDAS]: [
        { id_renda: 'REN_GU_SALARIO_LIQUIDO', pessoa: 'Gustavo', tipo: 'salario_liquido', valor: 3400, recorrente: true, dia_recebimento: 5, uso_restrito: false, afeta_rateio: true, afeta_dre: true, obs: 'Recebe no 5o dia do mes; se nao for util, dia util anterior.' },
        { id_renda: 'REN_LU_SALARIO_LIQUIDO', pessoa: 'Luana', tipo: 'salario_liquido', valor: 3500, recorrente: true, dia_recebimento: 5, uso_restrito: false, afeta_rateio: true, afeta_dre: true, obs: 'Recebe no 5o dia do mes.' },
        { id_renda: 'REN_GU_ALELO', pessoa: 'Gustavo', tipo: 'beneficio_va_vr', valor: 1500, recorrente: true, dia_recebimento: 5, uso_restrito: true, afeta_rateio: false, afeta_dre: true, obs: 'Alelo cambiavel pelo app; uso 100% casal, majoritariamente mercado.' },
        { id_renda: 'REN_LU_VA', pessoa: 'Luana', tipo: 'beneficio_va', valor: 300, recorrente: true, dia_recebimento: 5, uso_restrito: true, afeta_rateio: false, afeta_dre: true, obs: 'VA Luana; uso 100% casal.' },
        { id_renda: 'REN_GU_AUX_COMBUSTIVEL', pessoa: 'Gustavo', tipo: 'auxilio_combustivel', valor: 1200, recorrente: true, dia_recebimento: 5, uso_restrito: false, afeta_rateio: true, afeta_dre: true, obs: 'Tratado como salario normal; gasto moto esperado 150-160/mes e manutencao periodica separada.' },
    ],
    [V54_SHEETS.CARTOES]: [
        { id_cartao: 'CARD_NUBANK_GU', id_fonte: 'FONTE_NUBANK_GU', nome: 'Nubank Gustavo', titular: 'Gustavo', fechamento_dia: 30, vencimento_dia: 7, limite: 10550, ativo: true },
        { id_cartao: 'CARD_MP_GU', id_fonte: 'FONTE_MP_GU', nome: 'Mercado Pago Gustavo', titular: 'Gustavo', fechamento_dia: 5, vencimento_dia: 10, limite: 10000, ativo: true },
        { id_cartao: 'CARD_NUBANK_LU', id_fonte: 'FONTE_NUBANK_LU', nome: 'Nubank Luana', titular: 'Luana', fechamento_dia: 1, vencimento_dia: 8, limite: 10000, ativo: true },
    ],
    [V54_SHEETS.PATRIMONIO_ATIVOS]: [
        { id_ativo: 'ATIVO_MP_COFRINHO_CASA', nome: 'Mercado Pago Cofrinho Casa', tipo_ativo: 'cofrinho_cdi', instituicao: 'Mercado Pago', saldo_inicial: 11469, saldo_atual: 11469, data_referencia: '2026-04-26', destinacao: 'Itens da casa', conta_reserva_emergencia: false, ativo: true },
        { id_ativo: 'ATIVO_NUBANK_CAIXINHA_CASA', nome: 'Nubank Caixinha Casa', tipo_ativo: 'caixinha_cdi', instituicao: 'Nubank', saldo_inicial: 5166, saldo_atual: 5166, data_referencia: '2026-04-26', destinacao: 'Itens da casa', conta_reserva_emergencia: false, ativo: true },
    ],
    [V54_SHEETS.DIVIDAS]: [
        { id_divida: 'DIV_CAIXA_IMOVEL', nome: 'Financiamento Caixa Casa', credor: 'Caixa', tipo: 'financiamento_imobiliario', pessoa: 'Casal', escopo: 'Casal', saldo_devedor: 254156.57, parcela_atual: 1, parcelas_total: 419, valor_parcela: 1906.20, taxa_juros: '', sistema_amortizacao: '', data_inicio: '', data_atualizacao: '2026-04-26', estrategia: 'manter_e_revisar_amortizacao', status: 'ativa', observacao: '419 meses restantes informados em 2026-04-26; total original e taxa ainda nao confirmados.' },
        { id_divida: 'DIV_VASCO', nome: 'Vasco', credor: 'Vasco', tipo: 'financiamento_clube', pessoa: 'Casal', escopo: 'Casal', saldo_devedor: 55175.41, parcela_atual: 10, parcelas_total: 74, valor_parcela: 862.12, taxa_juros: '', sistema_amortizacao: '', data_inicio: '', data_atualizacao: '2026-04-26', estrategia: 'acompanhar_antes_de_amortizar', status: 'ativa', observacao: '9 de 74 parcelas pagas em 2026-04-26.' },
    ],
    [V54_SHEETS.ORCAMENTO_FUTURO_CASA]: [
        { item: 'Luz', valor_previsto: 200, data_inicio_prevista: '2026-06-01', ativo_no_dre: false },
        { item: 'Agua', valor_previsto: 100, data_inicio_prevista: '2026-06-01', ativo_no_dre: false },
        { item: 'Internet', valor_previsto: 120, data_inicio_prevista: '2026-06-01', ativo_no_dre: false },
        { item: 'Celulares', valor_previsto: 80, data_inicio_prevista: '2026-06-01', ativo_no_dre: false },
        { item: 'Condominio', valor_previsto: 400, data_inicio_prevista: '2026-06-01', ativo_no_dre: false },
    ],
};

function validateV54SeedData(seedData = V54_SEED_DATA, headers = V54_HEADERS, keyFields = V54_SEED_KEY_FIELDS) {
    const errors = [];

    Object.entries(seedData).forEach(([sheetName, rows]) => {
        const sheetHeaders = headers[sheetName];
        const keyField = keyFields[sheetName];
        if (!sheetHeaders) errors.push(`Seed targets unknown V54 sheet: ${sheetName}`);
        if (!keyField) errors.push(`Seed sheet has no key field: ${sheetName}`);
        if (!Array.isArray(rows)) errors.push(`Seed rows must be an array: ${sheetName}`);
        if (!sheetHeaders || !keyField || !Array.isArray(rows)) return;

        const seen = new Set();
        rows.forEach((row, index) => {
            Object.keys(row).forEach((field) => {
                if (!sheetHeaders.includes(field)) errors.push(`${sheetName}[${index}] unknown field: ${field}`);
            });

            const key = row[keyField];
            if (key === undefined || key === null || String(key).trim() === '') {
                errors.push(`${sheetName}[${index}] missing key ${keyField}`);
                return;
            }
            if (seen.has(String(key))) errors.push(`${sheetName} duplicate seed key: ${key}`);
            seen.add(String(key));
        });
    });

    return { ok: errors.length === 0, errors };
}

module.exports = {
    V54_SEED_DATA,
    V54_SEED_KEY_FIELDS,
    validateV54SeedData,
};

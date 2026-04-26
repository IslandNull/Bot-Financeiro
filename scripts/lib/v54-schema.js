const V54_SHEETS = {
    CONFIG_CATEGORIAS: 'Config_Categorias',
    CONFIG_FONTES: 'Config_Fontes',
    RENDAS: 'Rendas',
    CARTOES: 'Cartoes',
    FATURAS: 'Faturas',
    COMPRAS_PARCELADAS: 'Compras_Parceladas',
    PARCELAS_AGENDA: 'Parcelas_Agenda',
    ORCAMENTO_FUTURO_CASA: 'Orcamento_Futuro_Casa',
    LANCAMENTOS_V54: 'Lancamentos_V54',
    PATRIMONIO_ATIVOS: 'Patrimonio_Ativos',
    ACERTOS_CASAL: 'Acertos_Casal',
};

const V54_HEADERS = {
    [V54_SHEETS.CONFIG_CATEGORIAS]: [
        'id_categoria',
        'nome',
        'grupo',
        'tipo_movimento',
        'classe_dre',
        'escopo',
        'comportamento_orcamento',
        'afeta_acerto',
        'afeta_dre',
        'ativo',
    ],
    [V54_SHEETS.CONFIG_FONTES]: [
        'id_fonte',
        'nome',
        'tipo',
        'titular',
        'ativo',
    ],
    [V54_SHEETS.RENDAS]: [
        'id_renda',
        'pessoa',
        'tipo',
        'valor',
        'recorrente',
        'dia_recebimento',
        'uso_restrito',
        'afeta_rateio',
        'afeta_dre',
        'obs',
    ],
    [V54_SHEETS.CARTOES]: [
        'id_cartao',
        'id_fonte',
        'nome',
        'titular',
        'fechamento_dia',
        'vencimento_dia',
        'limite',
        'ativo',
    ],
    [V54_SHEETS.FATURAS]: [
        'id_fatura',
        'id_cartao',
        'competencia',
        'data_fechamento',
        'data_vencimento',
        'valor_previsto',
        'valor_fechado',
        'valor_pago',
        'fonte_pagamento',
        'status',
    ],
    [V54_SHEETS.COMPRAS_PARCELADAS]: [
        'id_compra',
        'data_compra',
        'id_cartao',
        'descricao',
        'id_categoria',
        'valor_total',
        'parcelas_total',
        'responsavel',
        'escopo',
        'status',
    ],
    [V54_SHEETS.PARCELAS_AGENDA]: [
        'id_parcela',
        'id_compra',
        'numero_parcela',
        'competencia',
        'valor_parcela',
        'id_fatura',
        'status',
        'id_lancamento',
    ],
    [V54_SHEETS.ORCAMENTO_FUTURO_CASA]: [
        'item',
        'valor_previsto',
        'data_inicio_prevista',
        'ativo_no_dre',
    ],
    [V54_SHEETS.LANCAMENTOS_V54]: [
        'id_lancamento',
        'data',
        'competencia',
        'tipo_evento',
        'id_categoria',
        'valor',
        'id_fonte',
        'pessoa',
        'escopo',
        'id_cartao',
        'id_fatura',
        'id_compra',
        'id_parcela',
        'afeta_dre',
        'afeta_acerto',
        'descricao',
        'created_at',
    ],
    [V54_SHEETS.PATRIMONIO_ATIVOS]: [
        'id_ativo',
        'nome',
        'tipo_ativo',
        'instituicao',
        'saldo_inicial',
        'saldo_atual',
        'data_referencia',
        'destinacao',
        'conta_reserva_emergencia',
        'ativo',
    ],
    [V54_SHEETS.ACERTOS_CASAL]: [
        'competencia',
        'pessoa',
        'quota_esperada',
        'valor_pago_casal',
        'diferenca',
        'status',
        'observacao',
    ],
};

const V54_ENUMS = {
    escopo: ['Casal', 'Gustavo', 'Luana', 'Fora orcamento'],
    tipo_fonte: ['conta', 'cartao', 'beneficio', 'dinheiro', 'investimento'],
    classe_dre_excluded_from_operational: ['Investimento', 'Reserva', 'Fatura', 'Transferencia', 'Patrimonio'],
};

function getV54SheetNames() {
    return Object.values(V54_SHEETS);
}

function getV54Headers(sheetName) {
    const headers = V54_HEADERS[sheetName];
    if (!headers) throw new Error(`Unknown V54 sheet: ${sheetName}`);
    return [...headers];
}

function validateV54Schema() {
    const errors = [];
    const names = getV54SheetNames();

    names.forEach((name) => {
        const headers = V54_HEADERS[name];
        if (!headers || headers.length === 0) errors.push(`${name} has no headers`);
        const duplicates = headers.filter((header, index) => headers.indexOf(header) !== index);
        if (duplicates.length > 0) errors.push(`${name} duplicate headers: ${duplicates.join(', ')}`);
    });

    const configFontes = V54_HEADERS[V54_SHEETS.CONFIG_FONTES];
    ['fechamento_dia', 'vencimento_dia', 'limite'].forEach((field) => {
        if (configFontes.includes(field)) {
            errors.push(`Config_Fontes must not duplicate card-specific field ${field}`);
        }
    });

    const cartoes = V54_HEADERS[V54_SHEETS.CARTOES];
    ['id_fonte', 'fechamento_dia', 'vencimento_dia', 'limite'].forEach((field) => {
        if (!cartoes.includes(field)) errors.push(`Cartoes must include ${field}`);
    });

    if (!V54_HEADERS[V54_SHEETS.PARCELAS_AGENDA].includes('id_parcela')) {
        errors.push('Parcelas_Agenda must include stable id_parcela');
    }

    if (!V54_HEADERS[V54_SHEETS.LANCAMENTOS_V54].includes('id_parcela')) {
        errors.push('Lancamentos_V54 must reference id_parcela');
    }

    return { ok: errors.length === 0, errors };
}

module.exports = {
    V54_ENUMS,
    V54_HEADERS,
    V54_SHEETS,
    getV54Headers,
    getV54SheetNames,
    validateV54Schema,
};

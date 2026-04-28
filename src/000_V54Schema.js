// ============================================================
// V54 SCHEMA MIRROR - Apps Script runtime
// Node authority remains scripts/lib/v54-schema.js.
// Keep this mirror in parity through local schema/setup tests.
// ============================================================

var V54_SHEETS = {
    CONFIG_CATEGORIAS: 'Config_Categorias',
    CONFIG_FONTES: 'Config_Fontes',
    RENDAS: 'Rendas',
    CARTOES: 'Cartoes',
    FATURAS: 'Faturas',
    PAGAMENTOS_FATURA: 'Pagamentos_Fatura',
    IDEMPOTENCY_LOG: 'Idempotency_Log',
    TELEGRAM_SEND_LOG: 'Telegram_Send_Log',
    COMPRAS_PARCELADAS: 'Compras_Parceladas',
    PARCELAS_AGENDA: 'Parcelas_Agenda',
    ORCAMENTO_FUTURO_CASA: 'Orcamento_Futuro_Casa',
    LANCAMENTOS_V54: 'Lancamentos_V54',
    PATRIMONIO_ATIVOS: 'Patrimonio_Ativos',
    DIVIDAS: 'Dividas',
    ACERTOS_CASAL: 'Acertos_Casal',
    FECHAMENTOS_MENSAIS: 'Fechamentos_Mensais',
};

var V54_HEADERS = {
    Config_Categorias: ['id_categoria', 'nome', 'grupo', 'tipo_movimento', 'classe_dre', 'escopo', 'comportamento_orcamento', 'afeta_acerto', 'afeta_dre', 'visibilidade_padrao', 'ativo'],
    Config_Fontes: ['id_fonte', 'nome', 'tipo', 'titular', 'ativo'],
    Rendas: ['id_renda', 'pessoa', 'tipo', 'valor', 'recorrente', 'dia_recebimento', 'uso_restrito', 'afeta_rateio', 'afeta_dre', 'obs'],
    Cartoes: ['id_cartao', 'id_fonte', 'nome', 'titular', 'fechamento_dia', 'vencimento_dia', 'limite', 'ativo'],
    Faturas: ['id_fatura', 'id_cartao', 'competencia', 'data_fechamento', 'data_vencimento', 'valor_previsto', 'valor_fechado', 'valor_pago', 'fonte_pagamento', 'status'],
    Pagamentos_Fatura: ['id_pagamento', 'id_fatura', 'data_pagamento', 'valor_pago', 'id_fonte', 'pessoa', 'escopo', 'afeta_dre', 'afeta_acerto', 'afeta_patrimonio', 'status', 'observacao', 'created_at'],
    Idempotency_Log: ['idempotency_key', 'source', 'telegram_update_id', 'telegram_message_id', 'chat_id', 'payload_hash', 'status', 'result_ref', 'created_at', 'updated_at', 'error_code', 'observacao'],
    Telegram_Send_Log: ['id_notificacao', 'created_at', 'route', 'chat_id', 'phase', 'status', 'status_code', 'error', 'result_ref', 'id_lancamento', 'idempotency_key', 'text_preview', 'sent_at'],
    Compras_Parceladas: ['id_compra', 'data_compra', 'id_cartao', 'descricao', 'id_categoria', 'valor_total', 'parcelas_total', 'responsavel', 'escopo', 'visibilidade', 'status'],
    Parcelas_Agenda: ['id_parcela', 'id_compra', 'numero_parcela', 'competencia', 'valor_parcela', 'id_fatura', 'status', 'id_lancamento'],
    Orcamento_Futuro_Casa: ['item', 'valor_previsto', 'data_inicio_prevista', 'ativo_no_dre'],
    Lancamentos_V54: ['id_lancamento', 'data', 'competencia', 'tipo_evento', 'id_categoria', 'valor', 'id_fonte', 'pessoa', 'escopo', 'id_cartao', 'id_fatura', 'id_compra', 'id_parcela', 'afeta_dre', 'afeta_acerto', 'afeta_patrimonio', 'visibilidade', 'descricao', 'created_at'],
    Patrimonio_Ativos: ['id_ativo', 'nome', 'tipo_ativo', 'instituicao', 'saldo_inicial', 'saldo_atual', 'data_referencia', 'destinacao', 'conta_reserva_emergencia', 'ativo'],
    Dividas: ['id_divida', 'nome', 'credor', 'tipo', 'pessoa', 'escopo', 'saldo_devedor', 'parcela_atual', 'parcelas_total', 'valor_parcela', 'taxa_juros', 'sistema_amortizacao', 'data_inicio', 'data_atualizacao', 'estrategia', 'status', 'observacao'],
    Acertos_Casal: ['competencia', 'pessoa', 'quota_esperada', 'valor_pago_casal', 'diferenca', 'status', 'observacao'],
    Fechamentos_Mensais: ['competencia', 'status', 'receitas_operacionais', 'despesas_operacionais', 'saldo_operacional', 'faturas_60d', 'parcelas_futuras', 'taxa_poupanca', 'reserva_total', 'patrimonio_liquido', 'acerto_status', 'decisao_1', 'decisao_2', 'decisao_3', 'created_at', 'closed_at'],
};

function getV54Schema() {
    var clone = {};
    Object.keys(V54_HEADERS).forEach(function(sheetName) {
        clone[sheetName] = V54_HEADERS[sheetName].slice();
    });
    return clone;
}

function getV54SheetNames() {
    return Object.keys(V54_HEADERS);
}

function getV54Headers(sheetName) {
    var headers = V54_HEADERS[sheetName];
    if (!headers) throw new Error('Unknown V54 sheet: ' + sheetName);
    return headers.slice();
}

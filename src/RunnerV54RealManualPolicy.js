// ============================================================
// RUNNER V54 REAL MANUAL POLICY - reviewed diagnostics contract
// ============================================================
// Defines the pre-run contract for future real_manual execution. This file
// intentionally does not route web traffic, send Telegram messages, call OpenAI,
// or choose real spreadsheet services by default.

var V54_REAL_MANUAL_REQUIRED_SHEETS = [
    'Config_Categorias',
    'Config_Fontes',
    'Rendas',
    'Cartoes',
    'Faturas',
    'Pagamentos_Fatura',
    'Idempotency_Log',
    'Compras_Parceladas',
    'Parcelas_Agenda',
    'Orcamento_Futuro_Casa',
    'Lancamentos_V54',
    'Patrimonio_Ativos',
    'Dividas',
    'Acertos_Casal',
    'Fechamentos_Mensais',
];

var V54_REAL_MANUAL_HEADERS = {
    Config_Categorias: ['id_categoria', 'nome', 'grupo', 'tipo_movimento', 'classe_dre', 'escopo', 'comportamento_orcamento', 'afeta_acerto', 'afeta_dre', 'visibilidade_padrao', 'ativo'],
    Config_Fontes: ['id_fonte', 'nome', 'tipo', 'titular', 'ativo'],
    Rendas: ['id_renda', 'pessoa', 'tipo', 'valor', 'recorrente', 'dia_recebimento', 'uso_restrito', 'afeta_rateio', 'afeta_dre', 'obs'],
    Cartoes: ['id_cartao', 'id_fonte', 'nome', 'titular', 'fechamento_dia', 'vencimento_dia', 'limite', 'ativo'],
    Faturas: ['id_fatura', 'id_cartao', 'competencia', 'data_fechamento', 'data_vencimento', 'valor_previsto', 'valor_fechado', 'valor_pago', 'fonte_pagamento', 'status'],
    Pagamentos_Fatura: ['id_pagamento', 'id_fatura', 'data_pagamento', 'valor_pago', 'id_fonte', 'pessoa', 'escopo', 'afeta_dre', 'afeta_acerto', 'afeta_patrimonio', 'status', 'observacao', 'created_at'],
    Idempotency_Log: ['idempotency_key', 'source', 'telegram_update_id', 'telegram_message_id', 'chat_id', 'payload_hash', 'status', 'result_ref', 'created_at', 'updated_at', 'error_code', 'observacao'],
    Compras_Parceladas: ['id_compra', 'data_compra', 'id_cartao', 'descricao', 'id_categoria', 'valor_total', 'parcelas_total', 'responsavel', 'escopo', 'visibilidade', 'status'],
    Parcelas_Agenda: ['id_parcela', 'id_compra', 'numero_parcela', 'competencia', 'valor_parcela', 'id_fatura', 'status', 'id_lancamento'],
    Orcamento_Futuro_Casa: ['item', 'valor_previsto', 'data_inicio_prevista', 'ativo_no_dre'],
    Lancamentos_V54: ['id_lancamento', 'data', 'competencia', 'tipo_evento', 'id_categoria', 'valor', 'id_fonte', 'pessoa', 'escopo', 'id_cartao', 'id_fatura', 'id_compra', 'id_parcela', 'afeta_dre', 'afeta_acerto', 'afeta_patrimonio', 'visibilidade', 'descricao', 'created_at'],
    Patrimonio_Ativos: ['id_ativo', 'nome', 'tipo_ativo', 'instituicao', 'saldo_inicial', 'saldo_atual', 'data_referencia', 'destinacao', 'conta_reserva_emergencia', 'ativo'],
    Dividas: ['id_divida', 'nome', 'credor', 'tipo', 'pessoa', 'escopo', 'saldo_devedor', 'parcela_atual', 'parcelas_total', 'valor_parcela', 'taxa_juros', 'sistema_amortizacao', 'data_inicio', 'data_atualizacao', 'estrategia', 'status', 'observacao'],
    Acertos_Casal: ['competencia', 'pessoa', 'quota_esperada', 'valor_pago_casal', 'diferenca', 'status', 'observacao'],
    Fechamentos_Mensais: ['competencia', 'status', 'receitas_operacionais', 'despesas_operacionais', 'saldo_operacional', 'faturas_60d', 'parcelas_futuras', 'taxa_poupanca', 'reserva_total', 'patrimonio_liquido', 'acerto_status', 'decisao_1', 'decisao_2', 'decisao_3', 'created_at', 'closed_at'],
};

function evaluateV54RealManualPolicy(input, options) {
    var deps = normalizeV54RealManualPolicyDeps_(options);
    var source = input && typeof input === 'object' ? input : {};
    var checklist = source.checklist && typeof source.checklist === 'object' ? source.checklist : {};
    var diagnostics = source.diagnostics && typeof source.diagnostics === 'object' ? source.diagnostics : {};
    var errors = [];
    var passed = [];

    requireV54RealManualPolicyCheck_(source.mode === 'real_manual', errors, passed, 'V54_REAL_MANUAL_MODE_REQUIRED', 'mode', 'target mode is real_manual');
    requireV54RealManualPolicyCheck_(checklist.realRunApproved === true, errors, passed, 'V54_REAL_MANUAL_APPROVAL_REQUIRED', 'checklist.realRunApproved', 'realRunApproved is true');
    requireV54RealManualPolicyCheck_(hasV54RealManualOperator_(checklist), errors, passed, 'V54_REAL_MANUAL_OPERATOR_REQUIRED', 'checklist.operator', 'operator identity or label is present');
    requireV54RealManualPolicyCheck_(checklist.doPostUnchanged === true, errors, passed, 'V54_REAL_MANUAL_DOPOST_UNCHANGED_REQUIRED', 'checklist.doPostUnchanged', 'doPost unchanged and V54 not routed');
    requireV54RealManualPolicyCheck_(isV54RealManualDoGetBlocked_(checklist), errors, passed, 'V54_REAL_MANUAL_DOGET_BLOCK_REQUIRED', 'checklist.doGetV54GateNotExposed', 'doGet does not expose V54 gate');
    requireV54RealManualPolicyCheck_(checklist.telegramSendDisabled === true, errors, passed, 'V54_REAL_MANUAL_TELEGRAM_DISABLED_REQUIRED', 'checklist.telegramSendDisabled', 'Telegram send disabled');
    requireV54RealManualPolicyCheck_(isV54RealManualSyntheticInput_(source.update, checklist), errors, passed, 'V54_REAL_MANUAL_SYNTHETIC_INPUT_REQUIRED', 'update', 'input update is synthetic/manual');
    requireV54RealManualPolicyCheck_(!isV54RealManualWebEventLike_(source.update) && !isV54RealManualWebEventLike_(source), errors, passed, 'V54_REAL_MANUAL_WEB_EVENT_REJECTED', 'update', 'web-event-shaped input rejected');
    requireV54RealManualPolicyCheck_(hasV54RealManualPriorDryRun_(checklist, diagnostics), errors, passed, 'V54_REAL_MANUAL_PRIOR_DRY_RUN_REQUIRED', 'checklist.priorDryRunAcknowledged', 'dry-run or fake-shadow was executed first');
    requireV54RealManualPolicyCheck_(hasV54RealManualSnapshotAck_(checklist, diagnostics), errors, passed, 'V54_REAL_MANUAL_SNAPSHOT_ACK_REQUIRED', 'checklist.snapshotAcknowledged', 'snapshot/export instruction acknowledged before mutation');

    var sheetDiagnostics = evaluateV54RealManualSheets_(deps, errors);
    passed = passed.concat(sheetDiagnostics.passed);

    var contextDiagnostic = evaluateV54RealManualParserContext_(deps, source, diagnostics, errors);
    if (contextDiagnostic) passed.push(contextDiagnostic);

    return {
        ok: errors.length === 0,
        status: errors.length === 0 ? 'real_manual_policy_passed' : 'real_manual_policy_blocked',
        mode: String(source.mode || ''),
        diagnostics: {
            passed: passed,
            requiredSheets: V54_REAL_MANUAL_REQUIRED_SHEETS.slice(),
        },
        errors: normalizeV54RealManualPolicyErrors_(errors),
    };
}

function evaluateRunnerV54RealManualPolicy(input, options) {
    return evaluateV54RealManualPolicy(input, options);
}

function normalizeV54RealManualPolicyDeps_(options) {
    var source = options || {};
    return {
        getSpreadsheet: typeof source.getSpreadsheet === 'function' ? source.getSpreadsheet : null,
        getParserContext: typeof source.getParserContext === 'function' ? source.getParserContext : null,
        now: typeof source.now === 'function' ? source.now : function() { return new Date().toISOString(); },
    };
}

function evaluateV54RealManualSheets_(deps, errors) {
    var passed = [];
    if (!deps.getSpreadsheet) {
        errors.push(makeV54RealManualPolicyError_('V54_REAL_MANUAL_SPREADSHEET_DIAGNOSTIC_REQUIRED', 'getSpreadsheet', 'Real manual policy requires injected spreadsheet diagnostics.'));
        return { passed: passed };
    }

    var spreadsheet;
    try {
        spreadsheet = deps.getSpreadsheet();
    } catch (error) {
        errors.push(makeV54RealManualPolicyError_('V54_REAL_MANUAL_SPREADSHEET_DIAGNOSTIC_FAILED', 'getSpreadsheet', 'Spreadsheet diagnostics failed safely.'));
        return { passed: passed };
    }

    V54_REAL_MANUAL_REQUIRED_SHEETS.forEach(function(sheetName) {
        var sheet = spreadsheet && typeof spreadsheet.getSheetByName === 'function' ? spreadsheet.getSheetByName(sheetName) : null;
        if (!sheet) {
            errors.push(makeV54RealManualPolicyError_('V54_REAL_MANUAL_REQUIRED_SHEET_MISSING', sheetName, sheetName + ' sheet diagnostic failed.'));
            return;
        }
        passed.push('sheet_present:' + sheetName);

        var headerError = validateV54RealManualSheetHeaders_(sheet, sheetName);
        if (headerError) {
            errors.push(headerError);
            return;
        }
        passed.push('headers_match:' + sheetName);
    });

    return { passed: passed };
}

function validateV54RealManualSheetHeaders_(sheet, sheetName) {
    var expected = V54_REAL_MANUAL_HEADERS[sheetName] || [];
    var headers;
    try {
        headers = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
    } catch (error) {
        return makeV54RealManualPolicyError_('V54_REAL_MANUAL_HEADER_READ_FAILED', sheetName, sheetName + ' headers could not be read.');
    }
    for (var i = 0; i < expected.length; i++) {
        if (headers[i] !== expected[i]) {
            return makeV54RealManualPolicyError_('V54_REAL_MANUAL_HEADER_MISMATCH', sheetName, sheetName + ' headers do not match the V54 schema.');
        }
    }
    return null;
}

function evaluateV54RealManualParserContext_(deps, input, diagnostics, errors) {
    if (diagnostics.parserContextReadable === true && !deps.getParserContext) {
        return 'parser_context_readable:acknowledged';
    }
    if (!deps.getParserContext) {
        errors.push(makeV54RealManualPolicyError_('V54_REAL_MANUAL_PARSER_CONTEXT_DIAGNOSTIC_REQUIRED', 'getParserContext', 'Real manual policy requires parser context diagnostics.'));
        return '';
    }
    try {
        var result = deps.getParserContext({
            update: input.update || null,
            referenceDate: diagnostics.referenceDate || deps.now().slice(0, 10),
        }, {
            getSpreadsheet: deps.getSpreadsheet,
            now: deps.now,
        });
        if (!result || result.ok !== true) {
            errors.push(makeV54RealManualPolicyError_('V54_REAL_MANUAL_PARSER_CONTEXT_UNREADABLE', 'getParserContext', 'Parser context could not be read safely.'));
            return '';
        }
        return 'parser_context_readable';
    } catch (error) {
        errors.push(makeV54RealManualPolicyError_('V54_REAL_MANUAL_PARSER_CONTEXT_UNREADABLE', 'getParserContext', 'Parser context could not be read safely.'));
        return '';
    }
}

function requireV54RealManualPolicyCheck_(condition, errors, passed, code, field, passedLabel) {
    if (condition) {
        passed.push(passedLabel);
        return;
    }
    errors.push(makeV54RealManualPolicyError_(code, field, passedLabel + ' is required.'));
}

function hasV54RealManualOperator_(checklist) {
    return Boolean(String(checklist.operator || checklist.operatorLabel || checklist.operatorIdentity || '').trim());
}

function isV54RealManualDoGetBlocked_(checklist) {
    return checklist.doGetV54GateNotExposed === true || checklist.doGetDoesNotExposeV54Gate === true;
}

function isV54RealManualSyntheticInput_(update, checklist) {
    if (checklist.syntheticManualInput === true) return true;
    if (!update || typeof update !== 'object') return false;
    return update.synthetic_manual === true || update.manual === true || update.source === 'manual_synthetic';
}

function hasV54RealManualPriorDryRun_(checklist, diagnostics) {
    return checklist.priorDryRunAcknowledged === true || checklist.fakeShadowExecutedFirst === true || diagnostics.priorDryRunExecuted === true || diagnostics.fakeShadowExecuted === true;
}

function hasV54RealManualSnapshotAck_(checklist, diagnostics) {
    return checklist.snapshotAcknowledged === true || checklist.snapshotExportAcknowledged === true || diagnostics.snapshotAcknowledged === true;
}

function isV54RealManualWebEventLike_(input) {
    if (!input || typeof input !== 'object') return false;
    if (input.postData && typeof input.postData === 'object') return true;
    if (input.parameter && typeof input.parameter === 'object') return true;
    if (input.parameters && typeof input.parameters === 'object') return true;
    if (typeof input.queryString === 'string') return true;
    if (input.contextPath !== undefined) return true;
    if (input.contentLength !== undefined && input.postData) return true;
    return false;
}

function normalizeV54RealManualPolicyErrors_(errors) {
    var source = Array.isArray(errors) ? errors : [];
    if (source.length > 0) return source;
    return [makeV54RealManualPolicyError_('V54_REAL_MANUAL_POLICY_BLOCKED', 'policy', 'Real manual policy blocked execution.')];
}

function makeV54RealManualPolicyError_(code, field, message) {
    return {
        code: String(code || 'V54_REAL_MANUAL_POLICY_ERROR'),
        field: String(field || 'policy'),
        message: String(message || 'Real manual policy failed safely.'),
    };
}

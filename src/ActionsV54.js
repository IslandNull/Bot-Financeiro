// ============================================================
// ACTIONS V54 - MVP local/fake-first
// ============================================================
// This file is intentionally not wired into doPost/routing yet.
// Temporary duplication: Apps Script does not consume Node/CommonJS modules directly,
// so the Lancamentos_V54 headers and ParsedEntryV54 validation rules are mirrored
// here and covered by local parity tests against scripts/lib/v54-schema.js.

var V54_LANCAMENTOS_SHEET = 'Lancamentos_V54';
var V54_ACTIONS_MVP_SUPPORTED_EVENTS = ['despesa', 'receita', 'transferencia', 'aporte'];
var V54_ACTIONS_UNSUPPORTED_EVENTS = ['compra_cartao', 'compra_parcelada', 'pagamento_fatura', 'divida_pagamento', 'ajuste'];
var V54_LANCAMENTOS_HEADERS = [
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
    'afeta_patrimonio',
    'visibilidade',
    'descricao',
    'created_at',
];

var V54_ALLOWED_TIPO_EVENTO = [
    'despesa',
    'receita',
    'transferencia',
    'compra_cartao',
    'compra_parcelada',
    'pagamento_fatura',
    'ajuste',
    'aporte',
    'divida_pagamento',
];
var V54_ALLOWED_PESSOA = ['Gustavo', 'Luana', 'Casal'];
var V54_ALLOWED_ESCOPO = ['Gustavo', 'Luana', 'Casal'];
var V54_ALLOWED_VISIBILIDADE = ['detalhada', 'resumo', 'privada'];
var V54_ALLOWED_FIELDS = [
    'tipo_evento',
    'data',
    'competencia',
    'valor',
    'descricao',
    'pessoa',
    'escopo',
    'visibilidade',
    'id_categoria',
    'id_fonte',
    'id_cartao',
    'id_fatura',
    'id_compra',
    'id_parcela',
    'afeta_dre',
    'afeta_acerto',
    'afeta_patrimonio',
    'confidence',
    'raw_text',
    'warnings',
    'parcelamento',
];

function recordEntryV54(parsedEntry, options) {
    var deps = normalizeActionsV54Deps_(options);
    var input = cloneV54PlainObject_(parsedEntry);

    if (input && V54_ACTIONS_UNSUPPORTED_EVENTS.indexOf(input.tipo_evento) !== -1) {
        return makeActionsV54Failure_('UNSUPPORTED_EVENT', 'tipo_evento', 'Phase 3A MVP does not support ' + input.tipo_evento + '.', null);
    }

    if (!input || V54_ACTIONS_MVP_SUPPORTED_EVENTS.indexOf(input.tipo_evento) === -1) {
        return makeActionsV54Failure_('UNSUPPORTED_EVENT', 'tipo_evento', 'Phase 3A MVP supports only despesa, receita, transferencia, and aporte.', null);
    }

    return deps.withLock('recordEntryV54', function() {
        var mapped = mapParsedEntryToLancamentoV54_(input, {
            now: deps.now,
            makeId: deps.makeId,
        });

        if (!mapped.ok) {
            return makeActionsV54FailureFromMapped_(mapped);
        }

        var spreadsheet = deps.getSpreadsheet();
        var sheet = spreadsheet && spreadsheet.getSheetByName(V54_LANCAMENTOS_SHEET);
        if (!sheet) {
            return makeActionsV54Failure_('MISSING_SHEET', V54_LANCAMENTOS_SHEET, 'Lancamentos_V54 sheet was not found.', mapped);
        }

        var headerCheck = validateLancamentosV54SheetHeaders_(sheet);
        if (!headerCheck.ok) {
            return makeActionsV54Failure_(headerCheck.code, headerCheck.field, headerCheck.message, mapped);
        }

        if (mapped.rowValues.length !== V54_LANCAMENTOS_HEADERS.length) {
            return makeActionsV54Failure_('ROW_WIDTH_MISMATCH', 'rowValues', 'Lancamentos_V54 row must have exactly 19 columns.', mapped);
        }

        var rowNumber = sheet.getLastRow() + 1;
        sheet.getRange(rowNumber, 1, 1, V54_LANCAMENTOS_HEADERS.length).setValues([mapped.rowValues]);

        return {
            ok: true,
            sheet: V54_LANCAMENTOS_SHEET,
            rowNumber: rowNumber,
            id_lancamento: mapped.rowObject.id_lancamento,
            rowObject: mapped.rowObject,
            rowValues: mapped.rowValues,
            errors: [],
        };
    });
}

function normalizeActionsV54Deps_(options) {
    var source = options || {};
    return {
        getSpreadsheet: typeof source.getSpreadsheet === 'function'
            ? source.getSpreadsheet
            : function() {
                _loadSecrets();
                return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
            },
        withLock: typeof source.withLock === 'function'
            ? source.withLock
            : function(label, fn) {
                return withScriptLock(label, fn);
            },
        now: typeof source.now === 'function'
            ? source.now
            : function() {
                return new Date().toISOString();
            },
        makeId: typeof source.makeId === 'function'
            ? source.makeId
            : makeDefaultLancamentoV54Id_,
    };
}

function validateLancamentosV54SheetHeaders_(sheet) {
    var headers = sheet.getRange(1, 1, 1, V54_LANCAMENTOS_HEADERS.length).getValues()[0];
    for (var i = 0; i < V54_LANCAMENTOS_HEADERS.length; i++) {
        if (headers[i] !== V54_LANCAMENTOS_HEADERS[i]) {
            return {
                ok: false,
                code: 'HEADER_MISMATCH',
                field: V54_LANCAMENTOS_SHEET,
                message: 'Lancamentos_V54 headers do not match the V54 schema.',
            };
        }
    }
    return { ok: true };
}

function mapParsedEntryToLancamentoV54_(input, options) {
    var validation = validateParsedEntryV54ForActions_(input);
    if (!validation.ok) {
        return {
            ok: false,
            errors: validation.errors,
            validation: validation,
            headers: getLancamentosV54Headers_(),
            rowObject: null,
            rowValues: [],
        };
    }

    var deps = options || {};
    var entry = validation.normalized;
    var rowObject = {
        id_lancamento: deps.makeId(entry),
        data: entry.data,
        competencia: entry.competencia,
        tipo_evento: entry.tipo_evento,
        id_categoria: optionalV54String_(entry.id_categoria),
        valor: entry.valor,
        id_fonte: optionalV54String_(entry.id_fonte),
        pessoa: entry.pessoa,
        escopo: entry.escopo,
        id_cartao: optionalV54String_(entry.id_cartao),
        id_fatura: optionalV54String_(entry.id_fatura),
        id_compra: optionalV54String_(entry.id_compra),
        id_parcela: optionalV54String_(entry.id_parcela),
        afeta_dre: entry.afeta_dre,
        afeta_acerto: entry.afeta_acerto,
        afeta_patrimonio: entry.afeta_patrimonio,
        visibilidade: entry.visibilidade,
        descricao: entry.descricao,
        created_at: deps.now(),
    };
    var headers = getLancamentosV54Headers_();
    var rowValues = headers.map(function(header) {
        return rowObject[header] === undefined || rowObject[header] === null ? '' : rowObject[header];
    });

    return {
        ok: rowValues.length === headers.length,
        errors: rowValues.length === headers.length ? [] : [makeV54ContractError_('ROW_WIDTH_MISMATCH', 'rowValues', 'Lancamentos_V54 row width mismatch.')],
        validation: validation,
        headers: headers,
        rowObject: rowObject,
        rowValues: rowValues,
    };
}

function getLancamentosV54Headers_() {
    return V54_LANCAMENTOS_HEADERS.slice();
}

function makeDefaultLancamentoV54Id_(entry) {
    var randomPart = Math.floor(Math.random() * 1000000000).toString(36).toUpperCase();
    var stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 17);
    return 'LAN_V54_' + String(entry.tipo_evento || 'entry').toUpperCase() + '_' + stamp + '_' + randomPart;
}

function validateParsedEntryV54ForActions_(input) {
    var errors = [];
    var normalized = {};

    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return {
            ok: false,
            errors: [makeV54ContractError_('ENTRY_NOT_OBJECT', 'entry', 'ParsedEntryV54 must be an object.')],
            normalized: normalized,
        };
    }

    Object.keys(input).forEach(function(field) {
        if (V54_ALLOWED_FIELDS.indexOf(field) === -1) {
            errors.push(makeV54ContractError_('UNKNOWN_FIELD', field, 'Unknown ParsedEntryV54 field: ' + field));
        }
    });

    normalizeV54StringField_(input, normalized, errors, 'tipo_evento', { required: true, allowed: V54_ALLOWED_TIPO_EVENTO });
    normalizeV54StringField_(input, normalized, errors, 'data', { required: true, pattern: /^\d{4}-\d{2}-\d{2}$/ });
    normalizeV54StringField_(input, normalized, errors, 'competencia', { required: true, pattern: /^\d{4}-\d{2}$/ });
    normalizeV54StringField_(input, normalized, errors, 'descricao', { required: true });
    normalizeV54StringField_(input, normalized, errors, 'pessoa', { required: true, allowed: V54_ALLOWED_PESSOA });
    normalizeV54StringField_(input, normalized, errors, 'escopo', { required: true, allowed: V54_ALLOWED_ESCOPO });
    normalizeV54StringField_(input, normalized, errors, 'visibilidade', { required: true, allowed: V54_ALLOWED_VISIBILIDADE });

    ['id_categoria', 'id_fonte', 'id_cartao', 'id_fatura', 'id_compra', 'id_parcela', 'raw_text'].forEach(function(field) {
        normalizeV54StringField_(input, normalized, errors, field, { required: false });
    });

    normalizeV54PositiveNumberField_(input, normalized, errors, 'valor', { required: true });
    ['afeta_dre', 'afeta_acerto', 'afeta_patrimonio'].forEach(function(field) {
        normalizeV54BooleanField_(input, normalized, errors, field, { required: true });
    });
    validateV54EventRules_(normalized, errors);

    return {
        ok: errors.length === 0,
        errors: errors,
        normalized: normalized,
    };
}

function validateV54EventRules_(normalized, errors) {
    var tipo = normalized.tipo_evento;
    if (!tipo) return;

    if (normalized.afeta_dre === true && !normalized.id_categoria) {
        errors.push(makeV54ContractError_('REQUIRED_FOR_DRE', 'id_categoria', 'id_categoria is required when afeta_dre is true.'));
    }

    if (['despesa', 'receita', 'divida_pagamento'].indexOf(tipo) !== -1 && !normalized.id_categoria) {
        errors.push(makeV54ContractError_('REQUIRED_FOR_EVENT', 'id_categoria', 'id_categoria is required for ' + tipo + '.'));
    }

    if (['despesa', 'receita', 'transferencia', 'aporte', 'pagamento_fatura', 'divida_pagamento'].indexOf(tipo) !== -1 && !normalized.id_fonte) {
        errors.push(makeV54ContractError_('REQUIRED_FOR_EVENT', 'id_fonte', 'id_fonte is required for ' + tipo + '.'));
    }

    if (tipo === 'transferencia' || tipo === 'aporte') {
        if (normalized.afeta_dre !== false) {
            errors.push(makeV54ContractError_('INVALID_DRE_FLAG', 'afeta_dre', tipo + ' must not affect DRE.'));
        }
    }
}

function normalizeV54StringField_(input, normalized, errors, field, options) {
    var value = input[field];
    var required = Boolean(options && options.required);

    if (value === undefined || value === null) {
        if (required) errors.push(makeV54ContractError_('REQUIRED_FIELD', field, field + ' is required.'));
        return;
    }

    if (typeof value !== 'string') {
        errors.push(makeV54ContractError_('INVALID_STRING', field, field + ' must be a string.'));
        return;
    }

    var trimmed = value.trim();
    if (!trimmed) {
        if (required) errors.push(makeV54ContractError_('REQUIRED_FIELD', field, field + ' is required.'));
        return;
    }

    if (options && options.allowed && options.allowed.indexOf(trimmed) === -1) {
        errors.push(makeV54ContractError_('INVALID_ENUM', field, field + ' has invalid value.'));
    }

    if (options && options.pattern && !options.pattern.test(trimmed)) {
        errors.push(makeV54ContractError_('INVALID_FORMAT', field, field + ' has invalid format.'));
    }

    normalized[field] = trimmed;
}

function normalizeV54PositiveNumberField_(input, normalized, errors, field, options) {
    var value = input[field];
    var required = Boolean(options && options.required);

    if (value === undefined || value === null || value === '') {
        if (required) errors.push(makeV54ContractError_('REQUIRED_FIELD', field, field + ' is required.'));
        return;
    }

    var numeric = parseV54ContractNumber_(value, field, errors);
    if (numeric === null) return;
    if (numeric <= 0) {
        errors.push(makeV54ContractError_('INVALID_POSITIVE_NUMBER', field, field + ' must be greater than zero.'));
    }
    normalized[field] = numeric;
}

function normalizeV54BooleanField_(input, normalized, errors, field, options) {
    var value = input[field];
    var required = Boolean(options && options.required);

    if (value === undefined || value === null) {
        if (required) errors.push(makeV54ContractError_('REQUIRED_FIELD', field, field + ' is required.'));
        return;
    }

    if (typeof value !== 'boolean') {
        errors.push(makeV54ContractError_('INVALID_BOOLEAN', field, field + ' must be boolean.'));
        return;
    }

    normalized[field] = value;
}

function parseV54ContractNumber_(value, field, errors) {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            errors.push(makeV54ContractError_('INVALID_NUMBER', field, field + ' must be a finite number.'));
            return null;
        }
        return value;
    }

    if (typeof value === 'string') {
        var trimmed = value.trim();
        if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
        if (trimmed.indexOf(',') !== -1) {
            errors.push(makeV54ContractError_('AMBIGUOUS_MONEY_STRING', field, field + ' must use a dot decimal separator, not comma.'));
            return null;
        }
    }

    errors.push(makeV54ContractError_('INVALID_NUMBER', field, field + ' must be a number or safe numeric string.'));
    return null;
}

function optionalV54String_(value) {
    return value === undefined || value === null ? '' : value;
}

function makeActionsV54Failure_(code, field, message, mapped) {
    return {
        ok: false,
        sheet: V54_LANCAMENTOS_SHEET,
        rowNumber: null,
        id_lancamento: '',
        rowObject: mapped && mapped.rowObject ? mapped.rowObject : null,
        rowValues: mapped && mapped.rowValues ? mapped.rowValues : [],
        errors: [makeV54ContractError_(code, field, message)],
    };
}

function makeActionsV54FailureFromMapped_(mapped) {
    return {
        ok: false,
        sheet: V54_LANCAMENTOS_SHEET,
        rowNumber: null,
        id_lancamento: '',
        rowObject: mapped.rowObject,
        rowValues: mapped.rowValues,
        errors: mapped.errors,
    };
}

function makeV54ContractError_(code, field, message) {
    return { code: code, field: field, message: message };
}

function cloneV54PlainObject_(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
    return JSON.parse(JSON.stringify(input));
}

// ============================================================
// PARSER V54 CONTEXT - safe canonical context provider
// ============================================================
// This file is intentionally not wired into doPost. It reads V54 dictionary
// sheets through injected dependencies and returns prompt-safe context only.

var V54_PARSER_CONTEXT_SHEETS = {
    CONFIG_CATEGORIAS: 'Config_Categorias',
    CONFIG_FONTES: 'Config_Fontes',
    CARTOES: 'Cartoes',
};

var V54_PARSER_CONTEXT_HEADERS = {
    Config_Categorias: getV54Headers('Config_Categorias'),
    Config_Fontes: getV54Headers('Config_Fontes'),
    Cartoes: getV54Headers('Cartoes'),
};

var V54_PARSER_CONTEXT_SAFE_FIELDS = {
    Config_Categorias: [
        'id_categoria',
        'nome',
        'grupo',
        'tipo_movimento',
        'classe_dre',
        'escopo',
        'comportamento_orcamento',
        'afeta_acerto',
        'afeta_dre',
        'visibilidade_padrao',
        'ativo',
    ],
    Config_Fontes: [
        'id_fonte',
        'nome',
        'tipo',
        'titular',
        'ativo',
    ],
    Cartoes: [
        'id_cartao',
        'id_fonte',
        'nome',
        'titular',
        'fechamento_dia',
        'vencimento_dia',
        'ativo',
    ],
};

function getParserContextV54(runtimeContext, options) {
    var deps = normalizeParserContextV54Deps_(runtimeContext, options);
    var spreadsheet;
    try {
        spreadsheet = deps.getSpreadsheet();
    } catch (error) {
        return makeParserContextV54Failure_('PARSER_CONTEXT_SPREADSHEET_FAILED', 'spreadsheet', 'Parser context spreadsheet lookup failed safely.');
    }

    var categoriesResult = readParserContextV54Sheet_(
        spreadsheet,
        V54_PARSER_CONTEXT_SHEETS.CONFIG_CATEGORIAS,
        V54_PARSER_CONTEXT_HEADERS.Config_Categorias,
        V54_PARSER_CONTEXT_SAFE_FIELDS.Config_Categorias,
        'id_categoria'
    );
    if (!categoriesResult.ok) return categoriesResult;

    var fontesResult = readParserContextV54Sheet_(
        spreadsheet,
        V54_PARSER_CONTEXT_SHEETS.CONFIG_FONTES,
        V54_PARSER_CONTEXT_HEADERS.Config_Fontes,
        V54_PARSER_CONTEXT_SAFE_FIELDS.Config_Fontes,
        'id_fonte'
    );
    if (!fontesResult.ok) return fontesResult;

    var cartoesResult = readParserContextV54Sheet_(
        spreadsheet,
        V54_PARSER_CONTEXT_SHEETS.CARTOES,
        V54_PARSER_CONTEXT_HEADERS.Cartoes,
        V54_PARSER_CONTEXT_SAFE_FIELDS.Cartoes,
        'id_cartao'
    );
    if (!cartoesResult.ok) return cartoesResult;

    var source = runtimeContext || {};
    var context = {
        categories: categoriesResult.rows,
        fontes: fontesResult.rows,
        cartoes: cartoesResult.rows,
        defaultPessoa: safeParserContextV54Scalar_(source.defaultPessoa || source.pessoa || deps.defaultPessoa),
        defaultEscopo: safeParserContextV54Scalar_(source.defaultEscopo || source.escopo || deps.defaultEscopo),
        referenceDate: safeParserContextV54Scalar_(source.referenceDate || source.data_referencia || deps.now().slice(0, 10)),
    };

    return { ok: true, context: context, errors: [] };
}

function normalizeParserContextV54Deps_(runtimeContext, options) {
    var source = options || {};
    var config = typeof CONFIG === 'object' && CONFIG ? CONFIG : {};
    return {
        getSpreadsheet: typeof source.getSpreadsheet === 'function'
            ? source.getSpreadsheet
            : function() {
                _loadSecrets();
                return SpreadsheetApp.openById(config.SPREADSHEET_ID);
            },
        now: typeof source.now === 'function'
            ? source.now
            : function() {
                return new Date().toISOString();
            },
        defaultPessoa: source.defaultPessoa || '',
        defaultEscopo: source.defaultEscopo || '',
    };
}

function readParserContextV54Sheet_(spreadsheet, sheetName, expectedHeaders, safeFields, idField) {
    var sheet = spreadsheet && typeof spreadsheet.getSheetByName === 'function'
        ? spreadsheet.getSheetByName(sheetName)
        : null;
    if (!sheet) {
        return makeParserContextV54Failure_('PARSER_CONTEXT_MISSING_SHEET', sheetName, sheetName + ' sheet was not found.');
    }

    var headerCheck = validateParserContextV54Headers_(sheet, sheetName, expectedHeaders);
    if (!headerCheck.ok) return headerCheck;

    var rows = readParserContextV54Rows_(sheet, expectedHeaders);
    var safeRows = rows
        .filter(function(row) { return row[idField] !== undefined && row[idField] !== null && String(row[idField]).trim() !== ''; })
        .filter(function(row) { return isParserContextV54ActiveRow_(row); })
        .map(function(row) { return sanitizeParserContextV54Row_(row, safeFields); });

    return { ok: true, rows: safeRows, errors: [] };
}

function validateParserContextV54Headers_(sheet, sheetName, expectedHeaders) {
    var headers;
    try {
        headers = sheet.getRange(1, 1, 1, expectedHeaders.length).getValues()[0];
    } catch (error) {
        return makeParserContextV54Failure_('PARSER_CONTEXT_HEADER_READ_FAILED', sheetName, sheetName + ' headers could not be read safely.');
    }

    for (var i = 0; i < expectedHeaders.length; i++) {
        if (headers[i] !== expectedHeaders[i]) {
            return makeParserContextV54Failure_('PARSER_CONTEXT_HEADER_MISMATCH', sheetName, sheetName + ' headers do not match the V54 schema.');
        }
    }
    return { ok: true, errors: [] };
}

function readParserContextV54Rows_(sheet, headers) {
    var lastRow = typeof sheet.getLastRow === 'function' ? sheet.getLastRow() : 0;
    if (lastRow <= 1) return [];
    var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    return values.map(function(rowValues) {
        var row = {};
        headers.forEach(function(header, index) {
            row[header] = rowValues[index] === undefined || rowValues[index] === null ? '' : rowValues[index];
        });
        return row;
    });
}

function isParserContextV54ActiveRow_(row) {
    if (!Object.prototype.hasOwnProperty.call(row, 'ativo')) return true;
    var value = row.ativo;
    if (value === true) return true;
    if (value === false) return false;
    var normalized = String(value || '').trim().toLowerCase();
    return normalized === '' || normalized === 'true' || normalized === 'ativo' || normalized === 'sim' || normalized === '1';
}

function sanitizeParserContextV54Row_(row, safeFields) {
    var safe = {};
    safeFields.forEach(function(field) {
        if (!Object.prototype.hasOwnProperty.call(row, field)) return;
        safe[field] = safeParserContextV54Scalar_(row[field]);
    });
    return safe;
}

function safeParserContextV54Scalar_(value) {
    if (value === undefined || value === null) return '';
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : '';
    return String(value)
        .replace(/sk-[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
        .replace(/\b\d{6,}:[A-Za-z0-9_-]{10,}\b/g, '[REDACTED]')
        .replace(/(api[_-]?key|token|secret|spreadsheet[_-]?id)\s*[:=]\s*[^,\s}\]]+/ig, '$1=[REDACTED]')
        .trim();
}

function makeParserContextV54Failure_(code, field, message) {
    return {
        ok: false,
        context: null,
        errors: [makeParserContextV54Error_(code, field, message)],
    };
}

function makeParserContextV54Error_(code, field, message) {
    return {
        code: String(code || 'PARSER_CONTEXT_ERROR'),
        field: String(field || 'parserContext'),
        message: String(message || 'Parser context failed safely.'),
    };
}

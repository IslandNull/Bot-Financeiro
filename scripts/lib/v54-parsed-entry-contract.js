const ALLOWED_TIPO_EVENTO = [
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

const ALLOWED_PESSOA = ['Gustavo', 'Luana', 'Casal'];
const ALLOWED_ESCOPO = ['Gustavo', 'Luana', 'Casal'];
const ALLOWED_VISIBILIDADE = ['detalhada', 'resumo', 'privada'];

const ALLOWED_FIELDS = [
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

const ALLOWED_PARCELAMENTO_FIELDS = [
    'parcelas_total',
    'numero_parcela',
    'valor_parcela',
];

function validateParsedEntryV54(input) {
    const errors = [];
    const normalized = {};

    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return {
            ok: false,
            errors: [makeError('ENTRY_NOT_OBJECT', 'entry', 'ParsedEntryV54 must be an object.')],
            normalized,
        };
    }

    Object.keys(input).forEach((field) => {
        if (!ALLOWED_FIELDS.includes(field)) {
            errors.push(makeError('UNKNOWN_FIELD', field, `Unknown ParsedEntryV54 field: ${field}`));
        }
    });

    normalizeStringField(input, normalized, errors, 'tipo_evento', { required: true, allowed: ALLOWED_TIPO_EVENTO });
    normalizeStringField(input, normalized, errors, 'data', { required: true, pattern: /^\d{4}-\d{2}-\d{2}$/ });
    normalizeStringField(input, normalized, errors, 'competencia', { required: true, pattern: /^\d{4}-\d{2}$/ });
    normalizeStringField(input, normalized, errors, 'descricao', { required: true });
    normalizeStringField(input, normalized, errors, 'pessoa', { required: true, allowed: ALLOWED_PESSOA });
    normalizeStringField(input, normalized, errors, 'escopo', { required: true, allowed: ALLOWED_ESCOPO });
    normalizeStringField(input, normalized, errors, 'visibilidade', { required: true, allowed: ALLOWED_VISIBILIDADE });

    [
        'id_categoria',
        'id_fonte',
        'id_cartao',
        'id_fatura',
        'id_compra',
        'id_parcela',
        'raw_text',
    ].forEach((field) => normalizeStringField(input, normalized, errors, field, { required: false }));

    normalizePositiveNumberField(input, normalized, errors, 'valor', { required: true });
    normalizeConfidence(input, normalized, errors);
    normalizeWarnings(input, normalized, errors);

    ['afeta_dre', 'afeta_acerto', 'afeta_patrimonio'].forEach((field) => {
        normalizeBooleanField(input, normalized, errors, field, { required: true });
    });

    normalizeParcelamento(input, normalized, errors);
    validateEventRules(normalized, errors);

    return {
        ok: errors.length === 0,
        errors,
        normalized,
    };
}

function makeError(code, field, message) {
    return { code, field, message };
}

function hasOwn(obj, field) {
    return Object.prototype.hasOwnProperty.call(obj, field);
}

function normalizeStringField(input, normalized, errors, field, options) {
    const value = input[field];
    const required = Boolean(options && options.required);

    if (value === undefined || value === null) {
        if (required) errors.push(makeError('REQUIRED_FIELD', field, `${field} is required.`));
        return;
    }

    if (typeof value !== 'string') {
        errors.push(makeError('INVALID_STRING', field, `${field} must be a string.`));
        return;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        if (required) errors.push(makeError('REQUIRED_FIELD', field, `${field} is required.`));
        return;
    }

    if (options && options.allowed && !options.allowed.includes(trimmed)) {
        errors.push(makeError('INVALID_ENUM', field, `${field} must be one of: ${options.allowed.join(', ')}.`));
    }

    if (options && options.pattern && !options.pattern.test(trimmed)) {
        errors.push(makeError('INVALID_FORMAT', field, `${field} has invalid format.`));
    }

    normalized[field] = trimmed;
}

function normalizePositiveNumberField(input, normalized, errors, field, options) {
    const value = input[field];
    const required = Boolean(options && options.required);

    if (value === undefined || value === null || value === '') {
        if (required) errors.push(makeError('REQUIRED_FIELD', field, `${field} is required.`));
        return;
    }

    const numeric = parseContractNumber(value, field, errors);
    if (numeric === null) return;

    if (numeric <= 0) {
        errors.push(makeError('INVALID_POSITIVE_NUMBER', field, `${field} must be greater than zero.`));
    }
    normalized[field] = numeric;
}

function normalizeBooleanField(input, normalized, errors, field, options) {
    const value = input[field];
    const required = Boolean(options && options.required);

    if (value === undefined || value === null) {
        if (required) errors.push(makeError('REQUIRED_FIELD', field, `${field} is required.`));
        return;
    }

    if (typeof value !== 'boolean') {
        errors.push(makeError('INVALID_BOOLEAN', field, `${field} must be boolean.`));
        return;
    }

    normalized[field] = value;
}

function parseContractNumber(value, field, errors) {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            errors.push(makeError('INVALID_NUMBER', field, `${field} must be a finite number.`));
            return null;
        }
        return value;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
        if (trimmed.includes(',')) {
            errors.push(makeError('AMBIGUOUS_MONEY_STRING', field, `${field} must use a dot decimal separator, not comma.`));
            return null;
        }
    }

    errors.push(makeError('INVALID_NUMBER', field, `${field} must be a number or safe numeric string.`));
    return null;
}

function normalizeConfidence(input, normalized, errors) {
    if (!hasOwn(input, 'confidence') || input.confidence === undefined || input.confidence === null || input.confidence === '') return;
    const numeric = parseContractNumber(input.confidence, 'confidence', errors);
    if (numeric === null) return;
    if (numeric < 0 || numeric > 1) {
        errors.push(makeError('INVALID_CONFIDENCE', 'confidence', 'confidence must be between 0 and 1.'));
    }
    normalized.confidence = numeric;
}

function normalizeWarnings(input, normalized, errors) {
    if (!hasOwn(input, 'warnings') || input.warnings === undefined || input.warnings === null) return;
    if (!Array.isArray(input.warnings)) {
        errors.push(makeError('INVALID_WARNINGS', 'warnings', 'warnings must be an array of strings.'));
        return;
    }

    const warnings = [];
    input.warnings.forEach((warning, index) => {
        if (typeof warning !== 'string') {
            errors.push(makeError('INVALID_WARNING', `warnings.${index}`, 'warning must be a string.'));
            return;
        }
        const trimmed = warning.trim();
        if (trimmed) warnings.push(trimmed);
    });
    normalized.warnings = warnings;
}

function normalizeParcelamento(input, normalized, errors) {
    if (!hasOwn(input, 'parcelamento') || input.parcelamento === undefined || input.parcelamento === null) return;

    const parcelamento = input.parcelamento;
    if (typeof parcelamento !== 'object' || Array.isArray(parcelamento)) {
        errors.push(makeError('INVALID_OBJECT', 'parcelamento', 'parcelamento must be an object.'));
        return;
    }

    Object.keys(parcelamento).forEach((field) => {
        if (!ALLOWED_PARCELAMENTO_FIELDS.includes(field)) {
            errors.push(makeError('UNKNOWN_FIELD', `parcelamento.${field}`, `Unknown parcelamento field: ${field}`));
        }
    });

    const normalizedParcelamento = {};
    normalizeIntegerField(parcelamento, normalizedParcelamento, errors, 'parcelas_total', { required: true, min: 2, prefix: 'parcelamento.' });
    normalizeIntegerField(parcelamento, normalizedParcelamento, errors, 'numero_parcela', { required: false, min: 1, prefix: 'parcelamento.' });
    normalizePositiveNumberField(parcelamento, normalizedParcelamento, errors, 'valor_parcela', { required: false });

    if (
        normalizedParcelamento.numero_parcela !== undefined &&
        normalizedParcelamento.parcelas_total !== undefined &&
        normalizedParcelamento.numero_parcela > normalizedParcelamento.parcelas_total
    ) {
        errors.push(makeError('INVALID_INSTALLMENT_NUMBER', 'parcelamento.numero_parcela', 'numero_parcela cannot exceed parcelas_total.'));
    }

    normalized.parcelamento = normalizedParcelamento;
}

function normalizeIntegerField(input, normalized, errors, field, options) {
    const value = input[field];
    const required = Boolean(options && options.required);
    const prefix = options && options.prefix ? options.prefix : '';
    const errorField = `${prefix}${field}`;

    if (value === undefined || value === null || value === '') {
        if (required) errors.push(makeError('REQUIRED_FIELD', errorField, `${errorField} is required.`));
        return;
    }

    const numeric = parseContractNumber(value, errorField, errors);
    if (numeric === null) return;
    if (!Number.isInteger(numeric)) {
        errors.push(makeError('INVALID_INTEGER', errorField, `${errorField} must be an integer.`));
        return;
    }
    if (options && options.min !== undefined && numeric < options.min) {
        errors.push(makeError('INVALID_MINIMUM', errorField, `${errorField} must be at least ${options.min}.`));
        return;
    }

    normalized[field] = numeric;
}

function validateEventRules(normalized, errors) {
    const tipo = normalized.tipo_evento;
    if (!tipo) return;

    if (normalized.afeta_dre === true && !normalized.id_categoria) {
        errors.push(makeError('REQUIRED_FOR_DRE', 'id_categoria', 'id_categoria is required when afeta_dre is true.'));
    }

    if (['despesa', 'receita', 'divida_pagamento'].includes(tipo) && !normalized.id_categoria) {
        errors.push(makeError('REQUIRED_FOR_EVENT', 'id_categoria', `id_categoria is required for ${tipo}.`));
    }

    if (['despesa', 'receita', 'transferencia', 'aporte', 'pagamento_fatura', 'divida_pagamento'].includes(tipo) && !normalized.id_fonte) {
        errors.push(makeError('REQUIRED_FOR_EVENT', 'id_fonte', `id_fonte is required for ${tipo}.`));
    }

    if (tipo === 'compra_cartao' && !normalized.id_cartao) {
        errors.push(makeError('REQUIRED_FOR_EVENT', 'id_cartao', 'id_cartao is required for compra_cartao.'));
    }

    if (tipo === 'compra_parcelada') {
        if (!normalized.id_cartao) {
            errors.push(makeError('REQUIRED_FOR_EVENT', 'id_cartao', 'id_cartao is required for compra_parcelada.'));
        }
        if (!normalized.parcelamento) {
            errors.push(makeError('REQUIRED_FOR_EVENT', 'parcelamento', 'parcelamento is required for compra_parcelada.'));
        }
    } else if (normalized.parcelamento) {
        errors.push(makeError('INVALID_FOR_EVENT', 'parcelamento', 'parcelamento is only allowed for compra_parcelada.'));
    }

    if (tipo === 'pagamento_fatura') {
        if (!normalized.id_fatura) {
            errors.push(makeError('REQUIRED_FOR_EVENT', 'id_fatura', 'id_fatura is required for pagamento_fatura.'));
        }
        if (normalized.afeta_dre !== false) {
            errors.push(makeError('INVALID_DRE_FLAG', 'afeta_dre', 'pagamento_fatura must not affect DRE.'));
        }
    }

    if (['transferencia', 'aporte'].includes(tipo) && normalized.afeta_dre !== false) {
        errors.push(makeError('INVALID_DRE_FLAG', 'afeta_dre', `${tipo} must not affect DRE.`));
    }
}

module.exports = {
    ALLOWED_ESCOPO,
    ALLOWED_FIELDS,
    ALLOWED_PESSOA,
    ALLOWED_TIPO_EVENTO,
    ALLOWED_VISIBILIDADE,
    validateParsedEntryV54,
};

const { V54_HEADERS, V54_SHEETS } = require('./v54-schema');

const FATURAS_HEADERS = V54_HEADERS[V54_SHEETS.FATURAS];
const PROTECTED_FATURA_STATUSES = [
    'fechada',
    'paga',
    'parcialmente_paga',
    'divergente',
    'ajustada',
    'cancelada',
];

function makeError(code, field, message) {
    return { code, field, message };
}

function validateFaturasHeaders(headers) {
    if (!Array.isArray(headers)) {
        return {
            ok: false,
            errors: [makeError('HEADER_MISMATCH', V54_SHEETS.FATURAS, 'Faturas headers must match the V54 schema.')],
        };
    }

    if (headers.length !== FATURAS_HEADERS.length) {
        return {
            ok: false,
            errors: [makeError('HEADER_MISMATCH', V54_SHEETS.FATURAS, 'Faturas header width must match the V54 schema.')],
        };
    }

    for (let index = 0; index < FATURAS_HEADERS.length; index++) {
        if (headers[index] !== FATURAS_HEADERS[index]) {
            return {
                ok: false,
                errors: [makeError('HEADER_MISMATCH', V54_SHEETS.FATURAS, 'Faturas headers must match the V54 schema.')],
            };
        }
    }

    return { ok: true, errors: [] };
}

function expectedFaturaItemFromCardPurchase(cardPurchaseResult) {
    if (!cardPurchaseResult || typeof cardPurchaseResult !== 'object') return null;
    const cycle = cardPurchaseResult.cycle || {};
    const mapped = cardPurchaseResult.mapped || {};
    const rowObject = mapped.rowObject || {};

    return {
        id_fatura: cycle.id_fatura,
        id_cartao: cycle.id_cartao,
        competencia: cycle.competencia,
        data_fechamento: cycle.data_fechamento,
        data_vencimento: cycle.data_vencimento,
        valor: rowObject.valor,
        source: 'compra_cartao',
    };
}

function expectedFaturaItemsFromInstallmentSchedule(scheduleResult) {
    if (!scheduleResult || typeof scheduleResult !== 'object') return [];

    const parcelas = scheduleResult.parcelas && Array.isArray(scheduleResult.parcelas.rowObjects)
        ? scheduleResult.parcelas.rowObjects
        : [];
    const cycles = Array.isArray(scheduleResult.cycles) ? scheduleResult.cycles : [];

    return parcelas
        .filter((parcela) => parcela && parcela.status === 'pendente')
        .map((parcela, index) => {
            const cycle = cycles[index] || {};
            return {
                id_fatura: parcela.id_fatura,
                id_cartao: cycle.id_cartao,
                competencia: parcela.competencia,
                data_fechamento: cycle.data_fechamento,
                data_vencimento: cycle.data_vencimento,
                valor: parcela.valor_parcela,
                source: 'parcela_agenda',
                id_parcela: parcela.id_parcela,
            };
        });
}

function planExpectedFaturasUpsert(input) {
    const source = input || {};
    const headers = source.headers || FATURAS_HEADERS;
    const headerCheck = validateFaturasHeaders(headers);
    if (!headerCheck.ok) return makeFailure(headerCheck.errors, headers);

    const existingRows = Array.isArray(source.existingRows) ? source.existingRows.map(cloneRowObject) : [];
    const expectedItems = Array.isArray(source.expectedItems) ? source.expectedItems.map(cloneRowObject) : [];
    const groupedResult = groupExpectedItems(expectedItems);
    if (!groupedResult.ok) return makeFailure(groupedResult.errors, headers);

    const existingById = new Map();
    const duplicateErrors = [];
    existingRows.forEach((row, index) => {
        const id = String(row.id_fatura || '').trim();
        if (!id) {
            duplicateErrors.push(makeError('MISSING_ID_FATURA', 'id_fatura', 'Existing Faturas rows must include id_fatura.'));
            return;
        }
        if (existingById.has(id)) {
            duplicateErrors.push(makeError('DUPLICATE_FATURA', 'id_fatura', `Duplicate existing Faturas row for ${id}.`));
            return;
        }
        existingById.set(id, { row, rowNumber: row._rowNumber || index + 2 });
    });
    if (duplicateErrors.length > 0) return makeFailure(duplicateErrors, headers);

    const actions = [];
    const finalRows = [];

    groupedResult.items.forEach((item) => {
        const existing = existingById.get(item.id_fatura);
        if (!existing) {
            const rowObject = buildNewFaturaRow(item);
            actions.push({
                type: 'append',
                rowNumber: null,
                id_fatura: rowObject.id_fatura,
                rowObject,
                rowValues: buildRowValues(rowObject),
            });
            finalRows.push(rowObject);
            return;
        }

        const normalizedExistingRow = normalizeExistingFaturaRow(existing.row);
        const status = normalizedExistingRow.status;
        if (PROTECTED_FATURA_STATUSES.includes(status)) {
            actions.push({
                type: 'protected_skip',
                rowNumber: existing.rowNumber,
                id_fatura: item.id_fatura,
                rowObject: cloneRowObject(normalizedExistingRow),
                rowValues: buildRowValues(normalizedExistingRow),
                reason: `Fatura status ${status} is protected for expected upsert.`,
            });
            return;
        }

        if (status !== 'prevista') {
            actions.push({
                type: 'invalid_skip',
                rowNumber: existing.rowNumber,
                id_fatura: item.id_fatura,
                rowObject: cloneRowObject(normalizedExistingRow),
                rowValues: buildRowValues(normalizedExistingRow),
                reason: `Fatura status ${status || '(blank)'} is not eligible for expected upsert.`,
            });
            return;
        }

        const consistencyErrors = validateExistingCycleMatches(normalizedExistingRow, item);
        if (consistencyErrors.length > 0) {
            actions.push({
                type: 'invalid_skip',
                rowNumber: existing.rowNumber,
                id_fatura: item.id_fatura,
                rowObject: cloneRowObject(normalizedExistingRow),
                rowValues: buildRowValues(normalizedExistingRow),
                errors: consistencyErrors,
            });
            return;
        }

        const updated = {
            ...normalizedExistingRow,
            valor_previsto: centsToMoney(moneyToCents(normalizedExistingRow.valor_previsto || 0) + item.valor_cents),
            valor_fechado: normalizeBlank(normalizedExistingRow.valor_fechado),
            valor_pago: normalizeBlank(normalizedExistingRow.valor_pago),
            fonte_pagamento: normalizeBlank(normalizedExistingRow.fonte_pagamento),
            status: 'prevista',
        };
        delete updated._rowNumber;
        actions.push({
            type: 'update',
            rowNumber: existing.rowNumber,
            id_fatura: item.id_fatura,
            rowObject: updated,
            rowValues: buildRowValues(updated),
            previousRowObject: cloneRowObject(normalizedExistingRow),
        });
        finalRows.push(updated);
    });

    const blockingActions = actions.filter((action) => action.type === 'protected_skip' || action.type === 'invalid_skip');
    if (blockingActions.length > 0) {
        const errors = blockingActions.flatMap((action) => {
            if (Array.isArray(action.errors) && action.errors.length > 0) return action.errors;
            const code = action.type === 'protected_skip' ? 'PROTECTED_FATURA_STATUS' : 'INVALID_FATURA_STATUS';
            return [makeError(code, 'status', action.reason)];
        });
        return makeFailure(errors, headers, actions);
    }

    return {
        ok: true,
        errors: [],
        headers: [...FATURAS_HEADERS],
        actions,
        rowObjects: finalRows,
        rowValues: finalRows.map(buildRowValues),
        payments: [],
        dreRows: [],
    };
}

function groupExpectedItems(items) {
    const groups = new Map();
    const errors = [];

    items.forEach((item, index) => {
        const normalized = normalizeExpectedItem(item, index);
        if (!normalized.ok) {
            errors.push(...normalized.errors);
            return;
        }

        const current = groups.get(normalized.item.id_fatura);
        if (!current) {
            groups.set(normalized.item.id_fatura, normalized.item);
            return;
        }

        ['id_cartao', 'competencia', 'data_fechamento', 'data_vencimento'].forEach((field) => {
            if (current[field] !== normalized.item[field]) {
                errors.push(makeError('FATURA_CYCLE_CONFLICT', field, `Expected item conflicts for ${normalized.item.id_fatura}.`));
            }
        });
        current.valor_cents += normalized.item.valor_cents;
        current.valor = centsToMoney(current.valor_cents);
    });

    if (errors.length > 0) return { ok: false, errors, items: [] };
    return { ok: true, errors: [], items: Array.from(groups.values()) };
}

function normalizeExpectedItem(item, index) {
    const errors = [];
    const normalized = {};

    ['id_fatura', 'id_cartao', 'competencia', 'data_fechamento', 'data_vencimento'].forEach((field) => {
        const value = String(item && item[field] !== undefined && item[field] !== null ? item[field] : '').trim();
        if (!value) errors.push(makeError('REQUIRED_FIELD', field, `Expected fatura item ${index + 1} must include ${field}.`));
        normalized[field] = value;
    });

    if (normalized.competencia && !/^\d{4}-\d{2}$/.test(normalized.competencia)) {
        errors.push(makeError('INVALID_FORMAT', 'competencia', 'Fatura competencia must use YYYY-MM.'));
    }
    ['data_fechamento', 'data_vencimento'].forEach((field) => {
        if (normalized[field] && !/^\d{4}-\d{2}-\d{2}$/.test(normalized[field])) {
            errors.push(makeError('INVALID_FORMAT', field, `${field} must use YYYY-MM-DD.`));
        }
    });

    const valorCents = moneyToCents(item ? item.valor : undefined);
    if (!Number.isInteger(valorCents) || valorCents <= 0) {
        errors.push(makeError('INVALID_MONEY', 'valor', 'Expected fatura item valor must be positive.'));
    }
    normalized.valor_cents = valorCents;
    normalized.valor = centsToMoney(valorCents);

    return { ok: errors.length === 0, errors, item: normalized };
}

function validateExistingCycleMatches(existing, item) {
    const errors = [];
    ['id_cartao', 'competencia', 'data_fechamento', 'data_vencimento'].forEach((field) => {
        if (existing[field] !== item[field]) {
            errors.push(makeError('FATURA_CYCLE_CONFLICT', field, `Existing Faturas row conflicts with expected cycle for ${item.id_fatura}.`));
        }
    });
    return errors;
}

function normalizeExistingFaturaRow(row) {
    const source = row && typeof row === 'object' ? row : {};
    return {
        ...source,
        id_fatura: normalizeTrimmedString(source.id_fatura),
        id_cartao: normalizeTrimmedString(source.id_cartao),
        competencia: normalizeCompetenciaValue(source.competencia),
        data_fechamento: normalizeIsoDateValue(source.data_fechamento),
        data_vencimento: normalizeIsoDateValue(source.data_vencimento),
        valor_previsto: normalizeFaturaMoneyValue(source.valor_previsto),
        valor_fechado: normalizeFaturaMoneyValue(source.valor_fechado),
        valor_pago: normalizeFaturaMoneyValue(source.valor_pago),
        fonte_pagamento: normalizeTrimmedString(source.fonte_pagamento),
        status: normalizeTrimmedString(source.status),
    };
}

function normalizeTrimmedString(value) {
    return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeCompetenciaValue(value) {
    if (isDateObject(value)) return formatCompetenciaLocal(value);
    const text = normalizeTrimmedString(value);
    if (!text) return '';
    const isoDate = normalizeIsoDateValue(text);
    if (/^\d{4}-\d{2}$/.test(text)) return text;
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate.slice(0, 7);
    const monthYear = text.match(/^(\d{1,2})\/(\d{4})$/);
    if (monthYear) return `${monthYear[2]}-${String(Number(monthYear[1])).padStart(2, '0')}`;
    return text;
}

function normalizeIsoDateValue(value) {
    if (isDateObject(value)) return formatIsoDateLocal(value);
    const text = normalizeTrimmedString(value);
    if (!text) return '';
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (br) return `${br[3]}-${String(Number(br[2])).padStart(2, '0')}-${String(Number(br[1])).padStart(2, '0')}`;
    return text;
}

function normalizeFaturaMoneyValue(value) {
    if (value === undefined || value === null || value === '') return '';
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : normalizeTrimmedString(value);
}

function isDateObject(value) {
    return Object.prototype.toString.call(value) === '[object Date]' && Number.isFinite(value.getTime());
}

function formatIsoDateLocal(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatCompetenciaLocal(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildNewFaturaRow(item) {
    return {
        id_fatura: item.id_fatura,
        id_cartao: item.id_cartao,
        competencia: item.competencia,
        data_fechamento: item.data_fechamento,
        data_vencimento: item.data_vencimento,
        valor_previsto: centsToMoney(item.valor_cents),
        valor_fechado: '',
        valor_pago: '',
        fonte_pagamento: '',
        status: 'prevista',
    };
}

function buildRowValues(rowObject) {
    return FATURAS_HEADERS.map((header) => normalizeBlank(rowObject[header]));
}

function normalizeBlank(value) {
    return value === undefined || value === null ? '' : value;
}

function moneyToCents(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return NaN;
    return Math.round(numeric * 100);
}

function centsToMoney(cents) {
    return Number((cents / 100).toFixed(2));
}

function cloneRowObject(row) {
    return row && typeof row === 'object' ? { ...row } : {};
}

function makeFailure(errors, headers, actions) {
    return {
        ok: false,
        errors,
        headers: Array.isArray(headers) ? [...headers] : [],
        actions: Array.isArray(actions) ? actions : [],
        rowObjects: [],
        rowValues: [],
        payments: [],
        dreRows: [],
    };
}

module.exports = {
    PROTECTED_FATURA_STATUSES,
    expectedFaturaItemFromCardPurchase,
    expectedFaturaItemsFromInstallmentSchedule,
    planExpectedFaturasUpsert,
    validateFaturasHeaders,
};

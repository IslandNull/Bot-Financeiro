const { V54_HEADERS, V54_SHEETS } = require('./v54-schema');
const { validateParsedEntryV54 } = require('./v54-parsed-entry-contract');

const LANCAMENTOS_V54_HEADERS = V54_HEADERS[V54_SHEETS.LANCAMENTOS_V54];
const OPTIONAL_LINK_FIELDS = ['id_categoria', 'id_fonte', 'id_cartao', 'id_fatura', 'id_compra', 'id_parcela'];

function mapParsedEntryToLancamentoV54(input, options) {
    const validation = validateParsedEntryV54(input);
    if (!validation.ok) {
        return {
            ok: false,
            errors: validation.errors,
            validation,
            headers: getLancamentosV54Headers(),
            rowObject: null,
            rowValues: [],
        };
    }

    const deps = normalizeMapperDependencies(options);
    const entry = validation.normalized;
    const rowObject = buildLancamentoRowObject(entry, deps);
    const headers = getLancamentosV54Headers();
    const rowValues = headers.map((header) => normalizeCellValue(rowObject[header]));

    if (rowValues.length !== headers.length) {
        return makeMapperFailure('ROW_WIDTH_MISMATCH', 'rowValues', `Expected ${headers.length} columns, got ${rowValues.length}.`, validation, headers, rowObject, rowValues);
    }

    const missingHeader = headers.find((header) => !Object.prototype.hasOwnProperty.call(rowObject, header));
    if (missingHeader) {
        return makeMapperFailure('ROW_FIELD_MISSING', missingHeader, `rowObject is missing ${missingHeader}.`, validation, headers, rowObject, rowValues);
    }

    return {
        ok: true,
        errors: [],
        validation,
        headers,
        rowObject,
        rowValues,
    };
}

function buildLancamentoRowObject(entry, deps) {
    return {
        id_lancamento: deps.makeId(entry),
        data: entry.data,
        competencia: entry.competencia,
        tipo_evento: entry.tipo_evento,
        id_categoria: optionalString(entry.id_categoria),
        valor: entry.valor,
        id_fonte: optionalString(entry.id_fonte),
        pessoa: entry.pessoa,
        escopo: entry.escopo,
        id_cartao: optionalString(entry.id_cartao),
        id_fatura: optionalString(entry.id_fatura),
        id_compra: optionalString(entry.id_compra),
        id_parcela: optionalString(entry.id_parcela),
        afeta_dre: entry.afeta_dre,
        afeta_acerto: entry.afeta_acerto,
        afeta_patrimonio: entry.afeta_patrimonio,
        visibilidade: entry.visibilidade,
        descricao: entry.descricao,
        created_at: deps.now(),
    };
}

function normalizeMapperDependencies(options) {
    const source = options || {};
    return {
        now: typeof source.now === 'function' ? source.now : () => new Date().toISOString(),
        makeId: typeof source.makeId === 'function' ? source.makeId : makeDefaultLancamentoId,
    };
}

function makeDefaultLancamentoId(entry) {
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const tipo = String(entry && entry.tipo_evento ? entry.tipo_evento : 'entry').toUpperCase();
    return `LAN_V54_${tipo}_${stamp}`;
}

function getLancamentosV54Headers() {
    return [...LANCAMENTOS_V54_HEADERS];
}

function optionalString(value) {
    return value === undefined || value === null ? '' : value;
}

function normalizeCellValue(value) {
    return value === undefined || value === null ? '' : value;
}

function makeMapperFailure(code, field, message, validation, headers, rowObject, rowValues) {
    return {
        ok: false,
        errors: [{ code, field, message }],
        validation,
        headers,
        rowObject,
        rowValues,
    };
}

function assertNoMapperUnsupportedGlobals() {
    return OPTIONAL_LINK_FIELDS.length > 0;
}

module.exports = {
    getLancamentosV54Headers,
    mapParsedEntryToLancamentoV54,
    assertNoMapperUnsupportedGlobals,
};

const { V54_HEADERS, V54_SHEETS } = require('./v54-schema');
const { V54_SEED_DATA } = require('./v54-seed');
const { validateParsedEntryV54 } = require('./v54-parsed-entry-contract');
const { assignPurchaseToInvoiceCycle } = require('./v54-card-invoice-cycle');

const COMPRAS_HEADERS = V54_HEADERS[V54_SHEETS.COMPRAS_PARCELADAS];
const PARCELAS_HEADERS = V54_HEADERS[V54_SHEETS.PARCELAS_AGENDA];

function makeError(code, field, message) {
    return { code, field, message };
}

function cloneCard(card) {
    return { ...card };
}

function cloneEntry(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    return JSON.parse(JSON.stringify(entry));
}

function getConfiguredCards(seedData = V54_SEED_DATA) {
    const cards = seedData && seedData[V54_SHEETS.CARTOES];
    if (!Array.isArray(cards)) return [];
    return cards.map((card) => cloneCard(card));
}

function findCardById(cards, idCartao) {
    const target = String(idCartao || '').trim();
    if (!target) return null;
    return cards.find((card) => String(card.id_cartao || '').trim() === target) || null;
}

function normalizeDependencies(options) {
    const source = options || {};
    return {
        cards: Array.isArray(source.cards) ? source.cards.map((card) => cloneCard(card)) : getConfiguredCards(),
        makeCompraId: typeof source.makeCompraId === 'function' ? source.makeCompraId : makeDefaultCompraId,
        makeParcelaId: typeof source.makeParcelaId === 'function' ? source.makeParcelaId : makeDefaultParcelaId,
    };
}

function normalizeInstallmentInput(input) {
    const cloned = cloneEntry(input);
    if (!cloned || typeof cloned !== 'object' || Array.isArray(cloned)) return null;
    if (!cloned.competencia && typeof cloned.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cloned.data.trim())) {
        cloned.competencia = cloned.data.trim().slice(0, 7);
    }
    return cloned;
}

function mapInstallmentScheduleContract(input, options) {
    const deps = normalizeDependencies(options);
    const normalizedInput = normalizeInstallmentInput(input);
    if (!normalizedInput) {
        return makeFailure([makeError('ENTRY_NOT_OBJECT', 'entry', 'Installment purchase candidate must be an object.')]);
    }

    const parsed = validateParsedEntryV54(normalizedInput);
    if (!parsed.ok) return makeFailure(parsed.errors, parsed);

    const entry = parsed.normalized;
    if (entry.tipo_evento !== 'compra_parcelada') {
        return makeFailure([
            makeError('UNSUPPORTED_EVENT', 'tipo_evento', 'This helper only supports compra_parcelada in Phase 4C-prep.'),
        ], parsed);
    }

    const cardResult = resolveCard(entry, deps.cards);
    if (!cardResult.ok) return makeFailure(cardResult.errors, parsed);

    const idCompra = deps.makeCompraId(entry);
    if (!String(idCompra || '').trim()) {
        return makeFailure([makeError('INVALID_ID', 'id_compra', 'makeCompraId must return a non-empty id.')], parsed);
    }

    const splitResult = splitCentsDeterministically(entry.valor, entry.parcelamento.parcelas_total);
    if (!splitResult.ok) return makeFailure(splitResult.errors, parsed);
    const parcelValueValidation = validateProvidedParcelValue(entry, splitResult);
    if (!parcelValueValidation.ok) return makeFailure(parcelValueValidation.errors, parsed);

    const cyclesResult = buildParcelCycles(entry.data, cardResult.card, entry.parcelamento.parcelas_total);
    if (!cyclesResult.ok) return makeFailure(cyclesResult.errors, parsed);

    const parcelas = cyclesResult.cycles.map((cycle, index) => {
        const numeroParcela = index + 1;
        const idParcela = deps.makeParcelaId(entry, numeroParcela, idCompra);
        if (!String(idParcela || '').trim()) {
            return {
                ok: false,
                error: makeError('INVALID_ID', 'id_parcela', 'makeParcelaId must return a non-empty id.'),
            };
        }

        const rowObject = {
            id_parcela: idParcela,
            id_compra: idCompra,
            numero_parcela: numeroParcela,
            competencia: cycle.competencia,
            valor_parcela: centsToMoney(splitResult.cents[index]),
            id_fatura: cycle.id_fatura,
            status: 'pendente',
            id_lancamento: '',
        };

        return {
            ok: true,
            cycle,
            rowObject,
            rowValues: PARCELAS_HEADERS.map((header) => normalizeCellValue(rowObject[header])),
        };
    });

    const idError = parcelas.find((parcel) => !parcel.ok);
    if (idError) return makeFailure([idError.error], parsed);

    const compraRowObject = {
        id_compra: idCompra,
        data_compra: entry.data,
        id_cartao: cardResult.card.id_cartao,
        descricao: entry.descricao,
        id_categoria: entry.id_categoria,
        valor_total: centsToMoney(splitResult.totalCents),
        parcelas_total: entry.parcelamento.parcelas_total,
        responsavel: entry.pessoa,
        escopo: entry.escopo,
        visibilidade: entry.visibilidade,
        status: 'ativa',
    };

    const compras = buildRows(COMPRAS_HEADERS, [compraRowObject]);
    const parcelasRows = buildRows(PARCELAS_HEADERS, parcelas.map((parcel) => parcel.rowObject));

    return {
        ok: true,
        errors: [],
        validation: parsed,
        card: cardResult.card,
        cycles: parcelas.map((parcel) => parcel.cycle),
        compras,
        parcelas: parcelasRows,
    };
}

function validateProvidedParcelValue(entry, splitResult) {
    const providedParcelValue = entry && entry.parcelamento ? entry.parcelamento.valor_parcela : undefined;
    if (providedParcelValue === undefined) return { ok: true, errors: [] };

    const providedCents = moneyToCents(providedParcelValue);
    const expectedCents = splitResult.cents;
    const matchesAllParcels = expectedCents.every((centValue) => centValue === providedCents);
    if (matchesAllParcels) return { ok: true, errors: [] };

    const expectedValues = expectedCents.map((cents) => centsToMoney(cents));
    return {
        ok: false,
        errors: [
            makeError(
                'PARCEL_VALUE_MISMATCH',
                'parcelamento.valor_parcela',
                `parcelamento.valor_parcela must match deterministic split: [${expectedValues.join(', ')}].`,
            ),
        ],
    };
}

function resolveCard(entry, cards) {
    const card = findCardById(cards, entry.id_cartao);
    if (!card) {
        return { ok: false, errors: [makeError('UNKNOWN_CARD', 'id_cartao', `Unknown card id: ${entry.id_cartao}.`)] };
    }

    if (card.ativo === false) {
        return { ok: false, errors: [makeError('INACTIVE_CARD', 'id_cartao', `Card is inactive: ${card.id_cartao}.`)] };
    }

    const cardSourceId = String(card.id_fonte || '').trim();
    if (!cardSourceId) {
        return { ok: false, errors: [makeError('CARD_SOURCE_MISSING', 'id_fonte', `Card ${card.id_cartao} has no id_fonte.`)] };
    }

    if (entry.id_fonte && entry.id_fonte !== cardSourceId) {
        return {
            ok: false,
            errors: [
                makeError(
                    'CARD_SOURCE_CONFLICT',
                    'id_fonte',
                    `Input id_fonte ${entry.id_fonte} conflicts with card source ${cardSourceId}.`,
                ),
            ],
        };
    }

    return { ok: true, errors: [], card: cloneCard(card) };
}

function buildParcelCycles(purchaseDate, card, parcelasTotal) {
    const cycles = [];
    let cycleDate = purchaseDate;
    for (let index = 0; index < parcelasTotal; index++) {
        const result = assignPurchaseToInvoiceCycle(cycleDate, card);
        if (!result.ok) return { ok: false, errors: result.errors, cycles: [] };
        cycles.push(result.cycle);
        cycleDate = nextDayAfterClosing(result.cycle.data_fechamento);
    }
    return { ok: true, errors: [], cycles };
}

function nextDayAfterClosing(isoDate) {
    const [year, month, day] = isoDate.split('-').map(Number);
    const date = new Date(year, month - 1, day + 1);
    return formatIsoDate(date);
}

function formatIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function splitCentsDeterministically(totalValue, parcelasTotal) {
    const totalCents = moneyToCents(totalValue);
    if (!Number.isInteger(totalCents) || totalCents <= 0) {
        return { ok: false, errors: [makeError('INVALID_MONEY', 'valor', 'valor must convert to positive cents.')] };
    }

    const base = Math.floor(totalCents / parcelasTotal);
    const remainder = totalCents % parcelasTotal;
    const cents = Array.from({ length: parcelasTotal }, (_, index) => base + (index < remainder ? 1 : 0));
    return { ok: true, errors: [], totalCents, cents };
}

function moneyToCents(value) {
    return Math.round(Number(value) * 100);
}

function centsToMoney(cents) {
    return Number((cents / 100).toFixed(2));
}

function buildRows(headers, rowObjects) {
    return {
        headers: [...headers],
        rowObjects: rowObjects.map((row) => ({ ...row })),
        rowValues: rowObjects.map((row) => headers.map((header) => normalizeCellValue(row[header]))),
    };
}

function normalizeCellValue(value) {
    return value === undefined || value === null ? '' : value;
}

function makeDefaultCompraId(entry) {
    const date = String(entry && entry.data ? entry.data : '0000-00-00').replace(/-/g, '');
    const card = String(entry && entry.id_cartao ? entry.id_cartao : 'CARD');
    const description = String(entry && entry.descricao ? entry.descricao : 'COMPRA')
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 24);
    return `CP_${card}_${date}_${description || 'COMPRA'}`;
}

function makeDefaultParcelaId(entry, numeroParcela, idCompra) {
    return `${idCompra}_P${String(numeroParcela).padStart(2, '0')}`;
}

function makeFailure(errors, validation) {
    return {
        ok: false,
        errors,
        validation: validation || null,
        card: null,
        cycles: [],
        compras: { headers: [...COMPRAS_HEADERS], rowObjects: [], rowValues: [] },
        parcelas: { headers: [...PARCELAS_HEADERS], rowObjects: [], rowValues: [] },
    };
}

module.exports = {
    getConfiguredCards,
    mapInstallmentScheduleContract,
    splitCentsDeterministically,
};

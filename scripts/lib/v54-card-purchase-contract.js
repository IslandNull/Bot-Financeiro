const { V54_SEED_DATA } = require('./v54-seed');
const { V54_SHEETS } = require('./v54-schema');
const { validateParsedEntryV54 } = require('./v54-parsed-entry-contract');
const { assignPurchaseToInvoiceCycle } = require('./v54-card-invoice-cycle');
const { mapParsedEntryToLancamentoV54 } = require('./v54-lancamentos-mapper');

function makeError(code, field, message) {
    return { code, field, message };
}

function cloneCard(card) {
    return {
        ...card,
    };
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

function normalizeCardPurchaseInput(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const merged = { ...input };
    if (!merged.competencia && typeof merged.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(merged.data.trim())) {
        merged.competencia = merged.data.trim().slice(0, 7);
    }
    return merged;
}

function normalizeDependencies(options) {
    const source = options || {};
    return {
        cards: Array.isArray(source.cards) ? source.cards.map((card) => cloneCard(card)) : getConfiguredCards(),
        mapperOptions: source.mapperOptions || {},
    };
}

function buildMapperInput(normalizedEntry, resolvedCard, cycle) {
    return {
        ...normalizedEntry,
        competencia: cycle.competencia,
        id_cartao: String(resolvedCard.id_cartao || '').trim(),
        id_fatura: cycle.id_fatura,
        id_fonte: String(resolvedCard.id_fonte || '').trim(),
        id_compra: '',
        id_parcela: '',
    };
}

function mapSingleCardPurchaseContract(input, options) {
    const deps = normalizeDependencies(options);
    const normalizedInput = normalizeCardPurchaseInput(input);
    if (!normalizedInput) {
        return {
            ok: false,
            errors: [makeError('ENTRY_NOT_OBJECT', 'entry', 'Card purchase candidate must be an object.')],
            cycle: null,
            mapped: null,
        };
    }

    const parsed = validateParsedEntryV54(normalizedInput);
    if (!parsed.ok) {
        return {
            ok: false,
            errors: parsed.errors,
            cycle: null,
            mapped: null,
        };
    }

    const entry = parsed.normalized;
    if (entry.tipo_evento !== 'compra_cartao') {
        return {
            ok: false,
            errors: [
                makeError(
                    'UNSUPPORTED_EVENT',
                    'tipo_evento',
                    'This helper only supports compra_cartao in Phase 4B-contract.',
                ),
            ],
            cycle: null,
            mapped: null,
        };
    }

    const card = findCardById(deps.cards, entry.id_cartao);
    if (!card) {
        return {
            ok: false,
            errors: [makeError('UNKNOWN_CARD', 'id_cartao', `Unknown card id: ${entry.id_cartao}.`)],
            cycle: null,
            mapped: null,
        };
    }

    if (card.ativo === false) {
        return {
            ok: false,
            errors: [makeError('INACTIVE_CARD', 'id_cartao', `Card is inactive: ${card.id_cartao}.`)],
            cycle: null,
            mapped: null,
        };
    }

    const cardSourceId = String(card.id_fonte || '').trim();
    if (!cardSourceId) {
        return {
            ok: false,
            errors: [makeError('CARD_SOURCE_MISSING', 'id_fonte', `Card ${card.id_cartao} has no id_fonte.`)],
            cycle: null,
            mapped: null,
        };
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
            cycle: null,
            mapped: null,
        };
    }

    const cycleResult = assignPurchaseToInvoiceCycle(entry.data, card);
    if (!cycleResult.ok) {
        return {
            ok: false,
            errors: cycleResult.errors,
            cycle: null,
            mapped: null,
        };
    }

    const mapperInput = buildMapperInput(entry, card, cycleResult.cycle);
    const mapped = mapParsedEntryToLancamentoV54(mapperInput, deps.mapperOptions);
    if (!mapped.ok) {
        return {
            ok: false,
            errors: mapped.errors,
            cycle: cycleResult.cycle,
            mapped,
        };
    }

    return {
        ok: true,
        errors: [],
        cycle: cycleResult.cycle,
        mapped,
    };
}

module.exports = {
    getConfiguredCards,
    mapSingleCardPurchaseContract,
};

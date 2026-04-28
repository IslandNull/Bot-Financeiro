// ============================================================
// CARD/FATURA CONTRACTS V54 - Apps Script runtime globals
// ============================================================
// Apps Script-compatible mirror of the pure Node contracts used by V54_PRIMARY.
// No CommonJS, Node APIs, spreadsheet clients, external services, or routing changes.

var V54_PROTECTED_FATURA_STATUSES = [
    'fechada',
    'paga',
    'parcialmente_paga',
    'divergente',
    'ajustada',
    'cancelada',
];

var V54_CONTRACT_ALLOWED_PARCELAMENTO_FIELDS = [
    'parcelas_total',
    'numero_parcela',
    'valor_parcela',
];

function makeCardContractsV54Error_(code, field, message) {
    return { code: code, field: field, message: message };
}

function cloneV54ContractObject_(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return JSON.parse(JSON.stringify(value));
}

function cloneV54ContractCard_(card) {
    var source = card && typeof card === 'object' ? card : {};
    var cloned = {};
    Object.keys(source).forEach(function(key) {
        cloned[key] = source[key];
    });
    return cloned;
}

function normalizeV54ContractCell_(value) {
    return value === undefined || value === null ? '' : value;
}

function getConfiguredCards() {
    return [];
}

function findV54ContractCardById_(cards, idCartao) {
    var target = String(idCartao || '').trim();
    if (!target) return null;
    for (var i = 0; i < (cards || []).length; i++) {
        if (String(cards[i] && cards[i].id_cartao || '').trim() === target) {
            return cards[i];
        }
    }
    return null;
}

function normalizeCardContractsV54Deps_(options) {
    var source = options || {};
    return {
        cards: Array.isArray(source.cards)
            ? source.cards.map(cloneV54ContractCard_)
            : getConfiguredCards(),
        mapperOptions: source.mapperOptions || {},
        makeCompraId: typeof source.makeCompraId === 'function' ? source.makeCompraId : makeDefaultCompraV54ContractId_,
        makeParcelaId: typeof source.makeParcelaId === 'function' ? source.makeParcelaId : makeDefaultParcelaV54ContractId_,
    };
}

function normalizeV54CardPurchaseInput_(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    var merged = cloneV54ContractObject_(input);
    if (!merged.competencia && typeof merged.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(merged.data.trim())) {
        merged.competencia = merged.data.trim().slice(0, 7);
    }
    return merged;
}

function validateParsedEntryV54(input) {
    var errors = [];
    var normalized = {};

    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return {
            ok: false,
            errors: [makeCardContractsV54Error_('ENTRY_NOT_OBJECT', 'entry', 'ParsedEntryV54 must be an object.')],
            normalized: normalized,
        };
    }

    Object.keys(input).forEach(function(field) {
        if (V54_ALLOWED_FIELDS.indexOf(field) === -1) {
            errors.push(makeCardContractsV54Error_('UNKNOWN_FIELD', field, 'Unknown ParsedEntryV54 field: ' + field));
        }
    });

    normalizeV54StringField_(input, normalized, errors, 'tipo_evento', { required: true, allowed: V54_ALLOWED_TIPO_EVENTO });
    normalizeV54StringField_(input, normalized, errors, 'data', { required: true, pattern: /^\d{4}-\d{2}-\d{2}$/ });
    normalizeV54StringField_(input, normalized, errors, 'competencia', { required: true, pattern: /^\d{4}-\d{2}$/ });
    normalizeV54StringField_(input, normalized, errors, 'descricao', { required: true });
    normalizeV54StringField_(input, normalized, errors, 'pessoa', { required: true, allowed: V54_ALLOWED_PESSOA });
    normalizeV54StringField_(input, normalized, errors, 'escopo', { required: true, allowed: V54_ALLOWED_ESCOPO });
    normalizeV54StringField_(input, normalized, errors, 'visibilidade', { required: true, allowed: V54_ALLOWED_VISIBILIDADE });
    [
        'id_categoria',
        'id_fonte',
        'id_cartao',
        'id_fatura',
        'id_compra',
        'id_parcela',
        'raw_text',
    ].forEach(function(field) {
        normalizeV54StringField_(input, normalized, errors, field, { required: false });
    });

    normalizeV54PositiveNumberField_(input, normalized, errors, 'valor', { required: true });
    ['afeta_dre', 'afeta_acerto', 'afeta_patrimonio'].forEach(function(field) {
        normalizeV54BooleanField_(input, normalized, errors, field, { required: true });
    });
    normalizeV54ParcelamentoForContract_(input, normalized, errors);
    validateV54ContractEventRules_(normalized, errors);

    return {
        ok: errors.length === 0,
        errors: errors,
        normalized: normalized,
    };
}

function normalizeV54ParcelamentoForContract_(input, normalized, errors) {
    if (!Object.prototype.hasOwnProperty.call(input, 'parcelamento') || input.parcelamento === undefined || input.parcelamento === null) return;
    var parcelamento = input.parcelamento;
    if (typeof parcelamento !== 'object' || Array.isArray(parcelamento)) {
        errors.push(makeCardContractsV54Error_('INVALID_OBJECT', 'parcelamento', 'parcelamento must be an object.'));
        return;
    }
    Object.keys(parcelamento).forEach(function(field) {
        if (V54_CONTRACT_ALLOWED_PARCELAMENTO_FIELDS.indexOf(field) === -1) {
            errors.push(makeCardContractsV54Error_('UNKNOWN_FIELD', 'parcelamento.' + field, 'Unknown parcelamento field: ' + field));
        }
    });

    var normalizedParcelamento = {};
    normalizeV54IntegerField_(parcelamento, normalizedParcelamento, errors, 'parcelas_total', { required: true, min: 2, prefix: 'parcelamento.' });
    normalizeV54IntegerField_(parcelamento, normalizedParcelamento, errors, 'numero_parcela', { required: false, min: 1, prefix: 'parcelamento.' });
    normalizeV54PositiveNumberField_(parcelamento, normalizedParcelamento, errors, 'valor_parcela', { required: false });

    if (normalizedParcelamento.numero_parcela !== undefined
        && normalizedParcelamento.parcelas_total !== undefined
        && normalizedParcelamento.numero_parcela > normalizedParcelamento.parcelas_total) {
        errors.push(makeCardContractsV54Error_('INVALID_INSTALLMENT_NUMBER', 'parcelamento.numero_parcela', 'numero_parcela cannot exceed parcelas_total.'));
    }
    normalized.parcelamento = normalizedParcelamento;
}

function normalizeV54IntegerField_(input, normalized, errors, field, options) {
    var value = input[field];
    var required = Boolean(options && options.required);
    var prefix = options && options.prefix ? options.prefix : '';
    var errorField = prefix + field;
    if (value === undefined || value === null || value === '') {
        if (required) errors.push(makeCardContractsV54Error_('REQUIRED_FIELD', errorField, errorField + ' is required.'));
        return;
    }
    var numeric = parseV54ContractNumber_(value, errorField, errors);
    if (numeric === null) return;
    if (!Number.isInteger(numeric)) {
        errors.push(makeCardContractsV54Error_('INVALID_INTEGER', errorField, errorField + ' must be an integer.'));
        return;
    }
    if (options && options.min !== undefined && numeric < options.min) {
        errors.push(makeCardContractsV54Error_('INVALID_MINIMUM', errorField, errorField + ' must be at least ' + options.min + '.'));
        return;
    }
    normalized[field] = numeric;
}

function validateV54ContractEventRules_(normalized, errors) {
    validateV54EventRules_(normalized, errors);
    if (normalized.tipo_evento === 'compra_cartao' && !normalized.id_cartao) {
        errors.push(makeCardContractsV54Error_('REQUIRED_FOR_EVENT', 'id_cartao', 'id_cartao is required for compra_cartao.'));
    }
    if (normalized.tipo_evento === 'compra_parcelada') {
        if (!normalized.id_cartao) {
            errors.push(makeCardContractsV54Error_('REQUIRED_FOR_EVENT', 'id_cartao', 'id_cartao is required for compra_parcelada.'));
        }
        if (!normalized.parcelamento) {
            errors.push(makeCardContractsV54Error_('REQUIRED_FOR_EVENT', 'parcelamento', 'parcelamento is required for compra_parcelada.'));
        }
    } else if (normalized.parcelamento) {
        errors.push(makeCardContractsV54Error_('INVALID_FOR_EVENT', 'parcelamento', 'parcelamento is only allowed for compra_parcelada.'));
    }
    if (normalized.tipo_evento === 'pagamento_fatura') {
        if (!normalized.id_fatura) {
            errors.push(makeCardContractsV54Error_('REQUIRED_FOR_EVENT', 'id_fatura', 'id_fatura is required for pagamento_fatura.'));
        }
        if (normalized.afeta_dre !== false) {
            errors.push(makeCardContractsV54Error_('INVALID_DRE_FLAG', 'afeta_dre', 'pagamento_fatura must not affect DRE.'));
        }
    }
}

function mapParsedEntryToLancamentoV54(input, options) {
    var validation = validateParsedEntryV54(input);
    if (!validation.ok) {
        return {
            ok: false,
            errors: validation.errors,
            validation: validation,
            headers: V54_LANCAMENTOS_HEADERS.slice(),
            rowObject: null,
            rowValues: [],
        };
    }

    var deps = options || {};
    var entry = validation.normalized;
    var rowObject = {
        id_lancamento: typeof deps.makeId === 'function' ? deps.makeId(entry) : makeDefaultLancamentoV54Id_(entry),
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
        created_at: typeof deps.now === 'function' ? deps.now() : new Date().toISOString(),
    };
    var headers = V54_LANCAMENTOS_HEADERS.slice();
    var rowValues = headers.map(function(header) {
        return normalizeV54ContractCell_(rowObject[header]);
    });
    return {
        ok: true,
        errors: [],
        validation: validation,
        headers: headers,
        rowObject: rowObject,
        rowValues: rowValues,
    };
}

function buildV54CardMapperInput_(normalizedEntry, resolvedCard, cycle) {
    var input = cloneV54ContractObject_(normalizedEntry);
    input.competencia = cycle.competencia;
    input.id_cartao = String(resolvedCard.id_cartao || '').trim();
    input.id_fatura = cycle.id_fatura;
    input.id_fonte = String(resolvedCard.id_fonte || '').trim();
    input.id_compra = '';
    input.id_parcela = '';
    return input;
}

function mapSingleCardPurchaseContract(input, options) {
    var deps = normalizeCardContractsV54Deps_(options);
    var normalizedInput = normalizeV54CardPurchaseInput_(input);
    if (!normalizedInput) {
        return { ok: false, errors: [makeCardContractsV54Error_('ENTRY_NOT_OBJECT', 'entry', 'Card purchase candidate must be an object.')], cycle: null, mapped: null };
    }
    var parsed = validateParsedEntryV54(normalizedInput);
    if (!parsed.ok) return { ok: false, errors: parsed.errors, cycle: null, mapped: null };
    var entry = parsed.normalized;
    if (entry.tipo_evento !== 'compra_cartao') {
        return {
            ok: false,
            errors: [makeCardContractsV54Error_('UNSUPPORTED_EVENT', 'tipo_evento', 'This helper only supports compra_cartao in Phase 4B-contract.')],
            cycle: null,
            mapped: null,
        };
    }

    var card = findV54ContractCardById_(deps.cards, entry.id_cartao);
    if (!card) return { ok: false, errors: [makeCardContractsV54Error_('UNKNOWN_CARD', 'id_cartao', 'Unknown card id: ' + entry.id_cartao + '.')], cycle: null, mapped: null };
    if (card.ativo === false) return { ok: false, errors: [makeCardContractsV54Error_('INACTIVE_CARD', 'id_cartao', 'Card is inactive: ' + card.id_cartao + '.')], cycle: null, mapped: null };
    var cardSourceId = String(card.id_fonte || '').trim();
    if (!cardSourceId) return { ok: false, errors: [makeCardContractsV54Error_('CARD_SOURCE_MISSING', 'id_fonte', 'Card ' + card.id_cartao + ' has no id_fonte.')], cycle: null, mapped: null };
    if (entry.id_fonte && entry.id_fonte !== cardSourceId) {
        return { ok: false, errors: [makeCardContractsV54Error_('CARD_SOURCE_CONFLICT', 'id_fonte', 'Input id_fonte ' + entry.id_fonte + ' conflicts with card source ' + cardSourceId + '.')], cycle: null, mapped: null };
    }

    var cycleResult = assignPurchaseToInvoiceCycle(entry.data, card);
    if (!cycleResult.ok) return { ok: false, errors: cycleResult.errors, cycle: null, mapped: null };
    var mapped = mapParsedEntryToLancamentoV54(buildV54CardMapperInput_(entry, card, cycleResult.cycle), deps.mapperOptions);
    if (!mapped.ok) return { ok: false, errors: mapped.errors, cycle: cycleResult.cycle, mapped: mapped };
    return { ok: true, errors: [], cycle: cycleResult.cycle, mapped: mapped };
}

function pad2V54Contract_(value) {
    return String(value).padStart(2, '0');
}

function formatIsoDateV54Contract_(date) {
    return date.getFullYear() + '-' + pad2V54Contract_(date.getMonth() + 1) + '-' + pad2V54Contract_(date.getDate());
}

function formatCompetenciaV54Contract_(date) {
    return date.getFullYear() + '-' + pad2V54Contract_(date.getMonth() + 1);
}

function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

function clampDayToMonth(year, month, day) {
    return Math.min(Number(day), daysInMonth(year, month));
}

function parseIsoDate(value) {
    var text = String(value || '').trim();
    var match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return { ok: false, error: makeCardContractsV54Error_('INVALID_DATE', 'purchaseDate', 'Date must use YYYY-MM-DD format.') };
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    if (month < 1 || month > 12) return { ok: false, error: makeCardContractsV54Error_('INVALID_DATE', 'purchaseDate', 'Date month must be between 01 and 12.') };
    var maxDay = daysInMonth(year, month);
    if (day < 1 || day > maxDay) return { ok: false, error: makeCardContractsV54Error_('INVALID_DATE', 'purchaseDate', 'Date day is outside the month.') };
    return { ok: true, date: new Date(year, month - 1, day) };
}

function validateCardConfig(card) {
    var normalized = cloneV54ContractCard_(card);
    var errors = [];
    if (!String(normalized.id_cartao || '').trim()) errors.push(makeCardContractsV54Error_('REQUIRED_FIELD', 'id_cartao', 'Card must define id_cartao.'));
    [
        ['fechamento_dia', 'closing day'],
        ['vencimento_dia', 'due day'],
    ].forEach(function(item) {
        var field = item[0];
        var label = item[1];
        var value = Number(normalized[field]);
        if (!Number.isInteger(value)) {
            errors.push(makeCardContractsV54Error_('INVALID_DAY', field, 'Card ' + label + ' must be an integer.'));
            return;
        }
        if (value < 1 || value > 31) {
            errors.push(makeCardContractsV54Error_('INVALID_DAY', field, 'Card ' + label + ' must be between 1 and 31.'));
            return;
        }
        normalized[field] = value;
    });
    if (normalized.ativo === false) errors.push(makeCardContractsV54Error_('INACTIVE_CARD', 'ativo', 'Card must be active for invoice cycle assignment.'));
    normalized.id_cartao = String(normalized.id_cartao || '').trim();
    return { ok: errors.length === 0, errors: errors, normalized: errors.length === 0 ? normalized : null };
}

function addMonthsToYearMonthV54Contract_(year, month, amount) {
    var date = new Date(year, month - 1 + amount, 1);
    return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function dateForClampedDayV54Contract_(year, month, configuredDay) {
    return new Date(year, month - 1, clampDayToMonth(year, month, configuredDay));
}

function compareDatesV54Contract_(a, b) {
    var left = formatIsoDateV54Contract_(a);
    var right = formatIsoDateV54Contract_(b);
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
}

function buildInvoiceId(idCartao, competencia) {
    return 'FAT_' + String(idCartao || '').trim() + '_' + String(competencia || '').replace('-', '_');
}

function assignPurchaseToInvoiceCycle(purchaseDateValue, cardConfig) {
    var parsedDate = parseIsoDate(purchaseDateValue);
    var cardValidation = validateCardConfig(cardConfig);
    var errors = [];
    if (!parsedDate.ok) errors.push(parsedDate.error);
    if (!cardValidation.ok) errors = errors.concat(cardValidation.errors);
    if (errors.length > 0) return { ok: false, errors: errors, cycle: null };

    var purchaseDate = parsedDate.date;
    var card = cardValidation.normalized;
    var closeYear = purchaseDate.getFullYear();
    var closeMonth = purchaseDate.getMonth() + 1;
    var closingDate = dateForClampedDayV54Contract_(closeYear, closeMonth, card.fechamento_dia);
    if (compareDatesV54Contract_(purchaseDate, closingDate) > 0) {
        var next = addMonthsToYearMonthV54Contract_(closeYear, closeMonth, 1);
        closeYear = next.year;
        closeMonth = next.month;
        closingDate = dateForClampedDayV54Contract_(closeYear, closeMonth, card.fechamento_dia);
    }
    var dueMonth = addMonthsToYearMonthV54Contract_(closeYear, closeMonth, 1);
    var dueDate = dateForClampedDayV54Contract_(dueMonth.year, dueMonth.month, card.vencimento_dia);
    var competencia = formatCompetenciaV54Contract_(closingDate);
    return {
        ok: true,
        errors: [],
        cycle: {
            id_fatura: buildInvoiceId(card.id_cartao, competencia),
            id_cartao: card.id_cartao,
            competencia: competencia,
            data_fechamento: formatIsoDateV54Contract_(closingDate),
            data_vencimento: formatIsoDateV54Contract_(dueDate),
        },
    };
}

function mapInstallmentScheduleContract(input, options) {
    var deps = normalizeCardContractsV54Deps_(options);
    var normalizedInput = normalizeV54CardPurchaseInput_(input);
    if (!normalizedInput) return makeV54InstallmentFailure_([makeCardContractsV54Error_('ENTRY_NOT_OBJECT', 'entry', 'Installment purchase candidate must be an object.')]);
    var parsed = validateParsedEntryV54(normalizedInput);
    if (!parsed.ok) return makeV54InstallmentFailure_(parsed.errors, parsed);
    var entry = parsed.normalized;
    if (entry.tipo_evento !== 'compra_parcelada') {
        return makeV54InstallmentFailure_([makeCardContractsV54Error_('UNSUPPORTED_EVENT', 'tipo_evento', 'This helper only supports compra_parcelada in Phase 4C-prep.')], parsed);
    }
    var cardResult = resolveV54InstallmentCard_(entry, deps.cards);
    if (!cardResult.ok) return makeV54InstallmentFailure_(cardResult.errors, parsed);
    var idCompra = deps.makeCompraId(entry);
    if (!String(idCompra || '').trim()) return makeV54InstallmentFailure_([makeCardContractsV54Error_('INVALID_ID', 'id_compra', 'makeCompraId must return a non-empty id.')], parsed);
    var splitResult = splitCentsDeterministically(entry.valor, entry.parcelamento.parcelas_total);
    if (!splitResult.ok) return makeV54InstallmentFailure_(splitResult.errors, parsed);
    var parcelValueValidation = validateProvidedV54ParcelValue_(entry, splitResult);
    if (!parcelValueValidation.ok) return makeV54InstallmentFailure_(parcelValueValidation.errors, parsed);
    var cyclesResult = buildV54ParcelCycles_(entry.data, cardResult.card, entry.parcelamento.parcelas_total);
    if (!cyclesResult.ok) return makeV54InstallmentFailure_(cyclesResult.errors, parsed);

    var parcelas = [];
    for (var i = 0; i < cyclesResult.cycles.length; i++) {
        var numeroParcela = i + 1;
        var idParcela = deps.makeParcelaId(entry, numeroParcela, idCompra);
        if (!String(idParcela || '').trim()) return makeV54InstallmentFailure_([makeCardContractsV54Error_('INVALID_ID', 'id_parcela', 'makeParcelaId must return a non-empty id.')], parsed);
        parcelas.push({
            id_parcela: idParcela,
            id_compra: idCompra,
            numero_parcela: numeroParcela,
            competencia: cyclesResult.cycles[i].competencia,
            valor_parcela: centsToV54ContractMoney_(splitResult.cents[i]),
            id_fatura: cyclesResult.cycles[i].id_fatura,
            status: 'pendente',
            id_lancamento: '',
        });
    }

    var compraRowObject = {
        id_compra: idCompra,
        data_compra: entry.data,
        id_cartao: cardResult.card.id_cartao,
        descricao: entry.descricao,
        id_categoria: entry.id_categoria,
        valor_total: centsToV54ContractMoney_(splitResult.totalCents),
        parcelas_total: entry.parcelamento.parcelas_total,
        responsavel: entry.pessoa,
        escopo: entry.escopo,
        visibilidade: entry.visibilidade,
        status: 'ativa',
    };
    return {
        ok: true,
        errors: [],
        validation: parsed,
        card: cardResult.card,
        cycles: cyclesResult.cycles,
        compras: buildV54ContractRows_(V54_COMPRAS_PARCELADAS_HEADERS, [compraRowObject]),
        parcelas: buildV54ContractRows_(V54_PARCELAS_AGENDA_HEADERS, parcelas),
    };
}

function resolveV54InstallmentCard_(entry, cards) {
    var card = findV54ContractCardById_(cards, entry.id_cartao);
    if (!card) return { ok: false, errors: [makeCardContractsV54Error_('UNKNOWN_CARD', 'id_cartao', 'Unknown card id: ' + entry.id_cartao + '.')] };
    if (card.ativo === false) return { ok: false, errors: [makeCardContractsV54Error_('INACTIVE_CARD', 'id_cartao', 'Card is inactive: ' + card.id_cartao + '.')] };
    var cardSourceId = String(card.id_fonte || '').trim();
    if (!cardSourceId) return { ok: false, errors: [makeCardContractsV54Error_('CARD_SOURCE_MISSING', 'id_fonte', 'Card ' + card.id_cartao + ' has no id_fonte.')] };
    if (entry.id_fonte && entry.id_fonte !== cardSourceId) {
        return { ok: false, errors: [makeCardContractsV54Error_('CARD_SOURCE_CONFLICT', 'id_fonte', 'Input id_fonte ' + entry.id_fonte + ' conflicts with card source ' + cardSourceId + '.')] };
    }
    return { ok: true, errors: [], card: cloneV54ContractCard_(card) };
}

function buildV54ParcelCycles_(purchaseDate, card, parcelasTotal) {
    var cycles = [];
    var cycleDate = purchaseDate;
    for (var i = 0; i < parcelasTotal; i++) {
        var result = assignPurchaseToInvoiceCycle(cycleDate, card);
        if (!result.ok) return { ok: false, errors: result.errors, cycles: [] };
        cycles.push(result.cycle);
        cycleDate = nextDayAfterV54Closing_(result.cycle.data_fechamento);
    }
    return { ok: true, errors: [], cycles: cycles };
}

function nextDayAfterV54Closing_(isoDate) {
    var parts = isoDate.split('-').map(Number);
    return formatIsoDateV54Contract_(new Date(parts[0], parts[1] - 1, parts[2] + 1));
}

function splitCentsDeterministically(totalValue, parcelasTotal) {
    var totalCents = moneyToV54ContractCents_(totalValue);
    if (!Number.isInteger(totalCents) || totalCents <= 0) return { ok: false, errors: [makeCardContractsV54Error_('INVALID_MONEY', 'valor', 'valor must convert to positive cents.')] };
    var base = Math.floor(totalCents / parcelasTotal);
    var remainder = totalCents % parcelasTotal;
    var cents = [];
    for (var i = 0; i < parcelasTotal; i++) cents.push(base + (i < remainder ? 1 : 0));
    return { ok: true, errors: [], totalCents: totalCents, cents: cents };
}

function validateProvidedV54ParcelValue_(entry, splitResult) {
    var providedParcelValue = entry && entry.parcelamento ? entry.parcelamento.valor_parcela : undefined;
    if (providedParcelValue === undefined) return { ok: true, errors: [] };
    var providedCents = moneyToV54ContractCents_(providedParcelValue);
    var matchesAllParcels = splitResult.cents.every(function(centValue) { return centValue === providedCents; });
    if (matchesAllParcels) return { ok: true, errors: [] };
    var expectedValues = splitResult.cents.map(centsToV54ContractMoney_);
    return {
        ok: false,
        errors: [makeCardContractsV54Error_('PARCEL_VALUE_MISMATCH', 'parcelamento.valor_parcela', 'parcelamento.valor_parcela must match deterministic split: [' + expectedValues.join(', ') + '].')],
    };
}

function moneyToV54ContractCents_(value) {
    var numeric = Number(value);
    if (!Number.isFinite(numeric)) return NaN;
    return Math.round(numeric * 100);
}

function centsToV54ContractMoney_(cents) {
    return Number((cents / 100).toFixed(2));
}

function buildV54ContractRows_(headers, rowObjects) {
    return {
        headers: headers.slice(),
        rowObjects: rowObjects.map(cloneV54ContractObject_),
        rowValues: rowObjects.map(function(row) {
            return headers.map(function(header) {
                return normalizeV54ContractCell_(row[header]);
            });
        }),
    };
}

function makeDefaultCompraV54ContractId_(entry) {
    var date = String(entry && entry.data ? entry.data : '0000-00-00').replace(/-/g, '');
    var card = String(entry && entry.id_cartao ? entry.id_cartao : 'CARD');
    var description = String(entry && entry.descricao ? entry.descricao : 'COMPRA')
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 24);
    return 'CP_' + card + '_' + date + '_' + (description || 'COMPRA');
}

function makeDefaultParcelaV54ContractId_(entry, numeroParcela, idCompra) {
    return idCompra + '_P' + String(numeroParcela).padStart(2, '0');
}

function makeV54InstallmentFailure_(errors, validation) {
    return {
        ok: false,
        errors: errors,
        validation: validation || null,
        card: null,
        cycles: [],
        compras: { headers: V54_COMPRAS_PARCELADAS_HEADERS.slice(), rowObjects: [], rowValues: [] },
        parcelas: { headers: V54_PARCELAS_AGENDA_HEADERS.slice(), rowObjects: [], rowValues: [] },
    };
}

function validateFaturasHeaders(headers) {
    if (!Array.isArray(headers) || headers.length !== V54_FATURAS_HEADERS.length) {
        return { ok: false, errors: [makeCardContractsV54Error_('HEADER_MISMATCH', V54_FATURAS_SHEET, 'Faturas headers must match the V54 schema.')] };
    }
    for (var i = 0; i < V54_FATURAS_HEADERS.length; i++) {
        if (headers[i] !== V54_FATURAS_HEADERS[i]) {
            return { ok: false, errors: [makeCardContractsV54Error_('HEADER_MISMATCH', V54_FATURAS_SHEET, 'Faturas headers must match the V54 schema.')] };
        }
    }
    return { ok: true, errors: [] };
}

function expectedFaturaItemFromCardPurchase(cardPurchaseResult) {
    if (!cardPurchaseResult || typeof cardPurchaseResult !== 'object') return null;
    var cycle = cardPurchaseResult.cycle || {};
    var mapped = cardPurchaseResult.mapped || {};
    var rowObject = mapped.rowObject || {};
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
    var parcelas = scheduleResult.parcelas && Array.isArray(scheduleResult.parcelas.rowObjects) ? scheduleResult.parcelas.rowObjects : [];
    var cycles = Array.isArray(scheduleResult.cycles) ? scheduleResult.cycles : [];
    return parcelas.filter(function(parcela) {
        return parcela && parcela.status === 'pendente';
    }).map(function(parcela, index) {
        var cycle = cycles[index] || {};
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
    var source = input || {};
    var headers = source.headers || V54_FATURAS_HEADERS;
    var headerCheck = validateFaturasHeaders(headers);
    if (!headerCheck.ok) return makeV54FaturasFailure_(headerCheck.errors, headers);
    var existingRows = Array.isArray(source.existingRows) ? source.existingRows.map(cloneV54ContractObject_) : [];
    var expectedItems = Array.isArray(source.expectedItems) ? source.expectedItems.map(cloneV54ContractObject_) : [];
    var groupedResult = groupV54ExpectedFaturaItems_(expectedItems);
    if (!groupedResult.ok) return makeV54FaturasFailure_(groupedResult.errors, headers);

    var existingById = {};
    var duplicateErrors = [];
    existingRows.forEach(function(row, index) {
        var id = String(row.id_fatura || '').trim();
        if (!id) {
            duplicateErrors.push(makeCardContractsV54Error_('MISSING_ID_FATURA', 'id_fatura', 'Existing Faturas rows must include id_fatura.'));
            return;
        }
        if (existingById[id]) {
            duplicateErrors.push(makeCardContractsV54Error_('DUPLICATE_FATURA', 'id_fatura', 'Duplicate existing Faturas row for ' + id + '.'));
            return;
        }
        existingById[id] = { row: row, rowNumber: row._rowNumber || index + 2 };
    });
    if (duplicateErrors.length > 0) return makeV54FaturasFailure_(duplicateErrors, headers);

    var actions = [];
    var finalRows = [];
    groupedResult.items.forEach(function(item) {
        var existing = existingById[item.id_fatura];
        if (!existing) {
            var rowObject = buildNewV54FaturaRow_(item);
            actions.push({ type: 'append', rowNumber: null, id_fatura: rowObject.id_fatura, rowObject: rowObject, rowValues: buildV54FaturaRowValues_(rowObject) });
            finalRows.push(rowObject);
            return;
        }
        var normalizedExistingRow = normalizeExistingV54FaturaRow_(existing.row);
        var status = normalizedExistingRow.status;
        if (V54_PROTECTED_FATURA_STATUSES.indexOf(status) !== -1) {
            actions.push({ type: 'protected_skip', rowNumber: existing.rowNumber, id_fatura: item.id_fatura, rowObject: cloneV54ContractObject_(normalizedExistingRow), rowValues: buildV54FaturaRowValues_(normalizedExistingRow), reason: 'Fatura status ' + status + ' is protected for expected upsert.' });
            return;
        }
        if (status !== 'prevista') {
            actions.push({ type: 'invalid_skip', rowNumber: existing.rowNumber, id_fatura: item.id_fatura, rowObject: cloneV54ContractObject_(normalizedExistingRow), rowValues: buildV54FaturaRowValues_(normalizedExistingRow), reason: 'Fatura status ' + (status || '(blank)') + ' is not eligible for expected upsert.' });
            return;
        }
        var consistencyErrors = validateExistingV54FaturaCycleMatches_(normalizedExistingRow, item);
        if (consistencyErrors.length > 0) {
            actions.push({ type: 'invalid_skip', rowNumber: existing.rowNumber, id_fatura: item.id_fatura, rowObject: cloneV54ContractObject_(normalizedExistingRow), rowValues: buildV54FaturaRowValues_(normalizedExistingRow), errors: consistencyErrors });
            return;
        }
        var updated = cloneV54ContractObject_(normalizedExistingRow);
        updated.valor_previsto = centsToV54ContractMoney_(moneyToV54ContractCents_(normalizedExistingRow.valor_previsto || 0) + item.valor_cents);
        updated.valor_fechado = normalizeV54FaturaBlank_(normalizedExistingRow.valor_fechado);
        updated.valor_pago = normalizeV54FaturaBlank_(normalizedExistingRow.valor_pago);
        updated.fonte_pagamento = normalizeV54FaturaBlank_(normalizedExistingRow.fonte_pagamento);
        updated.status = 'prevista';
        delete updated._rowNumber;
        actions.push({ type: 'update', rowNumber: existing.rowNumber, id_fatura: item.id_fatura, rowObject: updated, rowValues: buildV54FaturaRowValues_(updated), previousRowObject: cloneV54ContractObject_(normalizedExistingRow) });
        finalRows.push(updated);
    });

    var blockingActions = actions.filter(function(action) { return action.type === 'protected_skip' || action.type === 'invalid_skip'; });
    if (blockingActions.length > 0) {
        var errors = [];
        blockingActions.forEach(function(action) {
            if (Array.isArray(action.errors) && action.errors.length > 0) {
                errors = errors.concat(action.errors);
            } else {
                errors.push(makeCardContractsV54Error_(action.type === 'protected_skip' ? 'PROTECTED_FATURA_STATUS' : 'INVALID_FATURA_STATUS', 'status', action.reason));
            }
        });
        return makeV54FaturasFailure_(errors, headers, actions);
    }
    return {
        ok: true,
        errors: [],
        headers: V54_FATURAS_HEADERS.slice(),
        actions: actions,
        rowObjects: finalRows,
        rowValues: finalRows.map(buildV54FaturaRowValues_),
        payments: [],
        dreRows: [],
    };
}

function groupV54ExpectedFaturaItems_(items) {
    var groups = {};
    var order = [];
    var errors = [];
    items.forEach(function(item, index) {
        var normalized = normalizeV54ExpectedFaturaItem_(item, index);
        if (!normalized.ok) {
            errors = errors.concat(normalized.errors);
            return;
        }
        var current = groups[normalized.item.id_fatura];
        if (!current) {
            groups[normalized.item.id_fatura] = normalized.item;
            order.push(normalized.item.id_fatura);
            return;
        }
        ['id_cartao', 'competencia', 'data_fechamento', 'data_vencimento'].forEach(function(field) {
            if (current[field] !== normalized.item[field]) {
                errors.push(makeCardContractsV54Error_('FATURA_CYCLE_CONFLICT', field, 'Expected item conflicts for ' + normalized.item.id_fatura + '.'));
            }
        });
        current.valor_cents += normalized.item.valor_cents;
        current.valor = centsToV54ContractMoney_(current.valor_cents);
    });
    if (errors.length > 0) return { ok: false, errors: errors, items: [] };
    return { ok: true, errors: [], items: order.map(function(id) { return groups[id]; }) };
}

function normalizeV54ExpectedFaturaItem_(item, index) {
    var errors = [];
    var normalized = {};
    ['id_fatura', 'id_cartao', 'competencia', 'data_fechamento', 'data_vencimento'].forEach(function(field) {
        var value = String(item && item[field] !== undefined && item[field] !== null ? item[field] : '').trim();
        if (!value) errors.push(makeCardContractsV54Error_('REQUIRED_FIELD', field, 'Expected fatura item ' + (index + 1) + ' must include ' + field + '.'));
        normalized[field] = value;
    });
    if (normalized.competencia && !/^\d{4}-\d{2}$/.test(normalized.competencia)) {
        errors.push(makeCardContractsV54Error_('INVALID_FORMAT', 'competencia', 'Fatura competencia must use YYYY-MM.'));
    }
    ['data_fechamento', 'data_vencimento'].forEach(function(field) {
        if (normalized[field] && !/^\d{4}-\d{2}-\d{2}$/.test(normalized[field])) {
            errors.push(makeCardContractsV54Error_('INVALID_FORMAT', field, field + ' must use YYYY-MM-DD.'));
        }
    });
    var valorCents = moneyToV54ContractCents_(item ? item.valor : undefined);
    if (!Number.isInteger(valorCents) || valorCents <= 0) {
        errors.push(makeCardContractsV54Error_('INVALID_MONEY', 'valor', 'Expected fatura item valor must be positive.'));
    }
    normalized.valor_cents = valorCents;
    normalized.valor = centsToV54ContractMoney_(valorCents);
    return { ok: errors.length === 0, errors: errors, item: normalized };
}

function validateExistingV54FaturaCycleMatches_(existing, item) {
    var errors = [];
    ['id_cartao', 'competencia', 'data_fechamento', 'data_vencimento'].forEach(function(field) {
        if (existing[field] !== item[field]) {
            errors.push(makeCardContractsV54Error_('FATURA_CYCLE_CONFLICT', field, 'Existing Faturas row conflicts with expected cycle for ' + item.id_fatura + '.'));
        }
    });
    return errors;
}

function normalizeExistingV54FaturaRow_(row) {
    var source = row && typeof row === 'object' ? row : {};
    var normalized = cloneV54ContractObject_(source);
    normalized.id_fatura = normalizeV54FaturaString_(source.id_fatura);
    normalized.id_cartao = normalizeV54FaturaString_(source.id_cartao);
    normalized.competencia = normalizeV54FaturaCompetencia_(source.competencia);
    normalized.data_fechamento = normalizeV54FaturaIsoDate_(source.data_fechamento);
    normalized.data_vencimento = normalizeV54FaturaIsoDate_(source.data_vencimento);
    normalized.valor_previsto = normalizeV54FaturaMoney_(source.valor_previsto);
    normalized.valor_fechado = normalizeV54FaturaMoney_(source.valor_fechado);
    normalized.valor_pago = normalizeV54FaturaMoney_(source.valor_pago);
    normalized.fonte_pagamento = normalizeV54FaturaString_(source.fonte_pagamento);
    normalized.status = normalizeV54FaturaString_(source.status);
    return normalized;
}

function normalizeV54FaturaString_(value) {
    return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeV54FaturaCompetencia_(value) {
    if (isV54FaturaDateObject_(value)) return formatCompetenciaV54Contract_(value);
    var text = normalizeV54FaturaString_(value);
    if (!text) return '';
    if (/^\d{4}-\d{2}$/.test(text)) return text;
    var isoDate = normalizeV54FaturaIsoDate_(text);
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate.slice(0, 7);
    var monthYear = text.match(/^(\d{1,2})\/(\d{4})$/);
    if (monthYear) return monthYear[2] + '-' + pad2V54Contract_(Number(monthYear[1]));
    return text;
}

function normalizeV54FaturaIsoDate_(value) {
    if (isV54FaturaDateObject_(value)) return formatIsoDateV54Contract_(value);
    var text = normalizeV54FaturaString_(value);
    if (!text) return '';
    var iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
    if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
    var br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (br) return br[3] + '-' + pad2V54Contract_(Number(br[2])) + '-' + pad2V54Contract_(Number(br[1]));
    return text;
}

function normalizeV54FaturaMoney_(value) {
    if (value === undefined || value === null || value === '') return '';
    var numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : normalizeV54FaturaString_(value);
}

function isV54FaturaDateObject_(value) {
    return Object.prototype.toString.call(value) === '[object Date]' && Number.isFinite(value.getTime());
}

function buildNewV54FaturaRow_(item) {
    return {
        id_fatura: item.id_fatura,
        id_cartao: item.id_cartao,
        competencia: item.competencia,
        data_fechamento: item.data_fechamento,
        data_vencimento: item.data_vencimento,
        valor_previsto: centsToV54ContractMoney_(item.valor_cents),
        valor_fechado: '',
        valor_pago: '',
        fonte_pagamento: '',
        status: 'prevista',
    };
}

function buildV54FaturaRowValues_(rowObject) {
    return V54_FATURAS_HEADERS.map(function(header) {
        return normalizeV54FaturaBlank_(rowObject[header]);
    });
}

function normalizeV54FaturaBlank_(value) {
    return value === undefined || value === null ? '' : value;
}

function makeV54FaturasFailure_(errors, headers, actions) {
    return {
        ok: false,
        errors: errors,
        headers: Array.isArray(headers) ? headers.slice() : [],
        actions: Array.isArray(actions) ? actions : [],
        rowObjects: [],
        rowValues: [],
        payments: [],
        dreRows: [],
    };
}

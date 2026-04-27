// ============================================================
// ACTIONS V54 - MVP local/fake-first
// ============================================================
// This file is intentionally not wired into doPost/routing yet.
// Temporary duplication: Apps Script does not consume Node/CommonJS modules directly,
// so the Lancamentos_V54 headers and ParsedEntryV54 validation rules are mirrored
// here and covered by local parity tests against scripts/lib/v54-schema.js.

var V54_LANCAMENTOS_SHEET = 'Lancamentos_V54';
var V54_COMPRAS_PARCELADAS_SHEET = 'Compras_Parceladas';
var V54_PARCELAS_AGENDA_SHEET = 'Parcelas_Agenda';
var V54_FATURAS_SHEET = 'Faturas';
var V54_ACTIONS_MVP_SUPPORTED_EVENTS = ['despesa', 'receita', 'transferencia', 'aporte', 'compra_cartao', 'compra_parcelada'];
var V54_ACTIONS_UNSUPPORTED_EVENTS = ['pagamento_fatura', 'divida_pagamento', 'ajuste'];
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
var V54_COMPRAS_PARCELADAS_HEADERS = [
    'id_compra',
    'data_compra',
    'id_cartao',
    'descricao',
    'id_categoria',
    'valor_total',
    'parcelas_total',
    'responsavel',
    'escopo',
    'visibilidade',
    'status',
];
var V54_PARCELAS_AGENDA_HEADERS = [
    'id_parcela',
    'id_compra',
    'numero_parcela',
    'competencia',
    'valor_parcela',
    'id_fatura',
    'status',
    'id_lancamento',
];
var V54_FATURAS_HEADERS = [
    'id_fatura',
    'id_cartao',
    'competencia',
    'data_fechamento',
    'data_vencimento',
    'valor_previsto',
    'valor_fechado',
    'valor_pago',
    'fonte_pagamento',
    'status',
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
        return makeActionsV54Failure_('UNSUPPORTED_EVENT', 'tipo_evento', 'Phase 4C-actions does not support ' + input.tipo_evento + '.', null);
    }

    if (!input || V54_ACTIONS_MVP_SUPPORTED_EVENTS.indexOf(input.tipo_evento) === -1) {
        return makeActionsV54Failure_('UNSUPPORTED_EVENT', 'tipo_evento', 'Phase 4C-actions supports only despesa, receita, transferencia, aporte, compra_cartao, and compra_parcelada.', null);
    }

    return deps.withLock('recordEntryV54', function() {
        if (input.tipo_evento === 'compra_parcelada') {
            return writeInstallmentPurchaseRows_(input, deps);
        }

        var mapping = mapEntryForRecordV54_(input, deps);
        var mapped = mapping.mapped;

        if (!mapping.ok) {
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

        var faturasPlan = null;
        if (input.tipo_evento === 'compra_cartao') {
            faturasPlan = planCardPurchaseFaturaUpsert_(spreadsheet, mapping, deps);
            if (!faturasPlan.ok) {
                return makeActionsV54FailureWithSheet_(
                    V54_FATURAS_SHEET,
                    null,
                    null,
                    null,
                    null,
                    faturasPlan.errors
                );
            }
        }

        var rowNumber = sheet.getLastRow() + 1;
        sheet.getRange(rowNumber, 1, 1, V54_LANCAMENTOS_HEADERS.length).setValues([mapped.rowValues]);
        var faturasWriteResult = faturasPlan ? applyFaturasPlan_(faturasPlan.sheet, faturasPlan.plan) : null;

        return {
            ok: true,
            sheet: V54_LANCAMENTOS_SHEET,
            rowNumber: rowNumber,
            id_lancamento: mapped.rowObject.id_lancamento,
            rowObject: mapped.rowObject,
            rowValues: mapped.rowValues,
            cycle: mapping.cycle || null,
            faturas: faturasWriteResult,
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
        makeCompraId: typeof source.makeCompraId === 'function'
            ? source.makeCompraId
            : makeDefaultCompraV54Id_,
        mapSingleCardPurchaseContract: typeof source.mapSingleCardPurchaseContract === 'function'
            ? source.mapSingleCardPurchaseContract
            : null,
        mapInstallmentScheduleContract: typeof source.mapInstallmentScheduleContract === 'function'
            ? source.mapInstallmentScheduleContract
            : null,
        planExpectedFaturasUpsert: typeof source.planExpectedFaturasUpsert === 'function'
            ? source.planExpectedFaturasUpsert
            : null,
        cards: cloneV54Cards_(source.cards),
    };
}

function mapEntryForRecordV54_(input, deps) {
    if (input && input.tipo_evento === 'compra_cartao') {
        var cardContractMapper = getCardPurchaseContractMapper_(deps);
        if (!cardContractMapper) {
            return {
                ok: false,
                mapped: {
                    ok: false,
                    errors: [
                        makeV54ContractError_(
                            'CARD_CONTRACT_UNAVAILABLE',
                            'tipo_evento',
                            'mapSingleCardPurchaseContract dependency is required for compra_cartao in Phase 4B-actions.',
                        ),
                    ],
                    rowObject: null,
                    rowValues: [],
                },
                cycle: null,
            };
        }

        return normalizeCardPurchaseContractResult_(cardContractMapper(input, buildCardPurchaseContractOptions_(deps)));
    }

    var mappedSimple = mapParsedEntryToLancamentoV54_(input, {
            now: deps.now,
            makeId: deps.makeId,
        });

    return {
        ok: mappedSimple.ok,
        mapped: mappedSimple,
        cycle: null,
    };
}

function getCardPurchaseContractMapper_(deps) {
    if (deps && typeof deps.mapSingleCardPurchaseContract === 'function') {
        return deps.mapSingleCardPurchaseContract;
    }
    if (typeof mapSingleCardPurchaseContract === 'function') {
        return mapSingleCardPurchaseContract;
    }
    return null;
}

function buildCardPurchaseContractOptions_(deps) {
    var options = {
        mapperOptions: {
            now: deps.now,
            makeId: deps.makeId,
        },
    };
    if (Array.isArray(deps.cards)) {
        options.cards = cloneV54Cards_(deps.cards);
    }
    return options;
}

function getInstallmentScheduleContractMapper_(deps) {
    if (deps && typeof deps.mapInstallmentScheduleContract === 'function') {
        return deps.mapInstallmentScheduleContract;
    }
    if (typeof mapInstallmentScheduleContract === 'function') {
        return mapInstallmentScheduleContract;
    }
    return null;
}

function buildInstallmentScheduleContractOptions_(deps) {
    var options = {
        makeCompraId: deps.makeCompraId,
    };
    if (Array.isArray(deps.cards)) {
        options.cards = cloneV54Cards_(deps.cards);
    }
    return options;
}

function writeInstallmentPurchaseRows_(input, deps) {
    var scheduleMapper = getInstallmentScheduleContractMapper_(deps);
    if (!scheduleMapper) {
        return makeActionsV54FailureWithSheet_(
            V54_COMPRAS_PARCELADAS_SHEET,
            'INSTALLMENT_CONTRACT_UNAVAILABLE',
            'tipo_evento',
            'mapInstallmentScheduleContract dependency is required for compra_parcelada in Phase 4C-actions.',
            null,
            []
        );
    }

    var schedule = scheduleMapper(input, buildInstallmentScheduleContractOptions_(deps));
    if (!schedule || typeof schedule !== 'object') {
        return makeActionsV54FailureWithSheet_(
            V54_COMPRAS_PARCELADAS_SHEET,
            'INSTALLMENT_CONTRACT_INVALID_RESULT',
            'result',
            'Installment schedule contract returned an invalid result.',
            null,
            []
        );
    }

    if (schedule.ok !== true) {
        return makeActionsV54FailureWithSheet_(
            V54_COMPRAS_PARCELADAS_SHEET,
            null,
            null,
            null,
            null,
            Array.isArray(schedule.errors) ? schedule.errors : []
        );
    }

    var compras = schedule.compras && typeof schedule.compras === 'object' ? schedule.compras : null;
    var parcelas = schedule.parcelas && typeof schedule.parcelas === 'object' ? schedule.parcelas : null;
    var compraRowValues = compras && Array.isArray(compras.rowValues) ? compras.rowValues : [];
    var compraRowObjects = compras && Array.isArray(compras.rowObjects) ? compras.rowObjects : [];
    var parcelaRowValues = parcelas && Array.isArray(parcelas.rowValues) ? parcelas.rowValues : [];
    var parcelaRowObjects = parcelas && Array.isArray(parcelas.rowObjects) ? parcelas.rowObjects : [];

    if (compraRowValues.length !== 1 || compraRowObjects.length !== 1) {
        return makeActionsV54FailureWithSheet_(
            V54_COMPRAS_PARCELADAS_SHEET,
            'INVALID_INSTALLMENT_ROWS',
            'compras',
            'Installment contract must return exactly one Compras_Parceladas row.',
            null,
            []
        );
    }
    if (parcelaRowValues.length <= 0 || parcelaRowValues.length !== parcelaRowObjects.length) {
        return makeActionsV54FailureWithSheet_(
            V54_PARCELAS_AGENDA_SHEET,
            'INVALID_INSTALLMENT_ROWS',
            'parcelas',
            'Installment contract must return one or more Parcelas_Agenda rows.',
            null,
            []
        );
    }

    if (compraRowValues[0].length !== V54_COMPRAS_PARCELADAS_HEADERS.length) {
        return makeActionsV54FailureWithSheet_(
            V54_COMPRAS_PARCELADAS_SHEET,
            'ROW_WIDTH_MISMATCH',
            'compras.rowValues',
            'Compras_Parceladas row must match V54 schema width.',
            null,
            []
        );
    }
    for (var i = 0; i < parcelaRowValues.length; i++) {
        if (parcelaRowValues[i].length !== V54_PARCELAS_AGENDA_HEADERS.length) {
            return makeActionsV54FailureWithSheet_(
                V54_PARCELAS_AGENDA_SHEET,
                'ROW_WIDTH_MISMATCH',
                'parcelas.rowValues',
                'Parcelas_Agenda row must match V54 schema width.',
                null,
                []
            );
        }
    }

    var spreadsheet = deps.getSpreadsheet();
    var comprasSheet = spreadsheet && spreadsheet.getSheetByName(V54_COMPRAS_PARCELADAS_SHEET);
    if (!comprasSheet) {
        return makeActionsV54FailureWithSheet_(
            V54_COMPRAS_PARCELADAS_SHEET,
            'MISSING_SHEET',
            V54_COMPRAS_PARCELADAS_SHEET,
            'Compras_Parceladas sheet was not found.',
            null,
            []
        );
    }
    var parcelasSheet = spreadsheet && spreadsheet.getSheetByName(V54_PARCELAS_AGENDA_SHEET);
    if (!parcelasSheet) {
        return makeActionsV54FailureWithSheet_(
            V54_PARCELAS_AGENDA_SHEET,
            'MISSING_SHEET',
            V54_PARCELAS_AGENDA_SHEET,
            'Parcelas_Agenda sheet was not found.',
            null,
            []
        );
    }

    var comprasHeaderCheck = validateSheetHeaders_(comprasSheet, V54_COMPRAS_PARCELADAS_HEADERS, V54_COMPRAS_PARCELADAS_SHEET);
    if (!comprasHeaderCheck.ok) {
        return makeActionsV54FailureWithSheet_(
            V54_COMPRAS_PARCELADAS_SHEET,
            comprasHeaderCheck.code,
            comprasHeaderCheck.field,
            comprasHeaderCheck.message,
            null,
            []
        );
    }
    var parcelasHeaderCheck = validateSheetHeaders_(parcelasSheet, V54_PARCELAS_AGENDA_HEADERS, V54_PARCELAS_AGENDA_SHEET);
    if (!parcelasHeaderCheck.ok) {
        return makeActionsV54FailureWithSheet_(
            V54_PARCELAS_AGENDA_SHEET,
            parcelasHeaderCheck.code,
            parcelasHeaderCheck.field,
            parcelasHeaderCheck.message,
            null,
            []
        );
    }

    var faturasPlan = planInstallmentFaturasUpsert_(spreadsheet, schedule, deps);
    if (!faturasPlan.ok) {
        return makeActionsV54FailureWithSheet_(
            V54_FATURAS_SHEET,
            null,
            null,
            null,
            null,
            faturasPlan.errors
        );
    }

    var compraRowNumber = comprasSheet.getLastRow() + 1;
    comprasSheet.getRange(compraRowNumber, 1, 1, V54_COMPRAS_PARCELADAS_HEADERS.length).setValues([compraRowValues[0]]);
    var parcelasStartRow = parcelasSheet.getLastRow() + 1;
    parcelasSheet.getRange(parcelasStartRow, 1, parcelaRowValues.length, V54_PARCELAS_AGENDA_HEADERS.length).setValues(parcelaRowValues);
    var faturasWriteResult = applyFaturasPlan_(faturasPlan.sheet, faturasPlan.plan);

    return {
        ok: true,
        sheet: V54_COMPRAS_PARCELADAS_SHEET,
        rowNumber: compraRowNumber,
        id_lancamento: '',
        rowObject: null,
        rowValues: [],
        compra: {
            sheet: V54_COMPRAS_PARCELADAS_SHEET,
            rowNumber: compraRowNumber,
            rowObject: compraRowObjects[0],
            rowValues: compraRowValues[0],
        },
        parcelas: {
            sheet: V54_PARCELAS_AGENDA_SHEET,
            startRow: parcelasStartRow,
            rowCount: parcelaRowValues.length,
            rowObjects: parcelaRowObjects,
            rowValues: parcelaRowValues,
        },
        cycles: Array.isArray(schedule.cycles) ? schedule.cycles : [],
        faturas: faturasWriteResult,
        errors: [],
    };
}

function getExpectedFaturasPlanner_(deps) {
    if (deps && typeof deps.planExpectedFaturasUpsert === 'function') {
        return deps.planExpectedFaturasUpsert;
    }
    if (typeof planExpectedFaturasUpsert === 'function') {
        return planExpectedFaturasUpsert;
    }
    return null;
}

function planCardPurchaseFaturaUpsert_(spreadsheet, mapping, deps) {
    var planner = getExpectedFaturasPlanner_(deps);
    if (!planner) {
        return {
            ok: false,
            errors: [makeV54ContractError_('FATURAS_CONTRACT_UNAVAILABLE', 'Faturas', 'planExpectedFaturasUpsert dependency is required for compra_cartao fatura upsert.')],
        };
    }

    var sheetResult = getAndValidateFaturasSheet_(spreadsheet);
    if (!sheetResult.ok) return sheetResult;

    var cycle = mapping.cycle || {};
    var mapped = mapping.mapped && mapping.mapped.rowObject ? mapping.mapped.rowObject : {};
    var plan = planner({
        headers: V54_FATURAS_HEADERS.slice(),
        existingRows: readSheetRowsAsObjects_(sheetResult.sheet, V54_FATURAS_HEADERS),
        expectedItems: [{
            id_fatura: cycle.id_fatura,
            id_cartao: cycle.id_cartao,
            competencia: cycle.competencia,
            data_fechamento: cycle.data_fechamento,
            data_vencimento: cycle.data_vencimento,
            valor: mapped.valor,
        }],
    });

    if (!plan || plan.ok !== true) {
        return {
            ok: false,
            errors: plan && Array.isArray(plan.errors)
                ? plan.errors
                : [makeV54ContractError_('FATURAS_CONTRACT_INVALID_RESULT', 'Faturas', 'Faturas upsert contract returned an invalid result.')],
        };
    }

    return { ok: true, sheet: sheetResult.sheet, plan: plan, errors: [] };
}

function planInstallmentFaturasUpsert_(spreadsheet, schedule, deps) {
    var planner = getExpectedFaturasPlanner_(deps);
    if (!planner) {
        return {
            ok: false,
            errors: [makeV54ContractError_('FATURAS_CONTRACT_UNAVAILABLE', 'Faturas', 'planExpectedFaturasUpsert dependency is required for compra_parcelada fatura upsert.')],
        };
    }

    var sheetResult = getAndValidateFaturasSheet_(spreadsheet);
    if (!sheetResult.ok) return sheetResult;

    var parcelas = schedule.parcelas && Array.isArray(schedule.parcelas.rowObjects)
        ? schedule.parcelas.rowObjects
        : [];
    var cycles = Array.isArray(schedule.cycles) ? schedule.cycles : [];
    var expectedItems = [];

    for (var i = 0; i < parcelas.length; i++) {
        if (parcelas[i].status !== 'pendente') continue;
        expectedItems.push({
            id_fatura: parcelas[i].id_fatura,
            id_cartao: cycles[i] ? cycles[i].id_cartao : '',
            competencia: parcelas[i].competencia,
            data_fechamento: cycles[i] ? cycles[i].data_fechamento : '',
            data_vencimento: cycles[i] ? cycles[i].data_vencimento : '',
            valor: parcelas[i].valor_parcela,
        });
    }

    var plan = planner({
        headers: V54_FATURAS_HEADERS.slice(),
        existingRows: readSheetRowsAsObjects_(sheetResult.sheet, V54_FATURAS_HEADERS),
        expectedItems: expectedItems,
    });

    if (!plan || plan.ok !== true) {
        return {
            ok: false,
            errors: plan && Array.isArray(plan.errors)
                ? plan.errors
                : [makeV54ContractError_('FATURAS_CONTRACT_INVALID_RESULT', 'Faturas', 'Faturas upsert contract returned an invalid result.')],
        };
    }

    return { ok: true, sheet: sheetResult.sheet, plan: plan, errors: [] };
}

function getAndValidateFaturasSheet_(spreadsheet) {
    var sheet = spreadsheet && spreadsheet.getSheetByName(V54_FATURAS_SHEET);
    if (!sheet) {
        return {
            ok: false,
            errors: [makeV54ContractError_('MISSING_SHEET', V54_FATURAS_SHEET, 'Faturas sheet was not found.')],
        };
    }

    var headerCheck = validateSheetHeaders_(sheet, V54_FATURAS_HEADERS, V54_FATURAS_SHEET);
    if (!headerCheck.ok) {
        return {
            ok: false,
            errors: [makeV54ContractError_(headerCheck.code, headerCheck.field, headerCheck.message)],
        };
    }

    return { ok: true, sheet: sheet, errors: [] };
}

function readSheetRowsAsObjects_(sheet, headers) {
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];

    var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    return values.map(function(rowValues, index) {
        var row = { _rowNumber: index + 2 };
        headers.forEach(function(header, headerIndex) {
            row[header] = rowValues[headerIndex] === undefined || rowValues[headerIndex] === null ? '' : rowValues[headerIndex];
        });
        return row;
    });
}

function applyFaturasPlan_(sheet, plan) {
    var writes = [];
    var actions = Array.isArray(plan.actions) ? plan.actions : [];
    actions.forEach(function(action) {
        if (action.type === 'append') {
            var appendRow = sheet.getLastRow() + 1;
            sheet.getRange(appendRow, 1, 1, V54_FATURAS_HEADERS.length).setValues([action.rowValues]);
            writes.push({
                type: 'append',
                rowNumber: appendRow,
                id_fatura: action.id_fatura,
                rowObject: action.rowObject,
                rowValues: action.rowValues,
            });
            return;
        }

        if (action.type === 'update') {
            sheet.getRange(action.rowNumber, 1, 1, V54_FATURAS_HEADERS.length).setValues([action.rowValues]);
            writes.push({
                type: 'update',
                rowNumber: action.rowNumber,
                id_fatura: action.id_fatura,
                rowObject: action.rowObject,
                rowValues: action.rowValues,
            });
        }
    });

    return {
        sheet: V54_FATURAS_SHEET,
        writes: writes,
        rowObjects: Array.isArray(plan.rowObjects) ? plan.rowObjects : [],
        rowValues: Array.isArray(plan.rowValues) ? plan.rowValues : [],
    };
}

function normalizeCardPurchaseContractResult_(result) {
    if (!result || typeof result !== 'object') {
        return {
            ok: false,
            mapped: {
                ok: false,
                errors: [makeV54ContractError_('CARD_CONTRACT_INVALID_RESULT', 'result', 'Card purchase contract returned an invalid result.')],
                rowObject: null,
                rowValues: [],
            },
            cycle: null,
        };
    }

    var mapped = result.mapped && typeof result.mapped === 'object'
        ? result.mapped
        : {
            ok: false,
            errors: [makeV54ContractError_('CARD_CONTRACT_MAPPED_MISSING', 'mapped', 'Card purchase contract did not return mapped payload.')],
            rowObject: null,
            rowValues: [],
        };

    if (result.ok !== true || mapped.ok !== true) {
        var normalizedErrors = [];

        if (Array.isArray(result.errors) && result.errors.length > 0) {
            normalizedErrors = normalizedErrors.concat(result.errors);
        }

        if (Array.isArray(mapped.errors) && mapped.errors.length > 0) {
            normalizedErrors = normalizedErrors.concat(mapped.errors);
        }

        if (normalizedErrors.length === 0) {
            normalizedErrors.push(makeV54ContractError_('CARD_CONTRACT_REJECTED', 'compra_cartao', 'Card purchase contract rejected the entry.'));
        }

        mapped.ok = false;
        mapped.errors = normalizedErrors;
        mapped.rowObject = mapped.rowObject || null;
        mapped.rowValues = Array.isArray(mapped.rowValues) ? mapped.rowValues : [];

        return {
            ok: false,
            mapped: mapped,
            cycle: result.cycle || null,
        };
    }

    mapped.errors = Array.isArray(mapped.errors) ? mapped.errors : [];
    mapped.rowValues = Array.isArray(mapped.rowValues) ? mapped.rowValues : [];

    return {
        ok: true,
        mapped: mapped,
        cycle: result.cycle || null,
    };
}

function validateLancamentosV54SheetHeaders_(sheet) {
    return validateSheetHeaders_(sheet, V54_LANCAMENTOS_HEADERS, V54_LANCAMENTOS_SHEET);
}

function validateSheetHeaders_(sheet, expectedHeaders, sheetName) {
    var headers = sheet.getRange(1, 1, 1, expectedHeaders.length).getValues()[0];
    for (var i = 0; i < expectedHeaders.length; i++) {
        if (headers[i] !== expectedHeaders[i]) {
            return {
                ok: false,
                code: 'HEADER_MISMATCH',
                field: sheetName,
                message: sheetName + ' headers do not match the V54 schema.',
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

function makeDefaultCompraV54Id_(entry) {
    var stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 17);
    var randomPart = Math.floor(Math.random() * 1000000000).toString(36).toUpperCase();
    var card = String(entry && entry.id_cartao ? entry.id_cartao : 'CARD').replace(/[^A-Z0-9_]/gi, '').toUpperCase();
    return 'CP_V54_' + (card || 'CARD') + '_' + stamp + '_' + randomPart;
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

function makeActionsV54FailureWithSheet_(sheetName, code, field, message, rowObject, errors) {
    var normalizedErrors = Array.isArray(errors) ? errors.filter(function(error) { return error && typeof error === 'object'; }) : [];
    if (normalizedErrors.length === 0 && code) {
        normalizedErrors = [makeV54ContractError_(code, field, message)];
    }

    return {
        ok: false,
        sheet: sheetName,
        rowNumber: null,
        id_lancamento: '',
        rowObject: rowObject || null,
        rowValues: [],
        errors: normalizedErrors,
    };
}

function makeV54ContractError_(code, field, message) {
    return { code: code, field: field, message: message };
}

function cloneV54PlainObject_(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
    return JSON.parse(JSON.stringify(input));
}

function cloneV54Cards_(cards) {
    if (!Array.isArray(cards)) return null;
    return cards.map(function(card) {
        return cloneV54PlainObject_(card);
    });
}

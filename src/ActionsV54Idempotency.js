// ============================================================
// ACTIONS V54 IDEMPOTENCY ADAPTER - fake-first Apps Script seam
// ============================================================
// Loaded as a global Apps Script file. It intentionally does not require()
// Node/CommonJS contracts; local tests inject the planner from scripts/lib.

function recordEntryV54Idempotent_(input, deps) {
    if (!deps.planV54IdempotentWrite) {
        return makeActionsV54Failure_(
            'IDEMPOTENT_WRITE_BOUNDARY_UNAVAILABLE',
            'planV54IdempotentWrite',
            'planV54IdempotentWrite dependency is required when idempotency.enabled is true.',
            null
        );
    }

    if (!deps.idempotency || (!deps.idempotency.input && !deps.idempotency.telegramUpdate)) {
        return makeActionsV54Failure_(
            'IDEMPOTENCY_INPUT_REQUIRED',
            'idempotency',
            'idempotency.input or idempotency.telegramUpdate is required when idempotency.enabled is true.',
            null
        );
    }

    var spreadsheet = deps.getSpreadsheet();
    var idempotencySheetResult = getAndValidateIdempotencyLogSheet_(spreadsheet);
    if (!idempotencySheetResult.ok) {
        return makeActionsV54FailureWithSheet_(
            V54_IDEMPOTENCY_LOG_SHEET,
            null,
            null,
            null,
            null,
            idempotencySheetResult.errors
        );
    }

    var domainPlan = planRecordEntryV54DomainMutation_(input, deps, spreadsheet);
    if (!domainPlan.ok) {
        return makeActionsV54FailureWithSheet_(
            domainPlan.sheet || V54_LANCAMENTOS_SHEET,
            null,
            null,
            null,
            domainPlan.rowObject || null,
            domainPlan.errors
        );
    }

    var boundary = deps.planV54IdempotentWrite({
        parsedEntry: input,
        telegramUpdate: deps.idempotency.telegramUpdate || null,
        idempotencyInput: deps.idempotency.input || null,
        semanticEntry: deps.idempotency.semanticEntry || input,
        existingIdempotencyRows: readRecordEntryV54IdempotencyRows_(idempotencySheetResult.sheet, deps),
        existingFinancialRows: readRecordEntryV54MutationRefs_(spreadsheet, deps),
    }, {
        now: deps.now,
        makeId: deps.makeId,
        recoveryPolicy: deps.idempotency && deps.idempotency.recovery ? deps.idempotency.recovery : null,
        planStaleProcessingRecovery: deps.planStaleProcessingRecovery,
        financialPlanner: function() {
            return domainPlan;
        },
    });

    if (!boundary || typeof boundary !== 'object') {
        return makeActionsV54Failure_(
            'IDEMPOTENT_WRITE_BOUNDARY_INVALID_RESULT',
            'planV54IdempotentWrite',
            'Idempotent write boundary returned an invalid result.',
            null
        );
    }

    if (boundary.ok !== true) {
        return makeIdempotentRecordEntryV54Failure_(boundary);
    }

    var execution = applyRecordEntryV54IdempotentPlans_(boundary.plans || [], {
        idempotencySheet: idempotencySheetResult.sheet,
        spreadsheet: spreadsheet,
    });
    if (!execution.ok) {
        return makeActionsV54FailureWithSheet_(
            execution.sheet || V54_IDEMPOTENCY_LOG_SHEET,
            null,
            null,
            null,
            null,
            execution.errors
        );
    }

    return makeIdempotentRecordEntryV54Success_(boundary, domainPlan, execution);
}

function planRecordEntryV54DomainMutation_(input, deps, spreadsheet) {
    if (input.tipo_evento === 'compra_parcelada') {
        return planInstallmentDomainMutation_(input, deps, spreadsheet);
    }

    return planLancamentoDomainMutation_(input, deps, spreadsheet);
}

function planLancamentoDomainMutation_(input, deps, spreadsheet) {
    var mapping = mapEntryForRecordV54_(input, deps);
    var mapped = mapping.mapped;

    if (!mapping.ok) {
        return {
            ok: false,
            sheet: V54_LANCAMENTOS_SHEET,
            errors: mapped && Array.isArray(mapped.errors) ? mapped.errors : [],
            plan: null,
            result_ref: '',
            mapped: mapped || null,
        };
    }

    var lancamentosSheet = spreadsheet && spreadsheet.getSheetByName(V54_LANCAMENTOS_SHEET);
    if (!lancamentosSheet) {
        return {
            ok: false,
            sheet: V54_LANCAMENTOS_SHEET,
            errors: [makeV54ContractError_('MISSING_SHEET', V54_LANCAMENTOS_SHEET, 'Lancamentos_V54 sheet was not found.')],
        };
    }

    var headerCheck = validateLancamentosV54SheetHeaders_(lancamentosSheet);
    if (!headerCheck.ok) {
        return {
            ok: false,
            sheet: V54_LANCAMENTOS_SHEET,
            errors: [makeV54ContractError_(headerCheck.code, headerCheck.field, headerCheck.message)],
        };
    }

    if (!mapped || !Array.isArray(mapped.rowValues) || mapped.rowValues.length !== V54_LANCAMENTOS_HEADERS.length) {
        return {
            ok: false,
            sheet: V54_LANCAMENTOS_SHEET,
            errors: [makeV54ContractError_('ROW_WIDTH_MISMATCH', 'rowValues', 'Lancamentos_V54 row must have exactly 19 columns.')],
        };
    }

    var steps = [{
        type: 'append_rows',
        sheet: V54_LANCAMENTOS_SHEET,
        headers: V54_LANCAMENTOS_HEADERS.slice(),
        rowObjects: [mapped.rowObject],
        rowValues: [mapped.rowValues],
    }];
    var faturasPlan = null;

    if (input.tipo_evento === 'compra_cartao') {
        faturasPlan = planCardPurchaseFaturaUpsert_(spreadsheet, mapping, deps);
        if (!faturasPlan.ok) {
            return {
                ok: false,
                sheet: V54_FATURAS_SHEET,
                errors: faturasPlan.errors,
            };
        }
        steps.push({
            type: 'apply_faturas_plan',
            sheet: V54_FATURAS_SHEET,
            plan: faturasPlan.plan,
        });
    }

    return {
        ok: true,
        errors: [],
        result_ref: mapped.rowObject.id_lancamento,
        plan: {
            action: 'APPLY_DOMAIN_MUTATION',
            sheet: V54_LANCAMENTOS_SHEET,
            result_ref: mapped.rowObject.id_lancamento,
            domainMutation: {
                kind: input.tipo_evento === 'compra_cartao' ? 'compra_cartao' : 'single_lancamento',
                result_ref: mapped.rowObject.id_lancamento,
                steps: steps,
            },
        },
        mapped: mapped,
        cycle: mapping.cycle || null,
        faturasPlan: faturasPlan,
    };
}

function planInstallmentDomainMutation_(input, deps, spreadsheet) {
    var scheduleMapper = getInstallmentScheduleContractMapper_(deps);
    if (!scheduleMapper) {
        return {
            ok: false,
            sheet: V54_COMPRAS_PARCELADAS_SHEET,
            errors: [makeV54ContractError_('INSTALLMENT_CONTRACT_UNAVAILABLE', 'tipo_evento', 'mapInstallmentScheduleContract dependency is required for compra_parcelada in Phase 4C-actions.')],
        };
    }

    var schedule = scheduleMapper(input, buildInstallmentScheduleContractOptions_(deps));
    var validation = validateInstallmentScheduleForRecordV54_(schedule);
    if (!validation.ok) return validation;

    var comprasSheet = spreadsheet && spreadsheet.getSheetByName(V54_COMPRAS_PARCELADAS_SHEET);
    if (!comprasSheet) {
        return {
            ok: false,
            sheet: V54_COMPRAS_PARCELADAS_SHEET,
            errors: [makeV54ContractError_('MISSING_SHEET', V54_COMPRAS_PARCELADAS_SHEET, 'Compras_Parceladas sheet was not found.')],
        };
    }
    var parcelasSheet = spreadsheet && spreadsheet.getSheetByName(V54_PARCELAS_AGENDA_SHEET);
    if (!parcelasSheet) {
        return {
            ok: false,
            sheet: V54_PARCELAS_AGENDA_SHEET,
            errors: [makeV54ContractError_('MISSING_SHEET', V54_PARCELAS_AGENDA_SHEET, 'Parcelas_Agenda sheet was not found.')],
        };
    }

    var comprasHeaderCheck = validateSheetHeaders_(comprasSheet, V54_COMPRAS_PARCELADAS_HEADERS, V54_COMPRAS_PARCELADAS_SHEET);
    if (!comprasHeaderCheck.ok) {
        return {
            ok: false,
            sheet: V54_COMPRAS_PARCELADAS_SHEET,
            errors: [makeV54ContractError_(comprasHeaderCheck.code, comprasHeaderCheck.field, comprasHeaderCheck.message)],
        };
    }
    var parcelasHeaderCheck = validateSheetHeaders_(parcelasSheet, V54_PARCELAS_AGENDA_HEADERS, V54_PARCELAS_AGENDA_SHEET);
    if (!parcelasHeaderCheck.ok) {
        return {
            ok: false,
            sheet: V54_PARCELAS_AGENDA_SHEET,
            errors: [makeV54ContractError_(parcelasHeaderCheck.code, parcelasHeaderCheck.field, parcelasHeaderCheck.message)],
        };
    }

    var faturasPlan = planInstallmentFaturasUpsert_(spreadsheet, schedule, deps);
    if (!faturasPlan.ok) {
        return {
            ok: false,
            sheet: V54_FATURAS_SHEET,
            errors: faturasPlan.errors,
        };
    }

    var compra = schedule.compras.rowObjects[0];
    return {
        ok: true,
        errors: [],
        result_ref: compra.id_compra,
        plan: {
            action: 'APPLY_DOMAIN_MUTATION',
            sheet: V54_COMPRAS_PARCELADAS_SHEET,
            result_ref: compra.id_compra,
            domainMutation: {
                kind: 'compra_parcelada',
                result_ref: compra.id_compra,
                steps: [
                    {
                        type: 'append_rows',
                        sheet: V54_COMPRAS_PARCELADAS_SHEET,
                        headers: V54_COMPRAS_PARCELADAS_HEADERS.slice(),
                        rowObjects: schedule.compras.rowObjects,
                        rowValues: schedule.compras.rowValues,
                    },
                    {
                        type: 'append_rows',
                        sheet: V54_PARCELAS_AGENDA_SHEET,
                        headers: V54_PARCELAS_AGENDA_HEADERS.slice(),
                        rowObjects: schedule.parcelas.rowObjects,
                        rowValues: schedule.parcelas.rowValues,
                    },
                    {
                        type: 'apply_faturas_plan',
                        sheet: V54_FATURAS_SHEET,
                        plan: faturasPlan.plan,
                    },
                ],
            },
        },
        schedule: schedule,
        faturasPlan: faturasPlan,
    };
}

function validateInstallmentScheduleForRecordV54_(schedule) {
    if (!schedule || typeof schedule !== 'object') {
        return {
            ok: false,
            sheet: V54_COMPRAS_PARCELADAS_SHEET,
            errors: [makeV54ContractError_('INSTALLMENT_CONTRACT_INVALID_RESULT', 'result', 'Installment schedule contract returned an invalid result.')],
        };
    }

    if (schedule.ok !== true) {
        return {
            ok: false,
            sheet: V54_COMPRAS_PARCELADAS_SHEET,
            errors: Array.isArray(schedule.errors) ? schedule.errors : [],
        };
    }

    var compras = schedule.compras && typeof schedule.compras === 'object' ? schedule.compras : null;
    var parcelas = schedule.parcelas && typeof schedule.parcelas === 'object' ? schedule.parcelas : null;
    var compraRowValues = compras && Array.isArray(compras.rowValues) ? compras.rowValues : [];
    var compraRowObjects = compras && Array.isArray(compras.rowObjects) ? compras.rowObjects : [];
    var parcelaRowValues = parcelas && Array.isArray(parcelas.rowValues) ? parcelas.rowValues : [];
    var parcelaRowObjects = parcelas && Array.isArray(parcelas.rowObjects) ? parcelas.rowObjects : [];

    if (compraRowValues.length !== 1 || compraRowObjects.length !== 1) {
        return {
            ok: false,
            sheet: V54_COMPRAS_PARCELADAS_SHEET,
            errors: [makeV54ContractError_('INVALID_INSTALLMENT_ROWS', 'compras', 'Installment contract must return exactly one Compras_Parceladas row.')],
        };
    }
    if (parcelaRowValues.length <= 0 || parcelaRowValues.length !== parcelaRowObjects.length) {
        return {
            ok: false,
            sheet: V54_PARCELAS_AGENDA_SHEET,
            errors: [makeV54ContractError_('INVALID_INSTALLMENT_ROWS', 'parcelas', 'Installment contract must return one or more Parcelas_Agenda rows.')],
        };
    }
    if (compraRowValues[0].length !== V54_COMPRAS_PARCELADAS_HEADERS.length) {
        return {
            ok: false,
            sheet: V54_COMPRAS_PARCELADAS_SHEET,
            errors: [makeV54ContractError_('ROW_WIDTH_MISMATCH', 'compras.rowValues', 'Compras_Parceladas row must match V54 schema width.')],
        };
    }

    for (var i = 0; i < parcelaRowValues.length; i++) {
        if (parcelaRowValues[i].length !== V54_PARCELAS_AGENDA_HEADERS.length) {
            return {
                ok: false,
                sheet: V54_PARCELAS_AGENDA_SHEET,
                errors: [makeV54ContractError_('ROW_WIDTH_MISMATCH', 'parcelas.rowValues', 'Parcelas_Agenda row must match V54 schema width.')],
            };
        }
    }

    return { ok: true, errors: [] };
}

function applyRecordEntryV54IdempotentPlans_(plans, context) {
    if (!Array.isArray(plans)) {
        return {
            ok: false,
            sheet: V54_IDEMPOTENCY_LOG_SHEET,
            errors: [makeV54ContractError_('IDEMPOTENT_WRITE_PLANS_INVALID', 'plans', 'Idempotent write boundary must return an array of plans.')],
        };
    }

    var applied = [];
    var domainResult = null;

    for (var i = 0; i < plans.length; i++) {
        var plan = plans[i] || {};
        if (plan.action === 'INSERT_IDEMPOTENCY_LOG') {
            appendRowsToV54Sheet_(context.idempotencySheet, [plan.rowValues], V54_IDEMPOTENCY_LOG_HEADERS);
            applied.push(plan.action);
            continue;
        }

        if (plan.action === 'APPLY_DOMAIN_MUTATION') {
            domainResult = applyRecordEntryV54DomainMutation_(plan.domainMutation, context.spreadsheet);
            if (!domainResult.ok) return domainResult;
            applied.push(plan.action);
            continue;
        }

        if (plan.action === 'MARK_IDEMPOTENCY_COMPLETED') {
            var updateResult = updateIdempotencyLogRow_(context.idempotencySheet, plan);
            if (!updateResult.ok) return updateResult;
            applied.push(plan.action);
            continue;
        }

        if (plan.action === 'MARK_IDEMPOTENCY_FAILED') {
            var failedUpdateResult = updateIdempotencyLogRow_(context.idempotencySheet, plan);
            if (!failedUpdateResult.ok) return failedUpdateResult;
            applied.push(plan.action);
            continue;
        }

        return {
            ok: false,
            sheet: plan.sheet || V54_IDEMPOTENCY_LOG_SHEET,
            errors: [makeV54ContractError_('IDEMPOTENT_WRITE_PLAN_UNKNOWN_ACTION', 'action', 'Unknown idempotent write plan action: ' + String(plan.action || ''))],
        };
    }

    return {
        ok: true,
        applied: applied,
        domain: domainResult,
        errors: [],
    };
}

function applyRecordEntryV54DomainMutation_(mutation, spreadsheet) {
    if (!mutation || !Array.isArray(mutation.steps)) {
        return {
            ok: false,
            sheet: V54_LANCAMENTOS_SHEET,
            errors: [makeV54ContractError_('DOMAIN_MUTATION_PLAN_INVALID', 'domainMutation', 'Domain mutation plan is invalid.')],
        };
    }

    var writes = [];
    for (var i = 0; i < mutation.steps.length; i++) {
        var step = mutation.steps[i];
        var sheet = spreadsheet && spreadsheet.getSheetByName(step.sheet);
        if (!sheet) {
            return {
                ok: false,
                sheet: step.sheet,
                errors: [makeV54ContractError_('MISSING_SHEET', step.sheet, step.sheet + ' sheet was not found.')],
            };
        }

        if (step.type === 'append_rows') {
            var appendResult = appendRowsToV54Sheet_(sheet, step.rowValues, step.headers);
            writes.push({
                type: 'append_rows',
                sheet: step.sheet,
                startRow: appendResult.startRow,
                rowCount: step.rowValues.length,
                rowObjects: step.rowObjects,
                rowValues: step.rowValues,
            });
            continue;
        }

        if (step.type === 'apply_faturas_plan') {
            var faturasWrite = applyFaturasPlan_(sheet, step.plan);
            writes.push({
                type: 'apply_faturas_plan',
                sheet: step.sheet,
                result: faturasWrite,
            });
            continue;
        }

        return {
            ok: false,
            sheet: step.sheet,
            errors: [makeV54ContractError_('DOMAIN_MUTATION_STEP_UNKNOWN', 'type', 'Unknown domain mutation step type: ' + String(step.type || ''))],
        };
    }

    return {
        ok: true,
        kind: mutation.kind,
        result_ref: mutation.result_ref,
        writes: writes,
        errors: [],
    };
}

function appendRowsToV54Sheet_(sheet, rowValues, headers) {
    var startRow = sheet.getLastRow() + 1;
    if (rowValues.length > 0) {
        sheet.getRange(startRow, 1, rowValues.length, headers.length).setValues(rowValues);
    }
    return { startRow: startRow };
}

function updateIdempotencyLogRow_(sheet, plan) {
    var key = plan && plan.key ? String(plan.key) : '';
    var rows = readSheetRowsAsObjects_(sheet, V54_IDEMPOTENCY_LOG_HEADERS);
    var rowNumber = null;

    for (var i = 0; i < rows.length; i++) {
        if (String(rows[i].idempotency_key || '') === key) {
            rowNumber = rows[i]._rowNumber;
            break;
        }
    }

    if (!rowNumber) {
        return {
            ok: false,
            sheet: V54_IDEMPOTENCY_LOG_SHEET,
            errors: [makeV54ContractError_('IDEMPOTENCY_LOG_ROW_NOT_FOUND', 'idempotency_key', 'Cannot update idempotency row because the processing row was not found.')],
        };
    }

    sheet.getRange(rowNumber, 1, 1, V54_IDEMPOTENCY_LOG_HEADERS.length).setValues([plan.rowValues]);
    return { ok: true, errors: [] };
}

function readRecordEntryV54IdempotencyRows_(sheet, deps) {
    if (deps && typeof deps.readIdempotencyRows === 'function') {
        return deps.readIdempotencyRows(sheet, V54_IDEMPOTENCY_LOG_HEADERS.slice());
    }
    return readSheetRowsAsObjects_(sheet, V54_IDEMPOTENCY_LOG_HEADERS);
}

function readRecordEntryV54MutationRefs_(spreadsheet, deps) {
    if (deps && typeof deps.readExistingMutationRefs === 'function') {
        return deps.readExistingMutationRefs(spreadsheet);
    }

    var refs = [];
    collectLancamentoMutationRefs_(spreadsheet, refs);
    collectCompraParceladaMutationRefs_(spreadsheet, refs);
    return refs;
}

function collectLancamentoMutationRefs_(spreadsheet, refs) {
    var sheet = spreadsheet && spreadsheet.getSheetByName(V54_LANCAMENTOS_SHEET);
    if (!sheet) return;
    var rows = readSheetRowsAsObjects_(sheet, V54_LANCAMENTOS_HEADERS);
    rows.forEach(function(row) {
        if (row.id_lancamento) {
            refs.push({
                result_ref: row.id_lancamento,
                id_lancamento: row.id_lancamento,
                sheet: V54_LANCAMENTOS_SHEET,
            });
        }
    });
}

function collectCompraParceladaMutationRefs_(spreadsheet, refs) {
    var sheet = spreadsheet && spreadsheet.getSheetByName(V54_COMPRAS_PARCELADAS_SHEET);
    if (!sheet) return;
    var rows = readSheetRowsAsObjects_(sheet, V54_COMPRAS_PARCELADAS_HEADERS);
    rows.forEach(function(row) {
        if (row.id_compra) {
            refs.push({
                result_ref: row.id_compra,
                id_compra: row.id_compra,
                sheet: V54_COMPRAS_PARCELADAS_SHEET,
            });
        }
    });
}

function getAndValidateIdempotencyLogSheet_(spreadsheet) {
    var sheet = spreadsheet && spreadsheet.getSheetByName(V54_IDEMPOTENCY_LOG_SHEET);
    if (!sheet) {
        return {
            ok: false,
            errors: [makeV54ContractError_('MISSING_SHEET', V54_IDEMPOTENCY_LOG_SHEET, 'Idempotency_Log sheet was not found.')],
        };
    }

    var headerCheck = validateSheetHeaders_(sheet, V54_IDEMPOTENCY_LOG_HEADERS, V54_IDEMPOTENCY_LOG_SHEET);
    if (!headerCheck.ok) {
        return {
            ok: false,
            errors: [makeV54ContractError_(headerCheck.code, headerCheck.field, headerCheck.message)],
        };
    }

    return { ok: true, sheet: sheet, errors: [] };
}

function makeIdempotentRecordEntryV54Failure_(boundary) {
    var errors = Array.isArray(boundary.errors) ? boundary.errors : [];
    if (errors.length === 0) {
        errors = [makeV54ContractError_('IDEMPOTENT_WRITE_BLOCKED', 'idempotency', 'Idempotent write boundary blocked the domain mutation.')];
    }

    return {
        ok: false,
        sheet: V54_LANCAMENTOS_SHEET,
        rowNumber: null,
        id_lancamento: '',
        rowObject: null,
        rowValues: [],
        idempotency: boundary.idempotency || null,
        idempotency_key: boundary.idempotency ? boundary.idempotency.idempotency_key : '',
        decision: boundary.decision || '',
        retryable: boundary.retryable === true,
        shouldCreateFinancialEntry: boundary.shouldCreateFinancialEntry === true,
        shouldApplyDomainMutation: boundary.shouldCreateFinancialEntry === true,
        plans: Array.isArray(boundary.plans) ? cloneV54PlainObject_(boundary.plans) : [],
        warnings: Array.isArray(boundary.warnings) ? boundary.warnings : [],
        failureWindows: Array.isArray(boundary.failureWindows) ? boundary.failureWindows : [],
        errors: errors,
    };
}

function makeIdempotentRecordEntryV54Success_(boundary, domainPlan, execution) {
    var result = {
        ok: true,
        sheet: domainPlan.plan.sheet,
        rowNumber: null,
        id_lancamento: '',
        rowObject: null,
        rowValues: [],
        idempotency: boundary.idempotency || null,
        idempotency_key: boundary.idempotency ? boundary.idempotency.idempotency_key : '',
        decision: boundary.decision,
        result_ref: domainPlan.result_ref,
        domainMutation: execution.domain,
        plans: cloneV54PlainObject_(boundary.plans || []),
        applied: execution.applied,
        warnings: Array.isArray(boundary.warnings) ? boundary.warnings : [],
        failureWindows: Array.isArray(boundary.failureWindows) ? boundary.failureWindows : [],
        errors: [],
    };

    if (domainPlan.mapped && domainPlan.mapped.rowObject) {
        result.rowObject = domainPlan.mapped.rowObject;
        result.rowValues = domainPlan.mapped.rowValues;
        result.id_lancamento = domainPlan.mapped.rowObject.id_lancamento;
        result.cycle = domainPlan.cycle || null;
    }

    if (domainPlan.schedule) {
        result.compra = {
            sheet: V54_COMPRAS_PARCELADAS_SHEET,
            rowObject: domainPlan.schedule.compras.rowObjects[0],
            rowValues: domainPlan.schedule.compras.rowValues[0],
        };
        result.parcelas = {
            sheet: V54_PARCELAS_AGENDA_SHEET,
            rowCount: domainPlan.schedule.parcelas.rowValues.length,
            rowObjects: domainPlan.schedule.parcelas.rowObjects,
            rowValues: domainPlan.schedule.parcelas.rowValues,
        };
        result.cycles = Array.isArray(domainPlan.schedule.cycles) ? domainPlan.schedule.cycles : [];
    }

    if (domainPlan.faturasPlan) {
        var faturasWrite = findDomainWriteByType_(execution.domain, 'apply_faturas_plan');
        result.faturas = faturasWrite ? faturasWrite.result : null;
    }

    return result;
}

function findDomainWriteByType_(domainResult, type) {
    var writes = domainResult && Array.isArray(domainResult.writes) ? domainResult.writes : [];
    for (var i = 0; i < writes.length; i++) {
        if (writes[i].type === type) return writes[i];
    }
    return null;
}

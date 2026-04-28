// ============================================================
// ACTIONS V54 RECOVERY ADAPTER - fake-first Apps Script adapter
// ============================================================
// Loaded as a global Apps Script file. It intentionally avoids CommonJS imports;
// tests inject the local recovery executor.

function applyReviewedIdempotencyRecoveryV54(input, options) {
    var deps = normalizeV54RecoveryDeps_(options);
    var dependencyError = validateV54RecoveryDeps_(deps);
    if (dependencyError) return makeV54RecoveryFailure_([dependencyError], []);

    return deps.withLock('applyReviewedIdempotencyRecoveryV54', function() {
        var spreadsheet = deps.getSpreadsheet();
        var sheetResult = getAndValidateV54RecoveryIdempotencyLogSheet_(spreadsheet);
        if (!sheetResult.ok) return makeV54RecoveryFailure_(sheetResult.errors, []);

        var existingRows = readV54RecoveryIdempotencyRows_(sheetResult.sheet, deps);
        var executorResult = deps.applyReviewedIdempotencyRecovery({
            idempotencyRows: existingRows,
            plans: normalizeV54RecoveryPlans_(input),
            checklist: deps.checklist,
        }, {
            checklist: deps.checklist,
        });

        if (!executorResult || typeof executorResult !== 'object') {
            return makeV54RecoveryFailure_([
                makeV54ContractError_(
                    'RECOVERY_EXECUTOR_INVALID_RESULT',
                    'applyReviewedIdempotencyRecovery',
                    'Recovery executor returned an invalid result.'
                ),
            ], existingRows);
        }

        if (executorResult.ok !== true) {
            return makeV54RecoveryFailure_(
                Array.isArray(executorResult.errors) ? executorResult.errors : [],
                existingRows
            );
        }

        var writeResult = writeReviewedIdempotencyRecoveryRows_(sheetResult.sheet, existingRows, executorResult);
        if (!writeResult.ok) return makeV54RecoveryFailure_(writeResult.errors, existingRows);

        return {
            ok: true,
            sheet: V54_IDEMPOTENCY_LOG_SHEET,
            applied: executorResult.applied || [],
            writes: writeResult.writes,
            idempotencyRows: executorResult.idempotencyRows || [],
            errors: [],
        };
    });
}

function normalizeV54RecoveryDeps_(options) {
    var source = options || {};
    return {
        getSpreadsheet: typeof source.getSpreadsheet === 'function' ? source.getSpreadsheet : null,
        withLock: typeof source.withLock === 'function' ? source.withLock : null,
        applyReviewedIdempotencyRecovery: typeof source.applyReviewedIdempotencyRecovery === 'function'
            ? source.applyReviewedIdempotencyRecovery
            : null,
        readIdempotencyRows: typeof source.readIdempotencyRows === 'function' ? source.readIdempotencyRows : null,
        checklist: source.checklist && typeof source.checklist === 'object'
            ? cloneV54PlainObject_(source.checklist)
            : null,
    };
}

function validateV54RecoveryDeps_(deps) {
    if (!deps.getSpreadsheet) {
        return makeV54ContractError_('RECOVERY_GET_SPREADSHEET_REQUIRED', 'getSpreadsheet', 'Recovery adapter requires injected getSpreadsheet.');
    }
    if (!deps.withLock) {
        return makeV54ContractError_('RECOVERY_LOCK_REQUIRED', 'withLock', 'Recovery adapter requires injected withLock.');
    }
    if (!deps.applyReviewedIdempotencyRecovery) {
        return makeV54ContractError_(
            'RECOVERY_EXECUTOR_REQUIRED',
            'applyReviewedIdempotencyRecovery',
            'Recovery adapter requires injected applyReviewedIdempotencyRecovery.'
        );
    }
    return null;
}

function normalizeV54RecoveryPlans_(input) {
    if (Array.isArray(input)) return input;
    if (input && Array.isArray(input.plans)) return input.plans;
    if (input && input.plan) return [input.plan];
    return [];
}

function readV54RecoveryIdempotencyRows_(sheet, deps) {
    if (deps && typeof deps.readIdempotencyRows === 'function') {
        return deps.readIdempotencyRows(sheet, V54_IDEMPOTENCY_LOG_HEADERS.slice());
    }
    return readSheetRowsAsObjects_(sheet, V54_IDEMPOTENCY_LOG_HEADERS);
}

function getAndValidateV54RecoveryIdempotencyLogSheet_(spreadsheet) {
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

function writeReviewedIdempotencyRecoveryRows_(sheet, existingRows, executorResult) {
    var targetRows = executorResult && Array.isArray(executorResult.idempotencyRows)
        ? executorResult.idempotencyRows
        : [];
    var applied = executorResult && Array.isArray(executorResult.applied) ? executorResult.applied : [];
    var writes = [];

    for (var i = 0; i < applied.length; i++) {
        var key = String(applied[i].key || '');
        var rowNumber = findV54RecoveryRowNumber_(existingRows, key);
        var targetRow = findV54RecoveryRowObject_(targetRows, key);

        if (!rowNumber || !targetRow) {
            return {
                ok: false,
                errors: [
                    makeV54ContractError_(
                        'RECOVERY_ROW_NOT_FOUND',
                        'idempotency_key',
                        'Idempotency row was not found for recovery update.'
                    ),
                ],
            };
        }

        var rowValues = V54_IDEMPOTENCY_LOG_HEADERS.map(function(header) {
            return targetRow[header] === undefined || targetRow[header] === null ? '' : targetRow[header];
        });
        sheet.getRange(rowNumber, 1, 1, V54_IDEMPOTENCY_LOG_HEADERS.length).setValues([rowValues]);
        writes.push({
            action: applied[i].action,
            key: key,
            status: targetRow.status,
            result_ref: targetRow.result_ref || '',
            rowNumber: rowNumber,
            rowValues: rowValues,
        });
    }

    return { ok: true, writes: writes, errors: [] };
}

function findV54RecoveryRowNumber_(rows, key) {
    for (var i = 0; i < rows.length; i++) {
        if (String(rows[i].idempotency_key || '') === key) return rows[i]._rowNumber || (i + 2);
    }
    return null;
}

function findV54RecoveryRowObject_(rows, key) {
    for (var i = 0; i < rows.length; i++) {
        if (String(rows[i].idempotency_key || '') === key) return rows[i];
    }
    return null;
}

function makeV54RecoveryFailure_(errors, rows) {
    return {
        ok: false,
        sheet: V54_IDEMPOTENCY_LOG_SHEET,
        applied: [],
        writes: [],
        idempotencyRows: rows || [],
        errors: Array.isArray(errors) && errors.length > 0
            ? errors
            : [makeV54ContractError_('RECOVERY_BLOCKED', 'recovery', 'Reviewed idempotency recovery was blocked.')],
    };
}

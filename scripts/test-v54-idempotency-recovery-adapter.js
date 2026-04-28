'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { V54_HEADERS, V54_SHEETS } = require('./lib/v54-schema');
const { IDEMPOTENCY_STATUSES } = require('./lib/v54-idempotency-contract');
const { applyReviewedIdempotencyRecovery } = require('./lib/v54-idempotency-recovery-executor');

const schemaSource = fs.readFileSync(path.join(__dirname, '..', 'src', '000_V54Schema.js'), 'utf8');
const actionsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'ActionsV54.js'), 'utf8');
const actionsHelpersSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'ActionsV54Helpers.js'), 'utf8');
const recoveryAdapterPath = path.join(__dirname, '..', 'src', 'ActionsV54Recovery.js');
const recoveryAdapterSource = fs.readFileSync(recoveryAdapterPath, 'utf8');
const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'Main.js'), 'utf8');

function test(name, fn) {
    try {
        fn();
        console.log(`PASS ${name}`);
        return 0;
    } catch (error) {
        console.error(`FAIL ${name} - ${error.message}`);
        return 1;
    }
}

function loadRecoveryAdapter() {
    const sandbox = { console, Date, Math, JSON, Number, String, Boolean, Object, Array, RegExp };
    vm.createContext(sandbox);
    vm.runInContext(
        `${schemaSource}\n${actionsSource}\n${actionsHelpersSource}\n${recoveryAdapterSource}\nresult = { applyReviewedIdempotencyRecoveryV54 };`,
        sandbox,
    );
    return sandbox.result;
}

function rowObjectToValues(headers, rowObject) {
    return headers.map((header) => rowObject[header] === undefined || rowObject[header] === null ? '' : rowObject[header]);
}

function makeFakeSheet(name, headers, rows, writesBySheet) {
    const rowValues = rows || [];
    return {
        getLastRow() {
            return 1 + rowValues.length;
        },
        getRange(row, column, numRows, numColumns) {
            return {
                getValues() {
                    if (row === 1 && column === 1 && numRows === 1) {
                        return [Array.from({ length: numColumns }, (_, index) => headers[index] || '')];
                    }
                    if (row >= 2 && column === 1) {
                        return rowValues
                            .slice(row - 2, row - 2 + numRows)
                            .map((sourceRow) => Array.from({ length: numColumns }, (_, index) => sourceRow[index] === undefined ? '' : sourceRow[index]));
                    }
                    throw new Error(`Unexpected getValues range ${name}:${row}:${column}:${numRows}:${numColumns}`);
                },
                setValues(values) {
                    if (!writesBySheet[name]) writesBySheet[name] = [];
                    writesBySheet[name].push({ sheet: name, row, column, numRows, numColumns, values: values.map((valueRow) => [...valueRow]) });
                    values.forEach((valueRow, index) => {
                        const targetIndex = row - 2 + index;
                        if (targetIndex >= 0 && targetIndex < rowValues.length) {
                            rowValues[targetIndex] = [...valueRow];
                        } else {
                            rowValues.push([...valueRow]);
                        }
                    });
                },
            };
        },
    };
}

function makeFakeSpreadsheet(seed) {
    const source = seed || {};
    const writesBySheet = {};
    const requestedSheets = [];
    const rowsBySheet = {};
    const sheets = {};

    function register(sheetName, rows, headersOverride) {
        const headers = headersOverride || V54_HEADERS[sheetName];
        rowsBySheet[sheetName] = (rows || []).map((row) => rowObjectToValues(headers, row));
        sheets[sheetName] = makeFakeSheet(sheetName, headers, rowsBySheet[sheetName], writesBySheet);
    }

    register(V54_SHEETS.IDEMPOTENCY_LOG, source.idempotencyRows, source.idempotencyHeaders);
    [
        V54_SHEETS.LANCAMENTOS_V54,
        V54_SHEETS.COMPRAS_PARCELADAS,
        V54_SHEETS.PARCELAS_AGENDA,
        V54_SHEETS.FATURAS,
    ].forEach((sheetName) => register(sheetName, [], V54_HEADERS[sheetName]));

    return {
        writesBySheet,
        requestedSheets,
        rowsBySheet,
        getSheetByName(name) {
            requestedSheets.push(name);
            if (source.missingSheet === name) return null;
            if (!sheets[name]) throw new Error(`Unexpected sheet requested: ${name}`);
            return sheets[name];
        },
    };
}

function idempotencyRow(overrides) {
    return Object.assign({
        idempotency_key: 'telegram:telegram_update_id:91001',
        source: 'telegram',
        telegram_update_id: '91001',
        telegram_message_id: '77001',
        chat_id: '123456',
        payload_hash: 'hash-1',
        status: IDEMPOTENCY_STATUSES.PROCESSING,
        result_ref: '',
        created_at: '2026-04-27T21:00:00.000Z',
        updated_at: '2026-04-27T21:00:00.000Z',
        error_code: '',
        observacao: '',
    }, overrides || {});
}

function recoveryPlan(action, overrides) {
    const status = action === 'MARK_IDEMPOTENCY_COMPLETED'
        ? IDEMPOTENCY_STATUSES.COMPLETED
        : IDEMPOTENCY_STATUSES.FAILED;
    const rowObject = Object.assign(idempotencyRow(), {
        status,
        result_ref: action === 'MARK_IDEMPOTENCY_COMPLETED' ? 'LAN_V54_IDEMP_ABC' : '',
        updated_at: '2026-04-27T21:15:00.000Z',
        error_code: action === 'MARK_IDEMPOTENCY_FAILED' ? 'STALE_PROCESSING_NO_DOMAIN_MUTATION' : '',
        observacao: action === 'MARK_IDEMPOTENCY_FAILED' ? 'Reviewed stale processing recovery.' : 'Reviewed completion recovery.',
    });
    return Object.assign({
        action,
        sheet: V54_SHEETS.IDEMPOTENCY_LOG,
        key: rowObject.idempotency_key,
        rowObject,
        rowValues: rowObjectToValues(V54_HEADERS[V54_SHEETS.IDEMPOTENCY_LOG], rowObject),
    }, overrides || {});
}

function completedChecklist() {
    return {
        reviewed: true,
        domainMutationWillNotBeApplied: true,
        matchedResultRefVerified: true,
    };
}

function failedChecklist() {
    return {
        reviewed: true,
        domainMutationWillNotBeApplied: true,
        noDomainMutationVerified: true,
    };
}

function apply(fake, plans, checklist, overrides) {
    const source = overrides || {};
    const locks = [];
    const { applyReviewedIdempotencyRecoveryV54 } = loadRecoveryAdapter();
    const result = applyReviewedIdempotencyRecoveryV54({ plans }, {
        getSpreadsheet: () => fake,
        withLock(label, fn) {
            locks.push(label);
            return fn();
        },
        applyReviewedIdempotencyRecovery,
        checklist,
        readIdempotencyRows: source.readIdempotencyRows,
    });
    return { result, locks };
}

function assertError(result, code, field) {
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((error) => {
        if (error.code !== code) return false;
        return field ? error.field === field : true;
    }), `Expected ${code}${field ? ` on ${field}` : ''}, got ${JSON.stringify(result.errors)}`);
}

function assertOnlyIdempotencyLogTouched(fake) {
    assert.deepStrictEqual(fake.requestedSheets, [V54_SHEETS.IDEMPOTENCY_LOG]);
    [
        V54_SHEETS.LANCAMENTOS_V54,
        V54_SHEETS.COMPRAS_PARCELADAS,
        V54_SHEETS.PARCELAS_AGENDA,
        V54_SHEETS.FATURAS,
    ].forEach((sheetName) => {
        assert.strictEqual((fake.writesBySheet[sheetName] || []).length, 0, `${sheetName} should not receive writes`);
    });
}

let failed = 0;

failed += test('applies_mark_idempotency_completed_to_idempotency_log_only_with_complete_checklist', () => {
    const fake = makeFakeSpreadsheet({ idempotencyRows: [idempotencyRow()] });
    const { result, locks } = apply(fake, [recoveryPlan('MARK_IDEMPOTENCY_COMPLETED')], completedChecklist());

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.deepStrictEqual(result.applied.map((item) => item.action), ['MARK_IDEMPOTENCY_COMPLETED']);
    assert.strictEqual(result.applied[0].key, 'telegram:telegram_update_id:91001');
    assert.strictEqual(result.applied[0].status, IDEMPOTENCY_STATUSES.COMPLETED);
    assert.strictEqual(result.applied[0].result_ref, 'LAN_V54_IDEMP_ABC');
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.IDEMPOTENCY_LOG] || []).length, 1);
    assertOnlyIdempotencyLogTouched(fake);
    assert.deepStrictEqual(locks, ['applyReviewedIdempotencyRecoveryV54']);
});

failed += test('applies_mark_idempotency_failed_to_idempotency_log_only_with_complete_checklist', () => {
    const fake = makeFakeSpreadsheet({ idempotencyRows: [idempotencyRow()] });
    const { result } = apply(fake, [recoveryPlan('MARK_IDEMPOTENCY_FAILED')], failedChecklist());

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.deepStrictEqual(result.applied.map((item) => item.action), ['MARK_IDEMPOTENCY_FAILED']);
    assert.strictEqual(result.applied[0].status, IDEMPOTENCY_STATUSES.FAILED);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.IDEMPOTENCY_LOG] || []).length, 1);
    assertOnlyIdempotencyLogTouched(fake);
});

failed += test('missing_checklist_fails_closed_and_writes_nothing', () => {
    const fake = makeFakeSpreadsheet({ idempotencyRows: [idempotencyRow()] });
    const { result } = apply(fake, [recoveryPlan('MARK_IDEMPOTENCY_COMPLETED')], null);

    assertError(result, 'RECOVERY_REVIEW_REQUIRED', 'reviewed');
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.IDEMPOTENCY_LOG] || []).length, 0);
});

failed += test('wrong_idempotency_log_header_fails_closed_and_writes_nothing', () => {
    const headers = [...V54_HEADERS[V54_SHEETS.IDEMPOTENCY_LOG]];
    headers[6] = 'wrong_status';
    const fake = makeFakeSpreadsheet({ idempotencyRows: [idempotencyRow()], idempotencyHeaders: headers });
    const { result } = apply(fake, [recoveryPlan('MARK_IDEMPOTENCY_COMPLETED')], completedChecklist());

    assertError(result, 'HEADER_MISMATCH', V54_SHEETS.IDEMPOTENCY_LOG);
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.IDEMPOTENCY_LOG] || []).length, 0);
});

failed += test('missing_target_idempotency_row_fails_closed_and_writes_nothing', () => {
    const fake = makeFakeSpreadsheet({ idempotencyRows: [idempotencyRow({ idempotency_key: 'other-key' })] });
    const { result } = apply(fake, [recoveryPlan('MARK_IDEMPOTENCY_COMPLETED')], completedChecklist());

    assertError(result, 'RECOVERY_ROW_NOT_FOUND', 'idempotency_key');
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.IDEMPOTENCY_LOG] || []).length, 0);
});

failed += test('forbidden_apply_domain_mutation_plan_fails_closed', () => {
    const fake = makeFakeSpreadsheet({ idempotencyRows: [idempotencyRow()] });
    const plan = recoveryPlan('MARK_IDEMPOTENCY_COMPLETED', {
        action: 'APPLY_DOMAIN_MUTATION',
        sheet: V54_SHEETS.LANCAMENTOS_V54,
    });
    const { result } = apply(fake, [plan], completedChecklist());

    assertError(result, 'RECOVERY_PLAN_ACTION_FORBIDDEN', 'action');
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.IDEMPOTENCY_LOG] || []).length, 0);
});

failed += test('forbidden_insert_financial_entry_plan_fails_closed', () => {
    const fake = makeFakeSpreadsheet({ idempotencyRows: [idempotencyRow()] });
    const plan = recoveryPlan('MARK_IDEMPOTENCY_COMPLETED', {
        action: 'INSERT_FINANCIAL_ENTRY',
        sheet: V54_SHEETS.LANCAMENTOS_V54,
    });
    const { result } = apply(fake, [plan], completedChecklist());

    assertError(result, 'RECOVERY_PLAN_ACTION_FORBIDDEN', 'action');
    assert.strictEqual((fake.writesBySheet[V54_SHEETS.IDEMPOTENCY_LOG] || []).length, 0);
});

failed += test('recovery_adapter_never_writes_to_v54_domain_sheets', () => {
    const fake = makeFakeSpreadsheet({ idempotencyRows: [idempotencyRow()] });
    const { result } = apply(fake, [recoveryPlan('MARK_IDEMPOTENCY_COMPLETED')], completedChecklist());

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assertOnlyIdempotencyLogTouched(fake);
});

failed += test('adapter_source_has_no_forbidden_real_side_effect_clients_or_node_require', () => {
    [
        'SpreadsheetApp',
        'UrlFetchApp',
        'sendTelegram',
        'clasp',
        'deploy',
        'applySetupV54',
        'applySeedV54',
        'recordEntryV54(',
        'module.exports',
    ].forEach((needle) => {
        assert.strictEqual(recoveryAdapterSource.includes(needle), false, `${needle} should not appear`);
    });
    assert.strictEqual(/\brequire\s*\(/.test(recoveryAdapterSource), false, 'require() should not appear');
});



if (failed > 0) {
    console.error(`\n${failed} V54 idempotency recovery adapter check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 idempotency recovery adapter checks passed.');
}

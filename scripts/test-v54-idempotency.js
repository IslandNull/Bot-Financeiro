'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { V54_HEADERS, V54_SHEETS, getV54Headers } = require('./lib/v54-schema');
const {
    IDEMPOTENCY_HEADERS,
    IDEMPOTENCY_STATUSES,
    hashPayload,
    makeSemanticFingerprint,
    planIdempotencyForUpdate,
} = require('./lib/v54-idempotency-contract');

const EXPECTED_HEADERS = [
    'idempotency_key',
    'source',
    'telegram_update_id',
    'telegram_message_id',
    'chat_id',
    'payload_hash',
    'status',
    'result_ref',
    'created_at',
    'updated_at',
    'error_code',
    'observacao',
];

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

function baseUpdate(overrides) {
    return Object.assign({
        source: 'telegram',
        telegram_update_id: '91001',
        telegram_message_id: '77001',
        chat_id: '123456',
        payload: {
            update_id: 91001,
            message: {
                message_id: 77001,
                chat: { id: 123456 },
                text: '50 mercado',
            },
        },
    }, overrides || {});
}

function completedRow(overrides) {
    const update = baseUpdate(overrides && overrides.update);
    const first = planIdempotencyForUpdate(update, [], { now: () => '2026-04-27T20:00:00.000Z' });
    return Object.assign({}, first.plan.rowObject, {
        status: IDEMPOTENCY_STATUSES.COMPLETED,
        result_ref: 'LAN_V54_DONE_0001',
        updated_at: '2026-04-27T20:01:00.000Z',
    }, overrides || {});
}

let failed = 0;

failed += test('schema_contains_idempotency_log', () => {
    assert.strictEqual(V54_SHEETS.IDEMPOTENCY_LOG, 'Idempotency_Log');
    assert.ok(Object.keys(V54_HEADERS).includes('Idempotency_Log'));
});

failed += test('idempotency_log_headers_are_exact_and_unique', () => {
    assert.deepStrictEqual(getV54Headers(V54_SHEETS.IDEMPOTENCY_LOG), EXPECTED_HEADERS);
    assert.deepStrictEqual(IDEMPOTENCY_HEADERS, EXPECTED_HEADERS);
    assert.strictEqual(new Set(IDEMPOTENCY_HEADERS).size, IDEMPOTENCY_HEADERS.length);
});

failed += test('new_update_generates_insert_plan', () => {
    const result = planIdempotencyForUpdate(baseUpdate(), [], { now: () => '2026-04-27T20:00:00.000Z' });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.decision, 'insert_processing');
    assert.strictEqual(result.shouldCreateFinancialEntry, true);
    assert.strictEqual(result.plan.action, 'INSERT_IDEMPOTENCY_LOG');
    assert.strictEqual(result.plan.sheet, 'Idempotency_Log');
    assert.strictEqual(result.plan.rowObject.idempotency_key, 'telegram:telegram_update_id:91001');
    assert.strictEqual(result.plan.rowObject.status, 'processing');
    assert.strictEqual(result.plan.rowObject.created_at, '2026-04-27T20:00:00.000Z');
    assert.strictEqual(result.plan.rowObject.updated_at, '2026-04-27T20:00:00.000Z');
    assert.deepStrictEqual(result.plan.rowValues, EXPECTED_HEADERS.map((header) => result.plan.rowObject[header]));
});

failed += test('completed_repeated_update_returns_structured_duplicate_without_insert', () => {
    const row = completedRow();
    const result = planIdempotencyForUpdate(baseUpdate(), [row], { now: () => '2030-01-01T00:00:00.000Z' });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.decision, 'duplicate_completed');
    assert.strictEqual(result.duplicate, true);
    assert.strictEqual(result.retryable, false);
    assert.strictEqual(result.shouldCreateFinancialEntry, false);
    assert.strictEqual(result.plan, null);
    assert.strictEqual(result.result_ref, 'LAN_V54_DONE_0001');
    assert.strictEqual(result.errors[0].code, 'IDEMPOTENCY_COMPLETED_DUPLICATE');
});

failed += test('processing_repeated_update_returns_retry_conflict_without_insert', () => {
    const row = Object.assign(completedRow(), {
        status: IDEMPOTENCY_STATUSES.PROCESSING,
        result_ref: '',
    });
    const result = planIdempotencyForUpdate(baseUpdate(), [row], { now: () => '2030-01-01T00:00:00.000Z' });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.decision, 'duplicate_processing');
    assert.strictEqual(result.duplicate, true);
    assert.strictEqual(result.retryable, true);
    assert.strictEqual(result.shouldCreateFinancialEntry, false);
    assert.strictEqual(result.plan, null);
    assert.strictEqual(result.errors[0].code, 'IDEMPOTENCY_PROCESSING_RETRY');
});

failed += test('same_payload_with_different_update_is_not_silently_merged', () => {
    const original = completedRow();
    const repeatedPayloadDifferentUpdate = baseUpdate({
        telegram_update_id: '91002',
        telegram_message_id: '77002',
    });
    const result = planIdempotencyForUpdate(repeatedPayloadDifferentUpdate, [original], { now: () => '2026-04-27T20:05:00.000Z' });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.decision, 'insert_processing');
    assert.strictEqual(result.plan.rowObject.idempotency_key, 'telegram:telegram_update_id:91002');
    assert.strictEqual(result.plan.rowObject.payload_hash, original.payload_hash);
    assert.strictEqual(result.warnings.some((warning) => warning.code === 'SAME_PAYLOAD_DIFFERENT_IDEMPOTENCY_KEY'), true);
});

failed += test('semantic_duplicate_only_warns_for_future_policy', () => {
    const semanticEntry = {
        data: '2026-04-27',
        valor: 50,
        descricao: 'Mercado',
        pessoa: 'Gustavo',
        id_fonte: 'FONTE_CONTA_GU',
    };
    const semanticFingerprint = makeSemanticFingerprint(semanticEntry);
    const existing = Object.assign(completedRow(), { semantic_fingerprint: semanticFingerprint });
    const result = planIdempotencyForUpdate(baseUpdate({ telegram_update_id: '91003', semantic_entry: semanticEntry }), [existing], { now: () => '2026-04-27T20:06:00.000Z' });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.shouldCreateFinancialEntry, true);
    assert.strictEqual(result.warnings.some((warning) => warning.code === 'POSSIBLE_SEMANTIC_DUPLICATE'), true);
});

failed += test('contract_does_not_use_apps_script_globals_or_network_clients', () => {
    const source = fs.readFileSync(path.join(__dirname, 'lib', 'v54-idempotency-contract.js'), 'utf8');
    [
        'SpreadsheetApp',
        'LockService',
        'PropertiesService',
        'UrlFetchApp',
        'Telegram',
        'OpenAI',
        'fetch(',
        'XMLHttpRequest',
    ].forEach((needle) => {
        assert.strictEqual(source.includes(needle), false, `${needle} should not appear`);
    });
});

failed += test('contract_is_deterministic_with_injected_now', () => {
    const update = baseUpdate({ payload: { b: 2, a: 1 } });
    const first = planIdempotencyForUpdate(update, [], { now: () => '2026-04-27T20:10:00.000Z' });
    const second = planIdempotencyForUpdate(update, [], { now: () => '2026-04-27T20:10:00.000Z' });

    assert.deepStrictEqual(first, second);
    assert.strictEqual(first.plan.rowObject.payload_hash, hashPayload({ a: 1, b: 2 }));
});

if (failed > 0) {
    console.error(`\n${failed} V54 idempotency check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 idempotency checks passed.');
}

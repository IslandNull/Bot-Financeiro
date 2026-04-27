'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { IDEMPOTENCY_STATUSES, hashPayload, makeSemanticFingerprint } = require('./lib/v54-idempotency-contract');
const {
    FAILURE_WINDOWS,
    createInMemoryV54WriteStore,
    makeTelegramIdempotencyInput,
    planV54IdempotentWrite,
} = require('./lib/v54-idempotent-write-path');

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

function parsedEntry(overrides) {
    return Object.assign({
        tipo_evento: 'despesa',
        data: '2026-04-27',
        competencia: '2026-04',
        valor: 50,
        descricao: 'Mercado',
        pessoa: 'Gustavo',
        escopo: 'Casal',
        visibilidade: 'detalhada',
        id_categoria: 'OPEX_MERCADO_SEMANA',
        id_fonte: 'FONTE_CONTA_GU',
        afeta_dre: true,
        afeta_acerto: true,
        afeta_patrimonio: false,
    }, overrides || {});
}

function telegramUpdate(overrides) {
    return Object.assign({
        update_id: 91001,
        message: {
            message_id: 77001,
            chat: { id: 123456 },
            text: '50 mercado',
        },
    }, overrides || {});
}

function deterministicOptions() {
    return {
        now: () => '2026-04-27T21:00:00.000Z',
        makeId: () => 'LAN_V54_IDEMPOTENT_0001',
    };
}

function firstPlan(overrides, options) {
    return planV54IdempotentWrite(Object.assign({
        telegramUpdate: telegramUpdate(),
        parsedEntry: parsedEntry(),
        existingIdempotencyRows: [],
        existingFinancialRows: [],
    }, overrides || {}), Object.assign(deterministicOptions(), options || {}));
}

function completedRow() {
    const plan = firstPlan();
    const row = Object.assign({}, plan.plans[0].rowObject, {
        status: IDEMPOTENCY_STATUSES.COMPLETED,
        result_ref: 'LAN_V54_IDEMPOTENT_0001',
        updated_at: '2026-04-27T21:01:00.000Z',
    });
    return row;
}

let failed = 0;

failed += test('first_valid_payload_plans_processing_log_financial_insert_and_completion', () => {
    const plan = firstPlan();

    assert.strictEqual(plan.ok, true);
    assert.strictEqual(plan.decision, 'planned_idempotent_write');
    assert.strictEqual(plan.shouldCreateFinancialEntry, true);
    assert.deepStrictEqual(plan.plans.map((step) => step.action), [
        'INSERT_IDEMPOTENCY_LOG',
        'INSERT_FINANCIAL_ENTRY',
        'MARK_IDEMPOTENCY_COMPLETED',
    ]);
    assert.strictEqual(plan.plans[0].rowObject.idempotency_key, 'telegram:telegram_update_id:91001');
    assert.strictEqual(plan.plans[1].rowObject.id_lancamento, 'LAN_V54_IDEMPOTENT_0001');
    assert.strictEqual(plan.plans[2].rowObject.status, 'completed');
    assert.strictEqual(plan.plans[2].rowObject.result_ref, 'LAN_V54_IDEMPOTENT_0001');
});

failed += test('duplicate_completed_key_blocks_financial_insert', () => {
    const plan = firstPlan({ existingIdempotencyRows: [completedRow()] });

    assert.strictEqual(plan.ok, false);
    assert.strictEqual(plan.decision, 'duplicate_completed');
    assert.strictEqual(plan.shouldCreateFinancialEntry, false);
    assert.deepStrictEqual(plan.plans, []);
    assert.strictEqual(plan.errors[0].code, 'IDEMPOTENCY_COMPLETED_DUPLICATE');
});

failed += test('duplicate_processing_key_blocks_financial_insert_and_is_retryable', () => {
    const processing = Object.assign(completedRow(), {
        status: IDEMPOTENCY_STATUSES.PROCESSING,
        result_ref: '',
    });
    const plan = firstPlan({ existingIdempotencyRows: [processing] });

    assert.strictEqual(plan.ok, false);
    assert.strictEqual(plan.decision, 'duplicate_processing');
    assert.strictEqual(plan.retryable, true);
    assert.strictEqual(plan.shouldCreateFinancialEntry, false);
    assert.deepStrictEqual(plan.plans, []);
    assert.strictEqual(plan.failureWindows[0].code, FAILURE_WINDOWS.PROCESSING_LOG_WITHOUT_FINANCIAL_ROW);
});

failed += test('same_payload_with_different_update_id_warns_and_allows_plan', () => {
    const payload = { message: { text: '50 mercado' } };
    const existing = Object.assign(completedRow(), {
        idempotency_key: 'telegram:telegram_update_id:91001',
        telegram_update_id: '91001',
        payload_hash: hashPayload(payload),
    });
    const plan = firstPlan({
        idempotencyInput: {
            telegram_update_id: '91002',
            telegram_message_id: '77002',
            chat_id: '123456',
            payload,
        },
        existingIdempotencyRows: [existing],
    });

    assert.strictEqual(plan.ok, true);
    assert.strictEqual(plan.shouldCreateFinancialEntry, true);
    assert.strictEqual(plan.idempotency.idempotency_key, 'telegram:telegram_update_id:91002');
    assert.strictEqual(plan.warnings.some((warning) => warning.code === 'SAME_PAYLOAD_DIFFERENT_IDEMPOTENCY_KEY'), true);
});

failed += test('semantic_duplicate_warning_does_not_block', () => {
    const semantic = parsedEntry();
    const existing = Object.assign(completedRow(), {
        idempotency_key: 'telegram:telegram_update_id:91000',
        semantic_fingerprint: makeSemanticFingerprint(semantic),
    });
    const plan = firstPlan({
        telegramUpdate: telegramUpdate({ update_id: 91003 }),
        existingIdempotencyRows: [existing],
        semanticEntry: semantic,
    });

    assert.strictEqual(plan.ok, true);
    assert.strictEqual(plan.shouldCreateFinancialEntry, true);
    assert.strictEqual(plan.warnings.some((warning) => warning.code === 'POSSIBLE_SEMANTIC_DUPLICATE'), true);
});

failed += test('failure_window_processing_log_exists_financial_row_missing_blocks_retry', () => {
    const store = createInMemoryV54WriteStore();
    const plan = firstPlan();
    store.applyPlan(plan, { stopAfterAction: 'INSERT_IDEMPOTENCY_LOG' });

    const retry = firstPlan({
        existingIdempotencyRows: store.existingIdempotencyRows(),
        existingFinancialRows: store.existingFinancialRows(),
    });

    assert.strictEqual(retry.ok, false);
    assert.strictEqual(retry.decision, 'duplicate_processing');
    assert.strictEqual(retry.retryable, true);
    assert.strictEqual(retry.shouldCreateFinancialEntry, false);
    assert.strictEqual(retry.failureWindows[0].code, FAILURE_WINDOWS.PROCESSING_LOG_WITHOUT_FINANCIAL_ROW);
});

failed += test('failure_window_financial_row_exists_completed_log_missing_blocks_retry_with_todo', () => {
    const store = createInMemoryV54WriteStore();
    const plan = firstPlan();
    store.applyPlan(plan, { stopAfterAction: 'INSERT_FINANCIAL_ENTRY' });

    const retry = firstPlan({
        existingIdempotencyRows: store.existingIdempotencyRows(),
        existingFinancialRows: store.existingFinancialRows(),
    });

    assert.strictEqual(retry.ok, false);
    assert.strictEqual(retry.decision, 'processing_with_financial_present_completion_missing');
    assert.strictEqual(retry.retryable, false);
    assert.strictEqual(retry.shouldCreateFinancialEntry, false);
    assert.strictEqual(retry.failureWindows[0].code, FAILURE_WINDOWS.FINANCIAL_ROW_WITHOUT_COMPLETED_LOG);
    assert.strictEqual(retry.errors.some((error) => error.code === 'IDEMPOTENCY_COMPLETION_RECOVERY_TODO'), true);
});

failed += test('deterministic_idempotency_key_derivation_remains_stable', () => {
    const input = makeTelegramIdempotencyInput({ telegramUpdate: telegramUpdate() });
    const first = firstPlan({ idempotencyInput: input });
    const second = firstPlan({ idempotencyInput: input });

    assert.strictEqual(first.idempotency.idempotency_key, 'telegram:telegram_update_id:91001');
    assert.deepStrictEqual(first.idempotency, second.idempotency);
});

failed += test('message_id_and_payload_hash_fallbacks_are_stable', () => {
    const messageFallback = makeTelegramIdempotencyInput({
        telegramUpdate: {
            message: {
                message_id: 77002,
                chat: { id: 123456 },
                text: 'sem update id',
            },
        },
    });
    const payloadFallback = makeTelegramIdempotencyInput({
        payload: { text: 'sem ids' },
    });

    const byMessage = firstPlan({ idempotencyInput: messageFallback });
    const byPayload = firstPlan({ idempotencyInput: payloadFallback });

    assert.strictEqual(byMessage.idempotency.idempotency_key, 'telegram:message:123456:77002');
    assert.strictEqual(byPayload.idempotency.idempotency_key, `telegram:payload:${hashPayload({ text: 'sem ids' })}`);
});

failed += test('local_write_path_has_no_apps_script_globals_or_external_side_effects', () => {
    const source = fs.readFileSync(path.join(__dirname, 'lib', 'v54-idempotent-write-path.js'), 'utf8');
    [
        'SpreadsheetApp',
        'LockService',
        'PropertiesService',
        'UrlFetchApp',
        'OpenAI',
        'fetch(',
        'XMLHttpRequest',
        'doPost',
        'clasp',
    ].forEach((needle) => {
        assert.strictEqual(source.includes(needle), false, `${needle} should not appear`);
    });
});

if (failed > 0) {
    console.error(`\n${failed} V54 idempotent write path check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 idempotent write path checks passed.');
}

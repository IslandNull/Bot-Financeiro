const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { V54_SHEETS } = require('./lib/v54-schema');
const { V54_SEED_DATA } = require('./lib/v54-seed');
const {
    assignPurchaseToInvoiceCycle,
    buildInvoiceId,
    clampDayToMonth,
} = require('./lib/v54-card-invoice-cycle');

const sourcePath = path.join(__dirname, 'lib', 'v54-card-invoice-cycle.js');
const source = fs.readFileSync(sourcePath, 'utf8');

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

function cardsById() {
    return V54_SEED_DATA[V54_SHEETS.CARTOES].reduce((acc, card) => {
        acc[card.id_cartao] = { ...card };
        return acc;
    }, {});
}

function cycleFor(date, card) {
    return assignPurchaseToInvoiceCycle(date, card);
}

function assertOk(result) {
    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.deepStrictEqual(result.errors, []);
    return result.cycle;
}

function assertError(result, code, field) {
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.cycle, null);
    assert.ok(result.errors.some((error) => {
        if (error.code !== code) return false;
        return field ? error.field === field : true;
    }), `Expected ${code}${field ? ` on ${field}` : ''}, got ${JSON.stringify(result.errors)}`);
}

const cards = cardsById();
let failed = 0;

failed += test('purchase_before_closing_belongs_to_current_closing_cycle', () => {
    const cycle = assertOk(cycleFor('2026-04-29', cards.CARD_NUBANK_GU));

    assert.deepStrictEqual(cycle, {
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
        id_cartao: 'CARD_NUBANK_GU',
        competencia: '2026-04',
        data_fechamento: '2026-04-30',
        data_vencimento: '2026-05-07',
    });
});

failed += test('purchase_on_closing_day_belongs_to_that_closing_cycle', () => {
    const cycle = assertOk(cycleFor('2026-04-30', cards.CARD_NUBANK_GU));

    assert.strictEqual(cycle.competencia, '2026-04');
    assert.strictEqual(cycle.data_fechamento, '2026-04-30');
    assert.strictEqual(cycle.data_vencimento, '2026-05-07');
});

failed += test('purchase_after_closing_belongs_to_next_closing_cycle', () => {
    const cycle = assertOk(cycleFor('2026-04-06', cards.CARD_MP_GU));

    assert.deepStrictEqual(cycle, {
        id_fatura: 'FAT_CARD_MP_GU_2026_05',
        id_cartao: 'CARD_MP_GU',
        competencia: '2026-05',
        data_fechamento: '2026-05-05',
        data_vencimento: '2026-06-10',
    });
});

failed += test('closing_day_30_in_february_clamps_correctly', () => {
    const cycle = assertOk(cycleFor('2026-02-28', cards.CARD_NUBANK_GU));

    assert.strictEqual(clampDayToMonth(2026, 2, 30), 28);
    assert.strictEqual(cycle.data_fechamento, '2026-02-28');
    assert.strictEqual(cycle.data_vencimento, '2026-03-07');
});

failed += test('due_date_in_next_month_clamps_if_needed', () => {
    const cycle = assertOk(cycleFor('2026-01-29', {
        id_cartao: 'CARD_TEST_DUE_31',
        fechamento_dia: 30,
        vencimento_dia: 31,
        ativo: true,
    }));

    assert.deepStrictEqual(cycle, {
        id_fatura: 'FAT_CARD_TEST_DUE_31_2026_01',
        id_cartao: 'CARD_TEST_DUE_31',
        competencia: '2026-01',
        data_fechamento: '2026-01-30',
        data_vencimento: '2026-02-28',
    });
});

failed += test('december_purchase_crossing_january_works', () => {
    const cycle = assertOk(cycleFor('2026-12-31', cards.CARD_NUBANK_GU));

    assert.deepStrictEqual(cycle, {
        id_fatura: 'FAT_CARD_NUBANK_GU_2027_01',
        id_cartao: 'CARD_NUBANK_GU',
        competencia: '2027-01',
        data_fechamento: '2027-01-30',
        data_vencimento: '2027-02-07',
    });
});

failed += test('nubank_gustavo_close_30_due_7_fixtures', () => {
    assert.deepStrictEqual(assertOk(cycleFor('2026-04-01', cards.CARD_NUBANK_GU)), {
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
        id_cartao: 'CARD_NUBANK_GU',
        competencia: '2026-04',
        data_fechamento: '2026-04-30',
        data_vencimento: '2026-05-07',
    });
    assert.deepStrictEqual(assertOk(cycleFor('2026-05-31', cards.CARD_NUBANK_GU)), {
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_06',
        id_cartao: 'CARD_NUBANK_GU',
        competencia: '2026-06',
        data_fechamento: '2026-06-30',
        data_vencimento: '2026-07-07',
    });
});

failed += test('mercado_pago_gustavo_close_5_due_10_fixtures', () => {
    assert.deepStrictEqual(assertOk(cycleFor('2026-04-05', cards.CARD_MP_GU)), {
        id_fatura: 'FAT_CARD_MP_GU_2026_04',
        id_cartao: 'CARD_MP_GU',
        competencia: '2026-04',
        data_fechamento: '2026-04-05',
        data_vencimento: '2026-05-10',
    });
    assert.strictEqual(assertOk(cycleFor('2026-04-06', cards.CARD_MP_GU)).competencia, '2026-05');
});

failed += test('nubank_luana_close_1_due_8_fixtures', () => {
    assert.deepStrictEqual(assertOk(cycleFor('2026-04-01', cards.CARD_NUBANK_LU)), {
        id_fatura: 'FAT_CARD_NUBANK_LU_2026_04',
        id_cartao: 'CARD_NUBANK_LU',
        competencia: '2026-04',
        data_fechamento: '2026-04-01',
        data_vencimento: '2026-05-08',
    });
    assert.deepStrictEqual(assertOk(cycleFor('2026-04-02', cards.CARD_NUBANK_LU)), {
        id_fatura: 'FAT_CARD_NUBANK_LU_2026_05',
        id_cartao: 'CARD_NUBANK_LU',
        competencia: '2026-05',
        data_fechamento: '2026-05-01',
        data_vencimento: '2026-06-08',
    });
});

failed += test('invoice_id_is_deterministic_and_includes_card_and_month', () => {
    assert.strictEqual(buildInvoiceId('CARD_NUBANK_GU', '2026-04'), 'FAT_CARD_NUBANK_GU_2026_04');
    assert.strictEqual(
        assertOk(cycleFor('2026-04-29', cards.CARD_NUBANK_GU)).id_fatura,
        assertOk(cycleFor('2026-04-29', cards.CARD_NUBANK_GU)).id_fatura,
    );
});

failed += test('invalid_card_config_returns_structured_error', () => {
    const result = cycleFor('2026-04-29', {
        id_cartao: '',
        fechamento_dia: 0,
        vencimento_dia: 32,
        ativo: true,
    });

    assertError(result, 'REQUIRED_FIELD', 'id_cartao');
    assertError(result, 'INVALID_DAY', 'fechamento_dia');
    assertError(result, 'INVALID_DAY', 'vencimento_dia');
});

failed += test('invalid_date_returns_structured_error', () => {
    assertError(cycleFor('2026-02-31', cards.CARD_NUBANK_GU), 'INVALID_DATE', 'purchaseDate');
    assertError(cycleFor('26/04/2026', cards.CARD_NUBANK_GU), 'INVALID_DATE', 'purchaseDate');
});

failed += test('inputs_are_not_mutated', () => {
    const card = { ...cards.CARD_NUBANK_GU };
    const before = JSON.stringify(card);

    assertOk(cycleFor('2026-04-29', card));

    assert.strictEqual(JSON.stringify(card), before);
});

failed += test('card_cycle_contract_does_not_use_apps_script_globals', () => {
    ['SpreadsheetApp', 'LockService', 'PropertiesService', 'UrlFetchApp'].forEach((globalName) => {
        assert.strictEqual(source.includes(globalName), false, `${globalName} should not appear`);
    });
});

failed += test('card_cycle_contract_does_not_call_llm_or_vendor_api', () => {
    ['openai', 'chat.completions', 'responses.create', 'UrlFetchApp.fetch'].forEach((needle) => {
        assert.strictEqual(source.toLowerCase().includes(needle.toLowerCase()), false, `${needle} should not appear`);
    });
});

if (failed > 0) {
    console.error(`\n${failed} V54 card invoice cycle check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 card invoice cycle checks passed.');
}

const assert = require('assert');

const {
    buildInstallmentSchedule,
    calculateHouseholdSettlement,
    calculateIncomeShares,
    calculateInvoiceCycle,
    classifyReserve,
    summarizeFutureHomeForecast,
    summarizeOperationalDre,
} = require('./lib/v54-domain');

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

let failed = 0;

failed += test('rateio_cash_income_gustavo_luana', () => {
    const shares = calculateIncomeShares({ Gustavo: 3400, Luana: 3500 });
    assert.deepStrictEqual(shares, {
        total: 6900,
        Gustavo: { income: 3400, share: 0.49, percent: 49.28 },
        Luana: { income: 3500, share: 0.51, percent: 50.72 },
    });
});

failed += test('benefits_reduce_cash_settlement_base', () => {
    const settlement = calculateHouseholdSettlement({
        incomes: { Gustavo: 3400, Luana: 3500 },
        coupleExpenses: 3000,
        benefitsApplied: 1800,
        payments: { Gustavo: 600, Luana: 600 },
    });

    assert.strictEqual(settlement.cashBase, 1200);
    assert.strictEqual(settlement.Gustavo.expected, 591.3);
    assert.strictEqual(settlement.Luana.expected, 608.7);
    assert.strictEqual(settlement.Gustavo.difference, 8.7);
    assert.strictEqual(settlement.Luana.difference, -8.7);
});

failed += test('dre_excludes_investments_reserve_transfers_and_invoice_payment', () => {
    const dre = summarizeOperationalDre([
        { tipo_evento: 'Receita', classe_dre: 'Operacional', afeta_dre: true, valor: 6900 },
        { tipo_evento: 'Despesa', classe_dre: 'Operacional', afeta_dre: true, valor: 1000 },
        { tipo_evento: 'Despesa', classe_dre: 'Investimento', afeta_dre: false, valor: 1400 },
        { tipo_evento: 'Despesa', classe_dre: 'Reserva', afeta_dre: false, valor: 1000 },
        { tipo_evento: 'PagamentoFatura', classe_dre: 'Fatura', afeta_dre: false, valor: 2200 },
        { tipo_evento: 'Transferencia', classe_dre: 'Transferencia', afeta_dre: false, valor: 500 },
    ]);

    assert.deepStrictEqual(dre, { receitas: 6900, despesas: 1000, saldo: 5900 });
});

failed += test('reserve_bands_and_targets', () => {
    assert.deepStrictEqual(classifyReserve(0), {
        balance: 0,
        band: 'below_minimum',
        priority: 'maximum',
        nextTarget: 15000,
        missingToNextTarget: 15000,
    });
    assert.strictEqual(classifyReserve(15000).band, 'between_minimum_and_ideal');
    assert.strictEqual(classifyReserve(30000).band, 'inside_ideal_band');
    assert.strictEqual(classifyReserve(33000).band, 'ideal_complete');
});

failed += test('future_home_forecast_is_not_current_dre_when_inactive', () => {
    const forecast = summarizeFutureHomeForecast([
        { item: 'Luz', valor_previsto: 200, ativo_no_dre: false },
        { item: 'Agua', valor_previsto: 100, ativo_no_dre: false },
        { item: 'Internet', valor_previsto: 120, ativo_no_dre: false },
        { item: 'Celulares', valor_previsto: 80, ativo_no_dre: false },
        { item: 'Condominio', valor_previsto: 400, ativo_no_dre: false },
    ]);

    assert.deepStrictEqual(forecast, { forecastTotal: 900, activeDreTotal: 0 });
});

failed += test('card_invoice_cycle_for_three_cards', () => {
    assert.deepStrictEqual(calculateInvoiceCycle('2026-04-30', {
        id_cartao: 'nubank_gustavo',
        fechamento_dia: 30,
        vencimento_dia: 7,
    }), {
        cardId: 'nubank_gustavo',
        competencia: '2026-04',
        data_fechamento: '2026-04-30',
        data_vencimento: '2026-05-07',
    });

    assert.deepStrictEqual(calculateInvoiceCycle('2026-04-06', {
        id_cartao: 'mercado_pago_gustavo',
        fechamento_dia: 5,
        vencimento_dia: 10,
    }), {
        cardId: 'mercado_pago_gustavo',
        competencia: '2026-05',
        data_fechamento: '2026-05-05',
        data_vencimento: '2026-06-10',
    });

    assert.deepStrictEqual(calculateInvoiceCycle('2026-04-01', {
        id_cartao: 'nubank_luana',
        fechamento_dia: 1,
        vencimento_dia: 8,
    }), {
        cardId: 'nubank_luana',
        competencia: '2026-04',
        data_fechamento: '2026-04-01',
        data_vencimento: '2026-05-08',
    });
});

failed += test('closing_day_clamps_to_last_day_of_short_month', () => {
    const cycle = calculateInvoiceCycle('2026-02-28', {
        id_cartao: 'nubank_gustavo',
        fechamento_dia: 30,
        vencimento_dia: 7,
    });

    assert.strictEqual(cycle.data_fechamento, '2026-02-28');
    assert.strictEqual(cycle.data_vencimento, '2026-03-07');
});

failed += test('installment_schedule_crosses_year_boundary', () => {
    const schedule = buildInstallmentSchedule({
        purchaseDate: '2026-12-06',
        card: {
            id_cartao: 'mercado_pago_gustavo',
            fechamento_dia: 5,
            vencimento_dia: 10,
        },
        totalInstallments: 3,
        installmentValue: 100,
    });

    assert.deepStrictEqual(schedule.map(item => item.competencia), ['2027-01', '2027-02', '2027-03']);
    assert.deepStrictEqual(schedule.map(item => item.data_vencimento), ['2027-02-10', '2027-03-10', '2027-04-10']);
});

if (failed > 0) {
    console.error(`\n${failed} V54 domain check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 domain checks passed.');
}

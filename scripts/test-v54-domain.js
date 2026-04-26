const assert = require('assert');

const {
    buildMonthlyClosing,
    buildInstallmentSchedule,
    calculateEmergencyReserveBalance,
    calculateHouseholdSettlement,
    calculateIncomeShares,
    calculateInvoiceCycle,
    calculateNetWorth,
    classifyReserve,
    evaluateAmortizationReadiness,
    sanitizeEntriesForSharedView,
    summarizeSettlementStatus,
    summarizeFutureHomeForecast,
    summarizeOperationalDre,
    summarizeUpcomingInvoices,
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

failed += test('invoice_payment_reconciles_without_duplicate_dre_expense', () => {
    const dre = summarizeOperationalDre([
        { tipo_evento: 'Despesa', classe_dre: 'Operacional', afeta_dre: true, valor: 700 },
        { tipo_evento: 'PagamentoFatura', classe_dre: 'Fatura', afeta_dre: false, valor: 700 },
    ]);
    const upcoming = summarizeUpcomingInvoices([
        {
            id_fatura: 'fat_nubank_gu_2026_05',
            data_vencimento: '2026-05-07',
            valor_previsto: 1000,
            valor_fechado: 1000,
            valor_pago: 300,
            status: 'aberta',
        },
        {
            id_fatura: 'fat_mp_gu_2026_07',
            data_vencimento: '2026-07-10',
            valor_previsto: 500,
            valor_pago: 0,
            status: 'aberta',
        },
        {
            id_fatura: 'fat_nu_lu_2026_05',
            data_vencimento: '2026-05-08',
            valor_previsto: 900,
            valor_pago: 900,
            status: 'paga',
        },
    ], { asOfDate: '2026-04-26', days: 60 });

    assert.deepStrictEqual(dre, { receitas: 0, despesas: 700, saldo: -700 });
    assert.deepStrictEqual(upcoming, {
        total: 700,
        invoices: [{
            id_fatura: 'fat_nubank_gu_2026_05',
            data_vencimento: '2026-05-07',
            outstanding: 700,
        }],
    });
});

failed += test('emergency_reserve_excludes_home_earmarked_assets', () => {
    const assets = [
        { nome: 'Mercado Pago Cofrinho', saldo_atual: 11469, destinacao: 'Casa', conta_reserva_emergencia: false, ativo: true },
        { nome: 'Nubank Caixinha', saldo_atual: 5166, destinacao: 'Casa', conta_reserva_emergencia: false, ativo: true },
        { nome: 'Reserva futura', saldo_atual: 1000, destinacao: 'Reserva', conta_reserva_emergencia: true, ativo: true },
    ];

    assert.strictEqual(calculateEmergencyReserveBalance(assets), 1000);
    assert.deepStrictEqual(calculateNetWorth({
        assets,
        debts: [
            { nome: 'Caixa', saldo_devedor: 254156.57, status: 'ativa' },
            { nome: 'Vasco', saldo_devedor: 55175.41, status: 'ativa' },
        ],
    }), {
        assets: 17635,
        debts: 309331.98,
        netWorth: -291696.98,
    });
});

failed += test('amortization_recommendation_requires_reserve_invoices_and_debt_data', () => {
    assert.deepStrictEqual(evaluateAmortizationReadiness({
        reserveBalance: 0,
        upcomingInvoicesTotal: null,
        debts: [{ id_divida: 'caixa', saldo_devedor: 254156.57, valor_parcela: 1906.2 }],
    }), {
        ready: false,
        reasons: [
            'reserve_below_minimum',
            'upcoming_invoices_unknown',
            'debt_caixa_parcelas_total_missing',
        ],
    });

    assert.deepStrictEqual(evaluateAmortizationReadiness({
        reserveBalance: 16000,
        upcomingInvoicesTotal: 2100,
        debts: [{
            id_divida: 'caixa',
            saldo_devedor: 254156.57,
            valor_parcela: 1906.2,
            parcelas_total: 419,
            status: 'ativa',
        }],
    }), {
        ready: true,
        reasons: [],
    });
});

failed += test('monthly_closing_compiles_dre_invoices_reserve_net_worth_and_settlement', () => {
    const settlement = calculateHouseholdSettlement({
        incomes: { Gustavo: 3400, Luana: 3500 },
        coupleExpenses: 3000,
        benefitsApplied: 1800,
        payments: { Gustavo: 600, Luana: 600 },
    });

    assert.deepStrictEqual(summarizeSettlementStatus(settlement), {
        status: 'pending_transfer',
        transfers: [{ from: 'Luana', to: 'Gustavo', amount: 8.7 }],
    });

    const closing = buildMonthlyClosing({
        competencia: '2026-05',
        asOfDate: '2026-04-26',
        events: [
            { tipo_evento: 'Receita', classe_dre: 'Operacional', afeta_dre: true, valor: 6900 },
            { tipo_evento: 'Despesa', classe_dre: 'Operacional', afeta_dre: true, valor: 3000 },
            { tipo_evento: 'PagamentoFatura', classe_dre: 'Fatura', afeta_dre: false, valor: 700 },
        ],
        invoices: [{
            id_fatura: 'fat_nubank_gu_2026_05',
            data_vencimento: '2026-05-07',
            valor_previsto: 1000,
            valor_pago: 300,
            status: 'aberta',
        }],
        assets: [
            { saldo_atual: 16635, conta_reserva_emergencia: false, ativo: true },
            { saldo_atual: 1000, conta_reserva_emergencia: true, ativo: true },
        ],
        debts: [{ saldo_devedor: 55175.41, status: 'ativa' }],
        settlement,
        savingsAmount: 1000,
        decisions: ['Priorizar reserva', 'Provisionar fatura', 'Sem amortizacao ainda'],
    });

    assert.deepStrictEqual(closing, {
        competencia: '2026-05',
        status: 'draft',
        receitas_operacionais: 6900,
        despesas_operacionais: 3000,
        saldo_operacional: 3900,
        faturas_60d: 700,
        parcelas_futuras: 0,
        taxa_poupanca: 0.14,
        reserva_total: 1000,
        patrimonio_liquido: -37540.41,
        acerto_status: 'pending_transfer',
        decisao_1: 'Priorizar reserva',
        decisao_2: 'Provisionar fatura',
        decisao_3: 'Sem amortizacao ainda',
    });
});

failed += test('privacy_rules_hide_private_entries_from_shared_detail', () => {
    const shared = sanitizeEntriesForSharedView([
        { id_lancamento: 'l1', visibilidade: 'detalhada', descricao: 'Mercado casal', id_fonte: 'alelo' },
        { id_lancamento: 'l2', visibilidade: 'resumo', descricao: 'Farmacia pessoal', id_fonte: 'nubank_gu', id_cartao: 'nubank_gu' },
        { id_lancamento: 'l3', visibilidade: 'privada', descricao: 'Compra privada', id_fonte: 'nubank_lu' },
    ]);

    assert.deepStrictEqual(shared, [
        { id_lancamento: 'l1', visibilidade: 'detalhada', descricao: 'Mercado casal', id_fonte: 'alelo' },
        { id_lancamento: 'l2', visibilidade: 'resumo', descricao: '', id_fonte: '', id_cartao: '', summarized: true },
    ]);
});

if (failed > 0) {
    console.error(`\n${failed} V54 domain check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 domain checks passed.');
}

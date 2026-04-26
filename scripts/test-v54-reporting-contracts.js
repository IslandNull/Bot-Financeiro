const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
    buildMonthlyClosingDraft,
    draftCoupleSettlement,
    draftNetWorth,
    filterSharedDetailedEntries,
    summarizeDebts,
    summarizeOperationalDreFromLancamentos,
    summarizeReserveAssets,
} = require('./lib/v54-reporting-contracts');

const sourcePath = path.join(__dirname, 'lib', 'v54-reporting-contracts.js');
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

function baseLancamento(overrides) {
    return Object.assign({
        id_lancamento: 'LAN_TEST',
        competencia: '2026-04',
        tipo_evento: 'despesa',
        valor: 100,
        pessoa: 'Gustavo',
        escopo: 'Casal',
        afeta_dre: true,
        afeta_acerto: true,
        afeta_patrimonio: false,
        visibilidade: 'detalhada',
        descricao: 'Fixture',
    }, overrides || {});
}

function homeAssetsOnly() {
    return [
        {
            id_ativo: 'ATIVO_MP_CASA',
            nome: 'Mercado Pago Cofrinho Casa',
            saldo_atual: 11469,
            destinacao: 'Casa',
            conta_reserva_emergencia: false,
            ativo: true,
        },
        {
            id_ativo: 'ATIVO_NU_CASA',
            nome: 'Nubank Caixinha Casa',
            saldo_atual: 5166,
            destinacao: 'Casa',
            conta_reserva_emergencia: false,
            ativo: true,
        },
    ];
}

function debtsFixture() {
    return [
        {
            id_divida: 'DIV_CAIXA',
            nome: 'Financiamento Caixa',
            credor: 'Caixa',
            saldo_devedor: 254156.57,
            valor_parcela: 1906.2,
            status: 'ativa',
        },
        {
            id_divida: 'DIV_VASCO',
            nome: 'Vasco',
            credor: 'Vasco',
            saldo_devedor: 55175.41,
            valor_parcela: 700,
            status: 'ativa',
        },
    ];
}

let failed = 0;

failed += test('dre_includes_receitas_and_despesas_with_afeta_dre_true', () => {
    const dre = summarizeOperationalDreFromLancamentos([
        baseLancamento({ id_lancamento: 'r1', tipo_evento: 'receita', valor: 3400 }),
        baseLancamento({ id_lancamento: 'd1', tipo_evento: 'despesa', valor: 900 }),
    ]);

    assert.deepStrictEqual(dre, {
        receitas_operacionais: 3400,
        despesas_operacionais: 900,
        saldo_operacional: 2500,
        included_ids: ['r1', 'd1'],
    });
});

failed += test('dre_excludes_non_dre_movements_when_afeta_dre_false', () => {
    const dre = summarizeOperationalDreFromLancamentos([
        baseLancamento({ id_lancamento: 'receita_ok', tipo_evento: 'receita', valor: 6900 }),
        baseLancamento({ id_lancamento: 'despesa_ok', tipo_evento: 'despesa', valor: 1000 }),
        baseLancamento({ tipo_evento: 'aporte', valor: 1400, afeta_dre: false }),
        baseLancamento({ tipo_evento: 'transferencia', valor: 500, afeta_dre: false }),
        baseLancamento({ tipo_evento: 'ajuste', id_categoria: 'RESERVA_MOVIMENTO', valor: 300, afeta_dre: false }),
        baseLancamento({ tipo_evento: 'pagamento_fatura', valor: 2200, afeta_dre: false }),
    ]);

    assert.strictEqual(dre.receitas_operacionais, 6900);
    assert.strictEqual(dre.despesas_operacionais, 1000);
    assert.strictEqual(dre.saldo_operacional, 5900);
    assert.deepStrictEqual(dre.included_ids, ['receita_ok', 'despesa_ok']);
});

failed += test('dre_ignores_unsupported_event_types_even_when_afeta_dre_true', () => {
    const dre = summarizeOperationalDreFromLancamentos([
        baseLancamento({ id_lancamento: 'receita_ok', tipo_evento: 'receita', valor: 1000, afeta_dre: true }),
        baseLancamento({ id_lancamento: 'ajuste_flagged', tipo_evento: 'ajuste', valor: 999, afeta_dre: true }),
        baseLancamento({ id_lancamento: 'fatura_flagged', tipo_evento: 'pagamento_fatura', valor: 888, afeta_dre: true }),
        baseLancamento({ id_lancamento: 'transferencia_flagged', tipo_evento: 'transferencia', valor: 777, afeta_dre: true }),
    ]);

    assert.deepStrictEqual(dre, {
        receitas_operacionais: 1000,
        despesas_operacionais: 0,
        saldo_operacional: 1000,
        included_ids: ['receita_ok'],
    });
});

failed += test('emergency_reserve_starts_zero_when_home_assets_are_not_reserve', () => {
    const reserve = summarizeReserveAssets(homeAssetsOnly());
    assert.strictEqual(reserve.reserva_total, 0);
});

failed += test('home_earmarked_16635_is_visible_but_not_reserve', () => {
    const reserve = summarizeReserveAssets(homeAssetsOnly());
    assert.strictEqual(reserve.home_earmarked_total, 16635);
    assert.strictEqual(reserve.reserva_total, 0);
    assert.deepStrictEqual(reserve.home_earmarked_assets, ['ATIVO_MP_CASA', 'ATIVO_NU_CASA']);
});

failed += test('reserve_summary_classifies_inactive_assets_without_counting_them', () => {
    const reserve = summarizeReserveAssets([
        { id_ativo: 'ATIVO_RESERVA', saldo_atual: 1000, conta_reserva_emergencia: true, ativo: true },
        { id_ativo: 'ATIVO_INATIVO_FLAG', saldo_atual: 900, conta_reserva_emergencia: true, ativo: false },
        { id_ativo: 'ATIVO_INATIVO_STATUS', saldo_atual: 800, destinacao: 'Casa', status: 'inativa' },
    ]);

    assert.strictEqual(reserve.reserva_total, 1000);
    assert.strictEqual(reserve.home_earmarked_total, 0);
    assert.deepStrictEqual(reserve.inactive_assets, ['ATIVO_INATIVO_FLAG', 'ATIVO_INATIVO_STATUS']);
});

failed += test('net_worth_is_assets_minus_debts', () => {
    const netWorth = draftNetWorth({
        assets: [
            ...homeAssetsOnly(),
            { id_ativo: 'ATIVO_RESERVA', saldo_atual: 1000, conta_reserva_emergencia: true, ativo: true },
        ],
        debts: debtsFixture(),
    });

    assert.deepStrictEqual(netWorth, {
        ativos_total: 17635,
        dividas_total: 309331.98,
        patrimonio_liquido: -291696.98,
    });
});

failed += test('net_worth_ignores_inactive_assets_and_debts', () => {
    const netWorth = draftNetWorth({
        assets: [
            { id_ativo: 'ATIVO_ATIVO', saldo_atual: 1000, ativo: true },
            { id_ativo: 'ATIVO_INATIVO', saldo_atual: 999, ativo: false },
        ],
        debts: [
            { id_divida: 'DIV_ATIVA', saldo_devedor: 200, status: 'ativa' },
            { id_divida: 'DIV_QUITADA', saldo_devedor: 800, status: 'quitada' },
        ],
    });

    assert.deepStrictEqual(netWorth, {
        ativos_total: 1000,
        dividas_total: 200,
        patrimonio_liquido: 800,
    });
});

failed += test('debts_include_caixa_and_vasco_without_fake_interest_split', () => {
    const debts = summarizeDebts(debtsFixture());
    assert.strictEqual(debts.dividas_total, 309331.98);
    assert.deepStrictEqual(debts.debts.map((debt) => debt.credor), ['Caixa', 'Vasco']);
    debts.debts.forEach((debt) => {
        assert.strictEqual(debt.principal_interest_split_known, false);
        assert.strictEqual(debt.limitation, 'principal_interest_split_unknown');
    });
});

failed += test('couple_settlement_includes_only_afeta_acerto_true_casal_entries', () => {
    const acerto = draftCoupleSettlement({
        incomes: { Gustavo: 3400, Luana: 3500 },
        lancamentos: [
            baseLancamento({ id_lancamento: 'incluir_gustavo', pessoa: 'Gustavo', valor: 600, afeta_acerto: true, escopo: 'Casal' }),
            baseLancamento({ id_lancamento: 'incluir_luana', pessoa: 'Luana', valor: 400, afeta_acerto: true, escopo: 'Casal' }),
            baseLancamento({ id_lancamento: 'excluir_flag', pessoa: 'Gustavo', valor: 999, afeta_acerto: false, escopo: 'Casal' }),
            baseLancamento({ id_lancamento: 'excluir_escopo', pessoa: 'Luana', valor: 888, afeta_acerto: true, escopo: 'Luana' }),
        ],
    });

    assert.deepStrictEqual(acerto.included_ids, ['incluir_gustavo', 'incluir_luana']);
    assert.strictEqual(acerto.total_casal, 1000);
    assert.strictEqual(acerto.people.Gustavo.valor_pago_casal, 600);
    assert.strictEqual(acerto.people.Luana.valor_pago_casal, 400);
    assert.strictEqual(acerto.status, 'pending_transfer');
});

failed += test('couple_settlement_does_not_count_receitas_as_couple_expenses', () => {
    const acerto = draftCoupleSettlement({
        incomes: { Gustavo: 3400, Luana: 3500 },
        lancamentos: [
            baseLancamento({ id_lancamento: 'despesa_gustavo', tipo_evento: 'despesa', pessoa: 'Gustavo', valor: 600, afeta_acerto: true, escopo: 'Casal' }),
            baseLancamento({ id_lancamento: 'receita_luana', tipo_evento: 'receita', pessoa: 'Luana', valor: 500, afeta_acerto: true, escopo: 'Casal' }),
        ],
    });

    assert.deepStrictEqual(acerto.included_ids, ['despesa_gustavo']);
    assert.strictEqual(acerto.total_casal, 600);
    assert.strictEqual(acerto.people.Luana.valor_pago_casal, 0);
});

failed += test('private_visibility_entries_do_not_appear_in_shared_detailed_report', () => {
    const shared = filterSharedDetailedEntries([
        baseLancamento({ id_lancamento: 'detalhada', visibilidade: 'detalhada', descricao: 'Mercado casal' }),
        baseLancamento({ id_lancamento: 'resumo', visibilidade: 'resumo', descricao: 'Farmacia pessoal', id_fonte: 'FONTE_CONTA_GU', id_cartao: 'CARD_PRIVADO' }),
        baseLancamento({ id_lancamento: 'privada', visibilidade: 'privada', descricao: 'Privado' }),
    ]);

    assert.deepStrictEqual(shared.map((entry) => entry.id_lancamento), ['detalhada', 'resumo']);
    assert.strictEqual(shared[1].descricao, '');
    assert.strictEqual(shared[1].id_fonte, '');
    assert.strictEqual(shared[1].id_cartao, '');
    assert.strictEqual(shared.some((entry) => entry.id_lancamento === 'privada'), false);
});

failed += test('monthly_closing_draft_has_fechamentos_mensais_shape_with_placeholders', () => {
    const closing = buildMonthlyClosingDraft({
        competencia: '2026-04',
        now: () => '2026-04-26T23:00:00.000Z',
        incomes: { Gustavo: 3400, Luana: 3500 },
        lancamentos: [
            baseLancamento({ tipo_evento: 'receita', valor: 6900 }),
            baseLancamento({ tipo_evento: 'despesa', valor: 3000 }),
            baseLancamento({ tipo_evento: 'pagamento_fatura', valor: 1200, afeta_dre: false }),
        ],
        assets: [
            ...homeAssetsOnly(),
            { id_ativo: 'ATIVO_RESERVA', saldo_atual: 1000, conta_reserva_emergencia: true, ativo: true },
        ],
        debts: debtsFixture(),
    });

    assert.deepStrictEqual(closing, {
        competencia: '2026-04',
        status: 'draft',
        receitas_operacionais: 6900,
        despesas_operacionais: 3000,
        saldo_operacional: 3900,
        faturas_60d: 0,
        parcelas_futuras: 0,
        taxa_poupanca: 0,
        reserva_total: 1000,
        patrimonio_liquido: -291696.98,
        acerto_status: 'pending_transfer',
        decisao_1: 'PLACEHOLDER_RULE_BASED_DECISION_1',
        decisao_2: 'PLACEHOLDER_RULE_BASED_DECISION_2',
        decisao_3: 'PLACEHOLDER_RULE_BASED_DECISION_3',
        created_at: '2026-04-26T23:00:00.000Z',
        closed_at: '',
    });
    [closing.decisao_1, closing.decisao_2, closing.decisao_3].forEach((decision) => {
        assert.strictEqual(decision.startsWith('PLACEHOLDER_RULE_BASED_DECISION_'), true);
        assert.strictEqual(decision.toLowerCase().includes('recomend'), false);
    });
});

failed += test('inputs_are_not_mutated', () => {
    const lancamentos = [
        baseLancamento({ tipo_evento: 'receita', valor: 6900 }),
        baseLancamento({ tipo_evento: 'despesa', valor: 3000 }),
    ];
    const assets = homeAssetsOnly();
    const debts = debtsFixture();
    const before = JSON.stringify({ lancamentos, assets, debts });

    summarizeOperationalDreFromLancamentos(lancamentos);
    summarizeReserveAssets(assets);
    draftNetWorth({ assets, debts });
    draftCoupleSettlement({ lancamentos, incomes: { Gustavo: 3400, Luana: 3500 } });
    filterSharedDetailedEntries(lancamentos);
    buildMonthlyClosingDraft({ competencia: '2026-04', lancamentos, assets, debts });

    assert.strictEqual(JSON.stringify({ lancamentos, assets, debts }), before);
});

failed += test('reporting_contracts_do_not_use_apps_script_globals', () => {
    ['SpreadsheetApp', 'LockService', 'PropertiesService', 'UrlFetchApp'].forEach((globalName) => {
        assert.strictEqual(source.includes(globalName), false, `${globalName} should not appear`);
    });
});

failed += test('reporting_contracts_do_not_call_llm_or_vendor_api', () => {
    ['openai', 'chat.completions', 'responses.create', 'UrlFetchApp.fetch'].forEach((needle) => {
        assert.strictEqual(source.toLowerCase().includes(needle.toLowerCase()), false, `${needle} should not appear`);
    });
});

if (failed > 0) {
    console.error(`\n${failed} V54 reporting contract check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 reporting contract checks passed.');
}

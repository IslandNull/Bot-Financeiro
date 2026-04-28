const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { V54_HEADERS, V54_SHEETS } = require('./lib/v54-schema');
const { mapSingleCardPurchaseContract } = require('./lib/v54-card-purchase-contract');
const { mapInstallmentScheduleContract } = require('./lib/v54-installment-schedule-contract');
const {
    PROTECTED_FATURA_STATUSES,
    expectedFaturaItemFromCardPurchase,
    expectedFaturaItemsFromInstallmentSchedule,
    planExpectedFaturasUpsert,
} = require('./lib/v54-faturas-expected-upsert');

const sourcePath = path.join(__dirname, 'lib', 'v54-faturas-expected-upsert.js');
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

function baseCardEntry(overrides) {
    return Object.assign({
        tipo_evento: 'compra_cartao',
        data: '2026-04-29',
        competencia: '2099-12',
        valor: 105,
        descricao: 'Restaurante casal',
        pessoa: 'Gustavo',
        escopo: 'Casal',
        visibilidade: 'detalhada',
        id_categoria: 'OPEX_RESTAURANTE_CASAL',
        id_cartao: 'CARD_NUBANK_GU',
        afeta_dre: true,
        afeta_acerto: true,
        afeta_patrimonio: true,
    }, overrides || {});
}

function baseInstallmentEntry(overrides) {
    return Object.assign({
        tipo_evento: 'compra_parcelada',
        data: '2026-04-29',
        competencia: '2099-12',
        valor: 1200,
        descricao: 'Geladeira',
        pessoa: 'Gustavo',
        escopo: 'Casal',
        visibilidade: 'detalhada',
        id_categoria: 'OPEX_CASA_ITENS',
        id_cartao: 'CARD_NUBANK_GU',
        afeta_dre: true,
        afeta_acerto: true,
        afeta_patrimonio: true,
        parcelamento: { parcelas_total: 3 },
    }, overrides || {});
}

function mapCard(entry) {
    const result = mapSingleCardPurchaseContract(entry, {
        mapperOptions: {
            now: () => '2026-04-27T12:00:00.000Z',
            makeId: () => 'LAN_V54_CARD_TEST_0001',
        },
    });
    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    return result;
}

function mapInstallment(entry) {
    const result = mapInstallmentScheduleContract(entry, {
        makeCompraId: () => 'CP_FAT_TEST_0001',
        makeParcelaId: (_entry, numeroParcela, idCompra) => `${idCompra}_P${String(numeroParcela).padStart(2, '0')}`,
    });
    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    return result;
}

function plan(expectedItems, existingRows, headers) {
    return planExpectedFaturasUpsert({
        headers: headers || V54_HEADERS[V54_SHEETS.FATURAS],
        existingRows: existingRows || [],
        expectedItems,
    });
}

function productionFaturaRow(overrides) {
    return Object.assign({
        _rowNumber: 7,
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
        id_cartao: 'CARD_NUBANK_GU',
        competencia: '2026-04',
        data_fechamento: '2026-04-30',
        data_vencimento: '2026-05-07',
        valor_previsto: 1,
        valor_fechado: '',
        valor_pago: '',
        fonte_pagamento: '',
        status: 'prevista',
    }, overrides || {});
}

function productionExpectedItem(overrides) {
    return Object.assign({
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
        id_cartao: 'CARD_NUBANK_GU',
        competencia: '2026-04',
        data_fechamento: '2026-04-30',
        data_vencimento: '2026-05-07',
        valor: 1,
    }, overrides || {});
}

function assertOk(result) {
    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.deepStrictEqual(result.errors, []);
    return result;
}

function assertError(result, code, field) {
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((error) => {
        if (error.code !== code) return false;
        return field ? error.field === field : true;
    }), `Expected ${code}${field ? ` on ${field}` : ''}, got ${JSON.stringify(result.errors)}`);
}

let failed = 0;

failed += test('cria_fatura_prevista_nova_para_compra_a_vista_no_cartao', () => {
    const item = expectedFaturaItemFromCardPurchase(mapCard(baseCardEntry()));
    const result = assertOk(plan([item]));

    assert.strictEqual(result.actions.length, 1);
    assert.strictEqual(result.actions[0].type, 'append');
    assert.deepStrictEqual(result.rowObjects[0], {
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
        id_cartao: 'CARD_NUBANK_GU',
        competencia: '2026-04',
        data_fechamento: '2026-04-30',
        data_vencimento: '2026-05-07',
        valor_previsto: 105,
        valor_fechado: '',
        valor_pago: '',
        fonte_pagamento: '',
        status: 'prevista',
    });
});

failed += test('atualiza_e_soma_valor_previsto_em_fatura_existente_prevista', () => {
    const item = expectedFaturaItemFromCardPurchase(mapCard(baseCardEntry({ valor: 25.5 })));
    const existing = [{
        _rowNumber: 7,
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
        id_cartao: 'CARD_NUBANK_GU',
        competencia: '2026-04',
        data_fechamento: '2026-04-30',
        data_vencimento: '2026-05-07',
        valor_previsto: 100,
        valor_fechado: '',
        valor_pago: '',
        fonte_pagamento: '',
        status: 'prevista',
    }];

    const result = assertOk(plan([item], existing));

    assert.strictEqual(result.actions[0].type, 'update');
    assert.strictEqual(result.actions[0].rowNumber, 7);
    assert.strictEqual(result.rowObjects[0].valor_previsto, 125.5);
    assert.strictEqual(result.rowObjects[0].valor_fechado, '');
    assert.strictEqual(result.rowObjects[0].valor_pago, '');
});

failed += test('fatura_existente_com_strings_equivalentes_nao_gera_conflito_de_ciclo', () => {
    const result = assertOk(plan([productionExpectedItem()], [productionFaturaRow()]));

    assert.strictEqual(result.actions[0].type, 'update');
    assert.strictEqual(result.rowObjects[0].valor_previsto, 2);
});

failed += test('fatura_existente_com_date_objects_equivalentes_nao_gera_conflito_de_ciclo', () => {
    const existing = productionFaturaRow({
        competencia: new Date(2026, 3, 1),
        data_fechamento: new Date(2026, 3, 30),
        data_vencimento: new Date(2026, 4, 7),
    });

    const result = assertOk(plan([productionExpectedItem()], [existing]));

    assert.strictEqual(result.actions[0].type, 'update');
    assert.strictEqual(result.rowObjects[0].competencia, '2026-04');
    assert.strictEqual(result.rowObjects[0].data_fechamento, '2026-04-30');
    assert.strictEqual(result.rowObjects[0].data_vencimento, '2026-05-07');
    assert.strictEqual(result.rowObjects[0].valor_previsto, 2);
});

failed += test('fatura_existente_com_valores_formatados_da_planilha_equivalentes_nao_gera_conflito_de_ciclo', () => {
    const existing = productionFaturaRow({
        competencia: '04/2026',
        data_fechamento: '30/04/2026',
        data_vencimento: '07/05/2026',
        valor_previsto: '1',
        status: ' prevista ',
    });

    const result = assertOk(plan([productionExpectedItem()], [existing]));

    assert.strictEqual(result.actions[0].type, 'update');
    assert.strictEqual(result.rowObjects[0].valor_previsto, 2);
});

failed += test('regressao_producao_mercado_semana_nubank_gustavo_planeja_update_ok', () => {
    const existing = [productionFaturaRow()];
    const result = assertOk(plan([productionExpectedItem()], existing));

    assert.strictEqual(result.actions.length, 1);
    assert.strictEqual(result.actions[0].type, 'update');
    assert.strictEqual(result.actions[0].id_fatura, 'FAT_CARD_NUBANK_GU_2026_04');
    assert.strictEqual(result.rowObjects[0].valor_previsto, 2);
});

failed += test('fatura_existente_com_mismatch_real_continua_bloqueando', () => {
    [
        { field: 'id_cartao', value: 'CARD_OUTRO' },
        { field: 'competencia', value: '2026-05' },
        { field: 'data_fechamento', value: '2026-05-01' },
        { field: 'data_vencimento', value: '2026-05-08' },
    ].forEach(({ field, value }) => {
        const result = plan([productionExpectedItem()], [productionFaturaRow({ [field]: value })]);
        assertError(result, 'FATURA_CYCLE_CONFLICT', field);
        assert.strictEqual(result.actions[0].type, 'invalid_skip');
    });
});

failed += test('fatura_existente_com_status_paga_ou_fechada_continua_protegida', () => {
    ['paga', 'fechada'].forEach((status) => {
        const result = plan([productionExpectedItem()], [productionFaturaRow({ status })]);
        assertError(result, 'PROTECTED_FATURA_STATUS', 'status');
        assert.strictEqual(result.actions[0].type, 'protected_skip');
    });
});

failed += test('compras_no_mesmo_cartao_e_mesma_competencia_sao_agregadas_em_uma_fatura', () => {
    const first = expectedFaturaItemFromCardPurchase(mapCard(baseCardEntry({ valor: 40, data: '2026-04-10' })));
    const second = expectedFaturaItemFromCardPurchase(mapCard(baseCardEntry({ valor: 60, data: '2026-04-29' })));
    const result = assertOk(plan([first, second]));

    assert.strictEqual(result.actions.length, 1);
    assert.strictEqual(result.rowObjects[0].id_fatura, 'FAT_CARD_NUBANK_GU_2026_04');
    assert.strictEqual(result.rowObjects[0].valor_previsto, 100);
});

failed += test('compras_em_cartoes_diferentes_criam_faturas_distintas', () => {
    const nubank = expectedFaturaItemFromCardPurchase(mapCard(baseCardEntry({
        valor: 40,
        id_cartao: 'CARD_NUBANK_GU',
        data: '2026-04-29',
    })));
    const mp = expectedFaturaItemFromCardPurchase(mapCard(baseCardEntry({
        valor: 60,
        id_cartao: 'CARD_MP_GU',
        data: '2026-04-06',
    })));
    const result = assertOk(plan([nubank, mp]));

    assert.deepStrictEqual(result.rowObjects.map((row) => row.id_fatura), [
        'FAT_CARD_NUBANK_GU_2026_04',
        'FAT_CARD_MP_GU_2026_05',
    ]);
    assert.deepStrictEqual(result.rowObjects.map((row) => row.valor_previsto), [40, 60]);
});

failed += test('compra_em_fechamento_de_fevereiro_usa_datas_do_ciclo_aceito', () => {
    const item = expectedFaturaItemFromCardPurchase(mapCard(baseCardEntry({
        data: '2026-02-28',
        id_cartao: 'CARD_NUBANK_GU',
        valor: 88,
    })));
    const result = assertOk(plan([item]));

    assert.strictEqual(result.rowObjects[0].competencia, '2026-02');
    assert.strictEqual(result.rowObjects[0].data_fechamento, '2026-02-28');
    assert.strictEqual(result.rowObjects[0].data_vencimento, '2026-03-07');
});

failed += test('compra_parcelada_gera_faturas_previstas_por_parcela_pendente_sem_lancamentos', () => {
    const schedule = mapInstallment(baseInstallmentEntry({
        valor: 1200,
        parcelamento: { parcelas_total: 3 },
    }));
    const result = assertOk(plan(expectedFaturaItemsFromInstallmentSchedule(schedule)));

    assert.deepStrictEqual(result.rowObjects.map((row) => row.id_fatura), [
        'FAT_CARD_NUBANK_GU_2026_04',
        'FAT_CARD_NUBANK_GU_2026_05',
        'FAT_CARD_NUBANK_GU_2026_06',
    ]);
    assert.deepStrictEqual(result.rowObjects.map((row) => row.valor_previsto), [400, 400, 400]);
    assert.deepStrictEqual(result.dreRows, []);
});

failed += test('parcela_pendente_mesma_fatura_soma_com_fatura_existente', () => {
    const schedule = mapInstallment(baseInstallmentEntry({
        valor: 300,
        parcelamento: { parcelas_total: 3 },
    }));
    const existing = [{
        id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
        id_cartao: 'CARD_NUBANK_GU',
        competencia: '2026-04',
        data_fechamento: '2026-04-30',
        data_vencimento: '2026-05-07',
        valor_previsto: 45,
        valor_fechado: '',
        valor_pago: '',
        fonte_pagamento: '',
        status: 'prevista',
    }];

    const result = assertOk(plan(expectedFaturaItemsFromInstallmentSchedule(schedule), existing));

    assert.strictEqual(result.actions[0].type, 'update');
    assert.strictEqual(result.rowObjects[0].valor_previsto, 145);
});

failed += test('nao_mexe_em_statuses_protegidos_sem_regra_explicita', () => {
    const item = expectedFaturaItemFromCardPurchase(mapCard(baseCardEntry({ valor: 25 })));

    PROTECTED_FATURA_STATUSES.forEach((status) => {
        const existing = [{
            id_fatura: 'FAT_CARD_NUBANK_GU_2026_04',
            id_cartao: 'CARD_NUBANK_GU',
            competencia: '2026-04',
            data_fechamento: '2026-04-30',
            data_vencimento: '2026-05-07',
            valor_previsto: 100,
            valor_fechado: 100,
            valor_pago: status === 'paga' ? 100 : '',
            fonte_pagamento: '',
            status,
        }];
        const result = plan([item], existing);

        assertError(result, 'PROTECTED_FATURA_STATUS', 'status');
        assert.strictEqual(result.rowObjects.length, 0);
        assert.strictEqual(result.actions[0].type, 'protected_skip');
    });
});

failed += test('rejeita_schema_header_mismatch', () => {
    const headers = [...V54_HEADERS[V54_SHEETS.FATURAS]];
    headers[5] = 'valor_incorreto';
    const item = expectedFaturaItemFromCardPurchase(mapCard(baseCardEntry()));
    const result = plan([item], [], headers);

    assertError(result, 'HEADER_MISMATCH', V54_SHEETS.FATURAS);
    assert.strictEqual(result.actions.length, 0);
});

failed += test('nao_cria_pagamento_de_fatura', () => {
    const item = expectedFaturaItemFromCardPurchase(mapCard(baseCardEntry()));
    const result = assertOk(plan([item]));

    assert.deepStrictEqual(result.payments, []);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'pagamentos'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'pagamentosRows'), false);
});

failed += test('nao_afeta_dre_diretamente', () => {
    const item = expectedFaturaItemFromCardPurchase(mapCard(baseCardEntry()));
    const result = assertOk(plan([item]));

    assert.deepStrictEqual(result.dreRows, []);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'lancamentos'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'lancamentosRows'), false);
});

failed += test('contract_has_no_apps_script_globals', () => {
    ['SpreadsheetApp', 'LockService', 'PropertiesService', 'UrlFetchApp'].forEach((globalName) => {
        assert.strictEqual(source.includes(globalName), false, `${globalName} should not appear`);
    });
});

failed += test('contract_has_no_openai_or_vendor_calls', () => {
    ['openai', 'chat.completions', 'responses.create', 'UrlFetchApp.fetch'].forEach((needle) => {
        assert.strictEqual(source.toLowerCase().includes(needle.toLowerCase()), false, `${needle} should not appear`);
    });
});

if (failed > 0) {
    console.error(`\n${failed} V54 faturas expected upsert check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 faturas expected upsert checks passed.');
}

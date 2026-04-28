const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const setupPath = path.join(__dirname, '..', 'src', 'Setup.js');
const mainPath = path.join(__dirname, '..', 'src', 'Main.js');
const schemaPath = path.join(__dirname, '..', 'src', '000_V54Schema.js');
const setupSource = fs.readFileSync(setupPath, 'utf8');
const mainSource = fs.readFileSync(mainPath, 'utf8');
const schemaSource = fs.readFileSync(schemaPath, 'utf8');
const setupRuntimeSource = `${schemaSource}\n${setupSource}`;

const { V54_HEADERS } = require('./lib/v54-schema');
const { V54_SEED_DATA, V54_SEED_KEY_FIELDS, validateV54SeedData } = require('./lib/v54-seed');

function extractFunction(source, name) {
    const start = source.indexOf(`function ${name}(`);
    if (start === -1) throw new Error(`Function not found: ${name}`);

    let depth = 0;
    let seenBody = false;
    for (let i = start; i < source.length; i++) {
        if (source[i] === '{') {
            depth++;
            seenBody = true;
        } else if (source[i] === '}') {
            depth--;
            if (seenBody && depth === 0) return source.slice(start, i + 1);
        }
    }
    throw new Error(`Could not parse function body: ${name}`);
}

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

function loadSeedFunctions(stubs) {
    const sandbox = Object.assign({
        console: { log() {} },
        CONFIG: { TIMEZONE: 'America/Sao_Paulo', SPREADSHEET_ID: 'TEST' },
        Utilities: {
            formatDate(value) {
                return value.toISOString().slice(0, 10);
            },
        },
    }, stubs || {});

    const functions = [
        'getV54SeedData',
        'getV54SeedKeyFields_',
        'normalizeV54SeedValue_',
        'v54SeedRowsEqual_',
        'v54SeedRowToValues_',
        'v54SeedValuesToRow_',
        'planSeedV54ForState',
        'readV54SeedState_',
        'applySeedV54',
    ].map((name) => extractFunction(setupRuntimeSource, name)).join('\n');

    vm.runInNewContext(`${schemaSource}\n${functions}\nresult = { getV54Schema, getV54SeedData, planSeedV54ForState, applySeedV54 };`, sandbox);
    return sandbox.result;
}

function totalSeedRows(seedData = V54_SEED_DATA) {
    return Object.values(seedData).reduce((sum, rows) => sum + rows.length, 0);
}

function makeStateWithRows(rowsForSheet) {
    return Object.entries(V54_SEED_DATA).reduce((acc, [sheetName]) => {
        acc[sheetName] = {
            headers: [...V54_HEADERS[sheetName]],
            lastColumn: V54_HEADERS[sheetName].length,
            lastRow: 1 + (rowsForSheet[sheetName] || []).length,
            rows: rowsForSheet[sheetName] || [],
        };
        return acc;
    }, {});
}

function makeFakeSpreadsheet(rowsForSheet) {
    const mutations = [];
    const sheets = {};

    Object.entries(V54_SEED_DATA).forEach(([sheetName]) => {
        sheets[sheetName] = {
            headers: [...V54_HEADERS[sheetName]],
            rows: (rowsForSheet && rowsForSheet[sheetName] ? rowsForSheet[sheetName] : [])
                .map((row) => V54_HEADERS[sheetName].map((header) => row[header] === undefined ? '' : row[header])),
        };
    });

    function makeSheet(sheetName, sheetState) {
        return {
            getLastRow() {
                return 1 + sheetState.rows.length;
            },
            getLastColumn() {
                return sheetState.headers.length;
            },
            getRange(row, column, numRows, numColumns) {
                return {
                    getValues() {
                        if (row === 1) {
                            return [Array.from({ length: numColumns }, (_, index) => sheetState.headers[index] || '')];
                        }

                        return Array.from({ length: numRows }, (_, rowOffset) => {
                            const sourceRow = sheetState.rows[row - 2 + rowOffset] || [];
                            return Array.from({ length: numColumns }, (_, index) => sourceRow[index] || '');
                        });
                    },
                    setValues(values) {
                        mutations.push({ type: 'setValues', sheet: sheetName, row, column, numRows, numColumns, values });
                        values.forEach((valuesRow, index) => {
                            sheetState.rows[row - 2 + index] = [...valuesRow];
                        });
                    },
                };
            },
        };
    }

    return {
        mutations,
        getSheetByName(sheetName) {
            return sheets[sheetName] ? makeSheet(sheetName, sheets[sheetName]) : null;
        },
    };
}

let failed = 0;

failed += test('v54_seed_payload_is_valid_and_targets_only_seed_sheets', () => {
    assert.deepStrictEqual(validateV54SeedData(), { ok: true, errors: [] });
    assert.deepStrictEqual(Object.keys(V54_SEED_DATA), [
        'Config_Categorias',
        'Config_Fontes',
        'Rendas',
        'Cartoes',
        'Patrimonio_Ativos',
        'Dividas',
        'Orcamento_Futuro_Casa',
    ]);
    ['Config', 'Lancamentos', 'Dashboard', 'Investimentos', 'Parcelas'].forEach((v53Sheet) => {
        assert.strictEqual(Object.keys(V54_SEED_DATA).includes(v53Sheet), false);
    });
});

failed += test('apps_script_seed_matches_local_seed_exactly', () => {
    const { getV54SeedData } = loadSeedFunctions();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(getV54SeedData())), V54_SEED_DATA);
});

failed += test('v54_seed_contains_reviewed_household_facts', () => {
    const cards = V54_SEED_DATA.Cartoes.reduce((acc, row) => {
        acc[row.id_cartao] = row;
        return acc;
    }, {});
    assert.deepStrictEqual(cards.CARD_NUBANK_GU, {
        id_cartao: 'CARD_NUBANK_GU',
        id_fonte: 'FONTE_NUBANK_GU',
        nome: 'Nubank Gustavo',
        titular: 'Gustavo',
        fechamento_dia: 30,
        vencimento_dia: 7,
        limite: 10550,
        ativo: true,
    });
    assert.strictEqual(cards.CARD_MP_GU.fechamento_dia, 5);
    assert.strictEqual(cards.CARD_MP_GU.vencimento_dia, 10);
    assert.strictEqual(cards.CARD_NUBANK_LU.fechamento_dia, 1);
    assert.strictEqual(cards.CARD_NUBANK_LU.vencimento_dia, 8);

    const incomes = V54_SEED_DATA.Rendas.reduce((acc, row) => {
        acc[row.id_renda] = row;
        return acc;
    }, {});
    assert.strictEqual(incomes.REN_GU_SALARIO_LIQUIDO.valor, 3400);
    assert.strictEqual(incomes.REN_LU_SALARIO_LIQUIDO.valor, 3500);
    assert.strictEqual(incomes.REN_GU_ALELO.valor, 1500);
    assert.strictEqual(incomes.REN_GU_ALELO.afeta_rateio, false);
    assert.strictEqual(incomes.REN_LU_VA.valor, 300);

    V54_SEED_DATA.Patrimonio_Ativos.forEach((asset) => {
        assert.strictEqual(asset.destinacao, 'Itens da casa');
        assert.strictEqual(asset.conta_reserva_emergencia, false);
    });

    V54_SEED_DATA.Orcamento_Futuro_Casa.forEach((row) => {
        assert.strictEqual(row.data_inicio_prevista, '2026-06-01');
        assert.strictEqual(row.ativo_no_dre, false);
    });
});

failed += test('planSeedV54_reports_insert_rows_for_clean_skeleton', () => {
    const { planSeedV54ForState } = loadSeedFunctions();
    const plan = planSeedV54ForState(makeStateWithRows({}));
    assert.strictEqual(plan.ok, true);
    assert.strictEqual(plan.summary.insertSeedRow, totalSeedRows());
    assert.strictEqual(plan.summary.blocked, 0);
    assert.strictEqual(plan.summary.unmanagedRows, 0);
    assert.ok(plan.actions.every((action) => action.action === 'INSERT_SEED_ROW'));
});

failed += test('planSeedV54_is_idempotent_when_rows_already_match', () => {
    const { planSeedV54ForState } = loadSeedFunctions();
    const plan = planSeedV54ForState(makeStateWithRows(V54_SEED_DATA));
    assert.strictEqual(plan.ok, true);
    assert.strictEqual(plan.summary.ok, totalSeedRows());
    assert.strictEqual(plan.summary.insertSeedRow, 0);
    assert.strictEqual(plan.summary.blocked, 0);
    assert.ok(plan.actions.every((action) => action.action === 'OK'));
});

failed += test('planSeedV54_blocks_conflicting_existing_seed_row', () => {
    const { planSeedV54ForState } = loadSeedFunctions();
    const rows = JSON.parse(JSON.stringify(V54_SEED_DATA));
    rows.Cartoes[0].limite = 1;
    const plan = planSeedV54ForState(makeStateWithRows(rows));
    const conflicts = plan.actions.filter((action) => action.action === 'BLOCKED_SEED_CONFLICT');
    assert.strictEqual(plan.ok, false);
    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(conflicts[0].sheet, 'Cartoes');
    assert.strictEqual(conflicts[0].key, 'CARD_NUBANK_GU');
});

failed += test('planSeedV54_blocks_missing_or_drifted_sheets', () => {
    const { planSeedV54ForState } = loadSeedFunctions();
    const state = makeStateWithRows({});
    delete state.Rendas;
    state.Cartoes.headers = ['id_cartao', 'nome_antigo'];

    const plan = planSeedV54ForState(state);
    assert.strictEqual(plan.ok, false);
    assert.ok(plan.actions.some((action) => action.action === 'BLOCKED_MISSING_SHEET' && action.sheet === 'Rendas'));
    assert.ok(plan.actions.some((action) => action.action === 'BLOCKED_HEADER_MISMATCH' && action.sheet === 'Cartoes'));
});

failed += test('applySeedV54_uses_lock_and_aborts_on_conflict_without_mutation', () => {
    const rows = JSON.parse(JSON.stringify(V54_SEED_DATA));
    rows.Cartoes[0].limite = 1;
    const fakeSpreadsheet = makeFakeSpreadsheet(rows);
    const locks = [];
    const { applySeedV54 } = loadSeedFunctions({
        _loadSecrets() {},
        SpreadsheetApp: { openById: () => fakeSpreadsheet },
        withScriptLock(label, fn) {
            locks.push(label);
            return fn();
        },
    });

    const result = applySeedV54();
    assert.deepStrictEqual(locks, ['applySeedV54']);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.applied, false);
    assert.strictEqual(fakeSpreadsheet.mutations.length, 0);
});

failed += test('applySeedV54_inserts_only_missing_seed_rows_into_v54_sheets', () => {
    const fakeSpreadsheet = makeFakeSpreadsheet({});
    const { applySeedV54 } = loadSeedFunctions({
        _loadSecrets() {},
        SpreadsheetApp: { openById: () => fakeSpreadsheet },
        withScriptLock(label, fn) {
            assert.strictEqual(label, 'applySeedV54');
            return fn();
        },
    });

    const result = applySeedV54();
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.applied, true);
    assert.strictEqual(result.summary.insertSeedRow, totalSeedRows());
    assert.strictEqual(fakeSpreadsheet.mutations.length, Object.keys(V54_SEED_DATA).length);
    assert.ok(fakeSpreadsheet.mutations.every((mutation) => Object.keys(V54_SEED_DATA).includes(mutation.sheet)));
    assert.ok(fakeSpreadsheet.mutations.every((mutation) => mutation.type === 'setValues'));
});

failed += test('applySeedV54_static_surface_is_manual_additive_and_non_formula', () => {
    const body = [
        extractFunction(setupSource, 'applySeedV54'),
        extractFunction(setupSource, 'planSeedV54ForState'),
        extractFunction(setupSource, 'readV54SeedState_'),
    ].join('\n');

    assert.ok(body.includes("withScriptLock('applySeedV54'"));
    assert.ok(body.includes("action.action === 'INSERT_SEED_ROW'"));
    assert.ok(body.includes('.setValues('));

    [
        '.insertSheet(',
        '.deleteSheet(',
        '.setFormula(',
        '.clearContent(',
        '.clear(',
        '.deleteRows(',
        '.deleteColumns(',
        '.appendRow(',
        '.copyTo(',
    ].forEach((forbidden) => {
        assert.strictEqual(body.includes(forbidden), false, `Forbidden call found: ${forbidden}`);
    });

    const blocklist = extractFunction(mainSource, 'isBlockedMutatingGetAction_');
    assert.ok(blocklist.includes("'applySeedV54'"), 'applySeedV54 must be explicitly blocked over GET');
});

failed += test('npm_script_registered', () => {
    const packageJson = require('../package.json');
    assert.strictEqual(packageJson.scripts['test:v54:seed'], 'node scripts/test-v54-seed.js');
});

if (failed > 0) {
    console.error(`\n${failed} V54 seed check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 seed checks passed.');
}

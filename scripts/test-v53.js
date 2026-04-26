const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
const statePath = path.join(root, '.ai_shared', 'SPREADSHEET_STATE.md');

function loadEnv() {
    if (!fs.existsSync(envPath)) return {};
    return fs.readFileSync(envPath, 'utf8').split(/\r?\n/).reduce((acc, line) => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) acc[match[1].trim()] = match[2].trim();
        return acc;
    }, {});
}

function assertCheck(results, name, ok, detail) {
    results.push({ name, ok: Boolean(ok), detail });
}

function testSnapshot() {
    const results = [];
    if (!fs.existsSync(statePath)) {
        assertCheck(results, 'snapshot_exists', false, statePath);
        return results;
    }

    const text = fs.readFileSync(statePath, 'utf8');
    assertCheck(results, 'snapshot_header', text.startsWith('# Spreadsheet State'), 'Expected # Spreadsheet State');
    assertCheck(results, 'lancamentos_v53_header', text.includes('Data | TIPO | ID | VALOR | FONTE | DESCRIÇÃO | PAGADOR | COMPETÊNCIA'), 'Expected V53 Lancamentos header');
    assertCheck(results, 'config_v53_dictionary', text.includes('ID_CATEGORIA | NOME_CATEGORIA | TIPO_MOVIMENTO | CLASSE_DRE | TIPO_ATIVO | REGRA_RENDIMENTO'), 'Expected Config dictionary header');
    assertCheck(results, 'no_formula_errors', !/#ERROR!|#NAME\?|#REF!|#N\/A|❌ ERRO/.test(text), 'Expected no formula errors in exported snapshot');
    assertCheck(results, 'dashboard_uses_value_column_d', text.includes("SUMIFS('Lançamentos'!D:D"), 'Expected formulas using Lancamentos D:D as value column');
    assertCheck(results, 'investimentos_uses_xlookup_ids', text.includes('XLOOKUP(A4; Config!B:B; Config!A:A)'), 'Expected investment formulas resolving names to IDs');

    return results;
}

async function runAporteTest({ keepRows }) {
    const env = loadEnv();
    if (!env.SHEETS_SYNC_URL || !env.SHEETS_SYNC_SECRET) {
        throw new Error('SHEETS_SYNC_URL and SHEETS_SYNC_SECRET must be configured in .env');
    }

    const url = new URL(env.SHEETS_SYNC_URL);
    url.searchParams.set('action', 'runV53AporteTest');
    url.searchParams.set('token', env.SHEETS_SYNC_SECRET);
    url.searchParams.set('cleanup', keepRows ? '0' : '1');

    const response = await fetch(url, { redirect: 'follow' });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
    if (/^<!doctype html/i.test(text.trim()) || /^<html/i.test(text.trim())) {
        throw new Error('Apps Script returned HTML instead of JSON.');
    }
    return JSON.parse(text);
}

function printResults(results) {
    let failed = 0;
    results.forEach(r => {
        const prefix = r.ok ? 'PASS' : 'FAIL';
        console.log(`${prefix} ${r.name}${r.detail ? ` - ${r.detail}` : ''}`);
        if (!r.ok) failed++;
    });
    return failed;
}

async function main() {
    const args = new Set(process.argv.slice(2));
    const shouldMutate = args.has('--mutate');
    const keepRows = args.has('--keep-rows');

    console.log('== V53 snapshot checks ==');
    let failed = printResults(testSnapshot());

    if (shouldMutate) {
        console.log('\n== V53 Aporte write test ==');
        const result = await runAporteTest({ keepRows });
        failed += printResults(result.checks || []);
        console.log(`RESULT ok=${result.ok} firstRow=${result.firstRow} count=${result.count} cleaned=${result.cleaned}`);
        console.log(`MARKER ${result.marker}`);
        if (result.rows) {
            result.rows.forEach((row, idx) => console.log(`ROW ${idx + 1}: ${row.join(' | ')}`));
        }
        if (!result.ok) failed++;
    } else {
        console.log('\nSkipping mutating Aporte write test. Run with -- --mutate to execute it.');
    }

    if (failed > 0) {
        console.error(`\n${failed} check(s) failed.`);
        process.exitCode = 1;
        return;
    }

    console.log('\nAll requested V53 checks passed.');
}

main().catch(err => {
    console.error('FAIL test_runner_error - ' + err.message);
    process.exitCode = 1;
});

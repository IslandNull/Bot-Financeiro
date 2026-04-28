const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { V54_HEADERS } = require('./lib/v54-schema');

const root = path.join(__dirname, '..');
const statePath = path.join(root, '.ai_shared', 'SPREADSHEET_STATE.md');

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

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readSnapshot() {
    assert.ok(fs.existsSync(statePath), `Missing snapshot: ${statePath}`);
    return fs.readFileSync(statePath, 'utf8');
}

function extractSheetSection(text, sheetName) {
    const sheetPattern = escapeRegExp(sheetName);
    const match = text.match(new RegExp(`## Sheet: ${sheetPattern}\\r?\\n([\\s\\S]*?)(?=\\r?\\n## Sheet: |$)`));
    assert.ok(match, `Missing V54 sheet in snapshot: ${sheetName}`);
    return match[1];
}

function extractHeaders(section, sheetName) {
    const match = section.match(/\*\*Headers:\*\*\r?\n- ([^\r\n]+)/);
    assert.ok(match, `Missing headers for V54 sheet: ${sheetName}`);
    return match[1].split(' | ');
}

function extractSize(section, sheetName) {
    const match = section.match(/\*\*Size:\*\* (\d+) columns x (\d+) rows/);
    assert.ok(match, `Missing size for V54 sheet: ${sheetName}`);
    return {
        columns: Number(match[1]),
        rows: Number(match[2]),
    };
}

let failed = 0;

const snapshot = readSnapshot();
const schemaSheetsPendingSnapshotVerification = new Set([
    'Telegram_Send_Log',
]);

failed += test('snapshot_header', () => {
    assert.ok(snapshot.startsWith('# Spreadsheet State'), 'Expected # Spreadsheet State');
});

failed += test('snapshot_has_no_error_payloads', () => {
    assert.ok(!/#ERROR!|#NAME\?|#REF!|#N\/A|Exception|Access denied|<html|<!DOCTYPE/i.test(snapshot));
});

Object.entries(V54_HEADERS).forEach(([sheetName, expectedHeaders]) => {
    failed += test(`v54_snapshot_headers_${sheetName}`, () => {
        if (schemaSheetsPendingSnapshotVerification.has(sheetName)) {
            assert.strictEqual(snapshot.includes(`## Sheet: ${sheetName}`), false, `${sheetName} is pending real snapshot verification and should not be claimed present yet`);
            return;
        }
        const section = extractSheetSection(snapshot, sheetName);
        const actualHeaders = extractHeaders(section, sheetName);
        const size = extractSize(section, sheetName);

        assert.deepStrictEqual(actualHeaders, expectedHeaders);
        assert.strictEqual(size.columns, expectedHeaders.length);
        assert.ok(size.rows >= 1, `${sheetName} should have at least the header row`);
    });
});

if (failed > 0) {
    console.error(`\n${failed} V54 snapshot check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 snapshot checks passed.');
}

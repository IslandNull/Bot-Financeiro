// ============================================================
// Architecture Guardrails — V54 Codebase Readability & Drift Protection
// ============================================================
// Pure local Node.js test. No Apps Script globals. No network. No spreadsheet.
// Protects architectural concepts, not formatting.
//
// Run: node scripts/test-v54-architecture-guardrails.js
//   or: npm run test:v54:architecture
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readFile(relativePath) {
    const fullPath = path.join(ROOT, relativePath);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath, 'utf-8');
}

function countLines(content) {
    if (!content) return 0;
    return content.split('\n').length;
}

let passed = 0;
let failed = 0;
const failures = [];

function assert(name, condition, message) {
    if (condition) {
        passed++;
        console.log(`  ✅ ${name}`);
    } else {
        failed++;
        const failMsg = message || 'Assertion failed.';
        failures.push({ name, message: failMsg });
        console.log(`  ❌ ${name}: ${failMsg}`);
    }
}

// ============================================================
// GUARD 1: V54_RUNTIME_MAP.md — no ambiguous phrase, has key terms
// ============================================================
console.log('\n--- Guard 1: V54_RUNTIME_MAP.md ---');

const runtimeMap = readFile('docs/V54_RUNTIME_MAP.md');
assert('runtime map exists', runtimeMap !== null, 'docs/V54_RUNTIME_MAP.md not found.');

if (runtimeMap) {
    const ambiguousPhrase = 'Todo o tráfego atual de Telegram, se existir, usaria V53 ou seria barrado pela falta de integração V54.';
    assert(
        'no ambiguous phrase',
        !runtimeMap.includes(ambiguousPhrase),
        'Runtime map still contains the old ambiguous phrase. Update it to reflect the actual routing state.'
    );

    assert('mentions ActionsV54.recordEntryV54', runtimeMap.includes('ActionsV54.recordEntryV54') || runtimeMap.includes('recordEntryV54'), 'Runtime map should reference recordEntryV54.');
    assert('mentions doPost', runtimeMap.includes('doPost'), 'Runtime map should reference doPost.');
    assert('mentions handleCommand', runtimeMap.includes('handleCommand'), 'Runtime map should reference handleCommand.');
    assert('mentions handleEntry', runtimeMap.includes('handleEntry'), 'Runtime map should reference handleEntry.');
    assert('mentions legacy V53', runtimeMap.toLowerCase().includes('legacy') || runtimeMap.toLowerCase().includes('v53'), 'Runtime map should reference legacy V53.');
}

// ============================================================
// GUARD 2: V54_CODEMAP.md — exists and has key references
// ============================================================
console.log('\n--- Guard 2: V54_CODEMAP.md ---');

const codemap = readFile('docs/V54_CODEMAP.md');
assert('codemap exists', codemap !== null, 'docs/V54_CODEMAP.md not found.');

if (codemap) {
    assert('codemap mentions src/Main.js', codemap.includes('src/Main.js'), 'Codemap should reference src/Main.js.');
    assert('codemap mentions src/ActionsV54.js', codemap.includes('src/ActionsV54.js'), 'Codemap should reference src/ActionsV54.js.');
    assert('codemap mentions scripts/lib/v54-schema.js', codemap.includes('scripts/lib/v54-schema.js'), 'Codemap should reference scripts/lib/v54-schema.js.');
    assert('codemap mentions V53_LEGACY', codemap.includes('V53_LEGACY'), 'Codemap should include V53_LEGACY status.');
    assert('codemap mentions V54_LOCAL_CONTRACT', codemap.includes('V54_LOCAL_CONTRACT'), 'Codemap should include V54_LOCAL_CONTRACT status.');
    assert('codemap mentions V54_APPS_SCRIPT_ADAPTER', codemap.includes('V54_APPS_SCRIPT_ADAPTER'), 'Codemap should include V54_APPS_SCRIPT_ADAPTER status.');
}

// ============================================================
// GUARD 3: V54 is NOT prematurely wired into doPost
// ============================================================
console.log('\n--- Guard 3: V54 not wired into Telegram routing ---');

const mainJs = readFile('src/Main.js');
assert('Main.js exists', mainJs !== null, 'src/Main.js not found.');

if (mainJs) {
    const mainCallsRecordEntryV54 = mainJs.includes('recordEntryV54');
    assert(
        'Main.js does NOT call recordEntryV54',
        !mainCallsRecordEntryV54,
        'PHASE CHANGE DETECTED: src/Main.js now calls recordEntryV54. ' +
        'Before proceeding, update docs/V54_RUNTIME_MAP.md to reflect the new routing, ' +
        'ensure Idempotency_Log is implemented (D038), and explicitly accept this phase change.'
    );
}

const actionsV54 = readFile('src/ActionsV54.js');
assert('ActionsV54.js exists', actionsV54 !== null, 'src/ActionsV54.js not found.');

if (actionsV54) {
    const hasNotWiredComment = actionsV54.includes('not wired into doPost') || actionsV54.includes('not wired into doPost/routing');
    assert(
        'ActionsV54 declares not wired into doPost',
        hasNotWiredComment,
        'ActionsV54.js should explicitly state it is not wired into doPost/routing yet.'
    );
}

// ============================================================
// GUARD 4: ActionsV54.js line limit (temporary cap)
// ============================================================
console.log('\n--- Guard 4: ActionsV54.js size limit ---');

if (actionsV54) {
    const lineCount = countLines(actionsV54);
    const MAX_LINES = 1200;
    assert(
        `ActionsV54.js <= ${MAX_LINES} lines (currently ${lineCount})`,
        lineCount <= MAX_LINES,
        `ActionsV54.js has ${lineCount} lines, exceeding the temporary ${MAX_LINES}-line cap. ` +
        'Refactor by extracting helpers before adding new features.'
    );
}

// ============================================================
// GUARD 5: Legacy files have deprecated/legacy marker
// ============================================================
console.log('\n--- Guard 5: Legacy files have deprecation markers ---');

const legacyFiles = [
    'src/Actions.js',
    'src/Commands.js',
    'src/Parser.js',
    'src/Views.js',
    'src/SetupLegacy.js',
];

legacyFiles.forEach(function(filePath) {
    const content = readFile(filePath);
    assert(filePath + ' exists', content !== null, filePath + ' not found.');
    if (content) {
        const hasMarker =
            content.toLowerCase().includes('legacy') ||
            content.toLowerCase().includes('deprecated') ||
            content.toLowerCase().includes('obsolet');
        assert(
            filePath + ' has legacy/deprecated marker',
            hasMarker,
            filePath + ' should contain a legacy, deprecated, or obsolete marker in its header comments.'
        );
    }
});

// ============================================================
// SUMMARY
// ============================================================
console.log('\n========================================');
console.log(`Architecture Guardrails: ${passed} passed, ${failed} failed`);
console.log('========================================');

if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(function(f) {
        console.log(`  ❌ ${f.name}: ${f.message}`);
    });
    process.exit(1);
}

console.log('\n✅ All architecture guardrails passed.');
process.exit(0);

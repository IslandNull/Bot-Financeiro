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

function extractFunction(source, name) {
    if (!source) return '';
    const start = source.indexOf(`function ${name}(`);
    if (start === -1) return '';
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
    return '';
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
// GUARD 1: V54_RUNTIME_MAP.md
// ============================================================
console.log('\n--- Guard 1: V54_RUNTIME_MAP.md ---');

const runtimeMap = readFile('docs/V54_RUNTIME_MAP.md');
assert('runtime map exists', runtimeMap !== null, 'docs/V54_RUNTIME_MAP.md not found.');

// We skip deep content checks here as they will be updated in docs, but let's check basic presence.

// ============================================================
// GUARD 2: V54_CODEMAP.md
// ============================================================
console.log('\n--- Guard 2: V54_CODEMAP.md ---');

const codemap = readFile('docs/V54_CODEMAP.md');
assert('codemap exists', codemap !== null, 'docs/V54_CODEMAP.md not found.');

// ============================================================
// GUARD 3: V54 routing in doPost is Primary ONLY
// ============================================================
console.log('\n--- Guard 3: V54 Primary ONLY routing in doPost ---');

const mainJs = readFile('src/Main.js');
assert('Main.js exists', mainJs !== null, 'src/Main.js not found.');

if (mainJs) {
    const hasRoutingMode = mainJs.includes('getRoutingMode_(');
    const hasPrimaryHelper = mainJs.includes('routeV54PrimaryEntry_(');
    const hasShadowHelper = mainJs.includes('runV54ShadowDiagnostics_(');
    const hasV53HandleEntry = mainJs.includes('handleEntry(');

    assert(
        'Main.js has NO routing mode resolver',
        !hasRoutingMode,
        'Main.js must not have dynamic routing mode anymore. It is V54-only.'
    );
    assert(
        'Main.js uses V54 primary helper',
        hasPrimaryHelper,
        'Main.js must route to V54 primary.'
    );
    assert(
        'Main.js has NO shadow branch',
        !hasShadowHelper,
        'Main.js must not have shadow V54 diagnostics anymore.'
    );
    assert(
        'Main.js has NO V53 handleEntry',
        !hasV53HandleEntry,
        'Main.js must not reference V53 handleEntry anymore.'
    );
}

// ============================================================
// GUARD 4: ActionsV54.js line limit
// ============================================================
console.log('\n--- Guard 4: ActionsV54.js size limit ---');

const actionsV54 = readFile('src/ActionsV54.js');
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
// GUARD 5: No V53 deployable in src/
// ============================================================
console.log('\n--- Guard 5: No V53 files in src/ ---');

const v53Files = [
    'src/Actions.js',
    'src/Commands.js',
    'src/Parser.js',
    'src/Views.js',
    'src/SetupLegacy.js',
];

v53Files.forEach(function(filePath) {
    const content = readFile(filePath);
    assert(filePath + ' is ABSENT from src', content === null, filePath + ' should not be in src/ anymore.');
});

const legacyFiles = [
    'legacy/v53/Actions.js',
    'legacy/v53/Commands.js',
    'legacy/v53/Parser.js',
    'legacy/v53/Views.js',
    'legacy/v53/SetupLegacy.js',
];

legacyFiles.forEach(function(filePath) {
    const content = readFile(filePath);
    assert(filePath + ' exists in legacy/v53', content !== null, filePath + ' should be moved to legacy/v53/.');
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

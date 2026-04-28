// ============================================================
// PARSER V54 - runtime skeleton, dependency-injected
// ============================================================
// This file is intentionally not wired into doPost. It does not call OpenAI;
// tests and future runtime wiring must inject the parser implementation.

function parseTextWithParserV54_(text, context, deps) {
    var source = deps || {};
    var parser = typeof source.parseTextV54 === 'function'
        ? source.parseTextV54
        : null;

    if (!parser) {
        return {
            ok: false,
            parsedEntry: null,
            normalized: null,
            errors: [makeV54ContractError_('PARSER_V54_DEPENDENCY_REQUIRED', 'parseTextV54', 'ParserV54 requires an injected parser dependency.')],
        };
    }

    try {
        var result = parser(String(text || ''), context || {}, source.parserOptions || {});
        return normalizeParserV54Result_(result);
    } catch (error) {
        return {
            ok: false,
            parsedEntry: null,
            normalized: null,
            errors: [makeV54ContractError_('PARSER_V54_EXCEPTION', 'parser', 'ParserV54 failed safely.')],
        };
    }
}

function normalizeParserV54Result_(result) {
    if (!result || typeof result !== 'object') {
        return {
            ok: false,
            parsedEntry: null,
            normalized: null,
            errors: [makeV54ContractError_('PARSER_V54_INVALID_RESULT', 'parser', 'ParserV54 returned an invalid result.')],
        };
    }

    if (result.ok === false) {
        return {
            ok: false,
            parsedEntry: result.parsedEntry || result.value || null,
            normalized: result.normalized || null,
            errors: normalizeV54RuntimeErrors_(result.errors, 'PARSER_V54_REJECTED', 'parser', 'ParserV54 rejected the message.'),
        };
    }

    var candidate = result.normalized || result.parsedEntry || result.value || result.entry || result;
    return {
        ok: true,
        parsedEntry: candidate,
        normalized: candidate,
        errors: [],
        raw: result,
    };
}

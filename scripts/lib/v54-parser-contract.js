const {
    ALLOWED_ESCOPO,
    ALLOWED_PESSOA,
    ALLOWED_TIPO_EVENTO,
    ALLOWED_VISIBILIDADE,
    validateParsedEntryV54,
} = require('./v54-parsed-entry-contract');

function buildParserV54SystemPrompt(context) {
    const canonical = normalizeParserContext(context);

    return [
        'You are ParserV54 for Gustavo and Luana household finance messages.',
        'Return exactly one JSON object that conforms to ParsedEntryV54.',
        'Do not include markdown, comments, explanations, secrets, production write instructions, or spreadsheet mutation instructions.',
        '',
        'Hard output rules:',
        '- Use dot decimal numeric values, for example 12.34.',
        '- Do not use comma money strings such as "12,34".',
        '- Use ISO dates: data as YYYY-MM-DD and competencia as YYYY-MM.',
        '- Use real JSON booleans true/false, never "true" or "false" strings.',
        '- Use only allowed enum values.',
        '- Use only IDs from the canonical dictionaries below.',
        '- Do not output unknown fields.',
        '',
        `Allowed tipo_evento: ${ALLOWED_TIPO_EVENTO.join(', ')}`,
        `Allowed pessoa: ${ALLOWED_PESSOA.join(', ')}`,
        `Allowed escopo: ${ALLOWED_ESCOPO.join(', ')}`,
        `Allowed visibilidade: ${ALLOWED_VISIBILIDADE.join(', ')}`,
        '',
        'Canonical categories:',
        formatCanonicalRows(canonical.categories, 'id_categoria'),
        '',
        'Canonical fontes:',
        formatCanonicalRows(canonical.fontes, 'id_fonte'),
        '',
        'Canonical cartoes:',
        formatCanonicalRows(canonical.cartoes, 'id_cartao'),
        '',
        'Required ParsedEntryV54 fields for normal events:',
        '- tipo_evento, data, competencia, valor, descricao, pessoa, escopo, visibilidade',
        '- afeta_dre, afeta_acerto, afeta_patrimonio',
        '- id_categoria when afeta_dre is true',
        '- id_fonte for cash/bank/source movements',
        '- id_cartao for compra_cartao and compra_parcelada',
        '- id_fatura for pagamento_fatura',
        '- parcelamento for compra_parcelada',
        '',
        'Financial rules:',
        '- pagamento_fatura must use afeta_dre=false.',
        '- transferencia and aporte must use afeta_dre=false.',
        '- Card purchases are expenses at purchase/installment recognition; invoice payment is settlement.',
    ].join('\n');
}

function buildParserV54UserPrompt(rawText, context) {
    const canonical = normalizeParserContext(context);
    return [
        'Parse this Portuguese financial message into one ParsedEntryV54 JSON object.',
        `Raw message: ${JSON.stringify(String(rawText || ''))}`,
        `Default pessoa: ${canonical.defaultPessoa || ''}`,
        `Default escopo: ${canonical.defaultEscopo || ''}`,
        `Reference date: ${canonical.referenceDate || ''}`,
        'Return JSON only.',
    ].join('\n');
}

function parseParserV54JsonResponse(rawResponse) {
    const text = String(rawResponse || '').trim();
    if (!text) {
        return {
            ok: false,
            error: makeParserError('EMPTY_RESPONSE', 'response', 'ParserV54 response is empty.'),
            value: null,
        };
    }

    const jsonText = extractJsonText(text);
    try {
        const value = JSON.parse(jsonText);
        if (Array.isArray(value)) {
            return {
                ok: false,
                error: makeParserError('ARRAY_RESPONSE', 'response', 'ParserV54 must return one object, not an array.'),
                value,
            };
        }
        if (!value || typeof value !== 'object') {
            return {
                ok: false,
                error: makeParserError('NON_OBJECT_RESPONSE', 'response', 'ParserV54 must return one object.'),
                value,
            };
        }
        return { ok: true, error: null, value };
    } catch (error) {
        return {
            ok: false,
            error: makeParserError('INVALID_JSON', 'response', error.message),
            value: null,
        };
    }
}

function validateParserV54Candidate(candidate) {
    return validateParsedEntryV54(candidate);
}

function parseV54CandidateFromJson(rawResponse) {
    const parsed = parseParserV54JsonResponse(rawResponse);
    if (!parsed.ok) {
        return {
            ok: false,
            parse: parsed,
            validation: null,
            errors: [parsed.error],
            normalized: {},
        };
    }

    const validation = validateParserV54Candidate(parsed.value);
    return {
        ok: validation.ok,
        parse: parsed,
        validation,
        errors: validation.errors,
        normalized: validation.normalized,
    };
}

function extractJsonText(text) {
    const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fence ? fence[1].trim() : text;
}

function normalizeParserContext(context) {
    const source = context || {};
    return {
        categories: Array.isArray(source.categories) ? source.categories : [],
        fontes: Array.isArray(source.fontes) ? source.fontes : [],
        cartoes: Array.isArray(source.cartoes) ? source.cartoes : [],
        defaultPessoa: source.defaultPessoa || '',
        defaultEscopo: source.defaultEscopo || '',
        referenceDate: source.referenceDate || '',
    };
}

function formatCanonicalRows(rows, idField) {
    if (!rows.length) return '- none provided';
    return rows.map((row) => {
        if (typeof row === 'string') return `- ${row}`;
        const id = row && row[idField] ? row[idField] : '';
        const name = row && row.nome ? ` (${row.nome})` : '';
        const details = Object.keys(row || {})
            .filter((key) => key !== idField && key !== 'nome')
            .map((key) => `${key}=${row[key]}`)
            .join(', ');
        return `- ${id}${name}${details ? `: ${details}` : ''}`;
    }).join('\n');
}

function makeParserError(code, field, message) {
    return { code, field, message };
}

module.exports = {
    buildParserV54SystemPrompt,
    buildParserV54UserPrompt,
    parseParserV54JsonResponse,
    parseV54CandidateFromJson,
    validateParserV54Candidate,
};

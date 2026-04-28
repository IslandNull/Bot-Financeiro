// ============================================================
// PARSER V54 OPENAI - productive adapter, dependency-injected
// ============================================================
// This file is intentionally not wired into doPost. Tests must inject fetch and
// validation dependencies; the default UrlFetchApp path is only for future
// reviewed runtime use.

var V54_OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
var V54_OPENAI_DEFAULT_MODEL = 'gpt-5-nano';
var V54_OPENAI_ALLOWED_TIPO_EVENTO = [
    'despesa',
    'receita',
    'transferencia',
    'compra_cartao',
    'compra_parcelada',
    'pagamento_fatura',
    'ajuste',
    'aporte',
    'divida_pagamento',
];
var V54_OPENAI_ALLOWED_PESSOA = ['Gustavo', 'Luana', 'Casal'];
var V54_OPENAI_ALLOWED_ESCOPO = ['Gustavo', 'Luana', 'Casal'];
var V54_OPENAI_ALLOWED_VISIBILIDADE = ['detalhada', 'resumo', 'privada'];

function parseTextV54OpenAI(text, runtimeContext, options) {
    var deps = normalizeParserV54OpenAIDeps_(runtimeContext, options);
    var rawText = String(text || '').trim();
    if (!rawText) {
        return makeParserV54OpenAIFailure_('PARSER_V54_EMPTY_TEXT', 'text', 'ParserV54 requires non-empty text.');
    }

    var contextResult = getParserV54OpenAIContext_(runtimeContext, deps);
    if (!contextResult.ok) return contextResult;

    var systemPrompt = buildParserV54OpenAISystemPrompt_(contextResult.context);
    var userPrompt = buildParserV54OpenAIUserPrompt_(rawText, contextResult.context, deps);
    var requestBody = buildParserV54OpenAIRequestBody_(systemPrompt, userPrompt, deps);

    var response;
    try {
        response = callParserV54OpenAI_(requestBody, deps);
    } catch (error) {
        return makeParserV54OpenAIFailure_('PARSER_V54_FETCH_FAILED', 'fetch', 'ParserV54 OpenAI request failed safely.');
    }

    var contentResult = extractParserV54OpenAIContent_(response);
    if (!contentResult.ok) return contentResult;

    var jsonResult = parseParserV54OpenAIJsonResponse_(contentResult.content);
    if (!jsonResult.ok) return jsonResult;

    var aliasResult = normalizeParserV54Aliases_(rawText, jsonResult.value, contextResult.context);
    if (!aliasResult.ok) return aliasResult;

    var validation = validateParserV54OpenAICandidate_(aliasResult.candidate, deps);
    if (!validation.ok) {
        return {
            ok: false,
            parsedEntry: aliasResult.candidate,
            normalized: validation.normalized || null,
            errors: normalizeParserV54OpenAIErrors_(validation.errors, 'PARSER_V54_CONTRACT_REJECTED', 'parsedEntry', 'ParsedEntryV54 validation failed.'),
        };
    }

    return {
        ok: true,
        parsedEntry: validation.normalized,
        normalized: validation.normalized,
        errors: [],
    };
}

function normalizeParserV54OpenAIDeps_(runtimeContext, options) {
    var source = options || {};
    var config = typeof CONFIG === 'object' && CONFIG ? CONFIG : {};
    return {
        fetchJson: typeof source.fetchJson === 'function' ? source.fetchJson : null,
        urlFetch: source.urlFetch || null,
        getParserContext: typeof source.getParserContext === 'function' ? source.getParserContext : null,
        validateParsedEntryV54: typeof source.validateParsedEntryV54 === 'function' ? source.validateParsedEntryV54 : (
            typeof validateParsedEntryV54ForActions_ === 'function' ? validateParsedEntryV54ForActions_ : null
        ),
        model: String(source.model || config.MODEL || V54_OPENAI_DEFAULT_MODEL),
        apiKey: source.apiKey || config.OPENAI_API_KEY || '',
        now: typeof source.now === 'function' ? source.now : function() {
            return new Date().toISOString();
        },
        endpoint: source.endpoint || V54_OPENAI_CHAT_COMPLETIONS_URL,
    };
}

function getParserV54OpenAIContext_(runtimeContext, deps) {
    var context = runtimeContext || {};
    if (deps.getParserContext) {
        try {
            context = deps.getParserContext(runtimeContext || {}) || {};
        } catch (error) {
            return makeParserV54OpenAIFailure_('PARSER_V54_CONTEXT_FAILED', 'getParserContext', 'ParserV54 context lookup failed safely.');
        }
        if (context && context.ok === false) {
            return {
                ok: false,
                parsedEntry: null,
                normalized: null,
                errors: normalizeParserV54OpenAIErrors_(context.errors, 'PARSER_V54_CONTEXT_FAILED', 'getParserContext', 'ParserV54 context lookup failed safely.'),
            };
        }
        if (context && context.ok === true && context.context && typeof context.context === 'object') {
            context = context.context;
        }
    }
    return { ok: true, context: normalizeParserV54OpenAIContext_(context, deps), errors: [] };
}

function normalizeParserV54OpenAIContext_(context, deps) {
    var source = context || {};
    return {
        categories: normalizeParserV54CanonicalRows_(source.categories, 'id_categoria'),
        fontes: normalizeParserV54CanonicalRows_(source.fontes, 'id_fonte'),
        cartoes: normalizeParserV54CanonicalRows_(source.cartoes, 'id_cartao'),
        defaultPessoa: safeParserV54PromptString_(source.defaultPessoa || source.pessoa || ''),
        defaultEscopo: safeParserV54PromptString_(source.defaultEscopo || source.escopo || ''),
        referenceDate: safeParserV54PromptString_(source.referenceDate || source.data_referencia || deps.now().slice(0, 10)),
    };
}

function normalizeParserV54CanonicalRows_(rows, idField) {
    if (!Array.isArray(rows)) return [];
    return rows.map(function(row) {
        if (typeof row === 'string') return safeParserV54PromptString_(row);
        var copy = {};
        Object.keys(row || {}).forEach(function(key) {
            if (key.toLowerCase().indexOf('token') !== -1
                || key.toLowerCase().indexOf('secret') !== -1
                || key.toLowerCase().indexOf('api') !== -1
                || key.toLowerCase().indexOf('spreadsheet') !== -1) {
                return;
            }
            if (['string', 'number', 'boolean'].indexOf(typeof row[key]) !== -1) {
                copy[key] = safeParserV54PromptString_(row[key]);
            }
        });
        if (!copy[idField]) return null;
        return copy;
    }).filter(function(row) { return row; });
}

function buildParserV54OpenAISystemPrompt_(context) {
    var canonical = normalizeParserV54OpenAIContext_(context || {}, { now: function() { return ''; } });
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
        '- Unknown or ambiguous messages must use warnings and low confidence instead of guessing IDs not listed below.',
        '',
        'Allowed tipo_evento: ' + V54_OPENAI_ALLOWED_TIPO_EVENTO.join(', '),
        'Allowed pessoa: ' + V54_OPENAI_ALLOWED_PESSOA.join(', '),
        'Allowed escopo: ' + V54_OPENAI_ALLOWED_ESCOPO.join(', '),
        'Allowed visibilidade: ' + V54_OPENAI_ALLOWED_VISIBILIDADE.join(', '),
        '',
        'Canonical categories:',
        formatParserV54CanonicalRows_(canonical.categories, 'id_categoria'),
        '',
        'Canonical fontes:',
        formatParserV54CanonicalRows_(canonical.fontes, 'id_fonte'),
        '',
        'Canonical cartoes:',
        formatParserV54CanonicalRows_(canonical.cartoes, 'id_cartao'),
        '',
        'Required ParsedEntryV54 fields:',
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

function buildParserV54OpenAIUserPrompt_(rawText, context, deps) {
    var canonical = normalizeParserV54OpenAIContext_(context || {}, deps);
    return [
        'Parse this Portuguese financial message into one ParsedEntryV54 JSON object.',
        'Raw message: ' + JSON.stringify(safeParserV54PromptString_(rawText || '')),
        'Default pessoa: ' + canonical.defaultPessoa,
        'Default escopo: ' + canonical.defaultEscopo,
        'Reference date: ' + canonical.referenceDate,
        'Return JSON only.',
    ].join('\n');
}

function buildParserV54OpenAIRequestBody_(systemPrompt, userPrompt, deps) {
    return {
        model: deps.model,
        reasoning_effort: 'low',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
    };
}

function callParserV54OpenAI_(requestBody, deps) {
    var request = {
        url: deps.endpoint,
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + deps.apiKey },
        payload: JSON.stringify(requestBody),
        muteHttpExceptions: true,
        body: requestBody,
    };

    if (deps.fetchJson) return deps.fetchJson(request);

    var fetcher = deps.urlFetch || (typeof UrlFetchApp !== 'undefined' ? UrlFetchApp : null);
    if (!fetcher || typeof fetcher.fetch !== 'function') {
        throw new Error('ParserV54 fetch dependency missing.');
    }
    var response = fetcher.fetch(deps.endpoint, {
        method: 'post',
        contentType: 'application/json',
        headers: request.headers,
        payload: request.payload,
        muteHttpExceptions: true,
    });
    var code = typeof response.getResponseCode === 'function' ? response.getResponseCode() : 0;
    var text = typeof response.getContentText === 'function' ? response.getContentText() : '';
    if (code < 200 || code >= 300) throw new Error('OpenAI request failed.');
    return JSON.parse(text);
}

function extractParserV54OpenAIContent_(response) {
    if (!response || typeof response !== 'object') {
        return makeParserV54OpenAIFailure_('PARSER_V54_INVALID_RESPONSE', 'response', 'ParserV54 OpenAI response was invalid.');
    }
    var choice = response.choices && response.choices[0] ? response.choices[0] : null;
    var content = choice && choice.message ? choice.message.content : null;
    if (typeof content !== 'string' || !content.trim()) {
        return makeParserV54OpenAIFailure_('PARSER_V54_EMPTY_RESPONSE', 'response', 'ParserV54 OpenAI response content was empty.');
    }
    return { ok: true, content: content, errors: [] };
}

function parseParserV54OpenAIJsonResponse_(rawResponse) {
    var text = String(rawResponse || '').trim();
    if (!text) return makeParserV54OpenAIFailure_('EMPTY_RESPONSE', 'response', 'ParserV54 response is empty.');
    var jsonText = extractParserV54JsonText_(text);
    try {
        var value = JSON.parse(jsonText);
        if (Array.isArray(value)) {
            return makeParserV54OpenAIFailure_('ARRAY_RESPONSE', 'response', 'ParserV54 must return one object, not an array.', value);
        }
        if (!value || typeof value !== 'object') {
            return makeParserV54OpenAIFailure_('NON_OBJECT_RESPONSE', 'response', 'ParserV54 must return one object.', value);
        }
        return { ok: true, value: value, errors: [] };
    } catch (error) {
        return makeParserV54OpenAIFailure_('INVALID_JSON', 'response', 'ParserV54 returned invalid JSON.');
    }
}

function extractParserV54JsonText_(text) {
    var fence = String(text || '').match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fence ? fence[1].trim() : String(text || '').trim();
}

function validateParserV54OpenAICandidate_(candidate, deps) {
    if (typeof deps.validateParsedEntryV54 !== 'function') {
        return makeParserV54OpenAIFailure_('PARSER_V54_VALIDATOR_REQUIRED', 'validateParsedEntryV54', 'ParserV54 requires a ParsedEntryV54 validator.');
    }
    return deps.validateParsedEntryV54(candidate);
}

function normalizeParserV54Aliases_(rawText, candidate, canonicalContext) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        return { ok: true, candidate: candidate, errors: [] };
    }

    var normalizedText = normalizeParserV54AliasText_(rawText);
    var context = canonicalContext || {};
    var fonteMatches = findParserV54AliasMatches_(normalizedText, [
        { id: 'FONTE_CONTA_GU', aliases: ['conta gustavo', 'conta gu'] },
        { id: 'FONTE_CONTA_LU', aliases: ['conta luana', 'conta lu'] },
    ], context.fontes, 'id_fonte');
    if (!fonteMatches.ok) return makeParserV54AliasFailure_(fonteMatches.code, fonteMatches.field, fonteMatches.message, candidate);

    var cardMatches = findParserV54AliasMatches_(normalizedText, [
        { id: 'CARD_NUBANK_GU', aliases: ['nubank gustavo', 'nubank gu'] },
        { id: 'CARD_MP_GU', aliases: ['mercado pago gustavo', 'mercado pago gu', 'mp gustavo', 'mp gu'] },
        { id: 'CARD_NUBANK_LU', aliases: ['nubank luana', 'nubank lu'] },
    ], context.cartoes, 'id_cartao');
    if (!cardMatches.ok) return makeParserV54AliasFailure_(cardMatches.code, cardMatches.field, cardMatches.message, candidate);

    var categoryMatches = findParserV54AliasMatches_(normalizedText, [
        { id: 'REC_SALARIO', aliases: ['salario'] },
        { id: 'OPEX_MERCADO_SEMANA', aliases: ['mercado semana'] },
        { id: 'OPEX_MERCADO_RANCHO', aliases: ['mercado rancho'] },
    ], context.categories, 'id_categoria');
    if (!categoryMatches.ok) return makeParserV54AliasFailure_(categoryMatches.code, categoryMatches.field, categoryMatches.message, candidate);

    if (fonteMatches.ids.length === 1 && cardMatches.ids.length === 1) {
        return makeParserV54AliasFailure_(
            'PARSER_V54_ALIAS_AMBIGUOUS_PAYMENT',
            'payment_alias',
            'ParserV54 found both source and card aliases in the same message.',
            candidate
        );
    }

    var normalized = cloneParserV54PlainObject_(candidate);
    if (!normalized.raw_text) normalized.raw_text = String(rawText || '');

    if (!normalized.id_categoria && categoryMatches.ids.length === 1) {
        if (categoryMatches.ids[0] !== 'REC_SALARIO' || normalized.tipo_evento === 'receita') {
            normalized.id_categoria = categoryMatches.ids[0];
        }
    }

    if (!normalized.id_fonte && fonteMatches.ids.length === 1) {
        normalized.id_fonte = fonteMatches.ids[0];
    }

    if (cardMatches.ids.length === 1) {
        normalized.id_cartao = cardMatches.ids[0];
        if (normalized.tipo_evento === 'despesa') normalized.tipo_evento = 'compra_cartao';
        if (normalized.tipo_evento === 'compra_cartao' || normalized.tipo_evento === 'compra_parcelada') {
            delete normalized.id_fonte;
        }
    }

    return { ok: true, candidate: normalized, errors: [] };
}

function normalizeParserV54AliasText_(rawText) {
    var lower = String(rawText || '').toLowerCase();
    var withoutAccents = typeof lower.normalize === 'function'
        ? lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        : lower
            .replace(/[\u00e0\u00e1\u00e2\u00e3\u00e4]/g, 'a')
            .replace(/[\u00e8\u00e9\u00ea\u00eb]/g, 'e')
            .replace(/[\u00ec\u00ed\u00ee\u00ef]/g, 'i')
            .replace(/[\u00f2\u00f3\u00f4\u00f5\u00f6]/g, 'o')
            .replace(/[\u00f9\u00fa\u00fb\u00fc]/g, 'u')
            .replace(/\u00e7/g, 'c');
    return withoutAccents
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function findParserV54AliasMatches_(normalizedText, aliasGroups, canonicalRows, idField) {
    var available = {};
    (Array.isArray(canonicalRows) ? canonicalRows : []).forEach(function(row) {
        var id = row && row[idField] ? String(row[idField]).trim() : '';
        if (id) available[id] = true;
    });

    var ids = [];
    var seen = {};
    aliasGroups.forEach(function(group) {
        if (!available[group.id]) return;
        for (var i = 0; i < group.aliases.length; i++) {
            if (containsParserV54AliasPhrase_(normalizedText, group.aliases[i])) {
                if (!seen[group.id]) {
                    seen[group.id] = true;
                    ids.push(group.id);
                }
                return;
            }
        }
    });

    if (ids.length > 1) {
        return {
            ok: false,
            code: 'PARSER_V54_ALIAS_AMBIGUOUS',
            field: idField,
            message: 'ParserV54 found multiple safe aliases for ' + idField + '.',
            ids: ids,
        };
    }

    return { ok: true, ids: ids };
}

function containsParserV54AliasPhrase_(normalizedText, alias) {
    if (!normalizedText) return false;
    var phrase = normalizeParserV54AliasText_(alias);
    if (!phrase) return false;
    return (' ' + normalizedText + ' ').indexOf(' ' + phrase + ' ') !== -1;
}

function makeParserV54AliasFailure_(code, field, message, parsedEntry) {
    return {
        ok: false,
        parsedEntry: cloneParserV54PlainObject_(parsedEntry),
        normalized: null,
        errors: [makeParserV54OpenAIError_(code, field, message)],
    };
}

function cloneParserV54PlainObject_(input) {
    if (!input || typeof input !== 'object') return input;
    return JSON.parse(JSON.stringify(input));
}

function formatParserV54CanonicalRows_(rows, idField) {
    if (!Array.isArray(rows) || rows.length === 0) return '- none provided';
    return rows.map(function(row) {
        if (typeof row === 'string') return '- ' + safeParserV54PromptString_(row);
        var id = safeParserV54PromptString_(row && row[idField] ? row[idField] : '');
        var name = row && row.nome ? ' (' + safeParserV54PromptString_(row.nome) + ')' : '';
        var details = Object.keys(row || {})
            .filter(function(key) { return key !== idField && key !== 'nome'; })
            .map(function(key) { return key + '=' + safeParserV54PromptString_(row[key]); })
            .join(', ');
        return '- ' + id + name + (details ? ': ' + details : '');
    }).join('\n');
}

function safeParserV54PromptString_(value) {
    return String(value === undefined || value === null ? '' : value)
        .replace(/sk-[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
        .replace(/\b\d{6,}:[A-Za-z0-9_-]{10,}\b/g, '[REDACTED]')
        .replace(/(api[_-]?key|token|secret|spreadsheet[_-]?id)\s*[:=]\s*[^,\s}\]]+/ig, '$1=[REDACTED]');
}

function makeParserV54OpenAIFailure_(code, field, message, parsedEntry) {
    return {
        ok: false,
        parsedEntry: parsedEntry || null,
        normalized: null,
        errors: [makeParserV54OpenAIError_(code, field, message)],
    };
}

function normalizeParserV54OpenAIErrors_(errors, fallbackCode, fallbackField, fallbackMessage) {
    var source = Array.isArray(errors) ? errors : [];
    var normalized = source
        .filter(function(error) { return error && typeof error === 'object'; })
        .map(function(error) {
            return makeParserV54OpenAIError_(
                error.code || fallbackCode,
                error.field || fallbackField,
                error.message || fallbackMessage
            );
        });
    if (normalized.length > 0) return normalized;
    return [makeParserV54OpenAIError_(fallbackCode, fallbackField, fallbackMessage)];
}

function makeParserV54OpenAIError_(code, field, message) {
    return {
        code: String(code || 'PARSER_V54_ERROR'),
        field: String(field || 'parser'),
        message: String(message || 'ParserV54 failed safely.'),
    };
}

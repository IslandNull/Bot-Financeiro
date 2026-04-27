'use strict';

const crypto = require('crypto');

const { V54_HEADERS, V54_SHEETS } = require('./v54-schema');

const IDEMPOTENCY_HEADERS = V54_HEADERS[V54_SHEETS.IDEMPOTENCY_LOG];
const IDEMPOTENCY_STATUSES = {
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
};

function makeError(code, field, message) {
    return { code, field, message };
}

function stableStringify(value) {
    if (value === null || value === undefined) return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function hashPayload(payload) {
    return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function normalizeText(value) {
    return String(value === undefined || value === null ? '' : value).trim();
}

function valueToKeyPart(value) {
    return normalizeText(value).replace(/\s+/g, '_');
}

function makeIdempotencyKey(input) {
    const source = valueToKeyPart(input.source || 'telegram');
    if (input.telegram_update_id !== undefined && input.telegram_update_id !== null && String(input.telegram_update_id) !== '') {
        return `${source}:telegram_update_id:${valueToKeyPart(input.telegram_update_id)}`;
    }
    if (input.chat_id && input.telegram_message_id) {
        return `${source}:message:${valueToKeyPart(input.chat_id)}:${valueToKeyPart(input.telegram_message_id)}`;
    }
    return `${source}:payload:${input.payload_hash}`;
}

function normalizeInput(input, options) {
    const source = input && typeof input === 'object' ? input : {};
    const payload = source.payload === undefined ? source : source.payload;
    const payloadHash = source.payload_hash || hashPayload(payload);
    const normalized = {
        source: normalizeText(source.source || 'telegram'),
        telegram_update_id: normalizeText(source.telegram_update_id),
        telegram_message_id: normalizeText(source.telegram_message_id),
        chat_id: normalizeText(source.chat_id),
        payload_hash: payloadHash,
        payload,
        result_ref: normalizeText(source.result_ref),
        error_code: normalizeText(source.error_code),
        observacao: normalizeText(source.observacao),
        semantic_fingerprint: normalizeText(source.semantic_fingerprint || makeSemanticFingerprint(source.semantic_entry)),
    };
    normalized.idempotency_key = normalizeText(source.idempotency_key) || makeIdempotencyKey(normalized);
    normalized.now = (options && typeof options.now === 'function') ? options.now() : new Date().toISOString();
    return normalized;
}

function makeSemanticFingerprint(entry) {
    if (!entry || typeof entry !== 'object') return '';
    const fields = ['data', 'valor', 'descricao', 'pessoa', 'id_fonte'];
    const parts = fields.map((field) => normalizeText(entry[field]).toLowerCase());
    if (parts.every((part) => !part)) return '';
    return hashPayload(parts);
}

function rowToObject(row) {
    if (!Array.isArray(row)) return row && typeof row === 'object' ? row : {};
    return IDEMPOTENCY_HEADERS.reduce((acc, header, index) => {
        acc[header] = row[index] === undefined || row[index] === null ? '' : row[index];
        return acc;
    }, {});
}

function findExistingByKey(existingRows, key) {
    return (existingRows || []).map(rowToObject).find((row) => normalizeText(row.idempotency_key) === key) || null;
}

function findPayloadMatches(existingRows, normalized) {
    return (existingRows || [])
        .map(rowToObject)
        .filter((row) => normalizeText(row.payload_hash) === normalized.payload_hash && normalizeText(row.idempotency_key) !== normalized.idempotency_key);
}

function findSemanticMatches(existingRows, normalized) {
    if (!normalized.semantic_fingerprint) return [];
    return (existingRows || [])
        .map(rowToObject)
        .filter((row) => normalizeText(row.semantic_fingerprint) === normalized.semantic_fingerprint && normalizeText(row.idempotency_key) !== normalized.idempotency_key);
}

function objectToValues(rowObject) {
    return IDEMPOTENCY_HEADERS.map((header) => rowObject[header] === undefined || rowObject[header] === null ? '' : rowObject[header]);
}

function makeInsertPlan(normalized, existingRows) {
    const warnings = [];
    const payloadMatches = findPayloadMatches(existingRows, normalized);
    const semanticMatches = findSemanticMatches(existingRows, normalized);

    if (payloadMatches.length > 0) {
        warnings.push(makeError(
            'SAME_PAYLOAD_DIFFERENT_IDEMPOTENCY_KEY',
            'payload_hash',
            'Same payload hash appeared with a different idempotency key; do not silently merge it.'
        ));
    }
    if (semanticMatches.length > 0) {
        warnings.push(makeError(
            'POSSIBLE_SEMANTIC_DUPLICATE',
            'semantic_fingerprint',
            'Potential semantic duplicate detected; future write path must warn or block explicitly.'
        ));
    }

    const rowObject = {
        idempotency_key: normalized.idempotency_key,
        source: normalized.source,
        telegram_update_id: normalized.telegram_update_id,
        telegram_message_id: normalized.telegram_message_id,
        chat_id: normalized.chat_id,
        payload_hash: normalized.payload_hash,
        status: IDEMPOTENCY_STATUSES.PROCESSING,
        result_ref: '',
        created_at: normalized.now,
        updated_at: normalized.now,
        error_code: '',
        observacao: normalized.observacao,
    };

    return {
        ok: true,
        decision: 'insert_processing',
        duplicate: false,
        retryable: false,
        shouldCreateFinancialEntry: true,
        idempotency_key: normalized.idempotency_key,
        payload_hash: normalized.payload_hash,
        warnings,
        plan: {
            action: 'INSERT_IDEMPOTENCY_LOG',
            sheet: V54_SHEETS.IDEMPOTENCY_LOG,
            headers: [...IDEMPOTENCY_HEADERS],
            rowObject,
            rowValues: objectToValues(rowObject),
        },
        existing: null,
        errors: [],
    };
}

function evaluateExisting(existing, normalized) {
    const status = normalizeText(existing.status);
    const base = {
        ok: false,
        duplicate: true,
        shouldCreateFinancialEntry: false,
        idempotency_key: normalized.idempotency_key,
        payload_hash: normalized.payload_hash,
        plan: null,
        existing,
        warnings: [],
    };

    if (status === IDEMPOTENCY_STATUSES.COMPLETED) {
        return Object.assign(base, {
            decision: 'duplicate_completed',
            retryable: false,
            result_ref: normalizeText(existing.result_ref),
            errors: [makeError('IDEMPOTENCY_COMPLETED_DUPLICATE', 'idempotency_key', 'Idempotency key already completed.')],
        });
    }

    if (status === IDEMPOTENCY_STATUSES.PROCESSING) {
        return Object.assign(base, {
            decision: 'duplicate_processing',
            retryable: true,
            result_ref: normalizeText(existing.result_ref),
            errors: [makeError('IDEMPOTENCY_PROCESSING_RETRY', 'idempotency_key', 'Idempotency key is already processing; retry later.')],
        });
    }

    return Object.assign(base, {
        decision: 'duplicate_failed',
        retryable: false,
        result_ref: normalizeText(existing.result_ref),
        errors: [makeError('IDEMPOTENCY_FAILED_REVIEW_REQUIRED', 'idempotency_key', 'Idempotency key previously failed; manual or explicit retry policy required.')],
    });
}

function planIdempotencyForUpdate(input, existingRows, options) {
    const normalized = normalizeInput(input, options);
    const existing = findExistingByKey(existingRows, normalized.idempotency_key);
    if (existing) return evaluateExisting(existing, normalized);
    return makeInsertPlan(normalized, existingRows || []);
}

module.exports = {
    IDEMPOTENCY_HEADERS,
    IDEMPOTENCY_STATUSES,
    hashPayload,
    makeIdempotencyKey,
    makeSemanticFingerprint,
    planIdempotencyForUpdate,
    stableStringify,
};

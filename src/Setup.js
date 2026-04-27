// ============================================================
// SETUP — funções de configuração e manutenção que rodam a partir do Editor
// (não chamadas pelo webhook). Inclui: webhook setup, setupV52 idempotente
// para preparar abas/fórmulas, force-fix das fórmulas e exportSpreadsheetState
// (deep scanner de raio-x da planilha).
// ============================================================

// ============================================================
// SETUP — rodar UMA VEZ após o deploy
// ============================================================

// Configure os segredos pelo Apps Script Editor:
// Project Settings → Script Properties → Add property
// Chaves necessárias:
//   OPENAI_API_KEY   → chave da OpenAI
//   TELEGRAM_TOKEN   → token do BotFather
//   SPREADSHEET_ID   → ID da planilha Google Sheets
//   WEBHOOK_SECRET   → segredo compartilhado entre Telegram/Val.town/Apps Script
//   AUTHORIZED       → JSON: {"CHAT_ID_GUSTAVO":{"nome":"Gustavo","pagador":"Gustavo"},"CHAT_ID_LUANA":{"nome":"Luana","pagador":"Luana"}}
// Chave opcional:
//   VALTOWN_WEBHOOK_URL → URL customizada do proxy Val.town, se mudar da padrao

function setWebhook() {
    _loadSecrets();
    const url = ScriptApp.getService().getUrl();
    if (!url) throw new Error('Deploy o script como Web App primeiro.');
    const webhookSecret = requireWebhookSecret_();
    const webhookUrl = addWebhookSecretParam_(url, webhookSecret);

    const result = UrlFetchApp.fetch(
        `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}&secret_token=${encodeURIComponent(webhookSecret)}`
    );
    console.log('Webhook response:', result.getContentText());
}

function requireWebhookSecret_() {
    if (!CONFIG.WEBHOOK_SECRET) {
        throw new Error('WEBHOOK_SECRET must be configured in Script Properties before setting the webhook.');
    }
    return CONFIG.WEBHOOK_SECRET;
}

function addWebhookSecretParam_(url, secret) {
    const separator = url.indexOf('?') === -1 ? '?' : '&';
    return `${url}${separator}webhook_secret=${encodeURIComponent(secret)}`;
}

function maskSecret_(value) {
    const text = String(value || '');
    if (!text) return '';
    if (text.length <= 8) return '***';
    return `${text.slice(0, 3)}***${text.slice(-3)}`;
}

function redactUrlSecret_(url) {
    return String(url || '').replace(/([?&](?:webhook_secret|telegram_secret)=)[^&]*/g, '$1REDACTED');
}

function countAuthorizedUsers_() {
    return Object.keys(CONFIG.AUTHORIZED || {}).length;
}

function diagnoseWebhookSecurity() {
    _loadSecrets();

    const serviceUrl = ScriptApp.getService().getUrl();
    const valTownBaseUrl = CONFIG.VALTOWN_WEBHOOK_URL || 'https://islandd.val.run/';
    const hasWebhookSecret = Boolean(CONFIG.WEBHOOK_SECRET);
    const appsScriptWebhookUrl = serviceUrl && hasWebhookSecret
        ? addWebhookSecretParam_(serviceUrl, CONFIG.WEBHOOK_SECRET)
        : '';
    const valTownWebhookUrl = hasWebhookSecret
        ? addWebhookSecretParam_(valTownBaseUrl, CONFIG.WEBHOOK_SECRET)
        : '';

    const report = {
        ok: Boolean(
            CONFIG.TELEGRAM_TOKEN &&
            CONFIG.SPREADSHEET_ID &&
            CONFIG.SYNC_SECRET &&
            hasWebhookSecret &&
            serviceUrl &&
            countAuthorizedUsers_() > 0
        ),
        checks: {
            telegramTokenConfigured: Boolean(CONFIG.TELEGRAM_TOKEN),
            spreadsheetIdConfigured: Boolean(CONFIG.SPREADSHEET_ID),
            syncSecretConfigured: Boolean(CONFIG.SYNC_SECRET),
            webhookSecretConfigured: hasWebhookSecret,
            authorizedUserCount: countAuthorizedUsers_(),
            webAppUrlAvailable: Boolean(serviceUrl),
            valTownWebhookUrlConfigured: Boolean(CONFIG.VALTOWN_WEBHOOK_URL),
        },
        previews: {
            webhookSecretPreview: maskSecret_(CONFIG.WEBHOOK_SECRET),
            appsScriptWebhookUrl: redactUrlSecret_(appsScriptWebhookUrl),
            valTownWebhookUrl: redactUrlSecret_(valTownWebhookUrl),
        },
        nextManualChecks: [
            'Run getTelegramWebhookInfo() and confirm the configured URL points to Val.town or the intended Web App.',
            'If needed, run apontarWebhookProValTown() to register the Val.town URL with Telegram secret_token.',
            'Send negative tests before real Telegram writes: no secret, invalid secret, valid secret with unauthorized chat.',
        ],
    };

    console.log(JSON.stringify(report, null, 2));
    return report;
}

function getTelegramWebhookInfo() {
    _loadSecrets();
    if (!CONFIG.TELEGRAM_TOKEN) {
        throw new Error('TELEGRAM_TOKEN must be configured in Script Properties before reading webhook info.');
    }

    const response = UrlFetchApp.fetch(
        `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/getWebhookInfo`,
        { muteHttpExceptions: true }
    );
    const payload = JSON.parse(response.getContentText());
    if (payload && payload.result && payload.result.url) {
        payload.result.url = redactUrlSecret_(payload.result.url);
    }

    console.log(JSON.stringify(payload, null, 2));
    return payload;
}

// ============================================================
// SETUP V54 - DRY-RUN ONLY
// ============================================================
function getV54Schema() {
    return {
        Config_Categorias: ['id_categoria', 'nome', 'grupo', 'tipo_movimento', 'classe_dre', 'escopo', 'comportamento_orcamento', 'afeta_acerto', 'afeta_dre', 'visibilidade_padrao', 'ativo'],
        Config_Fontes: ['id_fonte', 'nome', 'tipo', 'titular', 'ativo'],
        Rendas: ['id_renda', 'pessoa', 'tipo', 'valor', 'recorrente', 'dia_recebimento', 'uso_restrito', 'afeta_rateio', 'afeta_dre', 'obs'],
        Cartoes: ['id_cartao', 'id_fonte', 'nome', 'titular', 'fechamento_dia', 'vencimento_dia', 'limite', 'ativo'],
        Faturas: ['id_fatura', 'id_cartao', 'competencia', 'data_fechamento', 'data_vencimento', 'valor_previsto', 'valor_fechado', 'valor_pago', 'fonte_pagamento', 'status'],
        Pagamentos_Fatura: ['id_pagamento', 'id_fatura', 'data_pagamento', 'valor_pago', 'id_fonte', 'pessoa', 'escopo', 'afeta_dre', 'afeta_acerto', 'afeta_patrimonio', 'status', 'observacao', 'created_at'],
        Compras_Parceladas: ['id_compra', 'data_compra', 'id_cartao', 'descricao', 'id_categoria', 'valor_total', 'parcelas_total', 'responsavel', 'escopo', 'visibilidade', 'status'],
        Parcelas_Agenda: ['id_parcela', 'id_compra', 'numero_parcela', 'competencia', 'valor_parcela', 'id_fatura', 'status', 'id_lancamento'],
        Orcamento_Futuro_Casa: ['item', 'valor_previsto', 'data_inicio_prevista', 'ativo_no_dre'],
        Lancamentos_V54: ['id_lancamento', 'data', 'competencia', 'tipo_evento', 'id_categoria', 'valor', 'id_fonte', 'pessoa', 'escopo', 'id_cartao', 'id_fatura', 'id_compra', 'id_parcela', 'afeta_dre', 'afeta_acerto', 'afeta_patrimonio', 'visibilidade', 'descricao', 'created_at'],
        Patrimonio_Ativos: ['id_ativo', 'nome', 'tipo_ativo', 'instituicao', 'saldo_inicial', 'saldo_atual', 'data_referencia', 'destinacao', 'conta_reserva_emergencia', 'ativo'],
        Dividas: ['id_divida', 'nome', 'credor', 'tipo', 'pessoa', 'escopo', 'saldo_devedor', 'parcela_atual', 'parcelas_total', 'valor_parcela', 'taxa_juros', 'sistema_amortizacao', 'data_inicio', 'data_atualizacao', 'estrategia', 'status', 'observacao'],
        Acertos_Casal: ['competencia', 'pessoa', 'quota_esperada', 'valor_pago_casal', 'diferenca', 'status', 'observacao'],
        Fechamentos_Mensais: ['competencia', 'status', 'receitas_operacionais', 'despesas_operacionais', 'saldo_operacional', 'faturas_60d', 'parcelas_futuras', 'taxa_poupanca', 'reserva_total', 'patrimonio_liquido', 'acerto_status', 'decisao_1', 'decisao_2', 'decisao_3', 'created_at', 'closed_at'],
    };
}

function isBlankHeaderRow_(headers) {
    return (headers || []).every((header) => !String(header || '').trim());
}

function hasExistingDataRows_(sheetState) {
    if (!sheetState) return false;
    if (sheetState.hasDataRows === true) return true;
    if (Number(sheetState.dataRows || 0) > 0) return true;
    return Number(sheetState.lastRow || 0) > 1;
}

function planSetupV54ForState(state) {
    const schema = getV54Schema();
    const existing = state || {};
    const actions = [];

    Object.keys(schema).forEach((sheetName) => {
        const expectedHeaders = schema[sheetName];
        const sheetState = existing[sheetName];

        if (!sheetState) {
            actions.push({
                action: 'CREATE_SHEET',
                sheet: sheetName,
                headers: expectedHeaders,
            });
            return;
        }

        const currentHeaders = sheetState.headers || [];
        const comparableHeaders = currentHeaders.slice(0, expectedHeaders.length);
        const expectedWidthMatches = expectedHeaders.every((header, index) => header === comparableHeaders[index]);
        const lastColumn = Number(sheetState.lastColumn || currentHeaders.length || 0);
        const extraColumnCount = Math.max(lastColumn, currentHeaders.length) - expectedHeaders.length;
        const extraHeaders = currentHeaders
            .slice(expectedHeaders.length)
            .filter((header) => String(header || '').trim());
        const hasDataRows = hasExistingDataRows_(sheetState);

        if (extraColumnCount > 0 || extraHeaders.length > 0) {
            actions.push({
                action: 'BLOCKED_EXTRA_HEADERS',
                sheet: sheetName,
                currentHeaders,
                expectedHeaders,
                extraHeaders,
                extraColumnCount: Math.max(extraColumnCount, 0),
                lastColumn,
            });
            return;
        }

        if (expectedWidthMatches) {
            actions.push({
                action: 'OK',
                sheet: sheetName,
                headers: expectedHeaders,
            });
            return;
        }

        if (hasDataRows) {
            actions.push({
                action: 'BLOCKED_EXISTING_DATA',
                sheet: sheetName,
                currentHeaders,
                expectedHeaders,
            });
            return;
        }

        if (isBlankHeaderRow_(comparableHeaders)) {
            actions.push({
                action: 'INITIALIZE_HEADERS',
                sheet: sheetName,
                headers: expectedHeaders,
            });
            return;
        }

        actions.push({
            action: 'BLOCKED_HEADER_MISMATCH',
            sheet: sheetName,
            currentHeaders,
            expectedHeaders,
        });
    });

    const blockedActions = actions.filter((action) => action.action.indexOf('BLOCKED_') === 0);

    return {
        ok: blockedActions.length === 0,
        dryRun: true,
        actions,
        summary: {
            ok: actions.filter((action) => action.action === 'OK').length,
            createSheet: actions.filter((action) => action.action === 'CREATE_SHEET').length,
            initializeHeaders: actions.filter((action) => action.action === 'INITIALIZE_HEADERS').length,
            blocked: blockedActions.length,
        },
    };
}

function planSetupV54() {
    _loadSecrets();
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const schema = getV54Schema();
    const state = readV54SetupState_(ss, schema);

    const plan = planSetupV54ForState(state);
    console.log(JSON.stringify(plan, null, 2));
    return plan;
}

function readV54SetupState_(ss, schema) {
    const state = {};

    Object.keys(schema).forEach((sheetName) => {
        const sheet = ss.getSheetByName(sheetName);
        if (!sheet) return;
        const lastRow = sheet.getLastRow();
        const lastColumn = sheet.getLastColumn();
        const width = Math.max(schema[sheetName].length, lastColumn);
        state[sheetName] = {
            lastRow,
            lastColumn,
            headers: sheet.getRange(1, 1, 1, width).getValues()[0],
        };
    });

    return state;
}

function writeV54Headers_(sheet, headers) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
}

function applySetupV54() {
    return withScriptLock('applySetupV54', () => {
        _loadSecrets();
        const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
        const schema = getV54Schema();
        const state = readV54SetupState_(ss, schema);
        const plan = planSetupV54ForState(state);
        const blockedActions = plan.actions.filter((action) => action.action.indexOf('BLOCKED_') === 0);

        if (blockedActions.length > 0) {
            const blockedResult = {
                ok: false,
                dryRun: false,
                applied: false,
                actions: plan.actions,
                summary: plan.summary,
                blockedActions,
            };
            console.log(JSON.stringify(blockedResult, null, 2));
            return blockedResult;
        }

        const appliedActions = [];
        plan.actions.forEach((action) => {
            if (action.action === 'CREATE_SHEET') {
                const sheet = ss.insertSheet(action.sheet);
                writeV54Headers_(sheet, action.headers);
                appliedActions.push({ action: action.action, sheet: action.sheet });
                return;
            }

            if (action.action === 'INITIALIZE_HEADERS') {
                const sheet = ss.getSheetByName(action.sheet);
                if (!sheet) throw new Error(`V54 sheet disappeared before initialization: ${action.sheet}`);
                writeV54Headers_(sheet, action.headers);
                appliedActions.push({ action: action.action, sheet: action.sheet });
            }
        });

        const result = {
            ok: true,
            dryRun: false,
            applied: true,
            actions: plan.actions,
            summary: plan.summary,
            appliedActions,
        };
        console.log(JSON.stringify(result, null, 2));
        return result;
    });
}

// ============================================================
// SEED V54 - CLEAN START, DRY-RUN FIRST
// ============================================================
function getV54SeedData() {
    return {
        Config_Categorias: [
            { id_categoria: 'OPEX_MERCADO_RANCHO', nome: 'Mercado rancho', grupo: 'Casa', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'recorrente', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'detalhada', ativo: true },
            { id_categoria: 'OPEX_MERCADO_SEMANA', nome: 'Mercado semana', grupo: 'Casa', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'variavel', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'detalhada', ativo: true },
            { id_categoria: 'OPEX_DELIVERY_CASAL', nome: 'Delivery casal', grupo: 'Lazer', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'limite_semanal', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'detalhada', ativo: true },
            { id_categoria: 'OPEX_RESTAURANTE_CASAL', nome: 'Restaurante casal', grupo: 'Lazer', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'limite_mensal', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'detalhada', ativo: true },
            { id_categoria: 'OPEX_LUZ', nome: 'Luz', grupo: 'Casa futura', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'forecast', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'resumo', ativo: true },
            { id_categoria: 'OPEX_AGUA', nome: 'Agua', grupo: 'Casa futura', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'forecast', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'resumo', ativo: true },
            { id_categoria: 'OPEX_INTERNET', nome: 'Internet', grupo: 'Casa futura', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'forecast', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'resumo', ativo: true },
            { id_categoria: 'OPEX_CELULARES', nome: 'Celulares', grupo: 'Casa futura', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'forecast', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'resumo', ativo: true },
            { id_categoria: 'OPEX_CONDOMINIO', nome: 'Condominio', grupo: 'Casa futura', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'forecast', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'resumo', ativo: true },
            { id_categoria: 'OPEX_COMBUSTIVEL_MOTO', nome: 'Combustivel moto', grupo: 'Transporte', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Gustavo', comportamento_orcamento: 'recorrente', afeta_acerto: false, afeta_dre: true, visibilidade_padrao: 'detalhada', ativo: true },
            { id_categoria: 'OPEX_MANUTENCAO_MOTO', nome: 'Manutencao moto', grupo: 'Transporte', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Gustavo', comportamento_orcamento: 'provisao', afeta_acerto: false, afeta_dre: true, visibilidade_padrao: 'detalhada', ativo: true },
            { id_categoria: 'OPEX_ROUPAS', nome: 'Roupas', grupo: 'Pessoal', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'pessoal_proporcional', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'resumo', ativo: true },
            { id_categoria: 'OPEX_CUIDADO_PESSOAL', nome: 'Cuidado pessoal', grupo: 'Pessoal', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'pessoal_proporcional', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'resumo', ativo: true },
            { id_categoria: 'OPEX_SAUDE_COPARTICIPACAO', nome: 'Coparticipacao medica', grupo: 'Saude', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'pessoal_proporcional', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'resumo', ativo: true },
            { id_categoria: 'OPEX_LANCHES_TRABALHO', nome: 'Lanches trabalho', grupo: 'Pessoal', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'pessoal_proporcional', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'resumo', ativo: true },
            { id_categoria: 'OPEX_FARMACIA', nome: 'Farmacia', grupo: 'Saude', tipo_movimento: 'Despesa', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'variavel', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'resumo', ativo: true },
            { id_categoria: 'DEBT_FINANCIAMENTO_CAIXA', nome: 'Financiamento Caixa', grupo: 'Dividas', tipo_movimento: 'Despesa', classe_dre: 'Divida', escopo: 'Casal', comportamento_orcamento: 'obrigacao', afeta_acerto: true, afeta_dre: false, visibilidade_padrao: 'resumo', ativo: true },
            { id_categoria: 'DEBT_VASCO', nome: 'Vasco', grupo: 'Dividas', tipo_movimento: 'Despesa', classe_dre: 'Divida', escopo: 'Casal', comportamento_orcamento: 'obrigacao', afeta_acerto: true, afeta_dre: false, visibilidade_padrao: 'resumo', ativo: true },
            { id_categoria: 'INV_APORTE', nome: 'Aporte investimento', grupo: 'Patrimonio', tipo_movimento: 'Transferencia', classe_dre: 'Investimento', escopo: 'Casal', comportamento_orcamento: 'prioridade_pre_pessoal', afeta_acerto: true, afeta_dre: false, visibilidade_padrao: 'resumo', ativo: true },
            { id_categoria: 'RESERVA_EMERGENCIA', nome: 'Reserva emergencia', grupo: 'Patrimonio', tipo_movimento: 'Transferencia', classe_dre: 'Reserva', escopo: 'Casal', comportamento_orcamento: 'prioridade_pre_pessoal', afeta_acerto: true, afeta_dre: false, visibilidade_padrao: 'resumo', ativo: true },
            { id_categoria: 'REC_SALARIO', nome: 'Salario', grupo: 'Receitas', tipo_movimento: 'Receita', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'recorrente', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'resumo', ativo: true },
            { id_categoria: 'REC_BENEFICIO', nome: 'Beneficio VA/VR', grupo: 'Receitas', tipo_movimento: 'Receita', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'uso_restrito', afeta_acerto: false, afeta_dre: true, visibilidade_padrao: 'resumo', ativo: true },
            { id_categoria: 'REC_EVENTO', nome: 'Renda evento', grupo: 'Receitas', tipo_movimento: 'Receita', classe_dre: 'Operacional', escopo: 'Casal', comportamento_orcamento: 'evento_recomendacao', afeta_acerto: true, afeta_dre: true, visibilidade_padrao: 'resumo', ativo: true },
        ],
        Config_Fontes: [
            { id_fonte: 'FONTE_CONTA_GU', nome: 'Conta Gustavo', tipo: 'conta', titular: 'Gustavo', ativo: true },
            { id_fonte: 'FONTE_CONTA_LU', nome: 'Conta Luana', tipo: 'conta', titular: 'Luana', ativo: true },
            { id_fonte: 'FONTE_NUBANK_GU', nome: 'Nubank Gu', tipo: 'cartao', titular: 'Gustavo', ativo: true },
            { id_fonte: 'FONTE_MP_GU', nome: 'Mercado Pago Gu', tipo: 'cartao', titular: 'Gustavo', ativo: true },
            { id_fonte: 'FONTE_NUBANK_LU', nome: 'Nubank Lu', tipo: 'cartao', titular: 'Luana', ativo: true },
            { id_fonte: 'FONTE_ALELO_GU', nome: 'Alelo Gustavo', tipo: 'beneficio', titular: 'Gustavo', ativo: true },
            { id_fonte: 'FONTE_VA_LU', nome: 'VA Luana', tipo: 'beneficio', titular: 'Luana', ativo: true },
            { id_fonte: 'FONTE_MP_COFRE_CASA', nome: 'Mercado Pago Cofrinho Casa', tipo: 'investimento', titular: 'Casal', ativo: true },
            { id_fonte: 'FONTE_NUBANK_CAIXINHA_CASA', nome: 'Nubank Caixinha Casa', tipo: 'investimento', titular: 'Casal', ativo: true },
        ],
        Rendas: [
            { id_renda: 'REN_GU_SALARIO_LIQUIDO', pessoa: 'Gustavo', tipo: 'salario_liquido', valor: 3400, recorrente: true, dia_recebimento: 5, uso_restrito: false, afeta_rateio: true, afeta_dre: true, obs: 'Recebe no 5o dia do mes; se nao for util, dia util anterior.' },
            { id_renda: 'REN_LU_SALARIO_LIQUIDO', pessoa: 'Luana', tipo: 'salario_liquido', valor: 3500, recorrente: true, dia_recebimento: 5, uso_restrito: false, afeta_rateio: true, afeta_dre: true, obs: 'Recebe no 5o dia do mes.' },
            { id_renda: 'REN_GU_ALELO', pessoa: 'Gustavo', tipo: 'beneficio_va_vr', valor: 1500, recorrente: true, dia_recebimento: 5, uso_restrito: true, afeta_rateio: false, afeta_dre: true, obs: 'Alelo cambiavel pelo app; uso 100% casal, majoritariamente mercado.' },
            { id_renda: 'REN_LU_VA', pessoa: 'Luana', tipo: 'beneficio_va', valor: 300, recorrente: true, dia_recebimento: 5, uso_restrito: true, afeta_rateio: false, afeta_dre: true, obs: 'VA Luana; uso 100% casal.' },
            // REN_GU_AUX_COMBUSTIVEL removido: os R$ 1.200 ja estao inclusos nos R$ 3.400 do salario liquido.
        ],
        Cartoes: [
            { id_cartao: 'CARD_NUBANK_GU', id_fonte: 'FONTE_NUBANK_GU', nome: 'Nubank Gustavo', titular: 'Gustavo', fechamento_dia: 30, vencimento_dia: 7, limite: 10550, ativo: true },
            { id_cartao: 'CARD_MP_GU', id_fonte: 'FONTE_MP_GU', nome: 'Mercado Pago Gustavo', titular: 'Gustavo', fechamento_dia: 5, vencimento_dia: 10, limite: 10000, ativo: true },
            { id_cartao: 'CARD_NUBANK_LU', id_fonte: 'FONTE_NUBANK_LU', nome: 'Nubank Luana', titular: 'Luana', fechamento_dia: 1, vencimento_dia: 8, limite: 10000, ativo: true },
        ],
        Patrimonio_Ativos: [
            { id_ativo: 'ATIVO_MP_COFRINHO_CASA', nome: 'Mercado Pago Cofrinho Casa', tipo_ativo: 'cofrinho_cdi', instituicao: 'Mercado Pago', saldo_inicial: 11469, saldo_atual: 11469, data_referencia: '2026-04-26', destinacao: 'Itens da casa', conta_reserva_emergencia: false, ativo: true },
            { id_ativo: 'ATIVO_NUBANK_CAIXINHA_CASA', nome: 'Nubank Caixinha Casa', tipo_ativo: 'caixinha_cdi', instituicao: 'Nubank', saldo_inicial: 5166, saldo_atual: 5166, data_referencia: '2026-04-26', destinacao: 'Itens da casa', conta_reserva_emergencia: false, ativo: true },
        ],
        Dividas: [
            { id_divida: 'DIV_CAIXA_IMOVEL', nome: 'Financiamento Caixa Casa', credor: 'Caixa', tipo: 'financiamento_imobiliario', pessoa: 'Casal', escopo: 'Casal', saldo_devedor: 254156.57, parcela_atual: 1, parcelas_total: 419, valor_parcela: 1906.20, taxa_juros: '', sistema_amortizacao: '', data_inicio: '', data_atualizacao: '2026-04-26', estrategia: 'manter_e_revisar_amortizacao', status: 'ativa', observacao: '419 meses restantes informados em 2026-04-26; total original e taxa ainda nao confirmados.' },
            { id_divida: 'DIV_VASCO', nome: 'Vasco', credor: 'Vasco', tipo: 'financiamento_clube', pessoa: 'Casal', escopo: 'Casal', saldo_devedor: 55175.41, parcela_atual: 10, parcelas_total: 74, valor_parcela: 862.12, taxa_juros: '', sistema_amortizacao: '', data_inicio: '', data_atualizacao: '2026-04-26', estrategia: 'acompanhar_antes_de_amortizar', status: 'ativa', observacao: '9 de 74 parcelas pagas em 2026-04-26.' },
        ],
        Orcamento_Futuro_Casa: [
            { item: 'Luz', valor_previsto: 200, data_inicio_prevista: '2026-06-01', ativo_no_dre: false },
            { item: 'Agua', valor_previsto: 100, data_inicio_prevista: '2026-06-01', ativo_no_dre: false },
            { item: 'Internet', valor_previsto: 120, data_inicio_prevista: '2026-06-01', ativo_no_dre: false },
            { item: 'Celulares', valor_previsto: 80, data_inicio_prevista: '2026-06-01', ativo_no_dre: false },
            { item: 'Condominio', valor_previsto: 400, data_inicio_prevista: '2026-06-01', ativo_no_dre: false },
        ],
    };
}

function getV54SeedKeyFields_() {
    return {
        Config_Categorias: 'id_categoria',
        Config_Fontes: 'id_fonte',
        Rendas: 'id_renda',
        Cartoes: 'id_cartao',
        Patrimonio_Ativos: 'id_ativo',
        Dividas: 'id_divida',
        Orcamento_Futuro_Casa: 'item',
    };
}

function normalizeV54SeedValue_(value) {
    if (value === null || value === undefined) return '';
    if (Object.prototype.toString.call(value) === '[object Date]') {
        return Utilities.formatDate(value, CONFIG.TIMEZONE, 'yyyy-MM-dd');
    }
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'number') return String(Number(value));
    return String(value).trim();
}

function v54SeedRowsEqual_(headers, expectedRow, currentRow) {
    return headers.every((header) => normalizeV54SeedValue_(expectedRow[header]) === normalizeV54SeedValue_(currentRow[header]));
}

function v54SeedRowToValues_(headers, row) {
    return headers.map((header) => row[header] === undefined ? '' : row[header]);
}

function v54SeedValuesToRow_(headers, values) {
    return headers.reduce((acc, header, index) => {
        acc[header] = values[index];
        return acc;
    }, {});
}

function planSeedV54ForState(state) {
    const schema = getV54Schema();
    const seedData = getV54SeedData();
    const keyFields = getV54SeedKeyFields_();
    const existing = state || {};
    const actions = [];
    let unmanagedRows = 0;

    Object.keys(seedData).forEach((sheetName) => {
        const expectedHeaders = schema[sheetName];
        const sheetState = existing[sheetName];
        const seedRows = seedData[sheetName];
        const keyField = keyFields[sheetName];

        if (!expectedHeaders || !keyField) {
            actions.push({ action: 'BLOCKED_SEED_CONFLICT', sheet: sheetName, reason: 'Seed target is not part of the V54 schema.' });
            return;
        }

        if (!sheetState) {
            actions.push({ action: 'BLOCKED_MISSING_SHEET', sheet: sheetName, expectedHeaders });
            return;
        }

        const currentHeaders = sheetState.headers || [];
        const comparableHeaders = currentHeaders.slice(0, expectedHeaders.length);
        const headersMatch = expectedHeaders.every((header, index) => header === comparableHeaders[index]);
        const lastColumn = Number(sheetState.lastColumn || currentHeaders.length || 0);
        const extraHeaders = currentHeaders.slice(expectedHeaders.length).filter((header) => String(header || '').trim());

        if (lastColumn > expectedHeaders.length || extraHeaders.length > 0) {
            actions.push({ action: 'BLOCKED_EXTRA_HEADERS', sheet: sheetName, currentHeaders, expectedHeaders, extraHeaders, lastColumn });
            return;
        }

        if (!headersMatch) {
            actions.push({ action: 'BLOCKED_HEADER_MISMATCH', sheet: sheetName, currentHeaders, expectedHeaders });
            return;
        }

        const currentRows = sheetState.rows || [];
        const rowsByKey = {};
        currentRows.forEach((row) => {
            const key = normalizeV54SeedValue_(row[keyField]);
            if (!key) return;
            rowsByKey[key] = row;
        });

        seedRows.forEach((seedRow) => {
            const key = normalizeV54SeedValue_(seedRow[keyField]);
            const currentRow = rowsByKey[key];
            if (!currentRow) {
                actions.push({ action: 'INSERT_SEED_ROW', sheet: sheetName, keyField, key, row: seedRow });
                return;
            }

            if (v54SeedRowsEqual_(expectedHeaders, seedRow, currentRow)) {
                actions.push({ action: 'OK', sheet: sheetName, keyField, key });
                return;
            }

            actions.push({
                action: 'BLOCKED_SEED_CONFLICT',
                sheet: sheetName,
                keyField,
                key,
                expectedRow: seedRow,
                currentRow,
            });
        });

        const seedKeys = seedRows.reduce((acc, row) => {
            acc[normalizeV54SeedValue_(row[keyField])] = true;
            return acc;
        }, {});
        unmanagedRows += currentRows.filter((row) => {
            const key = normalizeV54SeedValue_(row[keyField]);
            return key && !seedKeys[key];
        }).length;
    });

    const blockedActions = actions.filter((action) => action.action.indexOf('BLOCKED_') === 0);

    return {
        ok: blockedActions.length === 0,
        dryRun: true,
        actions,
        summary: {
            ok: actions.filter((action) => action.action === 'OK').length,
            insertSeedRow: actions.filter((action) => action.action === 'INSERT_SEED_ROW').length,
            blocked: blockedActions.length,
            unmanagedRows,
        },
    };
}

function readV54SeedState_(ss, schema, seedData) {
    const state = {};

    Object.keys(seedData).forEach((sheetName) => {
        const sheet = ss.getSheetByName(sheetName);
        if (!sheet) return;

        const expectedHeaders = schema[sheetName];
        const lastRow = sheet.getLastRow();
        const lastColumn = sheet.getLastColumn();
        const width = Math.max(expectedHeaders.length, lastColumn);
        const headers = sheet.getRange(1, 1, 1, width).getValues()[0];
        const dataRowCount = Math.max(lastRow - 1, 0);
        const rows = dataRowCount > 0
            ? sheet.getRange(2, 1, dataRowCount, expectedHeaders.length).getValues().map((values) => v54SeedValuesToRow_(expectedHeaders, values))
            : [];

        state[sheetName] = { lastRow, lastColumn, headers, rows };
    });

    return state;
}

function planSeedV54() {
    _loadSecrets();
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const schema = getV54Schema();
    const seedData = getV54SeedData();
    const state = readV54SeedState_(ss, schema, seedData);
    const plan = planSeedV54ForState(state);
    console.log(JSON.stringify(plan, null, 2));
    return plan;
}

function applySeedV54() {
    return withScriptLock('applySeedV54', () => {
        _loadSecrets();
        const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
        const schema = getV54Schema();
        const seedData = getV54SeedData();
        const state = readV54SeedState_(ss, schema, seedData);
        const plan = planSeedV54ForState(state);
        const blockedActions = plan.actions.filter((action) => action.action.indexOf('BLOCKED_') === 0);

        if (blockedActions.length > 0) {
            const blockedResult = {
                ok: false,
                dryRun: false,
                applied: false,
                actions: plan.actions,
                summary: plan.summary,
                blockedActions,
            };
            console.log(JSON.stringify(blockedResult, null, 2));
            return blockedResult;
        }

        const rowsBySheet = {};
        plan.actions
            .filter((action) => action.action === 'INSERT_SEED_ROW')
            .forEach((action) => {
                if (!rowsBySheet[action.sheet]) rowsBySheet[action.sheet] = [];
                rowsBySheet[action.sheet].push(action.row);
            });

        const appliedActions = [];
        Object.keys(rowsBySheet).forEach((sheetName) => {
            const sheet = ss.getSheetByName(sheetName);
            if (!sheet) throw new Error(`V54 seed sheet disappeared before apply: ${sheetName}`);
            const headers = schema[sheetName];
            const rows = rowsBySheet[sheetName].map((row) => v54SeedRowToValues_(headers, row));
            const startRow = sheet.getLastRow() + 1;
            sheet.getRange(startRow, 1, rows.length, headers.length).setValues(rows);
            appliedActions.push({ action: 'INSERT_SEED_ROWS', sheet: sheetName, rows: rows.length });
        });

        const result = {
            ok: true,
            dryRun: false,
            applied: true,
            actions: plan.actions,
            summary: plan.summary,
            appliedActions,
        };
        console.log(JSON.stringify(result, null, 2));
        return result;
    });
}

function deleteWebhook() {
    _loadSecrets();
    UrlFetchApp.fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/deleteWebhook`);
}

// ⚠️ Use ESTA função — aponta pro proxy Val.town (resolve bug do 302 do Apps Script)
function apontarWebhookProValTown() {
    _loadSecrets();
    const webhookSecret = requireWebhookSecret_();
    const urlValTown = CONFIG.VALTOWN_WEBHOOK_URL || 'https://islandd.val.run/';
    const webhookUrl = addWebhookSecretParam_(urlValTown, webhookSecret);
    const result = UrlFetchApp.fetch(
        `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}&secret_token=${encodeURIComponent(webhookSecret)}&drop_pending_updates=true`
    );
    console.log('Webhook apontado para Val.town:', result.getContentText());
}

/**
 * Helper oficial para injeção de fórmulas no projeto
 */
function setFormula(range, formula) {
    range.setFormula(formula);
}

// ============================================================
// DEEP SCANNER — Visão Total da Planilha para as IAs
// ============================================================
function exportSpreadsheetState() {
    _loadSecrets();
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheets = ss.getSheets();
    const today = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    const report = [`# Spreadsheet State\n\nGenerated at: ${today}\n`];

    sheets.forEach(sheet => {
        const name = sheet.getName();
        report.push(`## Sheet: ${name}\n`);

        const lastRow = sheet.getLastRow();
        const lastCol = sheet.getLastColumn();

        if (lastRow === 0 || lastCol === 0) {
            report.push('*(Empty sheet)*\n');
            return;
        }

        // 1. Headers (Row 1)
        const headersRange = sheet.getRange(1, 1, 1, lastCol);
        const headers = headersRange.getValues()[0].map(v => v === '' ? '(empty)' : v);
        report.push('**Headers:**');
        report.push('- ' + headers.join(' | ') + '\n');

        // 2. Used ranges overview
        report.push(`**Size:** ${lastCol} columns x ${lastRow} rows\n`);

        // 2.1. Structural rows only. Avoid dumping transaction rows with real values.
        const structuralRanges = [];
        if (name === CONFIG.SHEETS.lancamentos) structuralRanges.push('A5:H5');
        if (name === CONFIG.SHEETS.config) structuralRanges.push('A11:L20');
        if (name === CONFIG.SHEETS.investimentos) structuralRanges.push('A3:F3');
        if (name === CONFIG.SHEETS.parcelas) structuralRanges.push('A3:H3');

        if (structuralRanges.length > 0) {
            report.push('**Structural Rows:**');
            structuralRanges.forEach(a1 => {
                const range = sheet.getRange(a1);
                const values = range.getDisplayValues();
                values.forEach((row, idx) => {
                    const nonEmpty = row.some(v => v !== '');
                    if (!nonEmpty) return;
                    const rowNumber = range.getRow() + idx;
                    report.push(`- \`${a1}\` row ${rowNumber}: ${row.map(v => v === '' ? '(empty)' : v).join(' | ')}`);
                });
            });
            report.push('\n');
        }

        // 3. Formula Map (Apenas para abas analíticas)
        if (['Dashboard', 'Investimentos', 'Config'].includes(name)) {
            report.push('**Important Formulas:**');
            const fullRange = sheet.getRange(1, 1, lastRow, lastCol);
            const formulas = fullRange.getFormulas();
            const displayValues = fullRange.getDisplayValues();

            let formulasEncontradas = 0;
            // Limit to a few examples of formulas to avoid huge dumps, or distinct formulas per column
            const seenFormulas = new Set();
            for (let r = 0; r < formulas.length; r++) {
                for (let c = 0; c < formulas[r].length; c++) {
                    const f = formulas[r][c];
                    if (f) {
                        // Para não repetir a mesma fórmula 100 vezes nas linhas para baixo:
                        const pattern = f.replace(/\d+/g, 'N');
                        if (!seenFormulas.has(pattern)) {
                            seenFormulas.add(pattern);
                            formulasEncontradas++;
                            const cellRef = sheet.getRange(r + 1, c + 1).getA1Notation();
                            const val = displayValues[r][c];
                            const status = (val.includes('#ERROR!') || val.includes('#NAME?') || val.includes('#REF!') || val.includes('#N/A')) ? '❌ ERRO' : '✅ OK';
                            report.push(`- \`${cellRef}\` (${status}): \`${f}\``);
                        }
                    }
                }
            }
            if (formulasEncontradas === 0) report.push('- *(No formulas found)*');
            report.push('\n');
        }
    });

    const fullText = report.join('\n');
    const chunks = fullText.match(/[\s\S]{1,8000}/g) || [];
    chunks.forEach((chunk, i) => {
        console.log(`\n--- PARTE ${i + 1}/${chunks.length} ---\n${chunk}`);
    });
    
    return fullText;
}

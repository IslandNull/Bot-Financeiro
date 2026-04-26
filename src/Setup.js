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
//   AUTHORIZED       → JSON: {"CHAT_ID_GUSTAVO":{"nome":"Gustavo","pagador":"Gustavo"},"CHAT_ID_LUANA":{"nome":"Luana","pagador":"Luana"}}

function setWebhook() {
    _loadSecrets();
    const url = ScriptApp.getService().getUrl();
    if (!url) throw new Error('Deploy o script como Web App primeiro.');

    const result = UrlFetchApp.fetch(
        `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/setWebhook?url=${encodeURIComponent(url)}`
    );
    console.log('Webhook response:', result.getContentText());
}

// ============================================================
// SETUP V54 - DRY-RUN ONLY
// ============================================================
function getV54Schema() {
    return {
        Config_Categorias: ['id_categoria', 'nome', 'grupo', 'tipo_movimento', 'classe_dre', 'escopo', 'comportamento_orcamento', 'afeta_acerto', 'afeta_dre', 'ativo'],
        Config_Fontes: ['id_fonte', 'nome', 'tipo', 'titular', 'ativo'],
        Rendas: ['id_renda', 'pessoa', 'tipo', 'valor', 'recorrente', 'dia_recebimento', 'uso_restrito', 'afeta_rateio', 'afeta_dre', 'obs'],
        Cartoes: ['id_cartao', 'id_fonte', 'nome', 'titular', 'fechamento_dia', 'vencimento_dia', 'limite', 'ativo'],
        Faturas: ['id_fatura', 'id_cartao', 'competencia', 'data_fechamento', 'data_vencimento', 'valor_previsto', 'valor_fechado', 'valor_pago', 'fonte_pagamento', 'status'],
        Compras_Parceladas: ['id_compra', 'data_compra', 'id_cartao', 'descricao', 'id_categoria', 'valor_total', 'parcelas_total', 'responsavel', 'escopo', 'status'],
        Parcelas_Agenda: ['id_parcela', 'id_compra', 'numero_parcela', 'competencia', 'valor_parcela', 'id_fatura', 'status', 'id_lancamento'],
        Orcamento_Futuro_Casa: ['item', 'valor_previsto', 'data_inicio_prevista', 'ativo_no_dre'],
        Lancamentos_V54: ['id_lancamento', 'data', 'competencia', 'tipo_evento', 'id_categoria', 'valor', 'id_fonte', 'pessoa', 'escopo', 'id_cartao', 'id_fatura', 'id_compra', 'id_parcela', 'afeta_dre', 'afeta_acerto', 'descricao', 'created_at'],
        Patrimonio_Ativos: ['id_ativo', 'nome', 'tipo_ativo', 'instituicao', 'saldo_inicial', 'saldo_atual', 'data_referencia', 'destinacao', 'conta_reserva_emergencia', 'ativo'],
        Acertos_Casal: ['competencia', 'pessoa', 'quota_esperada', 'valor_pago_casal', 'diferenca', 'status', 'observacao'],
    };
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
        const matches = expectedHeaders.length === currentHeaders.length
            && expectedHeaders.every((header, index) => header === currentHeaders[index]);

        if (!matches) {
            actions.push({
                action: 'UPDATE_HEADERS',
                sheet: sheetName,
                currentHeaders,
                expectedHeaders,
            });
        }
    });

    return {
        ok: actions.length === 0,
        dryRun: true,
        actions,
    };
}

function planSetupV54() {
    _loadSecrets();
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const schema = getV54Schema();
    const state = {};

    Object.keys(schema).forEach((sheetName) => {
        const sheet = ss.getSheetByName(sheetName);
        if (!sheet) return;
        const width = schema[sheetName].length;
        state[sheetName] = {
            headers: sheet.getRange(1, 1, 1, width).getValues()[0],
        };
    });

    const plan = planSetupV54ForState(state);
    console.log(JSON.stringify(plan, null, 2));
    return plan;
}

function deleteWebhook() {
    _loadSecrets();
    UrlFetchApp.fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/deleteWebhook`);
}

// ⚠️ Use ESTA função — aponta pro proxy Val.town (resolve bug do 302 do Apps Script)
function apontarWebhookProValTown() {
    _loadSecrets();
    const urlValTown = 'https://islandd.val.run/';
    const result = UrlFetchApp.fetch(
        `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/setWebhook?url=${encodeURIComponent(urlValTown)}&drop_pending_updates=true`
    );
    console.log('Webhook apontado para Val.town:', result.getContentText());
}

// ============================================================
// SETUP V5.2 — rodar UMA VEZ para configurar a planilha
// Executa Tasks 1-5 do plano: Config, Lançamentos col H,
// abas Investimentos e Parcelas, e blocos do Dashboard.
// Idempotente: seguro de rodar novamente se algo falhar.
// ============================================================
function setupV52() {
    _loadSecrets();
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const log = [];

    // ── TASK 1: Aba Config ────────────────────────────────────
    const cfg = ss.getSheetByName('Config');

    // A13 = Transferência (3º tipo além de Despesa e Receita)
    if (cfg.getRange('A13').getValue() !== 'Transferência') {
        cfg.getRange('A13').setValue('Transferência');
        log.push('✅ Config A13 = Transferência');
    } else { log.push('⏭ Config A13 ok'); }

    // B7/C7: data início do sistema (base do envelope budgeting)
    if (!cfg.getRange('B7').getValue()) {
        cfg.getRange('B7').setValue('Data início sistema');
        cfg.getRange('C7').setValue(new Date(2026, 3, 1));
        cfg.getRange('C7').setNumberFormat('dd/mm/yyyy');
        log.push('✅ Config B7/C7 = Data início 01/04/2026');
    } else { log.push('⏭ Config B7/C7 ok'); }

    // B8/C8 e B9/C9: placeholders para dias de fechamento dos cartões
    if (!cfg.getRange('B8').getValue()) {
        cfg.getRange('B8').setValue('⚠️ Fechamento Nubank Gu');
        cfg.getRange('C8').setValue('⚠️ CONFIGURAR');
        log.push('✅ Config B8/C8 = placeholder Nubank Gu');
    }
    if (!cfg.getRange('B9').getValue()) {
        cfg.getRange('B9').setValue('⚠️ Fechamento Nubank Lu');
        cfg.getRange('C9').setValue('⚠️ CONFIGURAR');
        log.push('✅ Config B9/C9 = placeholder Nubank Lu');
    }

    // Fontes: renomear + adicionar novas (C11:C35)
    const fontesRange = cfg.getRange('C11:C35');
    const fontesVals = fontesRange.getValues();
    let fontesChanged = false;
    const renames = { 'Cartão Gustavo': 'Nubank Gu', 'Cartão Luana': 'Nubank Lu' };
    const toAdd = ['Mercado Pago Gu', 'CDB 115% CDI', 'Saldo Inicial'];

    for (let i = 0; i < fontesVals.length; i++) {
        const v = fontesVals[i][0];
        if (renames[v]) {
            log.push(`✅ Config: "${v}" → "${renames[v]}"`);
            fontesVals[i][0] = renames[v];
            fontesChanged = true;
        }
    }
    const existingFontes = fontesVals.flat().filter(String);
    let nextEmpty = fontesVals.findIndex(r => !r[0]);
    if (nextEmpty === -1) nextEmpty = fontesVals.length;
    for (const f of toAdd) {
        if (!existingFontes.includes(f)) {
            fontesVals[nextEmpty++][0] = f;
            log.push(`✅ Config: fonte "${f}" adicionada`);
            fontesChanged = true;
        } else { log.push(`⏭ Config: fonte "${f}" já existe`); }
    }
    if (fontesChanged) fontesRange.setValues(fontesVals);

    // Categorias despesa (E11:E60): adicionar "CDB 115% CDI"
    const catDR = cfg.getRange('E11:E60');
    const catDV = catDR.getValues();
    if (!catDV.flat().includes('CDB 115% CDI')) {
        const idx = catDV.findIndex(r => !r[0]);
        if (idx !== -1) { catDV[idx][0] = 'CDB 115% CDI'; catDR.setValues(catDV); }
        log.push('✅ Config: categoria despesa "CDB 115% CDI" adicionada');
    } else { log.push('⏭ Config: "CDB 115% CDI" já existe'); }

    // Categorias receita (I11:I20): adicionar "Rendimento CDB"
    const catRR = cfg.getRange('I11:I20');
    const catRV = catRR.getValues();
    if (!catRV.flat().includes('Rendimento CDB')) {
        const idx = catRV.findIndex(r => !r[0]);
        if (idx !== -1) { catRV[idx][0] = 'Rendimento CDB'; catRR.setValues(catRV); }
        log.push('✅ Config: categoria receita "Rendimento CDB" adicionada');
    } else { log.push('⏭ Config: "Rendimento CDB" já existe'); }

    // ── TASK 2: Lançamentos coluna H (Competência) ────────────
    const lanc = ss.getSheetByName('Lançamentos');
    if (lanc.getRange('H5').getValue() !== 'Competência') {
        lanc.getRange('H5').setValue('Competência');
        lanc.getRange('H5').setFontWeight('bold');
        log.push('✅ Lançamentos H5 = Competência');
    } else { log.push('⏭ Lançamentos H5 ok'); }

    const lastLancRow = lanc.getLastRow();
    if (lastLancRow >= 6) {
        const nRows = lastLancRow - 5;
        lanc.getRange(6, 8, nRows, 1).setNumberFormat('dd/mm/yyyy');
        const aVals = lanc.getRange(6, 1, nRows, 1).getValues();
        const hVals = lanc.getRange(6, 8, nRows, 1).getValues();
        let fills = 0;
        for (let i = 0; i < hVals.length; i++) {
            if (!hVals[i][0] && aVals[i][0]) { hVals[i][0] = aVals[i][0]; fills++; }
        }
        if (fills > 0) {
            lanc.getRange(6, 8, nRows, 1).setValues(hVals);
            log.push(`✅ Lançamentos: ${fills} linhas de Competência preenchidas`);
        } else { log.push('⏭ Lançamentos: Competência já preenchida'); }
    }

    // ── TASK 3: Aba Investimentos ─────────────────────────────
    let inv = ss.getSheetByName('Investimentos');
    if (!inv) { inv = ss.insertSheet('Investimentos'); log.push('✅ Aba Investimentos criada'); }
    else { log.push('⏭ Aba Investimentos já existe'); }

    if (inv.getRange('A1').getValue() !== 'INVESTIMENTOS - SALDO POR ATIVO') {
        inv.getRange('A1').setValue('INVESTIMENTOS - SALDO POR ATIVO');
        inv.getRange('A1').setFontWeight('bold');
        inv.getRange('A3:F3').setValues([['Ativo', 'Saldo Inicial', 'Aportes (mês)', 'Resgates (mês)', 'Rendimentos (mês)', 'Saldo Atual']]);
        inv.getRange('A3:F3').setFontWeight('bold');
        inv.getRange('A4').setValue('CDB 115% CDI');
        // B4: saldo inicial (aportes com fonte=Saldo Inicial)
        inv.getRange('B4').setFormula(
            `=SUMIFS('Lançamentos'!C:C; 'Lançamentos'!B:B; "Transferência"; 'Lançamentos'!D:D; A4; 'Lançamentos'!F:F; "Saldo Inicial")`);
        // C4: aportes do mês (exclui Saldo Inicial)
        inv.getRange('C4').setFormula(
            `=SUMIFS('Lançamentos'!C:C; 'Lançamentos'!B:B; "Transferência"; 'Lançamentos'!D:D; A4; 'Lançamentos'!A:A; ">=" & 'Dashboard'!$B$4; 'Lançamentos'!A:A; "<=" & 'Dashboard'!$D$4; 'Lançamentos'!F:F; "<>Saldo Inicial")`);
        // D4: resgates do mês (fonte=CDB)
        inv.getRange('D4').setFormula(
            `=SUMIFS('Lançamentos'!C:C; 'Lançamentos'!B:B; "Transferência"; 'Lançamentos'!F:F; A4; 'Lançamentos'!A:A; ">=" & 'Dashboard'!$B$4; 'Lançamentos'!A:A; "<=" & 'Dashboard'!$D$4)`);
        // E4: rendimentos do mês
        inv.getRange('E4').setFormula(
            `=SUMIFS('Lançamentos'!C:C; 'Lançamentos'!B:B; "Receita"; 'Lançamentos'!D:D; "Rendimento CDB"; 'Lançamentos'!A:A; ">=" & 'Dashboard'!$B$4; 'Lançamentos'!A:A; "<=" & 'Dashboard'!$D$4)`);
        // F4: saldo acumulado total
        inv.getRange('F4').setFormula(
            `=SUMIFS('Lançamentos'!C:C; 'Lançamentos'!B:B; "Transferência"; 'Lançamentos'!D:D; A4) - SUMIFS('Lançamentos'!C:C; 'Lançamentos'!B:B; "Transferência"; 'Lançamentos'!F:F; A4) + SUMIFS('Lançamentos'!C:C; 'Lançamentos'!B:B; "Receita"; 'Lançamentos'!D:D; "Rendimento CDB")`);
        inv.getRange('B4:F4').setNumberFormat('"R$ "#,##0.00');
        log.push('✅ Investimentos: headers e fórmulas configurados');
        log.push('⚠️ Fórmulas usam Dashboard!$B$4 e $D$4 (início/fim do mês) — verifique se essas células existem');
    } else { log.push('⏭ Investimentos já configurado'); }

    // ── TASK 4: Aba Parcelas ──────────────────────────────────
    let parc = ss.getSheetByName('Parcelas');
    if (!parc) { parc = ss.insertSheet('Parcelas'); log.push('✅ Aba Parcelas criada'); }
    else { log.push('⏭ Aba Parcelas já existe'); }

    if (parc.getRange('A1').getValue() !== 'PARCELAS ATIVAS') {
        parc.getRange('A1').setValue('PARCELAS ATIVAS');
        parc.getRange('A1').setFontWeight('bold');
        parc.getRange('A3:H3').setValues([[
            'Descrição', 'Valor Parcela', 'Parcela Atual', 'Total Parcelas',
            'Cartão', 'Categoria', 'Data 1ª Parcela', 'Status'
        ]]);
        parc.getRange('A3:H3').setFontWeight('bold');
        parc.getRange('B4:B100').setNumberFormat('"R$ "#,##0.00');
        parc.getRange('G4:G100').setNumberFormat('dd/mm/yyyy');
        log.push('✅ Parcelas: headers configurados');
    } else { log.push('⏭ Parcelas já configurado'); }

    // ── TASK 5: Dashboard — novos blocos ─────────────────────
    const dash = ss.getSheetByName('Dashboard');

    // Bloco: Gastos Individuais Gustavo (linha 67)
    if (dash.getRange('A67').getValue() !== 'Gastos Individuais — Gustavo') {
        dash.getRange('A67').setValue('Gastos Individuais — Gustavo');
        dash.getRange('A67').setFontWeight('bold');
        dash.getRange('B68').setValue('Categoria');
        dash.getRange('D68').setValue('Planejado');
        dash.getRange('E68').setValue('Realizado');
        dash.getRange('F68').setValue('Saldo');
        dash.getRange('G68').setValue('% Consumido');
        [['Padaria/café (semana)', 60], ['Lanches esporádicos', 35], ['Cuidado pessoal', 50],
         ['Roupas', 60], ['Peças íntimas', 25], ['Calçado', 30], ['Compras Shopee/ML', 50]
        ].forEach(([cat, plan], i) => {
            const r = 69 + i;
            dash.getRange(r, 2).setValue(cat);
            dash.getRange(r, 4).setValue(plan);
            dash.getRange(r, 5).setFormula(
                `=SUMIFS('Lançamentos'!C:C; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!D:D; "${cat}"; 'Lançamentos'!E:E; "Gustavo"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4)`);
            dash.getRange(r, 6).setFormula(`=D${r} - E${r}`);
            dash.getRange(r, 7).setFormula(`=IF(D${r}=0; 0; E${r}/D${r})`);
        });
        dash.getRange('D69:F75').setNumberFormat('"R$ "#,##0.00');
        dash.getRange('G69:G75').setNumberFormat('0%');
        log.push('✅ Dashboard: bloco Gastos Individuais Gustavo (67-75)');
    } else { log.push('⏭ Dashboard: bloco Gustavo já existe'); }

    // Bloco: Gastos Individuais Luana (linha 78)
    if (dash.getRange('A78').getValue() !== 'Gastos Individuais — Luana') {
        dash.getRange('A78').setValue('Gastos Individuais — Luana');
        dash.getRange('A78').setFontWeight('bold');
        dash.getRange('B79').setValue('Categoria');
        dash.getRange('D79').setValue('Planejado');
        dash.getRange('E79').setValue('Realizado');
        dash.getRange('F79').setValue('Saldo');
        dash.getRange('G79').setValue('% Consumido');
        [['Padaria/café (semana)', 60], ['Lanches esporádicos', 35], ['Cuidado pessoal', 70],
         ['Roupas', 60], ['Peças íntimas', 25], ['Calçado', 30], ['Compras Shopee/ML', 50]
        ].forEach(([cat, plan], i) => {
            const r = 80 + i;
            dash.getRange(r, 2).setValue(cat);
            dash.getRange(r, 4).setValue(plan);
            dash.getRange(r, 5).setFormula(
                `=SUMIFS('Lançamentos'!C:C; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!D:D; "${cat}"; 'Lançamentos'!E:E; "Luana"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4)`);
            dash.getRange(r, 6).setFormula(`=D${r} - E${r}`);
            dash.getRange(r, 7).setFormula(`=IF(D${r}=0; 0; E${r}/D${r})`);
        });
        dash.getRange('D80:F86').setNumberFormat('"R$ "#,##0.00');
        dash.getRange('G80:G86').setNumberFormat('0%');
        log.push('✅ Dashboard: bloco Gastos Individuais Luana (78-86)');
    } else { log.push('⏭ Dashboard: bloco Luana já existe'); }

    // Bloco: Fatura por Cartão (linha 88) — getFatura() lê E90/E91/E92
    if (dash.getRange('A88').getValue() !== 'Fatura por Cartão (mês corrente)') {
        dash.getRange('A88').setValue('Fatura por Cartão (mês corrente)');
        dash.getRange('A88').setFontWeight('bold');
        dash.getRange('B89:E89').setValues([['Cartão', 'Parcelas', 'À Vista', 'Total']]);
        dash.getRange('B89:E89').setFontWeight('bold');
        ['Nubank Gu', 'Nubank Lu', 'Mercado Pago Gu'].forEach((cartao, i) => {
            const r = 90 + i;
            dash.getRange(r, 2).setValue(cartao);
            // Usa coluna H (Competência) para filtrar por mês de fatura
            dash.getRange(r, 3).setFormula(
                `=SUMIFS('Lançamentos'!C:C; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!F:F; B${r}; 'Lançamentos'!H:H; ">=" & $B$4; 'Lançamentos'!H:H; "<=" & $D$4)`);
            dash.getRange(r, 4).setValue(0);
            dash.getRange(r, 5).setFormula(`=C${r} + D${r}`);
        });
        dash.getRange('C90:E92').setNumberFormat('"R$ "#,##0.00');
        log.push('✅ Dashboard: bloco Fatura por Cartão (88-92)');
    } else { log.push('⏭ Dashboard: bloco Fatura já existe'); }

    // Bloco: Provisões — Saldo Acumulado (linha 95)
    if (dash.getRange('A95').getValue() !== 'Provisões — Saldo Acumulado') {
        dash.getRange('A95').setValue('Provisões — Saldo Acumulado');
        dash.getRange('A95').setFontWeight('bold');
        dash.getRange('B96:G96').setValues([['Categoria', 'Plan/mês', 'Meses', 'Crédito Total', 'Gasto Total', 'Saldo']]);
        dash.getRange('B96:G96').setFontWeight('bold');
        [['Roupas', 120], ['Peças íntimas', 50], ['Calçado', 60], ['Presentes', 80],
         ['Cuidado pessoal', 120], ['Dentista', 50], ['Coparticipação médica', 120],
         ['Farmácia', 80], ['Óleo moto', 75], ['IPTU', 60],
         ['Compras Shopee/ML', 100], ['Reserva imprevistos', 200]
        ].forEach(([cat, plan], i) => {
            const r = 97 + i;
            dash.getRange(r, 2).setValue(cat);
            dash.getRange(r, 3).setValue(plan);
            dash.getRange(r, 4).setFormula(`DATEDIF(Config!$C$7,TODAY(),"M")+1`);
            dash.getRange(r, 5).setFormula(`C${r}*D${r}`);
            dash.getRange(r, 6).setFormula(
                `SUMIFS('Lançamentos'!C:C,'Lançamentos'!B:B,"Despesa",'Lançamentos'!D:D,B${r},'Lançamentos'!A:A,">="&'Config'!$C$7)`);
            dash.getRange(r, 7).setFormula(`E${r}-F${r}`);
        });
        dash.getRange('C97:C108').setNumberFormat('"R$ "#,##0.00');
        dash.getRange('E97:G108').setNumberFormat('"R$ "#,##0.00');
        log.push('✅ Dashboard: bloco Provisões Acumulado (95-108)');
    } else { log.push('⏭ Dashboard: bloco Provisões já existe'); }

    // Limpa o cache de listas para forçar releitura do Config atualizado
    CacheService.getScriptCache().remove('lists_v1');
    log.push('✅ Cache de listas limpo');

    console.log('\n=== setupV52 CONCLUÍDO ===\n' + log.join('\n'));
}

// ============================================================
// FORCE FIX ALL FORMULAS — Contorna a idempotência do setupV52/V53
// Regrava todas as fórmulas das abas analíticas usando a sintaxe validada.
// ============================================================
function forceFixAllFormulas() {
    _loadSecrets();
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const log = [];

    // Lançamentos V53: A=Data, B=TIPO, C=ID, D=VALOR, E=FONTE, F=DESC, G=PAGADOR, H=COMPETÊNCIA

    // 1. Investimentos
    const inv = ss.getSheetByName('Investimentos');
    if (inv) {
        inv.getRange('B4').setFormula(`=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Transferência"; 'Lançamentos'!C:C; XLOOKUP(A4; 'Config'!B:B; 'Config'!A:A); 'Lançamentos'!E:E; "Saldo Inicial")`);
        inv.getRange('C4').setFormula(`=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Transferência"; 'Lançamentos'!C:C; XLOOKUP(A4; 'Config'!B:B; 'Config'!A:A); 'Lançamentos'!A:A; ">=" & 'Dashboard'!$B$4; 'Lançamentos'!A:A; "<=" & 'Dashboard'!$D$4; 'Lançamentos'!E:E; "<>Saldo Inicial")`);
        inv.getRange('D4').setFormula(`=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Transferência"; 'Lançamentos'!E:E; XLOOKUP(A4; 'Config'!B:B; 'Config'!A:A); 'Lançamentos'!A:A; ">=" & 'Dashboard'!$B$4; 'Lançamentos'!A:A; "<=" & 'Dashboard'!$D$4)`);
        inv.getRange('E4').setFormula(`=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Receita"; 'Lançamentos'!C:C; XLOOKUP("Rendimento CDB"; 'Config'!B:B; 'Config'!A:A); 'Lançamentos'!A:A; ">=" & 'Dashboard'!$B$4; 'Lançamentos'!A:A; "<=" & 'Dashboard'!$D$4)`);
        inv.getRange('F4').setFormula(`=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Transferência"; 'Lançamentos'!C:C; XLOOKUP(A4; 'Config'!B:B; 'Config'!A:A)) - SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Transferência"; 'Lançamentos'!E:E; XLOOKUP(A4; 'Config'!B:B; 'Config'!A:A)) + SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Receita"; 'Lançamentos'!C:C; XLOOKUP("Rendimento CDB"; 'Config'!B:B; 'Config'!A:A))`);
        log.push('✅ Fórmulas de Investimentos forçadas (V53).');
    }

    // 2. Dashboard
    const dash = ss.getSheetByName('Dashboard');
    if (dash) {
        dash.getRange('E8').setFormula(`=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Receita"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4)`);
        dash.getRange('E9').setFormula(`=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4)`);
        dash.getRange('F8').setFormula(`=E8 - D8`);
        dash.getRange('G8').setFormula(`=IF(D8=0; 0; E8/D8)`);
        dash.getRange('F9').setFormula(`=D9 - E9`);
        dash.getRange('D10').setFormula(`=D8 - D9`);
        dash.getRange('E10').setFormula(`=E8 - E9`);

        dash.getRange('E13').setFormula(`=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Receita"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4; 'Lançamentos'!G:G; "Luana")`);
        dash.getRange('E14').setFormula(`=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4; 'Lançamentos'!G:G; "Luana")`);
        dash.getRange('E16').setFormula(`=E13 - E14 - E15`);

        dash.getRange('C21').setFormula(`=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4; 'Lançamentos'!G:G; "Gustavo")`);
        dash.getRange('D21').setFormula(`=IF($E$9=0; 0; C21/$E$9)`);
        dash.getRange('C22').setFormula(`=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4; 'Lançamentos'!G:G; "Luana")`);
        dash.getRange('D22').setFormula(`=IF($E$9=0; 0; C22/$E$9)`);

        dash.getRange('D26:G63').clearContent();
        for (let r = 26; r <= 63; r++) {
            dash.getRange(r, 4).setFormula(`=IF(B${r}=""; ""; IFERROR(VLOOKUP(B${r}; 'Orçamento Mensal'!A:B; 2; FALSE()); 0))`);
            dash.getRange(r, 5).setFormula(`=IF(B${r}=""; ""; SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!C:C; XLOOKUP(B${r}; 'Config'!B:B; 'Config'!A:A); 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4))`);
            dash.getRange(r, 6).setFormula(`=IF(B${r}=""; ""; D${r} - E${r})`);
            dash.getRange(r, 7).setFormula(`=IF(B${r}=""; ""; IF(D${r}=0; IF(E${r}=0; 0; 9,99); E${r}/D${r}))`);
        }
        dash.getRange('D64').setFormula(`=SUM(D26:D63)`);
        dash.getRange('E64').setFormula(`=SUM(E26:E63)`);
        dash.getRange('F64').setFormula(`=D64 - E64`);
        dash.getRange('G64').setFormula(`=IF(D64=0; IF(E64=0; 0; 9,99); E64/D64)`);

        dash.getRange('E69:E75').clearContent();
        dash.getRange('F69:F75').clearContent();
        dash.getRange('G69:G75').clearContent();

        [['Padaria/café (semana)', 60], ['Lanches esporádicos', 35], ['Cuidado pessoal', 50],
         ['Roupas', 60], ['Peças íntimas', 25], ['Calçado', 30], ['Compras Shopee/ML', 50]
        ].forEach(([cat, plan], i) => {
            const r = 69 + i;
            dash.getRange(r, 5).setFormula(`=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!C:C; XLOOKUP("${cat}"; 'Config'!B:B; 'Config'!A:A); 'Lançamentos'!G:G; "Gustavo"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4)`);
            dash.getRange(r, 6).setFormula(`=D${r} - E${r}`);
            dash.getRange(r, 7).setFormula(`=IF(D${r}=0; 0; E${r}/D${r})`);
        });

        dash.getRange('E80:E86').clearContent();
        dash.getRange('F80:F86').clearContent();
        dash.getRange('G80:G86').clearContent();
        [['Padaria/café (semana)', 60], ['Lanches esporádicos', 35], ['Cuidado pessoal', 70],
         ['Roupas', 60], ['Peças íntimas', 25], ['Calçado', 30], ['Compras Shopee/ML', 50]
        ].forEach(([cat, plan], i) => {
            const r = 80 + i;
            dash.getRange(r, 5).setFormula(`=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!C:C; XLOOKUP("${cat}"; 'Config'!B:B; 'Config'!A:A); 'Lançamentos'!G:G; "Luana"; 'Lançamentos'!A:A; ">=" & $B$4; 'Lançamentos'!A:A; "<=" & $D$4)`);
            dash.getRange(r, 6).setFormula(`=D${r} - E${r}`);
            dash.getRange(r, 7).setFormula(`=IF(D${r}=0; 0; E${r}/D${r})`);
        });

        dash.getRange('C90:C92').clearContent();
        dash.getRange('E90:E92').clearContent();
        ['Nubank Gu', 'Nubank Lu', 'Mercado Pago Gu'].forEach((cartao, i) => {
            const r = 90 + i;
            dash.getRange(r, 3).setFormula(`=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!E:E; B${r}; 'Lançamentos'!H:H; ">=" & $B$4; 'Lançamentos'!H:H; "<=" & $D$4)`);
            dash.getRange(r, 5).setFormula(`=C${r} + D${r}`);
        });

        dash.getRange('D97:G108').clearContent();
        for (let i = 0; i < 12; i++) {
            const r = 97 + i;
            dash.getRange(r, 4).setFormula(`=DATEDIF('Config'!$C$7; $D$4; "M") + 1`);
            dash.getRange(r, 5).setFormula(`=C${r} * D${r}`);
            dash.getRange(r, 6).setFormula(`=SUMIFS('Lançamentos'!D:D; 'Lançamentos'!B:B; "Despesa"; 'Lançamentos'!C:C; XLOOKUP(B${r}; 'Config'!B:B; 'Config'!A:A); 'Lançamentos'!A:A; ">=" & 'Config'!$C$7)`);
            dash.getRange(r, 7).setFormula(`=E${r} - F${r}`);
        }

        log.push('✅ Fórmulas do Dashboard forçadas (V53).');
    }

    console.log('\n=== forceFixAllFormulas CONCLUÍDO ===\n' + log.join('\n'));
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

// ============================================================
// SETUP V53 — Migração para o Schema Relacional
// ============================================================
function setupV53() {
    _loadSecrets();
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const log = [];

    // 1. Aba Config
    const cfg = ss.getSheetByName('Config');
    if (!cfg) throw new Error('Aba Config não encontrada.');

    // Lê dados antigos antes de limpar (Fontes C11:C35, Pagadores B11:B20)
    const fontesAntigas = cfg.getRange('C11:C35').getValues().flat().filter(String);
    const pagadoresAntigos = cfg.getRange('B11:B20').getValues().flat().filter(String);
    const catDesp = cfg.getRange('E11:E60').getValues().flat().filter(String);
    const catRec = cfg.getRange('I11:I20').getValues().flat().filter(String);

    // Limpa a área abaixo da linha 10 para o novo Dicionário e Listas
    cfg.getRange('A11:Z1000').clearContent();

    // Monta o novo Dicionário de Categorias em A11:F11
    cfg.getRange('A11:F11').setValues([['ID_CATEGORIA', 'NOME_CATEGORIA', 'TIPO_MOVIMENTO', 'CLASSE_DRE', 'TIPO_ATIVO', 'REGRA_RENDIMENTO']]);
    cfg.getRange('A11:F11').setFontWeight('bold');

    let dictRow = 12;
    // Migra despesas
    catDesp.forEach((cat, i) => {
        let prefix = cat === 'CDB 115% CDI' ? 'INV' : 'OPEX';
        let id = `${prefix}-${String(i+1).padStart(2, '0')}`;
        let tipoMov = cat === 'CDB 115% CDI' ? 'Transferência' : 'Despesa';
        let classe = cat === 'CDB 115% CDI' ? 'Investimento' : 'Operacional';
        let tipoAtivo = cat === 'CDB 115% CDI' ? 'CDB' : '';
        cfg.getRange(dictRow++, 1, 1, 6).setValues([[id, cat, tipoMov, classe, tipoAtivo, '']]);
    });
    // Migra receitas
    catRec.forEach((cat, i) => {
        let prefix = cat === 'Rendimento CDB' ? 'REND' : 'REC';
        let id = `${prefix}-${String(i+1).padStart(2, '0')}`;
        cfg.getRange(dictRow++, 1, 1, 6).setValues([[id, cat, 'Receita', 'Operacional', '', '']]);
    });

    log.push('✅ Config: Dicionário relacional criado em A11:F');

    // Move Fontes para H11 e Pagadores para J11
    cfg.getRange('H11').setValue('FONTES');
    cfg.getRange('H11').setFontWeight('bold');
    if (fontesAntigas.length > 0) {
        const fontesMatrix = fontesAntigas.map(f => [f]);
        cfg.getRange(12, 8, fontesMatrix.length, 1).setValues(fontesMatrix);
    }

    cfg.getRange('J11').setValue('PAGADORES');
    cfg.getRange('J11').setFontWeight('bold');
    if (pagadoresAntigos.length > 0) {
        const pagadoresMatrix = pagadoresAntigos.map(p => [p]);
        cfg.getRange(12, 10, pagadoresMatrix.length, 1).setValues(pagadoresMatrix);
    }

    log.push('✅ Config: Fontes e Pagadores movidos para H e J');

    // 2. Aba Lançamentos
    const lanc = ss.getSheetByName('Lançamentos');
    if (!lanc) throw new Error('Aba Lançamentos não encontrada.');

    // Atualiza Headers na linha 5
    lanc.getRange('A5:H5').setValues([['Data', 'TIPO', 'ID', 'VALOR', 'FONTE', 'DESCRIÇÃO', 'PAGADOR', 'COMPETÊNCIA']]);
    lanc.getRange('A5:H5').setFontWeight('bold');

    log.push('✅ Lançamentos: Headers reestruturados conforme V53');

    // Mapeamento Nome -> ID para migração de histórico
    const catMap = {};
    const dictData = cfg.getRange(12, 1, dictRow - 12, 2).getValues();
    dictData.forEach(r => catMap[r[1]] = r[0]);

    const lastLancRow = lanc.getLastRow();
    if (lastLancRow >= 6) {
        const oldData = lanc.getRange(6, 1, lastLancRow - 5, 8).getValues();
        const newData = oldData.map(r => {
            const data = r[0];
            const tipo = r[1];
            const valor = r[2];
            const categoria = r[3];
            const pagador = r[4];
            const fonte = r[5];
            const descricao = r[6];
            const competencia = r[7];

            const id = catMap[categoria] || categoria;
            return [data, tipo, id, valor, fonte, descricao, pagador, competencia];
        });

        lanc.getRange(6, 1, newData.length, 8).setValues(newData);
        lanc.getRange(6, 4, newData.length, 1).setNumberFormat('"R$ "#,##0.00');
        
        log.push('✅ Lançamentos: Histórico migrado para o novo schema (ID em vez de Nome)');
    }

    // Limpa o cache
    CacheService.getScriptCache().remove('lists_v1');
    log.push('✅ Cache de listas limpo');

    console.log('\n=== setupV53 CONCLUÍDO ===\n' + log.join('\n'));
}

// ============================================================
// ACTIONS — funções que ESCREVEM na planilha (handleEntry, desfazerUltimo,
// handleManter, handleParcela) + helpers de saldo (getCategorySaldo,
// getAccumulatedSaldo, monthsDiff) usados na resposta de lançamentos.
// ============================================================

// ============================================================
// LANÇAMENTO — parse + valida + grava + responde
// ============================================================
function handleEntry(text, chatId, user) {
    let parsed;
    try {
        parsed = parseWithOpenAI(text, user.pagador);
    } catch (err) {
        sendTelegram(chatId, `⚠️ Erro ao interpretar a mensagem: ${err.message}\n\nTente algo como: "52 ifood luana nubank" ou "aportei 500 no cdb".`);
        return;
    }

    if (parsed.error) {
        sendTelegram(chatId, `🤔 Não entendi: ${parsed.error}\n\nExemplos:\n• "52 ifood luana nubank"\n• "gastei 35 no café"\n• "aportei 500 no cdb"`);
        return;
    }

    const validation = validateParse(parsed);
    if (!validation.ok) {
        sendTelegram(chatId, `⚠️ ${validation.message}`);
        return;
    }

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SHEETS.lancamentos);
    const date = new Date();
    const newRow = sheet.getLastRow() + 1;

    let rowsToInsert = [];
    let isAporte = parsed.tipo === 'Transferência' && parsed.categoria.startsWith('INV-');

    if (isAporte) {
        // Motor de Partidas Dobradas: Aporte gera duas linhas
        rowsToInsert.push([
            date, 'Despesa', 'INV-APORTE', parsed.valor, parsed.fonte, parsed.descricao || 'Débito Aporte', parsed.pagador, date
        ]);
        rowsToInsert.push([
            date, 'Receita', parsed.id_categoria, parsed.valor, parsed.fonte, parsed.descricao || 'Crédito Aporte', parsed.pagador, date
        ]);
    } else {
        // Lançamento normal no novo schema V53
        rowsToInsert.push([
            date,
            parsed.tipo,
            parsed.id_categoria, // grava o ID relacional
            parsed.valor,
            parsed.fonte,
            parsed.descricao || '',
            parsed.pagador,
            date
        ]);
    }

    sheet.getRange(newRow, 1, rowsToInsert.length, 8).setValues(rowsToInsert);

    sheet.getRange(newRow, 1, rowsToInsert.length, 1).setNumberFormat('dd/mm/yyyy');
    sheet.getRange(newRow, 4, rowsToInsert.length, 1).setNumberFormat('"R$ "#,##0.00');
    sheet.getRange(newRow, 8, rowsToInsert.length, 1).setNumberFormat('dd/mm/yyyy');

    PropertiesService.getScriptProperties()
        .setProperty('last_row_' + chatId, JSON.stringify({ row: newRow, count: rowsToInsert.length }));

    sendTelegram(chatId, formatEntryResponse(parsed, date, isAporte));
}

function formatEntryResponse(p, date, isAporte) {
    const dataStr = Utilities.formatDate(date, CONFIG.TIMEZONE, 'dd/MM/yyyy');
    const valorStr = formatBRL(p.valor);

    if (isAporte) {
        return `✅ Aporte registrado (Partida Dobrada)\n💸 ${valorStr}\n📤 ${p.fonte} → 📥 ${p.categoria}\n👤 ${p.pagador}\n📅 ${dataStr}`;
    }
    
    if (p.tipo === 'Transferência') {
        return `✅ Transferência registrada\n💸 ${valorStr}\n📤 ${p.fonte} → ${p.categoria}\n👤 ${p.pagador}\n📅 ${dataStr}`;
    }

    const icon = p.tipo === 'Receita' ? '💵' : '💸';
    let resp = `✅ Registrado\n${icon} ${valorStr} — ${p.categoria}\n👤 ${p.pagador} • ${p.fonte}\n📅 ${dataStr}`;

    if (p.descricao) resp += `\n📝 ${p.descricao}`;

    if (p.tipo === 'Despesa') {
        if (PROVISAO_CATS.includes(p.categoria)) {
            const s = getAccumulatedSaldo(p.id_categoria, p.categoria);
            if (s) {
                const pct = s.creditoTotal > 0 ? Math.round((s.gastoHistorico / s.creditoTotal) * 100) : 0;
                const alerta = s.acumulado < 0 ? ' ⚠️ NEGATIVO' : pct > 80 ? ' ⚡' : ' ✅';
                resp += `\n\n📦 ${p.categoria} (${s.meses} meses acumulados):\n${formatBRL(s.gastoHistorico)} de ${formatBRL(s.creditoTotal)} (${pct}%)\nSaldo envelope: ${formatBRL(s.acumulado)}${alerta}`;
            }
        } else {
            const s = getCategorySaldo(p.categoria);
            if (s) {
                const pct = s.planejado > 0 ? Math.round((s.gasto / s.planejado) * 100) : 0;
                const alerta = pct > 100 ? ' ⚠️ ESTOUROU' : pct > 80 ? ' ⚡' : pct > 50 ? '' : ' ✅';
                resp += `\n\n📊 ${p.categoria} no mês:\n${formatBRL(s.gasto)} de ${formatBRL(s.planejado)} (${pct}%)${alerta}`;
            }
        }
    }

    return resp;
}

// ============================================================
// DESFAZER — apaga a última linha gravada por este chatId
// ============================================================
function desfazerUltimo(chatId, user) {
    const props = PropertiesService.getScriptProperties();
    const lastRowRaw = props.getProperty('last_row_' + chatId);
    if (!lastRowRaw) {
        sendTelegram(chatId, 'Nada pra desfazer. Só dá pra desfazer o último lançamento que VOCÊ fez.');
        return;
    }
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SHEETS.lancamentos);

    let row, count = 1;
    try {
        const parsed = JSON.parse(lastRowRaw);
        row = parsed.row;
        count = parsed.count;
    } catch(e) {
        row = parseInt(lastRowRaw, 10);
    }

    const vals = sheet.getRange(row, 1, 1, 8).getValues()[0];

    // vals[3] é o VALOR no schema V53
    if (!vals[3]) {
        sendTelegram(chatId, 'Linha já estava vazia — nada pra desfazer.');
        return;
    }

    sheet.getRange(row, 1, count, 8).clearContent();
    props.deleteProperty('last_row_' + chatId);

    let msg = `↩️ Desfeito\n💸 ${formatBRL(vals[3])} — ${vals[2]} (${vals[4]})`;
    if (count > 1) msg += `\n*(Incluindo contrapartida de partida dobrada)*`;
    sendTelegram(chatId, msg);
}

// ============================================================
// /MANTER — registra o acerto mensal (Luana → Gustavo)
// ============================================================
function handleManter(chatId, user) {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const dash = ss.getSheetByName(CONFIG.SHEETS.dashboard);
    const transfere = dash.getRange('E16').getValue();

    if (!transfere || transfere <= 0) {
        sendTelegram(chatId, `ℹ️ Acerto do mês: ${formatBRL(transfere)}\nNada a transferir este mês.`);
        return;
    }

    const sheet = ss.getSheetByName(CONFIG.SHEETS.lancamentos);
    const date = new Date();
    const newRow = sheet.getLastRow() + 1;

    sheet.getRange(newRow, 1, 1, 8).setValues([[
        date, 'Transferência', 'Conta Gustavo', transfere, 'Conta Luana', 'Acerto mensal', user.pagador, date
    ]]);
    sheet.getRange(newRow, 1).setNumberFormat('dd/mm/yyyy');
    sheet.getRange(newRow, 4).setNumberFormat('"R$ "#,##0.00'); // VALOR is column 4 (D)
    sheet.getRange(newRow, 8).setNumberFormat('dd/mm/yyyy');

    PropertiesService.getScriptProperties()
        .setProperty('last_row_' + chatId, JSON.stringify({ row: newRow, count: 1 }));

    sendTelegram(chatId, `✅ Acerto registrado!\n💸 ${formatBRL(transfere)}\n📤 Conta Luana → Conta Gustavo\n📅 ${Utilities.formatDate(date, CONFIG.TIMEZONE, 'dd/MM/yyyy')}`);
}

// ============================================================
// /PARCELA — cadastra parcela (aba Parcelas) + 1ª parcela em Lançamentos
// ============================================================
function handleParcela(arg, chatId, user) {
    if (!arg) {
        sendTelegram(chatId, `📋 *Cadastrar parcela*\n\nFormato: /parcela [valor_total] [n_parcelas] [cartão] [categoria]\n\nExemplo:\n/parcela 360 3 nubank calçado\n  → R$ 120,00 × 3x no Nubank Gu`);
        return;
    }

    const parts = arg.trim().split(/\s+/);
    if (parts.length < 3) {
        sendTelegram(chatId, '⚠️ Formato: /parcela [valor_total] [n_parcelas] [cartão] [categoria?]');
        return;
    }

    const valorTotal = parseFloat(parts[0].replace(',', '.'));
    const nParcelas = parseInt(parts[1], 10);
    const cartaoRaw = parts[2].toLowerCase();
    const catRaw = parts.slice(3).join(' ') || '';

    if (isNaN(valorTotal) || valorTotal <= 0 || isNaN(nParcelas) || nParcelas < 1) {
        sendTelegram(chatId, '⚠️ Valor ou número de parcelas inválido.');
        return;
    }

    const { fontes, categorias, catMap } = getListsCached();

    let cartao = fontes.find(f => f.toLowerCase().includes(cartaoRaw));
    if (!cartao) {
        if (cartaoRaw.includes('lu')) cartao = 'Nubank Lu';
        else if (cartaoRaw.includes('mp') || cartaoRaw.includes('mercado')) cartao = 'Mercado Pago Gu';
        else cartao = user.pagador === 'Luana' ? 'Nubank Lu' : 'Nubank Gu';
    }

    const categoria = categorias.find(c => c.toLowerCase().includes(catRaw.toLowerCase())) || 'Outros';
    const idCategoria = catMap ? (catMap[categoria] || categoria) : categoria;
    const valorParcela = Math.round((valorTotal / nParcelas) * 100) / 100;

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const parcelasSheet = ss.getSheetByName(CONFIG.SHEETS.parcelas);
    const date = new Date();
    const parcelaRow = Math.max(parcelasSheet.getLastRow() + 1, 4);

    parcelasSheet.getRange(parcelaRow, 1, 1, 8).setValues([[
        catRaw || categoria, valorParcela, 1, nParcelas, cartao, idCategoria, date, 'Ativa'
    ]]);
    parcelasSheet.getRange(parcelaRow, 2).setNumberFormat('"R$ "#,##0.00');
    parcelasSheet.getRange(parcelaRow, 7).setNumberFormat('dd/mm/yyyy');

    const lancSheet = ss.getSheetByName(CONFIG.SHEETS.lancamentos);
    const lancRow = lancSheet.getLastRow() + 1;
    lancSheet.getRange(lancRow, 1, 1, 8).setValues([[
        date, 'Despesa', idCategoria, valorParcela, cartao,
        `Parcela 1/${nParcelas}`, user.pagador, date
    ]]);
    lancSheet.getRange(lancRow, 1).setNumberFormat('dd/mm/yyyy');
    lancSheet.getRange(lancRow, 4).setNumberFormat('"R$ "#,##0.00'); // VALOR is column 4 (D)
    lancSheet.getRange(lancRow, 8).setNumberFormat('dd/mm/yyyy');

    PropertiesService.getScriptProperties()
        .setProperty('last_row_' + chatId, JSON.stringify({ row: lancRow, count: 1 }));

    sendTelegram(chatId, `✅ Parcela cadastrada!\n${catRaw || categoria}: ${formatBRL(valorParcela)}/mês × ${nParcelas}x\nCartão: ${cartao}\nParcela 1/${nParcelas} lançada em ${Utilities.formatDate(date, CONFIG.TIMEZONE, 'dd/MM/yyyy')}`);
}

// ============================================================
// HELPERS DE SALDO — usados pela resposta do handleEntry e por /saldo
// ============================================================
function monthsDiff(d1, d2) {
    return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()) + 1;
}

function getAccumulatedSaldo(idCategoria, nomeCategoria) {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const cfg = ss.getSheetByName(CONFIG.SHEETS.config);
    const dataInicio = cfg.getRange('C7').getValue();
    if (!dataInicio) return null;

    const meses = monthsDiff(new Date(dataInicio), new Date());
    const dash = ss.getSheetByName(CONFIG.SHEETS.dashboard);

    // Find planned amount for this category in Dashboard (B and D columns, rows 26-130)
    const dashData = dash.getRange('B26:D130').getValues();
    const dashRow = dashData.find(r => r[0] === nomeCategoria);
    const planejado = dashRow ? dashRow[2] : 0;
    if (!planejado) return null;

    // Sum all historical spending for this category since sistema start
    const sheet = ss.getSheetByName(CONFIG.SHEETS.lancamentos);
    const lastRow = sheet.getLastRow();
    if (lastRow < 6) return { planejado, meses, creditoTotal: planejado * meses, gastoHistorico: 0, acumulado: planejado * meses };

    const lancData = sheet.getRange(6, 1, lastRow - 5, 8).getValues();
    const gastoHistorico = lancData
        .filter(r => r[2] === idCategoria && r[1] === 'Despesa' && r[0] >= dataInicio) // r[2] é ID
        .reduce((sum, r) => sum + (typeof r[3] === 'number' ? r[3] : 0), 0); // r[3] é VALOR

    return {
        planejado,
        meses,
        creditoTotal: planejado * meses,
        gastoHistorico,
        acumulado: planejado * meses - gastoHistorico
    };
}

function getCategorySaldo(categoria) {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const dash = ss.getSheetByName(CONFIG.SHEETS.dashboard);
    const values = dash.getRange('B26:E64').getValues();
    for (const row of values) {
        if (row[0] === categoria) {
            return { planejado: row[2], gasto: row[3] };
        }
    }
    return null;
}

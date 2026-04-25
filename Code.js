// ============================================================
// CONFIG — valores não-sensíveis inline; segredos via PropertiesService
// Para configurar os segredos, execute setupSecrets() uma vez no Editor
// ============================================================
const CONFIG = {
    MODEL: 'gpt-5-nano',
    TIMEZONE: 'America/Sao_Paulo',
    SHEETS: {
        lancamentos: 'Lançamentos',
        config: 'Config',
        dashboard: 'Dashboard',
        investimentos: 'Investimentos',
        parcelas: 'Parcelas'
    }
};

const PROVISAO_CATS = [
    'Roupas', 'Peças íntimas', 'Calçado', 'Presentes',
    'Cuidado pessoal', 'Dentista', 'Coparticipação médica',
    'Farmácia', 'Óleo moto', 'IPTU', 'Compras Shopee/ML', 'Reserva imprevistos'
];

function _loadSecrets() {
    const p = PropertiesService.getScriptProperties();
    CONFIG.OPENAI_API_KEY = p.getProperty('OPENAI_API_KEY');
    CONFIG.TELEGRAM_TOKEN = p.getProperty('TELEGRAM_TOKEN');
    CONFIG.SPREADSHEET_ID = p.getProperty('SPREADSHEET_ID');
    CONFIG.AUTHORIZED = JSON.parse(p.getProperty('AUTHORIZED') || '{}');
}

// ============================================================
// ENTRY POINT — Telegram webhook
// ============================================================
function doPost(e) {
    _loadSecrets();
    try {
        const update = JSON.parse(e.postData.contents);
        const msg = update.message || update.edited_message;
        if (!msg || !msg.text) return _ok();

        const chatId = String(msg.chat.id);
        const text = msg.text.trim();
        const user = CONFIG.AUTHORIZED[chatId];

        if (!user) {
            sendTelegram(chatId, '🚫 Você não está autorizado a usar este bot.');
            return _ok();
        }

        if (text.startsWith('/')) {
            handleCommand(text, chatId, user);
        } else {
            handleEntry(text, chatId, user);
        }
    } catch (err) {
        console.error('doPost error:', err, err.stack);
    }
    return _ok();
}

function _ok() { return ContentService.createTextOutput(''); }

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

    // Column H (Competência) = same as date for non-installment entries
    sheet.getRange(newRow, 1, 1, 8).setValues([[
        date,
        parsed.tipo,
        parsed.valor,
        parsed.categoria,
        parsed.pagador,
        parsed.fonte,
        parsed.descricao || '',
        date
    ]]);

    sheet.getRange(newRow, 1).setNumberFormat('dd/mm/yyyy');
    sheet.getRange(newRow, 3).setNumberFormat('"R$ "#,##0.00');
    sheet.getRange(newRow, 8).setNumberFormat('dd/mm/yyyy');

    PropertiesService.getScriptProperties()
        .setProperty('last_row_' + chatId, String(newRow));

    sendTelegram(chatId, formatEntryResponse(parsed, date));
}

function formatEntryResponse(p, date) {
    const dataStr = Utilities.formatDate(date, CONFIG.TIMEZONE, 'dd/MM/yyyy');
    const valorStr = formatBRL(p.valor);

    if (p.tipo === 'Transferência') {
        return `✅ Transferência registrada\n💸 ${valorStr}\n📤 ${p.fonte} → ${p.categoria}\n👤 ${p.pagador}\n📅 ${dataStr}`;
    }

    const icon = p.tipo === 'Receita' ? '💵' : '💸';
    let resp = `✅ Registrado\n${icon} ${valorStr} — ${p.categoria}\n👤 ${p.pagador} • ${p.fonte}\n📅 ${dataStr}`;

    if (p.descricao) resp += `\n📝 ${p.descricao}`;

    if (p.tipo === 'Despesa') {
        if (PROVISAO_CATS.includes(p.categoria)) {
            const s = getAccumulatedSaldo(p.categoria);
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
// PARSE — chama OpenAI com structured output
// ============================================================
function parseWithOpenAI(text, pagadorDefault) {
    const { categorias, fontes, pagadores } = getListsCached();

    const systemPrompt = buildSystemPrompt(categorias, fontes, pagadores, pagadorDefault);

    const body = {
        model: CONFIG.MODEL,
        reasoning_effort: 'low',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
        ],
        response_format: {
            type: 'json_schema',
            json_schema: {
                name: 'lancamento',
                strict: true,
                schema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        tipo: { type: 'string', enum: ['Despesa', 'Receita', 'Transferência'] },
                        valor: { type: 'number' },
                        categoria: { type: 'string' },
                        pagador: { type: 'string', enum: pagadores },
                        fonte: { type: 'string' },
                        descricao: { type: 'string' },
                        error: { type: ['string', 'null'] }
                    },
                    required: ['tipo', 'valor', 'categoria', 'pagador', 'fonte', 'descricao', 'error']
                }
            }
        }
    };

    const response = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
        method: 'post',
        contentType: 'application/json',
        headers: { 'Authorization': 'Bearer ' + CONFIG.OPENAI_API_KEY },
        payload: JSON.stringify(body),
        muteHttpExceptions: true
    });

    const code = response.getResponseCode();
    const respText = response.getContentText();

    if (code !== 200) {
        throw new Error('OpenAI ' + code + ': ' + respText.substring(0, 200));
    }

    const data = JSON.parse(respText);
    const content = data.choices[0].message.content;
    return JSON.parse(content);
}

function buildSystemPrompt(categorias, fontes, pagadores, pagadorDefault) {
    return `<identidade>
Você é o parser de mensagens financeiras do bot doméstico do casal Gustavo e Luana.
Sua única função é transformar mensagens em português brasileiro informal
em registros estruturados de gastos, receitas ou transferências entre contas.
</identidade>

<regras_globais>
1. TIPO: assuma "Despesa" por padrão. Marque "Receita" SOMENTE quando a mensagem
   descrever recebimento (salário, bônus, reembolso, PIX recebido, estorno).
   Marque "Transferência" para movimentação entre contas/investimentos (regra 8).

2. VALOR: extraia o número exatamente como informado, PRESERVANDO casas decimais.
   "R$ 52,75" → 52.75 (não arredonde para 53).
   Aceite formatos: "52", "52,50", "R$ 52", "52 reais", "52.50".
   Sempre positivo.

3. CATEGORIA: escolha SEMPRE uma das opções em <mapeamento_categorias>.
   Se nenhuma encaixar com segurança, use "Outros" E preencha "descricao"
   com o termo original da mensagem E preencha "error" com:
   "Não encontrei categoria exata. Confirma 'Outros' ou manda a categoria?"

4. PAGADOR: use o valor passado em <contexto_pagador_default> por padrão
   (é quem mandou a mensagem no Telegram).
   Altere SOMENTE quando a mensagem citar explicitamente a outra pessoa
   ("luana pagou", "foi o gustavo", "ela comprou").
   Valores aceitos: ${pagadores.join(' ou ')}.

5. FONTE: escolha SEMPRE uma das opções em <mapeamento_fontes>.
   Se a mensagem não dá pista da fonte, use "Outro" (é uma opção válida).
   Para Transferência: FONTE = conta/investimento de ORIGEM do dinheiro.

6. DESCRICAO: texto livre curto, opcional. Preencha quando houver
   informação adicional útil (nome do estabelecimento, motivo).
   Caso contrário, retorne string vazia "".

7. ERROR: retorne null quando o parse foi bem-sucedido.
   Preencha com uma pergunta curta ao usuário APENAS nestes casos:
   (a) categoria sem encaixe (ver regra 3),
   (b) valor ausente ou ambíguo na mensagem,
   (c) tipo (Despesa/Receita/Transferência) realmente ambíguo.
   Nesses casos, ainda retorne um JSON válido: use valor=0 e
   categoria="Outros" como placeholders.

8. TRANSFERÊNCIA: use tipo="Transferência" quando a mensagem descrever
   movimentação entre contas ou para/de investimentos.
   Heurísticas: "aportei", "resgatei", "separei", "mandei pro cdb", "tirei do cdb".
   FONTE = origem (ex: "Conta Gustavo" para aporte; "CDB 115% CDI" para resgate).
   CATEGORIA = destino (ex: "CDB 115% CDI" para aporte; "Conta Gustavo" para resgate).
   ATENÇÃO: fonte NUNCA pode ser igual à categoria (auto-transferência é inválida).

9. RENDIMENTOS: use tipo="Receita" e categoria="Rendimento CDB" quando
   a mensagem descrever rendimento de investimento.
   Heurísticas: "rendeu", "rende do cdb", "rendimento do cdb".
   FONTE = "CDB 115% CDI".
</regras_globais>

<contexto_pagador_default>
${pagadorDefault}
</contexto_pagador_default>

<mapeamento_categorias>
<opcoes_validas>
${categorias.map(c => `- ${c}`).join('\n')}
</opcoes_validas>

<regras_de_inferencia>
- "ifood", "rappi", "delivery", "pedi comida" → Delivery
- "mercado", "zaffari", "carrefour", "compra do mês" → Supermercado
- "feira", "hortifruti", "ceasa" → Feira
- "açougue", "padaria" (compra estruturada) → Açougue/padaria
- "café", "padaria na rua", "cafezinho" (consumo rápido recorrente) → Padaria/café (semana)
- "lanche", "lanchinho", "pastel", "coxinha", "salgado" (consumo esporádico) → Lanches esporádicos
- "salão", "barba", "manicure", "cabelo" → Cuidado pessoal
- "uber", "99", "taxi" (da luana pro trabalho) → Uber Luana
- "gasolina", "combustível" (moto do gustavo) → Combustível moto
- "netflix", "disney", "prime", "max", "globoplay" → Streaming
- "shopee", "mercado livre", "aliexpress" → Compras Shopee/ML
- "restaurante", "jantar fora" (casal) → Restaurante casal
- "luz", "cemig", "rge", "cpfl" → Luz
- "água", "saneamento" → Água
- "condomínio" → Condomínio
- "financiamento caixa", "parcela casa" → Financ. Caixa
- "vasco" (financiamento da entrada) → Financ. Vasco
- "salário" + pagador → Salário Gustavo ou Salário Luana
- "aportei", "mandei pro cdb" → categoria=CDB 115% CDI (tipo=Transferência)
- "resgatei", "tirei do cdb" → categoria=Conta Gustavo (tipo=Transferência, fonte=CDB 115% CDI)
- "rendeu", "rendimento cdb" → categoria=Rendimento CDB (tipo=Receita, fonte=CDB 115% CDI)
</regras_de_inferencia>
</mapeamento_categorias>

<mapeamento_fontes>
<opcoes_validas>
${fontes.map(f => `- ${f}`).join('\n')}
</opcoes_validas>

<regras_de_inferencia>
- "cartão" ou "nubank" + pagador Gustavo → Nubank Gu
- "cartão" ou "nubank" + pagador Luana → Nubank Lu
- "mercado pago", "mp" → Mercado Pago Gu
- "pix", "débito", "conta" + pagador → Conta Gustavo ou Conta Luana
- "vr", "va", "vale refeição", "vale alimentação" → VR/VA Gustavo
- "auxílio combustível", "aux combustível" → Aux. Combustível Gustavo
- Sem pista → Outro
- Receita de salário/VR/aux (tipo=Receita) → Folha (crédito em conta)
- Aporte ao CDB: fonte=Conta Gustavo (ou Conta Luana)
- Resgate do CDB: fonte=CDB 115% CDI
- Rendimento CDB: fonte=CDB 115% CDI
</regras_de_inferencia>
</mapeamento_fontes>

<formato_saida>
JSON com os campos: tipo, valor, categoria, pagador, fonte, descricao, error.
O schema é aplicado pela API — preencha todos os campos obrigatórios,
respeitando os tipos e as opções válidas dos mapeamentos acima.
</formato_saida>

<exemplos>
<exemplo_1>
Entrada: "52 ifood luana nubank"
Saída: {"tipo":"Despesa","valor":52,"categoria":"Delivery","pagador":"Luana","fonte":"Nubank Lu","descricao":"","error":null}
</exemplo_1>

<exemplo_2>
Entrada: "gastei 35,50 no café" (contexto: pagador default = Gustavo)
Saída: {"tipo":"Despesa","valor":35.50,"categoria":"Padaria/café (semana)","pagador":"Gustavo","fonte":"Nubank Gu","descricao":"","error":null}
</exemplo_2>

<exemplo_3>
Entrada: "1910 financiamento caixa" (contexto: pagador default = Gustavo)
Saída: {"tipo":"Despesa","valor":1910,"categoria":"Financ. Caixa","pagador":"Gustavo","fonte":"Conta Gustavo","descricao":"","error":null}
</exemplo_3>

<exemplo_4>
Entrada: "420,75 mercado zaffari vr" (contexto: pagador default = Gustavo)
Saída: {"tipo":"Despesa","valor":420.75,"categoria":"Supermercado","pagador":"Gustavo","fonte":"VR/VA Gustavo","descricao":"Zaffari","error":null}
</exemplo_4>

<exemplo_5>
Entrada: "recebi salário 3800 luana"
Saída: {"tipo":"Receita","valor":3800,"categoria":"Salário Luana","pagador":"Luana","fonte":"Folha (crédito em conta)","descricao":"","error":null}
</exemplo_5>

<exemplo_6>
Entrada: "aportei 500 no cdb" (contexto: pagador default = Gustavo)
Saída: {"tipo":"Transferência","valor":500,"categoria":"CDB 115% CDI","pagador":"Gustavo","fonte":"Conta Gustavo","descricao":"","error":null}
</exemplo_6>

<exemplo_7>
Entrada: "resgatei 300 do cdb" (contexto: pagador default = Gustavo)
Saída: {"tipo":"Transferência","valor":300,"categoria":"Conta Gustavo","pagador":"Gustavo","fonte":"CDB 115% CDI","descricao":"","error":null}
</exemplo_7>

<exemplo_8>
Entrada: "o cdb rendeu 45,80 esse mês" (contexto: pagador default = Gustavo)
Saída: {"tipo":"Receita","valor":45.80,"categoria":"Rendimento CDB","pagador":"Gustavo","fonte":"CDB 115% CDI","descricao":"","error":null}
</exemplo_8>

<exemplo_9>
Entrada: "gastei algumas coisas" (contexto: pagador default = Gustavo)
Saída: {"tipo":"Despesa","valor":0,"categoria":"Outros","pagador":"Gustavo","fonte":"Outro","descricao":"","error":"Qual o valor e a categoria?"}
</exemplo_9>

<exemplo_10>
Entrada: "50 ração do cachorro pix" (contexto: pagador default = Gustavo)
Saída: {"tipo":"Despesa","valor":50,"categoria":"Outros","pagador":"Gustavo","fonte":"Conta Gustavo","descricao":"ração cachorro","error":"Não encontrei categoria exata. Confirma 'Outros' ou manda a categoria?"}
</exemplo_10>
</exemplos>`;
}

// ============================================================
// VALIDAÇÃO PÓS-PARSE — rede de segurança
// ============================================================
function validateParse(p) {
    const { categorias, fontes, pagadores } = getListsCached();

    if (typeof p.valor !== 'number' || p.valor <= 0) {
        return { ok: false, message: `Valor inválido: "${p.valor}". Precisa ser um número maior que zero.` };
    }
    if (!['Despesa', 'Receita', 'Transferência'].includes(p.tipo)) {
        return { ok: false, message: `Tipo "${p.tipo}" inválido.` };
    }
    if (!pagadores.includes(p.pagador)) {
        return { ok: false, message: `Pagador "${p.pagador}" inválido. Use Gustavo ou Luana.` };
    }
    if (!fontes.includes(p.fonte)) {
        return { ok: false, message: `Fonte "${p.fonte}" não existe. Ex: Nubank Gu, Conta Gustavo, CDB 115% CDI.` };
    }
    // For Transferência, categoria is the destination — can be a category OR a fonte (account)
    if (p.tipo === 'Transferência') {
        if (!categorias.includes(p.categoria) && !fontes.includes(p.categoria)) {
            return { ok: false, message: `Destino "${p.categoria}" inválido para Transferência. Use uma conta ou investimento válido.` };
        }
        if (p.fonte === p.categoria) {
            return { ok: false, message: `Transferência inválida: origem e destino são iguais (${p.fonte}).` };
        }
    } else {
        if (!categorias.includes(p.categoria)) {
            return { ok: false, message: `Categoria "${p.categoria}" não existe. Ex: Delivery, Supermercado, Financ. Caixa.` };
        }
    }
    return { ok: true };
}

// ============================================================
// LEITURA DAS LISTAS (CACHE)
// ============================================================
function getListsCached() {
    const cache = CacheService.getScriptCache();
    const cached = cache.get('lists_v1');
    if (cached) return JSON.parse(cached);

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const cfg = ss.getSheetByName(CONFIG.SHEETS.config);

    // Pagadores: B11:B... / Fontes: C11:C... / Categorias despesa: E11:E... / Receita: I11:I...
    const pagadores = cfg.getRange('B11:B20').getValues().flat().filter(String);
    const fontes = cfg.getRange('C11:C35').getValues().flat().filter(String);
    const catDesp = cfg.getRange('E11:E60').getValues().flat().filter(String);
    const catRec = cfg.getRange('I11:I20').getValues().flat().filter(String);

    const lists = {
        pagadores,
        fontes,
        categorias: [...catDesp, ...catRec]
    };

    cache.put('lists_v1', JSON.stringify(lists), 3600); // 1 hora
    return lists;
}

// ============================================================
// COMANDOS
// ============================================================
function handleCommand(text, chatId, user) {
    const cmd = text.split(/\s+/)[0].toLowerCase();
    const arg = text.substring(cmd.length).trim();

    switch (cmd) {
        case '/start':
        case '/help':
            return sendTelegram(chatId, helpText());
        case '/resumo':
            return sendTelegram(chatId, getResumoMes());
        case '/saldo':
            return sendTelegram(chatId, arg ? getSaldoCategoria(arg) : getSaldoTop5());
        case '/hoje':
            return sendTelegram(chatId, getLancamentosHoje());
        case '/desfazer':
            return desfazerUltimo(chatId, user);
        case '/transferir':
            return sendTelegram(chatId, getAcertoMes());
        case '/invest':
        case '/investimentos':
            return sendTelegram(chatId, getInvestSaldo());
        case '/manter':
            return handleManter(chatId, user);
        case '/parcela':
            return handleParcela(arg, chatId, user);
        case '/parcelas':
            return sendTelegram(chatId, getParcelasAtivas());
        case '/fatura':
            return sendTelegram(chatId, getFatura(arg));
        default:
            return sendTelegram(chatId, `Comando "${cmd}" não reconhecido. Mande /help pra ver os comandos.`);
    }
}

function helpText() {
    return `🤖 *Bot Financeiro*

*Lançar gasto:* mande no formato livre
• "52 ifood luana nubank"
• "gastei 35 no café"
• "1910 financiamento caixa"

*Investimentos:*
• "aportei 500 no cdb"
• "resgatei 300 do cdb"
• "cdb rendeu 45,80"

*Parcelas:*
/parcela 360 3 nubank calçado — cadastra 3x de R$ 120

*Comandos:*
/resumo — visão geral do mês
/saldo — top 5 categorias
/saldo calçado — categoria específica (provisão: mostra envelope acumulado)
/hoje — lançamentos de hoje
/invest — saldo do CDB
/fatura — faturas dos cartões
/parcelas — parcelas ativas
/manter — registrar acerto mensal (Luana)
/transferir — quanto Luana transfere
/desfazer — apaga o último lançamento
/help — esta ajuda`;
}

function getResumoMes() {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const dash = ss.getSheetByName(CONFIG.SHEETS.dashboard);

    const rendaReal = dash.getRange('E8').getValue();
    const rendaPlan = dash.getRange('D8').getValue();
    const gastoReal = dash.getRange('E9').getValue();
    const gastoPlan = dash.getRange('D9').getValue();
    const sobra = dash.getRange('E10').getValue();
    const transfere = dash.getRange('E16').getValue();
    const gastoGustavo = dash.getRange('C21').getValue();
    const gastoLuana = dash.getRange('C22').getValue();

    const pctGasto = gastoPlan > 0 ? Math.round((gastoReal / gastoPlan) * 100) : 0;
    const mes = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'MMMM/yyyy');

    return `📊 *Resumo de ${mes}*

💵 Renda: ${formatBRL(rendaReal)} de ${formatBRL(rendaPlan)} planejado
💸 Gastos: ${formatBRL(gastoReal)} de ${formatBRL(gastoPlan)} planejado (${pctGasto}%)
💰 Sobra real: ${formatBRL(sobra)}

👤 Por pagador:
  • Gustavo: ${formatBRL(gastoGustavo)}
  • Luana: ${formatBRL(gastoLuana)}

💸 Acerto:
Luana transfere ${formatBRL(transfere)} pro Gustavo`;
}

function getSaldoCategoria(nomeAprox) {
    const { categorias } = getListsCached();
    const n = nomeAprox.toLowerCase();
    const match = categorias.find(c => c.toLowerCase().includes(n));

    if (!match) {
        const sugestoes = categorias.filter(c =>
            n.split(' ').some(w => w.length > 2 && c.toLowerCase().includes(w))
        ).slice(0, 5);
        return `Categoria "${nomeAprox}" não encontrada.${sugestoes.length ? '\n\nTalvez:\n' + sugestoes.map(s => '• ' + s).join('\n') : ''}`;
    }

    if (PROVISAO_CATS.includes(match)) {
        const s = getAccumulatedSaldo(match);
        if (!s) return `Categoria ${match} sem planejado configurado.`;
        const pct = s.creditoTotal > 0 ? Math.round((s.gastoHistorico / s.creditoTotal) * 100) : 0;
        const alerta = s.acumulado < 0 ? ' ⚠️ NEGATIVO' : '';
        return `📦 *${match}* (provisão)\nPlan/mês: ${formatBRL(s.planejado)} × ${s.meses} meses\nCrédito acumulado: ${formatBRL(s.creditoTotal)}\nGasto histórico: ${formatBRL(s.gastoHistorico)} (${pct}%)\nSaldo envelope: ${formatBRL(s.acumulado)}${alerta}`;
    }

    const s = getCategorySaldo(match);
    if (!s) return `Categoria ${match} sem planejado.`;
    const pct = s.planejado > 0 ? Math.round((s.gasto / s.planejado) * 100) : 0;
    const restante = s.planejado - s.gasto;
    return `📊 *${match}*\nPlanejado: ${formatBRL(s.planejado)}\nGasto: ${formatBRL(s.gasto)} (${pct}%)\nRestante: ${formatBRL(restante)}`;
}

function getSaldoTop5() {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const dash = ss.getSheetByName(CONFIG.SHEETS.dashboard);
    // Tabela de categorias começa na linha 26 até ~64
    const values = dash.getRange('A26:G64').getValues();
    const arr = values
        .map(r => ({ cat: r[1], plan: r[3], gasto: r[4], pct: r[6] }))
        .filter(r => r.cat && typeof r.gasto === 'number' && r.gasto > 0)
        .sort((a, b) => b.gasto - a.gasto)
        .slice(0, 5);

    if (!arr.length) return 'Nenhum gasto registrado ainda no mês.';

    const linhas = arr.map(r => {
        const p = r.plan > 0 ? Math.round((r.gasto / r.plan) * 100) : 0;
        const al = p > 100 ? ' ⚠️' : p > 80 ? ' ⚡' : '';
        return `• ${r.cat}: ${formatBRL(r.gasto)} de ${formatBRL(r.plan)} (${p}%)${al}`;
    });

    return `📊 *Top 5 categorias do mês*\n\n${linhas.join('\n')}`;
}

function getLancamentosHoje() {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SHEETS.lancamentos);
    const last = sheet.getLastRow();
    if (last < 6) return 'Nenhum lançamento hoje.';

    const rows = sheet.getRange(6, 1, last - 5, 8).getValues();
    const hoje = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy');
    const doDia = rows.filter(r => r[0] && Utilities.formatDate(r[0], CONFIG.TIMEZONE, 'dd/MM/yyyy') === hoje);

    if (!doDia.length) return `Nenhum lançamento em ${hoje}.`;

    const total = doDia.filter(r => r[1] === 'Despesa').reduce((a, r) => a + r[2], 0);
    const linhas = doDia.map(r => {
        const icon = r[1] === 'Receita' ? '💵' : '💸';
        return `${icon} ${formatBRL(r[2])} — ${r[3]} (${r[4]})`;
    });
    return `📅 *Hoje (${hoje})*\n\n${linhas.join('\n')}\n\n*Total gasto hoje:* ${formatBRL(total)}`;
}

function desfazerUltimo(chatId, user) {
    const props = PropertiesService.getScriptProperties();
    const lastRow = props.getProperty('last_row_' + chatId);
    if (!lastRow) {
        sendTelegram(chatId, 'Nada pra desfazer. Só dá pra desfazer o último lançamento que VOCÊ fez.');
        return;
    }
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SHEETS.lancamentos);
    const row = parseInt(lastRow, 10);
    const vals = sheet.getRange(row, 1, 1, 8).getValues()[0];

    if (!vals[2]) {
        sendTelegram(chatId, 'Linha já estava vazia — nada pra desfazer.');
        return;
    }

    sheet.getRange(row, 1, 1, 8).clearContent();
    props.deleteProperty('last_row_' + chatId);
    sendTelegram(chatId, `↩️ Desfeito\n💸 ${formatBRL(vals[2])} — ${vals[3]} (${vals[4]})`);
}

function getAcertoMes() {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const dash = ss.getSheetByName(CONFIG.SHEETS.dashboard);
    const recebeu = dash.getRange('E13').getValue();
    const gastou = dash.getRange('E14').getValue();
    const reserva = dash.getRange('E15').getValue();
    const transfere = dash.getRange('E16').getValue();
    return `💸 *Acerto do mês*\n\nLuana recebeu: ${formatBRL(recebeu)}\n(-) Gastou: ${formatBRL(gastou)}\n(-) Reserva pessoal: ${formatBRL(reserva)}\n= Transfere: *${formatBRL(transfere)}*`;
}

function getInvestSaldo() {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const inv = ss.getSheetByName(CONFIG.SHEETS.investimentos);
    if (!inv) return 'Aba Investimentos não encontrada. Configure a planilha primeiro.';

    const row = inv.getRange('A4:F4').getValues()[0];
    const [ativo, saldoInicial, aportes, resgates, rendimentos, saldoAtual] = row;
    if (!ativo) return 'Nenhum investimento cadastrado na aba Investimentos.';

    const mes = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'MMMM/yyyy');
    return `📈 *${ativo}*\n\nSaldo atual: *${formatBRL(saldoAtual)}*\n\n📅 ${mes}:\n  Aportes: ${formatBRL(aportes)}\n  Resgates: ${formatBRL(resgates)}\n  Rendimentos: ${formatBRL(rendimentos)}\n\nSaldo inicial total: ${formatBRL(saldoInicial)}`;
}

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
        date, 'Transferência', transfere, 'Conta Gustavo',
        user.pagador, 'Conta Luana', 'Acerto mensal', date
    ]]);
    sheet.getRange(newRow, 1).setNumberFormat('dd/mm/yyyy');
    sheet.getRange(newRow, 3).setNumberFormat('"R$ "#,##0.00');
    sheet.getRange(newRow, 8).setNumberFormat('dd/mm/yyyy');

    PropertiesService.getScriptProperties()
        .setProperty('last_row_' + chatId, String(newRow));

    sendTelegram(chatId, `✅ Acerto registrado!\n💸 ${formatBRL(transfere)}\n📤 Conta Luana → Conta Gustavo\n📅 ${Utilities.formatDate(date, CONFIG.TIMEZONE, 'dd/MM/yyyy')}`);
}

function getParcelasAtivas() {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SHEETS.parcelas);
    if (!sheet) return 'Aba Parcelas não encontrada.';

    const lastRow = sheet.getLastRow();
    if (lastRow < 4) return 'Nenhuma parcela cadastrada.';

    const rows = sheet.getRange(4, 1, lastRow - 3, 8).getValues();
    const ativas = rows.filter(r => r[0] && String(r[7]).toLowerCase() === 'ativa');

    if (!ativas.length) return '✅ Sem parcelas ativas no momento.';

    const linhas = ativas.map(r => {
        const restantes = r[3] - r[2];
        return `• ${r[0]}: ${formatBRL(r[1])}/mês (${r[2]}/${r[3]}, ${restantes} restantes) — ${r[4]}`;
    });

    const totalMensal = ativas.reduce((sum, r) => sum + (typeof r[1] === 'number' ? r[1] : 0), 0);
    return `📋 *Parcelas Ativas*\n\n${linhas.join('\n')}\n\n*Total mensal:* ${formatBRL(totalMensal)}`;
}

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

    const { fontes, categorias } = getListsCached();

    let cartao = fontes.find(f => f.toLowerCase().includes(cartaoRaw));
    if (!cartao) {
        if (cartaoRaw.includes('lu')) cartao = 'Nubank Lu';
        else if (cartaoRaw.includes('mp') || cartaoRaw.includes('mercado')) cartao = 'Mercado Pago Gu';
        else cartao = user.pagador === 'Luana' ? 'Nubank Lu' : 'Nubank Gu';
    }

    const categoria = categorias.find(c => c.toLowerCase().includes(catRaw.toLowerCase())) || 'Outros';
    const valorParcela = Math.round((valorTotal / nParcelas) * 100) / 100;

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const parcelasSheet = ss.getSheetByName(CONFIG.SHEETS.parcelas);
    const date = new Date();
    const parcelaRow = Math.max(parcelasSheet.getLastRow() + 1, 4);

    parcelasSheet.getRange(parcelaRow, 1, 1, 8).setValues([[
        catRaw || categoria, valorParcela, 1, nParcelas, cartao, categoria, date, 'Ativa'
    ]]);
    parcelasSheet.getRange(parcelaRow, 2).setNumberFormat('"R$ "#,##0.00');
    parcelasSheet.getRange(parcelaRow, 7).setNumberFormat('dd/mm/yyyy');

    const lancSheet = ss.getSheetByName(CONFIG.SHEETS.lancamentos);
    const lancRow = lancSheet.getLastRow() + 1;
    lancSheet.getRange(lancRow, 1, 1, 8).setValues([[
        date, 'Despesa', valorParcela, categoria, user.pagador, cartao,
        `Parcela 1/${nParcelas}`, date
    ]]);
    lancSheet.getRange(lancRow, 1).setNumberFormat('dd/mm/yyyy');
    lancSheet.getRange(lancRow, 3).setNumberFormat('"R$ "#,##0.00');
    lancSheet.getRange(lancRow, 8).setNumberFormat('dd/mm/yyyy');

    PropertiesService.getScriptProperties()
        .setProperty('last_row_' + chatId, String(lancRow));

    sendTelegram(chatId, `✅ Parcela cadastrada!\n${catRaw || categoria}: ${formatBRL(valorParcela)}/mês × ${nParcelas}x\nCartão: ${cartao}\nParcela 1/${nParcelas} lançada em ${Utilities.formatDate(date, CONFIG.TIMEZONE, 'dd/MM/yyyy')}`);
}

function getFatura(arg) {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const dash = ss.getSheetByName(CONFIG.SHEETS.dashboard);

    const cartoes = [
        { nome: 'Nubank Gu', row: 90 },
        { nome: 'Nubank Lu', row: 91 },
        { nome: 'Mercado Pago Gu', row: 92 }
    ];

    if (arg) {
        const n = arg.toLowerCase();
        const found = cartoes.find(c => c.nome.toLowerCase().includes(n));
        if (!found) return `Cartão "${arg}" não encontrado. Opções: nubank gu, nubank lu, mp`;
        const total = dash.getRange(`E${found.row}`).getValue();
        return `💳 *${found.nome}*\nFatura do mês: ${formatBRL(total)}`;
    }

    const linhas = cartoes.map(c => {
        const total = dash.getRange(`E${c.row}`).getValue();
        return `• ${c.nome}: ${formatBRL(total)}`;
    });
    const totalGeral = cartoes.reduce((sum, c) => sum + (dash.getRange(`E${c.row}`).getValue() || 0), 0);
    const mes = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'MMMM/yyyy');
    return `💳 *Faturas ${mes}*\n\n${linhas.join('\n')}\n\n*Total cartões:* ${formatBRL(totalGeral)}`;
}

// ============================================================
// HELPERS
// ============================================================
function monthsDiff(d1, d2) {
    return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()) + 1;
}

function getAccumulatedSaldo(categoria) {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const cfg = ss.getSheetByName(CONFIG.SHEETS.config);
    const dataInicio = cfg.getRange('C7').getValue();
    if (!dataInicio) return null;

    const meses = monthsDiff(new Date(dataInicio), new Date());
    const dash = ss.getSheetByName(CONFIG.SHEETS.dashboard);

    // Find planned amount for this category in Dashboard (B and D columns, rows 26-130)
    const dashData = dash.getRange('B26:D130').getValues();
    const dashRow = dashData.find(r => r[0] === categoria);
    const planejado = dashRow ? dashRow[2] : 0;
    if (!planejado) return null;

    // Sum all historical spending for this category since sistema start
    const sheet = ss.getSheetByName(CONFIG.SHEETS.lancamentos);
    const lastRow = sheet.getLastRow();
    if (lastRow < 6) return { planejado, meses, creditoTotal: planejado * meses, gastoHistorico: 0, acumulado: planejado * meses };

    const lancData = sheet.getRange(6, 1, lastRow - 5, 8).getValues();
    const gastoHistorico = lancData
        .filter(r => r[3] === categoria && r[1] === 'Despesa' && r[0] >= dataInicio)
        .reduce((sum, r) => sum + (typeof r[2] === 'number' ? r[2] : 0), 0);

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

function sendTelegram(chatId, text) {
    UrlFetchApp.fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/sendMessage`, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown'
        }),
        muteHttpExceptions: true
    });
}

function formatBRL(n) {
    if (typeof n !== 'number') return 'R$ 0,00';
    return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

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
            'SUMIFS(Lançamentos!C:C,Lançamentos!B:B,"Transferência",Lançamentos!D:D,A4,Lançamentos!F:F,"Saldo Inicial")');
        // C4: aportes do mês (exclui Saldo Inicial)
        inv.getRange('C4').setFormula(
            'SUMIFS(Lançamentos!C:C,Lançamentos!B:B,"Transferência",Lançamentos!D:D,A4,Lançamentos!A:A,">="&Dashboard!$B$4,Lançamentos!A:A,"<="&Dashboard!$D$4,Lançamentos!F:F,"<>Saldo Inicial")');
        // D4: resgates do mês (fonte=CDB)
        inv.getRange('D4').setFormula(
            'SUMIFS(Lançamentos!C:C,Lançamentos!B:B,"Transferência",Lançamentos!F:F,A4,Lançamentos!A:A,">="&Dashboard!$B$4,Lançamentos!A:A,"<="&Dashboard!$D$4)');
        // E4: rendimentos do mês
        inv.getRange('E4').setFormula(
            'SUMIFS(Lançamentos!C:C,Lançamentos!B:B,"Receita",Lançamentos!D:D,"Rendimento CDB",Lançamentos!A:A,">="&Dashboard!$B$4,Lançamentos!A:A,"<="&Dashboard!$D$4)');
        // F4: saldo acumulado total
        inv.getRange('F4').setFormula(
            'SUMIFS(Lançamentos!C:C,Lançamentos!B:B,"Transferência",Lançamentos!D:D,A4)' +
            '-SUMIFS(Lançamentos!C:C,Lançamentos!B:B,"Transferência",Lançamentos!F:F,A4)' +
            '+SUMIFS(Lançamentos!C:C,Lançamentos!B:B,"Receita",Lançamentos!D:D,"Rendimento CDB")');
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
                `SUMIFS(Lançamentos!C:C,Lançamentos!B:B,"Despesa",Lançamentos!D:D,"${cat}",Lançamentos!E:E,"Gustavo",Lançamentos!A:A,">="&$B$4,Lançamentos!A:A,"<="&$D$4)`);
            dash.getRange(r, 6).setFormula(`D${r}-E${r}`);
            dash.getRange(r, 7).setFormula(`IF(D${r}=0,0,E${r}/D${r})`);
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
                `SUMIFS(Lançamentos!C:C,Lançamentos!B:B,"Despesa",Lançamentos!D:D,"${cat}",Lançamentos!E:E,"Luana",Lançamentos!A:A,">="&$B$4,Lançamentos!A:A,"<="&$D$4)`);
            dash.getRange(r, 6).setFormula(`D${r}-E${r}`);
            dash.getRange(r, 7).setFormula(`IF(D${r}=0,0,E${r}/D${r})`);
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
                `SUMIFS(Lançamentos!C:C,Lançamentos!B:B,"Despesa",Lançamentos!F:F,B${r},Lançamentos!H:H,">="&$B$4,Lançamentos!H:H,"<="&$D$4)`);
            dash.getRange(r, 4).setValue(0);
            dash.getRange(r, 5).setFormula(`C${r}+D${r}`);
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
                `SUMIFS(Lançamentos!C:C,Lançamentos!B:B,"Despesa",Lançamentos!D:D,B${r},Lançamentos!A:A,">="&Config!$C$7)`);
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

function testParse() {
    _loadSecrets();
    const samples = [
        '52 ifood luana cartão',
        'gastei 35 no café',
        '1910 financiamento caixa',
        '420 mercado zaffari vr'
    ];
    for (const s of samples) {
        console.log('IN:', s);
        try {
            console.log('OUT:', JSON.stringify(parseWithOpenAI(s, 'Gustavo')));
        } catch (e) {
            console.log('ERR:', e.message);
        }
    }
}

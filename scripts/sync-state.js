const fs = require('fs');
const readline = require('readline');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const outPath = path.join(__dirname, '..', '.ai_shared', 'SPREADSHEET_STATE.md');

// Simple .env parser
function loadEnv() {
    if (!fs.existsSync(envPath)) return {};
    const content = fs.readFileSync(envPath, 'utf8');
    return content.split('\n').reduce((acc, line) => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) acc[match[1].trim()] = match[2].trim();
        return acc;
    }, {});
}

function saveEnv(env) {
    const content = Object.keys(env).map(k => `${k}=${env[k]}`).join('\n');
    fs.writeFileSync(envPath, content);
}

function askQuestion(query) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(query, ans => { rl.close(); resolve(ans.trim()); }));
}

function validateExportedState(text, contentType) {
    const trimmed = text.trim();

    if (/text\/html/i.test(contentType || '') || /^<!doctype html/i.test(trimmed) || /^<html/i.test(trimmed)) {
        if (text.includes('doGet')) {
            throw new Error('Apps Script returned an HTML error: doGet was not found in the current deployment.');
        }
        throw new Error('Apps Script returned HTML instead of the spreadsheet state.');
    }

    if (text.includes('Acesso Negado')) {
        throw new Error('Acesso Negado: SHEETS_SYNC_SECRET is incorrect or SYNC_SECRET is missing in Apps Script.');
    }

    if (!trimmed.startsWith('# Spreadsheet State')) {
        throw new Error('Unexpected response: it does not look like a valid spreadsheet snapshot.');
    }
}

async function run() {
    let env = loadEnv();
    let updated = false;

    console.log('=== Sincronizador de Estado da Planilha (Bot Financeiro) ===\n');

    if (!env.SHEETS_SYNC_URL) {
        console.log('🚨 Web App URL não configurada.');
        console.log('   (Vá no Apps Script > Implantar > Gerenciar Implantações > Copiar URL)');
        env.SHEETS_SYNC_URL = await askQuestion('🔗 Cole a URL do Web App: ');
        updated = true;
    }
    
    if (!env.SHEETS_SYNC_SECRET) {
        console.log('🚨 Token de sincronização (SYNC_SECRET) não configurado.');
        env.SHEETS_SYNC_SECRET = await askQuestion('🔑 Cole o SYNC_SECRET (definido nas Propriedades do Apps Script): ');
        updated = true;
    }

    if (updated) {
        saveEnv(env);
        console.log('✅ Configurações salvas em .env (ignorado pelo git)\n');
    }

    console.log('🔄 Baixando estado da planilha...');
    
    const url = `${env.SHEETS_SYNC_URL}?action=exportState&token=${env.SHEETS_SYNC_SECRET}`;
    
    try {
        const response = await fetch(url, { redirect: 'follow' });
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        
        const text = await response.text();
        
        validateExportedState(text, response.headers.get('content-type'));

        // Garante que o diretório existe
        const dir = path.dirname(outPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        fs.writeFileSync(outPath, text.trimEnd() + '\n');
        console.log(`✅ Sucesso! Estado da planilha atualizado e salvo em:`);
        console.log(`   👉 ${outPath}`);
        
    } catch(err) {
        console.error('\n❌ Erro ao sincronizar:', err.message);
        console.log('Dica: Verifique se a URL do Web App é a versão final (Executável) e se o seu Token está correto.');
        process.exitCode = 1;
    }
}

run();

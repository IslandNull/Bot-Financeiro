# Google Apps Script Expert Skill

Regras e melhores práticas para desenvolvimento no ambiente GAS.

## 🚀 Performance
- **Batch Operations:** Use `getValues()` e `setValues()` em vez de `getValue()` em loops.
- **PropertiesService:** Use para persistir estados e segredos (CacheService para dados voláteis).
- **Triggers:** Gerencie triggers programaticamente para evitar duplicatas em webhooks.

## 🛠 Padrões de Código
- **Global Scope:** Minimize código no escopo global para acelerar o tempo de inicialização.
- **Error Handling:** Sempre use `try-catch` em chamadas de API externas (`UrlFetchApp`).
- **JSDoc:** Obrigatório para que o autocomplete do editor do Google e as IAs entendam os tipos.

## ⚠️ Limitações
- Timeout de 6 minutos para execuções normais.
- Limite de 30 chamadas simultâneas.

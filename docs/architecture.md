# Arquitetura do Intranet Organife

## Visão geral

O projeto é composto por uma extensão de navegador Manifest V3, um backend Express executado em Node.js, um Dashboard administrativo servido pelo backend e uma camada de persistência local/operacional.

```text
Extensão MV3
  ├── Service worker: background.js + background-*.js
  ├── Interfaces: popup, options, identity, intranet, blocked
  └── Kanban: kanban.js, kanban-overlay.js, kanban-core.js
          │ HTTP + WebSocket
          ▼
Backend Express / Node.js
  ├── app.js: composição e inicialização
  ├── auth.js: autenticação e papéis
  ├── realtime.js: WebSocket e salas
  ├── log-store.js: NDJSON e retenção
  ├── kanban-store.js: sql.js e snapshots
  ├── state.js: estado JSON
  └── routes/: contratos HTTP por domínio
          │
          ▼
Dashboard administrativo
  ├── dashboard-auth.js
  ├── dashboard-logs.js
  ├── dashboard-monitoring.js
  ├── dashboard-config.js
  └── dashboard-services.js
```

## Fronteiras de execução

A extensão executa no contexto do navegador e usa APIs `chrome`/`browser`. O service worker é carregado por `importScripts`, portanto os módulos `background-*.js` compartilham o escopo global e dependem da ordem de carregamento.

O backend utiliza CommonJS e deve permanecer compatível com Node.js 14. O Dashboard é conteúdo estático servido por rotas autenticadas do backend; seus IDs, seletores e contratos de API são parte da integração.

## Fluxos principais

### Bloqueio

Eventos de navegação são observados pela extensão. O motor de bloqueio avalia exceções, identidade, janela livre, sites bloqueados, domínios permitidos, links temporários e palavras bloqueadas conforme a ordem documentada em `CLAUDE.md`. Essa ordem não deve ser alterada em tarefas de outro domínio.

### Configurações

A extensão lê configurações locais e remotas. O backend mantém o estado de configurações e publica atualizações em tempo real. Alterações de configuração devem preservar papéis, contratos HTTP e mensagens WebSocket.

### Logs

A extensão captura eventos, mantém a persistência local necessária para resiliência e envia dados ao backend conforme o contrato em `docs/contracts/logs.md`. O backend valida a ingestão e grava objetos NDJSON em arquivos diários por meio de `log-store.js`.

### Kanban

`kanban-core.js` contém regras compartilhadas de normalização. A extensão, o overlay e o backend devem consumir essas regras ou manter compatibilidade explícita com elas. O backend persiste dados por `kanban-store.js`.

## Dados operacionais

| Dado | Armazenamento | Consumidores |
|---|---|---|
| Configurações e autenticação | JSON operacional | Backend, Dashboard e extensão. |
| Logs | Arquivos NDJSON diários | Backend, Dashboard e extensão local. |
| Cards e snapshots | sql.js/SQLite e snapshots | Extensão, overlay, backend e Dashboard. |
| Logs offline | IndexedDB da extensão | Service worker e interfaces autorizadas. |

## Regra de evolução

Mudanças devem começar pelo contrato afetado, continuar pela implementação mínima e terminar com testes isolados. Não introduzir automação, polling ou sincronização automática sem decisão arquitetural registrada em `docs/decisions/`.

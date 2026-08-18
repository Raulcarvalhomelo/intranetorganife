# Instruções para `server/`

## Escopo

`server/` contém o backend Node.js, o Dashboard servido pelo backend, os testes, os contratos da API e o helper nativo. Preserve a separação entre código executável, dados operacionais e artefatos de distribuição.

## Compatibilidade

O servidor deve executar nativamente em Node.js 14 usando CommonJS. Não introduza Bun, `fetch` global sem polyfill, módulos ESM ou dependências adicionais de banco de dados.

Use os scripts e dependências declarados em `server/package.json`. O arquivo `server/bun.lock` não deve ser tratado como autorização para migrar o runtime.

## Persistência

| Tipo | Local esperado | Regra |
|---|---|---|
| Estado de configuração e sessão | `server/database/runtime-state.json` | Não deve ser alterado por testes automatizados. |
| Logs | `server/database/logs/*.ndjson` | Um objeto JSON válido por linha; escrita assíncrona. |
| Kanban | `server/database/kanban.db` e snapshots | Preservar migrações e compatibilidade dos cards. |
| Artefatos | `server/server.zip` e `serverB.zip` | Não são fonte primária do código sem instrução explícita. |

O backend deve criar os diretórios de dados antes de qualquer operação de escrita e deve manter dados operacionais fora do controle de versão conforme `.gitignore`.

## Backend e Dashboard

As rotas HTTP devem manter seus caminhos, métodos, respostas relevantes e permissões. O papel `admin` pode executar operações administrativas; o papel `viewer` deve manter acesso somente de leitura conforme os contratos existentes.

O Dashboard utiliza arquivos estáticos em `server/dashboard/`. IDs, seletores e contratos consumidos pelo HTML não devem ser renomeados sem atualizar todos os consumidores e testes.

Alterações em WebSocket devem preservar handshake, salas, heartbeat, tipos de mensagem e reconexão documentados em `docs/contracts/websocket.md`.

## Execução e validação

Antes de alterar o backend, leia `server/backend/AGENTS.md`. Antes de alterar testes, leia `server/test/AGENTS.md`. Para contratos, consulte `server/api/endpoints.json` e os documentos em `docs/contracts/`.

Uma alteração no backend deve incluir, quando aplicável, checagem de sintaxe Node 14, testes isolados, verificação de diretórios operacionais e análise do diff para confirmar que não houve mudança acidental no Dashboard, extensão ou Kanban.

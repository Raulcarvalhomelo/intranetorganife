# Instruções para `server/backend/`

## Responsabilidade

Este diretório contém a composição e os módulos internos do backend. Cada módulo deve manter uma responsabilidade única e expor interfaces explícitas em CommonJS.

| Módulo | Responsabilidade | Limite |
|---|---|---|
| `app.js` | Compor serviços, registrar middleware, routers e inicializar HTTP/WebSocket. | Não duplicar regras de persistência ou validação. |
| `auth.js` | Sessões, autenticação e autorização por papel. | Não gravar logs, estado do Kanban ou configurações diretamente. |
| `config.js` | Sanitizar ambiente, padrões e diretórios. | Não conter regras de negócio. |
| `log-store.js` | Leitura, retenção e escrita de logs NDJSON. | Não alterar autenticação, Kanban ou bloqueio. |
| `realtime.js` | WebSocket, handshake, salas, heartbeat e mensagens tipadas. | Não decidir regras de bloqueio ou persistência fora dos handlers injetados. |
| `kanban-store.js` | SQLite/sql.js, snapshots, migrações e normalização do Kanban. | Não gravar logs ou estado de autenticação. |
| `schemas.js` | Normalização e validação sem efeitos colaterais. | Não executar operações de rede ou disco. |
| `routes/` | Adaptar HTTP aos serviços por domínio. | Não duplicar lógica dos stores. |
| `state.js` | Estado persistido em JSON e defaults. | Não ser usado como armazenamento alternativo de logs novos. |

## Regras de mudança

Antes de editar `app.js`, verifique se a mudança pertence a um módulo existente. Modifique a composição somente quando for necessário conectar uma dependência ou rota.

Preserve as interfaces públicas dos routers, stores e serviços. Uma mudança de contrato deve ser refletida nos testes e em `docs/contracts/`.

O código do servidor deve ser compatível com Node.js 14. Não utilize `??`, `?.`, ESM, Bun ou APIs modernas sem polyfill aprovado pelo projeto.

## Logs

Logs devem seguir o contrato em `docs/contracts/logs.md`. A gravação deve ser assíncrona, em NDJSON, com streams reutilizados por arquivo diário. Não usar `appendFileSync`, não abrir e fechar arquivo para cada linha e não escrever diretamente no estado JSON operacional.

A ingestão por WebSocket deve validar a mensagem, rejeitar lotes inválidos sem derrubar a conexão e enviar confirmação somente quando o lote tiver sido aceito pelo fluxo de persistência.

## WebSocket

O handshake, as salas e os tipos de mensagem estão definidos em `docs/contracts/websocket.md`. Preserve heartbeat, encerramento de conexões mortas e reconexão dos clientes.

## Atividade do navegador

Antes de implementar o rastreamento agregado, leia `docs/agents/browser-activity-tracking.md`, `docs/contracts/browser-activity.md` e `docs/contracts/activity-permissions.md`. A primeira fase cobre somente atividade dentro do navegador e não autoriza agente Windows, screenshots, captura de teclado ou conteúdo de páginas.

A ingestão futura deve ser idempotente, aceitar lotes, separar eventos brutos de sessões e agregados e aplicar o escopo de equipe no backend. Não confiar em filtros enviados pelo Dashboard para autorizar acesso.

## Validação

Execute `node --check` nos arquivos alterados e os testes específicos do domínio. Use diretórios temporários para persistência em testes. Nunca corrija um teste apenas reduzindo suas asserções.

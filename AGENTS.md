# Instruções globais para agentes

## Escopo

Antes de editar qualquer arquivo, identifique o domínio afetado: extensão, backend, Dashboard, Kanban, testes ou infraestrutura. Altere somente os arquivos necessários para esse domínio e preserve os contratos dos demais.

O arquivo `CLAUDE.md` contém regras globais de negócio já existentes. Quando houver conflito, as regras de negócio e segurança documentadas nele prevalecem. As instruções específicas em `server/`, `server/backend/` e `server/test/` complementam este documento dentro de seus respectivos diretórios.

## Mapa do projeto

| Área | Local | Responsabilidade |
|---|---|---|
| Extensão | Raiz do repositório | Interface, service worker, bloqueio, identidade, rastreamento e Kanban. |
| Núcleo do Kanban | `kanban-core.js` | Normalização e regras compartilhadas do Kanban. |
| Backend | `server/backend/` | Express, autenticação, persistência, WebSocket e composição da aplicação. |
| Rotas | `server/backend/routes/` | Endpoints HTTP separados por domínio. |
| Dashboard | `server/dashboard/` | Interface administrativa e serviços de logs, monitoramento, configuração e autenticação. |
| Contratos | `server/api/endpoints.json` e `docs/contracts/` | Contratos HTTP, WebSocket e estruturas de dados. |
| Testes | `server/test/` | Testes unitários e de integração do servidor e da extensão. |

## Regras de segurança e compatibilidade

O backend deve permanecer compatível com Node.js 14 e CommonJS. Não introduza Bun, dependências de banco adicionais ou APIs globais indisponíveis no Node 14.

Não altere autenticação, permissões, motor de bloqueio, precedência das listas, janela livre de Brasília, contratos do Kanban ou schema do IndexedDB durante uma tarefa de outro domínio.

Não altere arquivos operacionais como `server/database/runtime-state.json`, `server/database/kanban.db`, logs NDJSON ou snapshots como parte de uma mudança de código. Testes devem utilizar isolamento temporário.

Não modifique contratos HTTP ou WebSocket sem atualizar a documentação correspondente em `docs/contracts/` e os testes afetados.

## Processo obrigatório

Antes da edição, inspecione o estado do Git e confirme se existem alterações locais. Leia as instruções do diretório de destino. Depois da edição, execute checagem de sintaxe, testes do domínio afetado e uma verificação de diff para confirmar que não houve alterações fora do escopo.

Não enfraqueça testes para fazer uma implementação passar. Se uma regra de negócio mudar, registre a decisão antes de alterar o teste.

## Documentação de referência

Use os seguintes documentos conforme o domínio:

- `CLAUDE.md`: regras globais e invariantes de negócio.
- `server/AGENTS.md`: regras de backend e Dashboard.
- `server/backend/AGENTS.md`: contratos dos módulos internos do backend.
- `server/test/AGENTS.md`: isolamento e execução de testes.
- `docs/architecture.md`: visão arquitetural humana.
- `docs/contracts/`: contratos executáveis e comportamentais.
- `docs/agents/browser-activity-tracking.md`: instruções da futura atividade agregada do navegador.
- `docs/contracts/browser-activity.md`: contrato de eventos e sessões de atividade do navegador.
- `docs/contracts/activity-permissions.md`: autorização e escopo de acesso à atividade.
- `docs/decisions/`: decisões arquiteturais registradas.

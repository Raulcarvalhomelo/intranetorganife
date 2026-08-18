# Instruções para `server/test/`

## Objetivo

Os testes são contratos de comportamento do sistema. Cada teste deve validar uma responsabilidade principal e preservar o comportamento real do backend, da extensão e do Dashboard.

## Isolamento

Testes de integração devem usar diretórios temporários ou fixtures isoladas. Não alterar `server/database/runtime-state.json`, `server/database/kanban.db`, logs NDJSON ou snapshots do ambiente de desenvolvimento.

Quando um teste iniciar o servidor, configure uma raiz de dados temporária e remova os artefatos ao final, inclusive em caso de falha. Mocks devem ser locais à suíte e não podem vazar estado para outros testes.

## Regras de alteração

Não enfraquecer asserções, remover validações ou alterar expectativas apenas para fazer o código passar. Um teste só deve mudar quando a regra de negócio tiver sido explicitamente alterada ou quando a expectativa original estiver comprovadamente incorreta.

Antes de criar ou alterar um teste, identifique:

1. o cenário;
2. a ação;
3. o resultado esperado;
4. o contrato que está sendo protegido;
5. o isolamento necessário.

## Execução

Use o runtime Node suportado pelo projeto e execute primeiro o teste específico do domínio alterado. Depois execute a suíte completa. Registre falhas de ambiente separadamente de falhas de comportamento.

Testes do backend devem verificar, quando aplicável, status HTTP, corpo da resposta, permissões, persistência, limpeza e efeitos colaterais. Testes WebSocket devem verificar handshake, mensagem tipada, confirmação, encerramento e reconexão quando esses comportamentos fizerem parte do cenário.

## Escopo

Um teste de bloqueio não deve depender do Kanban. Um teste de logs não deve alterar autenticação. Um teste de autenticação não deve depender de logs persistidos. Mantenha cada fixture mínima e explícita.

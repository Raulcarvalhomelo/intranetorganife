# Contrato de atividade do navegador

## Escopo

Este contrato cobre somente atividade agregada dentro do navegador. Ele não cobre aplicações Windows externas, screenshots, captura de teclado, conteúdo de documentos ou vigilância de conteúdo.

## Evento bruto

O evento bruto deve utilizar um envelope compatível com os logs atuais e acrescentar somente os campos necessários:

```json
{
  "eventId": "device-user-start-end-sequence",
  "type": "browser_activity",
  "source": "extension",
  "browserUser": "usuario",
  "deviceId": "device-id",
  "startedAt": "2026-08-18T12:00:00.000Z",
  "endedAt": "2026-08-18T12:10:00.000Z",
  "state": "active",
  "domain": "example.com",
  "durationMs": 600000,
  "extensionVersion": "1.0.0"
}
```

| Campo | Obrigatório | Regra |
|---|---:|---|
| `eventId` | Sim | Idempotente; duplicatas não podem somar tempo novamente. |
| `type` | Sim | Valor fixo `browser_activity`. |
| `source` | Sim | Valor `extension` no primeiro escopo. |
| `browserUser` | Sim | Deve seguir a identidade já existente. |
| `deviceId` | Sim | Identificador revogável; não usar segredo embutido no código. |
| `startedAt` | Sim | ISO 8601 em UTC. |
| `endedAt` | Sim | ISO 8601 em UTC e posterior ao início. |
| `state` | Sim | `active`, `idle` ou `unknown`. |
| `domain` | Condicional | Domínio normalizado e sem parâmetros sensíveis. |
| `durationMs` | Sim | Limite máximo validado no servidor. |
| `extensionVersion` | Recomendado | Permite diagnóstico de versões. |

## Regras de duração

O servidor deve validar `endedAt`, `durationMs` e limites máximos de sessão. O tempo em `idle` não deve ser classificado como ativo. Intervalos `unknown` devem permanecer separados e não podem ser convertidos automaticamente em produtividade.

Sessões sobrepostas do mesmo usuário e dispositivo devem ser deduplicadas ou divididas de maneira determinística. O cliente não é a fonte final de confiança para agregação.

## Transporte

Os eventos devem ser enviados pelo WebSocket existente em lotes. O lote deve possuir limite de quantidade e tamanho. O servidor deve responder com confirmação contendo aceitação, rejeições e identificadores duplicados, sem derrubar a conexão inteira por um evento inválido.

O cliente deve manter eventos não confirmados na fila local dentro dos limites definidos em `docs/contracts/extension-storage.md`. Reenvios devem ser seguros por causa de `eventId` idempotente.

## Persistência

Os eventos brutos devem seguir o contrato de logs em `docs/contracts/logs.md`. Sessões e agregados devem ser derivados no backend, com origem e versão do cálculo registradas quando necessário.

Não misturar automaticamente atividade do navegador com atividade de aplicação Windows. Se uma fonte futura for adicionada, ela deverá ter `source` próprio e contrato separado.

## Privacidade

Normalizar URLs para remover query strings, fragmentos e dados sensíveis quando não forem necessários. Manter uma lista de domínios excluídos ou mascarados, incluindo páginas de autenticação e categorias definidas pela política interna.

O contrato não autoriza captura de conteúdo da página. A coleta deve ser limitada ao mínimo necessário para medir intervalos de atividade.

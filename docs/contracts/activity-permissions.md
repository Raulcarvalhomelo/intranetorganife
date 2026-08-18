# Contrato de permissões para atividade

## Princípio

Ocultar uma aba ou filtro no Dashboard não é controle de acesso. Toda consulta de atividade deve ser filtrada e autorizada no backend antes da resposta.

## Papéis

| Papel | Escopo recomendado |
|---|---|
| `admin` | Configurar política, equipes, retenção e consultar dados dentro da autorização institucional. |
| `manager` | Consultar somente subordinados associados às equipes sob sua responsabilidade. |
| `viewer` | Consultar somente os dados permitidos pelo vínculo configurado; sem alterar política. |
| `employee` | Consultar os próprios dados, status de coleta e correções disponíveis. |
| `auditor` | Consultar trilhas de acesso e alterações, conforme política; não recebe acesso amplo por padrão. |

Os nomes podem ser adaptados aos papéis existentes, mas a regra de menor privilégio deve permanecer.

## Modelo de escopo

A autorização deve considerar o usuário autenticado, o papel, a equipe, a relação gestor-subordinado, o período solicitado e o tipo de dado. Um parâmetro de usuário enviado pelo cliente nunca deve ser suficiente para conceder acesso.

```text
request.user
  -> role
  -> authorizedTeams
  -> authorizedEmployees
  -> requestedPeriod
  -> dataScope
  -> backend query filter
```

## Regras obrigatórias

1. Gestor não pode consultar usuário fora de suas equipes.
2. Usuário comum só pode consultar seus próprios dados.
3. Exportações devem aplicar a mesma autorização das consultas de tela.
4. Toda consulta sensível deve gerar auditoria com ator, horário, escopo e finalidade.
5. Alteração de classificação de domínio, retenção ou política deve exigir permissão administrativa.
6. Ausência de vínculo deve resultar em conjunto vazio ou erro de autorização, nunca em consulta global.
7. IDs técnicos não devem permitir enumeração de funcionários não autorizados.

## Dados sensíveis

A interface deve preferir agregados e sessões mínimas. Conteúdo bruto de URL deve ser mascarado ou removido conforme a política de privacidade. Não exibir ranking automático ou indicador de produtividade sem definição aprovada, explicável e revisável.

## Testes

Testar autorização positiva e negativa para cada papel, equipes cruzadas, usuário inexistente, período fora do escopo, exportação, consulta direta à API e tentativa de alterar filtros no navegador.

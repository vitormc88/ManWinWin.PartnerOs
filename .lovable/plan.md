## Auditoria (só leitura) — ficha de cliente / caso Watsons

### Facto crítico: existem DOIS clientes "Watsons" na base

| id | criado | partner_uuid | licenses | contracts | contract_lines | renewals | lifecycle_events |
|---|---|---|---|---|---|---|---|
| `93bb1f8b…1981e` | 2026-05-19 | preenchido | 0 | 0 | 0 | 0 | 0 |
| `9605aaf4…4cc2` | 2026-06-26 | **null** (HQ Direct) | 1 | 1 | **0** | 0 | 0 |

Verificado por query directa. Nenhum dos dois tem `contract_lines`, `renewals` nem `lifecycle_events`, e `clients.first_installation_date` é **null** em ambos. O contrato existente (`58e25f91…`) tem `contract_start_date 2025-07-19`, `contract_end_date 2026-07-19`, `total_value 4112`, `calculated_total 0`, `contract_mode manual_legacy`, e os valores de 2027 (S&AT 2.416,68 + Hosting 720 + MwwWEB 720 = 3.856,68) existem apenas como texto livre no campo `observations`. A licença (`33966102…`) é `Business KeepIT`, `license_status active`, 4 backoffice / 10 web, `sat_active true`, `sat_start/end_date` null.

Conclusão: os números do enunciado (3 contract_lines, €4.221,60, fim 2027-07-19, first_installation 2022-07-19) **não existem na base**. A importação legacy do Watsons não foi materializada em `contract_lines`, `renewals` nem `lifecycle_events` — ficou só na cabeça do contrato e em observações.

### Causa exacta por sintoma

**(a) "No license configuration yet"** — `src/pages/ClientDetail.tsx:173` filtra `validLicenses = licenses.filter(isValidLicenseProduct)` (whitelist em `ClientDetail.tsx:112-116`: Business UseIT/KeepIT, Professional 1/2/3). "Business KeepIT" passa o filtro, logo o registo `9605aaf4` mostra a licença. O ecrã sem licença corresponde ao **cliente duplicado `93bb1f8b`, que não tem licenças**. Problema de dados (duplicado), agravado por um filtro que esconde silenciosamente qualquer licença com `product` fora da whitelist (ex.: nulo, "KeepIT", "Business") — risco real de produção.

**(b) Tudo em OTHER** — `ContractBreakdown.tsx:5-21` e a função SQL só conhecem `license, mww_web, hosting, sat, module, plugin, implementation, training, discount, other`. Na base existem **21 linhas com `line_type = 'service'`** (distribuição actual: license 40, module 25, service 21, sat 8, hosting 8, mww_web 8). `service` não está no mapa → cai em `other`. Problema de modelo/enum (não há CHECK constraint) + frontend.

**(c) ARR e Year 1 = €0** — `get_client_commercial_intelligence` (linhas 66-83 do corpo) calcula `recurring_arr`/`year1_value` **exclusivamente a partir de `contract_lines` filtrando por `cl.client_id`**. Watsons tem 0 linhas → 0. Confirmado ao correr a função: `recurring_arr 0, year1_value 0, commercial_score 40`. Nunca há fallback para `contracts.total_value` (4112) nem para `licenses`. Dois defeitos: dados por importar **e** ausência de fallback. Adicionalmente, `line_type = 'service'` não entra nem em recorrente nem em one-time → desaparece do ARR mesmo quando há linhas.

**(d) Renewal Risk High / sem data** — a mesma função procura `next_renewal_date` só na tabela `renewals` (linhas 55-61). Watsons tem 0 renewals → `next_renewal_date null` → `renewal_risk high`. Em paralelo, a UI da barra de topo usa outro caminho (`ClientDetail.tsx:184`, `contract_end_date || license_end_date`), pelo que **coexistem duas fontes de verdade divergentes** para renovação. O contrato termina 2026-07-19 (não 2027). Modelo + dados.

**(e) Customer Since errado** — `ClientSummaryBar.tsx:61` mostra literalmente `client.created_at`. Nunca lê `first_installation_date` (que é null em Watsons). Frontend + dados por importar.

**(f) Timeline toda no mesmo dia** — `ClientLifecycleTimeline.tsx:99` já usa `event.occurred_at` e o hook ordena por `occurred_at` (`useLifecycleEvents.ts:31`). Watsons tem **0 lifecycle_events**, logo o que está a ser visto são eventos derivados/sintéticos gerados a partir de `created_at` dos registos, não histórico real. Dados (backfill em falta), não formatação.

### Outros bloqueios reais a produção nestes fluxos
1. **Duplicação de clientes sem guarda** — não há unicidade por nome/VAT/partner; a ficha "certa" depende do id aberto.
2. **`contract_lines` opcional** — contratos `manual_legacy` são criados sem linhas; toda a inteligência comercial (ARR, score, upsell, breakdown) depende delas → clientes legacy aparecem sempre a €0.
3. **`calculated_total` a 0** apesar de `total_value 4112` → o badge "Needs reconciliation" ficará permanentemente errado para legacy.
4. **Sem renovação materializada** → Renewals e Analytics subavaliam exposição; alertas de risco falsos-positivos em massa.
5. **`line_type` sem constraint** e sem `billing_frequency` em 24 linhas antigas → classificação recorrente/one-time indeterminada.
6. **S&AT sem datas** (`sat_start_date`/`sat_end_date` null) apesar de `sat_active true` → regras de sincronização S&AT↔contrato não aplicáveis a legacy.
7. **Valores comerciais em texto livre** (`contracts.observations`) — informação de negócio não estruturada.

### Plano de correção proposto (a executar só após aprovação)

**Fase 1 — Semântica de linhas (frontend + SQL, sem tocar em dados)**
- Acrescentar `service` (e fallback explícito) ao mapa de `ContractBreakdown.tsx` e à classificação recorrente/one-time da função SQL.
- Fazer `line_type` desconhecido aparecer como "Other (unclassified)" visível, não silencioso.

**Fase 2 — Fallbacks determinísticos na inteligência comercial**
- `recurring_arr`/`year1_value`: se não houver `contract_lines`, usar `contracts.total_value` do contrato activo, marcando `confidence = 'low'` e um sinal "estimated from contract header".
- `next_renewal_date`: fallback para `contract_end_date` → `license_end_date`, com `renewal_risk` derivado da distância à data em vez de "high" por ausência de registo.
- Unificar a UI para consumir apenas esta fonte (remover o cálculo paralelo em `ClientDetail.tsx:184`).

**Fase 3 — Ficha do cliente**
- `Customer Since` = `first_installation_date ?? created_at`, com nota quando é fallback.
- Licenças fora da whitelist deixam de ser escondidas: passam a listar com aviso "needs review".

**Fase 4 — Qualidade de dados (migração controlada, sem inventar valores)**
- Reconciliar os dois Watsons (merge manual assistido, não automático).
- Gerar `contract_lines` a partir dos valores hoje só em `observations` — requer confirmação humana dos montantes.
- Materializar renovação e backfill de `lifecycle_events` com `occurred_at` histórico.

### Perguntas antes de avançar
1. Confirmas que o Watsons "bom" é `9605aaf4…` e que o `93bb1f8b…` deve ser eliminado/arquivado?
2. O contrato termina 2026-07-19 (base) ou 2027-07-19 (o que observaste)? A diferença muda o plano de renovação.
3. Queres que as fases 1-3 (código) avancem já, deixando a fase 4 (dados) para uma sessão separada com confirmação linha a linha?

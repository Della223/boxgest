/*
# CarCenter PRO Finance - Deduction rate on revenue main categories

## Overview
Localiza sales are always anticipated (D+2) at a receivables-anticipation
fee of 2.8%/month, which works out to 5.42% of each sale's value. This fee
reduces how much was actually received for the sale — it is a DEDUCTION
from gross revenue (same accounting nature as a sales tax), never an
expense. It must never be entered into `expenses`/despesas — doing so would
subtract it from the result twice (once as a revenue deduction, once as an
expense).

## Design
`deduction_rate` is a fraction (0–1) stored on `revenue_main_categories`,
editable by the user per category from Configurações. Today only "Localiza"
has a non-zero rate; every other category defaults to 0 (no behavior
change). "Valor Líquido" is never persisted anywhere — it is always
Bruto × (1 − deduction_rate), computed at read time in the application
(DRE, Dashboard, Home, Comercial, Relatórios), so there is exactly one
source of truth (the gross amount + the category's rate) and nothing to
fall out of sync.
*/

ALTER TABLE revenue_main_categories
  ADD COLUMN IF NOT EXISTS deduction_rate numeric(6,4) NOT NULL DEFAULT 0
  CHECK (deduction_rate >= 0 AND deduction_rate < 1);

COMMENT ON COLUMN revenue_main_categories.deduction_rate IS
  'Fração (0-1) deduzida da receita bruta desta categoria para chegar à Receita Líquida (ex.: taxa de antecipação de recebíveis). Calculado em tempo de leitura em toda a aplicação — nunca lançar como despesa.';

UPDATE revenue_main_categories
SET deduction_rate = 0.0542
WHERE regexp_replace(lower(name), '\s+', '', 'g') = 'localiza';

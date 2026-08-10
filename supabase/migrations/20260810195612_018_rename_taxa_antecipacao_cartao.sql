/*
# CarCenter PRO Finance - Rename "Taxa Antecipação" expense subcategory

## Overview
The expense subcategory "Taxa Antecipação" (under "Vendas" / Operacional cost
center, seeded in migration 002) refers to the card-machine (maquininha)
anticipation fee — a manual, sporadic, variable-rate expense entry. It has
nothing to do with the new automatic Localiza receivables-anticipation
deduction being added on the revenue side (revenue_main_categories.deduction_rate).

Renaming it to "Taxa Antecipação Cartão" only to remove the naming ambiguity
between the two unrelated concepts. No behavioral change: still an ordinary
manually-launched expense subcategory under Vendas/Operacional.

## Change
Rename the subcategory. Idempotent — matches by current name, no-op if
already renamed or if it doesn't exist.
*/

UPDATE expense_subcategories
SET name = 'Taxa Antecipação Cartão'
WHERE name = 'Taxa Antecipação'
  AND category_id IN (SELECT id FROM expense_categories WHERE name = 'Vendas');

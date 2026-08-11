/*
# CarCenter PRO Finance - Derive expense cost center from category (Fase 1)

## Overview
`expenses.cost_center_id` (and `recurring_expenses.cost_center_id`) were a
frozen snapshot, set once when each row was created via the DespesasScreen
form, independent of `expense_categories.cost_center_id`. Reclassifying a
category's cost center (e.g. "Carlinhos/PARTICULAR" -> "Retiradas de Sócio",
migrations 014/015) never propagated to existing rows, requiring a 3rd
retroactive migration (016) to fix already-created data — a real incident,
with a real risk of it silently recurring on the next reclassification.

## Fase 1 (this migration + app code)
From now on, an expense's cost center is always DERIVED from
`expenses.category_id -> expense_categories.cost_center_id` at read time —
every report/screen join goes through the category, never straight off
`expenses.cost_center_id`. The application stops writing to
`expenses.cost_center_id`/`recurring_expenses.cost_center_id` going forward.

The columns are made nullable here but NOT dropped and NOT backfilled to
NULL — existing data is left untouched as an inert historical remnant, kept
only as a rollback/comparison safety net for a while. Checked beforehand:
all 12 active `expense_categories` rows already have a non-null
`cost_center_id`, so the derivation has no "categoria sem centro de custo"
gap today.

## Fase 2 (future, separate migration)
Once Fase 1 has run cleanly for a while, a follow-up migration drops
`expenses.cost_center_id` and `recurring_expenses.cost_center_id` entirely.
Not done here — deliberately deferred, same as the plan agreed with Daniel.
*/

ALTER TABLE expenses ALTER COLUMN cost_center_id DROP NOT NULL;
ALTER TABLE recurring_expenses ALTER COLUMN cost_center_id DROP NOT NULL;

DROP INDEX IF EXISTS idx_expenses_cost_center;

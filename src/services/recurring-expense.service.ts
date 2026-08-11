import { supabase } from '../lib/supabase';
import { createExpense } from './expense.service';
import { getCurrentCompetence } from '../utils/format';
import type { Expense, RecurringExpense } from '../types';

export interface RecurringExpenseInput {
  description: string;
  category_id: string;
  subcategory_id?: string | null;
  supplier?: string | null;
  supplier_id?: string | null;
  due_day: number;
  initial_amount: number;
  start_month: number;
  start_year: number;
  end_date?: string | null;
  notes?: string | null;
  created_by?: string;
}

function buildDueDate(month: number, year: number, day: number): string {
  const lastDay = new Date(year, month, 0).getDate();
  const clampedDay = Math.min(day, lastDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

function nextCompetence(month: number, year: number): { month: number; year: number } {
  if (month === 12) return { month: 1, year: year + 1 };
  return { month: month + 1, year };
}

function competenceLTE(aMonth: number, aYear: number, bMonth: number, bYear: number): boolean {
  if (aYear !== bYear) return aYear < bYear;
  return aMonth <= bMonth;
}

const EXPENSE_SELECT =
  '*, category:expense_categories(*, cost_center:cost_centers(*)), subcategory:expense_subcategories(*), supplier_ref:suppliers(*), user:users(*), installments:expense_installments(*)';

export async function createRecurringExpense(input: RecurringExpenseInput): Promise<{ recurring: RecurringExpense; expense: Expense }> {
  const { data: recurring, error: recError } = await supabase
    .from('recurring_expenses')
    .insert({
      description: input.description,
      category_id: input.category_id,
      subcategory_id: input.subcategory_id ?? null,
      supplier_id: input.supplier_id ?? null,
      supplier: input.supplier ?? null,
      due_day: input.due_day,
      last_confirmed_amount: input.initial_amount,
      start_month: input.start_month,
      start_year: input.start_year,
      last_generated_month: input.start_month,
      last_generated_year: input.start_year,
      end_date: input.end_date ?? null,
      notes: input.notes ?? null,
      created_by: input.created_by ?? null,
    })
    .select('*')
    .single();
  if (recError) throw recError;

  const dueDate = buildDueDate(input.start_month, input.start_year, input.due_day);

  const createdExpense = await createExpense({
    competence_month: input.start_month,
    competence_year: input.start_year,
    supplier: input.supplier ?? null,
    supplier_id: input.supplier_id ?? null,
    category_id: input.category_id,
    subcategory_id: input.subcategory_id ?? null,
    description: input.description,
    total_amount: input.initial_amount,
    installment_count: 1,
    installment_mode: 'monthly',
    payment_date: dueDate,
    notes: input.notes ?? null,
    created_by: input.created_by,
  });

  const { data: expense, error: updError } = await supabase
    .from('expenses')
    .update({ recurring_expense_id: recurring.id, confirmation_status: 'confirmed' })
    .eq('id', createdExpense.id)
    .select(EXPENSE_SELECT)
    .single();
  if (updError) throw updError;

  return { recurring, expense };
}

async function generatePendingOccurrences(): Promise<number> {
  const { data: recurrences, error } = await supabase
    .from('recurring_expenses')
    .select('*')
    .eq('active', true);
  if (error) throw error;
  if (!recurrences || recurrences.length === 0) return 0;

  const { month: curMonth, year: curYear } = getCurrentCompetence();
  let generatedCount = 0;

  for (const rec of recurrences) {
    let { month, year } = nextCompetence(rec.last_generated_month, rec.last_generated_year);
    let cursorMonth = rec.last_generated_month;
    let cursorYear = rec.last_generated_year;

    while (competenceLTE(month, year, curMonth, curYear)) {
      const dueDate = buildDueDate(month, year, rec.due_day);
      if (rec.end_date && dueDate > rec.end_date) break;

      const { data: newExpense, error: insError } = await supabase
        .from('expenses')
        .insert({
          competence_month: month,
          competence_year: year,
          supplier: rec.supplier,
          supplier_id: rec.supplier_id,
          category_id: rec.category_id,
          subcategory_id: rec.subcategory_id,
          description: rec.description,
          total_amount: rec.last_confirmed_amount,
          installment_count: 1,
          installment_mode: 'monthly',
          payment_date: dueDate,
          notes: rec.notes,
          recurring_expense_id: rec.id,
          confirmation_status: 'pending_confirmation',
        })
        .select('id')
        .single();
      if (insError) throw insError;

      const { error: instError } = await supabase.from('expense_installments').insert({
        expense_id: newExpense.id,
        installment_number: 1,
        due_date: dueDate,
        amount: rec.last_confirmed_amount,
        competence_month: month,
        competence_year: year,
        paid: false,
        payment_date: dueDate,
      });
      if (instError) throw instError;

      generatedCount++;
      cursorMonth = month;
      cursorYear = year;
      ({ month, year } = nextCompetence(month, year));
    }

    if (cursorMonth !== rec.last_generated_month || cursorYear !== rec.last_generated_year) {
      const { error: cursorError } = await supabase
        .from('recurring_expenses')
        .update({ last_generated_month: cursorMonth, last_generated_year: cursorYear })
        .eq('id', rec.id);
      if (cursorError) throw cursorError;
    }
  }

  return generatedCount;
}

let hasGeneratedThisSession = false;

export async function ensureRecurringOccurrencesGenerated(): Promise<void> {
  if (hasGeneratedThisSession) return;
  hasGeneratedThisSession = true;
  try {
    await generatePendingOccurrences();
  } catch (err) {
    hasGeneratedThisSession = false;
    throw err;
  }
}

export async function confirmRecurringOccurrence(expenseId: string, confirmedAmount: number): Promise<Expense> {
  const { data: expense, error: fetchError } = await supabase
    .from('expenses')
    .select('*, installments:expense_installments(*)')
    .eq('id', expenseId)
    .single();
  if (fetchError) throw fetchError;
  if (!expense.recurring_expense_id) throw new Error('Despesa não é recorrente.');

  const { error: updError } = await supabase
    .from('expenses')
    .update({
      total_amount: confirmedAmount,
      confirmation_status: 'confirmed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', expenseId);
  if (updError) throw updError;

  const installment = expense.installments?.[0];
  if (installment) {
    const { error: instError } = await supabase
      .from('expense_installments')
      .update({ amount: confirmedAmount, paid: true })
      .eq('id', installment.id);
    if (instError) throw instError;
  }

  const { error: recError } = await supabase
    .from('recurring_expenses')
    .update({ last_confirmed_amount: confirmedAmount, updated_at: new Date().toISOString() })
    .eq('id', expense.recurring_expense_id);
  if (recError) throw recError;

  const { data: fullExpense, error: finalError } = await supabase
    .from('expenses')
    .select(EXPENSE_SELECT)
    .eq('id', expenseId)
    .single();
  if (finalError) throw finalError;
  return fullExpense;
}

export async function fetchPendingRecurringExpenses(month: number, year: number): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select(EXPENSE_SELECT)
    .eq('competence_month', month)
    .eq('competence_year', year)
    .eq('confirmation_status', 'pending_confirmation')
    .order('payment_date');
  if (error) throw error;
  return data ?? [];
}

export async function endRecurringExpense(id: string): Promise<void> {
  const { error } = await supabase
    .from('recurring_expenses')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

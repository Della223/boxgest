import { supabase } from '../lib/supabase';
import type { Expense, ExpenseCategory, ExpenseSubcategory, CostCenter, Supplier, InstallmentMode } from '../types';

export interface ExpenseFilters {
  competenceMonth?: number;
  competenceYear?: number;
  supplier?: string;
  categoryId?: string;
  subcategoryId?: string;
  searchText?: string;
}

export interface ExpenseInput {
  competence_month: number;
  competence_year: number;
  supplier?: string | null;
  supplier_id?: string | null;
  category_id: string;
  subcategory_id?: string | null;
  description?: string | null;
  total_amount: number;
  installment_count: number;
  installment_mode?: InstallmentMode;
  installment_interval_days?: number | null;
  custom_due_dates?: string[] | null;
  payment_date: string;
  notes?: string | null;
  created_by?: string;
}

function generateInstallments(
  totalAmount: number,
  count: number,
  paymentDate: string,
  baseMonth: number,
  baseYear: number,
  mode: InstallmentMode = 'monthly',
  intervalDays?: number | null,
  customDueDates?: string[] | null
): { installment_number: number; due_date: string; amount: number; competence_month: number; competence_year: number; paid: boolean; payment_date: string }[] {
  const baseAmount = Math.floor((totalAmount / count) * 100) / 100;
  const lastAmount = Math.round((totalAmount - baseAmount * (count - 1)) * 100) / 100;

  const installments: { installment_number: number; due_date: string; amount: number; competence_month: number; competence_year: number; paid: boolean; payment_date: string }[] = [];
  const baseDate = new Date(paymentDate + 'T00:00:00');

  for (let i = 0; i < count; i++) {
    let dueDate: Date;
    if (mode === 'custom' && customDueDates?.[i]) {
      dueDate = new Date(customDueDates[i] + 'T00:00:00');
    } else if (mode === 'fixed_days' && intervalDays) {
      dueDate = new Date(baseDate);
      dueDate.setDate(dueDate.getDate() + intervalDays * i);
    } else {
      dueDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, baseDate.getDate());
    }

    let compMonth = baseMonth + i;
    let compYear = baseYear;
    while (compMonth > 12) {
      compMonth -= 12;
      compYear += 1;
    }
    installments.push({
      installment_number: i + 1,
      due_date: dueDate.toISOString().split('T')[0],
      amount: i === count - 1 ? lastAmount : baseAmount,
      competence_month: compMonth,
      competence_year: compYear,
      paid: true,
      payment_date: mode === 'custom' && customDueDates?.[i] ? customDueDates[i] : paymentDate,
    });
  }
  return installments;
}

export async function fetchExpenseCategories(costCenterId?: string): Promise<ExpenseCategory[]> {
  let query = supabase
    .from('expense_categories')
    .select('*, cost_center:cost_centers(*)')
    .eq('active', true)
    .order('name');
  if (costCenterId) query = query.eq('cost_center_id', costCenterId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchAllExpenseCategories(): Promise<ExpenseCategory[]> {
  const { data, error } = await supabase
    .from('expense_categories')
    .select('*, cost_center:cost_centers(*)')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function fetchSubcategories(categoryId?: string): Promise<ExpenseSubcategory[]> {
  let query = supabase
    .from('expense_subcategories')
    .select('*, category:expense_categories(*)')
    .eq('active', true)
    .order('name');
  if (categoryId) query = query.eq('category_id', categoryId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchAllSubcategories(): Promise<ExpenseSubcategory[]> {
  const { data, error } = await supabase
    .from('expense_subcategories')
    .select('*, category:expense_categories(*)')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function fetchCostCenters(): Promise<CostCenter[]> {
  const { data, error } = await supabase
    .from('cost_centers')
    .select('*')
    .eq('active', true)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function fetchAllCostCenters(): Promise<CostCenter[]> {
  const { data, error } = await supabase
    .from('cost_centers')
    .select('*')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function fetchExpenses(filters: ExpenseFilters = {}): Promise<Expense[]> {
  // A parcelamento's competence lives on each installment, not on the parent
  // expense — matching by month/year must join expense_installments (inner)
  // and filter on its columns, instead of the parent's own competence_month/year.
  const hasCompetenceFilter = !!(filters.competenceMonth || filters.competenceYear);
  const installmentsJoin = hasCompetenceFilter ? 'expense_installments!inner(*)' : 'expense_installments(*)';

  let query = supabase
    .from('expenses')
    .select(`*, category:expense_categories(*, cost_center:cost_centers(*)), subcategory:expense_subcategories(*), supplier_ref:suppliers(*), user:users(*), installments:${installmentsJoin}`)
    .order('created_at', { ascending: false });

  if (filters.competenceMonth) query = query.eq('installments.competence_month', filters.competenceMonth);
  if (filters.competenceYear) query = query.eq('installments.competence_year', filters.competenceYear);
  if (filters.supplier) query = query.ilike('supplier', `%${filters.supplier}%`);
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
  if (filters.subcategoryId) query = query.eq('subcategory_id', filters.subcategoryId);

  const { data, error } = await query;
  if (error) throw error;

  let result = data ?? [];

  if (filters.searchText) {
    const search = filters.searchText.toLowerCase();
    result = result.filter(
      (e) =>
        e.supplier?.toLowerCase().includes(search) ||
        e.description?.toLowerCase().includes(search)
    );
  }
  return result;
}

export async function createExpense(input: ExpenseInput): Promise<Expense> {
  const { payment_date, custom_due_dates, ...expenseData } = input;
  const { data: expense, error: expenseError } = await supabase
    .from('expenses')
    .insert({ ...expenseData, payment_date })
    .select('*')
    .single();
  if (expenseError) throw expenseError;

  const installments = generateInstallments(
    input.total_amount,
    input.installment_count,
    payment_date,
    input.competence_month,
    input.competence_year,
    input.installment_mode ?? 'monthly',
    input.installment_interval_days,
    custom_due_dates
  );
  const installmentRecords = installments.map((inst) => ({
    expense_id: expense.id,
    ...inst,
  }));

  const { error: instError } = await supabase
    .from('expense_installments')
    .insert(installmentRecords);
  if (instError) throw instError;

  const { data: fullExpense, error: fetchError } = await supabase
    .from('expenses')
    .select('*, category:expense_categories(*, cost_center:cost_centers(*)), subcategory:expense_subcategories(*), supplier_ref:suppliers(*), user:users(*), installments:expense_installments(*)')
    .eq('id', expense.id)
    .single();
  if (fetchError) throw fetchError;
  return fullExpense;
}

export async function updateExpense(id: string, input: Partial<ExpenseInput>): Promise<Expense> {
  const { payment_date, ...updateData } = input;
  const updatePayload: Record<string, unknown> = { ...updateData, updated_at: new Date().toISOString() };
  delete updatePayload.custom_due_dates;
  if (payment_date) updatePayload.payment_date = payment_date;

  const { data, error } = await supabase
    .from('expenses')
    .update(updatePayload)
    .eq('id', id)
    .select('*, category:expense_categories(*, cost_center:cost_centers(*)), subcategory:expense_subcategories(*), supplier_ref:suppliers(*), user:users(*), installments:expense_installments(*)')
    .single();
  if (error) throw error;
  return data;
}

export async function recalculateInstallments(
  expenseId: string,
  newTotalAmount: number,
  newInstallmentCount: number,
  paymentDate: string,
  baseMonth: number,
  baseYear: number,
  installmentMode: InstallmentMode = 'monthly',
  installmentIntervalDays?: number | null,
  customDueDates?: string[] | null
): Promise<Expense> {
  // Delete existing installments
  const { error: delError } = await supabase
    .from('expense_installments')
    .delete()
    .eq('expense_id', expenseId);
  if (delError) throw delError;

  // Update expense record
  const { error: expError } = await supabase
    .from('expenses')
    .update({
      total_amount: newTotalAmount,
      installment_count: newInstallmentCount,
      payment_date: paymentDate,
      installment_mode: installmentMode,
      installment_interval_days: installmentIntervalDays ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', expenseId);
  if (expError) throw expError;

  // Generate and insert new installments
  const installments = generateInstallments(
    newTotalAmount,
    newInstallmentCount,
    paymentDate,
    baseMonth,
    baseYear,
    installmentMode,
    installmentIntervalDays,
    customDueDates
  );
  const installmentRecords = installments.map((inst) => ({
    expense_id: expenseId,
    ...inst,
  }));

  const { error: instError } = await supabase
    .from('expense_installments')
    .insert(installmentRecords);
  if (instError) throw instError;

  // Fetch updated expense
  const { data: fullExpense, error: fetchError } = await supabase
    .from('expenses')
    .select('*, category:expense_categories(*, cost_center:cost_centers(*)), subcategory:expense_subcategories(*), supplier_ref:suppliers(*), user:users(*), installments:expense_installments(*)')
    .eq('id', expenseId)
    .single();
  if (fetchError) throw fetchError;
  return fullExpense;
}

export async function deleteExpense(id: string): Promise<void> {
  const { error: instError } = await supabase
    .from('expense_installments')
    .delete()
    .eq('expense_id', id);
  if (instError) throw instError;

  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// Suppliers - CRUD + autocomplete
// ============================================================

export async function fetchSuppliers(search?: string): Promise<Supplier[]> {
  let query = supabase
    .from('suppliers')
    .select('*')
    .eq('active', true)
    .order('name');
  if (search && search.trim()) {
    query = query.ilike('name', `%${search.trim()}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchAllSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function createSupplier(name: string): Promise<Supplier> {
  const { data, error } = await supabase
    .from('suppliers')
    .insert({ name: name.trim() })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function findOrCreateSupplier(name: string): Promise<Supplier | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const { data: existing } = await supabase
    .from('suppliers')
    .select('*')
    .ilike('name', trimmed)
    .maybeSingle();
  if (existing) return existing;
  return createSupplier(trimmed);
}

export async function updateSupplier(id: string, updates: { name?: string; active?: boolean }): Promise<Supplier> {
  const { data, error } = await supabase
    .from('suppliers')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

import { supabase } from '../lib/supabase';
import type { RevenueMainCategory, RevenueSubcategory, ExpenseCategory, ExpenseSubcategory, CostCenter, Supplier } from '../types';

// ============================================================
// Revenue main categories / subcategories - admin CRUD
// (create + "active only" fetch live in revenue.service.ts, used by the
// regular sales flow; update/delete/in-use checks live here, matching the
// split already used for expense categories/subcategories below)
// ============================================================

export async function updateRevenueMainCategory(id: string, updates: { name?: string; active?: boolean; deduction_rate?: number }): Promise<RevenueMainCategory> {
  const { data, error } = await supabase
    .from('revenue_main_categories')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRevenueMainCategory(id: string): Promise<void> {
  const { error } = await supabase.from('revenue_main_categories').delete().eq('id', id);
  if (error) throw error;
}

export async function checkRevenueMainCategoryInUse(mainCategoryId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('revenues')
    .select('*', { count: 'exact', head: true })
    .eq('main_category_id', mainCategoryId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function updateRevenueSubcategory(id: string, updates: { name?: string; active?: boolean }): Promise<RevenueSubcategory> {
  const { data, error } = await supabase
    .from('revenue_subcategories')
    .update(updates)
    .eq('id', id)
    .select('*, main_category:revenue_main_categories(*)')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRevenueSubcategory(id: string): Promise<void> {
  const { error } = await supabase.from('revenue_subcategories').delete().eq('id', id);
  if (error) throw error;
}

export async function checkRevenueSubcategoryInUse(subcategoryId: string): Promise<boolean> {
  const [revenuesResult, itemsResult] = await Promise.all([
    supabase.from('revenues').select('*', { count: 'exact', head: true }).eq('subcategory_id', subcategoryId),
    supabase.from('revenue_items').select('*', { count: 'exact', head: true }).eq('subcategory_id', subcategoryId),
  ]);
  if (revenuesResult.error) throw revenuesResult.error;
  if (itemsResult.error) throw itemsResult.error;
  return (revenuesResult.count ?? 0) > 0 || (itemsResult.count ?? 0) > 0;
}

export async function createExpenseCategory(name: string, costCenterId?: string): Promise<ExpenseCategory> {
  const { data, error } = await supabase
    .from('expense_categories')
    .insert({ name, cost_center_id: costCenterId ?? null })
    .select('*, cost_center:cost_centers(*)')
    .single();
  if (error) throw error;
  return data;
}

export async function updateExpenseCategory(id: string, updates: { name?: string; active?: boolean; cost_center_id?: string | null }): Promise<ExpenseCategory> {
  const { data, error } = await supabase
    .from('expense_categories')
    .update(updates)
    .eq('id', id)
    .select('*, cost_center:cost_centers(*)')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteExpenseCategory(id: string): Promise<void> {
  const { error } = await supabase.from('expense_categories').delete().eq('id', id);
  if (error) throw error;
}

export async function createSubcategory(categoryId: string, name: string): Promise<ExpenseSubcategory> {
  const { data, error } = await supabase
    .from('expense_subcategories')
    .insert({ category_id: categoryId, name })
    .select('*, category:expense_categories(*)')
    .single();
  if (error) throw error;
  return data;
}

export async function updateSubcategory(id: string, updates: { name?: string; active?: boolean }): Promise<ExpenseSubcategory> {
  const { data, error } = await supabase
    .from('expense_subcategories')
    .update(updates)
    .eq('id', id)
    .select('*, category:expense_categories(*)')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSubcategory(id: string): Promise<void> {
  const { error } = await supabase.from('expense_subcategories').delete().eq('id', id);
  if (error) throw error;
}

export async function createCostCenter(name: string): Promise<CostCenter> {
  const { data, error } = await supabase
    .from('cost_centers')
    .insert({ name })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateCostCenter(id: string, updates: { name?: string; active?: boolean }): Promise<CostCenter> {
  const { data, error } = await supabase
    .from('cost_centers')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCostCenter(id: string): Promise<void> {
  const { error } = await supabase.from('cost_centers').delete().eq('id', id);
  if (error) throw error;
}

export async function checkExpenseCategoryInUse(categoryId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('expenses')
    .select('*', { count: 'exact', head: true })
    .eq('category_id', categoryId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** "Em uso" agora significa: alguma categoria de despesa aponta para este centro de custo — a categoria é a única fonte de verdade do centro de custo de uma despesa (ver migration 020_derive_expense_cost_center). */
export async function checkCostCenterInUse(costCenterId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('expense_categories')
    .select('*', { count: 'exact', head: true })
    .eq('cost_center_id', costCenterId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

// ============================================================
// Suppliers - CRUD
// ============================================================

export async function createSupplierRecord(name: string): Promise<Supplier> {
  const { data, error } = await supabase
    .from('suppliers')
    .insert({ name: name.trim() })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateSupplierRecord(id: string, updates: { name?: string; active?: boolean }): Promise<Supplier> {
  const { data, error } = await supabase
    .from('suppliers')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSupplierRecord(id: string): Promise<void> {
  const { error } = await supabase.from('suppliers').delete().eq('id', id);
  if (error) throw error;
}

export async function checkSupplierInUse(supplierId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('expenses')
    .select('*', { count: 'exact', head: true })
    .eq('supplier_id', supplierId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

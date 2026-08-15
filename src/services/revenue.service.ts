import { supabase } from '../lib/supabase';
import type { Revenue, RevenueCategory, RevenueMainCategory, RevenueSubcategory, ClientType } from '../types';

export interface RevenueFilters {
  startDate?: string;
  endDate?: string;
  categoryId?: string;
  mainCategoryId?: string;
  subcategoryId?: string;
  clientTypeId?: string;
  competenceMonth?: number;
  competenceYear?: number;
  searchText?: string;
}

export interface RevenueItemInput {
  subcategory_id: string;
  quantity: number;
  amount: number;
}

export interface RevenueInput {
  revenue_date: string;
  competence_month?: number;
  competence_year?: number;
  main_category_id: string;
  client_type_id?: string | null;
  notes?: string | null;
  created_by?: string;
  items: RevenueItemInput[];
}

export interface RevenueHeaderInput {
  revenue_date?: string;
  competence_month?: number;
  competence_year?: number;
  main_category_id?: string;
  client_type_id?: string | null;
  notes?: string | null;
}

const REVENUE_SELECT =
  '*, category:revenue_categories(*), main_category:revenue_main_categories(*), subcategory:revenue_subcategories(*), client_type:client_types(*), user:users(*), items:revenue_items(*, subcategory:revenue_subcategories(*))';

function sumItems(items: RevenueItemInput[]): { amount: number; quantity: number } {
  const amount = items.reduce((s, i) => s + Number(i.amount), 0);
  const quantity = items.reduce((s, i) => s + Number(i.quantity), 0);
  return { amount, quantity };
}

// ============================================================
// Main Categories
// ============================================================

export async function fetchRevenueMainCategories(): Promise<RevenueMainCategory[]> {
  const { data, error } = await supabase
    .from('revenue_main_categories')
    .select('*')
    .eq('active', true)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function createRevenueMainCategory(name: string): Promise<RevenueMainCategory> {
  const { data, error } = await supabase
    .from('revenue_main_categories')
    .insert({ name })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** Admin listing — includes inactive, unlike fetchRevenueMainCategories (used for dropdowns). */
export async function fetchAllRevenueMainCategories(): Promise<RevenueMainCategory[]> {
  const { data, error } = await supabase
    .from('revenue_main_categories')
    .select('*')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

// ============================================================
// Client Types
// ============================================================

export async function fetchClientTypes(): Promise<ClientType[]> {
  const { data, error } = await supabase
    .from('client_types')
    .select('*')
    .eq('active', true)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function createClientType(name: string): Promise<ClientType> {
  const { data, error } = await supabase
    .from('client_types')
    .insert({ name })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** Admin listing — includes inactive, unlike fetchClientTypes (used for dropdowns). */
export async function fetchAllClientTypes(): Promise<ClientType[]> {
  const { data, error } = await supabase
    .from('client_types')
    .select('*')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

// ============================================================
// Subcategories
// ============================================================

export async function fetchRevenueSubcategories(mainCategoryId?: string): Promise<RevenueSubcategory[]> {
  let query = supabase
    .from('revenue_subcategories')
    .select('*, main_category:revenue_main_categories(*)')
    .eq('active', true)
    .order('name');
  if (mainCategoryId) query = query.eq('main_category_id', mainCategoryId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createRevenueSubcategory(mainCategoryId: string, name: string): Promise<RevenueSubcategory> {
  const { data, error } = await supabase
    .from('revenue_subcategories')
    .insert({ main_category_id: mainCategoryId, name })
    .select('*, main_category:revenue_main_categories(*)')
    .single();
  if (error) throw error;
  return data;
}

/** Admin listing — includes inactive, unlike fetchRevenueSubcategories (used for dropdowns). */
export async function fetchAllRevenueSubcategories(): Promise<RevenueSubcategory[]> {
  const { data, error } = await supabase
    .from('revenue_subcategories')
    .select('*, main_category:revenue_main_categories(*)')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

// ============================================================
// Legacy categories (backward compat)
// ============================================================

export async function fetchRevenueCategories(): Promise<RevenueCategory[]> {
  const { data, error } = await supabase
    .from('revenue_categories')
    .select('*')
    .eq('active', true)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

// ============================================================
// Revenues (sales) CRUD
// ============================================================

export async function fetchRevenues(filters: RevenueFilters = {}): Promise<Revenue[]> {
  const hasSubcategoryFilter = !!filters.subcategoryId;
  const itemsJoin = hasSubcategoryFilter
    ? 'revenue_items!inner(*, subcategory:revenue_subcategories(*))'
    : 'revenue_items(*, subcategory:revenue_subcategories(*))';

  let query = supabase
    .from('revenues')
    .select(`*, category:revenue_categories(*), main_category:revenue_main_categories(*), subcategory:revenue_subcategories(*), user:users(*), items:${itemsJoin}`)
    .order('revenue_date', { ascending: false });

  if (filters.startDate) query = query.gte('revenue_date', filters.startDate);
  if (filters.endDate) query = query.lte('revenue_date', filters.endDate);
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
  if (filters.mainCategoryId) query = query.eq('main_category_id', filters.mainCategoryId);
  if (filters.clientTypeId) query = query.eq('client_type_id', filters.clientTypeId);
  if (filters.subcategoryId) query = query.eq('items.subcategory_id', filters.subcategoryId);
  if (filters.competenceMonth) query = query.eq('competence_month', filters.competenceMonth);
  if (filters.competenceYear) query = query.eq('competence_year', filters.competenceYear);

  const { data, error } = await query;
  if (error) throw error;

  let result = data ?? [];
  if (filters.searchText) {
    const search = filters.searchText.toLowerCase();
    result = result.filter(
      (r) =>
        r.notes?.toLowerCase().includes(search) ||
        r.main_category?.name.toLowerCase().includes(search) ||
        (r.items ?? []).some((i: { subcategory?: { name: string } | null }) => i.subcategory?.name.toLowerCase().includes(search))
    );
  }
  return result;
}

export async function fetchRevenueById(id: string): Promise<Revenue | null> {
  const { data, error } = await supabase
    .from('revenues')
    .select(REVENUE_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createRevenue(input: RevenueInput): Promise<Revenue> {
  if (!input.items || input.items.length === 0) {
    throw new Error('A venda precisa de pelo menos um item.');
  }
  const { amount, quantity } = sumItems(input.items);

  const { data: revenue, error: revenueError } = await supabase
    .from('revenues')
    .insert({
      revenue_date: input.revenue_date,
      competence_month: input.competence_month,
      competence_year: input.competence_year,
      main_category_id: input.main_category_id,
      subcategory_id: input.items[0].subcategory_id,
      client_type_id: input.client_type_id ?? null,
      quantity,
      amount,
      notes: input.notes ?? null,
      created_by: input.created_by ?? null,
    })
    .select('id')
    .single();
  if (revenueError) throw revenueError;

  const itemRecords = input.items.map((item) => ({
    revenue_id: revenue.id,
    subcategory_id: item.subcategory_id,
    quantity: item.quantity,
    amount: item.amount,
  }));
  const { error: itemsError } = await supabase.from('revenue_items').insert(itemRecords);
  if (itemsError) throw itemsError;

  const { data: fullRevenue, error: fetchError } = await supabase
    .from('revenues')
    .select(REVENUE_SELECT)
    .eq('id', revenue.id)
    .single();
  if (fetchError) throw fetchError;
  return fullRevenue;
}

/** Header-only edit (date, competência, categoria principal, observações) — does not touch items. */
export async function updateRevenueHeader(id: string, input: RevenueHeaderInput): Promise<Revenue> {
  const { data, error } = await supabase
    .from('revenues')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(REVENUE_SELECT)
    .single();
  if (error) throw error;
  return data;
}

/** Replaces all items of a sale, recomputing the header's amount/quantity/subcategory_id — mirrors recalculateInstallments. */
export async function recalculateRevenueItems(revenueId: string, items: RevenueItemInput[]): Promise<Revenue> {
  if (!items || items.length === 0) {
    throw new Error('A venda precisa de pelo menos um item.');
  }

  const { error: delError } = await supabase.from('revenue_items').delete().eq('revenue_id', revenueId);
  if (delError) throw delError;

  const { amount, quantity } = sumItems(items);
  const { error: updError } = await supabase
    .from('revenues')
    .update({
      subcategory_id: items[0].subcategory_id,
      quantity,
      amount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', revenueId);
  if (updError) throw updError;

  const itemRecords = items.map((item) => ({
    revenue_id: revenueId,
    subcategory_id: item.subcategory_id,
    quantity: item.quantity,
    amount: item.amount,
  }));
  const { error: itemsError } = await supabase.from('revenue_items').insert(itemRecords);
  if (itemsError) throw itemsError;

  const { data: fullRevenue, error: fetchError } = await supabase
    .from('revenues')
    .select(REVENUE_SELECT)
    .eq('id', revenueId)
    .single();
  if (fetchError) throw fetchError;
  return fullRevenue;
}

export async function deleteRevenue(id: string): Promise<void> {
  const { error: itemsError } = await supabase.from('revenue_items').delete().eq('revenue_id', id);
  if (itemsError) throw itemsError;

  const { error } = await supabase.from('revenues').delete().eq('id', id);
  if (error) throw error;
}

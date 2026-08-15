import { supabase } from '../lib/supabase';
import { normalizeCostCenterName } from '../utils/costCenter';
import { netAmount } from '../utils/deduction';
import type { DashboardKPIs } from '../types';

// Retiradas não são despesa operacional da loja — ficam fora de
// "despesa"/"resultado" em todo o Dashboard/Home, expostas à parte.
// Comparação normalizada — ver utils/costCenter.ts.
const WITHDRAWAL_COST_CENTER = normalizeCostCenterName('Retiradas');

function getPreviousMonth(month: number, year: number): { month: number; year: number } {
  if (month === 1) return { month: 12, year: year - 1 };
  return { month: month - 1, year };
}

function getDateRange(month: number, year: number): { startDate: string; endDate: string } {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { startDate, endDate };
}

async function fetchMonthData(month: number, year: number) {
  const { startDate, endDate } = getDateRange(month, year);
  const [revenuesResult, expensesResult] = await Promise.all([
    supabase
      .from('revenues')
      .select('revenue_date, items:revenue_items(amount, subcategory:revenue_subcategories(main_category:revenue_main_categories(deduction_rate)))')
      .gte('revenue_date', startDate)
      .lte('revenue_date', endDate),
    supabase
      .from('expenses')
      .select('*, category:expense_categories(cost_center:cost_centers(name)), installments:expense_installments!inner(*)')
      .eq('installments.competence_month', month)
      .eq('installments.competence_year', year)
      .neq('confirmation_status', 'pending_confirmation'),
  ]);
  if (revenuesResult.error) throw revenuesResult.error;
  if (expensesResult.error) throw expensesResult.error;

  const revenues = revenuesResult.data ?? [];
  const expenses = expensesResult.data ?? [];

  // Receita líquida da dedução automática por item (ex.: taxa de
  // antecipação de recebíveis de frotas/seguradoras) — cada item pode ter
  // uma categoria/taxa diferente dentro da mesma venda, então a dedução é
  // calculada item a item, nunca uma segunda fonte de verdade armazenada.
  let receita = 0;
  let deducoesReceita = 0;
  for (const r of revenues) {
    for (const item of (r.items as unknown as { amount: number; subcategory: { main_category: { deduction_rate: number } | null } | null }[]) ?? []) {
      const gross = Number(item.amount);
      const rate = item.subcategory?.main_category?.deduction_rate;
      const net = netAmount(gross, rate);
      receita += net;
      deducoesReceita += gross - net;
    }
  }
  // Each `revenues` row is one sale (venda), regardless of how many items
  // (subcategorias) it contains — "quantidade de vendas" counts sales, not items.
  const quantidadeVendas = revenues.length;

  let despesa = 0;
  let retiradas = 0;
  const categoryTotals: Record<string, number> = {};
  for (const expense of expenses) {
    const category = expense.category as unknown as { cost_center: { name: string } | null } | null;
    const ccNormalized = normalizeCostCenterName(category?.cost_center?.name);
    const isWithdrawal = ccNormalized === WITHDRAWAL_COST_CENTER;
    for (const inst of (expense.installments ?? [])) {
      const instMonth = inst.competence_month ?? expense.competence_month;
      const instYear = inst.competence_year ?? expense.competence_year;
      if (instMonth === month && instYear === year) {
        if (isWithdrawal) {
          retiradas += Number(inst.amount);
        } else {
          despesa += Number(inst.amount);
          categoryTotals[expense.category_id] = (categoryTotals[expense.category_id] || 0) + Number(inst.amount);
        }
      }
    }
  }

  return { receita, despesa, retiradas, quantidadeVendas, categoryTotals, revenues, deducoesReceita };
}

export async function fetchDashboardKPIs(
  competenceMonth: number,
  competenceYear: number
): Promise<DashboardKPIs> {
  const month = competenceMonth;
  const year = competenceYear;
  const lastDay = new Date(year, month, 0).getDate();

  const prev = getPreviousMonth(month, year);
  const [current, previous] = await Promise.all([
    fetchMonthData(month, year),
    fetchMonthData(prev.month, prev.year),
  ]);

  const { data: budgets } = await supabase
    .from('budgets')
    .select('planned_amount')
    .eq('year', year)
    .eq('month', month);
  const totalBudget = (budgets ?? []).reduce((s, b) => s + Number(b.planned_amount), 0);

  const receitaAcumulada = current.receita;
  const despesaAcumulada = current.despesa;
  const resultado = receitaAcumulada - despesaAcumulada;
  const margem = receitaAcumulada > 0 ? (resultado / receitaAcumulada) * 100 : 0;
  const ticketMedio = current.quantidadeVendas > 0 ? receitaAcumulada / current.quantidadeVendas : 0;

  const today = new Date();
  const elapsedDays = today.getFullYear() === year && today.getMonth() + 1 === month
    ? today.getDate()
    : lastDay;
  const projecao = elapsedDays > 0 ? (receitaAcumulada / elapsedDays) * lastDay : 0;
  const receitaDiariaMedia = elapsedDays > 0 ? receitaAcumulada / elapsedDays : 0;

  const resultadoMesAnterior = previous.receita - previous.despesa;
  const variacaoResultado = resultadoMesAnterior !== 0
    ? ((resultado - resultadoMesAnterior) / Math.abs(resultadoMesAnterior)) * 100
    : 0;
  const variacaoReceita = previous.receita > 0
    ? ((receitaAcumulada - previous.receita) / previous.receita) * 100
    : 0;
  const variacaoDespesa = previous.despesa > 0
    ? ((despesaAcumulada - previous.despesa) / previous.despesa) * 100
    : 0;

  let maiorCategoriaDespesa = '-';
  let maxAmount = 0;
  for (const [catId, amount] of Object.entries(current.categoryTotals)) {
    if (amount > maxAmount) {
      maxAmount = amount;
      const { data: cat } = await supabase
        .from('expense_categories')
        .select('name')
        .eq('id', catId)
        .maybeSingle();
      maiorCategoriaDespesa = cat?.name ?? '-';
    }
  }

  return {
    receitaAcumulada,
    despesaAcumulada,
    resultado,
    projecao,
    ticketMedio,
    maiorCategoriaDespesa,
    quantidadeVendas: current.quantidadeVendas,
    margem,
    receitaDiariaMedia,
    resultadoMesAnterior,
    receitaMesAnterior: previous.receita,
    despesaMesAnterior: previous.despesa,
    variacaoResultado,
    variacaoReceita,
    variacaoDespesa,
    totalBudget,
    retiradasSocio: current.retiradas,
    deducoesReceita: current.deducoesReceita,
  };
}

export async function fetchRevenueByCategory(
  competenceMonth: number,
  competenceYear: number
): Promise<{ name: string; value: number }[]> {
  const { startDate, endDate } = getDateRange(competenceMonth, competenceYear);
  const { data, error } = await supabase
    .from('revenues')
    .select('items:revenue_items(amount, subcategory:revenue_subcategories(main_category:revenue_main_categories(name, deduction_rate)))')
    .gte('revenue_date', startDate)
    .lte('revenue_date', endDate);
  if (error) throw error;

  const grouped: Record<string, number> = {};
  for (const r of data ?? []) {
    for (const item of (r.items as unknown as { amount: number; subcategory: { main_category: { name: string; deduction_rate: number } | null } | null }[]) ?? []) {
      const mainCategory = item.subcategory?.main_category ?? null;
      const catName = mainCategory?.name ?? 'Sem categoria';
      grouped[catName] = (grouped[catName] || 0) + netAmount(Number(item.amount), mainCategory?.deduction_rate);
    }
  }
  return Object.entries(grouped).map(([name, value]) => ({ name, value }));
}
export async function fetchRevenueBySubcategory(
  competenceMonth: number,
  competenceYear: number
): Promise<{ name: string; value: number }[]> {
  const { startDate, endDate } = getDateRange(competenceMonth, competenceYear);
  const { data, error } = await supabase
    .from('revenues')
    .select('items:revenue_items(amount, subcategory:revenue_subcategories(name, main_category:revenue_main_categories(deduction_rate)))')
    .gte('revenue_date', startDate)
    .lte('revenue_date', endDate);
  if (error) throw error;

  const grouped: Record<string, number> = {};
  for (const r of data ?? []) {
    for (const item of (r.items as unknown as { amount: number; subcategory: { name: string; main_category: { deduction_rate: number } | null } | null }[]) ?? []) {
      const subName = item.subcategory?.name ?? 'Sem subcategoria';
      const rate = item.subcategory?.main_category?.deduction_rate;
      grouped[subName] = (grouped[subName] || 0) + netAmount(Number(item.amount), rate);
    }
  }
  return Object.entries(grouped).map(([name, value]) => ({ name, value }));
}
export async function fetchExpenseByCategory(
  competenceMonth: number,
  competenceYear: number
): Promise<{ name: string; value: number }[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('category:expense_categories(name), installments:expense_installments!inner(competence_month, competence_year, amount)')
    .eq('installments.competence_month', competenceMonth)
    .eq('installments.competence_year', competenceYear)
    .neq('confirmation_status', 'pending_confirmation');
  if (error) throw error;

  const grouped: Record<string, number> = {};
  for (const e of data ?? []) {
    const catName = (e.category as unknown as { name: string })?.name ?? 'Sem categoria';
    for (const inst of (e.installments as unknown as { competence_month: number; competence_year: number; amount: number }[]) ?? []) {
      if (inst.competence_month === competenceMonth && inst.competence_year === competenceYear) {
        grouped[catName] = (grouped[catName] || 0) + Number(inst.amount);
      }
    }
  }
  return Object.entries(grouped).map(([name, value]) => ({ name, value }));
}

export async function fetchMonthlyEvolution(year: number): Promise<{ month: string; receita: number; despesa: number }[]> {
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      return fetchMonthData(m, year).then((data) => ({
        month: months[i],
        receita: data.receita,
        despesa: data.despesa,
      }));
    })
  );
  return results;
}

export async function fetchCostCenterDistribution(
  competenceMonth: number,
  competenceYear: number
): Promise<{ name: string; value: number }[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('category:expense_categories(cost_center:cost_centers(name)), installments:expense_installments!inner(competence_month, competence_year, amount)')
    .eq('installments.competence_month', competenceMonth)
    .eq('installments.competence_year', competenceYear)
    .neq('confirmation_status', 'pending_confirmation');
  if (error) throw error;

  const grouped: Record<string, number> = {};
  for (const e of data ?? []) {
    const category = e.category as unknown as { cost_center: { name: string } | null } | null;
    const ccName = category?.cost_center?.name ?? 'Sem centro';
    for (const inst of (e.installments as unknown as { competence_month: number; competence_year: number; amount: number }[]) ?? []) {
      if (inst.competence_month === competenceMonth && inst.competence_year === competenceYear) {
        grouped[ccName] = (grouped[ccName] || 0) + Number(inst.amount);
      }
    }
  }
  return Object.entries(grouped).map(([name, value]) => ({ name, value }));
}

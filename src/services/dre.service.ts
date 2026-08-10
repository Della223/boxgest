import { supabase } from '../lib/supabase';
import { normalizeCostCenterName } from '../utils/costCenter';
import { netAmount } from '../utils/deduction';
import type { DREData, DREExpenseCostCenterGroup } from '../types';

// CPV e CSP são custo direto (deduzido antes do Lucro Bruto, junto com a
// Receita Líquida). IR/CSLL é imposto sobre o lucro (deduzido depois do
// Resultado Operacional). Retiradas de Sócio não são despesa da loja — ficam
// de fora do resultado inteiramente, exibidas só como linha de memorando.
// Qualquer outro centro de custo — incluindo "Deduções" e despesas sem
// centro de custo definido — permanece em Despesas Operacionais.
// Comparação sempre normalizada (ver utils/costCenter.ts) — nomes vindos do
// banco podem diferir do literal aqui em espaço/acentuação sem que isso
// apareça visualmente, causando classificação errada silenciosa.
const DIRECT_COST_CENTERS = new Set(['CPV', 'CSP'].map(normalizeCostCenterName));
const TAX_COST_CENTER = normalizeCostCenterName('IR/CSLL');
const WITHDRAWAL_COST_CENTER = normalizeCostCenterName('Retiradas de Sócio');

type CostCenterBucket = 'direct' | 'tax' | 'withdrawal' | 'operational';

function classifyCostCenter(name: string): CostCenterBucket {
  const normalized = normalizeCostCenterName(name);
  if (DIRECT_COST_CENTERS.has(normalized)) return 'direct';
  if (normalized === TAX_COST_CENTER) return 'tax';
  if (normalized === WITHDRAWAL_COST_CENTER) return 'withdrawal';
  return 'operational';
}

type ExpenseMap = Record<string, {
  amount: number;
  categories: Record<string, { amount: number; subcategories: Record<string, number> }>;
}>;

function addExpense(map: ExpenseMap, ccName: string, catName: string, subName: string, amount: number): void {
  if (!map[ccName]) map[ccName] = { amount: 0, categories: {} };
  map[ccName].amount += amount;

  if (!map[ccName].categories[catName]) {
    map[ccName].categories[catName] = { amount: 0, subcategories: {} };
  }
  map[ccName].categories[catName].amount += amount;
  map[ccName].categories[catName].subcategories[subName] =
    (map[ccName].categories[catName].subcategories[subName] || 0) + amount;
}

function mapToGroups(map: ExpenseMap): DREExpenseCostCenterGroup[] {
  return Object.entries(map).map(([costCenter, ccData]) => ({
    category: costCenter,
    amount: ccData.amount,
    categories: Object.entries(ccData.categories).map(([category, catData]) => ({
      category,
      amount: catData.amount,
      subcategories: Object.entries(catData.subcategories).map(([name, amount]) => ({ name, amount })),
    })),
  }));
}

export async function fetchDRE(
  competenceMonth: number,
  competenceYear: number
): Promise<DREData> {
  const startDate = `${competenceYear}-${String(competenceMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(competenceYear, competenceMonth, 0).getDate();
  const endDate = `${competenceYear}-${String(competenceMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const [revenuesResult, expensesResult] = await Promise.all([
    supabase
      .from('revenues')
      .select('main_category:revenue_main_categories(name, deduction_rate), items:revenue_items(amount, subcategory:revenue_subcategories(name))')
      .gte('revenue_date', startDate)
      .lte('revenue_date', endDate),
    supabase
      .from('expenses')
      .select('category:expense_categories(name), subcategory:expense_subcategories(name), cost_center:cost_centers(name), installments:expense_installments!inner(competence_month, competence_year, amount)')
      .eq('installments.competence_month', competenceMonth)
      .eq('installments.competence_year', competenceYear)
      .neq('confirmation_status', 'pending_confirmation'),
  ]);

  if (revenuesResult.error) throw revenuesResult.error;
  if (expensesResult.error) throw expensesResult.error;

  const revenues = revenuesResult.data ?? [];
  const expenses = expensesResult.data ?? [];

  // ---- Receitas: Categoria Principal -> Subcategoria ----
  const receitaMap: Record<string, { amount: number; subcategories: Record<string, number> }> = {};
  const deducoesMap: Record<string, number> = {};
  let receitaBruta = 0;
  let deducoes = 0;

  for (const r of revenues) {
    const mainCategory = r.main_category as unknown as { name: string; deduction_rate: number } | null;
    const catName = mainCategory?.name ?? 'Sem categoria';
    if (!receitaMap[catName]) receitaMap[catName] = { amount: 0, subcategories: {} };

    for (const item of (r.items as unknown as { amount: number; subcategory: { name: string } | null }[]) ?? []) {
      const subName = item.subcategory?.name ?? 'Sem subcategoria';
      const amount = Number(item.amount);
      receitaMap[catName].amount += amount;
      receitaMap[catName].subcategories[subName] = (receitaMap[catName].subcategories[subName] || 0) + amount;
      receitaBruta += amount;

      const deducao = amount - netAmount(amount, mainCategory?.deduction_rate);
      if (deducao > 0) {
        deducoesMap[catName] = (deducoesMap[catName] || 0) + deducao;
        deducoes += deducao;
      }
    }
  }

  const receitaPorCategoria = Object.entries(receitaMap).map(([category, data]) => ({
    category,
    amount: data.amount,
    subcategories: Object.entries(data.subcategories).map(([name, amount]) => ({ name, amount })),
  }));

  const deducoesPorCategoria = Object.entries(deducoesMap).map(([name, amount]) => ({ name, amount }));

  const receitaLiquida = receitaBruta - deducoes;

  // ---- Despesas: Centro de Custo -> Categoria -> Subcategoria, separadas por bucket ----
  const directMap: ExpenseMap = {};
  const operationalMap: ExpenseMap = {};
  const taxMap: ExpenseMap = {};
  const withdrawalMap: ExpenseMap = {};
  let custosDiretos = 0;
  let despesasOperacionais = 0;
  let irCsll = 0;
  let retiradas = 0;

  for (const e of expenses) {
    const ccName = (e.cost_center as unknown as { name: string })?.name ?? 'Sem centro de custo';
    const catName = (e.category as unknown as { name: string })?.name ?? 'Sem categoria';
    const subName = (e.subcategory as unknown as { name: string })?.name ?? 'Sem subcategoria';
    const bucket = classifyCostCenter(ccName);

    for (const inst of (e.installments as unknown as { competence_month: number; competence_year: number; amount: number }[]) ?? []) {
      if (inst.competence_month === competenceMonth && inst.competence_year === competenceYear) {
        const amount = Number(inst.amount);

        if (bucket === 'direct') {
          addExpense(directMap, ccName, catName, subName, amount);
          custosDiretos += amount;
        } else if (bucket === 'tax') {
          addExpense(taxMap, ccName, catName, subName, amount);
          irCsll += amount;
        } else if (bucket === 'withdrawal') {
          addExpense(withdrawalMap, ccName, catName, subName, amount);
          retiradas += amount;
        } else {
          addExpense(operationalMap, ccName, catName, subName, amount);
          despesasOperacionais += amount;
        }
      }
    }
  }

  const custosDiretosPorCategoria = mapToGroups(directMap);
  const despesasPorCategoria = mapToGroups(operationalMap);
  const irCsllPorCategoria = mapToGroups(taxMap);
  const retiradasPorCategoria = mapToGroups(withdrawalMap);

  const lucroBruto = receitaLiquida - custosDiretos;
  const resultadoOperacional = lucroBruto - despesasOperacionais;
  const resultadoLiquido = resultadoOperacional - irCsll;

  const margemBruta = receitaLiquida > 0 ? (lucroBruto / receitaLiquida) * 100 : 0;
  const margemOperacional = receitaLiquida > 0 ? (resultadoOperacional / receitaLiquida) * 100 : 0;
  const margemLiquida = receitaLiquida > 0 ? (resultadoLiquido / receitaLiquida) * 100 : 0;

  return {
    receitaBruta,
    receitaPorCategoria,
    deducoes,
    deducoesPorCategoria,
    receitaLiquida,
    custosDiretos,
    custosDiretosPorCategoria,
    lucroBruto,
    despesasOperacionais,
    despesasPorCategoria,
    resultadoOperacional,
    irCsll,
    irCsllPorCategoria,
    resultadoLiquido,
    margemBruta,
    margemOperacional,
    margemLiquida,
    retiradas,
    retiradasPorCategoria,
  };
}

export async function fetchDREComparison(
  currentMonth: number,
  currentYear: number,
  prevMonth: number,
  prevYear: number
): Promise<{ current: DREData; previous: DREData }> {
  const [current, previous] = await Promise.all([
    fetchDRE(currentMonth, currentYear),
    fetchDRE(prevMonth, prevYear),
  ]);
  return { current, previous };
}

import { fetchDashboardKPIs } from './dashboard.service';
import { fetchRevenues } from './revenue.service';
import { fetchExpenses } from './expense.service';
import { fetchBudgets, applyAutomaticBudgets } from './budget.service';
import { normalizeCostCenterName } from '../utils/costCenter';
import { netAmount } from '../utils/deduction';
import type { CalendarDayInfo, HomeInsight, DashboardKPIs, Expense, Revenue, Budget } from '../types';

export interface HomeData {
  kpis: DashboardKPIs;
  revenues: Revenue[];
  expenses: Expense[];
  budgets: Budget[];
  calendar: CalendarDayInfo[];
  consecutiveEmptyDays: number;
  insights: HomeInsight[];
}


// Same exclusion as dashboard.service.ts — retiradas não são despesa
// operacional, então não podem entrar na baseline de comparação.
// Comparação normalizada — ver utils/costCenter.ts.
const WITHDRAWAL_COST_CENTER = normalizeCostCenterName('Retiradas');

function getLastDayOfMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

function getPreviousCompetenceLocal(month: number, year: number): { month: number; year: number } {
  if (month === 1) return { month: 12, year: year - 1 };
  return { month: month - 1, year };
}

/**
 * Recalculates the "vs mês anterior" baseline using an equivalent period
 * (day 1 through the same day-of-month) instead of the full previous month,
 * so a partial current month isn't compared against a complete one.
 * Clamped to the previous month's last day for shorter months (e.g. Jan 31 vs Feb).
 */
function computeEquivalentPeriodBaseline(
  month: number,
  year: number,
  revenues: Revenue[],
  expenses: Expense[]
): { receitaMesAnterior: number; despesaMesAnterior: number } {
  const today = new Date();
  const isCurrentCompetence = today.getFullYear() === year && today.getMonth() + 1 === month;
  const day = isCurrentCompetence ? today.getDate() : getLastDayOfMonth(month, year);

  const prev = getPreviousCompetenceLocal(month, year);
  const prevLastDay = getLastDayOfMonth(prev.month, prev.year);
  const prevDay = Math.min(day, prevLastDay);
  const prevStartDate = `${prev.year}-${String(prev.month).padStart(2, '0')}-01`;
  const prevEndDate = `${prev.year}-${String(prev.month).padStart(2, '0')}-${String(prevDay).padStart(2, '0')}`;

  const receitaMesAnteriorBruta = revenues
    .filter((r) => r.revenue_date >= prevStartDate && r.revenue_date <= prevEndDate)
    .reduce((sum, r) => {
      const itemsNet = (r.items ?? []).reduce(
        (s, item) => s + netAmount(Number(item.amount), item.subcategory?.main_category?.deduction_rate),
        0
      );
      return sum + itemsNet;
    }, 0);

  let despesaMesAnterior = 0;
  for (const e of expenses) {
    if (e.confirmation_status === 'pending_confirmation') continue;
    const ccNormalized = normalizeCostCenterName(e.category?.cost_center?.name);
    if (ccNormalized === WITHDRAWAL_COST_CENTER) continue;
    for (const inst of e.installments ?? []) {
      const instMonth = inst.competence_month ?? e.competence_month;
      const instYear = inst.competence_year ?? e.competence_year;
      if (instMonth === prev.month && instYear === prev.year && inst.due_date <= prevEndDate) {
        despesaMesAnterior += Number(inst.amount);
      }
    }
  }

  const receitaMesAnterior = receitaMesAnteriorBruta;

  return { receitaMesAnterior, despesaMesAnterior };
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

export async function fetchCalendarData(
  month: number,
  year: number,
  revenues: Revenue[],
  expenses: Expense[]
): Promise<{ calendar: CalendarDayInfo[]; consecutiveEmptyDays: number }> {
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const revenueDates = new Set(revenues.map((r) => r.revenue_date));
  const expenseDates = new Set<string>();
  for (const e of expenses) {
    for (const inst of (e.installments ?? [])) {
      const instMonth = inst.competence_month ?? e.competence_month;
      const instYear = inst.competence_year ?? e.competence_year;
      if (instMonth === month && instYear === year && inst.payment_date) {
        expenseDates.add(inst.payment_date);
      }
    }
  }

  const calendar: CalendarDayInfo[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dateStr = date.toISOString().split('T')[0];
    const weekend = isWeekend(date);
    const hasRev = revenueDates.has(dateStr);
    const hasExp = expenseDates.has(dateStr);
    calendar.push({
      date: dateStr,
      day: d,
      isWeekend: weekend,
      isToday: isSameDay(date, today),
      hasRevenue: hasRev,
      hasExpense: hasExp,
      hasMovement: hasRev || hasExp,
      isWeekday: !weekend,
    });
  }

  const consecutiveEmptyDays = countConsecutiveEmptyWeekdays(calendar, todayStr);
  return { calendar, consecutiveEmptyDays };
}

function countConsecutiveEmptyWeekdays(calendar: CalendarDayInfo[], todayStr: string): number {
  let maxStreak = 0;
  let currentStreak = 0;
  for (const day of calendar) {
    if (day.date > todayStr) break;
    if (!day.isWeekday) {
      currentStreak = 0;
      continue;
    }
    if (day.hasMovement) {
      currentStreak = 0;
    } else {
      currentStreak++;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    }
  }
  return maxStreak;
}

export function generateInsights(
  kpis: DashboardKPIs,
  revenues: Revenue[],
  expenses: Expense[],
  budgets: Budget[],
  consecutiveEmptyDays: number
): HomeInsight[] {
  const insights: HomeInsight[] = [];
  const today = new Date().toISOString().split('T')[0];
  const dayOfWeek = new Date().getDay();
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

  // 1. No financial entries today
  const hasRevenueToday = revenues.some((r) => r.revenue_date === today);
  if (isWeekday && !hasRevenueToday) {
    insights.push({
      id: 'no-revenue-today',
      type: 'warning',
      title: 'Nenhum lançamento hoje',
      description: 'Não há receita registrada para hoje.',
      priority: 2,
      icon: 'alert-circle',
    });
  }

  // 2. Consecutive empty weekdays
  if (consecutiveEmptyDays >= 2) {
    insights.push({
      id: 'consecutive-empty',
      type: 'critical',
      title: `${consecutiveEmptyDays} dias úteis consecutivos sem movimentação`,
      description: `Existem ${consecutiveEmptyDays} dias úteis consecutivos sem lançamentos financeiros.`,
      priority: 1,
      icon: 'alert-triangle',
    });
  }

  // 3. Revenue below average
  if (kpis.receitaDiariaMedia > 0 && kpis.receitaAcumulada < kpis.receitaMesAnterior * 0.8 && kpis.receitaMesAnterior > 0) {
    insights.push({
      id: 'revenue-below-avg',
      type: 'warning',
      title: 'Receita abaixo da média',
      description: 'A receita do mês está abaixo de 80% do mês anterior.',
      priority: 3,
      icon: 'trending-down',
    });
  }

  // 4. Expenses above average
  if (kpis.despesaMesAnterior > 0 && kpis.despesaAcumulada > kpis.despesaMesAnterior * 1.2) {
    insights.push({
      id: 'expenses-above-avg',
      type: 'warning',
      title: 'Despesas acima da média',
      description: 'As despesas do mês superam em 20% o mês anterior.',
      priority: 3,
      icon: 'trending-up',
    });
  }

  // 5. Budget exceeded per category
  for (const b of budgets) {
    const actual = expenses
      .filter((e) => e.category_id === b.category_id)
      .reduce((s, e) => {
        const insts = (e.installments ?? []).filter((i) => i.competence_year === b.year && i.competence_month === b.month);
        return s + insts.reduce((sum, i) => sum + Number(i.amount), 0);
      }, 0);
    if (actual > Number(b.planned_amount)) {
      insights.push({
        id: `budget-exceeded-${b.id}`,
        type: 'warning',
        title: 'Categoria acima do orçamento',
        description: `"${b.category?.name ?? '-'}" ultrapassou o orçamento de ${formatCurrencyLocal(Number(b.planned_amount))}.`,
        priority: 4,
        icon: 'target',
      });
    }
  }

  // 6. Profit below target
  if (kpis.totalBudget > 0 && kpis.resultado < 0) {
    insights.push({
      id: 'profit-below-target',
      type: 'critical',
      title: 'Resultado negativo',
      description: 'O resultado operacional do mês está negativo.',
      priority: 1,
      icon: 'alert-triangle',
    });
  }

  // 7. Result worse than previous month
  if (kpis.resultadoMesAnterior > 0 && kpis.resultado < kpis.resultadoMesAnterior * 0.7) {
    insights.push({
      id: 'result-declining',
      type: 'warning',
      title: 'Resultado inferior ao mês anterior',
      description: 'O resultado caiu mais de 30% em relação ao mês anterior.',
      priority: 2,
      icon: 'trending-down',
    });
  }

  // 8. Revenue decelerating
  if (kpis.variacaoReceita < -10 && kpis.receitaMesAnterior > 0) {
    insights.push({
      id: 'revenue-decelerating',
      type: 'warning',
      title: 'Faturamento desacelerando',
      description: 'A receita caiu em relação ao mês anterior.',
      priority: 3,
      icon: 'trending-down',
    });
  }

  // 9. Positive: Revenue above average
  if (kpis.receitaMesAnterior > 0 && kpis.receitaAcumulada > kpis.receitaMesAnterior * 1.1) {
    insights.push({
      id: 'revenue-above-avg',
      type: 'positive',
      title: 'Receita acima da média',
      description: 'A receita do mês supera em 10% o mês anterior.',
      priority: 5,
      icon: 'trending-up',
    });
  }

  // 10. Positive: Result above target
  if (kpis.totalBudget > 0 && kpis.resultado > kpis.totalBudget * 0.1) {
    insights.push({
      id: 'result-above-target',
      type: 'positive',
      title: 'Resultado acima da meta',
      description: 'O resultado operacional supera a meta de orçamento.',
      priority: 5,
      icon: 'check-circle',
    });
  }

  // 11. Positive: Good margin
  if (kpis.margem > 20) {
    insights.push({
      id: 'good-margin',
      type: 'positive',
      title: 'Margem operacional saudável',
      description: `Margem operacional de ${kpis.margem.toFixed(1)}%.`,
      priority: 6,
      icon: 'percent',
    });
  }

  return insights.sort((a, b) => a.priority - b.priority).slice(0, 5);
}

function formatCurrencyLocal(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

export async function fetchHomeData(month: number, year: number): Promise<HomeData> {
  const prevMonthDate = month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
  const startDate = `${prevMonthDate.year}-${String(prevMonthDate.month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;

  // Must complete before fetchDashboardKPIs reads `budgets` below, so the
  // automatic suggestion (if any) is already there on the first load of the month.
  await applyAutomaticBudgets(year, month);

  const [kpisRaw, revenues, expenses, budgets] = await Promise.all([
    fetchDashboardKPIs(month, year),
    fetchRevenues({ startDate, endDate }),
    fetchExpenses({}),
    fetchBudgets(year, month),
  ]);

  const { receitaMesAnterior, despesaMesAnterior } = computeEquivalentPeriodBaseline(month, year, revenues, expenses);
  const resultadoMesAnterior = receitaMesAnterior - despesaMesAnterior;

  // A zero/unavailable baseline makes the percentage meaningless — flag it
  // instead of computing a misleading "+0,0%".
  const receitaComparavel = receitaMesAnterior > 0;
  const despesaComparavel = despesaMesAnterior > 0;
  const resultadoComparavel = resultadoMesAnterior !== 0;

  const variacaoReceita = receitaComparavel ? ((kpisRaw.receitaAcumulada - receitaMesAnterior) / receitaMesAnterior) * 100 : 0;
  const variacaoDespesa = despesaComparavel ? ((kpisRaw.despesaAcumulada - despesaMesAnterior) / despesaMesAnterior) * 100 : 0;
  const variacaoResultado = resultadoComparavel ? ((kpisRaw.resultado - resultadoMesAnterior) / Math.abs(resultadoMesAnterior)) * 100 : 0;

  const kpis: DashboardKPIs = {
    ...kpisRaw,
    receitaMesAnterior,
    despesaMesAnterior,
    resultadoMesAnterior,
    variacaoReceita,
    variacaoDespesa,
    variacaoResultado,
    receitaComparavel,
    despesaComparavel,
    resultadoComparavel,
  };

  const { calendar, consecutiveEmptyDays } = await fetchCalendarData(month, year, revenues, expenses);
  const insights = generateInsights(kpis, revenues, expenses, budgets, consecutiveEmptyDays);

  return { kpis, revenues, expenses, budgets, calendar, consecutiveEmptyDays, insights };
}

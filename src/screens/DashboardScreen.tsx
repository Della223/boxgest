import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { DollarSign, TrendingUp, ShoppingCart, Download, Target, Percent } from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { KPISkeleton, Skeleton } from '../components/ui/Skeleton';
import KPICard from '../components/ui/KPICard';
import {
  fetchDashboardKPIs, fetchRevenueByCategory, fetchRevenueBySubcategory, fetchExpenseByCategory,
  fetchMonthlyEvolution, fetchCostCenterDistribution,
} from '../services/dashboard.service';
import { formatCurrency, formatPercent, getCurrentCompetence, downloadCSV } from '../utils/format';
import type { DashboardKPIs } from '../types';

const CHART_COLORS = ['#1c66f5', '#10b981', '#f4930c', '#ef4444', '#5e80ff', '#34d399', '#fbbf24', '#f87171', '#80a1ff', '#6ee7b7'];

export default function DashboardScreen() {
  const toast = useToast();
  const { month: defaultMonth, year: defaultYear } = getCurrentCompetence();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [revenueByCat, setRevenueByCat] = useState<{ name: string; value: number }[]>([]);
  const [revenueBySub, setRevenueBySub] = useState<{ name: string; value: number }[]>([]);
  const [expenseByCat, setExpenseByCat] = useState<{ name: string; value: number }[]>([]);
  const [monthlyData, setMonthlyData] = useState<{ month: string; receita: number; despesa: number }[]>([]);
  const [costCenterData, setCostCenterData] = useState<{ name: string; value: number }[]>([]);

  const [filterMonth, setFilterMonth] = useState(defaultMonth);
  const [filterYear, setFilterYear] = useState(defaultYear);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
     const [k, rev, revSub, exp, monthly, cc] = await Promise.all([
        fetchDashboardKPIs(filterMonth, filterYear),
        fetchRevenueByCategory(filterMonth, filterYear),
        fetchRevenueBySubcategory(filterMonth, filterYear),
        fetchExpenseByCategory(filterMonth, filterYear),
        fetchMonthlyEvolution(filterYear),
        fetchCostCenterDistribution(filterMonth, filterYear),
      ]);
      setKpis(k);
      setRevenueByCat(rev);
      setRevenueBySub(revSub);
      setExpenseByCat(exp);
      setMonthlyData(monthly);
      setCostCenterData(cc);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [filterMonth, filterYear]);

  useEffect(() => { loadData(); }, [loadData]);

  const hasData = useMemo(() => {
    return (kpis?.receitaAcumulada ?? 0) > 0 || (kpis?.despesaAcumulada ?? 0) > 0;
  }, [kpis]);

  const handleExport = () => {
    if (!kpis) return;
    const headers = ['Indicador', 'Valor'];
    const rows: (string | number)[][] = [
      ['Receita Acumulada', formatCurrency(kpis.receitaAcumulada)],
      ['Despesa Acumulada', formatCurrency(kpis.despesaAcumulada)],
      ['Resultado', formatCurrency(kpis.resultado)],
      ['Projeção', formatCurrency(kpis.projecao)],
      ['Ticket Médio', formatCurrency(kpis.ticketMedio)],
      ['Quantidade de Vendas', kpis.quantidadeVendas],
      ['Deduções de Receita (Antecipação)', formatCurrency(kpis.deducoesReceita)],
    ];
    downloadCSV('dashboard.csv', headers, rows);
    toast.success('Exportação concluída com sucesso.');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="card p-4"><Skeleton className="h-10 w-full" /></div>
        <KPISkeleton />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-80 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorState message="Não foi possível carregar os indicadores." onRetry={loadData} />;
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-ink-500 mb-1">Competência (Mês)</label>
            <select value={filterMonth} onChange={(e) => setFilterMonth(Number(e.target.value))} className="input-field">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-500 mb-1">Ano</label>
            <select value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value))} className="input-field">
              {Array.from({ length: 5 }, (_, i) => defaultYear - 2 + i).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex-1" />
          <button onClick={handleExport} className="btn-secondary"><Download className="h-4 w-4" />Exportar</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard title="Receita Acumulada" value={formatCurrency(kpis?.receitaAcumulada ?? 0)} icon={DollarSign} iconColor="text-success-600" iconBg="bg-success-50" />
        <KPICard title="Despesa Acumulada" value={formatCurrency(kpis?.despesaAcumulada ?? 0)} icon={DollarSign} iconColor="text-error-600" iconBg="bg-error-50" />
        <KPICard title="Resultado" value={formatCurrency(kpis?.resultado ?? 0)} icon={TrendingUp} iconColor={(kpis?.resultado ?? 0) >= 0 ? 'text-success-600' : 'text-error-600'} iconBg={(kpis?.resultado ?? 0) >= 0 ? 'bg-success-50' : 'bg-error-50'} />
        <KPICard title="Projeção de Fechamento" value={formatCurrency(kpis?.projecao ?? 0)} icon={Target} iconColor="text-primary-600" iconBg="bg-primary-50" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard title="Ticket Médio" value={formatCurrency(kpis?.ticketMedio ?? 0)} icon={ShoppingCart} iconColor="text-accent-600" iconBg="bg-accent-50" />
        <KPICard title="Qtd. Vendas" value={String(kpis?.quantidadeVendas ?? 0)} icon={ShoppingCart} iconColor="text-secondary-600" iconBg="bg-secondary-50" />
        <KPICard
          title="Deduções de Receita (Antecipação)"
          value={formatCurrency(kpis?.deducoesReceita ?? 0)}
          icon={Percent}
          iconColor="text-warning-600"
          iconBg="bg-warning-50"
          comparison="já refletido na Receita Acumulada"
        />
      </div>

      {!hasData ? (
        <EmptyState title="Não existem dados para os filtros selecionados." description="Registre receitas e despesas para visualizar os indicadores." />
      ) : (
        <>
          {/* Monthly Evolution Chart */}
          <div className="card p-5">
            <h3 className="text-base font-semibold text-ink-900 mb-4">Evolução Mensal — Receita x Despesa ({filterYear})</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => formatCurrency(Number(v))} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
                <Legend wrapperStyle={{ fontSize: '13px' }} />
                <Bar dataKey="receita" name="Receita" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="despesa" name="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Revenue and Expense by Category */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="card p-5">
              <h3 className="text-base font-semibold text-ink-900 mb-4">Receita por Categoria</h3>
              {revenueByCat.length === 0 ? (
                <EmptyState title="Sem dados de receita para o período." />
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={revenueByCat} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} label={(entry) => `${entry.name}`}>
                        {revenueByCat.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => formatCurrency(Number(v))} contentStyle={{ borderRadius: '8px', fontSize: '13px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-3 space-y-2">
                    {revenueByCat.map((c, i) => {
                      const total = revenueByCat.reduce((s, x) => s + x.value, 0);
                      const pct = total > 0 ? (c.value / total) * 100 : 0;
                      return (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                            <span className="text-ink-700">{c.name}</span>
                          </div>
                          <span className="font-medium text-ink-900">{formatCurrency(c.value)} ({formatPercent(pct)})</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="card p-5">
              <h3 className="text-base font-semibold text-ink-900 mb-4">Despesa por Categoria</h3>
              {expenseByCat.length === 0 ? (
                <EmptyState title="Sem dados de despesa para o período." />
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={expenseByCat} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} label={(entry) => `${entry.name}`}>
                        {expenseByCat.map((_, i) => <Cell key={i} fill={CHART_COLORS[(i + 4) % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => formatCurrency(Number(v))} contentStyle={{ borderRadius: '8px', fontSize: '13px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-3 space-y-2">
                    {expenseByCat.map((c, i) => {
                      const total = expenseByCat.reduce((s, x) => s + x.value, 0);
                      const pct = total > 0 ? (c.value / total) * 100 : 0;
                      return (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: CHART_COLORS[(i + 4) % CHART_COLORS.length] }} />
                            <span className="text-ink-700">{c.name}</span>
                          </div>
                          <span className="font-medium text-ink-900">{formatCurrency(c.value)} ({formatPercent(pct)})</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Revenue by Subcategory */}
          <div className="card p-5">
            <h3 className="text-base font-semibold text-ink-900 mb-4">Receita por Subcategoria</h3>
            {revenueBySub.length === 0 ? (
              <EmptyState title="Sem dados de receita para o período." />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={revenueBySub} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} label={(entry) => `${entry.name}`}>
                      {revenueBySub.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => formatCurrency(Number(v))} contentStyle={{ borderRadius: '8px', fontSize: '13px' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                  {revenueBySub.map((s, i) => {
                    const total = revenueBySub.reduce((sum, x) => sum + x.value, 0);
                    const pct = total > 0 ? (s.value / total) * 100 : 0;
                    return (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                          <span className="text-ink-700">{s.name}</span>
                        </div>
                        <span className="font-medium text-ink-900 whitespace-nowrap">{formatCurrency(s.value)} ({formatPercent(pct)})</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Cost Center Distribution + Monthly Line Chart */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="card p-5">
              <h3 className="text-base font-semibold text-ink-900 mb-4">Centros de Custo</h3>
              {costCenterData.length === 0 ? (
                <EmptyState title="Sem dados de centro de custo." />
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={costCenterData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} label={(entry) => `${entry.name}`}>
                        {costCenterData.map((_, i) => <Cell key={i} fill={CHART_COLORS[(i + 2) % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => formatCurrency(Number(v))} contentStyle={{ borderRadius: '8px', fontSize: '13px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-3 space-y-2">
                    {costCenterData.map((cc, i) => {
                      const total = costCenterData.reduce((s, c) => s + c.value, 0);
                      const pct = total > 0 ? (cc.value / total) * 100 : 0;
                      return (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: CHART_COLORS[(i + 2) % CHART_COLORS.length] }} />
                            <span className="text-ink-700">{cc.name}</span>
                          </div>
                          <span className="font-medium text-ink-900">{formatCurrency(cc.value)} ({formatPercent(pct)})</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="card p-5">
              <h3 className="text-base font-semibold text-ink-900 mb-4">Tendência Mensal</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => formatCurrency(Number(v))} contentStyle={{ borderRadius: '8px', fontSize: '13px' }} />
                  <Legend wrapperStyle={{ fontSize: '13px' }} />
                  <Line type="monotone" dataKey="receita" name="Receita" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="despesa" name="Despesa" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

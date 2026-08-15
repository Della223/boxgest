import { useState, useCallback, useMemo } from 'react';
import {
  Download, Search, FileText, BarChart3, DollarSign, Receipt,
  CreditCard, Building2, Shield, TrendingUp, Printer,
} from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import Badge from '../components/ui/Badge';
import { fetchRevenues } from '../services/revenue.service';
import { fetchExpenses } from '../services/expense.service';
import { fetchBudgets } from '../services/budget.service';
import { fetchDRE } from '../services/dre.service';
import { fetchAuditLogs } from '../services/audit.service';
import { formatCurrency, formatDate, formatDateTime, getCurrentCompetence, getCompetenceString, downloadCSV, printContent } from '../utils/format';
import { netAmount } from '../utils/deduction';
import type { Revenue, Expense, Budget, AuditLog } from '../types';

interface ReportDef {
  id: string;
  name: string;
  description: string;
  icon: typeof FileText;
  category: 'Financeiro' | 'Comercial' | 'Gerencial' | 'Operacional';
}

const REPORTS: ReportDef[] = [
  { id: 'receitas', name: 'Receitas', description: 'Relatório detalhado de todas as receitas', icon: DollarSign, category: 'Comercial' },
  { id: 'despesas', name: 'Despesas', description: 'Relatório detalhado de todas as despesas', icon: Receipt, category: 'Financeiro' },
  { id: 'dre', name: 'DRE', description: 'Demonstração do Resultado do Exercício', icon: BarChart3, category: 'Financeiro' },
  { id: 'orcamentos', name: 'Orçamentos', description: 'Orçado x Realizado por categoria', icon: TrendingUp, category: 'Gerencial' },
  { id: 'fluxo-financeiro', name: 'Fluxo Financeiro', description: 'Fluxo de pagamentos e recebimentos', icon: CreditCard, category: 'Financeiro' },
  { id: 'despesas-categoria', name: 'Despesas por Categoria', description: 'Agrupamento de despesas por categoria', icon: BarChart3, category: 'Financeiro' },
  { id: 'receitas-categoria', name: 'Receitas por Categoria', description: 'Agrupamento de receitas por categoria', icon: DollarSign, category: 'Comercial' },
  { id: 'centros-custo', name: 'Centros de Custo', description: 'Distribuição de despesas por centro de custo', icon: Building2, category: 'Financeiro' },
  { id: 'auditoria', name: 'Auditoria', description: 'Log de operações do sistema', icon: Shield, category: 'Operacional' },
];

export default function RelatoriosScreen() {
  const toast = useToast();
  const { month: defaultMonth, year: defaultYear } = getCurrentCompetence();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [reportData, setReportData] = useState<{ headers: string[]; rows: (string | number)[][]; title: string } | null>(null);

  const [filterMonth, setFilterMonth] = useState(defaultMonth);
  const [filterYear, setFilterYear] = useState(defaultYear);
  const [searchText, setSearchText] = useState('');

  const filteredReports = useMemo(() => {
    if (!searchText) return REPORTS;
    const search = searchText.toLowerCase();
    return REPORTS.filter((r) => r.name.toLowerCase().includes(search) || r.description.toLowerCase().includes(search));
  }, [searchText]);

  const generateReport = useCallback(async (reportId: string) => {
    setLoading(true);
    setError(false);
    setSelectedReport(reportId);
    setReportData(null);

    try {
      let headers: string[] = [];
      let rows: (string | number)[][] = [];
      let title = '';

     if (reportId === 'receitas') {
        const data = await fetchRevenues({});
        title = `Relatório de Receitas — ${getCompetenceString(filterMonth, filterYear)}`;
        headers = ['Data', 'Categoria Principal', 'Subcategoria', 'Quantidade', 'Valor Bruto', 'Valor Líquido', 'Ticket Médio', 'Observações', 'Usuário'];
        // Uma venda pode ter vários itens (subcategorias) — o relatório detalha por item.
        rows = data.flatMap((r: Revenue) =>
          (r.items ?? []).map((item) => [
            formatDate(r.revenue_date), item.subcategory?.main_category?.name ?? '-', item.subcategory?.name ?? '-', item.quantity,
            formatCurrency(Number(item.amount)),
            formatCurrency(netAmount(Number(item.amount), item.subcategory?.main_category?.deduction_rate)),
            item.quantity > 0 ? formatCurrency(Number(item.amount) / item.quantity) : '-',
            r.notes ?? '-', r.user?.name ?? '-',
          ])
        );
      } else if (reportId === 'despesas') {
        const data = await fetchExpenses({});
        title = `Relatório de Despesas — ${getCompetenceString(filterMonth, filterYear)}`;
        headers = ['Competência', 'Fornecedor', 'Centro de Custo', 'Categoria', 'Subcategoria', 'Valor Total', 'Parcelas', 'Data Pagamento'];
        rows = data.map((e: Expense) => {
          return [
            getCompetenceString(e.competence_month, e.competence_year),
            e.supplier ?? '-', e.category?.cost_center?.name ?? '-', e.category?.name ?? '-',
            e.subcategory?.name ?? '-',
            formatCurrency(Number(e.total_amount)), `${e.installment_count}x`,
            e.payment_date ? formatDate(e.payment_date) : '-',
          ];
        });
      } else if (reportId === 'dre') {
        const data = await fetchDRE(filterMonth, filterYear);
        title = `DRE — ${getCompetenceString(filterMonth, filterYear)}`;
        headers = ['Linha', 'Valor'];
        rows = [
          ['Receita Bruta', formatCurrency(data.receitaBruta)],
          ...data.receitaPorCategoria.map((c) => [`  ${c.category}`, formatCurrency(c.amount)]),
          ['(-) Deduções', formatCurrency(data.deducoes)],
          ...data.deducoesPorCategoria.map((d) => [`  ${d.name}`, formatCurrency(d.amount)]),
          ['(=) Receita Líquida', formatCurrency(data.receitaLiquida)],
          ['(-) Custo Direto', formatCurrency(data.custosDiretos)],
          ...data.custosDiretosPorCategoria.map((c) => [`  ${c.category}`, formatCurrency(c.amount)]),
          ['(=) Lucro Bruto', formatCurrency(data.lucroBruto)],
          ['(-) Despesas Operacionais', formatCurrency(data.despesasOperacionais)],
          ...data.despesasPorCategoria.map((c) => [`  ${c.category}`, formatCurrency(c.amount)]),
          ['(=) Resultado Operacional', formatCurrency(data.resultadoOperacional)],
          ['(-) Impostos', formatCurrency(data.irCsll)],
          ['(=) Resultado Líquido', formatCurrency(data.resultadoLiquido)],
          ['Margem Bruta', `${data.margemBruta.toFixed(2)}%`],
          ['Margem Operacional', `${data.margemOperacional.toFixed(2)}%`],
          ['Margem Líquida', `${data.margemLiquida.toFixed(2)}%`],
        ];
      } else if (reportId === 'orcamentos') {
        const data = await fetchBudgets(filterYear, filterMonth);
        const exps = await fetchExpenses({ competenceYear: filterYear, competenceMonth: filterMonth });
        title = `Orçados x Realizado — ${getCompetenceString(filterMonth, filterYear)}`;
        headers = ['Categoria', 'Orçado', 'Realizado', 'Diferença', 'Execução %'];
        rows = data.map((b: Budget) => {
          const actual = exps.filter((e) => e.category_id === b.category_id)
            .reduce((s, e) => {
              const insts = (e.installments ?? []).filter((i) => i.competence_month === filterMonth && i.competence_year === filterYear);
              return s + insts.reduce((sum, i) => sum + Number(i.amount), 0);
            }, 0);
          return [
            b.category?.name ?? '-',
            formatCurrency(Number(b.planned_amount)),
            formatCurrency(actual),
            formatCurrency(actual - Number(b.planned_amount)),
            b.planned_amount > 0 ? `${((actual / Number(b.planned_amount)) * 100).toFixed(2)}%` : '0%',
          ];
        });
      } else if (reportId === 'fluxo-financeiro') {
        const [revs, exps] = await Promise.all([fetchRevenues({}), fetchExpenses({})]);
        title = `Fluxo Financeiro — ${getCompetenceString(filterMonth, filterYear)}`;
        headers = ['Data', 'Tipo', 'Descrição', 'Valor'];
        const revRows = revs.map((r: Revenue) => [
          formatDate(r.revenue_date), 'Receita',
          r.main_category?.name ?? (r.items?.length ? 'Múltiplas categorias' : '-'),
          formatCurrency(Number(r.amount)),
        ]);
        const expRows = exps.flatMap((e: Expense) =>
          (e.installments ?? []).map((i) => [
            formatDate(i.payment_date ?? i.due_date), 'Despesa', `${e.supplier ?? '-'} (${i.installment_number}/${e.installment_count})`,
            formatCurrency(Number(i.amount)),
          ])
        );
        rows = [...revRows, ...expRows].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      } else if (reportId === 'despesas-categoria') {
        const exps = await fetchExpenses({ competenceMonth: filterMonth, competenceYear: filterYear });
        title = `Despesas por Categoria — ${getCompetenceString(filterMonth, filterYear)}`;
        headers = ['Categoria', 'Total'];
        const grouped: Record<string, number> = {};
        for (const e of exps) {
          const cat = e.category?.name ?? '-';
          const instAmount = (e.installments ?? [])
            .filter(i => i.competence_month === filterMonth && i.competence_year === filterYear)
            .reduce((s, i) => s + Number(i.amount), 0);
          grouped[cat] = (grouped[cat] || 0) + instAmount;
        }
        rows = Object.entries(grouped).map(([cat, total]) => [cat, formatCurrency(total)]);
      } else if (reportId === 'receitas-categoria') {
        const revs = await fetchRevenues({});
        title = `Receitas por Categoria — ${getCompetenceString(filterMonth, filterYear)}`;
        headers = ['Categoria', 'Total Bruto', 'Total Líquido', 'Quantidade'];
        const grouped: Record<string, { total: number; totalLiquido: number; qty: number }> = {};
        for (const r of revs) {
          for (const item of (r.items ?? [])) {
            const cat = item.subcategory?.main_category?.name ?? '-';
            if (!grouped[cat]) grouped[cat] = { total: 0, totalLiquido: 0, qty: 0 };
            grouped[cat].total += Number(item.amount);
            grouped[cat].totalLiquido += netAmount(Number(item.amount), item.subcategory?.main_category?.deduction_rate);
            grouped[cat].qty += item.quantity;
          }
        }
        rows = Object.entries(grouped).map(([cat, data]) => [cat, formatCurrency(data.total), formatCurrency(data.totalLiquido), data.qty]);
      } else if (reportId === 'centros-custo') {
        const exps = await fetchExpenses({ competenceMonth: filterMonth, competenceYear: filterYear });
        title = `Centros de Custo — ${getCompetenceString(filterMonth, filterYear)}`;
        headers = ['Centro de Custo', 'Total'];
        const grouped: Record<string, number> = {};
        for (const e of exps) {
          const cc = e.category?.cost_center?.name ?? '-';
          const instAmount = (e.installments ?? [])
            .filter(i => i.competence_month === filterMonth && i.competence_year === filterYear)
            .reduce((s, i) => s + Number(i.amount), 0);
          grouped[cc] = (grouped[cc] || 0) + instAmount;
        }
        rows = Object.entries(grouped).map(([cc, total]) => [cc, formatCurrency(total)]);
      } else if (reportId === 'auditoria') {
        const logs = await fetchAuditLogs(100);
        title = 'Relatório de Auditoria';
        headers = ['Data/Hora', 'Usuário', 'Módulo', 'Operação', 'ID do Registro'];
        rows = logs.map((l: AuditLog) => [
          formatDateTime(l.created_at), l.user?.name ?? '-', l.module, l.operation, l.record_id ?? '-',
        ]);
      }

      setReportData({ headers, rows, title });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [filterMonth, filterYear]);

  const handleExportCSV = () => {
    if (!reportData) return;
    downloadCSV(`${selectedReport}.csv`, reportData.headers, reportData.rows);
    toast.success('Exportação concluída com sucesso.');
  };

  const handlePrint = () => {
    if (!reportData) return;
    const tableHtml = `<table><thead><tr>${reportData.headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${reportData.rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    printContent(reportData.title, tableHtml);
  };

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
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-ink-500 mb-1">Buscar Relatório</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
              <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Buscar..." className="input-field pl-10" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Report catalog */}
        <div className="lg:col-span-1">
          <h3 className="text-sm font-semibold text-ink-700 mb-3">Catálogo de Relatórios</h3>
          <div className="space-y-2">
            {filteredReports.map((r) => {
              const Icon = r.icon;
              const isActive = selectedReport === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => generateReport(r.id)}
                  className={`w-full flex items-start gap-3 rounded-lg p-3 text-left transition-all ${
                    isActive ? 'bg-primary-50 ring-1 ring-primary-200' : 'bg-white ring-1 ring-ink-200 hover:bg-ink-50'
                  }`}
                >
                  <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${isActive ? 'bg-primary-600 text-white' : 'bg-ink-100 text-ink-500'}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${isActive ? 'text-primary-900' : 'text-ink-900'}`}>{r.name}</p>
                    <p className="text-xs text-ink-500 truncate">{r.description}</p>
                    <Badge variant="neutral">{r.category}</Badge>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Report visualization */}
        <div className="lg:col-span-2">
          {!selectedReport ? (
            <EmptyState title="Selecione um relatório" description="Escolha um relatório do catálogo para visualizar." icon={<FileText className="h-8 w-8 text-ink-400" />} />
          ) : loading ? (
            <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
          ) : error ? (
            <ErrorState message="Não foi possível gerar o relatório." onRetry={() => generateReport(selectedReport)} />
          ) : reportData && reportData.rows.length === 0 ? (
            <EmptyState title="Nenhum registro encontrado para os filtros selecionados." />
          ) : reportData ? (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-ink-200 bg-ink-50 px-5 py-3">
                <h3 className="text-sm font-bold text-ink-900">{reportData.title}</h3>
                <div className="flex gap-2">
                  <button onClick={handleExportCSV} className="btn-secondary text-xs"><Download className="h-3.5 w-3.5" />CSV</button>
                  <button onClick={handlePrint} className="btn-secondary text-xs"><Printer className="h-3.5 w-3.5" />Imprimir</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ink-200">
                  <thead className="bg-ink-50">
                    <tr>
                      {reportData.headers.map((h, i) => (
                        <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-ink-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {reportData.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-ink-50/50">
                        {row.map((cell, j) => (
                          <td key={j} className="px-4 py-2.5 text-sm text-ink-700 whitespace-nowrap">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-ink-200 bg-ink-50 px-5 py-2.5 text-xs text-ink-500">
                Gerado em {formatDateTime(new Date())} • {reportData.rows.length} registro(s)
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

import { Fragment, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Download, Search, Pencil, Trash2, Eye, DollarSign, ShoppingCart, TrendingUp, Calendar, History,
  RefreshCw, ChevronRight, ChevronDown, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { KPISkeleton, TableSkeleton } from '../components/ui/Skeleton';
import KPICard from '../components/ui/KPICard';
import {
  fetchRevenues, createRevenue, updateRevenueHeader, recalculateRevenueItems, deleteRevenue,
  fetchRevenueMainCategories, fetchRevenueSubcategories, createRevenueSubcategory,
} from '../services/revenue.service';
import { createAuditLog } from '../services/audit.service';
import { logChanges, fetchChangeHistory } from '../services/change-history.service';
import { formatCurrency, formatDate, formatNumber, downloadCSV, getCurrentCompetence } from '../utils/format';
import { netAmount } from '../utils/deduction';
import type { Revenue, RevenueMainCategory, RevenueSubcategory, ChangeHistory } from '../types';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const STORAGE_KEY = 'carcenter_comercial_filters';

interface FilterState {
  competenceMonth: string;
  competenceYear: string;
  mainCategoryId: string;
  subcategoryId: string;
  searchText: string;
}

interface SaleItemForm {
  subcategory_id: string;
  quantity: number;
  amount: string;
}

function getDefaultFilters(): FilterState {
  const { month, year } = getCurrentCompetence();
  return {
    competenceMonth: String(month),
    competenceYear: String(year),
    mainCategoryId: '',
    subcategoryId: '',
    searchText: '',
  };
}

function blankItem(): SaleItemForm {
  return { subcategory_id: '', quantity: 1, amount: '' };
}

function itemsTotal(items: SaleItemForm[]): number {
  return items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
}

type ItemsSetter = React.Dispatch<React.SetStateAction<SaleItemForm[]>>;

function addItem(setItems: ItemsSetter) {
  setItems((prev) => [...prev, blankItem()]);
}
function removeItem(setItems: ItemsSetter, index: number) {
  setItems((prev) => prev.filter((_, i) => i !== index));
}
function changeItem(setItems: ItemsSetter, index: number, patch: Partial<SaleItemForm>) {
  setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
}

export default function ComercialScreen() {
  const { user } = useAuth();
  const toast = useToast();

  const [filters, setFilters] = useState<FilterState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : getDefaultFilters();
    } catch {
      return getDefaultFilters();
    }
  });

  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revenues, setRevenues] = useState<Revenue[]>([]);
  const [mainCategories, setMainCategories] = useState<RevenueMainCategory[]>([]);
  const [subcategories, setSubcategories] = useState<RevenueSubcategory[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRevenue, setEditingRevenue] = useState<Revenue | null>(null);
  const [form, setForm] = useState({
    competence_month: 0,
    competence_year: 0,
    revenue_date: '',
    main_category_id: '',
    notes: '',
  });
  const [items, setItems] = useState<SaleItemForm[]>([blankItem()]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showNewSubcategory, setShowNewSubcategory] = useState(false);
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [creatingSubcategory, setCreatingSubcategory] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Revenue | null>(null);
  const [viewTarget, setViewTarget] = useState<Revenue | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Revenue | null>(null);
  const [history, setHistory] = useState<ChangeHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Recalculate items modal
  const [recalcTarget, setRecalcTarget] = useState<Revenue | null>(null);
  const [recalcItems, setRecalcItems] = useState<SaleItemForm[]>([]);
  const [recalcErrors, setRecalcErrors] = useState<Record<string, string>>({});
  const [recalcSaving, setRecalcSaving] = useState(false);

  // Persist filters
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [revs, mcats, scats] = await Promise.all([
        fetchRevenues({}),
        fetchRevenueMainCategories(),
        fetchRevenueSubcategories(),
      ]);
      setRevenues(revs);
      setMainCategories(mcats);
      setSubcategories(scats);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Subcategories available for the sale's chosen main category
  const formSubcategories = useMemo(() => {
    if (!form.main_category_id) return [];
    return subcategories.filter((s) => s.main_category_id === form.main_category_id);
  }, [subcategories, form.main_category_id]);

  const recalcSubcategories = useMemo(() => {
    if (!recalcTarget?.main_category_id) return [];
    return subcategories.filter((s) => s.main_category_id === recalcTarget.main_category_id);
  }, [subcategories, recalcTarget]);

  // Filter subcategories for filter bar
  const filterSubcategories = useMemo(() => {
    if (!filters.mainCategoryId) return [];
    return subcategories.filter((s) => s.main_category_id === filters.mainCategoryId);
  }, [subcategories, filters.mainCategoryId]);

  const filteredRevenues = useMemo(() => {
    return revenues.filter((r) => {
      if (filters.mainCategoryId && r.main_category_id !== filters.mainCategoryId) return false;
      if (filters.subcategoryId && !(r.items ?? []).some((i) => i.subcategory_id === filters.subcategoryId)) return false;
      if (dateStart && r.revenue_date < dateStart) return false;
      if (dateEnd && r.revenue_date > dateEnd) return false;
      if (filters.searchText) {
        const search = filters.searchText.toLowerCase();
        if (
          !r.notes?.toLowerCase().includes(search) &&
          !r.main_category?.name.toLowerCase().includes(search) &&
          !(r.items ?? []).some((i) => i.subcategory?.name.toLowerCase().includes(search))
        ) return false;
      }
      return true;
    });
  }, [revenues, filters, dateStart, dateEnd]);

  const kpis = useMemo(() => {
    const totalRevenue = filteredRevenues.reduce((s, r) => s + Number(r.amount), 0);
    // Uma venda (linha de `revenues`) conta como 1, não importa quantos itens tenha.
    const totalSales = filteredRevenues.length;
    const ticketMedio = totalSales > 0 ? totalRevenue / totalSales : 0;
    const elapsedDays = new Date().getDate();
    const mediaDiaria = elapsedDays > 0 ? totalRevenue / elapsedDays : 0;
    return { totalRevenue, totalSales, ticketMedio, mediaDiaria };
  }, [filteredRevenues]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleOpenNew = () => {
    const { month, year } = getCurrentCompetence();
    setEditingRevenue(null);
    setForm({
      competence_month: month,
      competence_year: year,
      revenue_date: new Date().toISOString().split('T')[0],
      main_category_id: '',
      notes: '',
    });
    setItems([blankItem()]);
    setFormErrors({});
    setShowNewSubcategory(false);
    setNewSubcategoryName('');
    setModalOpen(true);
  };

  const handleOpenEdit = (revenue: Revenue) => {
    setEditingRevenue(revenue);
    setForm({
      competence_month: revenue.competence_month ?? getCurrentCompetence().month,
      competence_year: revenue.competence_year ?? getCurrentCompetence().year,
      revenue_date: revenue.revenue_date,
      main_category_id: revenue.main_category_id ?? '',
      notes: revenue.notes ?? '',
    });
    setItems((revenue.items ?? []).map((i) => ({ subcategory_id: i.subcategory_id, quantity: i.quantity, amount: String(i.amount) })));
    setFormErrors({});
    setShowNewSubcategory(false);
    setNewSubcategoryName('');
    setModalOpen(true);
  };

  const handleCreateSubcategory = async () => {
    if (!form.main_category_id) return;
    const name = newSubcategoryName.trim();
    if (!name) return;
    setCreatingSubcategory(true);
    try {
      const created = await createRevenueSubcategory(form.main_category_id, name);
      setSubcategories((prev) => [...prev, created]);
      setShowNewSubcategory(false);
      setNewSubcategoryName('');
      toast.success('Subcategoria criada com sucesso.');
    } catch {
      toast.error('Não foi possível criar a subcategoria.');
    } finally {
      setCreatingSubcategory(false);
    }
  };

  const validateItems = (list: SaleItemForm[], errors: Record<string, string>) => {
    if (list.length === 0) errors.items = 'Adicione pelo menos um item.';
    list.forEach((item, i) => {
      if (!item.subcategory_id) errors[`item_${i}_subcategory`] = 'Subcategoria é obrigatória.';
      if (item.quantity < 0) errors[`item_${i}_quantity`] = 'Quantidade deve ser maior ou igual a zero.';
      if (!item.amount || Number(item.amount) <= 0) errors[`item_${i}_amount`] = 'Valor deve ser maior que zero.';
    });
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!form.competence_month || !form.competence_year) errors.competence = 'Competência é obrigatória.';
    if (!form.revenue_date) errors.revenue_date = 'Data é obrigatória.';
    else if (form.revenue_date > new Date().toISOString().split('T')[0]) errors.revenue_date = 'Data não pode ser futura.';
    if (!form.main_category_id) errors.main_category_id = 'Categoria principal é obrigatória.';
    if (!editingRevenue) validateItems(items, errors);
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      const auditUser = user?.id ?? null;

      if (editingRevenue) {
        const oldValues: Record<string, unknown> = {
          competence_month: editingRevenue.competence_month,
          competence_year: editingRevenue.competence_year,
          revenue_date: editingRevenue.revenue_date,
          main_category_id: editingRevenue.main_category_id,
          notes: editingRevenue.notes,
        };
        const newValues: Record<string, unknown> = {
          competence_month: form.competence_month,
          competence_year: form.competence_year,
          revenue_date: form.revenue_date,
          main_category_id: form.main_category_id,
          notes: form.notes || null,
        };

        await updateRevenueHeader(editingRevenue.id, {
          revenue_date: form.revenue_date,
          competence_month: form.competence_month,
          competence_year: form.competence_year,
          main_category_id: form.main_category_id,
          notes: form.notes || null,
        });
        await logChanges('revenues', editingRevenue.id, auditUser, oldValues, newValues);
        await createAuditLog(auditUser, 'comercial', 'update', editingRevenue.id, oldValues, newValues);
        toast.success('Venda atualizada com sucesso.');
      } else {
        const itemInputs = items.map((item) => ({
          subcategory_id: item.subcategory_id,
          quantity: Number(item.quantity),
          amount: Number(item.amount),
        }));
        const created = await createRevenue({
          revenue_date: form.revenue_date,
          competence_month: form.competence_month,
          competence_year: form.competence_year,
          main_category_id: form.main_category_id,
          notes: form.notes || undefined,
          created_by: auditUser ?? undefined,
          items: itemInputs,
        });
        await createAuditLog(auditUser, 'comercial', 'create', created.id, null, { ...form, items: itemInputs });
        toast.success('Venda registrada com sucesso.');
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      toast.error('Não foi possível salvar a venda.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteRevenue(deleteTarget.id);
      await createAuditLog(user?.id ?? null, 'comercial', 'delete', deleteTarget.id, null, null);
      toast.success('Venda removida com sucesso.');
      await loadData();
    } catch {
      toast.error('Não foi possível excluir a venda.');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleOpenRecalc = (revenue: Revenue) => {
    setRecalcTarget(revenue);
    setRecalcItems((revenue.items ?? []).map((i) => ({ subcategory_id: i.subcategory_id, quantity: i.quantity, amount: String(i.amount) })));
    setRecalcErrors({});
  };

  const handleRecalcSave = async () => {
    if (!recalcTarget) return;
    const errors: Record<string, string> = {};
    validateItems(recalcItems, errors);
    setRecalcErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setRecalcSaving(true);
    try {
      const oldValues = {
        items_count: recalcTarget.items?.length ?? 0,
        amount: recalcTarget.amount,
      };
      const itemInputs = recalcItems.map((item) => ({
        subcategory_id: item.subcategory_id,
        quantity: Number(item.quantity),
        amount: Number(item.amount),
      }));
      const newValues = {
        items_count: itemInputs.length,
        amount: itemInputs.reduce((s, i) => s + i.amount, 0),
      };

      await recalculateRevenueItems(recalcTarget.id, itemInputs);
      await logChanges('revenues', recalcTarget.id, user?.id ?? null, oldValues, newValues);
      await createAuditLog(user?.id ?? null, 'comercial', 'recalculate_items', recalcTarget.id, oldValues, newValues);
      toast.success('Itens da venda recalculados com sucesso.');
      setRecalcTarget(null);
      await loadData();
    } catch (err) {
      toast.error('Erro ao recalcular os itens da venda.');
      console.error(err);
    } finally {
      setRecalcSaving(false);
    }
  };

  const handleOpenHistory = async (revenue: Revenue) => {
    setHistoryTarget(revenue);
    setHistoryLoading(true);
    try {
      const data = await fetchChangeHistory('revenues', revenue.id);
      setHistory(data);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleExport = () => {
    const headers = ['Competência', 'Data', 'Categoria Principal', 'Subcategoria', 'Quantidade', 'Valor Bruto', 'Valor Líquido', 'Observações', 'Usuário'];
    const rows = filteredRevenues.flatMap((r) =>
      (r.items ?? []).map((item) => [
        r.competence_month && r.competence_year ? `${String(r.competence_month).padStart(2, '0')}/${r.competence_year}` : '-',
        formatDate(r.revenue_date),
        r.main_category?.name ?? '-',
        item.subcategory?.name ?? '-',
        item.quantity,
        formatCurrency(Number(item.amount)),
        formatCurrency(netAmount(Number(item.amount), r.main_category?.deduction_rate)),
        r.notes ?? '',
        r.user?.name ?? '-',
      ])
    );
    downloadCSV('receitas.csv', headers, rows);
    toast.success('Exportação concluída com sucesso.');
  };

  const handleClearFilters = () => {
    setFilters(getDefaultFilters());
    setDateStart('');
    setDateEnd('');
  };

  const fieldLabels: Record<string, string> = {
    competence_month: 'Competência (Mês)',
    competence_year: 'Competência (Ano)',
    revenue_date: 'Data',
    main_category_id: 'Categoria Principal',
    notes: 'Observações',
    items_count: 'Nº de Itens',
    amount: 'Valor Total',
  };

  return (
    <div className="space-y-6">
      {/* Action buttons - TOP */}
      <div className="flex justify-end gap-3">
        <button onClick={handleExport} className="btn-secondary">
          <Download className="h-4 w-4" />
          Exportar
        </button>
        <button onClick={handleOpenNew} className="btn-primary">
          <Plus className="h-4 w-4" />
          Nova Venda
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-ink-500 mb-1">Competência (Mês)</label>
            <select
              value={filters.competenceMonth}
              onChange={(e) => setFilters({ ...filters, competenceMonth: e.target.value })}
              className="input-field"
            >
              {MONTH_NAMES.map((name, i) => <option key={i + 1} value={i + 1}>{name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-500 mb-1">Competência (Ano)</label>
            <input
              type="number"
              min={2000}
              max={2100}
              value={filters.competenceYear}
              onChange={(e) => setFilters({ ...filters, competenceYear: e.target.value })}
              className="input-field w-24"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-500 mb-1" title="Filtra pela data real da venda, de forma independente da competência selecionada.">Data Inicial (opcional)</label>
            <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-500 mb-1" title="Filtra pela data real da venda, de forma independente da competência selecionada.">Data Final (opcional)</label>
            <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} className="input-field" />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-ink-500 mb-1">Categoria Principal</label>
            <select
              value={filters.mainCategoryId}
              onChange={(e) => setFilters({ ...filters, mainCategoryId: e.target.value, subcategoryId: '' })}
              className="input-field"
            >
              <option value="">Todas</option>
              {mainCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {filterSubcategories.length > 0 && (
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-medium text-ink-500 mb-1">Subcategoria</label>
              <select
                value={filters.subcategoryId}
                onChange={(e) => setFilters({ ...filters, subcategoryId: e.target.value })}
                className="input-field"
              >
                <option value="">Todas</option>
                {filterSubcategories.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-ink-500 mb-1">Busca</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
              <input
                type="text"
                value={filters.searchText}
                onChange={(e) => setFilters({ ...filters, searchText: e.target.value })}
                placeholder="Buscar..."
                className="input-field pl-10"
              />
            </div>
          </div>
          <button onClick={handleClearFilters} className="btn-secondary">Limpar</button>
        </div>
      </div>

      {/* KPIs */}
      {loading ? <KPISkeleton /> : error ? null : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard title="Receita da Competência" value={formatCurrency(kpis.totalRevenue)} icon={DollarSign} iconColor="text-success-600" iconBg="bg-success-50" />
          <KPICard title="Ticket Médio" value={formatCurrency(kpis.ticketMedio)} icon={TrendingUp} iconColor="text-primary-600" iconBg="bg-primary-50" />
          <KPICard title="Quantidade de Vendas" value={formatNumber(kpis.totalSales)} icon={ShoppingCart} iconColor="text-accent-600" iconBg="bg-accent-50" />
          <KPICard title="Média Diária" value={formatCurrency(kpis.mediaDiaria)} icon={Calendar} iconColor="text-secondary-600" iconBg="bg-secondary-50" />
        </div>
      )}

      {/* Table */}
      {loading ? <TableSkeleton rows={8} /> : error ? <ErrorState onRetry={loadData} /> : filteredRevenues.length === 0 ? (
        <EmptyState title="Nenhuma venda cadastrada." description="Clique em 'Nova Venda' para registrar a primeira venda." actionLabel="Nova Venda" onAction={handleOpenNew} />
      ) : (
        <div className="overflow-hidden rounded-lg ring-1 ring-ink-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink-200">
              <thead className="bg-ink-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500 uppercase tracking-wider">Competência</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500 uppercase tracking-wider">Data</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500 uppercase tracking-wider">Categoria Principal</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500 uppercase tracking-wider">Itens</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500 uppercase tracking-wider">Valor Bruto</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500 uppercase tracking-wider">Valor Líquido</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filteredRevenues.map((r) => {
                  const saleItems = r.items ?? [];
                  const isExpanded = expandedIds.has(r.id);
                  return (
                    <Fragment key={r.id}>
                      <tr className="hover:bg-ink-50/50 transition-colors">
                        <td className="px-4 py-3 text-sm text-ink-700 whitespace-nowrap">
                          {r.competence_month && r.competence_year ? `${String(r.competence_month).padStart(2, '0')}/${r.competence_year}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-ink-700 whitespace-nowrap">{formatDate(r.revenue_date)}</td>
                        <td className="px-4 py-3 text-sm font-medium text-ink-900">{r.main_category?.name ?? '-'}</td>
                        <td className="px-4 py-3 text-sm">
                          <button
                            onClick={() => toggleExpand(r.id)}
                            className="flex items-center gap-1.5 text-ink-600 hover:text-primary-600 transition-colors"
                            title={isExpanded ? 'Recolher' : 'Expandir'}
                          >
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            <span className="hover:underline">{saleItems.length} {saleItems.length === 1 ? 'item' : 'itens'}</span>
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-ink-900 text-right whitespace-nowrap">{formatCurrency(Number(r.amount))}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-ink-700 text-right whitespace-nowrap">{formatCurrency(netAmount(Number(r.amount), r.main_category?.deduction_rate))}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => setViewTarget(r)} className="p-1.5 text-ink-500 hover:text-primary-600 hover:bg-primary-50 rounded-md transition-colors" title="Visualizar">
                              <Eye className="h-4 w-4" />
                            </button>
                            <button onClick={() => handleOpenHistory(r)} className="p-1.5 text-ink-500 hover:text-accent-600 hover:bg-accent-50 rounded-md transition-colors" title="Histórico">
                              <History className="h-4 w-4" />
                            </button>
                            <button onClick={() => handleOpenRecalc(r)} className="p-1.5 text-ink-500 hover:text-secondary-600 hover:bg-secondary-50 rounded-md transition-colors" title="Recalcular Itens">
                              <RefreshCw className="h-4 w-4" />
                            </button>
                            <button onClick={() => handleOpenEdit(r)} className="p-1.5 text-ink-500 hover:text-primary-600 hover:bg-primary-50 rounded-md transition-colors" title="Editar">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button onClick={() => setDeleteTarget(r)} className="p-1.5 text-ink-500 hover:text-error-600 hover:bg-error-50 rounded-md transition-colors" title="Excluir">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-ink-50/60">
                          <td colSpan={7} className="px-4 py-3">
                            <table className="min-w-full">
                              <thead>
                                <tr>
                                  <th className="pb-1.5 pl-6 text-left text-xs font-semibold text-ink-500">Subcategoria</th>
                                  <th className="pb-1.5 text-right text-xs font-semibold text-ink-500">Qtd.</th>
                                  <th className="pb-1.5 text-right text-xs font-semibold text-ink-500">Valor Bruto</th>
                                  <th className="pb-1.5 pr-4 text-right text-xs font-semibold text-ink-500">Valor Líquido</th>
                                </tr>
                              </thead>
                              <tbody>
                                {saleItems.map((item) => (
                                  <tr key={item.id}>
                                    <td className="py-1 pl-6 text-sm text-ink-700">{item.subcategory?.name ?? '-'}</td>
                                    <td className="py-1 text-sm text-ink-600 text-right">{item.quantity}</td>
                                    <td className="py-1 text-sm font-medium text-ink-900 text-right">{formatCurrency(Number(item.amount))}</td>
                                    <td className="py-1 pr-4 text-sm font-medium text-ink-700 text-right">{formatCurrency(netAmount(Number(item.amount), r.main_category?.deduction_rate))}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sale Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingRevenue ? 'Editar Venda' : 'Nova Venda'}
        size="lg"
        footer={
          <>
            <button onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Salvando...' : 'Salvar'}</button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Competência */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Competência (Mês) *</label>
              <select
                value={form.competence_month}
                onChange={(e) => setForm({ ...form, competence_month: Number(e.target.value) })}
                className="input-field"
              >
                {MONTH_NAMES.map((name, i) => <option key={i + 1} value={i + 1}>{name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Competência (Ano) *</label>
              <input
                type="number"
                min={2000}
                max={2100}
                value={form.competence_year}
                onChange={(e) => setForm({ ...form, competence_year: Number(e.target.value) })}
                className="input-field"
              />
            </div>
          </div>
          {formErrors.competence && <p className="text-xs text-error-600">{formErrors.competence}</p>}

          {/* Data */}
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">Data *</label>
            <input
              type="date"
              value={form.revenue_date}
              onChange={(e) => setForm({ ...form, revenue_date: e.target.value })}
              className="input-field"
              max={new Date().toISOString().split('T')[0]}
            />
            {formErrors.revenue_date && <p className="mt-1 text-xs text-error-600">{formErrors.revenue_date}</p>}
          </div>

          {/* Categoria Principal */}
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">Categoria Principal *</label>
            <select
              value={form.main_category_id}
              onChange={(e) => setForm({ ...form, main_category_id: e.target.value })}
              className="input-field"
              disabled={!!editingRevenue}
            >
              <option value="">Selecione...</option>
              {mainCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {formErrors.main_category_id && <p className="mt-1 text-xs text-error-600">{formErrors.main_category_id}</p>}
          </div>

          {/* Itens */}
          {editingRevenue ? (
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Itens da Venda</label>
              <div className="rounded-lg ring-1 ring-ink-200 divide-y divide-ink-100">
                {items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-ink-700">{subcategories.find((s) => s.id === item.subcategory_id)?.name ?? '-'}</span>
                    <span className="text-ink-600">{item.quantity}x</span>
                    <span className="font-medium text-ink-900">{formatCurrency(Number(item.amount) || 0)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-xs text-ink-400">Use o botão "Recalcular Itens" para alterar.</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-ink-700">Itens da Venda *</label>
                {form.main_category_id && !showNewSubcategory && (
                  <button type="button" onClick={() => setShowNewSubcategory(true)} className="text-xs font-medium text-accent-600 hover:text-accent-700">
                    + Nova subcategoria
                  </button>
                )}
              </div>

              {showNewSubcategory && (
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    autoFocus
                    value={newSubcategoryName}
                    onChange={(e) => setNewSubcategoryName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateSubcategory(); } }}
                    placeholder="Nome da nova subcategoria"
                    className="input-field flex-1"
                  />
                  <button type="button" onClick={handleCreateSubcategory} disabled={creatingSubcategory || !newSubcategoryName.trim()} className="btn-primary whitespace-nowrap">
                    Criar
                  </button>
                  <button type="button" onClick={() => { setShowNewSubcategory(false); setNewSubcategoryName(''); }} className="btn-secondary">
                    Cancelar
                  </button>
                </div>
              )}

              {!form.main_category_id ? (
                <p className="text-xs text-ink-400">Selecione a categoria principal para adicionar itens.</p>
              ) : (
                <div className="space-y-2">
                  {items.map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="flex-1">
                        <select
                          value={item.subcategory_id}
                          onChange={(e) => changeItem(setItems, i, { subcategory_id: e.target.value })}
                          className="input-field"
                        >
                          <option value="">Subcategoria...</option>
                          {formSubcategories.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        {formErrors[`item_${i}_subcategory`] && <p className="mt-1 text-xs text-error-600">{formErrors[`item_${i}_subcategory`]}</p>}
                      </div>
                      <div className="w-20">
                        <input
                          type="number"
                          min={0}
                          max={9999}
                          value={item.quantity}
                          onChange={(e) => changeItem(setItems, i, { quantity: Number(e.target.value) })}
                          className="input-field"
                          placeholder="Qtd."
                        />
                        {formErrors[`item_${i}_quantity`] && <p className="mt-1 text-xs text-error-600">Inválida</p>}
                      </div>
                      <div className="w-32">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.amount}
                          onChange={(e) => changeItem(setItems, i, { amount: e.target.value })}
                          className="input-field"
                          placeholder="Valor"
                        />
                        {formErrors[`item_${i}_amount`] && <p className="mt-1 text-xs text-error-600">Inválido</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(setItems, i)}
                        disabled={items.length <= 1}
                        className="p-2.5 text-ink-400 hover:text-error-600 hover:bg-error-50 rounded-md transition-colors disabled:opacity-30 disabled:pointer-events-none"
                        title="Remover item"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {formErrors.items && <p className="text-xs text-error-600">{formErrors.items}</p>}
                  <button type="button" onClick={() => addItem(setItems)} className="btn-secondary">
                    <Plus className="h-4 w-4" />
                    Adicionar Item
                  </button>
                  <div className="rounded-lg bg-primary-50 p-3">
                    <p className="text-sm font-semibold text-primary-700">Total da venda: {formatCurrency(itemsTotal(items))}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Observações */}
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">Observações</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-field" rows={3} maxLength={500} placeholder="Observações opcionais..." />
          </div>
        </div>
      </Modal>

      {/* Recalculate Items Modal */}
      <Modal
        open={!!recalcTarget}
        onClose={() => setRecalcTarget(null)}
        title="Recalcular Itens da Venda"
        size="lg"
        footer={
          <>
            <button onClick={() => setRecalcTarget(null)} className="btn-secondary">Cancelar</button>
            <button onClick={handleRecalcSave} disabled={recalcSaving} className="btn-primary">{recalcSaving ? 'Recalculando...' : 'Recalcular'}</button>
          </>
        }
      >
        {recalcTarget && (
          <div className="space-y-4">
            <div className="rounded-lg bg-accent-50 border border-accent-200 p-3">
              <p className="text-xs text-accent-800">
                Todos os itens existentes serão substituídos pela lista abaixo. A venda em si (data, competência, categoria principal) não é alterada aqui.
              </p>
            </div>
            <div className="space-y-2">
              {recalcItems.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="flex-1">
                    <select
                      value={item.subcategory_id}
                      onChange={(e) => changeItem(setRecalcItems, i, { subcategory_id: e.target.value })}
                      className="input-field"
                    >
                      <option value="">Subcategoria...</option>
                      {recalcSubcategories.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    {recalcErrors[`item_${i}_subcategory`] && <p className="mt-1 text-xs text-error-600">{recalcErrors[`item_${i}_subcategory`]}</p>}
                  </div>
                  <div className="w-20">
                    <input
                      type="number"
                      min={0}
                      max={9999}
                      value={item.quantity}
                      onChange={(e) => changeItem(setRecalcItems, i, { quantity: Number(e.target.value) })}
                      className="input-field"
                      placeholder="Qtd."
                    />
                    {recalcErrors[`item_${i}_quantity`] && <p className="mt-1 text-xs text-error-600">Inválida</p>}
                  </div>
                  <div className="w-32">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.amount}
                      onChange={(e) => changeItem(setRecalcItems, i, { amount: e.target.value })}
                      className="input-field"
                      placeholder="Valor"
                    />
                    {recalcErrors[`item_${i}_amount`] && <p className="mt-1 text-xs text-error-600">Inválido</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(setRecalcItems, i)}
                    disabled={recalcItems.length <= 1}
                    className="p-2.5 text-ink-400 hover:text-error-600 hover:bg-error-50 rounded-md transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    title="Remover item"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {recalcErrors.items && <p className="text-xs text-error-600">{recalcErrors.items}</p>}
              <button type="button" onClick={() => addItem(setRecalcItems)} className="btn-secondary">
                <Plus className="h-4 w-4" />
                Adicionar Item
              </button>
              <div className="rounded-lg bg-primary-50 p-3">
                <p className="text-sm font-semibold text-primary-700">Novo total da venda: {formatCurrency(itemsTotal(recalcItems))}</p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* View Modal */}
      <Modal open={!!viewTarget} onClose={() => setViewTarget(null)} title="Detalhes da Venda" size="md">
        {viewTarget && (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between"><span className="text-sm text-ink-500">Competência:</span><span className="text-sm font-medium text-ink-900">{viewTarget.competence_month && viewTarget.competence_year ? `${String(viewTarget.competence_month).padStart(2, '0')}/${viewTarget.competence_year}` : '-'}</span></div>
              <div className="flex justify-between"><span className="text-sm text-ink-500">Data:</span><span className="text-sm font-medium text-ink-900">{formatDate(viewTarget.revenue_date)}</span></div>
              <div className="flex justify-between"><span className="text-sm text-ink-500">Categoria Principal:</span><span className="text-sm font-medium text-ink-900">{viewTarget.main_category?.name ?? '-'}</span></div>
              <div className="flex justify-between"><span className="text-sm text-ink-500">Valor Bruto:</span><span className="text-sm font-bold text-ink-900">{formatCurrency(Number(viewTarget.amount))}</span></div>
              <div className="flex justify-between"><span className="text-sm text-ink-500">Valor Líquido:</span><span className="text-sm font-bold text-ink-700">{formatCurrency(netAmount(Number(viewTarget.amount), viewTarget.main_category?.deduction_rate))}</span></div>
              <div className="flex justify-between"><span className="text-sm text-ink-500">Usuário:</span><span className="text-sm font-medium text-ink-900">{viewTarget.user?.name ?? '-'}</span></div>
              {viewTarget.notes && <div><span className="text-sm text-ink-500">Observações:</span><p className="mt-1 text-sm text-ink-900">{viewTarget.notes}</p></div>}
            </div>
            <div>
              <h4 className="text-sm font-semibold text-ink-900 mb-2">Itens</h4>
              <div className="overflow-hidden rounded-lg ring-1 ring-ink-200">
                <table className="min-w-full divide-y divide-ink-200">
                  <thead className="bg-ink-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-ink-500">Subcategoria</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-ink-500">Qtd.</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-ink-500">Valor Bruto</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-ink-500">Valor Líquido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {(viewTarget.items ?? []).map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2 text-sm text-ink-700">{item.subcategory?.name ?? '-'}</td>
                        <td className="px-3 py-2 text-sm text-right">{item.quantity}</td>
                        <td className="px-3 py-2 text-sm text-right font-medium">{formatCurrency(Number(item.amount))}</td>
                        <td className="px-3 py-2 text-sm text-right font-medium text-ink-700">{formatCurrency(netAmount(Number(item.amount), viewTarget.main_category?.deduction_rate))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* History Modal */}
      <Modal open={!!historyTarget} onClose={() => setHistoryTarget(null)} title="Histórico de Alterações" size="lg">
        {historyLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-ink-500 text-center py-8">Nenhuma alteração registrada.</p>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {history.map((h) => (
              <div key={h.id} className="flex items-start gap-3 rounded-lg border border-ink-200 p-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-900">{fieldLabels[h.field_name] ?? h.field_name}</span>
                    <span className="text-xs text-ink-400">{new Date(h.changed_at).toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className="text-error-600 line-through">{h.old_value ?? '—'}</span>
                    <span className="text-ink-400">→</span>
                    <span className="text-success-600 font-medium">{h.new_value ?? '—'}</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-400">por {h.user?.name ?? 'Sistema'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Confirmar Exclusão"
        message="Deseja realmente excluir esta venda? Todos os itens vinculados serão removidos."
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

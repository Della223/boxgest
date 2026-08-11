import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Plus, Download, Search, Pencil, Trash2, Eye, CreditCard, DollarSign, Layers, Building2, Tag, Calendar, History, RefreshCw, CheckCircle2, Repeat } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { KPISkeleton, TableSkeleton } from '../components/ui/Skeleton';
import KPICard from '../components/ui/KPICard';
import Badge from '../components/ui/Badge';
import {
  fetchExpenses, createExpense, updateExpense, deleteExpense,
  recalculateInstallments,
  fetchExpenseCategories, fetchSubcategories, fetchCostCenters,
  fetchSuppliers, findOrCreateSupplier,
} from '../services/expense.service';
import {
  createRecurringExpense, confirmRecurringOccurrence, endRecurringExpense,
  ensureRecurringOccurrencesGenerated,
} from '../services/recurring-expense.service';
import { createAuditLog } from '../services/audit.service';
import { logChanges, fetchChangeHistory } from '../services/change-history.service';
import { formatCurrency, formatDate, getCurrentCompetence, getCompetenceString, downloadCSV } from '../utils/format';
import type { Expense, ExpenseCategory, ExpenseSubcategory, CostCenter, Supplier, ChangeHistory, InstallmentMode } from '../types';

const INSTALLMENT_MODE_LABELS: Record<InstallmentMode, string> = {
  monthly: 'Mensal',
  fixed_days: 'Dias fixos',
  custom: 'Datas personalizadas',
};

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const STORAGE_KEY = 'carcenter_despesas_filters';

interface FilterState {
  competenceMonth: string;
  competenceYear: string;
  categoryId: string;
  costCenterId: string;
  searchText: string;
}

function getDefaultFilters(): FilterState {
  const { month, year } = getCurrentCompetence();
  return {
    competenceMonth: String(month),
    competenceYear: String(year),
    categoryId: '',
    costCenterId: '',
    searchText: '',
  };
}

function getCompetenceMatch(expense: Expense, month: number, year: number): { amount: number; dueDate: string | null } {
  const matches = (expense.installments ?? []).filter(
    (i) => i.competence_month === month && i.competence_year === year
  );
  if (matches.length === 0) return { amount: 0, dueDate: null };
  const amount = matches.reduce((s, i) => s + Number(i.amount), 0);
  const dueDate = matches.map((i) => i.due_date).sort()[0];
  return { amount, dueDate };
}

interface ExpenseForm {
  competence_month: number;
  competence_year: number;
  category_id: string;
  subcategory_id: string;
  supplier_name: string;
  supplier_id: string | null;
  payment_date: string;
  total_amount: string;
  installment_count: number;
  installment_mode: InstallmentMode;
  installment_interval_days: string;
  custom_due_dates: string[];
  is_recurring: boolean;
  recurring_due_day: string;
  recurring_end_date: string;
  notes: string;
}

export default function DespesasScreen() {
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
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allCategories, setAllCategories] = useState<ExpenseCategory[]>([]);
  const [allSubcategories, setAllSubcategories] = useState<ExpenseSubcategory[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [form, setForm] = useState<ExpenseForm>({
    competence_month: getCurrentCompetence().month,
    competence_year: getCurrentCompetence().year,
    category_id: '', subcategory_id: '',
    supplier_name: '', supplier_id: null,
    payment_date: new Date().toISOString().split('T')[0],
    total_amount: '', installment_count: 1,
    installment_mode: 'monthly', installment_interval_days: '', custom_due_dates: [],
    is_recurring: false, recurring_due_day: '', recurring_end_date: '',
    notes: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [viewTarget, setViewTarget] = useState<Expense | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Expense | null>(null);
  const [history, setHistory] = useState<ChangeHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Recalculate modal
  const [recalcTarget, setRecalcTarget] = useState<Expense | null>(null);
  const [recalcForm, setRecalcForm] = useState({
    total_amount: '', installment_count: 1, payment_date: '',
    installment_mode: 'monthly' as InstallmentMode, installment_interval_days: '', custom_due_dates: [] as string[],
  });
  const [recalcSaving, setRecalcSaving] = useState(false);

  // Recurring expense confirmation modal
  const [confirmTarget, setConfirmTarget] = useState<Expense | null>(null);
  const [confirmAmount, setConfirmAmount] = useState('');
  const [confirmSaving, setConfirmSaving] = useState(false);

  // Supplier autocomplete
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierSuggestions, setSupplierSuggestions] = useState<Supplier[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const supplierInputRef = useRef<HTMLInputElement>(null);

  // Persist filters
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      await ensureRecurringOccurrencesGenerated();
      const [exps, cats, subs, ccs, sups] = await Promise.all([
        fetchExpenses({}),
        fetchExpenseCategories(),
        fetchSubcategories(),
        fetchCostCenters(),
        fetchSuppliers(),
      ]);
      setExpenses(exps);
      setAllCategories(cats);
      setAllSubcategories(subs);
      setCostCenters(ccs);
      setSuppliers(sups);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Keep custom due-dates array in sync with the installment count
  useEffect(() => {
    if (form.installment_mode !== 'custom') return;
    setForm((prev) => {
      if (prev.installment_mode !== 'custom') return prev;
      const count = prev.installment_count;
      if (prev.custom_due_dates.length === count) return prev;
      const next = prev.custom_due_dates.slice(0, count);
      while (next.length < count) next.push('');
      return { ...prev, custom_due_dates: next };
    });
  }, [form.installment_mode, form.installment_count]);

  useEffect(() => {
    if (recalcForm.installment_mode !== 'custom') return;
    setRecalcForm((prev) => {
      if (prev.installment_mode !== 'custom') return prev;
      const count = prev.installment_count;
      if (prev.custom_due_dates.length === count) return prev;
      const next = prev.custom_due_dates.slice(0, count);
      while (next.length < count) next.push('');
      return { ...prev, custom_due_dates: next };
    });
  }, [recalcForm.installment_mode, recalcForm.installment_count]);

  const categoriesByCostCenter = useMemo(() => {
    const groups: Record<string, { costCenterName: string; categories: ExpenseCategory[] }> = {};
    for (const c of allCategories) {
      const ccName = c.cost_center?.name ?? 'Sem centro de custo';
      if (!groups[ccName]) groups[ccName] = { costCenterName: ccName, categories: [] };
      groups[ccName].categories.push(c);
    }
    return Object.values(groups).sort((a, b) => a.costCenterName.localeCompare(b.costCenterName));
  }, [allCategories]);

  const selectedCategoryCostCenterName = useMemo(() => {
    if (!form.category_id) return null;
    return allCategories.find((c) => c.id === form.category_id)?.cost_center?.name ?? 'Sem centro de custo';
  }, [allCategories, form.category_id]);

  const filteredSubcategories = useMemo(() => {
    if (!form.category_id) return [];
    return allSubcategories.filter((s) => s.category_id === form.category_id);
  }, [allSubcategories, form.category_id]);

  const previewDueDates = useMemo(() => {
    if (!form.payment_date) return [];
    const baseDate = new Date(form.payment_date + 'T00:00:00');
    const count = form.installment_count;
    if (form.installment_mode === 'custom') {
      return form.custom_due_dates.slice(0, count);
    }
    if (form.installment_mode === 'fixed_days') {
      const interval = Number(form.installment_interval_days);
      if (!interval || interval <= 0) return [];
      return Array.from({ length: count }, (_, i) => {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + interval * i);
        return d.toISOString().split('T')[0];
      });
    }
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, baseDate.getDate());
      return d.toISOString().split('T')[0];
    });
  }, [form.payment_date, form.installment_count, form.installment_mode, form.installment_interval_days, form.custom_due_dates]);

  useEffect(() => {
    if (!supplierSearch.trim() || !showSuggestions) {
      setSupplierSuggestions([]);
      return;
    }
    const filtered = suppliers
      .filter((s) => s.name.toLowerCase().includes(supplierSearch.toLowerCase()))
      .slice(0, 8);
    setSupplierSuggestions(filtered);
  }, [supplierSearch, suppliers, showSuggestions]);

  const handleSupplierChange = (value: string) => {
    setForm((prev) => ({ ...prev, supplier_name: value, supplier_id: null }));
    setSupplierSearch(value);
    setShowSuggestions(true);
  };

  const handleSupplierSelect = (supplier: Supplier) => {
    setForm((prev) => ({ ...prev, supplier_name: supplier.name, supplier_id: supplier.id }));
    setSupplierSearch(supplier.name);
    setShowSuggestions(false);
  };

  const handleSupplierBlur = () => {
    setTimeout(() => setShowSuggestions(false), 150);
  };

  const filteredExpenses = useMemo(() => {
    const compMonth = Number(filters.competenceMonth);
    const compYear = Number(filters.competenceYear);
    return expenses.filter((e) => {
      if (filters.categoryId && e.category_id !== filters.categoryId) return false;
      if (filters.costCenterId && e.category?.cost_center_id !== filters.costCenterId) return false;
      if (dateStart && e.payment_date && e.payment_date < dateStart) return false;
      if (dateEnd && e.payment_date && e.payment_date > dateEnd) return false;
      if (!(e.installments ?? []).some((i) => i.competence_month === compMonth && i.competence_year === compYear)) return false;
      if (filters.searchText) {
        const search = filters.searchText.toLowerCase();
        if (!e.supplier?.toLowerCase().includes(search) && !e.description?.toLowerCase().includes(search)) return false;
      }
      return true;
    });
  }, [expenses, filters, dateStart, dateEnd]);

  const kpis = useMemo(() => {
    let totalCompetence = 0;
    let totalDespesasMes = 0;
    let totalParcelas = 0;
    const currentMonth = Number(filters.competenceMonth);
    const currentYear = Number(filters.competenceYear);

    for (const e of filteredExpenses) {
      if (e.confirmation_status === 'pending_confirmation') continue;
      totalCompetence += Number(e.total_amount);
      for (const inst of e.installments ?? []) {
        const instMonth = inst.competence_month ?? e.competence_month;
        const instYear = inst.competence_year ?? e.competence_year;
        if (instMonth === currentMonth && instYear === currentYear) {
          totalDespesasMes += Number(inst.amount);
          totalParcelas++;
        }
      }
    }
    return { totalCompetence, totalDespesasMes, totalParcelas };
  }, [filteredExpenses, filters.competenceMonth, filters.competenceYear]);

  const handleOpenNew = () => {
    const { month, year } = getCurrentCompetence();
    setEditingExpense(null);
    setForm({
      competence_month: month, competence_year: year, category_id: '',
      subcategory_id: '', supplier_name: '', supplier_id: null,
      payment_date: new Date().toISOString().split('T')[0], total_amount: '',
      installment_count: 1,
      installment_mode: 'monthly', installment_interval_days: '', custom_due_dates: [],
      is_recurring: false, recurring_due_day: '', recurring_end_date: '',
      notes: '',
    });
    setSupplierSearch('');
    setShowSuggestions(false);
    setFormErrors({});
    setModalOpen(true);
  };

  const handleOpenEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setForm({
      competence_month: expense.competence_month,
      competence_year: expense.competence_year,
      category_id: expense.category_id,
      subcategory_id: expense.subcategory_id ?? '',
      supplier_name: expense.supplier ?? '',
      supplier_id: expense.supplier_id ?? null,
      payment_date: expense.payment_date ?? expense.installments?.[0]?.due_date ?? new Date().toISOString().split('T')[0],
      total_amount: String(expense.total_amount),
      installment_count: expense.installment_count,
      installment_mode: expense.installment_mode ?? 'monthly',
      installment_interval_days: expense.installment_interval_days ? String(expense.installment_interval_days) : '',
      custom_due_dates: (expense.installments ?? [])
        .slice()
        .sort((a, b) => a.installment_number - b.installment_number)
        .map((inst) => inst.due_date),
      is_recurring: false, recurring_due_day: '', recurring_end_date: '',
      notes: expense.notes ?? '',
    });
    setSupplierSearch(expense.supplier ?? '');
    setShowSuggestions(false);
    setFormErrors({});
    setModalOpen(true);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!form.competence_month || !form.competence_year) errors.competence = 'Competência é obrigatória.';
    if (!form.category_id) errors.category_id = 'Categoria é obrigatória.';
    if (filteredSubcategories.length > 0 && !form.subcategory_id) errors.subcategory_id = 'Subcategoria é obrigatória.';
    if (!form.total_amount || Number(form.total_amount) <= 0) errors.total_amount = 'Valor deve ser maior que zero.';

    if (form.is_recurring) {
      const day = Number(form.recurring_due_day);
      if (!form.recurring_due_day || day < 1 || day > 31) errors.recurring_due_day = 'Informe um dia de vencimento entre 1 e 31.';
    } else {
      if (!form.payment_date) errors.payment_date = 'Data do pagamento é obrigatória.';
      if (form.installment_count < 1 || form.installment_count > 120) errors.installment_count = 'Parcelas deve ser entre 1 e 120.';
      if (form.installment_mode === 'fixed_days') {
        const days = Number(form.installment_interval_days);
        if (!form.installment_interval_days || days <= 0) errors.installment_interval_days = 'Informe um intervalo em dias maior que zero.';
      }
      if (form.installment_mode === 'custom') {
        const hasEmpty = form.custom_due_dates.slice(0, form.installment_count).some((d) => !d);
        if (hasEmpty || form.custom_due_dates.length < form.installment_count) {
          errors.custom_due_dates = 'Informe a data de vencimento de todas as parcelas.';
        }
      }
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      const auditUser = user?.id ?? null;

      let supplierId: string | null = form.supplier_id;
      const supplierName = form.supplier_name.trim();
      if (supplierName && !supplierId) {
        const supplier = await findOrCreateSupplier(supplierName);
        supplierId = supplier?.id ?? null;
      }

      const input = {
        competence_month: form.competence_month,
        competence_year: form.competence_year,
        supplier: supplierName || null,
        supplier_id: supplierId,
        category_id: form.category_id,
        subcategory_id: form.subcategory_id || null,
        description: null as string | null,
        total_amount: Number(form.total_amount),
        installment_count: Number(form.installment_count),
        installment_mode: form.installment_mode,
        installment_interval_days: form.installment_mode === 'fixed_days' ? Number(form.installment_interval_days) : null,
        custom_due_dates: form.installment_mode === 'custom' ? form.custom_due_dates.slice(0, form.installment_count) : null,
        payment_date: form.payment_date,
        notes: form.notes || null,
        created_by: auditUser ?? undefined,
      };

      if (editingExpense) {
        const oldValues: Record<string, unknown> = {
          competence_month: editingExpense.competence_month,
          competence_year: editingExpense.competence_year,
          category_id: editingExpense.category_id,
          subcategory_id: editingExpense.subcategory_id,
          supplier: editingExpense.supplier,
          payment_date: editingExpense.payment_date,
          notes: editingExpense.notes,
        };
        const newValues: Record<string, unknown> = {
          competence_month: form.competence_month,
          competence_year: form.competence_year,
          category_id: form.category_id,
          subcategory_id: form.subcategory_id || null,
          supplier: supplierName || null,
          payment_date: form.payment_date,
          notes: form.notes || null,
        };

        const { payment_date, ...updateData } = input;
        await updateExpense(editingExpense.id, { ...updateData, payment_date });
        await logChanges('expenses', editingExpense.id, auditUser, oldValues, newValues);
        await createAuditLog(auditUser, 'despesas', 'update', editingExpense.id, oldValues, newValues);
        toast.success('Despesa atualizada com sucesso.');
      } else if (form.is_recurring) {
        const { recurring, expense: created } = await createRecurringExpense({
          description: supplierName || (allCategories.find((c) => c.id === form.category_id)?.name ?? 'Despesa recorrente'),
          category_id: form.category_id,
          subcategory_id: form.subcategory_id || null,
          supplier: supplierName || null,
          supplier_id: supplierId,
          due_day: Number(form.recurring_due_day),
          initial_amount: Number(form.total_amount),
          start_month: form.competence_month,
          start_year: form.competence_year,
          end_date: form.recurring_end_date || null,
          notes: form.notes || null,
          created_by: auditUser ?? undefined,
        });
        await createAuditLog(auditUser, 'despesas', 'create', created.id, null, { ...input, recurring_expense_id: recurring.id });
        toast.success('Despesa recorrente cadastrada com sucesso.');
      } else {
        const created = await createExpense(input);
        await createAuditLog(auditUser, 'despesas', 'create', created.id, null, input);
        toast.success('Despesa registrada com sucesso.');
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      toast.error('Não foi possível salvar a despesa.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteExpense(deleteTarget.id);
      await createAuditLog(user?.id ?? null, 'despesas', 'delete', deleteTarget.id, null, null);
      toast.success('Despesa removida com sucesso.');
      await loadData();
    } catch {
      toast.error('Não foi possível excluir a despesa.');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleOpenRecalc = (expense: Expense) => {
    setRecalcTarget(expense);
    setRecalcForm({
      total_amount: String(expense.total_amount),
      installment_count: expense.installment_count,
      payment_date: expense.payment_date ?? expense.installments?.[0]?.due_date ?? new Date().toISOString().split('T')[0],
      installment_mode: expense.installment_mode ?? 'monthly',
      installment_interval_days: expense.installment_interval_days ? String(expense.installment_interval_days) : '',
      custom_due_dates: (expense.installments ?? [])
        .slice()
        .sort((a, b) => a.installment_number - b.installment_number)
        .map((inst) => inst.due_date),
    });
  };

  const handleRecalcSave = async () => {
    if (!recalcTarget) return;
    if (!recalcForm.total_amount || Number(recalcForm.total_amount) <= 0) {
      toast.error('Valor deve ser maior que zero.');
      return;
    }
    if (recalcForm.installment_count < 1 || recalcForm.installment_count > 120) {
      toast.error('Parcelas deve ser entre 1 e 120.');
      return;
    }
    if (recalcForm.installment_mode === 'fixed_days') {
      const days = Number(recalcForm.installment_interval_days);
      if (!recalcForm.installment_interval_days || days <= 0) {
        toast.error('Informe um intervalo em dias maior que zero.');
        return;
      }
    }
    if (recalcForm.installment_mode === 'custom') {
      const hasEmpty = recalcForm.custom_due_dates.slice(0, recalcForm.installment_count).some((d) => !d);
      if (hasEmpty || recalcForm.custom_due_dates.length < recalcForm.installment_count) {
        toast.error('Informe a data de vencimento de todas as parcelas.');
        return;
      }
    }
    setRecalcSaving(true);
    try {
      const oldValues = {
        total_amount: recalcTarget.total_amount,
        installment_count: recalcTarget.installment_count,
        payment_date: recalcTarget.payment_date,
      };
      const newValues = {
        total_amount: Number(recalcForm.total_amount),
        installment_count: recalcForm.installment_count,
        payment_date: recalcForm.payment_date,
      };

      await recalculateInstallments(
        recalcTarget.id,
        Number(recalcForm.total_amount),
        Number(recalcForm.installment_count),
        recalcForm.payment_date,
        recalcTarget.competence_month,
        recalcTarget.competence_year,
        recalcForm.installment_mode,
        recalcForm.installment_mode === 'fixed_days' ? Number(recalcForm.installment_interval_days) : null,
        recalcForm.installment_mode === 'custom' ? recalcForm.custom_due_dates.slice(0, recalcForm.installment_count) : null
      );
      await logChanges('expenses', recalcTarget.id, user?.id ?? null, oldValues, newValues);
      await createAuditLog(user?.id ?? null, 'despesas', 'recalculate', recalcTarget.id, oldValues, newValues);
      toast.success('Parcelas recalculadas com sucesso.');
      setRecalcTarget(null);
      await loadData();
    } catch (err) {
      toast.error('Erro ao recalcular parcelas.');
      console.error(err);
    } finally {
      setRecalcSaving(false);
    }
  };

  const handleOpenConfirm = (expense: Expense) => {
    setConfirmTarget(expense);
    setConfirmAmount(String(expense.total_amount));
  };

  const handleConfirmSave = async () => {
    if (!confirmTarget) return;
    if (!confirmAmount || Number(confirmAmount) <= 0) {
      toast.error('Valor deve ser maior que zero.');
      return;
    }
    setConfirmSaving(true);
    try {
      await confirmRecurringOccurrence(confirmTarget.id, Number(confirmAmount));
      await logChanges('expenses', confirmTarget.id, user?.id ?? null, { total_amount: confirmTarget.total_amount }, { total_amount: Number(confirmAmount) });
      await createAuditLog(user?.id ?? null, 'despesas', 'confirm_recurring', confirmTarget.id, { total_amount: confirmTarget.total_amount }, { total_amount: Number(confirmAmount) });
      toast.success('Despesa recorrente confirmada com sucesso.');
      setConfirmTarget(null);
      await loadData();
    } catch (err) {
      toast.error('Erro ao confirmar despesa recorrente.');
      console.error(err);
    } finally {
      setConfirmSaving(false);
    }
  };

  const handleEndRecurring = async (expense: Expense) => {
    if (!expense.recurring_expense_id) return;
    try {
      await endRecurringExpense(expense.recurring_expense_id);
      toast.success('Recorrência encerrada. Nenhum novo lançamento será gerado.');
      setViewTarget(null);
      await loadData();
    } catch {
      toast.error('Não foi possível encerrar a recorrência.');
    }
  };

  const handleOpenHistory = async (expense: Expense) => {
    setHistoryTarget(expense);
    setHistoryLoading(true);
    try {
      const data = await fetchChangeHistory('expenses', expense.id);
      setHistory(data);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleExport = () => {
    const compMonth = Number(filters.competenceMonth);
    const compYear = Number(filters.competenceYear);
    const headers = ['Competência', 'Fornecedor', 'Centro de Custo', 'Categoria', 'Subcategoria', 'Valor na Competência', 'Parcelas', 'Vencimento'];
    const rows = filteredExpenses.map((e) => {
      const { amount: competenceAmount, dueDate: competenceDueDate } = getCompetenceMatch(e, compMonth, compYear);
      return [
        getCompetenceString(compMonth, compYear),
        e.supplier ?? '-',
        e.category?.cost_center?.name ?? '-',
        e.category?.name ?? '-',
        e.subcategory?.name ?? '-',
        formatCurrency(competenceAmount),
        `${e.installment_count}x`,
        competenceDueDate ? formatDate(competenceDueDate) : '-',
      ];
    });
    downloadCSV('despesas.csv', headers, rows);
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
    cost_center_id: 'Centro de Custo',
    category_id: 'Categoria',
    subcategory_id: 'Subcategoria',
    supplier: 'Fornecedor',
    payment_date: 'Data do Pagamento',
    total_amount: 'Valor Total',
    installment_count: 'Número de Parcelas',
    installment_mode: 'Tipo de Parcelamento',
    installment_interval_days: 'Intervalo entre Parcelas (dias)',
    notes: 'Observações',
  };

  return (
    <div className="space-y-6">
      {/* Action buttons - TOP */}
      <div className="flex justify-end gap-3">
        <button onClick={handleExport} className="btn-secondary"><Download className="h-4 w-4" />Exportar</button>
        <button onClick={handleOpenNew} className="btn-primary"><Plus className="h-4 w-4" />Nova Despesa</button>
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
            <label className="block text-xs font-medium text-ink-500 mb-1" title="Filtra pela data real da compra (payment_date), de forma independente da competência selecionada.">Data Inicial (opcional)</label>
            <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-500 mb-1" title="Filtra pela data real da compra (payment_date), de forma independente da competência selecionada.">Data Final (opcional)</label>
            <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} className="input-field" />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-ink-500 mb-1">Categoria</label>
            <select value={filters.categoryId} onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })} className="input-field">
              <option value="">Todas</option>
              {allCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-ink-500 mb-1">Centro de Custo</label>
            <select value={filters.costCenterId} onChange={(e) => setFilters({ ...filters, costCenterId: e.target.value })} className="input-field">
              <option value="">Todos</option>
              {costCenters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-ink-500 mb-1">Busca</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
              <input type="text" value={filters.searchText} onChange={(e) => setFilters({ ...filters, searchText: e.target.value })} placeholder="Buscar..." className="input-field pl-10" />
            </div>
          </div>
          <button onClick={handleClearFilters} className="btn-secondary">Limpar</button>
        </div>
      </div>

      {/* KPIs */}
      {loading ? <KPISkeleton /> : error ? null : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KPICard title="Total das Despesas" value={formatCurrency(kpis.totalCompetence)} icon={DollarSign} iconColor="text-primary-600" iconBg="bg-primary-50" />
          <KPICard title="Despesas da Competência" value={formatCurrency(kpis.totalDespesasMes)} icon={CreditCard} iconColor="text-success-600" iconBg="bg-success-50" />
          <KPICard title="Parcelas no Mês" value={String(kpis.totalParcelas)} icon={Layers} iconColor="text-accent-600" iconBg="bg-accent-50" />
        </div>
      )}

      {/* Table */}
      {loading ? <TableSkeleton rows={8} /> : error ? <ErrorState onRetry={loadData} /> : filteredExpenses.length === 0 ? (
        <EmptyState title="Nenhuma despesa cadastrada." description="Clique em 'Nova Despesa' para registrar a primeira despesa." actionLabel="Nova Despesa" onAction={handleOpenNew} />
      ) : (
        <div className="overflow-hidden rounded-lg ring-1 ring-ink-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink-200">
              <thead className="bg-ink-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500 uppercase tracking-wider">Competência</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500 uppercase tracking-wider">Fornecedor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500 uppercase tracking-wider">Centro de Custo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500 uppercase tracking-wider">Categoria</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500 uppercase tracking-wider">Valor na Competência</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-ink-500 uppercase tracking-wider">Parcelas</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500 uppercase tracking-wider">Vencimento</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filteredExpenses.map((e) => {
                  const isPending = e.confirmation_status === 'pending_confirmation';
                  const isOverdue = isPending && !!e.payment_date && e.payment_date < new Date().toISOString().split('T')[0];
                  const compMonth = Number(filters.competenceMonth);
                  const compYear = Number(filters.competenceYear);
                  const { amount: competenceAmount, dueDate: competenceDueDate } = getCompetenceMatch(e, compMonth, compYear);
                  return (
                  <tr key={e.id} className="hover:bg-ink-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm text-ink-700 whitespace-nowrap">{getCompetenceString(compMonth, compYear)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-ink-900">
                      {e.supplier ?? '-'}
                      {e.recurring_expense_id && <Repeat className="inline-block ml-1.5 h-3 w-3 text-primary-500 align-text-top" />}
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-600">{e.category?.cost_center?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-sm text-ink-600">
                      {e.category?.name ?? '-'}
                      {e.subcategory && <span className="text-ink-400 text-xs block">{e.subcategory.name}</span>}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-ink-900 text-right whitespace-nowrap">{formatCurrency(competenceAmount)}</td>
                    <td className="px-4 py-3 text-sm text-ink-600 text-center">
                      {e.installment_count}x
                      {isPending && (
                        <span className="block mt-1">
                          <Badge variant={isOverdue ? 'error' : 'warning'}>{isOverdue ? 'Atrasada' : 'Pendente'}</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-600 whitespace-nowrap">{competenceDueDate ? formatDate(competenceDueDate) : '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setViewTarget(e)} className="p-1.5 text-ink-500 hover:text-primary-600 hover:bg-primary-50 rounded-md transition-colors" title="Visualizar">
                          <Eye className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleOpenHistory(e)} className="p-1.5 text-ink-500 hover:text-accent-600 hover:bg-accent-50 rounded-md transition-colors" title="Histórico">
                          <History className="h-4 w-4" />
                        </button>
                        {isPending ? (
                          <button onClick={() => handleOpenConfirm(e)} className="p-1.5 text-warning-600 hover:text-warning-700 hover:bg-warning-50 rounded-md transition-colors" title="Confirmar Despesa Recorrente">
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                        ) : (
                          <>
                            <button onClick={() => handleOpenRecalc(e)} className="p-1.5 text-ink-500 hover:text-secondary-600 hover:bg-secondary-50 rounded-md transition-colors" title="Recalcular Parcelas">
                              <RefreshCw className="h-4 w-4" />
                            </button>
                            <button onClick={() => handleOpenEdit(e)} className="p-1.5 text-ink-500 hover:text-primary-600 hover:bg-primary-50 rounded-md transition-colors" title="Editar">
                              <Pencil className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        <button onClick={() => setDeleteTarget(e)} className="p-1.5 text-ink-500 hover:text-error-600 hover:bg-error-50 rounded-md transition-colors" title="Excluir">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Expense Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingExpense ? 'Editar Despesa' : 'Nova Despesa'}
        size="lg"
        footer={
          <>
            <button onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Salvando...' : 'Salvar'}</button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-700">
            <Calendar className="h-4 w-4 text-primary-600" />
            <span>Competência</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Mês *</label>
              <select
                value={form.competence_month}
                onChange={(e) => setForm({ ...form, competence_month: Number(e.target.value) })}
                className="input-field"
              >
                {MONTH_NAMES.map((name, i) => <option key={i + 1} value={i + 1}>{name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Ano *</label>
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

          <div className="flex items-center gap-2 text-sm font-semibold text-ink-700">
            <Tag className="h-4 w-4 text-primary-600" />
            <span>Categoria</span>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">Categoria *</label>
            <select
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value, subcategory_id: '' })}
              className="input-field"
            >
              <option value="">Selecione...</option>
              {categoriesByCostCenter.map((g) => (
                <optgroup key={g.costCenterName} label={g.costCenterName}>
                  {g.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              ))}
            </select>
            {formErrors.category_id && <p className="mt-1 text-xs text-error-600">{formErrors.category_id}</p>}
            {selectedCategoryCostCenterName && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-500">
                <Building2 className="h-3.5 w-3.5 text-ink-400" />
                Centro de Custo: <span className="font-medium text-ink-700">{selectedCategoryCostCenterName}</span>
              </p>
            )}
          </div>

          {form.category_id && filteredSubcategories.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Subcategoria *</label>
              <select
                value={form.subcategory_id}
                onChange={(e) => setForm({ ...form, subcategory_id: e.target.value })}
                className="input-field"
              >
                <option value="">Selecione...</option>
                {filteredSubcategories.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {formErrors.subcategory_id && <p className="mt-1 text-xs text-error-600">{formErrors.subcategory_id}</p>}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">Fornecedor (opcional)</label>
            <div className="relative">
              <input
                ref={supplierInputRef}
                type="text"
                value={form.supplier_name}
                onChange={(e) => handleSupplierChange(e.target.value)}
                onBlur={handleSupplierBlur}
                onFocus={() => { if (supplierSearch) setShowSuggestions(true); }}
                className="input-field"
                maxLength={150}
                placeholder="Digite para buscar ou cadastrar..."
                autoComplete="off"
              />
              {showSuggestions && supplierSuggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white rounded-lg shadow-lg ring-1 ring-ink-200 max-h-56 overflow-y-auto">
                  {supplierSuggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); handleSupplierSelect(s); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-ink-700 hover:bg-primary-50 hover:text-primary-700 transition-colors"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {!editingExpense && (
            <div className="rounded-lg border border-ink-200 p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-ink-700">
                <input
                  type="checkbox"
                  checked={form.is_recurring}
                  onChange={(e) => setForm({ ...form, is_recurring: e.target.checked })}
                  className="h-4 w-4 rounded border-ink-300 text-primary-600 focus:ring-primary-500"
                />
                <Repeat className="h-4 w-4 text-primary-600" />
                Despesa recorrente
              </label>
              <p className="mt-1 text-xs text-ink-400">
                Todo mês o sistema gera automaticamente o próximo lançamento repetindo o último valor confirmado, aguardando sua confirmação.
              </p>
            </div>
          )}

          {form.is_recurring ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1.5">Dia de Vencimento *</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={form.recurring_due_day}
                    onChange={(e) => setForm({ ...form, recurring_due_day: e.target.value })}
                    className="input-field"
                    placeholder="Ex: 5"
                  />
                  {formErrors.recurring_due_day && <p className="mt-1 text-xs text-error-600">{formErrors.recurring_due_day}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1.5">Data de Término (opcional)</label>
                  <input
                    type="date"
                    value={form.recurring_end_date}
                    onChange={(e) => setForm({ ...form, recurring_end_date: e.target.value })}
                    className="input-field"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">Valor Inicial (R$) *</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.total_amount}
                  onChange={(e) => setForm({ ...form, total_amount: e.target.value })}
                  className="input-field"
                  placeholder="0,00"
                />
                {formErrors.total_amount && <p className="mt-1 text-xs text-error-600">{formErrors.total_amount}</p>}
              </div>
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Data do Pagamento *</label>
              <input
                type="date"
                value={form.payment_date}
                onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
                className="input-field"
              />
              {formErrors.payment_date && <p className="mt-1 text-xs text-error-600">{formErrors.payment_date}</p>}
            </div>
          )}

          {!form.is_recurring && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Valor Total (R$) *</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.total_amount}
                onChange={(e) => setForm({ ...form, total_amount: e.target.value })}
                className="input-field"
                placeholder="0,00"
                disabled={!!editingExpense}
              />
              {formErrors.total_amount && <p className="mt-1 text-xs text-error-600">{formErrors.total_amount}</p>}
              {editingExpense && (
                <p className="mt-1 text-xs text-ink-400">Use o botão "Recalcular Parcelas" para alterar.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Número de Parcelas *</label>
              <input
                type="number"
                min={1}
                max={120}
                value={form.installment_count}
                onChange={(e) => setForm({ ...form, installment_count: Number(e.target.value) })}
                className="input-field"
                disabled={!!editingExpense}
              />
              {formErrors.installment_count && <p className="mt-1 text-xs text-error-600">{formErrors.installment_count}</p>}
              {editingExpense && (
                <p className="mt-1 text-xs text-ink-400">Use o botão "Recalcular Parcelas" para alterar.</p>
              )}
            </div>
          </div>
          )}

          {!form.is_recurring && (
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">Tipo de Parcelamento *</label>
            <select
              value={form.installment_mode}
              onChange={(e) => setForm({ ...form, installment_mode: e.target.value as InstallmentMode })}
              className="input-field"
              disabled={!!editingExpense}
            >
              {(Object.keys(INSTALLMENT_MODE_LABELS) as InstallmentMode[]).map((mode) => (
                <option key={mode} value={mode}>{INSTALLMENT_MODE_LABELS[mode]}</option>
              ))}
            </select>
            {editingExpense && (
              <p className="mt-1 text-xs text-ink-400">Use o botão "Recalcular Parcelas" para alterar.</p>
            )}
          </div>
          )}

          {!form.is_recurring && form.installment_mode === 'fixed_days' && (
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Intervalo entre Parcelas (dias) *</label>
              <input
                type="number"
                min={1}
                value={form.installment_interval_days}
                onChange={(e) => setForm({ ...form, installment_interval_days: e.target.value })}
                className="input-field"
                placeholder="Ex: 20"
                disabled={!!editingExpense}
              />
              {formErrors.installment_interval_days && <p className="mt-1 text-xs text-error-600">{formErrors.installment_interval_days}</p>}
            </div>
          )}

          {!form.is_recurring && form.installment_mode === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Datas de Vencimento das Parcelas *</label>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {Array.from({ length: form.installment_count }, (_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-ink-500 w-16 shrink-0">Parcela {i + 1}</span>
                    <input
                      type="date"
                      value={form.custom_due_dates[i] ?? ''}
                      onChange={(e) => {
                        const next = [...form.custom_due_dates];
                        next[i] = e.target.value;
                        setForm({ ...form, custom_due_dates: next });
                      }}
                      className="input-field"
                      disabled={!!editingExpense}
                    />
                  </div>
                ))}
              </div>
              {formErrors.custom_due_dates && <p className="mt-1 text-xs text-error-600">{formErrors.custom_due_dates}</p>}
            </div>
          )}

          {!form.is_recurring && form.total_amount && Number(form.total_amount) > 0 && form.installment_count > 1 && form.payment_date && (
            <div className="rounded-lg bg-primary-50 p-3">
              <p className="text-xs font-medium text-primary-700 mb-2">
                Preview: {form.installment_count}x de {formatCurrency(Number(form.total_amount) / form.installment_count)}
              </p>
              <div className="text-xs text-primary-600">
                {previewDueDates.length === 0
                  ? '—'
                  : previewDueDates
                      .slice(0, 3)
                      .map((d) => (d ? formatDate(d) : '—'))
                      .join(' → ') + (form.installment_count > 3 ? ' → ...' : '')}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">Observações</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="input-field"
              rows={2}
              maxLength={500}
              placeholder="Observações opcionais..."
            />
          </div>
        </div>
      </Modal>

      {/* Recalculate Modal */}
      <Modal
        open={!!recalcTarget}
        onClose={() => setRecalcTarget(null)}
        title="Recalcular Parcelas"
        size="md"
        footer={
          <>
            <button onClick={() => setRecalcTarget(null)} className="btn-secondary">Cancelar</button>
            <button onClick={handleRecalcSave} disabled={recalcSaving} className="btn-primary">
              {recalcSaving ? 'Recalculando...' : 'Recalcular'}
            </button>
          </>
        }
      >
        {recalcTarget && (
          <div className="space-y-4">
            <div className="rounded-lg bg-accent-50 border border-accent-200 p-3">
              <p className="text-xs text-accent-800">
                Todas as parcelas existentes serão removidas e novas parcelas serão geradas com base nos novos valores.
                O vínculo entre parcelas será preservado.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">Novo Valor Total (R$) *</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={recalcForm.total_amount}
                  onChange={(e) => setRecalcForm({ ...recalcForm, total_amount: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">Novo Nº de Parcelas *</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={recalcForm.installment_count}
                  onChange={(e) => setRecalcForm({ ...recalcForm, installment_count: Number(e.target.value) })}
                  className="input-field"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Data do Pagamento *</label>
              <input
                type="date"
                value={recalcForm.payment_date}
                onChange={(e) => setRecalcForm({ ...recalcForm, payment_date: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Tipo de Parcelamento *</label>
              <select
                value={recalcForm.installment_mode}
                onChange={(e) => setRecalcForm({ ...recalcForm, installment_mode: e.target.value as InstallmentMode })}
                className="input-field"
              >
                {(Object.keys(INSTALLMENT_MODE_LABELS) as InstallmentMode[]).map((mode) => (
                  <option key={mode} value={mode}>{INSTALLMENT_MODE_LABELS[mode]}</option>
                ))}
              </select>
            </div>
            {recalcForm.installment_mode === 'fixed_days' && (
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">Intervalo entre Parcelas (dias) *</label>
                <input
                  type="number"
                  min={1}
                  value={recalcForm.installment_interval_days}
                  onChange={(e) => setRecalcForm({ ...recalcForm, installment_interval_days: e.target.value })}
                  className="input-field"
                  placeholder="Ex: 20"
                />
              </div>
            )}
            {recalcForm.installment_mode === 'custom' && (
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">Datas de Vencimento das Parcelas *</label>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {Array.from({ length: recalcForm.installment_count }, (_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-ink-500 w-16 shrink-0">Parcela {i + 1}</span>
                      <input
                        type="date"
                        value={recalcForm.custom_due_dates[i] ?? ''}
                        onChange={(e) => {
                          const next = [...recalcForm.custom_due_dates];
                          next[i] = e.target.value;
                          setRecalcForm({ ...recalcForm, custom_due_dates: next });
                        }}
                        className="input-field"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {recalcForm.total_amount && Number(recalcForm.total_amount) > 0 && recalcForm.installment_count > 0 && (
              <div className="rounded-lg bg-primary-50 p-3">
                <p className="text-xs font-medium text-primary-700">
                  Novo valor por parcela: {formatCurrency(Number(recalcForm.total_amount) / recalcForm.installment_count)}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Confirm Recurring Occurrence Modal */}
      <Modal
        open={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        title="Confirmar Despesa Recorrente"
        size="md"
        footer={
          <>
            <button onClick={() => setConfirmTarget(null)} className="btn-secondary">Cancelar</button>
            <button onClick={handleConfirmSave} disabled={confirmSaving} className="btn-primary">
              {confirmSaving ? 'Confirmando...' : 'Confirmar'}
            </button>
          </>
        }
      >
        {confirmTarget && (
          <div className="space-y-4">
            <p className="text-sm text-ink-700">
              <strong>{confirmTarget.supplier || confirmTarget.category?.name}</strong> de{' '}
              {getCompetenceString(confirmTarget.competence_month, confirmTarget.competence_year)} está previsto em{' '}
              <strong>{formatCurrency(Number(confirmTarget.total_amount))}</strong> (igual ao mês anterior), com vencimento em{' '}
              {confirmTarget.payment_date ? formatDate(confirmTarget.payment_date) : '-'}. Confirme o valor ou altere-o abaixo.
            </p>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Valor (R$) *</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={confirmAmount}
                onChange={(e) => setConfirmAmount(e.target.value)}
                className="input-field"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* View Modal */}
      <Modal open={!!viewTarget} onClose={() => setViewTarget(null)} title="Detalhes da Despesa" size="lg">
        {viewTarget && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-xs text-ink-500">Competência:</span><p className="text-sm font-medium">{getCompetenceString(viewTarget.competence_month, viewTarget.competence_year)}</p></div>
              <div><span className="text-xs text-ink-500">Fornecedor:</span><p className="text-sm font-medium">{viewTarget.supplier ?? '-'}</p></div>
              <div><span className="text-xs text-ink-500">Centro de Custo:</span><p className="text-sm font-medium">{viewTarget.category?.cost_center?.name ?? '-'}</p></div>
              <div><span className="text-xs text-ink-500">Categoria:</span><p className="text-sm font-medium">{viewTarget.category?.name ?? '-'}</p></div>
              <div><span className="text-xs text-ink-500">Subcategoria:</span><p className="text-sm font-medium">{viewTarget.subcategory?.name ?? '-'}</p></div>
              <div><span className="text-xs text-ink-500">Data Pagamento:</span><p className="text-sm font-medium">{viewTarget.payment_date ? formatDate(viewTarget.payment_date) : '-'}</p></div>
              <div><span className="text-xs text-ink-500">Valor Total:</span><p className="text-sm font-bold">{formatCurrency(Number(viewTarget.total_amount))}</p></div>
              <div><span className="text-xs text-ink-500">Parcelas:</span><p className="text-sm font-medium">{viewTarget.installment_count}x</p></div>
              <div><span className="text-xs text-ink-500">Tipo de Parcelamento:</span><p className="text-sm font-medium">{INSTALLMENT_MODE_LABELS[viewTarget.installment_mode ?? 'monthly']}{viewTarget.installment_mode === 'fixed_days' && viewTarget.installment_interval_days ? ` (${viewTarget.installment_interval_days} dias)` : ''}</p></div>
              {viewTarget.notes && <div className="col-span-2"><span className="text-xs text-ink-500">Observações:</span><p className="text-sm font-medium">{viewTarget.notes}</p></div>}
            </div>

            {viewTarget.recurring_expense_id && (
              <div className="flex items-center justify-between rounded-lg bg-primary-50 p-3">
                <div className="flex items-center gap-2 text-sm text-primary-800">
                  <Repeat className="h-4 w-4" />
                  <span>
                    Despesa recorrente
                    {viewTarget.confirmation_status === 'pending_confirmation' && ' — aguardando confirmação'}
                  </span>
                </div>
                <button onClick={() => handleEndRecurring(viewTarget)} className="text-xs font-medium text-primary-700 hover:text-primary-900 underline">
                  Encerrar Recorrência
                </button>
              </div>
            )}

            <div>
              <h4 className="text-sm font-semibold text-ink-900 mb-2">Parcelas</h4>
              <div className="overflow-hidden rounded-lg ring-1 ring-ink-200">
                <table className="min-w-full divide-y divide-ink-200">
                  <thead className="bg-ink-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-ink-500">#</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-ink-500">Competência</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-ink-500">Valor</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-ink-500">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {(viewTarget.installments ?? []).map((inst) => (
                      <tr key={inst.id}>
                        <td className="px-3 py-2 text-sm text-ink-700">{inst.installment_number}</td>
                        <td className="px-3 py-2 text-sm text-ink-700">
                          {inst.competence_month && inst.competence_year
                            ? getCompetenceString(inst.competence_month, inst.competence_year)
                            : '-'}
                        </td>
                        <td className="px-3 py-2 text-sm text-right font-medium">{formatCurrency(Number(inst.amount))}</td>
                        <td className="px-3 py-2 text-center">
                          <Badge variant={inst.paid ? 'success' : 'warning'}>
                            {inst.paid ? 'Pago' : 'Pendente'}
                          </Badge>
                        </td>
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
        message={
          deleteTarget?.recurring_expense_id
            ? 'Deseja realmente excluir esta ocorrência? Apenas este lançamento será removido — a recorrência continua ativa e o próximo mês será gerado normalmente. Para parar de gerar novos lançamentos, use "Encerrar Recorrência" nos detalhes da despesa.'
            : 'Deseja realmente excluir esta despesa? Todas as parcelas vinculadas serão removidas.'
        }
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

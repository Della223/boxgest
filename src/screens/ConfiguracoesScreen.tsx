import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Power, Tag, Building2, Layers, Calendar, Megaphone, Settings as SettingsIcon, Truck, Instagram, Link2, Unlink, RefreshCw, AlertCircle, User, AtSign } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import Badge from '../components/ui/Badge';
import { createAuditLog } from '../services/audit.service';
import { logChanges } from '../services/change-history.service';
import { formatDate } from '../utils/format';
import {
  updateRevenueMainCategory, deleteRevenueMainCategory, checkRevenueMainCategoryInUse,
  updateRevenueSubcategory, deleteRevenueSubcategory, checkRevenueSubcategoryInUse,
  createExpenseCategory, updateExpenseCategory, deleteExpenseCategory,
  createSubcategory, updateSubcategory, deleteSubcategory,
  createCostCenter, updateCostCenter, deleteCostCenter,
  checkExpenseCategoryInUse, checkCostCenterInUse,
  createSupplierRecord, updateSupplierRecord, deleteSupplierRecord, checkSupplierInUse,
} from '../services/settings.service';
import {
  createRevenueMainCategory, fetchAllRevenueMainCategories,
  createRevenueSubcategory, fetchAllRevenueSubcategories,
} from '../services/revenue.service';
import { fetchAllExpenseCategories, fetchAllSubcategories, fetchAllCostCenters, fetchAllSuppliers } from '../services/expense.service';
import { fetchInstagramIntegration, disconnectInstagram, getInstagramAuthUrl, syncInstagram } from '../services/marketing.service';
import type { RevenueMainCategory, RevenueSubcategory, ExpenseCategory, ExpenseSubcategory, CostCenter, Supplier, InstagramIntegration } from '../types';

type TabId = 'receita-categorias' | 'receita-subcategorias' | 'despesa-categorias' | 'subcategorias' | 'centros-custo' | 'fornecedores' | 'competencia' | 'marketing' | 'integracoes' | 'sistema';

const TABS: { id: TabId; label: string; icon: typeof Tag }[] = [
  { id: 'receita-categorias', label: 'Categoria Principal (Receita)', icon: Tag },
  { id: 'receita-subcategorias', label: 'Subcategoria (Receita)', icon: Layers },
  { id: 'despesa-categorias', label: 'Categorias de Despesa', icon: Tag },
  { id: 'subcategorias', label: 'Subcategoria (Despesa)', icon: Layers },
  { id: 'centros-custo', label: 'Centros de Custo', icon: Building2 },
  { id: 'fornecedores', label: 'Fornecedores', icon: Truck },
  { id: 'competencia', label: 'Competência', icon: Calendar },
  { id: 'marketing', label: 'Marketing', icon: Megaphone },
  { id: 'integracoes', label: 'Integrações', icon: Instagram },
  { id: 'sistema', label: 'Sistema', icon: SettingsIcon },
];

interface TableItem {
  id: string;
  name: string;
  active: boolean;
  type: string;
  parentCategoryId?: string;
  parentName?: string;
  costCenterId?: string;
  costCenterName?: string;
  deductionRate?: number;
}

export default function ConfiguracoesScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabId>('receita-categorias');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [revenueMainCategories, setRevenueMainCategories] = useState<RevenueMainCategory[]>([]);
  const [revenueSubcategories, setRevenueSubcategories] = useState<RevenueSubcategory[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [subcategories, setSubcategories] = useState<ExpenseSubcategory[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [integration, setIntegration] = useState<InstagramIntegration | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<{ id: string; name: string } | null>(null);
  const [formName, setFormName] = useState('');
  const [formParentCategory, setFormParentCategory] = useState('');
  const [formCostCenter, setFormCostCenter] = useState('');
  const [formDeductionRate, setFormDeductionRate] = useState('0');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; type: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [revMainCats, revSubs, expCats, subs, ccs, sups, integ] = await Promise.all([
        fetchAllRevenueMainCategories(),
        fetchAllRevenueSubcategories(),
        fetchAllExpenseCategories(),
        fetchAllSubcategories(),
        fetchAllCostCenters(),
        fetchAllSuppliers(),
        fetchInstagramIntegration(),
      ]);
      setRevenueMainCategories(revMainCats);
      setRevenueSubcategories(revSubs);
      setExpenseCategories(expCats);
      setSubcategories(subs);
      setCostCenters(ccs);
      setSuppliers(sups);
      setIntegration(integ);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Handle OAuth callback redirect params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const igSuccess = params.get('ig_success');
    const igError = params.get('ig_error');
    if (igSuccess) {
      toast.success('Instagram Business conectado com sucesso! Sincronização inicial concluída.');
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete('ig_success');
      window.history.replaceState({}, '', url.toString());
      loadData();
    }
    if (igError) {
      toast.error(`Erro na conexão: ${decodeURIComponent(igError)}`);
      const url = new URL(window.location.href);
      url.searchParams.delete('ig_error');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const handleOpenNew = () => {
    setEditingItem(null);
    setFormName('');
    setFormParentCategory('');
    setFormCostCenter('');
    setFormDeductionRate('0');
    setModalOpen(true);
  };

  const handleOpenEdit = (item: { id: string; name: string }, parentCategoryId?: string, costCenterId?: string, deductionRate?: number) => {
    setEditingItem(item);
    setFormName(item.name);
    setFormParentCategory(parentCategoryId ?? '');
    setFormCostCenter(costCenterId ?? '');
    setFormDeductionRate(String((deductionRate ?? 0) * 100));
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('O nome é obrigatório.');
      return;
    }
    if (activeTab === 'receita-categorias') {
      const rate = Number(formDeductionRate);
      if (Number.isNaN(rate) || rate < 0 || rate >= 100) {
        toast.error('A taxa de dedução deve ser um número entre 0 e 100.');
        return;
      }
    }
    setSaving(true);
    try {
      const auditUser = user?.id ?? null;
      if (activeTab === 'receita-categorias') {
        const deductionRate = Number(formDeductionRate) / 100;
        if (editingItem) {
          await updateRevenueMainCategory(editingItem.id, { name: formName.trim(), deduction_rate: deductionRate });
          await createAuditLog(auditUser, 'configuracoes', 'update', editingItem.id, null, { name: formName.trim(), deduction_rate: deductionRate });
          toast.success('Categoria atualizada com sucesso.');
        } else {
          const created = await createRevenueMainCategory(formName.trim());
          if (deductionRate > 0) await updateRevenueMainCategory(created.id, { deduction_rate: deductionRate });
          await createAuditLog(auditUser, 'configuracoes', 'create', created.id, null, { name: formName.trim(), deduction_rate: deductionRate });
          toast.success('Categoria criada com sucesso.');
        }
      } else if (activeTab === 'receita-subcategorias') {
        if (!formParentCategory) {
          toast.error('Selecione a categoria pai.');
          setSaving(false);
          return;
        }
        if (editingItem) {
          await updateRevenueSubcategory(editingItem.id, { name: formName.trim() });
          await createAuditLog(auditUser, 'configuracoes', 'update', editingItem.id, null, { name: formName.trim() });
          toast.success('Subcategoria atualizada com sucesso.');
        } else {
          await createRevenueSubcategory(formParentCategory, formName.trim());
          await createAuditLog(auditUser, 'configuracoes', 'create', undefined, null, { name: formName.trim() });
          toast.success('Subcategoria criada com sucesso.');
        }
      } else if (activeTab === 'despesa-categorias') {
        if (editingItem) {
          const original = expenseCategories.find((c) => c.id === editingItem.id);
          const oldValues = { name: original?.name ?? null, cost_center_id: original?.cost_center_id ?? null };
          const newValues = { name: formName.trim(), cost_center_id: formCostCenter || null };
          await updateExpenseCategory(editingItem.id, newValues);
          await logChanges('expense_categories', editingItem.id, auditUser, oldValues, newValues);
          await createAuditLog(auditUser, 'configuracoes', 'update', editingItem.id, oldValues, newValues);
          toast.success('Categoria atualizada com sucesso.');
        } else {
          await createExpenseCategory(formName.trim(), formCostCenter || undefined);
          await createAuditLog(auditUser, 'configuracoes', 'create', undefined, null, { name: formName.trim() });
          toast.success('Categoria criada com sucesso.');
        }
      } else if (activeTab === 'subcategorias') {
        if (!formParentCategory) {
          toast.error('Selecione a categoria pai.');
          setSaving(false);
          return;
        }
        if (editingItem) {
          await updateSubcategory(editingItem.id, { name: formName.trim() });
          await createAuditLog(auditUser, 'configuracoes', 'update', editingItem.id, null, { name: formName.trim() });
          toast.success('Subcategoria atualizada com sucesso.');
        } else {
          await createSubcategory(formParentCategory, formName.trim());
          await createAuditLog(auditUser, 'configuracoes', 'create', undefined, null, { name: formName.trim() });
          toast.success('Subcategoria criada com sucesso.');
        }
      } else if (activeTab === 'centros-custo') {
        if (editingItem) {
          await updateCostCenter(editingItem.id, { name: formName.trim() });
          await createAuditLog(auditUser, 'configuracoes', 'update', editingItem.id, null, { name: formName.trim() });
          toast.success('Centro de custo atualizado com sucesso.');
        } else {
          await createCostCenter(formName.trim());
          await createAuditLog(auditUser, 'configuracoes', 'create', undefined, null, { name: formName.trim() });
          toast.success('Centro de custo criado com sucesso.');
        }
      } else if (activeTab === 'fornecedores') {
        if (editingItem) {
          await updateSupplierRecord(editingItem.id, { name: formName.trim() });
          await createAuditLog(auditUser, 'configuracoes', 'update', editingItem.id, null, { name: formName.trim() });
          toast.success('Fornecedor atualizado com sucesso.');
        } else {
          await createSupplierRecord(formName.trim());
          await createAuditLog(auditUser, 'configuracoes', 'create', undefined, null, { name: formName.trim() });
          toast.success('Fornecedor criado com sucesso.');
        }
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      toast.error('Não foi possível salvar a configuração.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (id: string, active: boolean, type: string) => {
    try {
      const auditUser = user?.id ?? null;
      if (type === 'receita-principal') {
        await updateRevenueMainCategory(id, { active: !active });
        await createAuditLog(auditUser, 'configuracoes', 'update', id, { active }, { active: !active });
      } else if (type === 'receita-subcategoria') {
        await updateRevenueSubcategory(id, { active: !active });
        await createAuditLog(auditUser, 'configuracoes', 'update', id, { active }, { active: !active });
      } else if (type === 'despesa') {
        await updateExpenseCategory(id, { active: !active });
        await createAuditLog(auditUser, 'configuracoes', 'update', id, { active }, { active: !active });
      } else if (type === 'subcategoria') {
        await updateSubcategory(id, { active: !active });
        await createAuditLog(auditUser, 'configuracoes', 'update', id, { active }, { active: !active });
      } else if (type === 'cost-center') {
        await updateCostCenter(id, { active: !active });
        await createAuditLog(auditUser, 'configuracoes', 'update', id, { active }, { active: !active });
      } else if (type === 'fornecedor') {
        await updateSupplierRecord(id, { active: !active });
        await createAuditLog(auditUser, 'configuracoes', 'update', id, { active }, { active: !active });
      }
      toast.success(active ? 'Registro inativado com sucesso.' : 'Registro ativado com sucesso.');
      await loadData();
    } catch {
      toast.error('Não foi possível alterar o status.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const auditUser = user?.id ?? null;
      if (deleteTarget.type === 'receita-principal') {
        const inUse = await checkRevenueMainCategoryInUse(deleteTarget.id);
        if (inUse) { toast.error('Não é possível excluir uma categoria vinculada a vendas.'); return; }
        await deleteRevenueMainCategory(deleteTarget.id);
      } else if (deleteTarget.type === 'receita-subcategoria') {
        const inUse = await checkRevenueSubcategoryInUse(deleteTarget.id);
        if (inUse) { toast.error('Não é possível excluir uma subcategoria vinculada a vendas.'); return; }
        await deleteRevenueSubcategory(deleteTarget.id);
      } else if (deleteTarget.type === 'despesa') {
        const inUse = await checkExpenseCategoryInUse(deleteTarget.id);
        if (inUse) { toast.error('Não é possível excluir uma categoria vinculada a registros.'); return; }
        await deleteExpenseCategory(deleteTarget.id);
      } else if (deleteTarget.type === 'subcategoria') {
        await deleteSubcategory(deleteTarget.id);
      } else if (deleteTarget.type === 'cost-center') {
        const inUse = await checkCostCenterInUse(deleteTarget.id);
        if (inUse) { toast.error('Não é possível excluir um centro de custo em uso.'); return; }
        await deleteCostCenter(deleteTarget.id);
      } else if (deleteTarget.type === 'fornecedor') {
        const inUse = await checkSupplierInUse(deleteTarget.id);
        if (inUse) { toast.error('Não é possível excluir um fornecedor vinculado a despesas.'); return; }
        await deleteSupplierRecord(deleteTarget.id);
      }
      await createAuditLog(auditUser, 'configuracoes', 'delete', deleteTarget.id, null, null);
      toast.success('Registro removido com sucesso.');
      await loadData();
    } catch {
      toast.error('Não foi possível excluir o registro.');
    } finally {
      setDeleteTarget(null);
    }
  };

  const renderTable = () => {
    if (loading) return <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>;
    if (error) return <ErrorState onRetry={loadData} />;

    let items: TableItem[] = [];

    if (activeTab === 'receita-categorias') {
      items = revenueMainCategories.map(c => ({ id: c.id, name: c.name, active: c.active, type: 'receita-principal', deductionRate: c.deduction_rate }));
    } else if (activeTab === 'receita-subcategorias') {
      items = revenueSubcategories.map(s => ({
        id: s.id, name: s.name, active: s.active, type: 'receita-subcategoria',
        parentCategoryId: s.main_category_id, parentName: s.main_category?.name ?? '-',
      }));
    } else if (activeTab === 'despesa-categorias') {
      items = expenseCategories.map(c => ({
        id: c.id, name: c.name, active: c.active, type: 'despesa',
        costCenterId: c.cost_center_id ?? undefined, costCenterName: c.cost_center?.name ?? '-',
      }));
    } else if (activeTab === 'subcategorias') {
      items = subcategories.map(s => ({
        id: s.id, name: s.name, active: s.active, type: 'subcategoria',
        parentCategoryId: s.category_id, parentName: s.category?.name ?? '-',
      }));
    } else if (activeTab === 'centros-custo') {
      items = costCenters.map(c => ({ id: c.id, name: c.name, active: c.active, type: 'cost-center' }));
    } else if (activeTab === 'fornecedores') {
      items = suppliers.map(s => ({ id: s.id, name: s.name, active: s.active, type: 'fornecedor' }));
    }

    if (items.length === 0) {
      const labels: Record<string, string> = {
        'receita-categorias': 'Nenhuma categoria de receita encontrada.',
        'receita-subcategorias': 'Nenhuma subcategoria de receita encontrada.',
        'despesa-categorias': 'Nenhuma categoria de despesa encontrada.',
        'subcategorias': 'Nenhuma subcategoria encontrada.',
        'centros-custo': 'Nenhum centro de custo encontrado.',
        'fornecedores': 'Nenhum fornecedor encontrado.',
      };
      return <EmptyState title={labels[activeTab] ?? 'Nenhum registro encontrado.'} actionLabel="Criar novo" onAction={handleOpenNew} />;
    }

    return (
      <div className="overflow-hidden rounded-lg ring-1 ring-ink-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-ink-200">
            <thead className="bg-ink-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500 uppercase tracking-wider">Nome</th>
                {(activeTab === 'subcategorias' || activeTab === 'receita-subcategorias') && <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500 uppercase tracking-wider">Categoria Pai</th>}
                {activeTab === 'despesa-categorias' && <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500 uppercase tracking-wider">Centro de Custo</th>}
                {activeTab === 'receita-categorias' && <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500 uppercase tracking-wider">Taxa de Dedução</th>}
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-ink-50/50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-ink-900">{item.name}</td>
                  {(activeTab === 'subcategorias' || activeTab === 'receita-subcategorias') && <td className="px-4 py-3 text-sm text-ink-600">{item.parentName}</td>}
                  {activeTab === 'despesa-categorias' && <td className="px-4 py-3 text-sm text-ink-600">{item.costCenterName}</td>}
                  {activeTab === 'receita-categorias' && <td className="px-4 py-3 text-sm text-ink-600 text-right">{((item.deductionRate ?? 0) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</td>}
                  <td className="px-4 py-3">
                    <Badge variant={item.active ? 'success' : 'neutral'}>{item.active ? 'Ativa' : 'Inativa'}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handleOpenEdit({ id: item.id, name: item.name }, item.parentCategoryId, item.costCenterId, item.deductionRate)} className="p-1.5 text-ink-500 hover:text-primary-600 hover:bg-primary-50 rounded-md transition-colors" title="Editar">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleToggleActive(item.id, item.active, item.type)} className="p-1.5 text-ink-500 hover:text-warning-600 hover:bg-warning-50 rounded-md transition-colors" title={item.active ? 'Inativar' : 'Ativar'}>
                        <Power className="h-4 w-4" />
                      </button>
                      <button onClick={() => setDeleteTarget({ id: item.id, name: item.name, type: item.type })} className="p-1.5 text-ink-500 hover:text-error-600 hover:bg-error-50 rounded-md transition-colors" title="Excluir">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderCompetence = () => (
    <div className="card p-6">
      <h3 className="text-base font-semibold text-ink-900">Competência Ativa</h3>
      <p className="mt-1 text-sm text-ink-500">Define o mês/ano de referência para lançamentos e relatórios.</p>
      <div className="mt-4 flex items-center gap-3">
        <Badge variant="info" size="md">{new Date().toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' })}</Badge>
        <span className="text-sm text-ink-500">Competência atual do sistema</span>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-ink-50 p-4">
          <p className="text-sm font-medium text-ink-700">Abrir Competência</p>
          <p className="mt-1 text-xs text-ink-500">Permite lançamentos na competência selecionada.</p>
        </div>
        <div className="rounded-lg bg-ink-50 p-4">
          <p className="text-sm font-medium text-ink-700">Encerrar Competência</p>
          <p className="mt-1 text-xs text-ink-500">Bloqueia lançamentos e registra auditoria.</p>
        </div>
      </div>
    </div>
  );

  const renderMarketing = () => (
    <div className="card p-6">
      <h3 className="text-base font-semibold text-ink-900">Configurações de Marketing</h3>
      <p className="mt-1 text-sm text-ink-500">Defina os horários sugeridos para publicações.</p>
      <div className="mt-4 space-y-4">
        <div className="flex items-center justify-between rounded-lg bg-ink-50 p-4">
          <div>
            <p className="text-sm font-medium text-ink-700">Story</p>
            <p className="mt-0.5 text-xs text-ink-500">Segunda a Sexta, horário sugerido: 12:00</p>
          </div>
          <Badge variant="info" size="md">12:00</Badge>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-ink-50 p-4">
          <div>
            <p className="text-sm font-medium text-ink-700">Feed</p>
            <p className="mt-0.5 text-xs text-ink-500">Terça e Quinta, horário sugerido: 19:00</p>
          </div>
          <Badge variant="info" size="md">19:00</Badge>
        </div>
      </div>
    </div>
  );

  const handleConnectInstagram = async () => {
    setConnecting(true);
    try {
      const authUrl = await getInstagramAuthUrl();
      window.location.href = authUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao iniciar conexão';
      if (msg.includes('META_APP_ID') || msg.includes('configuration')) {
        toast.error('A integração requer configuração das credenciais da Meta (META_APP_ID, META_APP_SECRET, META_REDIRECT_URI). Contate o administrador do sistema.');
      } else {
        toast.error(msg);
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleSyncInstagram = async () => {
    setSyncing(true);
    try {
      const result = await syncInstagram();
      toast.success(`Sincronização concluída! ${result.synced} nova(s) publicação(ões) importada(s).`);
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro na sincronização';
      if (msg.includes('not connected')) {
        toast.error('Instagram não está conectado.');
      } else if (msg.includes('Re-authentication') || msg.includes('expired')) {
        toast.error('Token expirado. Por favor, reconecte sua conta Instagram.');
      } else {
        toast.error(msg);
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnectInstagram = async () => {
    try {
      await disconnectInstagram();
      toast.success('Instagram desconectado com sucesso.');
      await loadData();
    } catch {
      toast.error('Não foi possível desconectar.');
    }
  };

  const renderIntegracoes = () => {
    const isConnected = integration?.connected ?? false;
    const hasSyncError = !!integration?.sync_error;

    return (
      <div className="space-y-4">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-secondary-600 text-white">
                <Instagram className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-ink-900">Instagram Business</h3>
                <p className="text-sm text-ink-500">Conecte sua conta para automação de marketing</p>
              </div>
            </div>
            <Badge variant={isConnected ? 'success' : 'neutral'} size="md">
              {isConnected ? '🟢 Conectado' : '🔴 Não conectado'}
            </Badge>
          </div>

          {isConnected ? (
            <div className="space-y-4">
              {/* Account info */}
              <div className="flex items-center gap-4 rounded-lg bg-ink-50 p-4">
                {integration?.profile_pic_url ? (
                  <img
                    src={integration.profile_pic_url}
                    alt={integration.account_name ?? 'Instagram'}
                    className="h-14 w-14 rounded-full object-cover ring-2 ring-white shadow-sm"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                    <Instagram className="h-7 w-7" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-ink-900">{integration?.account_name ?? '-'}</p>
                  <p className="text-xs text-ink-500 flex items-center gap-1">
                    <AtSign className="h-3 w-3" />
                    {integration?.username ?? '-'}
                  </p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-ink-500">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {integration?.followers_count ?? 0} seguidores
                    </span>
                    <span>{integration?.media_count ?? 0} publicações</span>
                  </div>
                </div>
              </div>

              {/* Sync error warning */}
              {hasSyncError && (
                <div className="flex items-start gap-2.5 rounded-lg bg-error-50 p-3">
                  <AlertCircle className="h-4.5 w-4.5 flex-shrink-0 mt-0.5 text-error-600" />
                  <div>
                    <p className="text-sm font-semibold text-error-700">Erro de sincronização</p>
                    <p className="text-xs text-error-600">{integration?.sync_error}</p>
                  </div>
                </div>
              )}

              {/* Meta info */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-ink-50 p-3">
                  <p className="text-xs text-ink-500">Última Sincronização</p>
                  <p className="text-sm font-medium text-ink-900">{integration?.last_sync_at ? formatDate(integration.last_sync_at) : '-'}</p>
                </div>
                <div className="rounded-lg bg-ink-50 p-3">
                  <p className="text-xs text-ink-500">Última Postagem</p>
                  <p className="text-sm font-medium text-ink-900">{integration?.last_post_date ? formatDate(integration.last_post_date) : '-'}</p>
                </div>
                <div className="rounded-lg bg-ink-50 p-3">
                  <p className="text-xs text-ink-500">Conectado em</p>
                  <p className="text-sm font-medium text-ink-900">{integration?.connected_at ? formatDate(integration.connected_at) : '-'}</p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleSyncInstagram}
                  disabled={syncing}
                  className="btn-primary"
                >
                  <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Sincronizando...' : 'Sincronizar Agora'}
                </button>
                <button
                  onClick={handleDisconnectInstagram}
                  className="btn-secondary"
                >
                  <Unlink className="h-4 w-4" />
                  Desconectar
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-ink-50 p-4">
                <p className="text-sm text-ink-600">
                  A integração com Instagram Business utiliza o OAuth oficial da Meta.
                  Após conectar, os dados de publicação serão coletados automaticamente a cada 30 minutos.
                </p>
              </div>
              <div className="rounded-lg bg-primary-50 p-4">
                <p className="text-xs font-medium text-primary-700 mb-2">Requisitos para conexão:</p>
                <ul className="text-xs text-primary-600 space-y-1">
                  <li>• Conta Instagram Business (não pessoal)</li>
                  <li>• Página do Facebook vinculada à conta Instagram</li>
                  <li>• Permissão de administrador da Página</li>
                </ul>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleConnectInstagram}
                  disabled={connecting}
                  className="btn-primary"
                >
                  {connecting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Conectando...
                    </>
                  ) : (
                    <>
                      <Link2 className="h-4 w-4" />
                      Conectar Instagram
                    </>
                  )}
                </button>
                <span className="text-xs text-ink-400">
                  Fluxo: Conectar → Login Meta → Escolher Página → Autorizar
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSystem = () => (
    <div className="card p-6">
      <h3 className="text-base font-semibold text-ink-900">Parâmetros do Sistema</h3>
      <p className="mt-1 text-sm text-ink-500">Informações gerais da instalação.</p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-ink-500">Nome da Empresa</label>
          <p className="mt-1 text-sm font-medium text-ink-900">CarCenter PRO</p>
        </div>
        <div>
          <label className="text-xs font-medium text-ink-500">Moeda</label>
          <p className="mt-1 text-sm font-medium text-ink-900">BRL (R$)</p>
        </div>
        <div>
          <label className="text-xs font-medium text-ink-500">Fuso Horário</label>
          <p className="mt-1 text-sm font-medium text-ink-900">America/Sao_Paulo</p>
        </div>
        <div>
          <label className="text-xs font-medium text-ink-500">Idioma</label>
          <p className="mt-1 text-sm font-medium text-ink-900">Português (Brasil)</p>
        </div>
        <div>
          <label className="text-xs font-medium text-ink-500">Versão do Sistema</label>
          <p className="mt-1 text-sm font-medium text-ink-900">3.0.0</p>
        </div>
        <div>
          <label className="text-xs font-medium text-ink-500">Ambiente</label>
          <p className="mt-1 text-sm font-medium text-ink-900">Produção</p>
        </div>
      </div>
    </div>
  );

  const showNewButton = activeTab === 'receita-categorias' || activeTab === 'receita-subcategorias' || activeTab === 'despesa-categorias' || activeTab === 'subcategorias' || activeTab === 'centros-custo' || activeTab === 'fornecedores';
  const modalTitle = editingItem ? 'Editar Registro' : 'Novo Registro';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {showNewButton && (
        <div className="flex justify-end">
          <button onClick={handleOpenNew} className="btn-primary">
            <Plus className="h-4 w-4" />
            Novo
          </button>
        </div>
      )}

      {activeTab === 'competencia' ? renderCompetence()
        : activeTab === 'marketing' ? renderMarketing()
        : activeTab === 'integracoes' ? renderIntegracoes()
        : activeTab === 'sistema' ? renderSystem()
        : renderTable()}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        size="sm"
        footer={
          <>
            <button onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {activeTab === 'subcategorias' && (
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Categoria Pai *</label>
              <select
                value={formParentCategory}
                onChange={(e) => setFormParentCategory(e.target.value)}
                className="input-field"
                disabled={!!editingItem}
              >
                <option value="">Selecione...</option>
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
          {activeTab === 'receita-subcategorias' && (
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Categoria Principal *</label>
              <select
                value={formParentCategory}
                onChange={(e) => setFormParentCategory(e.target.value)}
                className="input-field"
                disabled={!!editingItem}
              >
                <option value="">Selecione...</option>
                {revenueMainCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
          {activeTab === 'despesa-categorias' && (
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Centro de Custo</label>
              <select
                value={formCostCenter}
                onChange={(e) => setFormCostCenter(e.target.value)}
                className="input-field"
              >
                <option value="">Sem centro de custo</option>
                {costCenters.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">Nome *</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="input-field"
              placeholder="Digite o nome..."
              autoFocus
              maxLength={150}
            />
          </div>
          {activeTab === 'receita-categorias' && (
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Taxa de Dedução (%)</label>
              <input
                type="number"
                min={0}
                max={99.99}
                step="0.01"
                value={formDeductionRate}
                onChange={(e) => setFormDeductionRate(e.target.value)}
                className="input-field"
                placeholder="0"
              />
              <p className="mt-1 text-xs text-ink-400">
                Deduzida automaticamente da receita bruta de toda venda desta categoria (ex.: taxa de antecipação de recebíveis). Nunca lançar como despesa.
              </p>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Confirmar Exclusão"
        message={`Deseja realmente excluir "${deleteTarget?.name}"? Esta ação não pode ser desfeita.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

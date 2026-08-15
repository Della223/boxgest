import { useState, useEffect, useCallback } from 'react';
import { Repeat, AlertTriangle, Wallet, Percent } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import ErrorState from '../components/ui/ErrorState';
import { KPISkeleton, Skeleton } from '../components/ui/Skeleton';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import { fetchHomeData, type HomeData } from '../services/home.service';
import {
  fetchPendingRecurringExpenses, confirmRecurringOccurrence, ensureRecurringOccurrencesGenerated,
} from '../services/recurring-expense.service';
import { getCurrentCompetence, getCompetenceString, formatDate, formatCurrency } from '../utils/format';
import ExecutivePanel from '../components/home/ExecutivePanel';
import ManagerAssistant from '../components/home/ManagerAssistant';
import type { Expense } from '../types';

export default function HomeScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const { month, year } = getCurrentCompetence();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [data, setData] = useState<HomeData | null>(null);

  const [pendingRecurring, setPendingRecurring] = useState<Expense[]>([]);
  const [confirmTarget, setConfirmTarget] = useState<Expense | null>(null);
  const [confirmAmount, setConfirmAmount] = useState('');
  const [confirmSaving, setConfirmSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      await ensureRecurringOccurrencesGenerated();
      const [homeData, pending] = await Promise.all([
        fetchHomeData(month, year),
        fetchPendingRecurringExpenses(month, year),
      ]);
      setData(homeData);
      setPendingRecurring(pending);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { loadData(); }, [loadData]);

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

  const handleRetry = async () => {
    setError(false);
    await loadData();
  };

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  })();

  if (loading) {
    return (
      <div className="space-y-6">
        <KPISkeleton />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return <ErrorState onRetry={handleRetry} />;
  }

  return (
    <div className="space-y-6">
      {/* 1. Saudação */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink-900">{greeting}, {user?.name}!</h2>
          <p className="text-sm text-ink-500">Competência: {getCompetenceString(month, year)}</p>
        </div>
        <Badge variant="info" size="md">{formatDate(new Date().toISOString())}</Badge>
      </div>

      {/* Despesas Recorrentes Pendentes */}
      {pendingRecurring.length > 0 && (
        <div className="card p-5">
          <h3 className="text-base font-semibold text-ink-900 mb-4 flex items-center gap-2">
            <Repeat className="h-4 w-4 text-primary-600" />
            Despesas Recorrentes Pendentes
          </h3>
          <div className="space-y-2">
            {pendingRecurring.map((e) => {
              const isOverdue = !!e.payment_date && e.payment_date < new Date().toISOString().split('T')[0];
              return (
                <div key={e.id} className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${isOverdue ? 'border-error-200 bg-error-50' : 'border-warning-200 bg-warning-50'}`}>
                  <div className="flex items-start gap-2 min-w-0">
                    {isOverdue && <AlertTriangle className="h-4 w-4 text-error-600 mt-0.5 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-900 truncate">{e.supplier || e.category?.name || 'Despesa recorrente'}</p>
                      <p className="text-xs text-ink-500">
                        Previsto: {formatCurrency(Number(e.total_amount))} · Vencimento: {e.payment_date ? formatDate(e.payment_date) : '-'}
                        {isOverdue && ' · Atrasada'}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => handleOpenConfirm(e)} className="btn-secondary shrink-0">Confirmar</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. KPIs */}
      <ExecutivePanel kpis={data.kpis} />

      {/* Retiradas — informativo, fora do resultado operacional */}
      {data.kpis.retiradasSocio > 0 && (
        <div className="card p-4 border border-ink-200 bg-ink-50/50">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-ink-500" />
              <span className="text-sm font-medium text-ink-700">Retiradas no Mês</span>
            </div>
            <span className="text-sm font-semibold text-ink-900">{formatCurrency(data.kpis.retiradasSocio)}</span>
          </div>
          <p className="mt-1 text-xs text-ink-400">Informativo — não entra no resultado operacional da loja.</p>
        </div>
      )}

      {/* Deduções de Receita (antecipação de recebíveis + impostos sobre vendas) — já refletidas em Receita/Resultado, exibidas à parte para transparência */}
      {data.kpis.deducoesReceita > 0 && (
        <div className="card p-4 border border-ink-200 bg-ink-50/50">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Percent className="h-4 w-4 text-ink-500" />
              <span className="text-sm font-medium text-ink-700">Deduções de Receita no Mês</span>
            </div>
            <span className="text-sm font-semibold text-ink-900">{formatCurrency(data.kpis.deducoesReceita)}</span>
          </div>
          <p className="mt-1 text-xs text-ink-400">Antecipação de recebíveis (ex.: frotas/seguradoras) + impostos sobre vendas (ex.: ISS/ICMS) — já descontados da Receita e do Resultado do Mês acima. Detalhamento por origem disponível no DRE.</p>
        </div>
      )}

      {/* 3. Assistente Gerencial */}
      <ManagerAssistant insights={data.insights} />

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
              <strong>{confirmTarget.supplier || confirmTarget.category?.name}</strong> está previsto em{' '}
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
    </div>
  );
}

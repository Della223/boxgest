export interface User {
  id: string;
  auth_id: string | null;
  name: string;
  email: string;
  role: 'admin' | 'financeiro' | 'operador';
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RevenueMainCategory {
  id: string;
  name: string;
  active: boolean;
  /** Fração (0-1) deduzida da receita bruta desta categoria para chegar à Receita Líquida (ex.: taxa de antecipação de recebíveis). Nunca lançada como despesa. */
  deduction_rate: number;
  created_at: string;
}

export interface RevenueSubcategory {
  id: string;
  main_category_id: string;
  name: string;
  active: boolean;
  created_at: string;
  main_category?: RevenueMainCategory;
}

export interface RevenueCategory {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
}

export interface RevenueItem {
  id: string;
  revenue_id: string;
  subcategory_id: string;
  quantity: number;
  amount: number;
  created_at: string;
  updated_at: string;
  subcategory?: RevenueSubcategory | null;
}

export interface Revenue {
  id: string;
  revenue_date: string;
  competence_month: number | null;
  competence_year: number | null;
  category_id: string;
  main_category_id: string | null;
  subcategory_id: string | null;
  quantity: number;
  amount: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  category?: RevenueCategory;
  main_category?: RevenueMainCategory | null;
  subcategory?: RevenueSubcategory | null;
  user?: User | null;
  items?: RevenueItem[];
}

export interface ExpenseCategory {
  id: string;
  name: string;
  active: boolean;
  cost_center_id: string | null;
  created_at: string;
  cost_center?: CostCenter | null;
}

export interface ExpenseSubcategory {
  id: string;
  category_id: string;
  name: string;
  active: boolean;
  created_at: string;
  category?: ExpenseCategory;
}

export interface Supplier {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CostCenter {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
}

export type InstallmentMode = 'monthly' | 'fixed_days' | 'custom';
export type ConfirmationStatus = 'confirmed' | 'pending_confirmation';

export interface Expense {
  id: string;
  competence_month: number;
  competence_year: number;
  supplier: string | null;
  supplier_id: string | null;
  category_id: string;
  subcategory_id: string | null;
  description: string | null;
  total_amount: number;
  installment_count: number;
  installment_mode: InstallmentMode;
  installment_interval_days: number | null;
  appropriation_type: string | null;
  payment_date: string | null;
  notes: string | null;
  recurring_expense_id: string | null;
  confirmation_status: ConfirmationStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** category.cost_center_id (via category.cost_center) is the source of truth for the expense's cost center — expenses no longer store their own. */
  category?: ExpenseCategory;
  subcategory?: ExpenseSubcategory | null;
  supplier_ref?: Supplier | null;
  user?: User | null;
  installments?: ExpenseInstallment[];
}

export interface RecurringExpense {
  id: string;
  description: string;
  category_id: string;
  subcategory_id: string | null;
  supplier_id: string | null;
  supplier: string | null;
  due_day: number;
  last_confirmed_amount: number;
  start_month: number;
  start_year: number;
  last_generated_month: number;
  last_generated_year: number;
  end_date: string | null;
  active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** category.cost_center_id (via category.cost_center) is the source of truth for the cost center — expenses no longer store their own. */
  category?: ExpenseCategory;
  subcategory?: ExpenseSubcategory | null;
}

export interface ExpenseInstallment {
  id: string;
  expense_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  paid: boolean;
  payment_date: string | null;
  payment_method: string | null;
  competence_month: number | null;
  competence_year: number | null;
  created_at: string;
}

export type BudgetOrigin = 'automatico' | 'manual';

export interface Budget {
  id: string;
  year: number;
  month: number;
  category_id: string;
  planned_amount: number;
  origin: BudgetOrigin;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  category?: ExpenseCategory;
}

export interface HomeInsight {
  id: string;
  type: 'warning' | 'positive' | 'critical' | 'info';
  title: string;
  description: string;
  priority: number;
  icon: string;
}

export interface CalendarDayInfo {
  date: string;
  day: number;
  isWeekend: boolean;
  isToday: boolean;
  hasRevenue: boolean;
  hasExpense: boolean;
  hasMovement: boolean;
  isWeekday: boolean;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  module: string;
  operation: string;
  record_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
  user?: User | null;
}

export interface RevenueWithCategory extends Revenue {
  category: RevenueCategory;
}

export interface DashboardKPIs {
  receitaAcumulada: number;
  despesaAcumulada: number;
  resultado: number;
  projecao: number;
  ticketMedio: number;
  maiorCategoriaDespesa: string;
  quantidadeVendas: number;
  margem: number;
  receitaDiariaMedia: number;
  resultadoMesAnterior: number;
  receitaMesAnterior: number;
  despesaMesAnterior: number;
  variacaoResultado: number;
  variacaoReceita: number;
  variacaoDespesa: number;
  totalBudget: number;
  /** false when the previous-period baseline is zero/unavailable — the variação above isn't meaningful. Only set by home.service.ts. */
  receitaComparavel?: boolean;
  despesaComparavel?: boolean;
  resultadoComparavel?: boolean;
  /** Centro de Custo "Retiradas de Sócio" — já excluído de despesaAcumulada/resultado, exposto à parte para exibição informativa. */
  retiradasSocio: number;
  /** Total deduzido da receita bruta no período (ex.: taxa de antecipação de recebíveis da Localiza) — já refletido em receitaAcumulada/resultado, exposto à parte para exibição informativa. */
  deducoesReceita: number;
}

export interface DRESubItem {
  name: string;
  amount: number;
}

export interface DRERevenueCategoryGroup {
  category: string;
  amount: number;
  subcategories: DRESubItem[];
}

export interface DREExpenseCategoryGroup {
  category: string;
  amount: number;
  subcategories: DRESubItem[];
}

export interface DREExpenseCostCenterGroup {
  category: string;
  amount: number;
  categories: DREExpenseCategoryGroup[];
}

export interface DREData {
  receitaBruta: number;
  receitaPorCategoria: DRERevenueCategoryGroup[];
  deducoes: number;
  /** Deduções da receita bruta, agrupadas por categoria principal (ex.: taxa de antecipação de recebíveis da Localiza). */
  deducoesPorCategoria: DRESubItem[];
  receitaLiquida: number;
  /** Centros de custo CPV e CSP — custo direto, deduzido antes do Lucro Bruto. */
  custosDiretos: number;
  custosDiretosPorCategoria: DREExpenseCostCenterGroup[];
  lucroBruto: number;
  /** Demais centros de custo, exceto CPV, CSP e IR/CSLL. */
  despesasOperacionais: number;
  despesasPorCategoria: DREExpenseCostCenterGroup[];
  resultadoOperacional: number;
  /** Centro de custo IR/CSLL — imposto sobre o lucro, deduzido após o Resultado Operacional. */
  irCsll: number;
  irCsllPorCategoria: DREExpenseCostCenterGroup[];
  resultadoLiquido: number;
  margemBruta: number;
  margemOperacional: number;
  margemLiquida: number;
  /** Centro de custo "Retiradas de Sócio" — linha de memorando, fora do cálculo do resultado. */
  retiradas: number;
  retiradasPorCategoria: DREExpenseCostCenterGroup[];
}

export interface BudgetExecution {
  category_id: string;
  categoryName: string;
  planned: number;
  actual: number;
  difference: number;
  differencePercent: number;
  executionPercent: number;
}

export interface ChangeHistory {
  id: string;
  table_name: string;
  record_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_at: string;
  user?: User | null;
}

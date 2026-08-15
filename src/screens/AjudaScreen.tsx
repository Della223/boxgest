import { useState } from 'react';
import {
  DollarSign, Receipt, BarChart3, FileText, Target, ClipboardList, Settings, Users,
  ChevronDown, Mail,
} from 'lucide-react';

const MODULES = [
  {
    icon: DollarSign,
    title: 'Comercial',
    text: 'Lance as vendas da oficina. Cada venda pode reunir vários itens de categorias diferentes (Peças, Pneus, Mão de obra, Geometria e Balanceamento...) — não precisa lançar uma venda separada para cada tipo de serviço do mesmo cliente.',
  },
  {
    icon: Receipt,
    title: 'Despesas',
    text: 'Lance compras de fornecedores, contas e demais gastos, com opção de parcelamento e vínculo a um centro de custo (Custo Direto, Operacional, Impostos ou Retiradas).',
  },
  {
    icon: BarChart3,
    title: 'Dashboard',
    text: 'Visão gráfica de receitas, despesas e evolução mensal do negócio.',
  },
  {
    icon: FileText,
    title: 'DRE',
    text: 'Demonstração do Resultado do Exercício — mostra receita, custos, despesas e o lucro final da competência, na estrutura contábil padrão.',
  },
  {
    icon: Target,
    title: 'Orçamentos',
    text: 'Defina quanto planeja gastar por categoria em cada mês e acompanhe o orçado x realizado.',
  },
  {
    icon: ClipboardList,
    title: 'Relatórios',
    text: 'Relatórios prontos para exportação: receitas, despesas, DRE, fluxo financeiro e mais.',
  },
  {
    icon: Users,
    title: 'Usuários',
    text: 'Cadastre quem tem acesso ao sistema e defina o perfil de cada um (Administrador, Financeiro ou Operador).',
  },
  {
    icon: Settings,
    title: 'Configurações',
    text: 'Cadastre categorias de receita e despesa, subcategorias, centros de custo, tipos de cliente e fornecedores.',
  },
];

const FAQ = [
  {
    q: 'Como lanço uma venda com peças, pneus e mão de obra juntos?',
    a: 'Em Comercial, clique em "Nova Venda" e adicione um item para cada produto/serviço — cada item escolhe sua própria categoria. Todos os itens entram numa única venda, refletindo a nota real do cliente.',
  },
  {
    q: 'Errei uma venda ou despesa, como corrijo?',
    a: 'Na listagem, use o ícone de lápis para editar os dados principais, ou o ícone de "recalcular itens" para refazer os itens de uma venda ou as parcelas de uma despesa. O ícone de relógio mostra o histórico de alterações.',
  },
  {
    q: 'Qual a diferença entre Categoria de Receita e Tipo de Cliente?',
    a: 'A Categoria de Receita é o que foi vendido (Peças, Pneus, Mão de obra...). O Tipo de Cliente é opcional e indica quem comprou (Particular, Frota, Seguradora), usado para relatórios e taxas de dedução específicas.',
  },
  {
    q: 'O que é o Centro de Custo de uma despesa?',
    a: 'Define onde a despesa entra no DRE: Custo Direto (o que sai junto com a venda, ex.: peças de fornecedor), Operacional (despesas do dia a dia), Impostos ou Retiradas (retiradas de sócio, fora do resultado operacional).',
  },
  {
    q: 'Posso criar novas categorias, subcategorias ou tipos de cliente?',
    a: 'Sim, tudo isso fica em Configurações. Também é possível criar uma subcategoria nova direto no formulário de Nova Venda, sem precisar sair da tela.',
  },
];

export default function AjudaScreen() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-ink-900">Bem-vindo ao BoxGest</h2>
        <p className="mt-1.5 text-sm text-ink-600">
          Guia rápido dos módulos do sistema e respostas às dúvidas mais comuns. Se não encontrar o que precisa aqui, fale com a gente pelo contato no final da página.
        </p>
      </div>

      <div>
        <h3 className="text-base font-semibold text-ink-900 mb-3">O que cada módulo faz</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {MODULES.map((m) => (
            <div key={m.title} className="card p-4 flex gap-3">
              <div className="flex-shrink-0 h-9 w-9 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
                <m.icon className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-900">{m.title}</p>
                <p className="mt-0.5 text-sm text-ink-500">{m.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-base font-semibold text-ink-900 mb-3">Perguntas frequentes</h3>
        <div className="card divide-y divide-ink-100 overflow-hidden">
          {FAQ.map((item, i) => (
            <div key={i}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-ink-50/60 transition-colors"
              >
                <span className="text-sm font-medium text-ink-900">{item.q}</span>
                <ChevronDown className={`h-4 w-4 flex-shrink-0 text-ink-400 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === i && (
                <div className="px-4 pb-4 text-sm text-ink-600">{item.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card p-6">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-accent-50 text-accent-600 flex items-center justify-center flex-shrink-0">
            <Mail className="h-4.5 w-4.5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-900">Não encontrou o que procurava?</p>
            <p className="mt-0.5 text-sm text-ink-500">Fale com o suporte: <a href="mailto:suporte@boxgest.com.br" className="text-primary-600 hover:underline">suporte@boxgest.com.br</a></p>
          </div>
        </div>
      </div>
    </div>
  );
}

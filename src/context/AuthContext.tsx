import { AlertTriangle, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function WorkshopInactiveScreen() {
  const { workshopName, workshopBlockReason, signOut } = useAuth();
  const isTrialExpired = workshopBlockReason === 'trial_expired';

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-ink-50">
      <div className="w-full max-w-md card p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning-50 text-warning-600 mb-4">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-ink-900">
          {isTrialExpired ? 'Seu teste grátis acabou' : 'Acesso temporariamente indisponível'}
        </h2>
        <p className="mt-2 text-sm text-ink-500">
          {isTrialExpired ? (
            <>
              O teste grátis de 10 dias {workshopName ? <>da <strong>{workshopName}</strong></> : ''} chegou ao fim.
              Fale com a gente para ativar sua assinatura e continuar usando o BoxGest — nenhuma informação foi apagada.
            </>
          ) : (
            <>
              {workshopName ? <>A conta de <strong>{workshopName}</strong> está</> : 'Sua conta está'} desativada no momento.
              Isso costuma acontecer por pendência de pagamento. Fale com o suporte para regularizar e voltar a acessar seus dados normalmente — nenhuma informação foi apagada.
            </>
          )}
        </p>

        
          href="mailto:suporte@boxgest.com.br"
          className="btn-primary w-full justify-center mt-6"
        >
          <Mail className="h-4 w-4" />
          Falar com o suporte
        </a>

        <button
          onClick={() => signOut()}
          className="mt-3 text-sm text-ink-400 hover:text-ink-600 transition-colors"
        >
          Sair
        </button>
      </div>
    </div>
  );
}

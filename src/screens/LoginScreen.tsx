import { useState } from 'react';
import { ShieldCheck, TrendingUp, Lock, Mail, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type Mode = 'login' | 'recovery';

interface LoginScreenProps {
  onShowSignup: () => void;
}

export default function LoginScreen({ onShowSignup }: LoginScreenProps) {
  const { signIn, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error: signInError } = await signIn(email, password);
        if (signInError) setError(signInError);
      } else {
        const { error: recoveryError } = await resetPassword(email);
        if (recoveryError) setError(recoveryError);
        else setRecoverySent(true);
      }
    } catch {
      setError('Erro inesperado. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-ink-50">
      {/* Brand panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary-900 via-primary-800 to-primary-950">
        <div
          className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 80%, white 1px, transparent 1px)', backgroundSize: '32px 32px' }}
        />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <img src="/logo-symbol.png" alt="BoxGest" className="h-12 w-12 object-contain" />
            <div>
              <p className="text-lg font-bold tracking-tight">BoxGest</p>
              <p className="text-xs text-primary-200 font-medium">Gestão Financeira</p>
            </div>
          </div>
          <div className="space-y-6">
            <h1 className="text-4xl font-bold leading-tight tracking-tight">
              Gestão financeira<br />de ponta a ponta<br />para a sua oficina.
            </h1>
            <p className="text-primary-200 text-lg max-w-md">
              Controle completo de receitas, despesas, comissões e muito mais — em uma única plataforma.
            </p>
            <div className="flex gap-6 pt-4">
              <div className="flex items-center gap-2 text-primary-100">
                <TrendingUp className="h-5 w-5" />
                <span className="text-sm font-medium">Relatórios em tempo real</span>
              </div>
              <div className="flex items-center gap-2 text-primary-100">
                <ShieldCheck className="h-5 w-5" />
                <span className="text-sm font-medium">Dados seguros</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-primary-300">© 2026 BoxGest. Todos os direitos reservados.</p>
        </div>
      </div>

      {/* Login form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md animate-fade-in">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <img src="/logo-symbol.png" alt="BoxGest" className="h-11 w-11 object-contain" />
            <div>
              <p className="text-base font-bold text-ink-900">BoxGest</p>
              <p className="text-xs text-ink-500 font-medium">Gestão Financeira</p>
            </div>
          </div>

          {mode === 'recovery' && (
            <button
              onClick={() => { setMode('login'); setRecoverySent(false); setError(null); }}
              className="flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-700 mb-4 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para o login
            </button>
          )}

          <h2 className="text-2xl font-bold text-ink-900 tracking-tight">
            {mode === 'login' ? 'Acessar o sistema' : 'Recuperar senha'}
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            {mode === 'login'
              ? 'Entre com suas credenciais para continuar.'
              : 'Informe seu e-mail para receber as instruções de recuperação.'}
          </p>

          {recoverySent ? (
            <div className="mt-8 rounded-xl border border-success-200 bg-success-50 p-4">
              <p className="text-sm text-success-800 font-medium">
                Se uma conta existir com este e-mail, você receberá as instruções de recuperação.
              </p>
              <button
                onClick={() => { setMode('login'); setRecoverySent(false); setEmail(''); }}
                className="mt-3 text-sm font-medium text-success-700 hover:text-success-800"
              >
                Voltar para o login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-field pl-10"
                    placeholder="seu@email.com"
                    autoComplete="email"
                  />
                </div>
              </div>

              {mode === 'login' && (
                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1.5">Senha</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input-field pl-10 pr-10"
                      placeholder="••••••••"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-lg bg-error-50 border border-error-200 p-3">
                  <p className="text-sm text-error-700">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full justify-center"
              >
                {loading
                  ? 'Aguarde...'
                  : mode === 'login'
                    ? 'Entrar'
                    : 'Enviar instruções'}
              </button>

              {mode === 'login' && (
                <div className="text-center space-y-2">
                  <button
                    type="button"
                    onClick={() => { setMode('recovery'); setError(null); }}
                    className="text-sm text-ink-500 hover:text-primary-600 transition-colors block w-full"
                  >
                    Esqueceu sua senha?
                  </button>
                  <button
                    type="button"
                    onClick={onShowSignup}
                    className="text-sm text-ink-500 hover:text-primary-600 transition-colors block w-full"
                  >
                    Ainda não tem uma conta? <span className="font-medium text-primary-600">Criar oficina</span>
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

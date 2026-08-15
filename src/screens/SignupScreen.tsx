import { useState } from 'react';
import { Building2, ShieldCheck, Lock, Mail, User, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { createWorkshopAndAdmin } from '../services/auth.service';

interface SignupScreenProps {
  onCreated: () => void;
  onBack: () => void;
}

export default function SignupScreen({ onCreated, onBack }: SignupScreenProps) {
  const [workshopName, setWorkshopName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (!workshopName.trim()) {
      setError('Nome da oficina é obrigatório.');
      return;
    }
    if (!name.trim()) {
      setError('Nome é obrigatório.');
      return;
    }

    setLoading(true);
    try {
      const { error: signupError } = await createWorkshopAndAdmin(
        workshopName.trim(),
        name.trim(),
        email.trim(),
        password
      );
      if (signupError) {
        setError(signupError);
      } else {
        setSuccess(true);
      }
    } catch {
      setError('Erro inesperado. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-primary-50 via-white to-primary-50">
      <div className="w-full max-w-lg animate-fade-in">
        <div className="flex flex-col items-center mb-8">
          <img src="/logo-full.png" alt="BoxGest" className="w-56 max-w-[80vw]" />
          <p className="mt-2 text-sm text-ink-500 font-medium">Centro de Inteligência Empresarial</p>
        </div>

        <div className="card p-8">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-700 mb-4 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para o login
          </button>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink-900">Criar Nova Oficina</h2>
              <p className="text-sm text-ink-500">Seus dados ficam isolados dos de outras oficinas.</p>
            </div>
          </div>

          {success ? (
            <div className="rounded-lg bg-success-50 border border-success-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="h-4 w-4 text-success-600" />
                <p className="text-sm font-semibold text-success-800">Oficina criada com sucesso!</p>
              </div>
              <p className="text-sm text-success-700">Já pode entrar com o e-mail e senha cadastrados.</p>
              <button onClick={onBack} className="btn-primary w-full justify-center mt-4">
                Ir para o login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">Nome da Oficina *</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
                  <input
                    type="text"
                    required
                    value={workshopName}
                    onChange={(e) => setWorkshopName(e.target.value)}
                    className="input-field pl-10"
                    placeholder="Nome da sua oficina"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">Seu Nome *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input-field pl-10"
                    placeholder="Nome completo do administrador"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">E-mail *</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-field pl-10"
                    placeholder="admin@email.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">Senha *</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field pl-10 pr-10"
                    placeholder="Mínimo 6 caracteres"
                    minLength={6}
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

              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">Confirmar Senha *</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input-field pl-10"
                    placeholder="Repita a senha"
                    minLength={6}
                  />
                </div>
              </div>

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
                {loading ? 'Criando oficina...' : 'Criar Oficina'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

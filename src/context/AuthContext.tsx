import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';

export type UserRole = 'admin' | 'financeiro' | 'operador';

export interface AppUser {
  id: string;
  auth_id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarInitials: string;
  workshop_id: string;
}

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  workshopActive: boolean;
  workshopName: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0]?.substring(0, 2).toUpperCase() ?? '??';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [workshopActive, setWorkshopActive] = useState(true);
  const [workshopName, setWorkshopName] = useState<string | null>(null);

  const loadUserProfile = async (authId: string): Promise<AppUser | null> => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', authId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      auth_id: data.auth_id,
      name: data.name,
      email: data.email,
      role: data.role as UserRole,
      avatarInitials: getInitials(data.name),
      workshop_id: data.workshop_id,
    };
  };

  // Busca se a oficina do usuário está ativa (assinatura em dia). Feito à parte do
  // perfil porque users/workshops ficam sempre visíveis para o próprio usuário mesmo
  // com a oficina desativada — assim dá pra mostrar uma mensagem clara em vez de
  // simplesmente parecer que a conta não existe mais.
  const loadWorkshopStatus = async (workshopId: string) => {
    const { data } = await supabase
      .from('workshops')
      .select('active, name')
      .eq('id', workshopId)
      .maybeSingle();
    setWorkshopActive(data?.active ?? true);
    setWorkshopName(data?.name ?? null);
  };

  const refreshUser = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.user) {
      const profile = await loadUserProfile(sessionData.session.user.id);
      if (profile) {
        setUser(profile);
        await loadWorkshopStatus(profile.workshop_id);
        return;
      }
    }
    setUser(null);
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!mounted) return;

      if (sessionData.session?.user) {
        const profile = await loadUserProfile(sessionData.session.user.id);
        if (mounted) {
          if (profile) {
            setUser(profile);
            await loadWorkshopStatus(profile.workshop_id);
          }
          setLoading(false);
        }
      } else {
        if (mounted) setLoading(false);
      }
    };

    init();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        if (session?.user) {
          const profile = await loadUserProfile(session.user.id);
          if (mounted && profile) {
            setUser(profile);
            await loadWorkshopStatus(profile.workshop_id);
          }
        } else {
          if (mounted) setUser(null);
        }
      })();
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };

    if (data.user) {
      const profile = await loadUserProfile(data.user.id);
      if (profile) {
        setUser(profile);
        await loadWorkshopStatus(profile.workshop_id);
        return { error: null };
      }
      return { error: 'Perfil de usuário não encontrado. Contate o administrador.' };
    }
    return { error: 'Falha ao entrar.' };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}`,
    });
    return { error: error?.message ?? null };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error?.message ?? null };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        workshopActive,
        workshopName,
        signIn,
        signOut,
        resetPassword,
        updatePassword,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

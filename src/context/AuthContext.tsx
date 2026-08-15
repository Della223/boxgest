import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '../types';

export type UserRole = 'admin' | 'financeiro' | 'operador';

export interface AppUser {
  id: string;
  auth_id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarInitials: string;
}

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
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

  const loadUserProfile = async (authId: string, email: string): Promise<AppUser | null> => {
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
    };
  };

  const refreshUser = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.user) {
      const profile = await loadUserProfile(
        sessionData.session.user.id,
        sessionData.session.user.email ?? ''
      );
      if (profile) {
        setUser(profile);
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
        const profile = await loadUserProfile(
          sessionData.session.user.id,
          sessionData.session.user.email ?? ''
        );
        if (mounted) {
          if (profile) setUser(profile);
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
          const profile = await loadUserProfile(session.user.id, session.user.email ?? '');
          if (mounted && profile) setUser(profile);
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
      const profile = await loadUserProfile(data.user.id, data.user.email ?? '');
      if (profile) {
        setUser(profile);
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

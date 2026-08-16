import { supabase } from '../lib/supabase';
import type { User } from '../types';

export async function fetchAllUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function hasAdminUser(): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'admin')
    .eq('active', true)
    .not('auth_id', 'is', null)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

/**
 * Cria uma nova oficina (tenant) isolada com seu primeiro usuário administrador.
 * Chamado depois de um supabase.auth.signUp() bem-sucedido: a função no banco
 * (create_workshop_and_admin, SECURITY DEFINER) cria a oficina, vincula o usuário
 * autenticado como admin dela, e semeia categorias/centros de custo/tipos de
 * cliente padrão para o novo cliente não começar do zero.
 */
export async function createWorkshopAndAdmin(
  workshopName: string,
  adminName: string,
  email: string,
  password: string
): Promise<{ error: string | null }> {
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError) return { error: authError.message };
  if (!authData.user) return { error: 'Falha ao criar usuário de autenticação.' };

  const { error: rpcError } = await supabase.rpc('create_workshop_and_admin', {
    p_workshop_name: workshopName,
    p_admin_name: adminName,
  });

  if (rpcError) {
    return { error: 'Erro ao criar oficina: ' + rpcError.message };
  }

  await supabase.auth.signOut();
  return { error: null };
}

export async function createUserByAdmin(
  name: string,
  email: string,
  password: string,
  role: string
): Promise<{ error: string | null }> {
  // Resolve o workshop do admin que está criando o convite ANTES do signUp,
  // porque signUp troca a sessão ativa para o usuário recém-criado — depois
  // disso não dá mais para confiar em "quem está logado" para saber a oficina certa.
  const { data: sessionData } = await supabase.auth.getSession();
  const adminSession = sessionData.session;
  const currentAuthId = adminSession?.user?.id;
  if (!currentAuthId || !adminSession) return { error: 'Sessão expirada. Faça login novamente.' };

  const { data: currentProfile, error: profileLookupError } = await supabase
    .from('users')
    .select('workshop_id')
    .eq('auth_id', currentAuthId)
    .single();
  if (profileLookupError || !currentProfile) {
    return { error: 'Não foi possível identificar sua oficina.' };
  }

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError) return { error: authError.message };
  if (!authData.user) return { error: 'Falha ao criar usuário.' };

  // signUp() troca a sessão ativa do navegador para o usuário recém-criado.
  // Restaura a sessão do admin ANTES de inserir, senão a regra de segurança
  // (RLS) valida contra a oficina errada (a do usuário novo, que ainda não
  // tem nenhuma) e a inserção é rejeitada.
  const { error: restoreError } = await supabase.auth.setSession({
    access_token: adminSession.access_token,
    refresh_token: adminSession.refresh_token,
  });
  if (restoreError) {
    return { error: 'Usuário criado, mas não foi possível voltar sua sessão de admin. Faça login novamente.' };
  }

  const { error: insertError } = await supabase.from('users').insert({
    auth_id: authData.user.id,
    workshop_id: currentProfile.workshop_id,
    name,
    email,
    role,
    active: true,
  });

  if (insertError) {
    return { error: 'Erro ao criar perfil: ' + insertError.message };
  }

  return { error: null };
}

export async function updateUserStatus(
  userId: string,
  active: boolean
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('users')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', userId);
  return { error: error?.message ?? null };
}

export async function updateUserRole(
  userId: string,
  role: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('users')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', userId);
  return { error: error?.message ?? null };
}

export async function updateUserName(
  userId: string,
  name: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('users')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', userId);
  return { error: error?.message ?? null };
}

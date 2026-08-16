import { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import SplashScreen from './components/SplashScreen';
import LoginScreen from './screens/LoginScreen';
import SignupScreen from './screens/SignupScreen';
import AppShell from './components/AppShell';
import GlobalSearch from './components/GlobalSearch';
import HomeScreen from './screens/HomeScreen';
import ComercialScreen from './screens/ComercialScreen';
import DespesasScreen from './screens/DespesasScreen';
import DashboardScreen from './screens/DashboardScreen';
import DREScreen from './screens/DREScreen';
import OrcamentosScreen from './screens/OrcamentosScreen';
import RelatoriosScreen from './screens/RelatoriosScreen';
import GestaoUsuariosScreen from './screens/GestaoUsuariosScreen';
import ConfiguracoesScreen from './screens/ConfiguracoesScreen';
import AjudaScreen from './screens/AjudaScreen';
import WorkshopInactiveScreen from './screens/WorkshopInactiveScreen';
import { type ScreenId } from './config/navigation';

function AppContent() {
  const { user, loading, workshopActive } = useAuth();
  const [screen, setScreen] = useState<ScreenId>('home');
  const [homeRefreshKey, setHomeRefreshKey] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [showSignup, setShowSignup] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'k') { e.preventDefault(); setSearchOpen(true); }
      else if (e.key === 'n' && user) { e.preventDefault(); setScreen('comercial'); }
      else if (e.key === 'd' && user) { e.preventDefault(); setScreen('despesas'); }
      else if (e.key === 'f' && user) { e.preventDefault(); setSearchOpen(true); }
    }
  }, [user]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleNavigate = useCallback((s: ScreenId) => {
    setScreen(s);
    if (s === 'home') setHomeRefreshKey((k) => k + 1);
  }, []);

  const handleSearchNavigate = useCallback((s: ScreenId) => {
    setScreen(s);
    if (s === 'home') setHomeRefreshKey((k) => k + 1);
  }, []);

  if (showSplash) return <SplashScreen />;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
          <p className="text-sm text-ink-500">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (showSignup) {
      return (
        <SignupScreen
          onCreated={() => setShowSignup(false)}
          onBack={() => setShowSignup(false)}
        />
      );
    }
    return <LoginScreen onShowSignup={() => setShowSignup(true)} />;
  }

  if (!workshopActive) {
    return <WorkshopInactiveScreen />;
  }

  const renderScreen = () => {
    switch (screen) {
      case 'home': return <HomeScreen refreshKey={homeRefreshKey} />;
      case 'comercial': return <ComercialScreen />;
      case 'despesas': return <DespesasScreen />;
      case 'dashboard': return <DashboardScreen />;
      case 'dre': return <DREScreen />;
      case 'orcamentos': return <OrcamentosScreen />;
      case 'relatorios': return <RelatoriosScreen />;
      case 'usuarios': return <GestaoUsuariosScreen />;
      case 'configuracoes': return <ConfiguracoesScreen />;
      case 'ajuda': return <AjudaScreen />;
      default: return <HomeScreen refreshKey={homeRefreshKey} />;
    }
  };

  return (
    <>
      <AppShell currentScreen={screen} onNavigate={handleNavigate}>
        {renderScreen()}
      </AppShell>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} onNavigate={handleSearchNavigate} />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  );
}

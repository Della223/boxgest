import { useState } from 'react';
import { LogOut, Menu, X, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { NAV_ITEMS, type ScreenId } from '../config/navigation';

interface AppShellProps {
  currentScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  children: React.ReactNode;
}

export default function AppShell({ currentScreen, onNavigate, children }: AppShellProps) {
  const { user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeItem = NAV_ITEMS.find((item) => item.id === currentScreen);

  const handleNavigate = (id: ScreenId) => {
    onNavigate(id);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen bg-ink-50">
      {/* Sidebar - fixed */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-ink-900 text-ink-100 flex flex-col transition-transform duration-300 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo header */}
        <div className="flex h-16 items-center justify-between px-5 border-b border-ink-800">
          <div className="flex items-center gap-3">
            <img src="/logo-symbol.png" alt="BoxGest" className="h-9 w-9 object-contain" />
            <div>
              <p className="text-sm font-bold text-white tracking-tight">BoxGest</p>
              <p className="text-[10px] text-ink-400 font-medium">Gestão Financeira</p>
            </div>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden text-ink-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === currentScreen;
            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.id)}
                className={`group w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-ink-300 hover:bg-ink-800 hover:text-white'
                }`}
              >
                <Icon className={`h-5 w-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-ink-400 group-hover:text-white'}`} />
                <span className="flex-1 text-left">{item.label}</span>
                {isActive && <ChevronRight className="h-4 w-4" />}
              </button>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="border-t border-ink-800 p-3">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-500 text-sm font-semibold text-white">
              {user?.avatarInitials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
              <p className="text-xs text-ink-400 capitalize">{user?.role}</p>
            </div>
            <button
              onClick={signOut}
              className="text-ink-400 hover:text-error-400 transition-colors"
              title="Sair"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink-900/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-ink-200 bg-white/80 backdrop-blur px-4 sm:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden text-ink-600 hover:text-ink-900"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-ink-900 tracking-tight">{activeItem?.label}</h1>
            <p className="text-xs text-ink-500">{activeItem?.description}</p>
          </div>
        </header>

        {/* Screen content */}
        <main className="p-4 sm:p-6 lg:p-8 animate-fade-in">{children}</main>
      </div>
    </div>
  );
}

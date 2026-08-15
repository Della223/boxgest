export default function SplashScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-6">
                <img src="/logo-full.png" alt="BoxGest" className="w-64 max-w-[80vw] animate-fade-in" />
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 animate-pulse-soft rounded-full bg-primary-600" style={{ animationDelay: '0ms' }} />
          <div className="h-2 w-2 animate-pulse-soft rounded-full bg-primary-600" style={{ animationDelay: '200ms' }} />
          <div className="h-2 w-2 animate-pulse-soft rounded-full bg-primary-600" style={{ animationDelay: '400ms' }} />
          <span className="ml-2 text-sm font-medium text-ink-500">Carregando...</span>
        </div>
      </div>
    </div>
  );
}

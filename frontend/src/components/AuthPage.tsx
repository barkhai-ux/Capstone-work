import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import Logo from './Logo';

interface AuthPageProps {
  initialMode?: 'signin' | 'signup';
  onBack?: () => void;
}

const FEATURE_PILLS = [
  {
    title: 'Upload any data',
    desc: 'CSV, Excel, or JSON',
    icon: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3',
  },
  {
    title: 'Get instant insights',
    desc: 'Charts, KPIs, dashboards',
    icon: 'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941',
  },
];

const TRUST_LOGOS = ['Acme', 'Layers', 'Sisyphus', 'Catalog', 'Quotient'];

export default function AuthPage({ initialMode = 'signin', onBack }: AuthPageProps) {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    const fn = mode === 'signin' ? signIn : signUp;
    const { error } = await fn(email.trim(), password);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    if (mode === 'signup') {
      setInfo('Account created. You can sign in now.');
      setMode('signin');
      setPassword('');
    }
  };

  const onGoogle = async () => {
    setError(null);
    setInfo(null);
    setGoogleBusy(true);
    const { error } = await signInWithGoogle();
    setGoogleBusy(false);
    if (error) setError(error);
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* ── Brand pane ── */}
      <aside
        className="hidden lg:flex lg:w-[52%] xl:w-[50%] flex-col text-white relative overflow-hidden"
        style={{ background: 'var(--brand-grad)' }}
      >
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 18% 12%, rgba(255,255,255,0.55) 0, transparent 35%), radial-gradient(circle at 85% 70%, rgba(255,255,255,0.4) 0, transparent 40%), radial-gradient(circle at 60% 30%, rgba(255,255,255,0.2) 0, transparent 45%)',
          }}
        />
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '36px 36px',
          }}
        />

        {/* Top brand row */}
        <div className="relative px-12 pt-9 flex items-center gap-2.5">
          <Logo size={36} />
          <span className="text-[17px] font-bold tracking-tight">NoQuery</span>
        </div>

        {/* Hero */}
        <div className="relative px-12 pt-14 flex-1 flex flex-col">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.18em] mb-5 bg-white/15 backdrop-blur w-fit text-white/90 border border-white/20">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            AI-Powered Data Workspace
          </span>
          <h2 className="text-[2.5rem] xl:text-[3.25rem] font-bold leading-[1.02] tracking-tight mb-4">
            Turn spreadsheets<br />into <span className="italic font-bold" style={{ background: 'linear-gradient(90deg, #F0E6FF, #FFFFFF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>answers.</span>
          </h2>
          <p className="text-white/80 text-[14.5px] leading-relaxed max-w-md mb-7">
            Ask in plain English, get charts and insights instantly,
            and build dashboards in minutes — no SQL required.
          </p>

          {/* Feature pills */}
          <div className="grid grid-cols-2 gap-2.5 max-w-md mb-7">
            {FEATURE_PILLS.map((f) => (
              <div key={f.title} className="rounded-xl bg-white/10 backdrop-blur border border-white/10 px-3.5 py-3">
                <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center mb-2">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={f.icon} />
                  </svg>
                </div>
                <div className="text-[12.5px] font-semibold leading-tight">{f.title}</div>
                <div className="text-[11px] text-white/70 mt-0.5">{f.desc}</div>
              </div>
            ))}
          </div>

          {/* App preview card */}
          <div className="relative bg-white text-gray-700 rounded-2xl shadow-2xl border border-white/10 overflow-hidden max-w-md">
            <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-300" />
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-300" />
              <span className="w-1.5 h-1.5 rounded-full bg-green-300" />
              <span className="ml-2 text-[10px] text-gray-400 font-medium">Sales report · April</span>
            </div>
            <div className="p-4">
              <div className="flex justify-end mb-2.5">
                <div
                  className="px-3 py-1.5 rounded-2xl rounded-br-md text-[11px] text-white max-w-[220px]"
                  style={{ background: 'var(--accent)' }}
                >
                  Who are my top 5 customers by revenue?
                </div>
              </div>
              <div className="text-[10px] font-semibold text-gray-700 mb-2">Top 5 customers by revenue</div>
              <div className="flex items-end gap-2 h-20 mb-2">
                {[88, 72, 60, 45, 32].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-md"
                    style={{
                      height: `${h}%`,
                      background: i === 0 ? 'var(--accent)' : 'var(--accent-soft-active)',
                    }}
                  />
                ))}
              </div>
              <div
                className="rounded-lg px-2.5 py-1.5 flex items-start gap-1.5 text-[10.5px]"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
              >
                <svg className="w-3 h-3 mt-px flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                </svg>
                <span><span className="font-semibold">Key insight:</span> Acme Corp drives 38% of total revenue this quarter.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Trust footer */}
        <div className="relative px-12 pb-9 mt-7">
          <div className="text-[10.5px] uppercase tracking-[0.2em] text-white/60 font-semibold mb-2.5">
            Trusted by 2,000+ teams
          </div>
          <div className="flex items-center gap-5 flex-wrap text-white/70 text-[12.5px] font-semibold">
            {TRUST_LOGOS.map((l) => (
              <span key={l} className="tracking-tight">{l}</span>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Form pane ── */}
      <main className="flex-1 flex flex-col">
        <div className="flex items-center justify-between px-6 lg:px-10 pt-6">
          {onBack ? (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-[12.5px] text-gray-500 hover:text-gray-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Back to home
            </button>
          ) : <span />}
          <div className="flex items-center gap-2 lg:hidden">
            <Logo size={28} />
            <span className="text-[15px] font-bold text-gray-900 tracking-tight">
              No<span className="text-accent-strong">Query</span>
            </span>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center px-6 py-10">
          <div className="w-full max-w-sm">
            <h1 className="text-[1.7rem] font-bold text-gray-900 mb-1.5 tracking-tight">
              {mode === 'signin' ? 'Welcome back' : 'Create your account'}
            </h1>
            <p className="text-[13.5px] text-gray-500 mb-7">
              {mode === 'signin'
                ? 'Sign in to your NoQuery workspace.'
                : 'Free to start — no credit card required.'}
            </p>

            {/* Google */}
            <button
              onClick={onGoogle}
              disabled={googleBusy || busy}
              className="w-full flex items-center justify-center gap-2.5 py-2.5 text-[13px] font-semibold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {googleBusy ? (
                <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 48 48">
                  <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                  <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                  <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
                  <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
                </svg>
              )}
              Continue with Google
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-5">
              <span className="flex-1 h-px bg-gray-200" />
              <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">or</span>
              <span className="flex-1 h-px bg-gray-200" />
            </div>

            <form onSubmit={onSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11.5px] font-medium text-gray-600 mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full px-3 py-2.5 text-[13.5px] text-gray-800 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-ring focus:border-accent placeholder:text-gray-300 transition-all"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11.5px] font-medium text-gray-600">Password</label>
                  {mode === 'signup' && (
                    <span className="text-[10.5px] text-gray-400">At least 6 characters</span>
                  )}
                </div>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 text-[13.5px] text-gray-800 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-ring focus:border-accent placeholder:text-gray-300 transition-all"
                />
              </div>

              {mode === 'signin' && (
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-[12px] text-gray-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-accent focus:ring-accent-ring"
                    />
                    Remember me
                  </label>
                  <button type="button" className="text-[12px] font-medium text-accent-strong hover:underline">
                    Forgot password?
                  </button>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <svg className="w-3.5 h-3.5 mt-px flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}
              {info && (
                <div className="flex items-start gap-2 text-[12px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <svg className="w-3.5 h-3.5 mt-px flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{info}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={busy || googleBusy}
                className="w-full bg-accent hover:opacity-95 disabled:opacity-60 text-white text-[13.5px] font-semibold py-2.5 rounded-lg transition-all shadow-sm disabled:cursor-not-allowed"
              >
                {busy ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Please wait…
                  </span>
                ) : mode === 'signin' ? (
                  'Sign in to NoQuery'
                ) : (
                  'Create account'
                )}
              </button>
            </form>

            <p className="text-center text-[12.5px] text-gray-500 mt-5">
              {mode === 'signin' ? (
                <>
                  Don&apos;t have an account?{' '}
                  <button
                    onClick={() => { setMode('signup'); setError(null); setInfo(null); }}
                    className="font-semibold text-accent-strong hover:underline"
                  >
                    Create one
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button
                    onClick={() => { setMode('signin'); setError(null); setInfo(null); }}
                    className="font-semibold text-accent-strong hover:underline"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>

            {/* Security trust note */}
            <div className="mt-6 flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg bg-gray-50 border border-gray-100">
              <svg className="w-4 h-4 text-accent-strong mt-px flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
              </svg>
              <div>
                <div className="text-[12px] font-semibold text-gray-700">Your data is always secure</div>
                <div className="text-[11px] text-gray-500 leading-relaxed">
                  We use industry-standard encryption and never share your data.
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

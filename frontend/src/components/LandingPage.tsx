import Logo from './Logo';

interface LandingPageProps {
  onSignIn: () => void;
  onSignUp: () => void;
}

const Wordmark = ({ small = false }: { small?: boolean }) => (
  <span className={`${small ? 'text-[13px]' : 'text-[17px]'} font-bold text-gray-900 tracking-tight`}>
    No<span className="text-accent-strong">Query</span>
  </span>
);

export default function LandingPage({ onSignIn, onSignUp }: LandingPageProps) {
  const navLinks = ['Features', 'Use cases', 'Pricing', 'Docs'];

  return (
    <div className="min-h-screen flex flex-col bg-white relative overflow-x-hidden">
      {/* Decorative violet glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 w-[640px] h-[640px] rounded-full opacity-40 blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, rgba(139,92,246,0.45), rgba(139,92,246,0.10) 60%, transparent 80%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[420px] -left-40 w-[520px] h-[520px] rounded-full opacity-30 blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, rgba(196,181,253,0.55), transparent 75%)',
        }}
      />

      {/* ── Top nav ── */}
      <header className="relative z-10 px-6 lg:px-12 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo size={32} />
          <Wordmark />
        </div>
        <nav className="hidden md:flex items-center gap-1 bg-white/70 backdrop-blur border border-gray-200/80 rounded-full px-2 py-1 shadow-sm">
          {navLinks.map((l) => (
            <a
              key={l}
              href="#"
              className="px-3.5 py-1.5 text-[12.5px] font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-full transition-colors"
            >
              {l}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <button
            onClick={onSignIn}
            className="px-3.5 py-1.5 text-[13px] font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Sign in
          </button>
          <button
            onClick={onSignUp}
            className="px-4 py-2 text-[13px] font-semibold text-white rounded-full shadow-sm hover:shadow-md transition-all flex items-center gap-1.5"
            style={{ background: 'var(--brand-grad)' }}
          >
            Get started free
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </button>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex flex-col">
        {/* ── Hero ── */}
        <section className="px-6 lg:px-12 pt-12 lg:pt-16 pb-20 max-w-6xl mx-auto w-full">
          <div className="grid lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-14 items-center">
            <div>
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10.5px] font-bold uppercase tracking-[0.14em] mb-6 border"
                style={{
                  background: 'var(--accent-soft)',
                  color: 'var(--accent-text)',
                  borderColor: 'rgba(124,58,237,0.18)',
                }}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                AI · Ask Your Data
              </span>
              <h1 className="text-[2.5rem] lg:text-[3.6rem] font-bold text-ink leading-[1.02] tracking-tight mb-5">
                Turn spreadsheets<br />
                into{' '}
                <span
                  className="italic"
                  style={{
                    background: 'linear-gradient(135deg, #9B6BFF, #6D28D9)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  answers.
                </span>
                <br />
                <span className="text-gray-400 font-bold">No SQL required.</span>
              </h1>
              <p className="text-[15.5px] text-gray-500 leading-relaxed max-w-md mb-8">
                Upload CSVs and Excel files, ask questions in plain English,
                and turn answers into dashboards — no setup, no analyst.
              </p>
              <div className="flex flex-wrap items-center gap-3 mb-8">
                <button
                  onClick={onSignUp}
                  className="px-5 py-3 text-[13.5px] font-semibold text-white rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-2"
                  style={{ background: 'var(--brand-grad)' }}
                >
                  Get started for free
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </button>
                <button
                  className="px-5 py-3 text-[13.5px] font-semibold text-gray-800 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl shadow-sm transition-all flex items-center gap-2"
                >
                  <svg className="w-3.5 h-3.5 text-accent" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                  </svg>
                  Watch demo
                </button>
              </div>

            </div>

            {/* Hero illustration: dashboard preview */}
            <div className="relative">
              <div
                aria-hidden
                className="absolute -inset-6 rounded-[2rem] opacity-60 blur-2xl"
                style={{ background: 'linear-gradient(135deg, rgba(155,107,255,0.35), rgba(76,29,149,0.18))' }}
              />

              {/* Floating mini-card top */}
              <div className="absolute -top-6 -left-4 z-10 bg-white rounded-xl shadow-lg border border-gray-200/80 px-3 py-2 flex items-center gap-2.5 fade-in">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-soft)' }}>
                  <svg className="w-3.5 h-3.5 text-accent-strong" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <div className="text-[10.5px] text-gray-400 leading-none">Saved to dashboard</div>
                  <div className="text-[11.5px] font-semibold text-gray-800 leading-tight mt-0.5">Top products · April</div>
                </div>
              </div>

              <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200/80 overflow-hidden">
                {/* App-chrome header */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-300" />
                    <span className="w-2 h-2 rounded-full bg-yellow-300" />
                    <span className="w-2 h-2 rounded-full bg-green-300" />
                  </div>
                  <div className="ml-2 flex items-center gap-1.5 text-[10.5px] text-gray-400">
                    <Logo size={12} />
                    <span className="font-semibold text-gray-600">NoQuery</span>
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                    <span>Sales overview</span>
                  </div>
                </div>

                {/* KPI strip */}
                <div className="grid grid-cols-3 gap-2.5 px-4 pt-4">
                  {[
                    { label: 'Revenue', value: '$48.2K', delta: '+12%', up: true },
                    { label: 'Orders', value: '1,284', delta: '+5%', up: true },
                    { label: 'Avg. order', value: '$37.5', delta: '-2%', up: false },
                  ].map((k) => (
                    <div key={k.label} className="rounded-xl border border-gray-200/80 p-2.5 bg-white">
                      <div className="text-[9.5px] uppercase tracking-wider font-semibold text-gray-400">{k.label}</div>
                      <div className="text-[15px] font-bold text-ink mt-0.5 tabular-nums">{k.value}</div>
                      <div className={`text-[9.5px] font-semibold mt-0.5 ${k.up ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {k.delta}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Chat bubble */}
                <div className="px-4 pt-3.5">
                  <div className="flex justify-end">
                    <div
                      className="max-w-xs px-3.5 py-2 rounded-2xl rounded-br-md text-[12px] text-white shadow-sm"
                      style={{ background: 'var(--brand-grad)' }}
                    >
                      What are my top-selling products this month?
                    </div>
                  </div>
                </div>

                {/* Chart card */}
                <div className="px-4 pt-3 pb-4">
                  <div className="rounded-xl border border-gray-200 bg-white p-3.5">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-[11px] font-semibold text-ink">Top products · April</div>
                        <div className="text-[10px] text-gray-400">5 categories · sum of sales</div>
                      </div>
                      <span
                        className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                        style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                      >
                        Bar chart
                      </span>
                    </div>
                    <div className="flex items-end gap-2 h-24 px-1">
                      {[55, 78, 92, 64, 40].map((h, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className="w-full rounded-t-md bar-rise"
                            style={{
                              height: `${h}%`,
                              background:
                                i === 2
                                  ? 'linear-gradient(180deg, #9B6BFF, #6D28D9)'
                                  : 'var(--accent-soft-active)',
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between mt-2 text-[9px] text-gray-400">
                      {['Tops', 'Shoes', 'Bags', 'Hats', 'Belts'].map((l) => <span key={l}>{l}</span>)}
                    </div>
                  </div>

                  {/* Key insight */}
                  <div
                    className="mt-3 rounded-xl px-3 py-2.5 flex items-start gap-2 border"
                    style={{ background: 'var(--accent-soft)', borderColor: 'rgba(124,58,237,0.18)' }}
                  >
                    <svg className="w-4 h-4 mt-px flex-shrink-0 text-accent-strong" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                    </svg>
                    <p className="text-[11.5px] text-gray-700 leading-relaxed">
                      <span className="font-bold text-accent-strong">Bags</span> outsold every other category — up <span className="font-semibold">28%</span> from March.
                    </p>
                  </div>
                </div>
              </div>

              {/* Floating mini-card bottom */}
              <div className="absolute -bottom-5 -right-3 z-10 bg-white rounded-xl shadow-lg border border-gray-200/80 px-3 py-2 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-50">
                  <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                  </svg>
                </div>
                <div>
                  <div className="text-[10.5px] text-gray-400 leading-none">Up this month</div>
                  <div className="text-[11.5px] font-semibold text-gray-800 leading-tight mt-0.5">+28% Bags</div>
                </div>
              </div>
            </div>
          </div>

        </section>

        {/* ── Feature row ── */}
        <section className="px-6 lg:px-12 pb-20 max-w-6xl mx-auto w-full">
          <div className="text-center mb-12">
            <span className="inline-block text-[10.5px] uppercase tracking-[0.2em] font-bold text-accent-strong mb-3">
              How it works
            </span>
            <h2 className="text-3xl lg:text-[2.5rem] font-bold text-ink tracking-tight">
              Everything you need to understand your data
            </h2>
            <p className="text-[14.5px] text-gray-500 mt-3 max-w-xl mx-auto">
              Four steps. From raw spreadsheet to a dashboard you can share — in minutes.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                step: '01',
                title: 'Upload any data',
                desc: 'CSV, Excel, JSON. We auto-detect column types and warn you about messy values.',
                icon: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3',
              },
              {
                step: '02',
                title: 'Ask in English',
                desc: 'No SQL needed. Ask anything and get back charts, tables, or summary insights.',
                icon: 'M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z',
              },
              {
                step: '03',
                title: 'Charts & insights',
                desc: 'Every answer comes with a chart and a one-line takeaway you can save and share.',
                icon: 'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941',
              },
              {
                step: '04',
                title: 'Build dashboards',
                desc: 'Drop charts onto a canvas, drag to reorder, and share a read-only link with your team.',
                icon: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
              },
            ].map((f) => (
              <div
                key={f.title}
                className="group relative rounded-2xl bg-white border border-gray-200/80 p-5 hover:shadow-xl hover:-translate-y-1 hover:border-violet-200 transition-all overflow-hidden"
              >
                <div
                  aria-hidden
                  className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-0 group-hover:opacity-100 blur-2xl transition-opacity"
                  style={{ background: 'radial-gradient(closest-side, rgba(139,92,246,0.35), transparent)' }}
                />
                <div className="relative">
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-white shadow-sm"
                      style={{ background: 'var(--brand-grad)' }}
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={f.icon} />
                      </svg>
                    </div>
                    <span className="text-[11px] font-bold text-gray-300 tracking-wider">{f.step}</span>
                  </div>
                  <h3 className="text-[15px] font-bold text-ink mb-1.5 tracking-tight">{f.title}</h3>
                  <p className="text-[12.5px] text-gray-500 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Three-up callouts (mirroring mockup) ── */}
        <section className="px-6 lg:px-12 pb-24 max-w-6xl mx-auto w-full">
          <div className="grid md:grid-cols-3 gap-4">
            {/* Card 1 — dark */}
            <div
              className="rounded-2xl p-6 text-white relative overflow-hidden min-h-[210px] flex flex-col justify-between"
              style={{ background: 'var(--brand-grad)' }}
            >
              <div
                aria-hidden
                className="absolute inset-0 opacity-30 pointer-events-none"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 80% 0%, rgba(255,255,255,0.4), transparent 45%)',
                }}
              />
              <div className="relative">
                <div className="text-[11px] uppercase tracking-[0.2em] font-bold text-white/70 mb-2">Chat with your data</div>
                <h3 className="text-[20px] font-bold leading-tight">Ask anything.<br />Get answers instantly.</h3>
              </div>
              <div className="relative flex items-end gap-1.5 h-14 mt-4">
                {[40, 65, 50, 80, 70, 90, 55].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-md bg-white/40"
                    style={{ height: `${h}%`, backdropFilter: 'blur(2px)' }}
                  />
                ))}
              </div>
            </div>

            {/* Card 2 — light, security */}
            <div className="rounded-2xl bg-white border border-gray-200/80 p-6 relative overflow-hidden min-h-[210px] flex flex-col justify-between">
              <div className="relative">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: 'var(--accent-soft)' }}
                >
                  <svg className="w-5 h-5 text-accent-strong" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                  </svg>
                </div>
                <h3 className="text-[18px] font-bold text-ink mb-1 tracking-tight">Your data is safe.</h3>
                <p className="text-[12.5px] text-gray-500 leading-relaxed">
                  Encrypted at rest and in transit. Your files never train anyone's model — they stay yours.
                </p>
              </div>
              <div className="flex items-center gap-3 text-[10.5px] uppercase tracking-wider font-semibold text-gray-400">
                <span className="px-2 py-1 rounded-md bg-gray-100">SOC 2</span>
                <span className="px-2 py-1 rounded-md bg-gray-100">256-bit AES</span>
                <span className="px-2 py-1 rounded-md bg-gray-100">GDPR</span>
              </div>
            </div>

            {/* Card 3 — light, teams */}
            <div className="rounded-2xl bg-white border border-gray-200/80 p-6 relative overflow-hidden min-h-[210px] flex flex-col justify-between">
              <div className="relative">
                <div className="text-[11px] uppercase tracking-[0.2em] font-bold text-gray-400 mb-2">Built for teams</div>
                <h3 className="text-[18px] font-bold text-ink leading-tight tracking-tight">
                  Move fast, together.
                </h3>
                <p className="text-[12.5px] text-gray-500 leading-relaxed mt-2">
                  Share read-only dashboard links, comment on insights, and keep everyone on the same numbers.
                </p>
              </div>
              <div className="flex items-center justify-between mt-4">
                <div className="flex -space-x-2">
                  {['#a78bfa', '#7c3aed', '#5b21b6', '#c4b5fd', '#ddd6fe'].map((c, i) => (
                    <span
                      key={i}
                      className="w-8 h-8 rounded-full border-2 border-white shadow-sm"
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <span className="text-[11px] font-semibold text-accent-strong">+12 more</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Bottom CTA ── */}
        <section className="px-6 lg:px-12 pb-20">
          <div
            className="max-w-5xl mx-auto rounded-3xl text-white px-8 py-14 lg:py-16 relative overflow-hidden"
            style={{ background: 'var(--brand-grad)' }}
          >
            <div
              className="absolute inset-0 opacity-30 pointer-events-none"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 15% 0%, rgba(255,255,255,0.4), transparent 40%), radial-gradient(circle at 85% 100%, rgba(255,255,255,0.3), transparent 45%)',
              }}
            />
            <div
              aria-hidden
              className="absolute -top-12 -right-12 opacity-30"
            >
              <Logo size={200} variant="mono-light" />
            </div>
            <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div>
                <h2 className="text-2xl lg:text-[2.25rem] font-bold mb-2 tracking-tight leading-tight">
                  Start analyzing your data<br />in minutes.
                </h2>
                <p className="text-white/80 text-[14px] max-w-md">
                  Join thousands of teams using NoQuery to turn spreadsheets into clarity.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <button
                  onClick={onSignUp}
                  className="px-6 py-3 text-[13.5px] font-bold text-accent-strong bg-white hover:bg-white/95 rounded-xl shadow-md hover:shadow-lg transition-all whitespace-nowrap flex items-center gap-2"
                >
                  Create free workspace
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </button>
                <span className="text-[12px] text-white/70">No credit card · Free forever plan</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-gray-200 bg-gray-50/40">
        <div className="px-6 lg:px-12 py-10 max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-8">
            <div className="col-span-2">
              <div className="flex items-center gap-2.5 mb-3">
                <Logo size={32} />
                <Wordmark />
              </div>
              <p className="text-[12.5px] text-gray-500 leading-relaxed max-w-xs">
                The no-code data platform for small businesses. Upload, ask, and answer.
              </p>
            </div>
            {[
              { title: 'Product', items: ['Features', 'Use cases', 'Pricing', 'Changelog'] },
              { title: 'Resources', items: ['Docs', 'Guides', 'Templates', 'Blog'] },
              { title: 'Company', items: ['About', 'Careers', 'Contact', 'Press'] },
            ].map((col) => (
              <div key={col.title}>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">{col.title}</div>
                <ul className="space-y-1.5">
                  {col.items.map((it) => (
                    <li key={it}>
                      <a href="#" className="text-[12.5px] text-gray-600 hover:text-accent-strong transition-colors">{it}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-6 border-t border-gray-200 text-[11.5px] text-gray-400">
            <span>© {new Date().getFullYear()} NoQuery · Turn spreadsheets into answers.</span>
            <div className="flex items-center gap-3">
              <a href="#" className="hover:text-gray-700 transition-colors">Terms</a>
              <a href="#" className="hover:text-gray-700 transition-colors">Privacy</a>
              <a href="#" className="hover:text-gray-700 transition-colors">Security</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

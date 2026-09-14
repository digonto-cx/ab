import React from 'react';
import { ArrowRight, ShieldCheck, Terminal, Globe, Cpu, Check, ExternalLink } from 'lucide-react';

interface VercelLandingPageProps {
  onNavigate: (path: string) => void;
}

export const VercelLandingPage: React.FC<VercelLandingPageProps> = ({ onNavigate }) => {
  return (
    <div className="relative overflow-hidden">
      {/* Background Radial Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-b from-neutral-800/20 via-transparent to-transparent blur-3xl pointer-events-none" />

      {/* Hero Section */}
      <section className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-20 sm:pt-28 pb-16 text-center space-y-8">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#333333] bg-[#0c0c0c] text-xs font-mono text-neutral-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Vercel Edge Network • Global Deployment</span>
        </div>

        {/* Heading */}
        <div className="space-y-4 max-w-3xl mx-auto">
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
            Develop. Preview. Ship.
          </h1>
          <p className="text-base sm:text-lg text-neutral-400 font-sans leading-relaxed max-w-2xl mx-auto">
            Vercel enables developers to build and scale high-performance web applications with zero configuration and automated security guardrails.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            id="landing-verify-btn"
            onClick={() => onNavigate('/alis/welcome-mehedi')}
            className="w-full sm:w-auto px-6 py-3 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold text-sm transition flex items-center justify-center gap-2 shadow-xl active:scale-98"
          >
            <span>Start Verification</span>
            <ArrowRight className="w-4 h-4 text-black" />
          </button>

          <a
            href="https://vercel.com/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-6 py-3 rounded-lg border border-[#333333] bg-[#0c0c0c] hover:border-white text-white font-medium text-sm transition flex items-center justify-center gap-2 active:scale-98"
          >
            <span>Documentation</span>
            <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
          </a>
        </div>

        {/* Developer Credit banner */}
        <div className="pt-4 text-xs font-mono text-neutral-500">
          Devloped by : <span className="text-neutral-300 font-medium">Chiper X 404</span>
        </div>
      </section>

      {/* Vercel Feature Matrix */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 border-t border-[#222222]">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="p-6 rounded-xl bg-[#0a0a0a] border border-[#222222] hover:border-[#333333] transition space-y-3">
            <div className="w-9 h-9 rounded-lg bg-black border border-[#333333] flex items-center justify-center text-white">
              <Globe className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white">Edge Middleware</h3>
            <p className="text-xs text-neutral-400 leading-relaxed font-mono">
              Deliver sub-millisecond execution times globally with distributed edge routing and instant verification checks.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-[#0a0a0a] border border-[#222222] hover:border-[#333333] transition space-y-3">
            <div className="w-9 h-9 rounded-lg bg-black border border-[#333333] flex items-center justify-center text-white">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white">Session Protection</h3>
            <p className="text-xs text-neutral-400 leading-relaxed font-mono">
              Continuous background security monitoring and automated audit heartbeats safeguard sensitive workflows from misuse.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-[#0a0a0a] border border-[#222222] hover:border-[#333333] transition space-y-3">
            <div className="w-9 h-9 rounded-lg bg-black border border-[#333333] flex items-center justify-center text-white">
              <Terminal className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white">Dynamic Slug Routing</h3>
            <p className="text-xs text-neutral-400 leading-relaxed font-mono">
              Deterministic, one-time verification tokens generated dynamically with strict time-to-live restrictions.
            </p>
          </div>
        </div>
      </section>

      {/* Terminal / Code snippet box */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-20">
        <div className="rounded-xl bg-[#0a0a0a] border border-[#222222] overflow-hidden font-mono text-xs">
          <div className="px-4 py-3 bg-black border-b border-[#222222] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#333333]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#333333]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#333333]" />
              <span className="ml-2 text-neutral-400 text-[11px]">vercel-edge-runtime</span>
            </div>
            <span className="text-[10px] text-emerald-400">Ready</span>
          </div>
          <div className="p-5 space-y-2 text-neutral-300">
            <p><span className="text-neutral-500">$</span> vercel deploy --prod</p>
            <p className="text-neutral-400">🔍 Inspecting deployment credentials...</p>
            <p className="text-emerald-400">✔ Production: https://mehedihasan.vercel.app [34ms]</p>
            <p className="text-neutral-500">🔒 Edge Security Guard: ACTIVE</p>
          </div>
        </div>
      </section>
    </div>
  );
};

import React, { useState } from 'react';
import {
  ShieldCheck,
  Globe,
  Layers,
  HardDrive,
  Code2,
  Lock,
  CheckCircle2,
  ExternalLink,
  Github,
  CloudLightning,
  Sparkles,
  Server,
  Terminal,
  Copy,
  Check,
} from 'lucide-react';

interface DocsViewProps {
  domain: string;
}

export const DocsView: React.FC<DocsViewProps> = ({ domain }) => {
  const [activeSetupTab, setActiveSetupTab] = useState<'vercel' | 'cloudflare' | 'nginx' | 'iframe'>('vercel');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const cloudRunHost = window.location.origin;

  const copySnippet = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const vercelRewritesConfig = `{
  "rewrites": [
    { "source": "/share/:id", "destination": "${cloudRunHost}/share/:id" },
    { "source": "/embed/:id", "destination": "${cloudRunHost}/embed/:id" },
    { "source": "/api/:path*", "destination": "${cloudRunHost}/api/:path*" }
  ]
}`;

  const nextJsRewritesConfig = `// next.config.js on ${domain}
module.exports = {
  async rewrites() {
    return [
      {
        source: '/share/:id',
        destination: '${cloudRunHost}/share/:id',
      },
      {
        source: '/embed/:id',
        destination: '${cloudRunHost}/embed/:id',
      },
      {
        source: '/api/:path*',
        destination: '${cloudRunHost}/api/:path*',
      },
    ];
  },
};`;

  const cloudflareWorkerCode = `// Cloudflare Worker for ${domain}
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const backend = "${cloudRunHost}";

    // Proxy download gate, embeds, and file chunks
    if (url.pathname.startsWith('/share/') || url.pathname.startsWith('/embed/') || url.pathname.startsWith('/api/')) {
      const targetUrl = new URL(url.pathname + url.search, backend);
      return fetch(new Request(targetUrl, request));
    }

    return fetch(request);
  }
};`;

  const nginxProxyConfig = `# nginx.conf for ${domain}
server {
    server_name ${domain};

    location ~ ^/(share|embed|api)/ {
        proxy_pass ${cloudRunHost};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}`;

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-8">
      {/* Title */}
      <div>
        <div className="text-xs font-semibold text-emerald-700 tracking-wider uppercase mb-1 flex items-center gap-2">
          <span>Domain Configuration</span>
          <span className="text-neutral-300">·</span>
          <span>{domain}</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900">
          How to Link {domain} to Generate Unique Share IDs
        </h1>
        <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
          Follow this guide to connect your domain <strong className="text-neutral-900">{domain}</strong> so all generated <code className="text-xs font-mono bg-neutral-100 px-1 py-0.5 rounded">https://{domain}/share/:id</code> links and embed codes resolve seamlessly.
        </p>
      </div>

      {/* Overview Card */}
      <div className="bg-neutral-900 text-white rounded-xl p-6 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
          <Globe className="w-4 h-4" />
          <span>Two Ways to Route Your Domain</span>
        </div>
        <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
          VaultDrop runs on a high-availability cloud engine (<code className="text-emerald-300 font-mono text-xs">{cloudRunHost}</code>). To make links look like <code className="text-white font-mono text-xs font-bold">https://{domain}/share/xyz</code>, you simply route incoming requests for <code className="text-neutral-300 font-mono">/share/*</code>, <code className="text-neutral-300 font-mono">/embed/*</code>, and <code className="text-neutral-300 font-mono">/api/*</code> to this engine, OR embed the widget directly onto your site.
        </p>
      </div>

      {/* Interactive Domain Linking Wizard */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200 pb-4">
          <div>
            <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-600" />
              <span>Choose Your Website Stack for {domain}</span>
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Select where your personal website is hosted to view the exact 3-line configuration:
            </p>
          </div>

          <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveSetupTab('vercel')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                activeSetupTab === 'vercel'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Vercel / Next.js
            </button>
            <button
              onClick={() => setActiveSetupTab('cloudflare')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                activeSetupTab === 'cloudflare'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Cloudflare
            </button>
            <button
              onClick={() => setActiveSetupTab('nginx')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                activeSetupTab === 'nginx'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Nginx / VPS
            </button>
            <button
              onClick={() => setActiveSetupTab('iframe')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                activeSetupTab === 'iframe'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Direct Iframe
            </button>
          </div>
        </div>

        {/* Tab 1: Vercel / Next.js */}
        {activeSetupTab === 'vercel' && (
          <div className="space-y-4">
            <div className="text-xs text-neutral-600 leading-relaxed">
              If <strong className="text-neutral-900">{domain}</strong> is hosted on Vercel or Next.js, add a <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-neutral-800">rewrites</code> rule. All requests to <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-neutral-800">{domain}/share/:id</code> will automatically stream from VaultDrop while keeping your domain in the address bar!
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-neutral-700 uppercase tracking-wider">
                <span>Option A: next.config.js</span>
                <button
                  onClick={() => copySnippet('nextjs', nextJsRewritesConfig)}
                  className="text-emerald-700 hover:text-emerald-800 flex items-center gap-1 font-semibold normal-case cursor-pointer"
                >
                  {copiedKey === 'nextjs' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'nextjs' ? 'Copied' : 'Copy Config'}</span>
                </button>
              </div>
              <pre className="p-3 bg-neutral-950 text-neutral-200 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap select-all">
                {nextJsRewritesConfig}
              </pre>
            </div>

            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs font-bold text-neutral-700 uppercase tracking-wider">
                <span>Option B: vercel.json (Static or other frameworks)</span>
                <button
                  onClick={() => copySnippet('vercel', vercelRewritesConfig)}
                  className="text-emerald-700 hover:text-emerald-800 flex items-center gap-1 font-semibold normal-case cursor-pointer"
                >
                  {copiedKey === 'vercel' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'vercel' ? 'Copied' : 'Copy JSON'}</span>
                </button>
              </div>
              <pre className="p-3 bg-neutral-950 text-neutral-200 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap select-all">
                {vercelRewritesConfig}
              </pre>
            </div>
          </div>
        )}

        {/* Tab 2: Cloudflare */}
        {activeSetupTab === 'cloudflare' && (
          <div className="space-y-4">
            <div className="text-xs text-neutral-600 leading-relaxed">
              If your domain <strong className="text-neutral-900">{domain}</strong> is managed in Cloudflare:
              <ol className="list-decimal pl-5 mt-2 space-y-1">
                <li>Go to <strong>Workers & Pages &gt; Create Worker</strong>.</li>
                <li>Paste this worker script and add the route <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-neutral-800">{domain}/*</code>.</li>
              </ol>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-neutral-700 uppercase tracking-wider">
                <span>Cloudflare Worker Script</span>
                <button
                  onClick={() => copySnippet('cf', cloudflareWorkerCode)}
                  className="text-emerald-700 hover:text-emerald-800 flex items-center gap-1 font-semibold normal-case cursor-pointer"
                >
                  {copiedKey === 'cf' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'cf' ? 'Copied' : 'Copy Worker'}</span>
                </button>
              </div>
              <pre className="p-3 bg-neutral-950 text-neutral-200 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap select-all">
                {cloudflareWorkerCode}
              </pre>
            </div>
          </div>
        )}

        {/* Tab 3: Nginx / VPS */}
        {activeSetupTab === 'nginx' && (
          <div className="space-y-4">
            <div className="text-xs text-neutral-600 leading-relaxed">
              If <strong className="text-neutral-900">{domain}</strong> runs on an Nginx server, add this reverse proxy block inside your server configuration:
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-neutral-700 uppercase tracking-wider">
                <span>nginx.conf Block</span>
                <button
                  onClick={() => copySnippet('nginx', nginxProxyConfig)}
                  className="text-emerald-700 hover:text-emerald-800 flex items-center gap-1 font-semibold normal-case cursor-pointer"
                >
                  {copiedKey === 'nginx' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'nginx' ? 'Copied' : 'Copy Nginx'}</span>
                </button>
              </div>
              <pre className="p-3 bg-neutral-950 text-neutral-200 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap select-all">
                {nginxProxyConfig}
              </pre>
            </div>
          </div>
        )}

        {/* Tab 4: Direct Iframe */}
        {activeSetupTab === 'iframe' && (
          <div className="space-y-4">
            <div className="text-xs text-neutral-600 leading-relaxed">
              If you don't want to change server or DNS settings, you can simply embed the download card directly into any page on <strong className="text-neutral-900">{domain}</strong> (e.g. <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-neutral-800">https://{domain}/downloads</code>):
            </div>

            <pre className="p-3 bg-neutral-900 text-neutral-200 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap select-all">
{`<!-- Paste inside your page at https://${domain}/downloads -->
<iframe
  src="${cloudRunHost}/embed/vopple-demo"
  width="100%"
  height="460"
  frameborder="0"
  allow="clipboard-write"
  style="border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); max-width: 640px; display: block; margin: 0 auto;"
  title="VaultDrop Protected Download"
></iframe>`}
            </pre>
          </div>
        )}
      </div>

      {/* GitHub Free Hosting Recap */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <CloudLightning className="w-5 h-5 text-emerald-600" />
          <h2 className="text-base font-bold text-neutral-900">
            How GitHub TARGET.zip Keeps It 100% Free
          </h2>
        </div>
        <p className="text-xs text-neutral-600 leading-relaxed">
          When using the <strong>GitHub TARGET.zip</strong> importer, files are served directly from GitHub CDN edges. You never exceed server bandwidth or storage quotas, and recipients access the download through your branded <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-neutral-800">{domain}</code> password gate.
        </p>
      </div>
    </div>
  );
};

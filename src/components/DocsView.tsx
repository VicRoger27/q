import React from 'react';
import {
  ShieldCheck,
  Globe,
  Layers,
  HardDrive,
  Code2,
  Lock,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';

interface DocsViewProps {
  domain: string;
}

export const DocsView: React.FC<DocsViewProps> = ({ domain }) => {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-8">
      {/* Title */}
      <div>
        <div className="text-xs font-semibold text-emerald-700 tracking-wider uppercase mb-1">
          Architecture & Integration
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900">
          How 500MB Uploads, Passwords & q.vopple.uk Work
        </h1>
        <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
          Technical specifications on the chunking pipeline, security mechanisms, and integrating the download gate onto your personal domain.
        </p>
      </div>

      {/* Grid of Key Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-5 bg-white border border-neutral-200 rounded-xl shadow-xs">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center mb-3">
            <HardDrive className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-neutral-900 mb-1">500MB+ Chunking Engine</h3>
          <p className="text-xs text-neutral-600 leading-relaxed">
            Standard web servers and reverse proxies reject uploads larger than 32MB. VaultDrop slices your 500MB files into 5MB chunks on the client, streaming them sequentially with auto-retry and real-time speed calculation.
          </p>
        </div>

        <div className="p-5 bg-white border border-neutral-200 rounded-xl shadow-xs">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center mb-3">
            <Lock className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-neutral-900 mb-1">scrypt & Anti-Brute Force</h3>
          <p className="text-xs text-neutral-600 leading-relaxed">
            Passwords are encrypted using Node.js scrypt with unique cryptographic salts. Passwords are never stored in plaintext. Failed attempts trigger an exponential security cooldown after 5 failed guesses.
          </p>
        </div>

        <div className="p-5 bg-white border border-neutral-200 rounded-xl shadow-xs">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center mb-3">
            <Globe className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-neutral-900 mb-1">Domain & Iframe Ready</h3>
          <p className="text-xs text-neutral-600 leading-relaxed">
            Pre-configured to generate links for your domain <code className="text-neutral-800 bg-neutral-100 px-1 rounded font-mono">{domain}</code>. Generates responsive iframe embed snippets that fit naturally on any personal web page.
          </p>
        </div>
      </div>

      {/* Section 1: Embedding in your website */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-4">
        <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
          <Code2 className="w-4 h-4 text-emerald-600" />
          <span>Integrating the Iframe on {domain}</span>
        </h2>
        <p className="text-xs text-neutral-600 leading-relaxed">
          You can paste the generated embed iframe snippet into any HTML document, markdown post, or CMS:
        </p>
        <pre className="p-3 bg-neutral-900 text-neutral-200 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap select-all">
{`<!-- Paste inside your page content -->
<div class="download-container" style="max-width: 600px; margin: 2rem auto;">
  <iframe
    src="https://${domain}/embed/YOUR_SHARE_ID"
    width="100%"
    height="460"
    frameborder="0"
    allow="clipboard-write"
    style="border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);"
    title="Protected File Download"
  ></iframe>
</div>`}
        </pre>
      </div>

      {/* Section 2: Personal Domain Setup */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-4">
        <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
          <Globe className="w-4 h-4 text-emerald-600" />
          <span>Configuring Your Personal Domain: {domain}</span>
        </h2>
        <div className="text-xs text-neutral-600 space-y-3 leading-relaxed">
          <p>
            When sharing links or embedding, VaultDrop automatically generates URLs targeting your domain <span className="font-semibold text-neutral-900">https://{domain}</span>.
          </p>
          <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-lg space-y-2">
            <div className="font-semibold text-neutral-900">DNS & Proxy Options:</div>
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <span className="font-medium text-neutral-800">Iframe Embedding (Recommended):</span> Host your website on <code className="bg-neutral-200/60 px-1 rounded font-mono">{domain}</code> and simply embed the responsive iframe widget into any page (e.g. <code className="bg-neutral-200/60 px-1 rounded font-mono">{domain}/downloads</code>).
              </li>
              <li>
                <span className="font-medium text-neutral-800">Reverse Proxy:</span> If you use Cloudflare, NGINX, or Caddy on <code className="bg-neutral-200/60 px-1 rounded font-mono">{domain}</code>, you can proxy requests to this application.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

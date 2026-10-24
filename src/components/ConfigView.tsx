import React, { useState, useEffect } from 'react';
import {
  FileCode2,
  Copy,
  Check,
  Download,
  Globe,
  Layers,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';

interface ConfigViewProps {
  domain: string;
}

export const ConfigView: React.FC<ConfigViewProps> = ({ domain }) => {
  const [format, setFormat] = useState<'json' | 'yaml'>('yaml');
  const [copied, setCopied] = useState(false);
  const [configData, setConfigData] = useState<any>(null);
  const [yamlData, setYamlData] = useState<string>('');
  const [backendHost, setBackendHost] = useState<string>(window.location.origin);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data) => {
        if (data.config) setConfigData(data.config);
        if (data.yaml) setYamlData(data.yaml);
        if (data.backendHost) setBackendHost(data.backendHost);
      })
      .catch((err) => console.error('Error loading config:', err));
  }, []);

  const jsonString = configData ? JSON.stringify(configData, null, 2) : '';

  const activeContent = format === 'yaml' ? yamlData : jsonString;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const filename = format === 'yaml' ? 'config.yaml' : 'config.json';
    const mimeType = format === 'yaml' ? 'text/yaml' : 'application/json';
    const blob = new Blob([activeContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-8">
      {/* Editorial Header */}
      <div>
        <div className="text-xs font-semibold text-emerald-700 tracking-wider uppercase mb-1 flex items-center gap-2">
          <span>Config Architecture</span>
          <span className="text-neutral-300">·</span>
          <span>{domain}</span>
          <span className="text-neutral-300">·</span>
          <span>Subdomain Ecosystem</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900">
          Cross-Subdomain Configuration ({domain})
        </h1>
        <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
          Because your other applications run on separate subdomains across <code className="text-neutral-900 bg-neutral-100 px-1 py-0.5 rounded font-mono font-semibold">*.vopple.uk</code> (e.g. <code className="text-neutral-900 bg-neutral-100 px-1 py-0.5 rounded font-mono">vpl.vopple.uk</code>), this simple config defines cross-subdomain iframe permissions, default dimensions, and GitHub repository integration.
        </p>
      </div>

      {/* Cross-Subdomain Security Banner */}
      <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
        <div className="text-xs text-emerald-950 leading-relaxed">
          <span className="font-bold">Cross-Subdomain Iframe Enabled: </span>
          The server headers are configured with <code className="bg-white/80 px-1 py-0.5 rounded font-mono font-bold text-emerald-900">frame-ancestors 'self' https://*.vopple.uk https://vopple.uk</code>. Any of your apps on other subdomains can embed this download gate without browser CSP or cross-origin blocking!
        </div>
      </div>

      {/* Main Config Editor Card */}
      <div className="bg-white border border-neutral-200 rounded-xl shadow-xs overflow-hidden">
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-neutral-200 bg-neutral-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileCode2 className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
              {format === 'yaml' ? 'config.yaml' : 'config.json'}
            </span>
            <span className="text-[11px] text-neutral-500 font-mono">
              (Located at app root)
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Format toggle */}
            <div className="flex items-center gap-1 bg-neutral-200/70 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setFormat('yaml')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  format === 'yaml'
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                YAML
              </button>
              <button
                type="button"
                onClick={() => setFormat('json')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  format === 'json'
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                JSON
              </button>
            </div>

            {/* Actions */}
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              onClick={handleDownload}
              className="px-3 py-1.5 bg-white hover:bg-neutral-50 text-neutral-800 border border-neutral-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-neutral-600" />
              <span>Download</span>
            </button>
          </div>
        </div>

        {/* Code view */}
        <div className="p-4 sm:p-6 bg-neutral-950 overflow-x-auto">
          <pre className="text-xs font-mono text-emerald-400 leading-relaxed whitespace-pre select-all">
            {activeContent}
          </pre>
        </div>
      </div>

      {/* Cross-Subdomain Quick Embed Guide */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-4">
        <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
          <Layers className="w-4 h-4 text-emerald-600" />
          <span>How to Embed in Your Other Subdomain Apps</span>
        </h2>
        <p className="text-xs text-neutral-600 leading-relaxed">
          Inside any of your other apps (such as <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-neutral-800">https://vpl.vopple.uk</code> or <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-neutral-800">https://vopple.uk</code>), drop in this iframe:
        </p>

        <pre className="p-3 bg-neutral-900 text-neutral-200 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap select-all">
{`<!-- Embed in your other subdomains (*.vopple.uk) -->
<iframe
  src="https://${domain}/embed/YOUR_SHARE_ID"
  width="100%"
  height="460"
  frameborder="0"
  allow="clipboard-write"
  style="border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); max-width: 640px; display: block; margin: 0 auto;"
  title="VaultDrop File Portal"
></iframe>`}
        </pre>
      </div>
    </div>
  );
};

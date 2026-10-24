import React, { useState, useEffect } from 'react';
import {
  Code2,
  Copy,
  Check,
  Layers,
  Smartphone,
  Monitor,
  Sparkles,
  ExternalLink,
  Sliders,
  CheckCircle2,
} from 'lucide-react';
import { ShareItem } from '../types';

interface EmbedSandboxProps {
  shares: ShareItem[];
  domain: string;
}

export const EmbedSandbox: React.FC<EmbedSandboxProps> = ({ shares, domain }) => {
  const [selectedShareId, setSelectedShareId] = useState<string>(
    shares[0]?.id || 'vopple-demo'
  );
  const [usePersonalDomain, setUsePersonalDomain] = useState(true);
  const [widthPreset, setWidthPreset] = useState<'100%' | '560px' | '420px'>('100%');
  const [height, setHeight] = useState<number>(460);
  const [borderRadius, setBorderRadius] = useState<number>(12);
  const [hasBorder, setHasBorder] = useState<boolean>(true);
  const [hasShadow, setHasShadow] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  // Update selected share if shares change and currently selected doesn't exist
  useEffect(() => {
    if (shares.length > 0 && !shares.some((s) => s.id === selectedShareId)) {
      setSelectedShareId(shares[0].id);
    }
  }, [shares, selectedShareId]);

  const activeBaseUrl = usePersonalDomain
    ? `https://${domain}`
    : window.location.origin;

  const embedSrc = `${activeBaseUrl}/embed/${selectedShareId}`;
  // For live preview iframe, always use origin or relative path so it loads seamlessly without domain mismatch
  const previewIframeSrc = `/?embed=true&share=${selectedShareId}`;

  const borderStyle = hasBorder ? 'border: 1px solid #e2e8f0;' : 'border: none;';
  const shadowStyle = hasShadow ? 'box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);' : '';
  const radiusStyle = `border-radius: ${borderRadius}px;`;

  const generatedIframeCode = `<iframe
  src="${embedSrc}"
  width="${widthPreset}"
  height="${height}"
  frameborder="0"
  allow="clipboard-write"
  style="${borderStyle} ${radiusStyle} ${shadowStyle} max-width: 100%; display: block; margin: 0 auto;"
  title="VaultDrop Secure Download"
></iframe>`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(generatedIframeCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentShare = shares.find((s) => s.id === selectedShareId);

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6">
      {/* Header */}
      <div className="mb-8">
        <div className="text-xs font-semibold text-emerald-700 tracking-wider uppercase mb-1">
          Iframe Integration Studio
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900">
          Embed Password Gate into Your Website
        </h1>
        <p className="mt-1 text-sm text-neutral-600 max-w-2xl leading-relaxed">
          Configure and preview your embedded download widget before pasting the snippet into <code className="text-neutral-800 bg-neutral-100 px-1 rounded text-xs font-mono">{domain}</code>.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Configuration Controls (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs space-y-5">
            <h2 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-600" />
              <span>Embed Settings</span>
            </h2>

            {/* Select Target File */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
                Select File to Embed
              </label>
              <select
                value={selectedShareId}
                onChange={(e) => setSelectedShareId(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
              >
                {shares.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title || s.filename} ({s.id})
                  </option>
                ))}
              </select>
            </div>

            {/* Domain toggle */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
                Snippet Domain
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setUsePersonalDomain(true)}
                  className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                    usePersonalDomain
                      ? 'bg-neutral-900 text-white border-neutral-900'
                      : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100'
                  }`}
                >
                  q.vopple.uk
                </button>
                <button
                  type="button"
                  onClick={() => setUsePersonalDomain(false)}
                  className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                    !usePersonalDomain
                      ? 'bg-neutral-900 text-white border-neutral-900'
                      : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100'
                  }`}
                >
                  Current App URL
                </button>
              </div>
            </div>

            {/* Width Presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
                Container Width
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setWidthPreset('100%')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer border text-center ${
                    widthPreset === '100%'
                      ? 'bg-neutral-900 text-white border-neutral-900'
                      : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100'
                  }`}
                >
                  Fluid 100%
                </button>
                <button
                  type="button"
                  onClick={() => setWidthPreset('560px')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer border text-center ${
                    widthPreset === '560px'
                      ? 'bg-neutral-900 text-white border-neutral-900'
                      : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100'
                  }`}
                >
                  Medium 560px
                </button>
                <button
                  type="button"
                  onClick={() => setWidthPreset('420px')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer border text-center ${
                    widthPreset === '420px'
                      ? 'bg-neutral-900 text-white border-neutral-900'
                      : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100'
                  }`}
                >
                  Compact 420px
                </button>
              </div>
            </div>

            {/* Height slider */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-bold text-neutral-700 uppercase tracking-wider">
                  Frame Height
                </label>
                <span className="font-mono tabular-nums text-neutral-600 font-semibold">{height}px</span>
              </div>
              <input
                type="range"
                min={380}
                max={560}
                step={20}
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                className="w-full accent-neutral-900 cursor-pointer"
              />
            </div>

            {/* Toggles */}
            <div className="pt-2 border-t border-neutral-100 space-y-3">
              <label className="flex items-center justify-between text-xs font-medium text-neutral-700 cursor-pointer">
                <span>Subtle Hairline Border</span>
                <input
                  type="checkbox"
                  checked={hasBorder}
                  onChange={(e) => setHasBorder(e.target.checked)}
                  className="rounded text-neutral-900 accent-neutral-900 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between text-xs font-medium text-neutral-700 cursor-pointer">
                <span>Soft Drop Shadow</span>
                <input
                  type="checkbox"
                  checked={hasShadow}
                  onChange={(e) => setHasShadow(e.target.checked)}
                  className="rounded text-neutral-900 accent-neutral-900 cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* Generated HTML Snippet Box */}
          <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
                <Code2 className="w-4 h-4 text-emerald-600" />
                <span>Ready-To-Paste Iframe HTML</span>
              </span>
              <button
                onClick={handleCopyCode}
                className="px-3 py-1 bg-neutral-900 hover:bg-neutral-800 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy HTML'}</span>
              </button>
            </div>

            <pre className="p-3 bg-neutral-950 text-neutral-200 rounded-lg text-[11px] font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap select-all max-h-48">
              {generatedIframeCode}
            </pre>

            <div className="text-[11px] text-neutral-500 leading-relaxed flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Full responsive iframe compatible with desktop and mobile screens.</span>
            </div>
          </div>
        </div>

        {/* Right Column: Live Iframe Preview Sandbox (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-neutral-700 uppercase tracking-wider flex items-center gap-2">
              <Monitor className="w-4 h-4 text-neutral-500" />
              <span>Simulated Website Embed Preview</span>
            </div>
            <a
              href={`/?share=${selectedShareId}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
            >
              <span>Open Standalone Tab</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Browser Mockup Container */}
          <div className="bg-neutral-100 border border-neutral-300 rounded-xl overflow-hidden shadow-xs">
            {/* Fake browser bar */}
            <div className="bg-neutral-200/90 px-4 py-2 border-b border-neutral-300 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-neutral-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-neutral-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-neutral-400" />
              </div>
              <div className="bg-white/80 rounded px-3 py-0.5 text-[11px] font-mono text-neutral-600 flex-1 truncate text-center">
                https://{domain}/downloads
              </div>
            </div>

            {/* Outer simulated page background */}
            <div className="p-6 sm:p-8 bg-neutral-50/80 min-h-[520px] flex flex-col items-center justify-center">
              <div className="w-full text-center mb-5">
                <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-widest">
                  Personal Site Section
                </div>
                <h3 className="text-sm font-bold text-neutral-800">
                  Protected Resource Download
                </h3>
              </div>

              {/* The Real Iframe Preview */}
              <div
                style={{
                  width: widthPreset,
                  maxWidth: '100%',
                  borderRadius: `${borderRadius}px`,
                  boxShadow: hasShadow ? '0 10px 15px -3px rgba(0, 0, 0, 0.08)' : 'none',
                }}
                className="transition-all duration-200 overflow-hidden"
              >
                <iframe
                  src={previewIframeSrc}
                  width="100%"
                  height={height}
                  className={`bg-white transition-all ${
                    hasBorder ? 'border border-neutral-300' : 'border-0'
                  }`}
                  style={{ borderRadius: `${borderRadius}px` }}
                  title="Live Sandbox Embed"
                />
              </div>

              <div className="mt-4 text-[11px] text-neutral-500 font-mono">
                Interactive: you can test unlocking and typing passwords right inside the frame above!
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  Code2,
  KeyRound,
  Globe,
  Share2,
  X,
  Eye,
  EyeOff,
  Layers,
} from 'lucide-react';
import { ShareItem } from '../types';
import { formatBytes } from '../utils/formatters';
import { encodeStatelessShare } from '../utils/localShares';

interface ShareSuccessModalProps {
  share: ShareItem;
  passwordUsed?: string;
  domain: string;
  onClose: () => void;
  onPreviewGate: (shareId: string) => void;
}

export const ShareSuccessModal: React.FC<ShareSuccessModalProps> = ({
  share,
  passwordUsed,
  domain,
  onClose,
  onPreviewGate,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [usePersonalDomain, setUsePersonalDomain] = useState(true);

  // Generate URLs
  const activeBaseUrl = usePersonalDomain
    ? `https://${domain}`
    : window.location.origin;

  const statelessToken = share.sourceType === 'github' ? encodeStatelessShare(share, passwordUsed) : '';
  const shareUrl = statelessToken
    ? `${activeBaseUrl}/share/${share.id}?d=${statelessToken}`
    : `${activeBaseUrl}/share/${share.id}`;
  const embedUrl = statelessToken
    ? `${activeBaseUrl}/embed/${share.id}?d=${statelessToken}`
    : `${activeBaseUrl}/embed/${share.id}`;

  const iframeSnippet = `<iframe src="${embedUrl}" width="100%" height="460" frameborder="0" allow="clipboard-write" style="border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); max-width: 640px; display: block; margin: 0 auto;"></iframe>`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyEmbed = () => {
    navigator.clipboard.writeText(iframeSnippet);
    setCopiedEmbed(true);
    setTimeout(() => setCopiedEmbed(false), 2000);
  };

  const handleCopyPassword = () => {
    if (!passwordUsed) return;
    navigator.clipboard.writeText(passwordUsed);
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white border border-neutral-200 rounded-2xl max-w-2xl w-full p-6 sm:p-8 shadow-xl relative my-8 animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <div>
            <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
              Ready for Distribution
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-neutral-900">
              Unique Link & Embed Code Generated
            </h2>
          </div>
        </div>

        {/* File Summary with Prominent File Size */}
        <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-xs font-bold text-neutral-900 truncate">
              {share.title || share.filename}
            </div>
            <div className="text-[11px] text-neutral-500 font-mono truncate mt-0.5">
              {share.filename}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono font-bold text-neutral-900 bg-white border border-neutral-200 px-2.5 py-1 rounded-md shadow-2xs">
              📦 {formatBytes(share.fileSize)}
            </span>
            <span className="text-[11px] font-semibold text-neutral-600 bg-neutral-200/70 px-2 py-1 rounded-md">
              ID: {share.id}
            </span>
          </div>
        </div>

        {/* Domain Selection Pill */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-neutral-100">
          <span className="text-xs font-bold text-neutral-700">Domain Target:</span>
          <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setUsePersonalDomain(true)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                usePersonalDomain
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              q.vopple.uk (Personal)
            </button>
            <button
              type="button"
              onClick={() => setUsePersonalDomain(false)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                !usePersonalDomain
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Current App URL (Live Preview)
            </button>
          </div>
        </div>

        <div className="space-y-5">
          {/* 1. Unique Direct Link */}
          <div>
            <label className="block text-xs font-bold text-neutral-800 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-neutral-600" />
                <span>Direct Share URL</span>
              </span>
              <span className="text-[11px] text-emerald-700 font-medium">Domain: {domain}</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 select-all"
              />
              <button
                onClick={handleCopyLink}
                className="px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
              </button>
            </div>
          </div>

          {/* 2. Password Record */}
          {passwordUsed && (
            <div>
              <label className="block text-xs font-bold text-neutral-800 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-neutral-600" />
                <span>Configured Password (Send to recipient)</span>
              </label>
              <div className="flex items-center gap-2">
                <div className="relative w-full">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    readOnly
                    value={passwordUsed}
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 select-all pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  onClick={handleCopyPassword}
                  className="px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 border border-neutral-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                >
                  {copiedPassword ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedPassword ? 'Copied' : 'Copy Password'}</span>
                </button>
              </div>
            </div>
          )}

          {/* 3. Iframe Embed Code */}
          <div>
            <label className="block text-xs font-bold text-neutral-800 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-neutral-600" />
                <span>Personal Website Iframe Embed Code</span>
              </span>
              <span className="text-[11px] text-neutral-500 font-normal">Responsive & sandboxed</span>
            </label>
            <div className="relative">
              <pre className="p-3 bg-neutral-900 text-neutral-200 rounded-lg text-[11px] font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap select-all max-h-24">
                {iframeSnippet}
              </pre>
              <button
                onClick={handleCopyEmbed}
                className="absolute right-2 top-2 px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white rounded text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer border border-neutral-700"
              >
                {copiedEmbed ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedEmbed ? 'Copied' : 'Copy Code'}</span>
              </button>
            </div>
            <p className="text-[11px] text-neutral-500 mt-1.5 leading-relaxed">
              Paste this HTML snippet directly into any page on your personal website (<code className="text-neutral-800 font-mono">q.vopple.uk</code>, WordPress, Notion, Webflow, or custom React/HTML site).
            </p>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="mt-8 pt-4 border-t border-neutral-200 flex items-center justify-between gap-3">
          <button
            onClick={() => {
              onClose();
              onPreviewGate(share.id);
            }}
            className="flex items-center gap-1.5 text-xs font-bold text-neutral-900 hover:text-emerald-700 transition-colors cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Test Password Gate View</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { Shield, Upload, FileCode2, HardDrive, Globe } from 'lucide-react';

interface NavbarProps {
  activeTab: 'upload' | 'shares' | 'embed' | 'docs' | 'config';
  onSelectTab: (tab: 'upload' | 'shares' | 'embed' | 'docs' | 'config') => void;
  domain: string;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onSelectTab, domain }) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-neutral-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-neutral-900 text-white flex items-center justify-center shadow-xs">
            <Shield className="w-5 h-5 text-emerald-400" />
          </div>
          <button
            onClick={() => onSelectTab('upload')}
            className="text-left group cursor-pointer focus-visible:outline-none"
          >
            <div className="text-base font-bold tracking-tight text-neutral-900 group-hover:text-neutral-700 transition-colors whitespace-nowrap">
              VaultDrop
            </div>
            <div className="text-[11px] text-neutral-500 font-medium tracking-tight flex items-center gap-1 whitespace-nowrap">
              <Globe className="w-3 h-3 text-emerald-600" />
              <span>{domain}</span>
            </div>
          </button>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-neutral-600">
          <button
            onClick={() => onSelectTab('upload')}
            className={`whitespace-nowrap transition-colors py-1 cursor-pointer ${
              activeTab === 'upload'
                ? 'text-neutral-950 font-semibold border-b-2 border-neutral-900'
                : 'hover:text-neutral-900'
            }`}
          >
            Upload (Large Files)
          </button>
          <button
            onClick={() => onSelectTab('shares')}
            className={`whitespace-nowrap transition-colors py-1 cursor-pointer ${
              activeTab === 'shares'
                ? 'text-neutral-950 font-semibold border-b-2 border-neutral-900'
                : 'hover:text-neutral-900'
            }`}
          >
            Active Shares
          </button>
          <button
            onClick={() => onSelectTab('embed')}
            className={`whitespace-nowrap transition-colors py-1 cursor-pointer ${
              activeTab === 'embed'
                ? 'text-neutral-950 font-semibold border-b-2 border-neutral-900'
                : 'hover:text-neutral-900'
            }`}
          >
            Embed Generator
          </button>
          <button
            onClick={() => onSelectTab('docs')}
            className={`whitespace-nowrap transition-colors py-1 cursor-pointer ${
              activeTab === 'docs'
                ? 'text-neutral-950 font-semibold border-b-2 border-neutral-900'
                : 'hover:text-neutral-900'
            }`}
          >
            Domain Setup
          </button>
          <button
            onClick={() => onSelectTab('config')}
            className={`whitespace-nowrap transition-colors py-1 cursor-pointer ${
              activeTab === 'config'
                ? 'text-neutral-950 font-semibold border-b-2 border-neutral-900'
                : 'hover:text-neutral-900'
            }`}
          >
            Config (YAML/JSON)
          </button>
        </nav>

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => onSelectTab('upload')}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-950 rounded-lg transition-colors cursor-pointer shadow-xs whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            <span>New Upload</span>
          </button>
        </div>
      </div>
    </header>
  );
};

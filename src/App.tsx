import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { UploadView } from './components/UploadView';
import { SharesList } from './components/SharesList';
import { EmbedSandbox } from './components/EmbedSandbox';
import { DocsView } from './components/DocsView';
import { ConfigView } from './components/ConfigView';
import { RecipientGate } from './components/RecipientGate';
import { ShareSuccessModal } from './components/ShareSuccessModal';
import { ShareItem } from './types';
import { ArrowLeft, Shield } from 'lucide-react';

const PERSONAL_DOMAIN = 'q.vopple.uk';

export default function App() {
  const [activeTab, setActiveTab] = useState<'upload' | 'shares' | 'embed' | 'docs' | 'config'>('upload');
  const [shares, setShares] = useState<ShareItem[]>([]);
  const [modalShare, setModalShare] = useState<ShareItem | null>(null);
  const [modalPassword, setModalPassword] = useState<string | undefined>(undefined);

  // Recipient route state
  const [recipientShareId, setRecipientShareId] = useState<string | null>(null);
  const [isEmbedMode, setIsEmbedMode] = useState<boolean>(false);

  // Parse URL on initial load and popstate
  useEffect(() => {
    const parseUrl = () => {
      const url = new URL(window.location.href);
      const pathname = url.pathname;
      const searchParams = url.searchParams;

      const embedParam = searchParams.get('embed') === 'true';
      const shareQuery = searchParams.get('share');

      // Check path /share/:id or /embed/:id
      const sharePathMatch = pathname.match(/^\/(?:share|embed)\/([a-zA-Z0-9_-]+)/);

      if (pathname.startsWith('/embed/') || embedParam) {
        setIsEmbedMode(true);
      } else {
        setIsEmbedMode(false);
      }

      if (sharePathMatch && sharePathMatch[1]) {
        setRecipientShareId(sharePathMatch[1]);
      } else if (shareQuery) {
        setRecipientShareId(shareQuery);
      } else {
        setRecipientShareId(null);
      }
    };

    parseUrl();
    window.addEventListener('popstate', parseUrl);
    return () => window.removeEventListener('popstate', parseUrl);
  }, []);

  // Fetch shares list for embed sandbox & management
  const fetchShares = async () => {
    try {
      const res = await fetch('/api/admin/shares');
      if (res.ok) {
        const data = await res.json();
        setShares(data.shares || []);
      }
    } catch (err) {
      console.error('Error fetching shares:', err);
    }
  };

  useEffect(() => {
    fetchShares();
  }, []);

  const handleUploadSuccess = (newShare: ShareItem, passwordUsed: string) => {
    setShares((prev) => [newShare, ...prev]);
    setModalShare(newShare);
    setModalPassword(passwordUsed);
  };

  const handleOpenGate = (shareId: string) => {
    window.history.pushState({}, '', `/?share=${shareId}`);
    setRecipientShareId(shareId);
    setIsEmbedMode(false);
  };

  const handleReturnHome = () => {
    window.history.pushState({}, '', '/');
    setRecipientShareId(null);
    setIsEmbedMode(false);
    fetchShares();
  };

  // If in Recipient mode (standalone or embedded in iframe)
  if (recipientShareId) {
    return (
      <div className={`min-h-screen bg-neutral-100/70 text-neutral-900 ${isEmbedMode ? 'p-2 sm:p-4 flex items-center justify-center bg-transparent' : 'py-8'}`}>
        {!isEmbedMode && (
          <div className="max-w-xl mx-auto px-4 mb-4 flex items-center justify-between">
            <button
              onClick={handleReturnHome}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-950 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to VaultDrop Admin</span>
            </button>

            <div className="text-[11px] font-mono text-neutral-400">
              Host: {PERSONAL_DOMAIN}
            </div>
          </div>
        )}

        <RecipientGate
          shareId={recipientShareId}
          isEmbed={isEmbedMode}
          onNavigateHome={handleReturnHome}
        />
      </div>
    );
  }

  // Admin / Creator View
  return (
    <div className="min-h-screen bg-neutral-100/60 text-neutral-900 flex flex-col font-sans">
      <Navbar
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        domain={PERSONAL_DOMAIN}
      />

      <main className="flex-1 pb-16">
        {activeTab === 'upload' && (
          <UploadView
            onUploadSuccess={handleUploadSuccess}
            domain={PERSONAL_DOMAIN}
          />
        )}

        {activeTab === 'shares' && (
          <SharesList
            onSelectShare={(share) => {
              setModalShare(share);
              setModalPassword(undefined);
            }}
            onOpenGate={handleOpenGate}
            onNewUpload={() => setActiveTab('upload')}
          />
        )}

        {activeTab === 'embed' && (
          <EmbedSandbox
            shares={shares}
            domain={PERSONAL_DOMAIN}
          />
        )}

        {activeTab === 'docs' && (
          <DocsView domain={PERSONAL_DOMAIN} />
        )}

        {activeTab === 'config' && (
          <ConfigView domain={PERSONAL_DOMAIN} />
        )}
      </main>

      {/* Success Modal */}
      {modalShare && (
        <ShareSuccessModal
          share={modalShare}
          passwordUsed={modalPassword}
          domain={PERSONAL_DOMAIN}
          onClose={() => {
            setModalShare(null);
            setModalPassword(undefined);
          }}
          onPreviewGate={(shareId) => handleOpenGate(shareId)}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-neutral-200 bg-white py-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-500">
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-neutral-700" />
            <span className="font-semibold text-neutral-800">VaultDrop Engine</span>
            <span>·</span>
            <span>Domain: {PERSONAL_DOMAIN}</span>
          </div>
          <div>
            Chunked upload up to 500MB+ · scrypt password encryption · iframe embed support
          </div>
        </div>
      </footer>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import {
  Lock,
  Unlock,
  Download,
  FileArchive,
  FolderArchive,
  Check,
  Copy,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Eye,
  EyeOff,
  ExternalLink,
  Info,
  Github,
  KeyRound,
} from 'lucide-react';
import { ShareItem } from '../types';
import { formatBytes, formatDate } from '../utils/formatters';
import {
  getLocalShareById,
  verifyLocalPassword,
  decodeStatelessShare,
  verifyStatelessPassword,
  getStatelessDecryptedToken,
} from '../utils/localShares';
import { getSavedGitHubToken } from '../utils/cookieStorage';

interface RecipientGateProps {
  shareId: string;
  isEmbed?: boolean;
  onNavigateHome?: () => void;
}

export const RecipientGate: React.FC<RecipientGateProps> = ({
  shareId,
  isEmbed = false,
  onNavigateHome,
}) => {
  const [shareInfo, setShareInfo] = useState<ShareItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);

  // Unlocked state
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [privateDownloadProgress, setPrivateDownloadProgress] = useState<{
    active: boolean;
    percent: number;
    loaded: number;
    total: number;
    error?: string;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchInfo() {
      setLoading(true);
      setLoadError(null);
      try {
        let data: ShareItem | null = null;

        // 1. Check for stateless encoded payload in URL (?d=...)
        const urlParams = new URLSearchParams(window.location.search);
        const statelessPayload = urlParams.get('d');
        if (statelessPayload) {
          data = decodeStatelessShare(statelessPayload);
        }

        // 2. If not stateless, try backend API
        if (!data) {
          try {
            const res = await fetch(`/api/shares/${shareId}/info`);
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
              if (res.ok) {
                data = await res.json();
              } else {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Could not find file (${res.status})`);
              }
            }
          } catch (fetchErr: any) {
            console.warn('Backend /api/shares/info fetch failed, falling back to local shares:', fetchErr.message);
          }
        }

        // 3. Fallback to browser local storage
        if (!data) {
          data = getLocalShareById(shareId);
        }

        if (!data) {
          throw new Error('This share link could not be found or has expired.');
        }

        if (isMounted) {
          setShareInfo(data);
        }
      } catch (err: any) {
        if (isMounted) {
          setLoadError(err.message || 'File not available');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (shareId) {
      fetchInfo();
    }
    return () => {
      isMounted = false;
    };
  }, [shareId]);

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev <= 1) {
          setVerifyError(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || lockoutSeconds > 0) return;

    setVerifying(true);
    setVerifyError(null);

    try {
      let verifiedToken: string | null = null;

      // 1. Check stateless token verification
      const urlParams = new URLSearchParams(window.location.search);
      const statelessPayload = urlParams.get('d');
      if (statelessPayload) {
        const isCorrect = verifyStatelessPassword(statelessPayload, password.trim());
        if (isCorrect) {
          verifiedToken = 'stateless_' + btoa(password.trim());
          const fullInfo = decodeStatelessShare(statelessPayload, password.trim());
          if (fullInfo) {
            setShareInfo(fullInfo);
          }
        } else {
          throw new Error('Incorrect password');
        }
      }

      // 2. If not verified via stateless token, try backend API
      if (!verifiedToken) {
        try {
          const res = await fetch(`/api/shares/${shareId}/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: password.trim() }),
          });

          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const data = await res.json();
            if (!res.ok) {
              if (data.locked && data.waitSeconds) {
                setLockoutSeconds(data.waitSeconds);
              }
              throw new Error(data.error || 'Incorrect password');
            }
            verifiedToken = data.accessToken;
          }
        } catch (backendErr: any) {
          if (backendErr.message && backendErr.message.includes('Incorrect password')) {
            throw backendErr;
          }
        }
      }

      // 3. Fallback to localStorage password check
      if (!verifiedToken) {
        const isCorrect = verifyLocalPassword(shareId, password.trim());
        if (isCorrect) {
          verifiedToken = 'local_' + btoa(password.trim());
        } else {
          throw new Error('Incorrect password');
        }
      }

      setAccessToken(verifiedToken);
    } catch (err: any) {
      setVerifyError(err.message || 'Failed to verify password.');
    } finally {
      setVerifying(false);
    }
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
  };

  const handlePrivateGitHubDownload = async (token?: string | null) => {
    if (!shareInfo) return;
    setPrivateDownloadProgress({ active: true, percent: 0, loaded: 0, total: shareInfo.fileSize || 0 });
    try {
      const repoClean = shareInfo.githubRepo?.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
      const assetUrl =
        shareInfo.githubAssetApiUrl ||
        (shareInfo.githubAssetId && repoClean
          ? `https://api.github.com/repos/${repoClean}/releases/assets/${shareInfo.githubAssetId}`
          : null);

      if (!assetUrl) {
        if (shareInfo.githubDownloadUrl) {
          window.open(shareInfo.githubDownloadUrl, '_blank');
          return;
        }
        throw new Error('Release asset details not found for private repository.');
      }

      const headers: Record<string, string> = {
        Accept: 'application/octet-stream',
      };
      if (token) {
        headers['Authorization'] = `token ${token.trim()}`;
      }

      const res = await fetch(assetUrl, { headers });
      if (!res.ok) {
        throw new Error(`GitHub returned HTTP ${res.status} when accessing private release asset.`);
      }

      const total = parseInt(res.headers.get('content-length') || '0', 10) || shareInfo.fileSize || 0;

      if (!res.body) {
        const blob = await res.blob();
        triggerBlobDownload(blob, shareInfo.filename || 'download.zip');
        return;
      }

      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let receivedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          receivedBytes += value.length;
          const pct = total > 0 ? Math.min(100, Math.round((receivedBytes / total) * 100)) : 0;
          setPrivateDownloadProgress({
            active: true,
            percent: pct,
            loaded: receivedBytes,
            total: total || receivedBytes,
          });
        }
      }

      const finalBlob = new Blob(chunks as BlobPart[], { type: 'application/octet-stream' });
      triggerBlobDownload(finalBlob, shareInfo.filename || 'download.zip');

      setShareInfo((prev) => (prev ? { ...prev, downloadCount: (prev.downloadCount || 0) + 1 } : null));
    } catch (err: any) {
      setPrivateDownloadProgress({
        active: false,
        percent: 0,
        loaded: 0,
        total: 0,
        error: err.message || 'Failed to download private release asset.',
      });
    } finally {
      setTimeout(() => {
        setPrivateDownloadProgress(null);
      }, 6000);
    }
  };

  const handleDownload = () => {
    if (!accessToken && !shareInfo) return;
    setDownloadStarted(true);

    if (shareInfo?.sourceType === 'github') {
      const urlParams = new URLSearchParams(window.location.search);
      const statelessPayload = urlParams.get('d');
      const token =
        shareInfo.githubToken ||
        (statelessPayload ? getStatelessDecryptedToken(statelessPayload, password.trim()) : null) ||
        getSavedGitHubToken() ||
        undefined;

      if (shareInfo.isPrivateRepo || token) {
        handlePrivateGitHubDownload(token);
        setTimeout(() => setDownloadStarted(false), 2000);
        return;
      }

      // Direct stream download from public GitHub CDN
      const link = document.createElement('a');
      link.href = shareInfo.githubDownloadUrl || '#';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('download', shareInfo?.filename || 'download');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const downloadUrl = `/api/shares/${shareId}/download?token=${encodeURIComponent(accessToken || '')}&pwd=${encodeURIComponent(password)}`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', shareInfo?.filename || 'download');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    if (shareInfo) {
      setShareInfo({
        ...shareInfo,
        downloadCount: (shareInfo.downloadCount || 0) + 1,
      });
    }

    setTimeout(() => {
      setDownloadStarted(false);
    }, 4000);
  };

  const handleCopyHash = () => {
    if (!shareInfo?.checksumSha256) return;
    navigator.clipboard.writeText(shareInfo.checksumSha256);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center p-12 ${isEmbed ? 'min-h-[360px]' : 'min-h-[70vh]'}`}>
        <div className="text-center space-y-3">
          <div className="animate-spin w-8 h-8 border-2 border-neutral-900 border-t-transparent rounded-full mx-auto" />
          <div className="text-xs font-semibold text-neutral-600">Verifying secure vault...</div>
        </div>
      </div>
    );
  }

  if (loadError || !shareInfo) {
    return (
      <div className={`max-w-lg mx-auto p-6 sm:p-8 ${isEmbed ? 'py-6' : 'py-16'}`}>
        <div className="bg-white border border-rose-200 rounded-xl p-8 text-center space-y-4 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-neutral-900">File Unavailable</h2>
            <p className="mt-1 text-xs text-neutral-600">
              {loadError || 'The requested file was not found, has expired, or was removed by the owner.'}
            </p>
          </div>
          {onNavigateHome && (
            <button
              onClick={onNavigateHome}
              className="text-xs font-semibold text-neutral-900 hover:underline cursor-pointer"
            >
              Return to VaultDrop Home
            </button>
          )}
        </div>
      </div>
    );
  }

  const isGitHub = shareInfo.sourceType === 'github';

  return (
    <div className={`w-full max-w-xl mx-auto ${isEmbed ? 'p-3' : 'py-10 px-4 sm:px-6'}`}>
      <div className="bg-white border border-neutral-200 rounded-xl shadow-xs overflow-hidden">
        {/* Top Header Card */}
        <div className="p-5 sm:p-6 border-b border-neutral-200 bg-neutral-50/50">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-lg bg-neutral-900 text-white flex items-center justify-center shrink-0">
                {isGitHub ? (
                  <Github className="w-5 h-5 text-emerald-400" />
                ) : shareInfo.isFolder ? (
                  <FolderArchive className="w-5 h-5 text-emerald-400" />
                ) : (
                  <FileArchive className="w-5 h-5 text-emerald-400" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-base font-bold text-neutral-900 truncate">
                  {shareInfo.title || shareInfo.filename}
                </div>
                <div className="text-xs text-neutral-500 font-mono truncate mt-0.5 flex items-center gap-1.5">
                  <span>{shareInfo.filename}</span>
                  {shareInfo.githubReleaseTag && (
                    <span className="text-[10px] text-neutral-500 bg-neutral-200/70 px-1.5 py-0.2 rounded font-sans">
                      {shareInfo.githubReleaseTag}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs mt-1.5 flex-wrap">
                  <span className="font-mono font-bold text-neutral-900 bg-neutral-200 px-2 py-0.5 rounded text-xs">
                    📦 {formatBytes(shareInfo.fileSize)}
                  </span>
                  <span className="text-neutral-400">·</span>
                  <span className="text-neutral-500 font-mono text-[11px]">
                    {shareInfo.fileSize.toLocaleString()} bytes
                  </span>
                  <span className="text-neutral-400">·</span>
                  <span className="text-neutral-500 text-[11px]">{formatDate(shareInfo.createdAt)}</span>
                </div>
              </div>
            </div>

            {/* Status indicator */}
            <div className="shrink-0 flex flex-col items-end gap-1">
              {accessToken ? (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Unlocked</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600 bg-neutral-100 border border-neutral-200 px-2.5 py-1 rounded-md">
                  <Lock className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Protected</span>
                </div>
              )}

              {shareInfo.isEncrypted && (
                <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50/80 px-1.5 py-0.5 rounded">
                  AES-256
                </span>
              )}
            </div>
          </div>

          {/* Description if present */}
          {shareInfo.description && (
            <div className="mt-4 p-3 bg-white border border-neutral-200 rounded-lg text-xs text-neutral-600 leading-relaxed">
              <div className="font-semibold text-neutral-800 mb-0.5 flex items-center gap-1">
                <Info className="w-3 h-3 text-neutral-500" />
                <span>Note from Uploader:</span>
              </div>
              <div className="whitespace-pre-line">{shareInfo.description}</div>
            </div>
          )}
        </div>

        {/* Content Body: Gate vs Unlocked Download */}
        <div className="p-5 sm:p-6">
          {!accessToken ? (
            /* Locked State: Password Challenge */
            <form onSubmit={handleVerify} className="space-y-4">
              {/* Prominent File Size Detail Bar */}
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-700 flex items-center gap-1.5">
                  <FileArchive className="w-3.5 h-3.5 text-emerald-600" />
                  <span>File Size:</span>
                </span>
                <span className="text-xs font-mono font-bold text-neutral-900 bg-white px-2 py-0.5 rounded border border-neutral-200 shadow-2xs">
                  {formatBytes(shareInfo.fileSize)} ({shareInfo.fileSize.toLocaleString()} bytes)
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 uppercase tracking-wider mb-1.5">
                  Enter Password to Unlock File
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password..."
                    disabled={verifying || lockoutSeconds > 0}
                    autoFocus
                    required
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent font-mono pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-neutral-500 mt-1.5 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-neutral-400" />
                  <span>
                    {isGitHub
                      ? 'Secure GitHub CDN token gate with anti-bruteforce protection.'
                      : 'AES-256 decryption key is derived directly from your password.'}
                  </span>
                </p>
              </div>

              {verifyError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-medium">{verifyError}</span>
                    {lockoutSeconds > 0 && (
                      <div className="mt-1 font-mono font-bold text-rose-900">
                        Cooldown: {lockoutSeconds}s
                      </div>
                    )}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={verifying || !password.trim() || lockoutSeconds > 0}
                className={`w-full py-2.5 px-4 rounded-lg text-xs font-bold text-white flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs ${
                  verifying || !password.trim() || lockoutSeconds > 0
                    ? 'bg-neutral-300 cursor-not-allowed opacity-75'
                    : 'bg-neutral-900 hover:bg-neutral-800 active:scale-[0.99]'
                }`}
              >
                {verifying ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Unlock & Access File ({formatBytes(shareInfo.fileSize)})</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Unlocked State: Download Button & Integrity Hash */
            <div className="space-y-5 text-center">
              <div className="py-2">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                  <Check className="w-6 h-6 stroke-[2.5]" />
                </div>
                <h3 className="text-base font-bold text-neutral-900">
                  Password Verified — Ready for Download
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {shareInfo.isEncrypted
                    ? 'Decrypted on-the-fly via AES-256 stream directly to your device.'
                    : 'Direct stream authorized from high-speed CDN.'}
                </p>
              </div>

              <button
                onClick={handleDownload}
                disabled={Boolean(privateDownloadProgress?.active)}
                className={`w-full py-3 px-5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-xs active:scale-[0.99] ${
                  privateDownloadProgress?.active ? 'opacity-80 cursor-wait' : ''
                }`}
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>
                  {privateDownloadProgress?.active
                    ? `Streaming Private Release (${privateDownloadProgress.percent}%)...`
                    : downloadStarted
                    ? 'Streaming Download...'
                    : `Download File (${formatBytes(shareInfo.fileSize)})`}
                </span>
              </button>

              {privateDownloadProgress?.active && (
                <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl space-y-2 text-left">
                  <div className="flex items-center justify-between text-xs font-semibold text-neutral-800">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Streaming from Private GitHub Release...</span>
                    </span>
                    <span className="font-mono tabular-nums">{privateDownloadProgress.percent}%</span>
                  </div>
                  <div className="w-full bg-neutral-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-600 h-2 rounded-full transition-all duration-150"
                      style={{ width: `${privateDownloadProgress.percent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono tabular-nums">
                    <span>
                      {formatBytes(privateDownloadProgress.loaded)} of {formatBytes(privateDownloadProgress.total)}
                    </span>
                    <span>Direct CDN Stream</span>
                  </div>
                </div>
              )}

              {privateDownloadProgress?.error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2 text-left">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{privateDownloadProgress.error}</span>
                </div>
              )}

              {/* SHA-256 Checksum */}
              {shareInfo.checksumSha256 && (
                <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-left">
                  <div className="flex items-center justify-between text-[11px] text-neutral-500 mb-1">
                    <span className="font-semibold text-neutral-700">SHA-256 Checksum</span>
                    <button
                      onClick={handleCopyHash}
                      className="text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer font-medium"
                    >
                      {copiedHash ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Hash</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="text-[11px] font-mono text-neutral-700 break-all select-all bg-white p-2 rounded border border-neutral-200">
                    {shareInfo.checksumSha256}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-1 font-mono tabular-nums">
                <span>Total downloads: {shareInfo.downloadCount}</span>
                <span>Protected by VaultDrop · q.vopple.uk</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

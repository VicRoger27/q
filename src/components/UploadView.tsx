import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  FolderArchive,
  FileArchive,
  KeyRound,
  Eye,
  EyeOff,
  Sparkles,
  Lock,
  Clock,
  FileText,
  AlertCircle,
  CheckCircle2,
  X,
  ArrowRight,
  Github,
  Search,
  CloudLightning,
  ShieldCheck,
  Check,
  Cookie,
  Trash2,
  HardDrive,
  Download,
  RefreshCw,
  Edit3,
} from 'lucide-react';
import { UploadState, ShareItem, GitHubMatchedAsset } from '../types';
import {
  formatBytes,
  formatSpeed,
  formatSeconds,
  evaluatePasswordStrength,
  generateRandomPassword,
} from '../utils/formatters';
import { uploadLargeFile, zipFolderFiles } from '../utils/uploader';
import { scanGitHubReleasesClient, refreshGitHubAssetSize, parseGitHubRepoUrl } from '../utils/github';
import { saveLocalShare } from '../utils/localShares';
import {
  getSavedGitHubToken,
  saveGitHubTokenToCookie,
  clearSavedGitHubToken,
  isRememberTokenEnabled,
  downloadGitHubTokenBackup,
} from '../utils/cookieStorage';

interface UploadViewProps {
  onUploadSuccess: (share: ShareItem, passwordUsed: string) => void;
  domain: string;
}

export const UploadView: React.FC<UploadViewProps> = ({ onUploadSuccess, domain }) => {
  const [sourceMode, setSourceMode] = useState<'file' | 'folder' | 'github'>('file');

  // File & Folder mode states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [folderFilesCount, setFolderFilesCount] = useState<number>(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [expiryDays, setExpiryDays] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);

  // GitHub mode states
  const [githubRepoUrl, setGithubRepoUrl] = useState('');
  const [targetPattern, setTargetPattern] = useState('TARGET.zip');
  const [githubToken, setGithubToken] = useState('');
  const [rememberTokenInCookie, setRememberTokenInCookie] = useState<boolean>(true);
  const [isTokenSavedInCookie, setIsTokenSavedInCookie] = useState<boolean>(false);
  const [cookieNotification, setCookieNotification] = useState<string | null>(null);
  const [deviceOnlyPrivacy, setDeviceOnlyPrivacy] = useState<boolean>(true);
  const [isScanningGithub, setIsScanningGithub] = useState(false);
  const [githubMatches, setGithubMatches] = useState<GitHubMatchedAsset[]>([]);
  const [selectedGithubAsset, setSelectedGithubAsset] = useState<GitHubMatchedAsset | null>(null);
  const [githubScanError, setGithubScanError] = useState<string | null>(null);
  const [githubImporting, setGithubImporting] = useState(false);
  const [showPrivateGuide, setShowPrivateGuide] = useState(false);
  const [isRefreshingSize, setIsRefreshingSize] = useState(false);
  const [isEditingSize, setIsEditingSize] = useState(false);
  const [customSizeMb, setCustomSizeMb] = useState('');

  // Upload progress state
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const [zippingProgress, setZippingProgress] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const pwdStrength = evaluatePasswordStrength(password);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 1024 * 1024 * 1024 * 1.05) {
        setErrorMessage('File exceeds the 1GB maximum upload limit.');
        return;
      }
      setSelectedFile(file);
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
      setErrorMessage(null);
    }
  };

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = e.target.files;
      setFolderFilesCount(files.length);
      const relPath = (files[0] as any).webkitRelativePath || '';
      const folderName = relPath.split('/')[0] || 'Archive_Folder';
      if (!title) {
        setTitle(folderName);
      }

      setZippingProgress(0);
      try {
        const zipped = await zipFolderFiles(files, (p) => setZippingProgress(p));
        if (zipped.size > 1024 * 1024 * 1024 * 1.05) {
          setErrorMessage('Compressed folder exceeds 1GB limit.');
          setZippingProgress(null);
          return;
        }
        setSelectedFile(zipped);
        setZippingProgress(null);
        setErrorMessage(null);
      } catch (err: any) {
        setErrorMessage('Failed to package folder: ' + err.message);
        setZippingProgress(null);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.size > 1024 * 1024 * 1024 * 1.05) {
        setErrorMessage('File exceeds the 1GB maximum upload limit.');
        return;
      }
      setSelectedFile(file);
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
      setErrorMessage(null);
    }
  };

  // Load saved token from device cookie on mount
  useEffect(() => {
    const saved = getSavedGitHubToken();
    const remember = isRememberTokenEnabled();
    setRememberTokenInCookie(remember);
    if (saved) {
      setGithubToken(saved);
      setIsTokenSavedInCookie(true);
    }
  }, []);

  const handleTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setGithubToken(val);
    if (rememberTokenInCookie && val.trim()) {
      saveGitHubTokenToCookie(val.trim(), true);
      setIsTokenSavedInCookie(true);
    } else if (!val.trim()) {
      clearSavedGitHubToken();
      setIsTokenSavedInCookie(false);
    }
  };

  const handleToggleRememberToken = (checked: boolean) => {
    setRememberTokenInCookie(checked);
    if (checked && githubToken.trim()) {
      saveGitHubTokenToCookie(githubToken.trim(), true);
      setIsTokenSavedInCookie(true);
      setCookieNotification('Token saved in this device cookie');
      setTimeout(() => setCookieNotification(null), 3000);
    } else if (!checked) {
      clearSavedGitHubToken();
      setIsTokenSavedInCookie(false);
      setCookieNotification('Token removed from device cookie');
      setTimeout(() => setCookieNotification(null), 3000);
    }
  };

  const handleClearSavedToken = () => {
    clearSavedGitHubToken();
    setGithubToken('');
    setIsTokenSavedInCookie(false);
    setCookieNotification('Token completely erased from device');
    setTimeout(() => setCookieNotification(null), 3000);
  };

  const handleDownloadTokenFile = () => {
    const tokenToDownload = githubToken.trim() || getSavedGitHubToken();
    if (!tokenToDownload) {
      setCookieNotification('No PAT saved to download. Paste a token first.');
      setTimeout(() => setCookieNotification(null), 3000);
      return;
    }
    const success = downloadGitHubTokenBackup(tokenToDownload);
    if (success) {
      setCookieNotification('PAT backup file downloaded to your device!');
      setTimeout(() => setCookieNotification(null), 3500);
    }
  };

  const handleGeneratePassword = () => {
    const generated = generateRandomPassword(14);
    setPassword(generated);
    setShowPassword(true);
  };

  // Scan GitHub repo for TARGET.zip / TARGET.7z / compressed files
  const handleScanGithub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubRepoUrl.trim()) {
      setGithubScanError('Please enter a GitHub repository URL or owner/repo (e.g. owner/repository).');
      return;
    }

    const tokenToUse = githubToken.trim() || getSavedGitHubToken();
    if (tokenToUse && rememberTokenInCookie) {
      saveGitHubTokenToCookie(tokenToUse, true);
      setIsTokenSavedInCookie(true);
    }

    setIsScanningGithub(true);
    setGithubScanError(null);
    setSelectedGithubAsset(null);
    setGithubMatches([]);

    try {
      const data = await scanGitHubReleasesClient(
        githubRepoUrl.trim(),
        targetPattern.trim(),
        tokenToUse || undefined
      );

      if (!data.matches || data.matches.length === 0) {
        setGithubScanError(
          `No files matching "${targetPattern}" were found in ${data.owner}/${data.repo} releases. If you haven't uploaded the file to GitHub yet, create a release at github.com/${data.owner}/${data.repo}/releases or switch to Tab 1 to upload directly!`
        );
      } else {
        setGithubMatches(data.matches);
        setSelectedGithubAsset(data.matches[0]);
        if (!title) {
          setTitle(data.matches[0].name.replace(/\.[^/.]+$/, ''));
        }
      }
    } catch (err: any) {
      setGithubScanError(err.message || 'Error querying GitHub.');
    } finally {
      setIsScanningGithub(false);
    }
  };

  // Force re-query size from GitHub API and backend probe (bypassing all caches)
  const handleRefreshAssetSize = async (assetToRefresh?: GitHubMatchedAsset) => {
    const target = assetToRefresh || selectedGithubAsset;
    if (!target) return;
    setIsRefreshingSize(true);
    try {
      const parsed = parseGitHubRepoUrl(githubRepoUrl.trim());
      const owner = parsed?.owner || '';
      const repo = parsed?.repo || '';
      const token = githubToken.trim() || getSavedGitHubToken();
      const newSize = await refreshGitHubAssetSize(target, owner, repo, token);
      if (newSize > 0) {
        const updatedAsset = { ...target, size: newSize };
        setSelectedGithubAsset(updatedAsset);
        setGithubMatches((prev) =>
          prev.map((a) => (a.downloadUrl === target.downloadUrl ? updatedAsset : a))
        );
        setCookieNotification(`File size verified: ${formatBytes(newSize)}`);
        setTimeout(() => setCookieNotification(null), 3500);
      } else {
        setCookieNotification('GitHub still returned 0 bytes. Check token scope or set size manually.');
        setTimeout(() => setCookieNotification(null), 4000);
      }
    } catch (err: any) {
      setCookieNotification(err.message || 'Could not refresh size');
      setTimeout(() => setCookieNotification(null), 4000);
    } finally {
      setIsRefreshingSize(false);
    }
  };

  // Allow setting or overriding asset size if GitHub API index is delayed
  const handleApplyCustomSize = (mb: number) => {
    if (!selectedGithubAsset || mb <= 0) return;
    const bytes = Math.round(mb * 1024 * 1024);
    const updated = { ...selectedGithubAsset, size: bytes };
    setSelectedGithubAsset(updated);
    setGithubMatches((prev) =>
      prev.map((a) => (a.downloadUrl === selectedGithubAsset.downloadUrl ? updated : a))
    );
    setIsEditingSize(false);
    setCookieNotification(`File size set to ${formatBytes(bytes)}`);
    setTimeout(() => setCookieNotification(null), 3000);
  };

  // Submit GitHub import
  const handleImportGithub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGithubAsset) {
      setErrorMessage('Please select a file discovered from GitHub.');
      return;
    }
    if (!password.trim()) {
      setErrorMessage('A password is required to secure the download link.');
      return;
    }

    if (githubToken.trim() && rememberTokenInCookie) {
      saveGitHubTokenToCookie(githubToken.trim(), true);
      setIsTokenSavedInCookie(true);
    }

    setGithubImporting(true);
    setErrorMessage(null);

    try {
      let createdShare: ShareItem | null = null;

      // Only communicate with backend if device-only privacy mode is not strictly enforced.
      // In device-only mode, the token NEVER leaves this machine over any network call to a server.
      if (!deviceOnlyPrivacy) {
        try {
          const res = await fetch('/api/github/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              repoUrl: githubRepoUrl.trim(),
              downloadUrl: selectedGithubAsset.downloadUrl,
              filename: selectedGithubAsset.name,
              fileSize: selectedGithubAsset.size,
              password: password.trim(),
              title: title.trim() || selectedGithubAsset.name,
              description: description.trim(),
              expiryDays: expiryDays > 0 ? expiryDays : undefined,
              releaseTag: selectedGithubAsset.releaseTag,
              assetId: selectedGithubAsset.id,
              assetApiUrl: selectedGithubAsset.apiUrl,
              token: githubToken.trim() || undefined,
              isPrivate: Boolean(githubToken.trim()),
            }),
          });

          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const data = await res.json();
            if (res.ok && data.share) {
              createdShare = data.share;
            }
          }
        } catch (backendErr) {
          console.warn('Backend /api/github/import unavailable, continuing with client-side fallback:', backendErr);
        }
      }

      // Generate client-side encrypted share item
      if (!createdShare) {
        const shareId = 'gh_' + Math.random().toString(36).substring(2, 10);
        const expiresAt = expiryDays > 0 ? new Date(Date.now() + expiryDays * 86400000).toISOString() : null;
        createdShare = {
          id: shareId,
          title: title.trim() || selectedGithubAsset.name,
          description: description.trim(),
          filename: selectedGithubAsset.name,
          fileSize: selectedGithubAsset.size || 0,
          fileType: 'application/zip',
          createdAt: new Date().toISOString(),
          expiresAt,
          isFolder: false,
          hasPassword: true,
          isEncrypted: false,
          sourceType: 'github',
          githubRepo: githubRepoUrl.trim(),
          githubReleaseTag: selectedGithubAsset.releaseTag,
          githubDownloadUrl: selectedGithubAsset.downloadUrl,
          githubAssetId: selectedGithubAsset.id,
          githubAssetApiUrl: selectedGithubAsset.apiUrl,
          githubToken: githubToken.trim() || undefined,
          isPrivateRepo: Boolean(githubToken.trim()),
          downloadCount: 0,
        };
      }

      // Save to local storage for instant access across sessions
      if (createdShare) {
        saveLocalShare(createdShare, password.trim());
        onUploadSuccess(createdShare, password.trim());
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create GitHub share.');
    } finally {
      setGithubImporting(false);
    }
  };

  // Submit Local Chunked Upload (AES-256 Encrypted at Rest)
  const handleStartLocalUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMessage('Please choose a file or folder archive to upload.');
      return;
    }
    if (!password.trim()) {
      setErrorMessage('A password is required to encrypt and secure the file.');
      return;
    }

    setErrorMessage(null);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const result = await uploadLargeFile({
        file: selectedFile,
        password: password.trim(),
        title: title.trim() || selectedFile.name,
        description: description.trim(),
        expiryDays: expiryDays > 0 ? expiryDays : undefined,
        isFolder: sourceMode === 'folder' || selectedFile.name.endsWith('.zip'),
        onProgress: (state) => {
          setUploadState(state);
        },
        signal: abortController.signal,
      });

      setUploadState(null);
      setSelectedFile(null);
      onUploadSuccess(result, password.trim());
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message.includes('cancelled')) {
        setErrorMessage('Upload cancelled.');
      } else {
        setErrorMessage(err.message || 'Upload failed. Please check network connection and try again.');
      }
      setUploadState(null);
    }
  };

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6">
      {/* Editorial Header */}
      <div className="mb-8">
        <div className="text-xs font-semibold text-emerald-700 tracking-wider uppercase mb-1 flex items-center gap-2">
          <span>Target Host: https://{domain}</span>
          <span className="text-neutral-300">·</span>
          <span>AES-256 Encryption at Rest</span>
          <span className="text-neutral-300">·</span>
          <span>Up to 1GB Payload</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 text-balance">
          Distribute 1GB Files & Folders Behind a Secure Password Gate
        </h1>
        <p className="mt-2 text-sm sm:text-base text-neutral-600 max-w-2xl leading-relaxed">
          Upload large files up to 1GB directly with chunked transfer and AES-256 encryption, or link a GitHub repo to grab <code className="text-neutral-800 bg-neutral-100 px-1.5 py-0.5 rounded text-xs font-mono">TARGET.zip</code> with zero hosting costs.
        </p>
      </div>

      {/* Main Upload Box */}
      <div className="bg-white border border-neutral-200 rounded-xl shadow-xs overflow-hidden">
        {/* Source Mode Tabs */}
        <div className="flex border-b border-neutral-200 bg-neutral-50/60 p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => {
              setSourceMode('file');
              setSelectedFile(null);
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              sourceMode === 'file'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <FileArchive className="w-4 h-4 text-emerald-600" />
            <span>Single File / Zip (Up to 1GB)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSourceMode('folder');
              setSelectedFile(null);
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              sourceMode === 'folder'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <FolderArchive className="w-4 h-4 text-emerald-600" />
            <span>Folder (Auto-Zip to 1GB)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSourceMode('github');
              setSelectedFile(null);
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              sourceMode === 'github'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Github className="w-4 h-4 text-neutral-900" />
            <span>GitHub TARGET.zip (Free Hosting)</span>
          </button>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {/* TAB 1 & 2: Local File or Folder Drag & Drop */}
          {(sourceMode === 'file' || sourceMode === 'folder') && (
            <form onSubmit={handleStartLocalUpload} className="space-y-6">
              {!selectedFile && !zippingProgress && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => {
                    if (sourceMode === 'file') {
                      fileInputRef.current?.click();
                    } else {
                      folderInputRef.current?.click();
                    }
                  }}
                  className={`border-2 border-dashed rounded-xl p-8 sm:p-12 text-center transition-all cursor-pointer ${
                    isDragging
                      ? 'border-emerald-600 bg-emerald-50/50 scale-[0.99]'
                      : 'border-neutral-300 hover:border-neutral-400 bg-neutral-50/30'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <input
                    ref={folderInputRef}
                    type="file"
                    // @ts-ignore
                    webkitdirectory="true"
                    // @ts-ignore
                    directory="true"
                    multiple
                    className="hidden"
                    onChange={handleFolderSelect}
                  />

                  <div className="w-14 h-14 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-4 text-neutral-700">
                    {sourceMode === 'file' ? (
                      <Upload className="w-7 h-7 text-neutral-900" />
                    ) : (
                      <FolderArchive className="w-7 h-7 text-neutral-900" />
                    )}
                  </div>

                  <div className="text-base font-semibold text-neutral-900 mb-1">
                    {sourceMode === 'file'
                      ? 'Select or drop your file (up to 1GB)'
                      : 'Select an entire folder (auto-compressed to 1GB zip)'}
                  </div>
                  <p className="text-xs text-neutral-500 max-w-md mx-auto leading-relaxed">
                    Supports .zip, .7z, .tar, .mp4, .pdf, .iso, or raw archives. Files are sliced into 5MB chunks and encrypted with AES-256 before being stored.
                  </p>
                  <div className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-3 py-1.5 rounded-md">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>AES-256 Encrypted at Rest · 1GB Cap</span>
                  </div>
                </div>
              )}

              {/* Folder zipping progress */}
              {zippingProgress !== null && (
                <div className="border border-neutral-200 rounded-xl p-8 text-center bg-neutral-50">
                  <div className="animate-spin w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full mx-auto mb-3" />
                  <div className="text-sm font-semibold text-neutral-900">
                    Packaging {folderFilesCount} files into compressed ZIP archive...
                  </div>
                  <div className="w-full bg-neutral-200 rounded-full h-2 max-w-md mx-auto mt-3 overflow-hidden">
                    <div
                      className="bg-emerald-600 h-2 transition-all duration-150"
                      style={{ width: `${zippingProgress}%` }}
                    />
                  </div>
                  <div className="text-xs text-neutral-500 mt-2 font-mono tabular-nums">
                    {zippingProgress}% compressed
                  </div>
                </div>
              )}

              {/* Selected File Card with Prominent File Size */}
              {selectedFile && !uploadState?.isUploading && (
                <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-lg bg-neutral-900 text-white flex items-center justify-center shrink-0">
                        <FileArchive className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-neutral-900 truncate">
                          {selectedFile.name}
                        </div>
                        <div className="text-xs text-neutral-500 flex items-center gap-2 font-mono tabular-nums">
                          <span>{selectedFile.type || 'Archive Payload'}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-700 font-semibold flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            <span>AES-256 at Rest</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedFile(null)}
                      className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60 rounded-md transition-colors cursor-pointer shrink-0"
                      title="Remove file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Prominent File Size Banner */}
                  <div className="p-3 bg-white border border-neutral-200 rounded-lg flex items-center justify-between flex-wrap gap-2">
                    <div className="text-xs text-neutral-600 font-semibold flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Total Payload Size:</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 bg-neutral-900 text-white rounded font-mono text-xs font-bold">
                        {formatBytes(selectedFile.size)}
                      </span>
                      <span className="text-[11px] text-neutral-500 font-mono">
                        ({selectedFile.size.toLocaleString()} bytes)
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Upload Progress Display */}
              {uploadState?.isUploading && (
                <div className="border border-neutral-200 rounded-xl p-6 bg-neutral-50 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Streaming 5MB Chunks & AES-256 Encrypting...</span>
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5 font-mono tabular-nums">
                        {formatBytes(uploadState.uploadedBytes)} of {formatBytes(uploadState.totalBytes)} ({uploadState.progressPercent}%)
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-semibold text-neutral-800 font-mono tabular-nums">
                        {formatSpeed(uploadState.speedBytesPerSec)}
                      </div>
                      <div className="text-xs text-neutral-500 font-mono tabular-nums">
                        ETA: {formatSeconds(uploadState.etaSeconds)}
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-neutral-200 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-emerald-600 h-2.5 rounded-full transition-all duration-200 ease-out"
                      style={{ width: `${uploadState.progressPercent}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-neutral-500">
                    <span className="font-mono tabular-nums">
                      Chunk {uploadState.currentChunk} of {uploadState.totalChunks}
                    </span>

                    <button
                      type="button"
                      onClick={handleCancelUpload}
                      className="text-rose-600 hover:text-rose-700 font-medium cursor-pointer"
                    >
                      Cancel Upload
                    </button>
                  </div>
                </div>
              )}

              {/* Password & Metadata Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-neutral-600" />
                      <span>Download & Decryption Password</span>
                      <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleGeneratePassword}
                      className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Generate Strong</span>
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Set access password..."
                      required
                      disabled={uploadState?.isUploading}
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

                  {password && (
                    <div className="flex items-center gap-2 pt-1">
                      <div className="flex-1 h-1.5 bg-neutral-200 rounded-full overflow-hidden flex gap-1">
                        <div className={`h-full flex-1 transition-colors ${pwdStrength.score >= 1 ? pwdStrength.colorClass : 'bg-transparent'}`} />
                        <div className={`h-full flex-1 transition-colors ${pwdStrength.score >= 2 ? pwdStrength.colorClass : 'bg-transparent'}`} />
                        <div className={`h-full flex-1 transition-colors ${pwdStrength.score >= 3 ? pwdStrength.colorClass : 'bg-transparent'}`} />
                        <div className={`h-full flex-1 transition-colors ${pwdStrength.score >= 4 ? pwdStrength.colorClass : 'bg-transparent'}`} />
                      </div>
                      <span className="text-[11px] font-medium text-neutral-500 whitespace-nowrap">
                        {pwdStrength.label}
                      </span>
                    </div>
                  )}
                  <p className="text-[11px] text-neutral-500">
                    The file payload is encrypted with AES-256 using this key.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-neutral-600" />
                    <span>Display Title</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Master Release Bundle 2026"
                    disabled={uploadState?.isUploading}
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent"
                  />
                  <p className="text-[11px] text-neutral-500">
                    Shown on the password prompt screen and embed widget.
                  </p>
                </div>
              </div>

              {/* Readme & Expiry */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span>Instructions / Readme Note</span>
                    <span className="text-neutral-400 font-normal">(Optional)</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Special instructions or archive description..."
                    rows={3}
                    disabled={uploadState?.isUploading}
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-neutral-600" />
                    <span>Link Expiration</span>
                  </label>
                  <select
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(Number(e.target.value))}
                    disabled={uploadState?.isUploading}
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded-lg text-sm text-neutral-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent cursor-pointer"
                  >
                    <option value={0}>Never expires (Permanent until deleted)</option>
                    <option value={1}>Expires in 24 hours</option>
                    <option value={7}>Expires in 7 days</option>
                    <option value={30}>Expires in 30 days</option>
                  </select>
                  <p className="text-[11px] text-neutral-500">
                    After expiration, links lock and data cannot be decrypted.
                  </p>
                </div>
              </div>

              {errorMessage && (
                <div className="flex items-start gap-2.5 p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-2 flex items-center justify-between border-t border-neutral-200">
                <div className="text-xs text-neutral-500 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Generates {domain} link & iframe code</span>
                </div>

                <button
                  type="submit"
                  disabled={!selectedFile || uploadState?.isUploading || !password}
                  className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white rounded-lg transition-all cursor-pointer whitespace-nowrap shadow-xs ${
                    !selectedFile || uploadState?.isUploading || !password
                      ? 'bg-neutral-300 cursor-not-allowed opacity-70'
                      : 'bg-neutral-900 hover:bg-neutral-800 active:scale-[0.99]'
                  }`}
                >
                  <span>{uploadState?.isUploading ? 'Encrypting & Uploading...' : 'Upload & Generate Share Link'}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: GitHub Releases Grabber (Bypasses GitHub 25MB commit limit with free 2GB+ Releases) */}
          {sourceMode === 'github' && (
            <div className="space-y-6">
              {/* Explanatory callouts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950">
                  <div className="font-bold text-amber-900 flex items-center gap-1.5 mb-1">
                    <Upload className="w-3.5 h-3.5 text-amber-700" />
                    <span>Have the file on your computer?</span>
                  </div>
                  <p className="leading-relaxed text-[11px] text-amber-900/90">
                    You do <strong>not</strong> need GitHub! Switch to <strong>Tab 1: Single File / Zip (Up to 1GB)</strong> above to upload your file straight from your computer. It handles chunked streaming, AES-256 encryption, and instant share links with zero setup.
                  </p>
                </div>

                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-950">
                  <div className="font-bold text-emerald-900 flex items-center gap-1.5 mb-1">
                    <CloudLightning className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Want free GitHub permanent hosting?</span>
                  </div>
                  <p className="leading-relaxed text-[11px] text-emerald-900/90">
                    GitHub does not auto-generate releases. Create one at <code className="bg-white/80 px-1 py-0.2 rounded font-mono">github.com/owner/repo/releases/new</code>, attach your archive or binary asset, and publish! Then enter the repo or direct URL below.
                  </p>
                </div>
              </div>

              {/* Informational banner explaining 25MB repo limit vs Unlimited Releases */}
              <div className="p-4 bg-neutral-900 text-white rounded-xl flex items-start gap-3">
                <Github className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed space-y-1">
                  <div className="font-bold text-sm text-white flex items-center gap-2">
                    <span>GitHub Releases vs Git Commits</span>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                      Zero Vercel Storage Cost
                    </span>
                  </div>
                  <p className="text-neutral-300 text-[11px]">
                    Git commits block files over 25MB. But <strong>GitHub Releases allow unlimited files up to 2GB+ each</strong>. You can paste a repository name (e.g. <code className="text-emerald-300 font-mono">owner/repository</code>) or a direct release download URL (e.g. <code className="text-emerald-300 font-mono">https://github.com/owner/repo/releases/download/v1.0.0/release.zip</code>).
                  </p>
                </div>
              </div>

              {/* Target File Pattern Filters */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-neutral-500 font-semibold">Quick Filters:</span>
                <button
                  type="button"
                  onClick={() => setTargetPattern('TARGET.zip')}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer font-mono ${targetPattern === 'TARGET.zip' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'}`}
                >
                  TARGET.zip
                </button>
                <button
                  type="button"
                  onClick={() => setTargetPattern('*.zip')}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer font-mono ${targetPattern === '*.zip' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'}`}
                >
                  *.zip
                </button>
                <button
                  type="button"
                  onClick={() => setTargetPattern('TARGET.7z')}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer font-mono ${targetPattern === 'TARGET.7z' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'}`}
                >
                  TARGET.7z
                </button>
                <button
                  type="button"
                  onClick={() => setTargetPattern('*.tar.gz')}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer font-mono ${targetPattern === '*.tar.gz' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'}`}
                >
                  *.tar.gz
                </button>
                <button
                  type="button"
                  onClick={() => setTargetPattern('*')}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer font-mono ${targetPattern === '*' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'}`}
                >
                  All Assets (*)
                </button>
              </div>

              {/* Search Form */}
              <form onSubmit={handleScanGithub} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-5 space-y-1.5">
                    <label className="text-xs font-bold text-neutral-800 uppercase tracking-wider flex items-center justify-between">
                      <span>GitHub Repository or Release URL</span>
                    </label>
                    <input
                      type="text"
                      value={githubRepoUrl}
                      onChange={(e) => setGithubRepoUrl(e.target.value)}
                      placeholder="e.g. owner/repo or https://github.com/..."
                      required
                      className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900 font-mono"
                    />
                  </div>

                  <div className="md:col-span-3 space-y-1.5">
                    <label className="text-xs font-bold text-neutral-800 uppercase tracking-wider">
                      Target File
                    </label>
                    <input
                      type="text"
                      value={targetPattern}
                      onChange={(e) => setTargetPattern(e.target.value)}
                      placeholder="TARGET.zip"
                      required
                      className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900 font-mono"
                    />
                  </div>

                  <div className="md:col-span-4 space-y-1.5">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs font-bold text-neutral-800 uppercase tracking-wider">
                          GitHub Token
                        </label>
                        {isTokenSavedInCookie && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300">
                            <Cookie className="w-2.5 h-2.5 text-emerald-700" />
                            <span>Saved in Cookie</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {(githubToken || isTokenSavedInCookie) && (
                          <>
                            <button
                              type="button"
                              onClick={handleDownloadTokenFile}
                              title="Download PAT from cookie as a text file backup"
                              className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <Download className="w-3 h-3 text-emerald-600" />
                              <span>Download PAT</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleClearSavedToken}
                              title="Clear token and wipe cookie from this device"
                              className="text-[11px] font-medium text-neutral-500 hover:text-rose-600 flex items-center gap-0.5 cursor-pointer px-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Clear</span>
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowPrivateGuide(!showPrivateGuide)}
                          className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                        >
                          <ShieldCheck className="w-3 h-3" />
                          <span>{showPrivateGuide ? 'Hide Guide' : 'Private Repo?'}</span>
                        </button>
                      </div>
                    </div>
                    <input
                      type="password"
                      value={githubToken}
                      onChange={handleTokenChange}
                      placeholder="github_pat_... or ghp_..."
                      className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900 font-mono"
                    />

                    {/* Cookie storage toggle & download button */}
                    <div className="flex items-center justify-between pt-0.5">
                      <label className="flex items-center gap-1.5 text-[11px] text-neutral-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={rememberTokenInCookie}
                          onChange={(e) => handleToggleRememberToken(e.target.checked)}
                          className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-neutral-300 cursor-pointer"
                        />
                        <span>Save token in this device's cookie</span>
                      </label>
                      {cookieNotification && (
                        <span className="text-[10px] text-emerald-700 font-medium">
                          {cookieNotification}
                        </span>
                      )}
                    </div>

                    <div className="pt-1 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={handleDownloadTokenFile}
                        disabled={!githubToken.trim() && !isTokenSavedInCookie}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white font-medium text-xs shadow-xs transition-colors cursor-pointer disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Download Cookie / PAT Backup (.txt)</span>
                      </button>
                    </div>

                    <div className="flex items-start gap-1.5 p-2 bg-emerald-50/70 border border-emerald-200/70 rounded-md text-[11px] text-emerald-900 leading-tight">
                      <HardDrive className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                      <span>
                        <strong>Device-only privacy:</strong> Saved in your browser's <code className="bg-white/80 px-1 py-0.2 rounded font-mono text-emerald-800">SameSite=Strict</code> cookie. Click "Download Cookie / PAT" to save an offline backup on your computer.
                      </span>
                    </div>
                  </div>
                </div>

                {showPrivateGuide && (
                  <div className="p-4 bg-neutral-900 text-white rounded-xl space-y-3.5 text-xs leading-relaxed border border-neutral-800 animate-fadeIn">
                    <div className="flex items-center justify-between font-bold text-sm text-white">
                      <span className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-emerald-400" />
                        <span>Using a Private GitHub Repository (All Current & Future Repos)</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowPrivateGuide(false)}
                        className="text-neutral-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-neutral-300 text-[11px]">
                      If you couldn't find "Contents", that means you are on the standard <strong>Tokens (classic)</strong> page! On Classic tokens, there is no "Contents" checkbox — the single permission to check is simply <strong><code className="text-emerald-300 font-mono bg-neutral-800 px-1.5 py-0.5 rounded">repo</code></strong>, which automatically grants access to <strong>all current and future repositories</strong>.
                    </p>

                    <div className="p-3 bg-neutral-800/80 rounded-lg border border-neutral-700/80 space-y-2">
                      <div className="text-emerald-400 font-bold text-xs flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Method 1: Tokens (classic) — 1-Click for ALL Repos (Recommended)</span>
                      </div>
                      <ol className="list-decimal list-inside space-y-1.5 text-neutral-200 text-[11px]">
                        <li>
                          Open GitHub's token generator directly: <a href="https://github.com/settings/tokens/new?scopes=repo&description=VaultDrop" target="_blank" rel="noopener noreferrer" className="text-emerald-300 underline font-mono break-all hover:text-emerald-200">github.com/settings/tokens/new?scopes=repo</a>
                        </li>
                        <li>
                          Make sure the single checkbox named <strong className="text-emerald-400">repo</strong> (Full control of private repositories) is checked.
                        </li>
                        <li>
                          Click <strong>Generate token</strong> at the bottom.
                        </li>
                        <li>
                          Copy your token (starts with <code className="text-neutral-300 font-mono">ghp_...</code>) and paste it into the <strong>GitHub Token</strong> box above.
                        </li>
                      </ol>
                      <p className="text-[10px] text-neutral-400">
                        This token will automatically grant access to your private repository and <strong>any future private repo</strong> you create.
                      </p>
                    </div>

                    <div className="p-2.5 bg-neutral-800/40 rounded-lg border border-neutral-700/50 space-y-1 text-neutral-300 text-[11px]">
                      <div className="font-semibold text-neutral-200 text-xs">
                        Method 2: If using Fine-Grained Tokens instead
                      </div>
                      <p>
                        Under <strong>Repository access</strong>, choose <strong>"All repositories"</strong> (grants access to current & future repos). Under <strong>Repository permissions</strong>, expand the list and set <strong>Contents</strong> to <strong className="text-emerald-400">Read-only</strong>.
                      </p>
                    </div>

                    <p className="text-[11px] text-neutral-400">
                      VaultDrop encrypts your token using your download password via AES-256 before generating the share link. Visitors only receive access when they enter the correct password.
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-neutral-500">
                    Scans GitHub Releases for attached 2GB+ binaries.
                  </span>

                  <button
                    type="submit"
                    disabled={isScanningGithub || !githubRepoUrl.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:bg-neutral-300 shadow-xs"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>{isScanningGithub ? 'Scanning Releases...' : 'Scan GitHub Releases'}</span>
                  </button>
                </div>
              </form>

              {githubScanError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">No release files found</div>
                    <div className="mt-0.5">{githubScanError}</div>
                  </div>
                </div>
              )}

              {/* Discovered GitHub Assets */}
              {githubMatches.length > 0 && (
                <div className="border border-neutral-200 rounded-xl p-5 bg-neutral-50 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                      Discovered Release Assets ({githubMatches.length})
                    </span>
                    <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Free Unlimited CDN Hosting
                    </span>
                  </div>

                  <div className="space-y-2">
                    {githubMatches.map((asset, idx) => {
                      const isTarget = asset.name.toLowerCase().startsWith('target');
                      return (
                        <div
                          key={idx}
                          onClick={() => {
                            setSelectedGithubAsset(asset);
                            if (!title) setTitle(asset.name.replace(/\.[^/.]+$/, ''));
                          }}
                          className={`p-3.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                            selectedGithubAsset?.downloadUrl === asset.downloadUrl
                              ? 'bg-white border-neutral-900 shadow-xs ring-1 ring-neutral-900'
                              : 'bg-white/70 border-neutral-200 hover:bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-lg bg-neutral-900 text-white flex items-center justify-center shrink-0">
                              <FileArchive className="w-5 h-5 text-emerald-400" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-neutral-900 flex items-center gap-2 truncate">
                                <span>{asset.name}</span>
                                {isTarget && (
                                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded font-sans shrink-0">
                                    Target Match
                                  </span>
                                )}
                                {asset.releaseTag && (
                                  <span className="text-[10px] text-neutral-600 font-mono bg-neutral-100 px-1.5 py-0.2 rounded shrink-0">
                                    {asset.releaseTag}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-neutral-900 bg-neutral-200/90 px-2 py-0.5 rounded">
                                  📦 {formatBytes(asset.size)}
                                </span>
                                <span className="text-[11px] text-neutral-500 font-mono">
                                  ({asset.size.toLocaleString()} bytes)
                                </span>
                                <span className="text-neutral-400">·</span>
                                <span className="text-[11px] text-neutral-500">Direct GitHub Release</span>
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0 ml-3 flex items-center gap-2">
                            <span className="hidden sm:inline-block font-mono text-xs font-bold text-neutral-900 bg-white border border-neutral-200 px-2 py-1 rounded shadow-2xs">
                              {formatBytes(asset.size)}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRefreshAssetSize(asset);
                              }}
                              title="Refresh size from GitHub (bypass cache)"
                              className="p-1 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-200/60 rounded cursor-pointer transition-colors"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingSize && selectedGithubAsset?.downloadUrl === asset.downloadUrl ? 'animate-spin text-emerald-600' : ''}`} />
                            </button>
                            {selectedGithubAsset?.downloadUrl === asset.downloadUrl ? (
                              <div className="w-6 h-6 rounded-full bg-neutral-900 text-white flex items-center justify-center">
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                              </div>
                            ) : (
                              <div className="w-6 h-6 rounded-full border border-neutral-300" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Password & Security Configuration for GitHub File */}
                  {selectedGithubAsset && (
                    <form onSubmit={handleImportGithub} className="pt-4 border-t border-neutral-200 space-y-5">
                      {/* 0-byte Warning Box if GitHub returns cached/empty size */}
                      {selectedGithubAsset.size === 0 && (
                        <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 space-y-2.5">
                          <div className="flex items-start gap-2.5">
                            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <div className="font-bold text-amber-900">
                                GitHub API Cached / Reported 0 MB for this Release Asset
                              </div>
                              <p className="text-[11px] text-amber-800 leading-relaxed mt-0.5">
                                If you recently attached or updated this asset in GitHub Releases, or if it is in a private repo, GitHub's API metadata may take a moment to report the updated byte size.
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-amber-200/80">
                            <button
                              type="button"
                              onClick={() => handleRefreshAssetSize(selectedGithubAsset)}
                              disabled={isRefreshingSize}
                              className="px-3 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60 transition-colors shadow-2xs"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingSize ? 'animate-spin' : ''}`} />
                              <span>{isRefreshingSize ? 'Querying GitHub...' : 'Refresh Size from GitHub'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsEditingSize(!isEditingSize)}
                              className="px-2.5 py-1.5 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>{isEditingSize ? 'Close Custom Size' : 'Set Custom Size'}</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Manual Size Editor Modal/Drawer */}
                      {isEditingSize && (
                        <div className="p-3 bg-neutral-100 border border-neutral-300 rounded-xl space-y-2 text-xs">
                          <div className="font-bold text-neutral-900 flex items-center justify-between">
                            <span>Specify File Size Manually</span>
                            <button
                              type="button"
                              onClick={() => setIsEditingSize(false)}
                              className="text-neutral-500 hover:text-neutral-900 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="1"
                              max="2048"
                              value={customSizeMb}
                              onChange={(e) => setCustomSizeMb(e.target.value)}
                              placeholder="e.g. 50"
                              className="w-28 px-2.5 py-1.5 bg-white border border-neutral-300 rounded text-xs font-mono"
                            />
                            <span className="font-semibold text-neutral-600">MB</span>
                            <button
                              type="button"
                              onClick={() => handleApplyCustomSize(Number(customSizeMb))}
                              className="px-3 py-1.5 bg-neutral-900 text-white rounded text-xs font-bold hover:bg-neutral-800 cursor-pointer"
                            >
                              Apply
                            </button>
                            <div className="flex items-center gap-1 ml-auto">
                              <button
                                type="button"
                                onClick={() => handleApplyCustomSize(50)}
                                className="px-2 py-1 bg-white border border-neutral-200 rounded text-[11px] font-mono hover:bg-neutral-50 cursor-pointer"
                              >
                                50MB
                              </button>
                              <button
                                type="button"
                                onClick={() => handleApplyCustomSize(100)}
                                className="px-2 py-1 bg-white border border-neutral-200 rounded text-[11px] font-mono hover:bg-neutral-50 cursor-pointer"
                              >
                                100MB
                              </button>
                              <button
                                type="button"
                                onClick={() => handleApplyCustomSize(250)}
                                className="px-2 py-1 bg-white border border-neutral-200 rounded text-[11px] font-mono hover:bg-neutral-50 cursor-pointer"
                              >
                                250MB
                              </button>
                              <button
                                type="button"
                                onClick={() => handleApplyCustomSize(1024)}
                                className="px-2 py-1 bg-white border border-neutral-200 rounded text-[11px] font-mono hover:bg-neutral-50 cursor-pointer"
                              >
                                1GB
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Prominent Selected Asset & File Size Banner */}
                      <div className="p-4 bg-emerald-50/80 border border-emerald-300 rounded-xl flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 rounded-lg bg-neutral-900 text-white flex items-center justify-center shrink-0">
                            <FileArchive className="w-5 h-5 text-emerald-400" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-neutral-900 truncate">
                              {selectedGithubAsset.name}
                            </div>
                            <div className="text-xs text-neutral-600 font-mono">
                              Release: {selectedGithubAsset.releaseTag || 'Release Asset'} · Zero Storage Fees
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider flex items-center justify-end gap-1">
                              <span>Verified File Size</span>
                            </div>
                            <div className={`text-lg font-extrabold font-mono ${selectedGithubAsset.size === 0 ? 'text-amber-800' : 'text-neutral-900'}`}>
                              {formatBytes(selectedGithubAsset.size)}
                            </div>
                            <div className="text-[11px] text-neutral-500 font-mono">
                              {selectedGithubAsset.size.toLocaleString()} bytes
                            </div>
                          </div>

                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => handleRefreshAssetSize(selectedGithubAsset)}
                              disabled={isRefreshingSize}
                              title="Re-probe GitHub to verify updated file size"
                              className="p-1.5 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-md text-neutral-700 hover:text-neutral-900 cursor-pointer transition-colors shadow-2xs"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingSize ? 'animate-spin text-emerald-600' : ''}`} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsEditingSize(!isEditingSize)}
                              title="Edit size manually"
                              className="p-1.5 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-md text-neutral-700 hover:text-neutral-900 cursor-pointer transition-colors shadow-2xs"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
                              <Lock className="w-3.5 h-3.5 text-neutral-600" />
                              <span>Recipient Download Password</span>
                              <span className="text-rose-500">*</span>
                            </label>
                            <button
                              type="button"
                              onClick={handleGeneratePassword}
                              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>Generate Strong</span>
                            </button>
                          </div>

                          <div className="relative">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="Set access password..."
                              required
                              className="w-full px-3.5 py-2.5 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 font-mono pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-2.5 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                            >
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-neutral-600" />
                            <span>Display Title</span>
                          </label>
                          <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Master Release Kit"
                            className="w-full px-3.5 py-2.5 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-neutral-800 uppercase tracking-wider">
                            Readme Note (Optional)
                          </label>
                          <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Instructions for recipient..."
                            rows={2}
                            className="w-full px-3.5 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 resize-none"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-neutral-800 uppercase tracking-wider">
                            Link Expiration
                          </label>
                          <select
                            value={expiryDays}
                            onChange={(e) => setExpiryDays(Number(e.target.value))}
                            className="w-full px-3.5 py-2.5 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900 cursor-pointer"
                          >
                            <option value={0}>Never expires</option>
                            <option value={1}>Expires in 24 hours</option>
                            <option value={7}>Expires in 7 days</option>
                            <option value={30}>Expires in 30 days</option>
                          </select>
                        </div>
                      </div>

                      {errorMessage && (
                        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          <span>{errorMessage}</span>
                        </div>
                      )}

                      <div className="pt-2 flex items-center justify-between border-t border-neutral-200">
                        <div className="text-xs text-neutral-500">
                          Zero storage fee · Streams directly from GitHub CDN
                        </div>

                        <button
                          type="submit"
                          disabled={githubImporting || !password.trim()}
                          className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white rounded-lg transition-all cursor-pointer whitespace-nowrap shadow-xs ${
                            githubImporting || !password.trim()
                              ? 'bg-neutral-300 cursor-not-allowed opacity-70'
                              : 'bg-neutral-900 hover:bg-neutral-800 active:scale-[0.99]'
                          }`}
                        >
                          <span>{githubImporting ? 'Linking GitHub Asset...' : 'Generate q.vopple.uk Link & Embed'}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

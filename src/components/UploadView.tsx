import React, { useState, useRef } from 'react';
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
  const [isScanningGithub, setIsScanningGithub] = useState(false);
  const [githubMatches, setGithubMatches] = useState<GitHubMatchedAsset[]>([]);
  const [selectedGithubAsset, setSelectedGithubAsset] = useState<GitHubMatchedAsset | null>(null);
  const [githubScanError, setGithubScanError] = useState<string | null>(null);
  const [githubImporting, setGithubImporting] = useState(false);

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

  const handleGeneratePassword = () => {
    const generated = generateRandomPassword(14);
    setPassword(generated);
    setShowPassword(true);
  };

  // Scan GitHub repo for TARGET.zip / TARGET.7z / compressed files
  const handleScanGithub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubRepoUrl.trim()) {
      setGithubScanError('Please enter a GitHub repository URL or owner/repo.');
      return;
    }

    setIsScanningGithub(true);
    setGithubScanError(null);
    setSelectedGithubAsset(null);
    setGithubMatches([]);

    try {
      const res = await fetch('/api/github/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl: githubRepoUrl.trim(),
          targetFilename: targetPattern.trim(),
          token: githubToken.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to scan repository.');
      }

      if (!data.matches || data.matches.length === 0) {
        setGithubScanError(
          `No files matching "${targetPattern}" were found in ${data.owner}/${data.repo} releases or repository contents. Try uploading a release asset named "${targetPattern}" on GitHub or check the filename.`
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

    setGithubImporting(true);
    setErrorMessage(null);

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
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to import file from GitHub.');
      }

      onUploadSuccess(data.share, password.trim());
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

              {/* Selected File Card */}
              {selectedFile && !uploadState?.isUploading && (
                <div className="flex items-center justify-between p-4 bg-neutral-50 border border-neutral-200 rounded-lg">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-10 h-10 rounded-lg bg-white border border-neutral-200 flex items-center justify-center shrink-0">
                      <FileArchive className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-neutral-900 truncate">
                        {selectedFile.name}
                      </div>
                      <div className="text-xs text-neutral-500 flex items-center gap-2 font-mono tabular-nums">
                        <span>{formatBytes(selectedFile.size)}</span>
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
                    className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60 rounded-md transition-colors cursor-pointer"
                    title="Remove file"
                  >
                    <X className="w-4 h-4" />
                  </button>
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

          {/* TAB 3: GitHub Repo Importer (Zero Hosting Cost Mode for TARGET.zip / TARGET.7z) */}
          {sourceMode === 'github' && (
            <div className="space-y-6">
              {/* Informational banner about zero hosting costs */}
              <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-start gap-3">
                <CloudLightning className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-900 leading-relaxed">
                  <span className="font-bold">Zero File Hosting Costs: </span>
                  GitHub Releases allow uploading files up to 2GB for free. Enter your repository below and VaultDrop will automatically grab <code className="bg-white/80 px-1 py-0.5 rounded font-mono text-emerald-950 font-bold">{targetPattern}</code> (or any TARGET.7z / TARGET.* archive), wrapping it with a password gate, custom <code className="bg-white/80 px-1 py-0.5 rounded font-mono text-emerald-950 font-bold">{domain}</code> link, and embed code without incurring server storage fees!
                </div>
              </div>

              {/* Search Form */}
              <form onSubmit={handleScanGithub} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-6 space-y-1.5">
                    <label className="text-xs font-bold text-neutral-800 uppercase tracking-wider">
                      GitHub Repository URL or "owner/repo"
                    </label>
                    <input
                      type="text"
                      value={githubRepoUrl}
                      onChange={(e) => setGithubRepoUrl(e.target.value)}
                      placeholder="e.g. the-vopple/my-portfolio or https://github.com/..."
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

                  <div className="md:col-span-3 space-y-1.5">
                    <label className="text-xs font-bold text-neutral-800 uppercase tracking-wider">
                      GitHub Token <span className="text-neutral-400 font-normal">(Optional)</span>
                    </label>
                    <input
                      type="password"
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                      placeholder="ghp_... for private repos"
                      className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900 font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isScanningGithub || !githubRepoUrl.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:bg-neutral-300 shadow-xs"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>{isScanningGithub ? 'Scanning Releases & Files...' : 'Scan Repository for Target File'}</span>
                  </button>
                </div>
              </form>

              {githubScanError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{githubScanError}</span>
                </div>
              )}

              {/* Discovered GitHub Assets */}
              {githubMatches.length > 0 && (
                <div className="border border-neutral-200 rounded-xl p-5 bg-neutral-50 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                      Discovered Files on GitHub ({githubMatches.length})
                    </span>
                    <span className="text-[11px] text-emerald-700 font-semibold">
                      Direct CDN Streaming Ready
                    </span>
                  </div>

                  <div className="space-y-2">
                    {githubMatches.map((asset, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          setSelectedGithubAsset(asset);
                          if (!title) setTitle(asset.name.replace(/\.[^/.]+$/, ''));
                        }}
                        className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                          selectedGithubAsset?.downloadUrl === asset.downloadUrl
                            ? 'bg-white border-neutral-900 shadow-xs'
                            : 'bg-white/60 border-neutral-200 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center shrink-0">
                            <FileArchive className="w-4 h-4 text-emerald-400" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-neutral-900 flex items-center gap-2">
                              <span>{asset.name}</span>
                              {asset.releaseTag && (
                                <span className="text-[10px] text-neutral-500 font-mono bg-neutral-100 px-1.5 py-0.5 rounded">
                                  {asset.releaseTag}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-neutral-500 font-mono tabular-nums">
                              {formatBytes(asset.size)} · {asset.source === 'release' ? 'GitHub Release Asset' : 'Repo Tree File'}
                            </div>
                          </div>
                        </div>

                        <div>
                          {selectedGithubAsset?.downloadUrl === asset.downloadUrl ? (
                            <div className="w-6 h-6 rounded-full bg-neutral-900 text-white flex items-center justify-center">
                              <Check className="w-3.5 h-3.5" />
                            </div>
                          ) : (
                            <div className="w-6 h-6 rounded-full border border-neutral-300" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Password & Security Configuration for GitHub File */}
                  {selectedGithubAsset && (
                    <form onSubmit={handleImportGithub} className="pt-4 border-t border-neutral-200 space-y-5">
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

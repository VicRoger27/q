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
} from 'lucide-react';
import { UploadState, ShareItem } from '../types';
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
  const [mode, setMode] = useState<'file' | 'folder'>('file');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [folderFilesCount, setFolderFilesCount] = useState<number>(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [expiryDays, setExpiryDays] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);

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
      // Determine folder name from first file
      const relPath = (files[0] as any).webkitRelativePath || '';
      const folderName = relPath.split('/')[0] || 'Archive_Folder';
      if (!title) {
        setTitle(folderName);
      }

      setZippingProgress(0);
      try {
        const zipped = await zipFolderFiles(files, (p) => setZippingProgress(p));
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
      setSelectedFile(file);
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
      setErrorMessage(null);
    }
  };

  const handleGeneratePassword = () => {
    const generated = generateRandomPassword(12);
    setPassword(generated);
    setShowPassword(true);
  };

  const handleStartUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMessage('Please choose a file or folder archive to upload.');
      return;
    }
    if (!password.trim()) {
      setErrorMessage('A password is required to secure the file download gate.');
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
        isFolder: mode === 'folder' || selectedFile.name.endsWith('.zip'),
        onProgress: (state) => {
          setUploadState(state);
        },
        signal: abortController.signal,
      });

      // Clear state and notify parent
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
          <span>Chunked Upload Engine</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 text-balance">
          Distribute 500MB+ Files & Folders Behind a Secure Password Gate
        </h1>
        <p className="mt-2 text-sm sm:text-base text-neutral-600 max-w-2xl leading-relaxed">
          Upload large archives, documents, or zips. Recipient enters your chosen password to unlock and download directly. Embed seamlessly as an iframe into <code className="text-neutral-800 bg-neutral-100 px-1.5 py-0.5 rounded text-xs font-mono">{domain}</code> or any personal site.
        </p>
      </div>

      {/* Main Upload Box */}
      <form onSubmit={handleStartUpload} className="bg-white border border-neutral-200 rounded-xl shadow-xs overflow-hidden">
        {/* Source Mode Tabs */}
        <div className="flex border-b border-neutral-200 bg-neutral-50/60 p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => {
              setMode('file');
              setSelectedFile(null);
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              mode === 'file'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <FileArchive className="w-4 h-4 text-emerald-600" />
            <span>Single File or Zip (up to 500MB+)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('folder');
              setSelectedFile(null);
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              mode === 'folder'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <FolderArchive className="w-4 h-4 text-emerald-600" />
            <span>Entire Folder (Auto-Compress to Zip)</span>
          </button>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {/* File Picker Drag & Drop Zone */}
          {!selectedFile && !zippingProgress && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => {
                if (mode === 'file') {
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
                // @ts-ignore: webkitdirectory attribute is standard for directory selection
                webkitdirectory="true"
                // @ts-ignore
                directory="true"
                multiple
                className="hidden"
                onChange={handleFolderSelect}
              />

              <div className="w-14 h-14 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-4 text-neutral-700">
                {mode === 'file' ? (
                  <Upload className="w-7 h-7 text-neutral-900" />
                ) : (
                  <FolderArchive className="w-7 h-7 text-neutral-900" />
                )}
              </div>

              <div className="text-base font-semibold text-neutral-900 mb-1">
                {mode === 'file'
                  ? 'Click to select or drop a 500MB file here'
                  : 'Click to select an entire folder'}
              </div>
              <p className="text-xs text-neutral-500 max-w-md mx-auto leading-relaxed">
                Supports .zip, .tar, .mp4, .pdf, .iso, .dmg, or any large data file. Files are automatically chunked in 5MB slices for seamless proxy traversal.
              </p>
              <div className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-3 py-1.5 rounded-md">
                <span>Maximum tested payload: 500 MB+</span>
              </div>
            </div>
          )}

          {/* Folder zipping state */}
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
                    <span>Ready to upload</span>
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
                    <span>Uploading in 5MB Chunks...</span>
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

          {/* Form Fields: Password & Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Password Configuration (Required) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-neutral-600" />
                  <span>Download Password</span>
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
                  placeholder="Set recipient password"
                  required
                  disabled={uploadState?.isUploading}
                  className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Password strength meter */}
              {password && (
                <div className="flex items-center gap-2 pt-1">
                  <div className="flex-1 h-1.5 bg-neutral-200 rounded-full overflow-hidden flex gap-1">
                    <div
                      className={`h-full flex-1 transition-colors ${
                        pwdStrength.score >= 1 ? pwdStrength.colorClass : 'bg-transparent'
                      }`}
                    />
                    <div
                      className={`h-full flex-1 transition-colors ${
                        pwdStrength.score >= 2 ? pwdStrength.colorClass : 'bg-transparent'
                      }`}
                    />
                    <div
                      className={`h-full flex-1 transition-colors ${
                        pwdStrength.score >= 3 ? pwdStrength.colorClass : 'bg-transparent'
                      }`}
                    />
                    <div
                      className={`h-full flex-1 transition-colors ${
                        pwdStrength.score >= 4 ? pwdStrength.colorClass : 'bg-transparent'
                      }`}
                    />
                  </div>
                  <span className="text-[11px] font-medium text-neutral-500 whitespace-nowrap">
                    {pwdStrength.label}
                  </span>
                </div>
              )}
              <p className="text-[11px] text-neutral-500">
                Recipients must provide this password to view details and trigger the 500MB download.
              </p>
            </div>

            {/* Custom Title */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-neutral-600" />
                <span>Display Title</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Master Release Kit v2.0"
                disabled={uploadState?.isUploading}
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent"
              />
              <p className="text-[11px] text-neutral-500">
                Shown to the recipient on the password lock screen and iframe widget.
              </p>
            </div>
          </div>

          {/* Description & Expiry */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
                <span>Instructions / Readme Note</span>
                <span className="text-neutral-400 font-normal">(Optional)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add special extraction instructions, contents overview, or contact info..."
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
                After expiration, the password gate locks and file chunks are deactivated.
              </p>
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="flex items-start gap-2.5 p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Submit Action */}
          <div className="pt-2 flex items-center justify-between border-t border-neutral-200">
            <div className="text-xs text-neutral-500 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Generates clean {domain} share link & embed code</span>
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
              <span>{uploadState?.isUploading ? 'Uploading File...' : 'Upload & Generate Share Link'}</span>
              <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

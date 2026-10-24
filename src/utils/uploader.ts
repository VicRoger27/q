import JSZip from 'jszip';
import { UploadState, ShareItem } from '../types';

export const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per chunk for reliable proxy traversal

export interface UploadOptions {
  file: File;
  password: string;
  title?: string;
  description?: string;
  expiryDays?: number;
  isFolder?: boolean;
  onProgress: (state: UploadState) => void;
  signal?: AbortSignal;
}

export async function zipFolderFiles(
  fileList: FileList | File[],
  onProgress: (percent: number) => void
): Promise<File> {
  const zip = new JSZip();
  const filesArray = Array.from(fileList);

  // Extract root folder name
  let rootFolderName = 'Folder_Archive';
  if (filesArray.length > 0) {
    const relativePath = (filesArray[0] as any).webkitRelativePath || filesArray[0].name;
    const parts = relativePath.split('/');
    if (parts.length > 1) {
      rootFolderName = parts[0];
    }
  }

  for (let i = 0; i < filesArray.length; i++) {
    const file = filesArray[i];
    const path = (file as any).webkitRelativePath || file.name;
    zip.file(path, file);
    onProgress(Math.round(((i + 1) / filesArray.length) * 50));
  }

  const blob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    },
    (metadata) => {
      onProgress(50 + Math.round((metadata.percent / 100) * 50));
    }
  );

  return new File([blob], `${rootFolderName}.zip`, {
    type: 'application/zip',
  });
}

export async function uploadLargeFile(options: UploadOptions): Promise<ShareItem> {
  const { file, password, title, description, expiryDays, isFolder, onProgress, signal } = options;

  const totalBytes = file.size;
  const totalChunks = Math.max(1, Math.ceil(totalBytes / CHUNK_SIZE));

  let currentState: UploadState = {
    isUploading: true,
    progressPercent: 0,
    uploadedBytes: 0,
    totalBytes,
    currentChunk: 0,
    totalChunks,
    speedBytesPerSec: 0,
    etaSeconds: 0,
    error: null,
  };

  onProgress(currentState);

  // 1. Initialize upload session
  const initRes = await fetch('/api/upload/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      fileSize: totalBytes,
      fileType: file.type || 'application/octet-stream',
      password,
      title: title || file.name,
      description: description || '',
      expiryDays,
      isFolder: Boolean(isFolder),
      totalChunks,
    }),
    signal,
  });

  if (!initRes.ok) {
    const errData = await initRes.json().catch(() => ({}));
    throw new Error(errData.error || `Initialization failed (${initRes.status})`);
  }

  const { uploadId, shareId } = await initRes.json();

  const startTime = Date.now();
  let uploadedBytes = 0;

  // 2. Upload chunks sequentially with retry
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    if (signal?.aborted) {
      throw new Error('Upload cancelled by user.');
    }

    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(totalBytes, start + CHUNK_SIZE);
    const chunkBlob = file.slice(start, end);
    const chunkSize = end - start;

    let attempts = 0;
    const maxAttempts = 3;
    let chunkUploaded = false;

    while (attempts < maxAttempts && !chunkUploaded) {
      try {
        const chunkRes = await fetch('/api/upload/chunk', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Upload-Id': uploadId,
            'X-Chunk-Index': chunkIndex.toString(),
          },
          body: chunkBlob,
          signal,
        });

        if (!chunkRes.ok) {
          throw new Error(`Server returned HTTP ${chunkRes.status} for chunk ${chunkIndex}`);
        }

        chunkUploaded = true;
      } catch (err: any) {
        attempts++;
        if (signal?.aborted) throw err;
        if (attempts >= maxAttempts) {
          throw new Error(`Failed to upload chunk ${chunkIndex + 1}/${totalChunks} after ${maxAttempts} attempts: ${err.message}`);
        }
        // Brief backoff
        await new Promise((r) => setTimeout(r, 600 * attempts));
      }
    }

    uploadedBytes += chunkSize;
    const elapsedTimeSec = (Date.now() - startTime) / 1000;
    const speed = elapsedTimeSec > 0 ? uploadedBytes / elapsedTimeSec : 0;
    const remainingBytes = Math.max(0, totalBytes - uploadedBytes);
    const eta = speed > 0 ? remainingBytes / speed : 0;
    const percent = Math.min(99, Math.round((uploadedBytes / totalBytes) * 100));

    currentState = {
      isUploading: true,
      progressPercent: percent,
      uploadedBytes,
      totalBytes,
      currentChunk: chunkIndex + 1,
      totalChunks,
      speedBytesPerSec: speed,
      etaSeconds: eta,
      error: null,
    };
    onProgress(currentState);
  }

  // 3. Finalize upload (server merges chunks & calculates checksum)
  const completeRes = await fetch('/api/upload/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId, shareId }),
    signal,
  });

  if (!completeRes.ok) {
    const errData = await completeRes.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to finalize uploaded file.');
  }

  const { share } = await completeRes.json();

  onProgress({
    ...currentState,
    isUploading: false,
    progressPercent: 100,
    uploadedBytes: totalBytes,
    etaSeconds: 0,
  });

  return share;
}

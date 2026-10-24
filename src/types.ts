export interface ShareItem {
  id: string;
  filename: string;
  fileSize: number;
  fileType: string;
  title: string;
  description: string;
  createdAt: string;
  expiresAt: string | null;
  downloadCount: number;
  checksumSha256: string;
  isFolder: boolean;
  hasPassword?: boolean;
  isExpired?: boolean;
}

export interface UploadState {
  isUploading: boolean;
  progressPercent: number;
  uploadedBytes: number;
  totalBytes: number;
  currentChunk: number;
  totalChunks: number;
  speedBytesPerSec: number;
  etaSeconds: number;
  error: string | null;
  isZippingFolder?: boolean;
  zippingProgress?: number;
}

export interface EmbedOptions {
  domain: string;
  theme: 'light' | 'dark' | 'auto';
  width: string;
  height: number;
  borderRadius: number;
  border: boolean;
  shadow: boolean;
  compact: boolean;
}

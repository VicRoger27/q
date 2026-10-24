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
  checksumSha256?: string;
  isFolder: boolean;
  hasPassword?: boolean;
  isExpired?: boolean;
  isEncrypted?: boolean;
  sourceType?: 'local_encrypted' | 'github';
  githubRepo?: string;
  githubReleaseTag?: string;
  githubDownloadUrl?: string;
  githubAssetId?: number;
  githubAssetApiUrl?: string;
  githubToken?: string;
  isPrivateRepo?: boolean;
}

export interface GitHubMatchedAsset {
  id?: number;
  name: string;
  size: number;
  downloadUrl: string;
  apiUrl?: string;
  source: 'release' | 'contents';
  releaseTag?: string;
  releaseName?: string;
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

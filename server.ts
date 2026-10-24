import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const app = express();

// Ensure data directories exist
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const TEMP_DIR = path.join(DATA_DIR, 'temp');
const SHARES_FILE = path.join(DATA_DIR, 'shares.json');

[DATA_DIR, UPLOADS_DIR, TEMP_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

export interface ShareRecord {
  id: string;
  filename: string;
  fileSize: number;
  fileType: string;
  title: string;
  description: string;
  createdAt: string;
  expiresAt: string | null;
  passwordSalt: string;
  passwordHash: string;
  checksumSha256?: string;
  downloadCount: number;
  isFolder: boolean;
  totalChunks?: number;
  isEncrypted?: boolean;
  sourceType: 'local_encrypted' | 'github';
  githubDownloadUrl?: string;
  githubRepo?: string;
  githubReleaseTag?: string;
}

// In-memory rate limiting for password attempts: key = `${shareId}:${ip}` -> { count: number, lockedUntil: number }
const rateLimits = new Map<string, { count: number; lockedUntil: number }>();
const HMAC_SECRET = crypto.randomBytes(32).toString('hex');

// Load or initialize shares
function loadShares(): ShareRecord[] {
  try {
    if (!fs.existsSync(SHARES_FILE)) {
      // Seed a starter sample archive so embed & download preview works immediately
      const demoId = 'vopple-demo';
      const demoSalt = crypto.randomBytes(16).toString('hex');
      const demoHash = hashPassword('vopple2026', demoSalt);
      const demoDir = path.join(UPLOADS_DIR, demoId);
      if (!fs.existsSync(demoDir)) {
        fs.mkdirSync(demoDir, { recursive: true });
      }

      // Create an encrypted demo file
      const demoFile = path.join(demoDir, 'Portfolio_Master_Release_v1.0.zip.enc');
      const rawContent = Buffer.from(
        'PK\x05\x06\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00' +
        'Sample archive package ready for distribution via q.vopple.uk.\nProtected by VaultDrop AES-256 encrypted password gate.'
      );

      // Encrypt with demo password
      const encKey = deriveKey('vopple2026', demoSalt);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', encKey, iv);
      const encrypted = Buffer.concat([iv, cipher.update(rawContent), cipher.final()]);
      fs.writeFileSync(demoFile, encrypted);

      const initial: ShareRecord[] = [
        {
          id: demoId,
          filename: 'Portfolio_Master_Release_v1.0.zip',
          fileSize: 1048576 * 14.5,
          fileType: 'application/zip',
          title: 'Vopple Production Assets & Deployment Kit',
          description: 'Encrypted master archive containing release bundles and assets for q.vopple.uk.',
          createdAt: new Date().toISOString(),
          expiresAt: null,
          passwordSalt: demoSalt,
          passwordHash: demoHash,
          checksumSha256: crypto.createHash('sha256').update(rawContent).digest('hex'),
          downloadCount: 3,
          isFolder: true,
          isEncrypted: true,
          sourceType: 'local_encrypted',
        },
      ];
      fs.writeFileSync(SHARES_FILE, JSON.stringify(initial, null, 2));
      return initial;
    }
    const data = fs.readFileSync(SHARES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error loading shares:', err);
    return [];
  }
}

function saveShares(shares: ShareRecord[]) {
  try {
    fs.writeFileSync(SHARES_FILE, JSON.stringify(shares, null, 2));
  } catch (err) {
    console.error('Error saving shares:', err);
  }
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function deriveKey(password: string, salt: string): Buffer {
  return crypto.scryptSync(password, salt, 32);
}

function generateAccessToken(shareId: string): string {
  const expires = Date.now() + 2 * 60 * 60 * 1000; // 2 hours validity
  const payload = `${shareId}:${expires}`;
  const sig = crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

function verifyAccessToken(shareId: string, token: string): boolean {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf-8');
    const parts = raw.split(':');
    if (parts.length !== 3) return false;
    const [tShareId, tExpiresStr, tSig] = parts;
    if (tShareId !== shareId) return false;
    const expires = parseInt(tExpiresStr, 10);
    if (Date.now() > expires) return false;
    const expectedSig = crypto.createHmac('sha256', HMAC_SECRET).update(`${tShareId}:${tExpiresStr}`).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(tSig), Buffer.from(expectedSig));
  } catch {
    return false;
  }
}

// Parse GitHub repository shorthand, full URL, or direct release download URL
function parseGitHubRepo(input: string): { owner: string; repo: string; directAsset?: { tag: string; filename: string; directUrl: string } } | null {
  const cleaned = input.trim().replace(/\.git$/, '');

  // Direct release asset URL: https://github.com/owner/repo/releases/download/v1.0.0/TARGET.zip
  const directMatch = cleaned.match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\/releases\/download\/([^/]+)\/(.+)$/);
  if (directMatch) {
    return {
      owner: directMatch[1],
      repo: directMatch[2],
      directAsset: {
        tag: directMatch[3],
        filename: decodeURIComponent(directMatch[4]),
        directUrl: cleaned,
      },
    };
  }

  // Release tag URL: https://github.com/owner/repo/releases/tag/v1.0.0 or https://github.com/owner/repo/releases
  const repoUrlMatch = cleaned.match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
  if (repoUrlMatch) {
    return { owner: repoUrlMatch[1], repo: repoUrlMatch[2] };
  }

  // Shorthand owner/repo
  const shorthandMatch = cleaned.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (shorthandMatch) {
    return { owner: shorthandMatch[1], repo: shorthandMatch[2] };
  }
  return null;
}

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Raw body parser for binary upload chunks (supports chunks up to 25MB each)
app.use('/api/upload/chunk', express.raw({ type: 'application/octet-stream', limit: '25mb' }));

// Allow iframe embedding across all platforms (AI Studio preview, *.vopple.uk, etc.)
app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', "frame-ancestors *;");
  next();
});

// 5. GitHub Releases Scanner: specifically targets GitHub Releases (which allow unlimited/2GB+ file assets, bypassing the 25MB repo limit)
app.post('/api/github/scan', async (req, res) => {
  try {
    const { repoUrl, targetFilename, token } = req.body || {};

    if (!repoUrl) {
      return res.status(400).json({ error: 'GitHub repository or release URL is required.' });
    }

    const parsed = parseGitHubRepo(repoUrl);
    if (!parsed) {
      return res.status(400).json({ error: 'Invalid GitHub URL format. Use "owner/repo" or "https://github.com/owner/repo/releases".' });
    }

    const { owner, repo, directAsset } = parsed;

    // If user provided a direct release asset link: e.g. https://github.com/VicRoger27/proj1/releases/download/TARGET/zip.zip
    if (directAsset) {
      return res.json({
        success: true,
        owner,
        repo,
        targetSearched: directAsset.filename,
        count: 1,
        isDirectAsset: true,
        matches: [
          {
            name: directAsset.filename,
            size: 0,
            downloadUrl: directAsset.directUrl,
            source: 'release',
            releaseTag: directAsset.tag,
            releaseName: `Release Tag "${directAsset.tag}" (${directAsset.filename})`,
          },
        ],
      });
    }

    const headers: Record<string, string> = {
      'User-Agent': 'VaultDrop-ReleaseGrabber/2.0',
      'Accept': 'application/vnd.github.v3+json',
    };
    if (token && token.trim()) {
      headers['Authorization'] = `token ${token.trim()}`;
    }

    const targetPattern = (targetFilename?.trim() || 'TARGET').toLowerCase();

    // Query GitHub Releases endpoint
    const releasesRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, { headers });
    
    if (!releasesRes.ok) {
      const err = await releasesRes.json().catch(() => ({}));
      if (releasesRes.status === 404) {
        return res.status(404).json({
          error: `Repository "${owner}/${repo}" was not found or has no public releases. If it is a private repository, please paste your GitHub Personal Access Token in the token field.`,
        });
      }
      return res.status(releasesRes.status).json({
        error: err.message || `GitHub API returned HTTP ${releasesRes.status}`,
      });
    }

    const releases = await releasesRes.json();
    if (!Array.isArray(releases) || releases.length === 0) {
      return res.json({
        success: true,
        owner,
        repo,
        targetSearched: targetPattern,
        count: 0,
        matches: [],
        message: `No Releases found in ${owner}/${repo}. Create a release under github.com/${owner}/${repo}/releases and attach your zip file.`,
      });
    }

    const primaryMatches: any[] = [];
    const otherReleaseAssets: any[] = [];

    for (const rel of releases) {
      if (Array.isArray(rel.assets)) {
        for (const asset of rel.assets) {
          const name = asset.name;
          const nameLower = name.toLowerCase();

          const isExact = nameLower === targetPattern;
          const isTargetPrefix = nameLower.startsWith(targetPattern);
          const isTargetArchive = (targetPattern === 'target' || targetPattern === 'target.zip') &&
            /\.(zip|7z|tar\.gz|tgz|rar|gz|bz2|xz|iso|dmg)$/i.test(name);

          const assetObj = {
            name: asset.name,
            size: asset.size,
            downloadUrl: asset.browser_download_url,
            source: 'release',
            releaseTag: rel.tag_name,
            releaseName: rel.name || rel.tag_name,
            downloadCount: asset.download_count,
            publishedAt: rel.published_at,
          };

          if (isExact || isTargetPrefix || isTargetArchive) {
            primaryMatches.push(assetObj);
          } else {
            otherReleaseAssets.push(assetObj);
          }
        }
      }
    }

    const allMatches = [...primaryMatches, ...otherReleaseAssets];

    res.json({
      success: true,
      owner,
      repo,
      targetSearched: targetPattern,
      count: allMatches.length,
      primaryCount: primaryMatches.length,
      matches: allMatches,
    });
  } catch (err: any) {
    console.error('Error scanning GitHub releases:', err);
    res.status(500).json({ error: 'Failed to scan GitHub releases: ' + (err.message || 'Network error') });
  }
});

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Config endpoints for q.vopple.uk and cross-subdomain iframe embeds
const CONFIG_JSON_PATH = path.join(__dirname, 'config.json');
const CONFIG_YAML_PATH = path.join(__dirname, 'config.yaml');

app.get('/api/config', (req, res) => {
  try {
    let jsonConfig = {};
    let yamlConfig = '';
    if (fs.existsSync(CONFIG_JSON_PATH)) {
      jsonConfig = JSON.parse(fs.readFileSync(CONFIG_JSON_PATH, 'utf-8'));
    }
    if (fs.existsSync(CONFIG_YAML_PATH)) {
      yamlConfig = fs.readFileSync(CONFIG_YAML_PATH, 'utf-8');
    }
    res.json({
      config: jsonConfig,
      yaml: yamlConfig,
      subdomain: 'q.vopple.uk',
      backendHost: req.protocol + '://' + req.get('host'),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to read configuration.' });
  }
});

app.put('/api/config', (req, res) => {
  try {
    const { config, yaml } = req.body;
    if (config) {
      fs.writeFileSync(CONFIG_JSON_PATH, JSON.stringify(config, null, 2));
    }
    if (yaml) {
      fs.writeFileSync(CONFIG_YAML_PATH, yaml);
    }
    res.json({ success: true, message: 'Configuration saved.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to write configuration.' });
  }
});

// 2. Initialize chunked upload (supports files up to 1GB)
app.post('/api/upload/init', (req, res) => {
  try {
    const { filename, fileSize, fileType, password, title, description, expiryDays, isFolder, totalChunks } = req.body;

    if (!filename || !fileSize) {
      return res.status(400).json({ error: 'Filename and file size are required.' });
    }

    const numSize = Number(fileSize);
    if (numSize > 1024 * 1024 * 1024 * 1.05) { // 1GB + 5% tolerance
      return res.status(400).json({ error: 'File exceeds maximum supported upload limit of 1GB.' });
    }

    if (!password || password.trim().length === 0) {
      return res.status(400).json({ error: 'A password is required for encrypted file sharing.' });
    }

    const shareId = crypto.randomBytes(5).toString('hex');
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);

    const tempShareDir = path.join(TEMP_DIR, shareId);
    if (!fs.existsSync(tempShareDir)) {
      fs.mkdirSync(tempShareDir, { recursive: true });
    }

    let expiresAt: string | null = null;
    if (expiryDays && Number(expiryDays) > 0) {
      const exp = new Date();
      exp.setDate(exp.getDate() + Number(expiryDays));
      expiresAt = exp.toISOString();
    }

    const pendingMeta = {
      id: shareId,
      filename,
      fileSize: numSize,
      fileType: fileType || 'application/octet-stream',
      title: title?.trim() || filename,
      description: description?.trim() || '',
      createdAt: new Date().toISOString(),
      expiresAt,
      passwordSalt: salt,
      passwordHash: hash,
      rawPasswordForEncryption: password.trim(),
      isFolder: Boolean(isFolder),
      totalChunks: Number(totalChunks) || 1,
    };

    fs.writeFileSync(path.join(tempShareDir, 'meta.json'), JSON.stringify(pendingMeta));

    res.json({
      success: true,
      uploadId: shareId,
      shareId,
      message: 'Upload session initialized with AES-256 encryption at rest.',
    });
  } catch (err: any) {
    console.error('Error init upload:', err);
    res.status(500).json({ error: 'Failed to initialize upload.' });
  }
});

// 3. Ingest binary chunk
app.post('/api/upload/chunk', (req, res) => {
  try {
    const uploadId = req.headers['x-upload-id'] as string;
    const chunkIndex = parseInt(req.headers['x-chunk-index'] as string, 10);

    if (!uploadId || isNaN(chunkIndex)) {
      return res.status(400).json({ error: 'Missing x-upload-id or x-chunk-index headers.' });
    }

    const tempShareDir = path.join(TEMP_DIR, uploadId);
    if (!fs.existsSync(tempShareDir)) {
      return res.status(404).json({ error: 'Upload session not found or expired.' });
    }

    const chunkData = req.body as Buffer;
    if (!chunkData || chunkData.length === 0) {
      return res.status(400).json({ error: 'Chunk payload was empty.' });
    }

    const chunkFilePath = path.join(tempShareDir, `chunk_${chunkIndex}.part`);
    fs.writeFileSync(chunkFilePath, chunkData);

    res.json({
      success: true,
      chunkIndex,
      bytesReceived: chunkData.length,
    });
  } catch (err: any) {
    console.error('Error receiving chunk:', err);
    res.status(500).json({ error: 'Failed to write upload chunk.' });
  }
});

// 4. Complete upload: merge chunks, encrypt with AES-256-CBC at rest, compute SHA-256
app.post('/api/upload/complete', async (req, res) => {
  try {
    const { uploadId, shareId } = req.body;
    const targetId = shareId || uploadId;

    if (!targetId) {
      return res.status(400).json({ error: 'uploadId is required.' });
    }

    const tempShareDir = path.join(TEMP_DIR, targetId);
    const metaFile = path.join(tempShareDir, 'meta.json');

    if (!fs.existsSync(tempShareDir) || !fs.existsSync(metaFile)) {
      return res.status(404).json({ error: 'Upload session not found.' });
    }

    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
    const totalChunks = meta.totalChunks || 1;

    // Verify all chunk parts exist
    for (let i = 0; i < totalChunks; i++) {
      const partPath = path.join(tempShareDir, `chunk_${i}.part`);
      if (!fs.existsSync(partPath)) {
        return res.status(400).json({ error: `Missing chunk ${i} of ${totalChunks}. Please retry uploading that part.` });
      }
    }

    const finalDir = path.join(UPLOADS_DIR, targetId);
    if (!fs.existsSync(finalDir)) {
      fs.mkdirSync(finalDir, { recursive: true });
    }

    const safeFilename = path.basename(meta.filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const encryptedFilePath = path.join(finalDir, `${safeFilename}.enc`);

    // Setup AES-256 encryption stream
    const encKey = deriveKey(meta.rawPasswordForEncryption, meta.passwordSalt);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', encKey, iv);
    const hash = crypto.createHash('sha256');

    const writeStream = fs.createWriteStream(encryptedFilePath);
    // Write the 16-byte IV as file header
    writeStream.write(iv);

    // Stream each chunk into hash and cipher
    for (let i = 0; i < totalChunks; i++) {
      const partPath = path.join(tempShareDir, `chunk_${i}.part`);
      const buffer = fs.readFileSync(partPath);
      hash.update(buffer);
      const encryptedChunk = cipher.update(buffer);
      if (encryptedChunk.length > 0) {
        writeStream.write(encryptedChunk);
      }
    }

    const finalBlock = cipher.final();
    if (finalBlock.length > 0) {
      writeStream.write(finalBlock);
    }

    await new Promise((resolve, reject) => {
      writeStream.end(resolve);
      writeStream.on('error', reject);
    });

    const checksumSha256 = hash.digest('hex');

    // Clean up temporary chunks
    try {
      fs.rmSync(tempShareDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('Could not clean temp chunk dir:', e);
    }

    const newShare: ShareRecord = {
      id: targetId,
      filename: safeFilename,
      fileSize: meta.fileSize,
      fileType: meta.fileType,
      title: meta.title || safeFilename,
      description: meta.description || '',
      createdAt: meta.createdAt || new Date().toISOString(),
      expiresAt: meta.expiresAt || null,
      passwordSalt: meta.passwordSalt,
      passwordHash: meta.passwordHash,
      checksumSha256,
      downloadCount: 0,
      isFolder: meta.isFolder,
      isEncrypted: true,
      sourceType: 'local_encrypted',
    };

    const shares = loadShares();
    shares.unshift(newShare);
    saveShares(shares);

    res.json({
      success: true,
      share: {
        id: newShare.id,
        filename: newShare.filename,
        fileSize: newShare.fileSize,
        fileType: newShare.fileType,
        title: newShare.title,
        description: newShare.description,
        createdAt: newShare.createdAt,
        expiresAt: newShare.expiresAt,
        hasPassword: true,
        checksumSha256: newShare.checksumSha256,
        downloadCount: 0,
        isFolder: newShare.isFolder,
        isEncrypted: true,
        sourceType: newShare.sourceType,
      },
    });
  } catch (err: any) {
    console.error('Error completing upload:', err);
    res.status(500).json({ error: 'Failed to assemble and finalize encrypted upload.' });
  }
});



// 6. Import file from GitHub (Zero Hosting Cost Mode: uses GitHub CDN stream proxy)
app.post('/api/github/import', (req, res) => {
  try {
    const {
      repoUrl,
      downloadUrl,
      filename,
      fileSize,
      password,
      title,
      description,
      expiryDays,
      releaseTag,
    } = req.body;

    if (!downloadUrl || !filename) {
      return res.status(400).json({ error: 'Download URL and filename are required.' });
    }

    if (!password || password.trim().length === 0) {
      return res.status(400).json({ error: 'A password is required for protected sharing.' });
    }

    const shareId = crypto.randomBytes(5).toString('hex');
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password.trim(), salt);

    let expiresAt: string | null = null;
    if (expiryDays && Number(expiryDays) > 0) {
      const exp = new Date();
      exp.setDate(exp.getDate() + Number(expiryDays));
      expiresAt = exp.toISOString();
    }

    const newShare: ShareRecord = {
      id: shareId,
      filename,
      fileSize: Number(fileSize) || 0,
      fileType: filename.endsWith('.7z') ? 'application/x-7z-compressed' : 'application/zip',
      title: title?.trim() || filename,
      description: description?.trim() || `Hosted on GitHub (${repoUrl || 'repository'}). Password protected with VaultDrop.`,
      createdAt: new Date().toISOString(),
      expiresAt,
      passwordSalt: salt,
      passwordHash: hash,
      downloadCount: 0,
      isFolder: true,
      isEncrypted: false,
      sourceType: 'github',
      githubDownloadUrl: downloadUrl,
      githubRepo: repoUrl,
      githubReleaseTag: releaseTag,
    };

    const shares = loadShares();
    shares.unshift(newShare);
    saveShares(shares);

    res.json({
      success: true,
      share: {
        id: newShare.id,
        filename: newShare.filename,
        fileSize: newShare.fileSize,
        fileType: newShare.fileType,
        title: newShare.title,
        description: newShare.description,
        createdAt: newShare.createdAt,
        expiresAt: newShare.expiresAt,
        hasPassword: true,
        downloadCount: 0,
        isFolder: newShare.isFolder,
        sourceType: 'github',
      },
    });
  } catch (err: any) {
    console.error('Error importing GitHub file:', err);
    res.status(500).json({ error: 'Failed to import file from GitHub.' });
  }
});

// 7. Get public share info (recipient safe)
app.get('/api/shares/:id/info', (req, res) => {
  try {
    const { id } = req.params;
    const shares = loadShares();
    const share = shares.find((s) => s.id === id);

    if (!share) {
      return res.status(404).json({ error: 'The requested file was not found or has been removed.' });
    }

    const isExpired = share.expiresAt ? new Date(share.expiresAt).getTime() < Date.now() : false;

    res.json({
      id: share.id,
      filename: share.filename,
      fileSize: share.fileSize,
      fileType: share.fileType,
      title: share.title,
      description: share.description,
      createdAt: share.createdAt,
      expiresAt: share.expiresAt,
      isExpired,
      hasPassword: Boolean(share.passwordHash),
      downloadCount: share.downloadCount,
      checksumSha256: share.checksumSha256,
      isFolder: share.isFolder,
      isEncrypted: share.isEncrypted ?? false,
      sourceType: share.sourceType || 'local_encrypted',
      githubReleaseTag: share.githubReleaseTag,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve file info.' });
  }
});

// 8. Verify password & issue access token
app.post('/api/shares/:id/verify', (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    const rateKey = `${id}:${clientIp}`;

    const rl = rateLimits.get(rateKey);
    const now = Date.now();
    if (rl && rl.lockedUntil > now) {
      const waitSeconds = Math.ceil((rl.lockedUntil - now) / 1000);
      return res.status(429).json({
        error: `Too many failed attempts. Security cooldown active. Please try again in ${waitSeconds} seconds.`,
        locked: true,
        waitSeconds,
      });
    }

    const shares = loadShares();
    const share = shares.find((s) => s.id === id);

    if (!share) {
      return res.status(404).json({ error: 'File share not found.' });
    }

    if (share.expiresAt && new Date(share.expiresAt).getTime() < now) {
      return res.status(410).json({ error: 'This download link has expired.' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Please enter a password.' });
    }

    const computed = hashPassword(password, share.passwordSalt);
    const valid = crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(share.passwordHash));

    if (!valid) {
      const currentCount = (rl ? rl.count : 0) + 1;
      const maxAttempts = 5;
      if (currentCount >= maxAttempts) {
        rateLimits.set(rateKey, { count: 0, lockedUntil: now + 60 * 1000 });
        return res.status(429).json({
          error: 'Incorrect password. 5 attempts exceeded. Locked for 60 seconds.',
          locked: true,
          waitSeconds: 60,
        });
      } else {
        rateLimits.set(rateKey, { count: currentCount, lockedUntil: 0 });
        const remaining = maxAttempts - currentCount;
        return res.status(401).json({
          error: `Incorrect password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before temporary lockout.`,
          remaining,
        });
      }
    }

    rateLimits.delete(rateKey);
    const accessToken = generateAccessToken(share.id);

    res.json({
      success: true,
      accessToken,
      filename: share.filename,
      fileSize: share.fileSize,
      title: share.title,
      downloadUrl: `/api/shares/${share.id}/download?token=${encodeURIComponent(accessToken)}&pwd=${encodeURIComponent(password)}`,
    });
  } catch (err: any) {
    console.error('Error verifying password:', err);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// 9. Secure download stream (Supports AES-256 decrypted streaming or GitHub proxy streaming)
app.get('/api/shares/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    const token = (req.query.token as string) || '';
    const pwd = (req.query.pwd as string) || '';

    const shares = loadShares();
    const share = shares.find((s) => s.id === id);

    if (!share) {
      return res.status(404).send('File not found or has been deleted.');
    }

    if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) {
      return res.status(410).send('This download link has expired.');
    }

    let authorized = false;
    if (token && verifyAccessToken(share.id, token)) {
      authorized = true;
    } else if (pwd) {
      const computed = hashPassword(pwd, share.passwordSalt);
      authorized = crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(share.passwordHash));
    }

    if (!authorized) {
      return res.status(403).send('Unauthorized. Valid token or password is required to download this file.');
    }

    // Increment download counter
    share.downloadCount = (share.downloadCount || 0) + 1;
    saveShares(shares);

    // Case 1: GitHub Hosted File (Zero Hosting Cost) -> Stream from GitHub CDN
    if (share.sourceType === 'github' && share.githubDownloadUrl) {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(share.filename)}"`);
      res.setHeader('Content-Type', share.fileType || 'application/octet-stream');
      if (share.fileSize > 0) {
        res.setHeader('Content-Length', share.fileSize);
      }

      // Stream fetch from GitHub CDN
      const ghStreamRes = await fetch(share.githubDownloadUrl);
      if (!ghStreamRes.ok || !ghStreamRes.body) {
        // Fallback: direct browser redirect to CDN
        return res.redirect(share.githubDownloadUrl);
      }

      // @ts-ignore: web stream to node stream piping
      const { Readable } = await import('stream');
      // @ts-ignore
      const nodeStream = Readable.fromWeb(ghStreamRes.body);
      return nodeStream.pipe(res);
    }

    // Case 2: Local AES-256 Encrypted File -> Decrypt on-the-fly and pipe to response
    const encFilePath = path.join(UPLOADS_DIR, share.id, `${share.filename}.enc`);
    const plainFilePath = path.join(UPLOADS_DIR, share.id, share.filename);

    if (fs.existsSync(encFilePath) && pwd) {
      const encKey = deriveKey(pwd, share.passwordSalt);
      const fd = fs.openSync(encFilePath, 'r');
      const ivBuffer = Buffer.alloc(16);
      fs.readSync(fd, ivBuffer, 0, 16, 0);
      fs.closeSync(fd);

      const decipher = crypto.createDecipheriv('aes-256-cbc', encKey, ivBuffer);
      const readStream = fs.createReadStream(encFilePath, { start: 16 });

      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(share.filename)}"`);
      res.setHeader('Content-Type', share.fileType || 'application/octet-stream');
      if (share.fileSize > 0) {
        res.setHeader('Content-Length', share.fileSize);
      }

      return readStream.pipe(decipher).pipe(res);
    } else if (fs.existsSync(plainFilePath)) {
      // Unencrypted file fallback
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(share.filename)}"`);
      res.setHeader('Content-Type', share.fileType || 'application/octet-stream');
      return res.sendFile(plainFilePath);
    } else {
      return res.status(404).send('Encrypted data payload could not be located on disk.');
    }
  } catch (err) {
    console.error('Error during download stream:', err);
    if (!res.headersSent) {
      res.status(500).send('Error streaming download.');
    }
  }
});

// 10. Admin: List all shares
app.get('/api/admin/shares', (req, res) => {
  try {
    const shares = loadShares();
    const mapped = shares.map((s) => ({
      id: s.id,
      filename: s.filename,
      fileSize: s.fileSize,
      fileType: s.fileType,
      title: s.title,
      description: s.description,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      downloadCount: s.downloadCount,
      checksumSha256: s.checksumSha256,
      isFolder: s.isFolder,
      hasPassword: true,
      isEncrypted: s.isEncrypted ?? false,
      sourceType: s.sourceType || 'local_encrypted',
      githubRepo: s.githubRepo,
      githubReleaseTag: s.githubReleaseTag,
    }));
    res.json({ shares: mapped });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shares list.' });
  }
});

// 11. Admin: Delete share
app.delete('/api/admin/shares/:id', (req, res) => {
  try {
    const { id } = req.params;
    let shares = loadShares();
    const target = shares.find((s) => s.id === id);

    if (!target) {
      return res.status(404).json({ error: 'Share not found.' });
    }

    const targetDir = path.join(UPLOADS_DIR, id);
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }

    shares = shares.filter((s) => s.id !== id);
    saveShares(shares);

    res.json({ success: true, message: 'Share deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete share.' });
  }
});

// Mount Vite or static server
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      if (url.startsWith('/api/')) {
        return next();
      }
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        if (vite) vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`VaultDrop server running on port ${PORT}`);
  });
}

startServer();

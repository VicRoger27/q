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

interface ShareRecord {
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
  checksumSha256: string;
  downloadCount: number;
  isFolder: boolean;
  totalChunks?: number;
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
      const demoFile = path.join(demoDir, 'Portfolio_Master_Release_v1.0.zip');
      if (!fs.existsSync(demoFile)) {
        // Generate a valid small dummy zip / binary package
        const content = Buffer.from(
          'PK\x05\x06\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00' +
          'Sample archive package ready for distribution via q.vopple.uk.\nProtected by VaultDrop password gate.'
        );
        fs.writeFileSync(demoFile, content);
      }

      const initial: ShareRecord[] = [
        {
          id: demoId,
          filename: 'Portfolio_Master_Release_v1.0.zip',
          fileSize: 1048576 * 14.5, // 14.5 MB demo representation
          fileType: 'application/zip',
          title: 'Vopple Production Assets & Deployment Kit',
          description: 'High-resolution renders, release bundles, and vector assets for the 2026 website redesign.',
          createdAt: new Date().toISOString(),
          expiresAt: null,
          passwordSalt: demoSalt,
          passwordHash: demoHash,
          checksumSha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
          downloadCount: 3,
          isFolder: true,
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

function generateAccessToken(shareId: string): string {
  const expires = Date.now() + 2 * 60 * 60 * 1000; // 2 hours
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

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Raw body parser for binary upload chunks (supports chunks up to 25MB each)
app.use('/api/upload/chunk', express.raw({ type: 'application/octet-stream', limit: '25mb' }));

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// 2. Initialize chunked upload
app.post('/api/upload/init', (req, res) => {
  try {
    const { filename, fileSize, fileType, password, title, description, expiryDays, isFolder, totalChunks } = req.body;

    if (!filename || !fileSize) {
      return res.status(400).json({ error: 'Filename and file size are required.' });
    }

    if (!password || password.trim().length === 0) {
      return res.status(400).json({ error: 'A password is required for protected sharing.' });
    }

    // Generate unique ID (8 chars clean alphanumeric)
    const shareId = crypto.randomBytes(5).toString('hex');
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);

    // Create temp directory for chunks
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

    // Store pending metadata in temp
    const pendingMeta = {
      id: shareId,
      filename,
      fileSize: Number(fileSize),
      fileType: fileType || 'application/octet-stream',
      title: title?.trim() || filename,
      description: description?.trim() || '',
      createdAt: new Date().toISOString(),
      expiresAt,
      passwordSalt: salt,
      passwordHash: hash,
      isFolder: Boolean(isFolder),
      totalChunks: Number(totalChunks) || 1,
    };

    fs.writeFileSync(path.join(tempShareDir, 'meta.json'), JSON.stringify(pendingMeta));

    res.json({
      success: true,
      uploadId: shareId,
      shareId,
      message: 'Upload initialized. Ready for chunks.',
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

// 4. Complete upload: assemble chunks into final file & generate sha256 checksum
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

    // Target upload destination
    const finalDir = path.join(UPLOADS_DIR, targetId);
    if (!fs.existsSync(finalDir)) {
      fs.mkdirSync(finalDir, { recursive: true });
    }

    const safeFilename = path.basename(meta.filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const finalFilePath = path.join(finalDir, safeFilename);

    const writeStream = fs.createWriteStream(finalFilePath);
    const hash = crypto.createHash('sha256');

    for (let i = 0; i < totalChunks; i++) {
      const partPath = path.join(tempShareDir, `chunk_${i}.part`);
      const buffer = fs.readFileSync(partPath);
      hash.update(buffer);
      writeStream.write(buffer);
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

    // Save to shares registry
    const stat = fs.statSync(finalFilePath);
    const newShare: ShareRecord = {
      id: targetId,
      filename: safeFilename,
      fileSize: stat.size,
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
      },
    });
  } catch (err: any) {
    console.error('Error completing upload:', err);
    res.status(500).json({ error: 'Failed to assemble and finalize upload.' });
  }
});

// 5. Get public share info (recipient safe: no salt/hash returned)
app.get('/api/shares/:id/info', (req, res) => {
  try {
    const { id } = req.params;
    const shares = loadShares();
    const share = shares.find((s) => s.id === id);

    if (!share) {
      return res.status(404).json({ error: 'The requested file was not found or has been removed.' });
    }

    // Check expiry
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
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve file info.' });
  }
});

// 6. Verify password & issue access token (with anti-bruteforce protection)
app.post('/api/shares/:id/verify', (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    const rateKey = `${id}:${clientIp}`;

    // Rate limit check
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
        // Lock for 60 seconds
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

    // Success: clear rate limit and issue token
    rateLimits.delete(rateKey);
    const accessToken = generateAccessToken(share.id);

    res.json({
      success: true,
      accessToken,
      filename: share.filename,
      fileSize: share.fileSize,
      title: share.title,
      downloadUrl: `/api/shares/${share.id}/download?token=${encodeURIComponent(accessToken)}`,
    });
  } catch (err: any) {
    console.error('Error verifying password:', err);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// 7. Secure download stream
app.get('/api/shares/:id/download', (req, res) => {
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

    // Verify token or direct password
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

    const filePath = path.join(UPLOADS_DIR, share.id, share.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('The physical file could not be found on the server.');
    }

    // Increment download count
    share.downloadCount = (share.downloadCount || 0) + 1;
    saveShares(shares);

    // Stream download with standard headers and Range support via res.download/res.sendFile
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(share.filename)}"`);
    res.setHeader('Content-Type', share.fileType || 'application/octet-stream');

    return res.sendFile(filePath);
  } catch (err) {
    console.error('Error downloading:', err);
    res.status(500).send('Error downloading file.');
  }
});

// 8. Admin: List all shares
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
    }));
    res.json({ shares: mapped });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shares list.' });
  }
});

// 9. Admin: Delete share
app.delete('/api/admin/shares/:id', (req, res) => {
  try {
    const { id } = req.params;
    let shares = loadShares();
    const target = shares.find((s) => s.id === id);

    if (!target) {
      return res.status(404).json({ error: 'Share not found.' });
    }

    // Remove from disk
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
      appType: 'spa',
    });
    app.use(vite.middlewares);
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

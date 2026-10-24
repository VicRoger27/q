import React, { useState, useEffect } from 'react';
import {
  FileArchive,
  FolderArchive,
  Search,
  ExternalLink,
  Share2,
  Trash2,
  Download,
  Clock,
  ShieldCheck,
  Check,
  Copy,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { ShareItem } from '../types';
import { formatBytes, formatDate } from '../utils/formatters';

interface SharesListProps {
  onSelectShare: (share: ShareItem) => void;
  onOpenGate: (shareId: string) => void;
  onNewUpload: () => void;
}

export const SharesList: React.FC<SharesListProps> = ({
  onSelectShare,
  onOpenGate,
  onNewUpload,
}) => {
  const [shares, setShares] = useState<ShareItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchShares = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/shares');
      if (res.ok) {
        const data = await res.json();
        setShares(data.shares || []);
      }
    } catch (err) {
      console.error('Failed to load shares:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShares();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"? This will permanently delete the file and invalidate all download links.`)) {
      return;
    }

    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/shares/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setShares((prev) => prev.filter((s) => s.id !== id));
      } else {
        alert('Failed to delete share.');
      }
    } catch (err) {
      alert('Error connecting to server.');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredShares = shares.filter((s) => {
    const q = searchQuery.toLowerCase();
    return (
      s.filename.toLowerCase().includes(q) ||
      s.title.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            Active Files & Download Links
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">
            Manage your password-protected archives, copy embed codes, and monitor downloads.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchShares}
            className="p-2 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer border border-neutral-200"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onNewUpload}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer shadow-xs whitespace-nowrap"
          >
            Upload Another File
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, filename, or share ID..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-neutral-200 rounded-lg text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent shadow-2xs"
          />
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
        {loading && shares.length === 0 ? (
          <div className="py-16 text-center text-xs text-neutral-500">
            <div className="animate-spin w-6 h-6 border-2 border-neutral-900 border-t-transparent rounded-full mx-auto mb-2" />
            Loading uploaded files...
          </div>
        ) : filteredShares.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-neutral-100 flex items-center justify-center mx-auto mb-3 text-neutral-400">
              <FileArchive className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-neutral-900">No shares found</h3>
            <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
              {searchQuery ? 'No files match your search query.' : 'You have not uploaded any files yet.'}
            </p>
            {!searchQuery && (
              <button
                onClick={onNewUpload}
                className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-neutral-900 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Upload a 500MB File Now
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/80 text-[11px] font-bold text-neutral-600 uppercase tracking-wider">
                  <th className="py-3 px-4">File / Title</th>
                  <th className="py-3 px-4">File Size</th>
                  <th className="py-3 px-4">Password Protection</th>
                  <th className="py-3 px-4">Downloads</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filteredShares.map((share) => (
                  <tr key={share.id} className="hover:bg-neutral-50/60 transition-colors">
                    {/* Title & Filename */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0">
                          {share.isFolder ? (
                            <FolderArchive className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <FileArchive className="w-4 h-4 text-neutral-700" />
                          )}
                        </div>
                        <div className="min-w-0 max-w-xs sm:max-w-sm">
                          <div className="font-semibold text-neutral-900 truncate">
                            {share.title || share.filename}
                          </div>
                          <div className="text-[11px] text-neutral-500 font-mono truncate">
                            {share.filename}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Size */}
                    <td className="py-3.5 px-4 font-mono font-medium text-neutral-800 whitespace-nowrap tabular-nums">
                      {formatBytes(share.fileSize)}
                    </td>

                    {/* Password Protection */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Password Required</span>
                      </div>
                    </td>

                    {/* Download count */}
                    <td className="py-3.5 px-4 whitespace-nowrap font-mono tabular-nums text-neutral-700">
                      <div className="flex items-center gap-1">
                        <Download className="w-3.5 h-3.5 text-neutral-400" />
                        <span>{share.downloadCount}</span>
                      </div>
                    </td>

                    {/* Created Date */}
                    <td className="py-3.5 px-4 whitespace-nowrap text-neutral-500 font-mono tabular-nums">
                      {formatDate(share.createdAt)}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onSelectShare(share)}
                          className="px-2.5 py-1 text-xs font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                          title="Get Share Link & Iframe Embed Code"
                        >
                          <Share2 className="w-3 h-3 text-neutral-600" />
                          <span>Link & Embed</span>
                        </button>

                        <button
                          onClick={() => onOpenGate(share.id)}
                          className="px-2.5 py-1 text-xs font-semibold text-neutral-800 hover:text-neutral-950 hover:bg-neutral-100 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                          title="Open Password Download Gate"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Test Gate</span>
                        </button>

                        <button
                          onClick={() => handleDelete(share.id, share.title || share.filename)}
                          disabled={deletingId === share.id}
                          className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                          title="Delete file permanently"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

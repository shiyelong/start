'use client';

import { useState, useRef, useCallback } from 'react';
import { X, Upload, FileCheck, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import type { ConsolePlatform, ValidationResult } from '@/lib/types';
import { SUPPORTED_EXTENSIONS } from '@/lib/types';
import { RomManager } from '@/lib/rom/rom-manager';

const ALL_PLATFORMS: { value: ConsolePlatform; label: string }[] = [
  { value: 'NES', label: 'NES / Famicom' },
  { value: 'SNES', label: 'SNES / Super Famicom' },
  { value: 'Game_Boy', label: 'Game Boy' },
  { value: 'Game_Boy_Color', label: 'Game Boy Color' },
  { value: 'Game_Boy_Advance', label: 'Game Boy Advance' },
  { value: 'Genesis', label: 'Sega Genesis / Mega Drive' },
  { value: 'Master_System', label: 'Sega Master System' },
  { value: 'Arcade', label: 'Arcade / MAME' },
  { value: 'Neo_Geo', label: 'Neo Geo' },
  { value: 'PC_Engine', label: 'PC Engine / TurboGrafx-16' },
  { value: 'Atari_2600', label: 'Atari 2600' },
];

const ZIP_PLATFORMS: { value: ConsolePlatform; label: string }[] = [
  { value: 'Arcade', label: 'Arcade / MAME' },
  { value: 'Neo_Geo', label: 'Neo Geo' },
];

interface Props {
  onClose: () => void;
  onComplete: () => void;
}

type PlayerCount = 1 | 2 | 3 | 4;

export default function RomUploadDialog({ onClose, onComplete }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState<ConsolePlatform | ''>('');
  const [playerCount, setPlayerCount] = useState<PlayerCount>(1);
  const [isZipAmbiguous, setIsZipAmbiguous] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const romManagerRef = useRef(new RomManager());

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setError('');
    setValidation(null);

    const result = await romManagerRef.current.validateFile(selectedFile);
    setValidation(result);

    if (!result.valid) {
      setError(result.error ?? '文件验证失败');
      return;
    }

    // Pre-fill title from filename (strip extension)
    const dotIdx = selectedFile.name.lastIndexOf('.');
    const baseName = dotIdx >= 0 ? selectedFile.name.slice(0, dotIdx) : selectedFile.name;
    setTitle(baseName);

    // Check if .zip (ambiguous platform)
    const ext = dotIdx >= 0 ? selectedFile.name.slice(dotIdx).toLowerCase() : '';
    if (ext === '.zip') {
      setIsZipAmbiguous(true);
      setPlatform('');
    } else {
      setIsZipAmbiguous(false);
      setPlatform(result.detectedPlatform ?? '');
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  }, [handleFileSelect]);

  const handleSubmit = async () => {
    if (!file || !platform || !title.trim()) return;

    setUploading(true);
    setError('');

    try {
      const data = await file.arrayBuffer();
      const hash = await romManagerRef.current.computeHash(data);

      // Store in IndexedDB
      await romManagerRef.current.storeLocal(hash, data, platform as ConsolePlatform, title.trim());

      // Save metadata (best-effort, may fail if API not available)
      try {
        await romManagerRef.current.saveMetadata({
          hash,
          userId: 'local',
          title: title.trim(),
          platform: platform as ConsolePlatform,
          playerCount,
          fileSize: file.size,
          isFavorite: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } catch {
        // Metadata API may not be available in static export mode
      }

      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败，请重试');
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const acceptExts = SUPPORTED_EXTENSIONS.join(',');
  const canSubmit = file && validation?.valid && platform && title.trim() && !uploading;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-bg-secondary border border-border rounded-2xl shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-bold">上传ROM</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-hover text-muted hover:text-white transition">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* File Drop Zone */}
          {!file ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-accent/50 hover:bg-accent/5 transition"
            >
              <Upload size={32} className="mx-auto mb-3 text-muted" />
              <p className="text-sm text-subtle mb-1">点击或拖拽ROM文件到此处</p>
              <p className="text-xs text-muted">
                支持 {SUPPORTED_EXTENSIONS.slice(0, 5).join(', ')} 等格式，最大 64MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept={acceptExts}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
            </div>
          ) : (
            <div className="p-3 bg-bg-card rounded-lg">
              <div className="flex items-start gap-3">
                {validation?.valid ? (
                  <FileCheck size={20} className="text-success mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle size={20} className="text-danger mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {formatSize(validation?.sizeBytes ?? file.size)}
                    {validation?.detectedPlatform && (
                      <> · 检测平台: {validation.detectedPlatform}</>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => { setFile(null); setValidation(null); setError(''); setPlatform(''); setTitle(''); }}
                  className="p-1 rounded hover:bg-bg-hover text-muted hover:text-white transition shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form fields (only show after valid file) */}
          {file && validation?.valid && (
            <>
              {/* Title */}
              <div>
                <label className="block text-xs text-muted mb-1.5">游戏标题</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="输入游戏名称"
                  className="w-full h-10 px-3 bg-bg-card border border-border rounded-lg text-sm text-white placeholder-muted outline-none focus:border-accent transition"
                />
              </div>

              {/* Platform (show dropdown for .zip, otherwise show detected) */}
              <div>
                <label className="block text-xs text-muted mb-1.5">
                  游戏平台
                  {isZipAmbiguous && <span className="text-warn ml-1">（.zip文件需手动选择平台）</span>}
                </label>
                {isZipAmbiguous ? (
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value as ConsolePlatform)}
                    className="w-full h-10 px-3 bg-bg-card border border-border rounded-lg text-sm text-white outline-none focus:border-accent transition appearance-none"
                  >
                    <option value="">请选择平台...</option>
                    {ZIP_PLATFORMS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                    <optgroup label="其他平台">
                      {ALL_PLATFORMS.filter((p) => !ZIP_PLATFORMS.some((z) => z.value === p.value)).map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </optgroup>
                  </select>
                ) : (
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value as ConsolePlatform)}
                    className="w-full h-10 px-3 bg-bg-card border border-border rounded-lg text-sm text-white outline-none focus:border-accent transition appearance-none"
                  >
                    {ALL_PLATFORMS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Player Count */}
              <div>
                <label className="block text-xs text-muted mb-1.5">玩家人数</label>
                <div className="flex gap-2">
                  {([1, 2, 3, 4] as PlayerCount[]).map((count) => (
                    <button
                      key={count}
                      onClick={() => setPlayerCount(count)}
                      className={clsx(
                        'flex-1 h-10 rounded-lg text-sm font-medium transition',
                        playerCount === count
                          ? 'bg-accent text-[#0f0f0f]'
                          : 'bg-bg-card border border-border text-subtle hover:text-white hover:bg-bg-hover'
                      )}
                    >
                      {count}P
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-subtle hover:text-white hover:bg-bg-hover transition"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={clsx(
              'px-5 py-2 rounded-lg text-sm font-semibold transition',
              canSubmit
                ? 'bg-accent text-[#0f0f0f] hover:bg-accent-hover'
                : 'bg-bg-card text-muted cursor-not-allowed'
            )}
          >
            {uploading ? '上传中...' : '确认上传'}
          </button>
        </div>
      </div>
    </div>
  );
}

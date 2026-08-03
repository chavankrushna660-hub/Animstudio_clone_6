import React, { useState, useEffect } from 'react';
import { 
  Database, 
  X, 
  Trash2, 
  FolderOpen, 
  Plus, 
  HardDrive, 
  Clock, 
  Film, 
  Layers, 
  Box, 
  CheckCircle2, 
  AlertCircle,
  Sparkles,
  Download,
  Upload
} from 'lucide-react';
import { 
  SavedAnimationRecord, 
  getAllUserSavedAnimations, 
  getSavedAnimationsQuotaStatus, 
  saveUserAnimationToQuotaDb, 
  deleteSavedAnimationById 
} from '../utils/database';
import { Frame, VectorObject, Bone, Layer } from '../types';

interface SavedAnimationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: string | null;
  currentProjectData: {
    fps: number;
    layers: Layer[];
    objects: { [id: string]: VectorObject };
    frames: Frame[];
    bones: Bone[];
  };
  onLoadProject: (record: SavedAnimationRecord) => void;
  onNotification?: (msg: { type: 'success' | 'error' | 'info'; message: string }) => void;
}

export default function SavedAnimationsModal({
  isOpen,
  onClose,
  currentUser,
  currentProjectData,
  onLoadProject,
  onNotification
}: SavedAnimationsModalProps) {
  const [projectTitle, setProjectTitle] = useState('');
  const [savedList, setSavedList] = useState<SavedAnimationRecord[]>([]);
  const [quota, setQuota] = useState<{ count: number; max: number; isFull: boolean; remaining: number }>({
    count: 0,
    max: 10,
    isFull: false,
    remaining: 10
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const email = currentUser || 'guest';

  const refreshList = () => {
    const list = getAllUserSavedAnimations(email);
    setSavedList(list);
    setQuota(getSavedAnimationsQuotaStatus(email));
  };

  useEffect(() => {
    if (isOpen) {
      refreshList();
      setErrorMessage(null);
      setProjectTitle(`3D Animation ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    }
  }, [isOpen, email]);

  if (!isOpen) return null;

  const handleSaveCurrent = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const res = saveUserAnimationToQuotaDb(email, projectTitle, currentProjectData);

    if (!res.success) {
      setErrorMessage(res.error || 'Failed to save animation.');
      if (onNotification) {
        onNotification({ type: 'error', message: res.error || 'Quota reached (10/10 saved animations).' });
      }
      return;
    }

    refreshList();
    setProjectTitle(`3D Animation ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    if (onNotification) {
      onNotification({ type: 'success', message: `Saved animation "${res.record?.title}" successfully!` });
    }
  };

  const handleDelete = (id: string, title: string) => {
    deleteSavedAnimationById(id, email);
    refreshList();
    if (onNotification) {
      onNotification({ type: 'info', message: `Deleted "${title}" from database.` });
    }
  };

  const handleLoad = (record: SavedAnimationRecord) => {
    onLoadProject(record);
    onClose();
    if (onNotification) {
      onNotification({ type: 'success', message: `Loaded "${record.title}" into workspace!` });
    }
  };

  const handleExportProject = () => {
    try {
      const exportData = {
        version: '2.0',
        title: projectTitle || 'AnimStudio_Project',
        exportedAt: new Date().toISOString(),
        projectData: currentProjectData
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(projectTitle || 'animstudio_project').replace(/[^a-z0-9]/gi, '_')}.animstudio`;
      a.click();
      URL.revokeObjectURL(url);
      if (onNotification) {
        onNotification({ type: 'success', message: 'Project downloaded (.animstudio) successfully!' });
      }
    } catch (err: any) {
      alert('Failed to export project file: ' + err.message);
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        const dataToLoad = parsed.projectData || parsed;
        if (dataToLoad.objects || dataToLoad.layers || dataToLoad.frames) {
          onLoadProject({
            id: `imported_${Date.now()}`,
            title: parsed.title || file.name.replace('.animstudio', '').replace('.json', ''),
            savedAt: Date.now(),
            email: email,
            fps: dataToLoad.fps || 24,
            layers: dataToLoad.layers || [],
            objects: dataToLoad.objects || {},
            frames: dataToLoad.frames || [],
            bones: dataToLoad.bones || [],
          });
          onClose();
          if (onNotification) {
            onNotification({ type: 'success', message: `Imported "${file.name}" into workspace!` });
          }
        } else {
          alert('Invalid AnimStudio project file format.');
        }
      } catch (err) {
        alert('Failed to parse project file JSON.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-neutral-900 border border-neutral-800 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-black text-white uppercase tracking-wide flex items-center gap-2">
                Saved Animations & Drawings Database
              </h2>
              <p className="text-xs text-neutral-400 font-medium">
                Store up to 10 saved animations. Delete items to free up quota.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quota Progress Bar */}
        <div className="px-6 py-3 bg-neutral-950/40 border-b border-neutral-800/60 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2 text-xs font-bold text-neutral-300">
            <HardDrive className="w-4 h-4 text-amber-400" />
            <span>Database Storage Quota:</span>
            <span className={quota.isFull ? 'text-rose-400 font-black' : 'text-amber-400 font-black'}>
              {quota.count} / {quota.max} Saved Animations
            </span>
          </div>

          <div className="flex-1 max-w-xs h-2.5 bg-neutral-800 rounded-full overflow-hidden p-0.5 border border-neutral-700/50">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                quota.isFull
                  ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]'
                  : quota.count >= 8
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'
              }`}
              style={{ width: `${(quota.count / quota.max) * 100}%` }}
            />
          </div>
        </div>

        {/* Save Current Workspace Form & Backup File Actions */}
        <div className="p-5 border-b border-neutral-800 bg-neutral-900/90 shrink-0 space-y-3">
          <form onSubmit={handleSaveCurrent} className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <input
              type="text"
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              placeholder="Enter animation name..."
              className="flex-1 bg-neutral-950 border border-neutral-800 focus:border-amber-500 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-neutral-500 font-medium outline-none transition"
              required
            />
            <button
              type="submit"
              disabled={quota.isFull}
              className={`px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer shrink-0 ${
                quota.isFull
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700'
                  : 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-neutral-950 shadow-lg shadow-amber-500/10'
              }`}
            >
              <Plus className="w-4 h-4" />
              Save Animation
            </button>
          </form>

          {/* Export / Import File Actions */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-800/60">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider font-mono">
              Offline File Backup (.animstudio):
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportProject}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-700 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer"
                title="Download complete project file to your computer/phone"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                Download File
              </button>

              <label className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-700 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-emerald-400" />
                Import File
                <input
                  type="file"
                  accept=".animstudio,.json"
                  onChange={handleImportFile}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {errorMessage && (
            <div className="mt-3 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {quota.isFull && (
            <div className="mt-2 text-[11px] text-amber-400 font-bold flex items-center gap-1.5">
              <span>⚠️ Quota Full (10/10 saved animations)! Delete an existing animation below to free up a slot.</span>
            </div>
          )}
        </div>

        {/* Saved Animations List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 scrollbar-thin">
          {savedList.length === 0 ? (
            <div className="py-12 text-center text-neutral-500 space-y-2">
              <Film className="w-10 h-10 mx-auto text-neutral-600 animate-pulse" />
              <p className="text-xs font-bold text-neutral-400">No saved animations in database yet</p>
              <p className="text-[11px]">Save your current canvas project above to store up to 10 animations!</p>
            </div>
          ) : (
            savedList.map((item, idx) => (
              <div
                key={item.id}
                className="bg-neutral-950 border border-neutral-800/80 hover:border-amber-500/40 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition group"
              >
                <div className="flex items-center gap-3.5 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 font-mono font-black text-xs">
                    #{idx + 1}
                  </div>

                  <div className="space-y-1 min-w-0 flex-1">
                    <h3 className="text-xs font-black text-white truncate">{item.title}</h3>
                    <div className="flex items-center gap-3 text-[10px] text-neutral-400 font-medium">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-neutral-500" />
                        {new Date(item.savedAt).toLocaleDateString()} {new Date(item.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="flex items-center gap-1 text-amber-400/90 font-mono font-bold">
                        <Film className="w-3 h-3" />
                        {item.frames?.length || 1} frames
                      </span>
                      <span className="flex items-center gap-1 text-indigo-400 font-mono font-bold">
                        <Box className="w-3 h-3" />
                        {Object.keys(item.objects || {}).length} objects
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <button
                    onClick={() => handleLoad(item)}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-bold text-xs uppercase flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    Load
                  </button>

                  <button
                    onClick={() => handleDelete(item.id, item.title)}
                    className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 hover:text-rose-300 transition cursor-pointer"
                    title="Delete saved animation from database"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950/60 flex items-center justify-between text-[11px] text-neutral-500 font-medium shrink-0">
          <span>Database Quota: Lifetime daily management (10 saved animation slots).</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold transition cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}

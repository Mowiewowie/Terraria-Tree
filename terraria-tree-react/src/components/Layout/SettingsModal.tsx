import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { loadVersionData } from '../../data/loader';
import { viewHome } from '../../router/navigation';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const engineVersion = useStore((s) => s.engineVersion);

  const [version, setVersion] = useState(engineVersion);
  const [modCalamity, setModCalamity] = useState(false);
  const [modFargos, setModFargos] = useState(false);
  const [modsEnabled, setModsEnabled] = useState(false);
  const [versionLabel, setVersionLabel] = useState(`${engineVersion} (Vanilla Only)`);

  // Probe server for modern exports when version changes
  useEffect(() => {
    let cancelled = false;

    async function probe() {
      const possibleFiles = [
        `Terraria_Vanilla_${version}_Export.json`,
        `Terraria_All_${version}_Export.json`,
        `Terraria_Vanilla_Calamity_${version}_Export.json`,
        `Terraria_Vanilla_Fargowiltas_${version}_Export.json`,
      ];

      let foundModern = false;
      for (const file of possibleFiles) {
        try {
          const res = await fetch(file, { method: 'HEAD' });
          if (res.ok) {
            foundModern = true;
            break;
          }
        } catch { /* ignore */ }
      }

      if (cancelled) return;

      if (foundModern) {
        setModsEnabled(true);
        setVersionLabel(version);
      } else {
        setModsEnabled(false);
        setModCalamity(false);
        setModFargos(false);
        setVersionLabel(`${version} (Vanilla Only)`);
      }
    }

    probe();
    return () => { cancelled = true; };
  }, [version]);

  const handleApply = useCallback(async () => {
    onClose();
    await loadVersionData(version, modCalamity, modFargos);
    viewHome();
  }, [version, modCalamity, modFargos, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-white/80 dark:bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">Data Sources & Mods</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors focus:outline-none rounded-md"
          >
            <i className="fa-solid fa-xmark text-xl" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
          {/* Version selector */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Game Version
            </label>
            <select
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none shadow-inner"
            >
              <option value="1.4.5">{version === '1.4.5' ? versionLabel : '1.4.5 (Vanilla Only)'}</option>
              <option value="1.4.4">{version === '1.4.4' ? versionLabel : '1.4.4'}</option>
            </select>
            <p className="text-xs text-slate-500 mt-1">Modded items are currently only compatible with 1.4.4.</p>
          </div>

          {/* Mods */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Active Mods
            </label>
            <div className={`space-y-2 transition-opacity duration-300 ${modsEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
              <label
                className="flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors shadow-sm"
                style={{ borderColor: '#cd6155', background: 'linear-gradient(rgba(205, 97, 85, 0.3), rgba(205, 97, 85, 0.3)), var(--card-bg)' }}
              >
                <input
                  type="checkbox"
                  checked={modCalamity}
                  onChange={(e) => setModCalamity(e.target.checked)}
                  className="w-5 h-5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-medium text-slate-800 dark:text-slate-200">Calamity Mod</span>
              </label>
              <label
                className="flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors shadow-sm"
                style={{ borderColor: '#a569bd', background: 'linear-gradient(rgba(165, 105, 189, 0.3), rgba(165, 105, 189, 0.3)), var(--card-bg)' }}
              >
                <input
                  type="checkbox"
                  checked={modFargos}
                  onChange={(e) => setModFargos(e.target.checked)}
                  className="w-5 h-5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-medium text-slate-800 dark:text-slate-200">Fargo's Souls</span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
          <button
            onClick={handleApply}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-lg shadow-blue-500/30 dark:shadow-blue-900/20 transition-all focus:ring-2 focus:ring-blue-400 focus:outline-none"
          >
            Apply & Reload
          </button>
        </div>
      </div>
    </div>
  );
}

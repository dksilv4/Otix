import { useState, useEffect, useCallback } from 'react';
import { Monitor, Link2, X, Search, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DkButton } from '@/features/dk-ui/atoms/button';
import type { DetectedProcess, DetectedGame, ProcessMapping } from '@desktop/preload-api';

interface Props {
 isOpen: boolean;
 onClose: () => void;
}

export function GameMatcher({ isOpen, onClose }: Props) {
 const [processes, setProcesses] = useState<DetectedProcess[]>([]);
 const [mappings, setMappings] = useState<ProcessMapping[]>([]);
 const [library, setLibrary] = useState<DetectedGame[]>([]);
 const [search, setSearch] = useState('');
 const [gameSearch, setGameSearch] = useState('');
 const [selectedProc, setSelectedProc] = useState<string | null>(null);
 const [loading, setLoading] = useState(false);

 const loadData = useCallback(async () => {
 const api = window.electronAPI;
 if (!api) return;
 setLoading(true);
 try {
 const [procs, maps, lib] = await Promise.all([
 api.getRunningProcesses(),
 api.getMappings(),
 api.getLibrary(),
 ]);
 setProcesses(procs);
 setMappings(maps);
 setLibrary(lib);
 } catch (err) {
 console.error('Failed to load processes:', err);
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => {
 if (isOpen) {
 loadData();
 }
 }, [isOpen, loadData]);

 const handleMap = async (processName: string, game: DetectedGame) => {
 const api = window.electronAPI;
 if (!api) return;
 await api.addMapping(processName, game.id, game.title);
 setSelectedProc(null);
 await loadData();
 };

 const handleUnmap = async (processName: string) => {
 const api = window.electronAPI;
 if (!api) return;
 await api.removeMapping(processName);
 await loadData();
 };

 const filteredProcs = processes.filter(
 (p) =>
 p.name.toLowerCase().includes(search.toLowerCase()) ||
 (p.windowTitle && p.windowTitle.toLowerCase().includes(search.toLowerCase())),
 );

 const filteredGames = library.filter((g) =>
 g.title.toLowerCase().includes(gameSearch.toLowerCase()),
 );

 const mappedNames = new Set(mappings.map((m) => m.processName.toLowerCase()));

 if (!isOpen) return null;

 return (
 <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
 <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
 <div className="relative bg-[var(--dk-surface)] /20 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
 {/* Header */}
 <div className="flex items-center justify-between px-5 py-4 border-b border-border/10">
 <div className="flex items-center gap-2">
 <Monitor className="h-5 w-5 text-emerald-400" />
 <h3 className="font-semibold">Game Matcher</h3>
 <span className="text-xs text-muted-foreground">
 Map processes to your library
 </span>
 </div>
 <div className="flex items-center gap-2">
 <DkButton variant="ghost" size="icon" onClick={loadData} aria-label="Refresh">
 <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
 </DkButton>
 <DkButton variant="ghost" size="icon" onClick={onClose} aria-label="Close">
 <X className="h-4 w-4" />
 </DkButton>
 </div>
 </div>

 {/* Mappings list */}
 {mappings.length > 0 && (
 <div className="px-5 py-3 border-b border-border/10">
 <p className="text-xs font-medium text-muted-foreground mb-2">MAPPED PROCESSES</p>
 <div className="flex flex-wrap gap-2">
 {mappings.map((m) => (
 <span
 key={m.processName}
 className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-xs"
 >
 <Link2 className="h-3 w-3 text-emerald-400" />
 <span className="text-muted-foreground">{m.processName}</span>
 <span className="text-foreground/50">â†’</span>
 <span className="font-medium">{m.gameTitle}</span>
 <button
 onClick={() => handleUnmap(m.processName)}
 className="ml-1 hover:text-red-400 transition-colors"
 aria-label={`Unmap ${m.processName}`}
 >
 <X className="h-3 w-3" />
 </button>
 </span>
 ))}
 </div>
 </div>
 )}

 <div className="flex-1 overflow-hidden grid grid-cols-2 divide-x divide-border/10">
 {/* Processes */}
 <div className="flex flex-col min-h-0">
 <div className="px-4 py-3 border-b border-border/5">
 <p className="text-xs font-medium text-muted-foreground mb-2">
 RUNNING PROCESSES ({processes.length})
 </p>
 <div className="relative">
 <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
 <input
 type="text"
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="Filter processes..."
 className="w-full rounded-lg bg-white/5 /10 pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-emerald-500/30"
 />
 </div>
 </div>
 <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
 {filteredProcs.map((proc) => {
 const isMapped = mappedNames.has(proc.name.toLowerCase());
 const isSelected = selectedProc === proc.name;

 return (
 <button
 key={`${proc.name}-${proc.pid}`}
 onClick={() => setSelectedProc(isSelected ? null : proc.name)}
 disabled={isMapped}
 className={cn(
 'w-full text-left px-3 py-2 rounded-lg text-xs transition-colors',
 isSelected && 'bg-emerald-500/10 border border-emerald-500/20',
 !isSelected && 'hover:bg-white/5 border border-transparent',
 isMapped && 'opacity-40 cursor-default',
 )}
 >
 <div className="flex items-center gap-2">
 <span className="font-medium truncate">{proc.name}</span>
 {isMapped && <Link2 className="h-3 w-3 text-emerald-400 shrink-0" />}
 </div>
 {proc.windowTitle && (
 <p className="text-muted-foreground truncate mt-0.5 ml-0">
 {proc.windowTitle}
 </p>
 )}
 </button>
 );
 })}
 {filteredProcs.length === 0 && (
 <p className="text-xs text-muted-foreground p-3 text-center">
 {loading ? 'Loading...' : 'No matching processes'}
 </p>
 )}
 </div>
 </div>

 {/* Game picker */}
 <div className="flex flex-col min-h-0">
 <div className="px-4 py-3 border-b border-border/5">
 <p className="text-xs font-medium text-muted-foreground mb-2">
 {selectedProc ? `LINK "${selectedProc}" TO...` : 'SELECT A PROCESS FIRST'}
 </p>
 {selectedProc && (
 <div className="relative">
 <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
 <input
 type="text"
 value={gameSearch}
 onChange={(e) => setGameSearch(e.target.value)}
 placeholder="Search library..."
 className="w-full rounded-lg bg-white/5 /10 pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-emerald-500/30"
 />
 </div>
 )}
 </div>
 <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
 {selectedProc
 ? filteredGames.map((game) => (
 <button
 key={game.id}
 onClick={() => handleMap(selectedProc, game)}
 className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-emerald-500/10 border border-transparent hover:border-emerald-500/20 transition-colors"
 >
 <span className="font-medium">{game.title}</span>
 <span className="text-muted-foreground ml-2 capitalize">{game.platform}</span>
 </button>
 ))
 : library.slice(0, 30).map((game) => (
 <div key={game.id} className="px-3 py-1.5 text-xs text-muted-foreground flex items-center gap-2">
 <span className="font-medium truncate">{game.title}</span>
 <span className="opacity-50 capitalize shrink-0">{game.platform}</span>
 </div>
 ))}
 {selectedProc && filteredGames.length === 0 && (
 <p className="text-xs text-muted-foreground p-3 text-center">No games match</p>
 )}
 </div>
 </div>
 </div>
 </div>
 </div>
 );
}

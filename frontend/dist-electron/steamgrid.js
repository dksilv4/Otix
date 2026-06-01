"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchGames = searchGames;
exports.getIcons = getIcons;
exports.getBestIconUrl = getBestIconUrl;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const SGDB_BASE = 'https://www.steamgriddb.com/api/v2';
let cachedApiKey = null;
function readApiKey() {
    if (cachedApiKey !== null)
        return cachedApiKey;
    // 1. Environment variable
    if (process.env.STEAM_GRID_API_KEY) {
        cachedApiKey = process.env.STEAM_GRID_API_KEY;
        return cachedApiKey;
    }
    // 2. Read from backend .env
    try {
        const projectRoot = path.resolve(__dirname, '..', '..', '..');
        const envPath = path.join(projectRoot, 'backend', '.env');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf-8');
            const match = content.match(/STEAM_GRID_API_KEY\s*=\s*(.+)/);
            if (match) {
                cachedApiKey = match[1].trim();
                return cachedApiKey;
            }
        }
    }
    catch {
        // Ignore
    }
    cachedApiKey = '';
    return null;
}
async function sgdbRequest(endpoint) {
    const apiKey = readApiKey();
    if (!apiKey) {
        console.warn('[SteamGridDB] No API key configured — skipping');
        return null;
    }
    try {
        const res = await fetch(`${SGDB_BASE}${endpoint}`, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok)
            return null;
        const json = await res.json();
        if (json && json.success !== false)
            return json;
        return null;
    }
    catch (err) {
        console.error('[SteamGridDB] Request failed:', err);
        return null;
    }
}
async function searchGames(query) {
    const data = await sgdbRequest(`/search/autocomplete/${encodeURIComponent(query)}`);
    return data?.data ?? [];
}
async function getIcons(gameId) {
    const data = await sgdbRequest(`/icons/game/${gameId}`);
    return data?.data ?? [];
}
async function getBestIconUrl(title) {
    const games = await searchGames(title);
    if (games.length === 0)
        return null;
    // Try exact title match first, then first result
    let game = games.find((g) => g.name.toLowerCase() === title.toLowerCase());
    if (!game)
        game = games[0];
    const icons = await getIcons(game.id);
    if (icons.length === 0)
        return null;
    // Sort by score descending, pick best
    icons.sort((a, b) => b.score - a.score);
    // Prefer static (png) over animated (gif/webp)
    const staticIcon = icons.find((i) => i.mime === 'image/png');
    return staticIcon?.url ?? icons[0].url;
}

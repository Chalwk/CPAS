/* Copyright (c) 2025-2026 Jericho Crosby (Chalwk) */

(function () {
    'use strict';

    /* ---------- API endpoints ---------- */

    // Datamask: CORS-native, limited NZ coverage (NZCH, NZQN).
    const DATAMASK_BASE = 'https://datamask.org/api/v1/metar';

    // VATSIM METAR: CORS-native mirror of global METARs.
    const VATSIM_BASE = 'https://metar.vatsim.net';

    // AviationWeather.gov: full coverage, no CORS headers (needs proxy).
    const AWC_BASE = 'https://aviationweather.gov/api/data/metar';
    const AWC_PROXY = 'https://api.codetabs.com/v1/proxy/?quest=';

    // Open-Meteo: general weather for any coordinate (last resort).
    const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';

    /* ---------- airport metadata ---------- */

    // ICAO -> { name, lat, lon } for Open-Meteo fallback.
    const AIRPORT_META = {
        NZCH: { name: 'Christchurch International', lat: -43.4894, lon: 172.5322 },
        NZMC: { name: 'Mount Cook Airport', lat: -43.7650, lon: 170.1333 },
        NZGT: { name: 'Glentanner Station', lat: -43.9064, lon: 170.1286 },
        NZQN: { name: 'Queenstown Airport', lat: -45.0211, lon: 168.7392 },
        NZHK: { name: 'Hokitika Airport', lat: -42.7136, lon: 170.9853 },
        NZGY: { name: 'Glenorchy Airstrip', lat: -44.8500, lon: 168.3833 },
        NZOU: { name: 'Oamaru Airport', lat: -44.9700, lon: 171.0819 },
        NZTU: { name: 'Timaru Airport', lat: -44.3028, lon: 171.2253 },
        NZMF: { name: 'Milford Sound Airport', lat: -44.6733, lon: 167.9233 },
        NZKI: { name: 'Kaikoura Airport', lat: -42.4250, lon: 173.6053 }
    };

    const AIRPORTS = window.CPAS_WEATHER_AIRPORTS || { bases: [], destinations: [] };
    const ALL_AIRPORTS = [...AIRPORTS.bases, ...AIRPORTS.destinations];

    // Stations with no METAR feed at all -> show a clear "not available" card.
    const NO_METAR_STATIONS = new Set(['NZGT', 'NZKI']);

    /* ---------- DOM refs ---------- */

    const gridBases = document.getElementById('weatherGridBases');
    const gridDest = document.getElementById('weatherGridDest');
    const refreshBtn = document.getElementById('refreshWeather');
    const lastUpdatedEl = document.getElementById('weatherLastUpdated');

    let isFetching = false;

    /* ---------- generic helpers ---------- */

    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatObsTime(unixOrIso) {
        if (!unixOrIso) return '—';
        let d;
        if (typeof unixOrIso === 'number') {
            d = new Date(unixOrIso * 1000);
        } else {
            const normalized = String(unixOrIso).replace(/\//g, '-').replace(' ', 'T') + 'Z';
            d = new Date(normalized);
        }
        if (isNaN(d.getTime())) return String(unixOrIso);
        const date = d.toLocaleDateString('en-NZ', {
            day: '2-digit', month: 'short', timeZone: 'Pacific/Auckland'
        });
        const time = d.toLocaleTimeString('en-NZ', {
            hour: '2-digit', minute: '2-digit',
            timeZone: 'Pacific/Auckland', hour12: false
        });
        return `${date} ${time} NZ`;
    }

    function relativeTime(unixOrIso) {
        if (!unixOrIso) return '';
        let t;
        if (typeof unixOrIso === 'number') {
            t = unixOrIso * 1000;
        } else {
            const normalized = String(unixOrIso).replace(/\//g, '-').replace(' ', 'T') + 'Z';
            t = new Date(normalized).getTime();
        }
        if (isNaN(t)) return '';
        const diffMin = Math.floor((Date.now() - t) / 60000);
        if (diffMin < 1) return 'just now';
        if (diffMin < 60) return `${diffMin} min ago`;
        const hours = Math.floor(diffMin / 60);
        if (hours < 24) return `${hours} hr ago`;
        return `${Math.floor(hours / 24)} d ago`;
    }

    function normalizeFlightCategory(cat) {
        if (!cat) return null;
        const c = String(cat).toUpperCase();
        return ['VFR', 'MVFR', 'IFR', 'LIFR'].includes(c) ? c : null;
    }

    function categoryClass(cat) {
        switch ((cat || '').toUpperCase()) {
            case 'VFR': return 'cat-vfr';
            case 'MVFR': return 'cat-mvfr';
            case 'IFR': return 'cat-ifr';
            case 'LIFR': return 'cat-lifr';
            default: return 'cat-unknown';
        }
    }

    function windText(wdir, wspd, wgst) {
        if (wspd == null && wdir == null) return '—';
        const dir = (wdir === 'VRB' || wdir == null)
            ? 'VRB'
            : String(wdir).padStart(3, '0') + '°';
        const spd = wspd != null ? `${wspd} kt` : '';
        const gust = wgst ? ` (gust ${wgst} kt)` : '';
        return `${dir} @ ${spd}${gust}`;
    }

    function cloudText(clouds) {
        if (!Array.isArray(clouds) || clouds.length === 0) return 'Clear';
        const map = {
            SKC: 'Clear', CLR: 'Clear', NSC: 'No significant cloud',
            FEW: 'Few', SCT: 'Scattered', BKN: 'Broken',
            OVC: 'Overcast', VV: 'Vertical visibility'
        };
        return clouds.map(c => {
            const label = map[c.cover] || map[c.quantity] || c.cover || c.quantity || '?';
            const height = c.base != null ? c.base : c.heightFt;
            return height != null ? `${label} @ ${height} ft` : label;
        }).join(', ');
    }

    function visibilityText(vis, visibRaw) {
        if (visibRaw != null) return `${visibRaw} sm`;
        if (!vis) return '—';
        if (vis.cavok) return 'CAVOK (10+ km)';
        if (vis.meters != null && vis.meters >= 9999) return '10+ km';
        if (vis.meters != null) return `${vis.meters} m (${vis.statuteMiles || '?'} sm)`;
        if (vis.statuteMiles != null) return `${vis.statuteMiles} sm`;
        return '—';
    }

    /* ---------- card renderers ---------- */

    function loadingCard(icao) {
        return `
            <div class="weather-card loading" data-icao="${escapeHtml(icao)}">
                <div class="weather-card-header">
                    <h4>${escapeHtml(icao)}</h4>
                    <span class="category-badge cat-unknown">…</span>
                </div>
                <div class="weather-card-body">
                    <p class="loading-text">
                        <i class="fas fa-spinner fa-spin"></i> Loading weather…
                    </p>
                </div>
            </div>
        `;
    }

    function errorCard(icao, message) {
        return `
            <div class="weather-card error" data-icao="${escapeHtml(icao)}">
                <div class="weather-card-header">
                    <h4>${escapeHtml(icao)}</h4>
                    <span class="category-badge cat-unknown">N/A</span>
                </div>
                <div class="weather-card-body">
                    <p class="error-text">
                        <i class="fas fa-exclamation-triangle"></i> ${escapeHtml(message)}
                    </p>
                </div>
            </div>
        `;
    }

    function noMetarCard(icao) {
        return `
            <div class="weather-card no-metar" data-icao="${escapeHtml(icao)}">
                <div class="weather-card-header">
                    <h4>${escapeHtml(icao)}</h4>
                    <span class="category-badge cat-unknown">No METAR</span>
                </div>
                <div class="weather-card-body">
                    <p class="error-text" style="color:#6b7280;">
                        <i class="fas fa-info-circle"></i>
                        This station does not publish a METAR.
                    </p>
                </div>
            </div>
        `;
    }

    /* ---------- normalisers ---------- */

    function normalizeDatamask(payload) {
        const decoded = payload.decoded || {};
        return {
            icao: payload.icao || decoded.station,
            name: payload.name || (AIRPORT_META[payload.icao]?.name || ''),
            observedAt: payload.observedAt,
            raw: payload.raw || 'No raw observation available.',
            wind: decoded.wind ? {
                direction: decoded.wind.direction,
                speedKt: decoded.wind.speedKt,
                gustKt: decoded.wind.gustKt
            } : null,
            visibility: decoded.visibility || null,
            visibRaw: null,
            clouds: decoded.clouds || [],
            temperature: decoded.temperature || {},
            qnh: decoded.qnh || {},
            flightCategory: decoded.flightCategory,
            source: 'Datamask'
        };
    }

    function normalizeAWC(payload) {
        return {
            icao: payload.icaoId,
            name: payload.name || (AIRPORT_META[payload.icaoId]?.name || ''),
            observedAt: payload.obsTime,
            raw: payload.rawOb || 'No raw observation available.',
            wind: {
                direction: payload.wdir,
                speedKt: payload.wspd,
                gustKt: payload.wgst
            },
            visibility: null,
            visibRaw: payload.visib,
            clouds: payload.clouds || [],
            temperature: { temp: payload.temp, dewpoint: payload.dewp },
            qnh: { hpa: payload.altim },
            flightCategory: payload.fltCat,
            source: 'AviationWeather'
        };
    }

    function normalizeVatsim(rawMetar) {
        // VATSIM returns raw METAR strings; parse the essentials.
        if (!rawMetar || typeof rawMetar !== 'string') return null;

        const text = rawMetar.trim();
        const windMatch = text.match(/\b(\d{3}|VRB)(\d{2,3})(G(\d{2,3}))?KT\b/);
        const tempMatch = text.match(/\b(M?)(\d{2})\/(M?)(\d{2})\b/);
        const qnhMatch = text.match(/\bQ(\d{3,4})\b/);
        const visMatch = text.match(/\b(\d{4})\b/);
        const catMatch = text.match(/\b(VFR|MVFR|IFR|LIFR)\b/i);

        let wind = null;
        if (windMatch) {
            wind = {
                direction: windMatch[1] === 'VRB' ? null : parseInt(windMatch[1], 10),
                speedKt: parseInt(windMatch[2], 10),
                gustKt: windMatch[4] ? parseInt(windMatch[4], 10) : null
            };
        }

        let temp = {}, qnh = {}, visibRaw = null;

        if (tempMatch) {
            temp.temp = (tempMatch[1] === 'M' ? -1 : 1) * parseInt(tempMatch[2], 10);
            temp.dewpoint = (tempMatch[3] === 'M' ? -1 : 1) * parseInt(tempMatch[4], 10);
        }

        if (qnhMatch) qnh.hpa = parseInt(qnhMatch[1], 10);

        if (visMatch && visMatch[1]) {
            const meters = parseInt(visMatch[1], 10);
            visibRaw = meters >= 9999 ? '10+' : (meters / 1609).toFixed(1);
        }

        return {
            icao: null, // filled in by caller
            name: '',
            observedAt: null,
            raw: text,
            wind,
            visibility: null,
            visibRaw,
            clouds: [],
            temperature: temp,
            qnh,
            flightCategory: catMatch ? catMatch[1].toUpperCase() : null,
            source: 'VATSIM'
        };
    }

    function normalizeOpenMeteo(json, icao) {
        const cur = json.current || {};
        return {
            icao,
            name: AIRPORT_META[icao]?.name || '',
            observedAt: cur.time ? cur.time + 'Z' : null,
            raw: `Open-Meteo model data (not a METAR). ${cur.time || ''}`,
            wind: {
                direction: cur.wind_direction_10m,
                speedKt: cur.wind_speed_10m != null ? Math.round(cur.wind_speed_10m / 1.852) : null,
                gustKt: cur.wind_gusts_10m != null ? Math.round(cur.wind_gusts_10m / 1.852) : null
            },
            visibility: null,
            visibRaw: cur.visibility != null ? (cur.visibility / 1609).toFixed(1) : null,
            clouds: cur.cloud_cover != null ? [{ cover: 'Cloud cover', quantity: 'Cloud cover', base: null }] : [],
            temperature: {
                temp: cur.temperature_2m,
                dewpoint: cur.dewpoint_2m
            },
            qnh: { hpa: cur.pressure_msl != null ? Math.round(cur.pressure_msl) : null },
            flightCategory: null,
            source: 'Open-Meteo'
        };
    }

    /* ---------- weather card ---------- */

    function weatherCard(data) {
        const icao = data.icao || '—';
        const name = data.name || '';
        const cat = normalizeFlightCategory(data.flightCategory);
        const raw = data.raw;
        const obs = formatObsTime(data.observedAt);
        const rel = relativeTime(data.observedAt);
        const src = data.source ? `<span style="color:#9ca3af;font-size:0.75rem;">via ${escapeHtml(data.source)}</span>` : '';

        const temp = data.temperature?.temp != null ? `${data.temperature.temp}°C` : '—';
        const dewp = data.temperature?.dewpoint != null ? `${data.temperature.dewpoint}°C` : '—';
        const wind = data.wind
            ? windText(data.wind.direction, data.wind.speedKt, data.wind.gustKt)
            : '—';
        const vis = visibilityText(data.visibility, data.visibRaw);
        const qnh = data.qnh?.hpa != null ? `${data.qnh.hpa} hPa` : '—';
        const clouds = cloudText(data.clouds);

        return `
            <div class="weather-card" data-icao="${escapeHtml(icao)}">
                <div class="weather-card-header">
                    <div>
                        <h4>${escapeHtml(icao)}</h4>
                        ${name ? `<span class="airport-name">${escapeHtml(name)}</span>` : ''}
                    </div>
                    <span class="category-badge ${categoryClass(cat)}">${cat || 'N/A'}</span>
                </div>
                <div class="weather-card-body">
                    <div class="weather-fields">
                        <div class="wf">
                            <span class="wf-label"><i class="fas fa-wind"></i> Wind</span>
                            <span class="wf-value">${wind}</span>
                        </div>
                        <div class="wf">
                            <span class="wf-label"><i class="fas fa-eye"></i> Visibility</span>
                            <span class="wf-value">${vis}</span>
                        </div>
                        <div class="wf">
                            <span class="wf-label"><i class="fas fa-temperature-half"></i> Temp</span>
                            <span class="wf-value">${temp}</span>
                        </div>
                        <div class="wf">
                            <span class="wf-label"><i class="fas fa-droplet"></i> Dewpoint</span>
                            <span class="wf-value">${dewp}</span>
                        </div>
                        <div class="wf">
                            <span class="wf-label"><i class="fas fa-gauge-high"></i> QNH</span>
                            <span class="wf-value">${qnh}</span>
                        </div>
                        <div class="wf">
                            <span class="wf-label"><i class="fas fa-cloud"></i> Clouds</span>
                            <span class="wf-value">${clouds}</span>
                        </div>
                    </div>
                    <div class="raw-metar">
                        <div class="raw-metar-label">Raw / Source</div>
                        <code>${escapeHtml(raw)}</code>
                    </div>
                    <div class="weather-card-footer">
                        <i class="fas fa-clock"></i>
                        ${obs !== '—' ? `Observed: ${obs}${rel ? ` (${rel})` : ''}` : 'Estimated'}
                        ${src}
                    </div>
                </div>
            </div>
        `;
    }

    /* ---------- fetch strategies ---------- */

    // Strategy 1: AWC via CORS proxy.
    async function fetchViaAWCProxy(icaos) {
        const ids = icaos.join(',');
        const target = `${AWC_BASE}?ids=${ids}&format=json`;
        const url = AWC_PROXY + encodeURIComponent(target);

        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) throw new Error(`AWC proxy HTTP ${res.status}`);

        const text = await res.text();
        if (!text.trim()) return {};

        let data;
        try { data = JSON.parse(text); } catch (e) { throw new Error('Invalid JSON from AWC proxy'); }
        if (!Array.isArray(data)) return {};

        const map = {};
        data.forEach(item => {
            if (item && item.icaoId) map[String(item.icaoId).toUpperCase()] = normalizeAWC(item);
        });
        return map;
    }

    // Strategy 2: VATSIM METAR (CORS-native, no proxy needed).
    async function fetchViaVatsim(icaos) {
        const ids = icaos.join(',');
        const url = `${VATSIM_BASE}/${ids}`;
        const res = await fetch(url, { headers: { 'Accept': 'text/plain' } });
        if (!res.ok) throw new Error(`VATSIM HTTP ${res.status}`);

        const text = await res.text();
        const map = {};

        // Response is newline-delimited METAR strings.
        text.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;
            const icaoMatch = trimmed.match(/^([A-Z]{4})\s/);
            if (!icaoMatch) return;
            const icao = icaoMatch[1];
            const normalized = normalizeVatsim(trimmed);
            if (normalized) {
                normalized.icao = icao;
                map[icao] = normalized;
            }
        });
        return map;
    }

    // Strategy 3: Datamask per-station.
    async function fetchViaDatamask(icaos) {
        const map = {};
        await Promise.all(icaos.map(async (icao) => {
            try {
                const res = await fetch(`${DATAMASK_BASE}/${encodeURIComponent(icao)}`, {
                    headers: { 'Accept': 'application/json' }
                });
                if (res.status === 404) return;
                if (!res.ok) return;
                const payload = await res.json();
                map[String(icao).toUpperCase()] = normalizeDatamask(payload);
            } catch (e) { /* swallow */ }
        }));
        return map;
    }

    // Strategy 4: Open-Meteo per-station (general weather, not aviation).
    async function fetchViaOpenMeteo(icaos) {
        const map = {};
        await Promise.all(icaos.map(async (icao) => {
            const meta = AIRPORT_META[icao];
            if (!meta) return;
            try {
                const params = new URLSearchParams({
                    latitude: meta.lat,
                    longitude: meta.lon,
                    current: 'temperature_2m,dewpoint_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,visibility,cloud_cover',
                    wind_speed_unit: 'kmh',
                    timezone: 'Pacific/Auckland'
                });
                const res = await fetch(`${OPEN_METEO_BASE}?${params}`, {
                    headers: { 'Accept': 'application/json' }
                });
                if (!res.ok) return;
                const json = await res.json();
                map[icao] = normalizeOpenMeteo(json, icao);
            } catch (e) { /* swallow */ }
        }));
        return map;
    }

    // Combine all sources, prioritising aviation-grade data.
    async function fetchAll(icaos) {
        const combined = {};
        const stillMissing = () => icaos.filter(i => !combined[i]);

        // 1. AWC via proxy (best data, global coverage)
        try {
            console.log('[weather] Trying AWC via proxy…');
            const map = await fetchViaAWCProxy(icaos);
            Object.assign(combined, map);
            console.log(`[weather] AWC returned ${Object.keys(map).length}/${icaos.length}.`);
        } catch (err) {
            console.warn('[weather] AWC proxy failed:', err.message);
        }

        // 2. VATSIM METAR (CORS-native, global coverage)
        if (stillMissing().length > 0) {
            try {
                console.log('[weather] Trying VATSIM METAR…');
                const map = await fetchViaVatsim(stillMissing());
                Object.assign(combined, map);
                console.log(`[weather] VATSIM added ${Object.keys(map).length} stations.`);
            } catch (err) {
                console.warn('[weather] VATSIM failed:', err.message);
            }
        }

        // 3. Datamask (CORS-native, limited coverage)
        if (stillMissing().length > 0) {
            try {
                console.log('[weather] Trying Datamask…');
                const map = await fetchViaDatamask(stillMissing());
                Object.assign(combined, map);
                console.log(`[weather] Datamask added ${Object.keys(map).length} stations.`);
            } catch (err) {
                console.warn('[weather] Datamask failed:', err.message);
            }
        }

        // 4. Open-Meteo (general weather, last resort)
        if (stillMissing().length > 0) {
            try {
                console.log('[weather] Trying Open-Meteo fallback…');
                const map = await fetchViaOpenMeteo(stillMissing());
                Object.assign(combined, map);
                console.log(`[weather] Open-Meteo added ${Object.keys(map).length} stations.`);
            } catch (err) {
                console.warn('[weather] Open-Meteo failed:', err.message);
            }
        }

        return combined;
    }

    /* ---------- rendering ---------- */

    function renderGroup(container, icaos, dataMap) {
        if (!container) return;
        container.innerHTML = icaos.map(icao => {
            const key = String(icao).toUpperCase();
            if (NO_METAR_STATIONS.has(key)) return noMetarCard(icao);
            const d = dataMap[key];
            if (!d) return errorCard(icao, 'No weather data available for this station.');
            return weatherCard(d);
        }).join('');
    }

    function setLastUpdated() {
        if (!lastUpdatedEl) return;
        const time = new Date().toLocaleTimeString('en-NZ', {
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            timeZone: 'Pacific/Auckland', hour12: false
        });
        lastUpdatedEl.textContent = `${time} NZ`;
    }

    async function loadWeather() {
        if (isFetching) return;
        isFetching = true;

        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing…';
        }
        if (gridBases) gridBases.innerHTML = AIRPORTS.bases.map(loadingCard).join('');
        if (gridDest) gridDest.innerHTML = AIRPORTS.destinations.map(loadingCard).join('');

        try {
            const dataMap = await fetchAll(ALL_AIRPORTS);
            renderGroup(gridBases, AIRPORTS.bases, dataMap);
            renderGroup(gridDest, AIRPORTS.destinations, dataMap);
            setLastUpdated();
        } catch (err) {
            console.error('[weather] Fatal error:', err);
            const msg = `Failed to load weather data (${err.message || 'unknown error'}).`;
            if (gridBases) gridBases.innerHTML = AIRPORTS.bases.map(i => errorCard(i, msg)).join('');
            if (gridDest) gridDest.innerHTML = AIRPORTS.destinations.map(i => errorCard(i, msg)).join('');
        } finally {
            isFetching = false;
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = '<i class="fas fa-redo"></i> Refresh';
            }
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        loadWeather();
        if (refreshBtn) refreshBtn.addEventListener('click', loadWeather);
    });
})();
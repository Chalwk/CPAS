/* Copyright (c) 2025-2026 Jericho Crosby (Chalwk) */

(function () {
    'use strict';

    /* =========================================================
     * Configuration
     * ========================================================= */

    const CONFIG = {
        autoRefreshMs: 10 * 60 * 1000,  // 10 minutes
        cacheTtlMs:     8 * 60 * 1000,  // 8 minutes
        cacheKey:      'cpas.weather.v2',
        timeoutMs:     12000
    };

    const API = {
        // CORS-native, reliable raw METAR feed.
        VATSIM: 'https://metar.vatsim.net',
        // Full global coverage, no CORS headers - must go through a proxy.
        AWC:    'https://aviationweather.gov/api/data/metar',
        AWC_PROXIES: [
            'https://api.codetabs.com/v1/proxy/?quest=',
            'https://corsproxy.io/?url='
        ],
        DATAMASK:   'https://datamask.org/api/v1/metar',
        OPEN_METEO: 'https://api.open-meteo.com/v1/forecast'
    };

    /* ---------- Airport metadata (used for names / Open-Meteo) ---------- */

    const AIRPORT_META = {
        NZCH: { name: 'Christchurch International', lat: -43.4894, lon: 172.5322 },
        NZMC: { name: 'Mount Cook Airport',         lat: -43.7650, lon: 170.1333 },
        NZGT: { name: 'Glentanner Station',         lat: -43.9064, lon: 170.1286 },
        NZQN: { name: 'Queenstown Airport',         lat: -45.0211, lon: 168.7392 },
        NZHK: { name: 'Hokitika Airport',           lat: -42.7136, lon: 170.9853 },
        NZGY: { name: 'Glenorchy Airstrip',         lat: -44.8500, lon: 168.3833 },
        NZOU: { name: 'Oamaru Airport',             lat: -44.9700, lon: 171.0819 },
        NZTU: { name: 'Timaru Airport',             lat: -44.3028, lon: 171.2253 },
        NZMF: { name: 'Milford Sound Airport',      lat: -44.6733, lon: 167.9233 },
        NZKI: { name: 'Kaikoura Airport',           lat: -42.4250, lon: 173.6053 }
    };

    const AIRPORTS = window.CPAS_WEATHER_AIRPORTS || { bases: [], destinations: [] };
    const ALL_AIRPORTS = [...new Set([...(AIRPORTS.bases || []), ...(AIRPORTS.destinations || [])])];
    const NO_METAR_STATIONS = new Set(window.CPAS_NO_METAR || ['NZGT', 'NZKI']);

    /* =========================================================
     * DOM
     * ========================================================= */

    const gridBases     = document.getElementById('weatherGridBases');
    const gridDest      = document.getElementById('weatherGridDest');
    const refreshBtn    = document.getElementById('refreshWeather');
    const lastUpdatedEl = document.getElementById('weatherLastUpdated');

    let isFetching = false;
    let autoRefreshTimer = null;

    /* =========================================================
     * Small utilities
     * ========================================================= */

    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function fetchWithTimeout(url, opts) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), CONFIG.timeoutMs);
        return fetch(url, Object.assign({}, opts, { signal: controller.signal }))
            .finally(() => clearTimeout(id));
    }

    function toMs(value) {
        if (value == null) return null;
        if (typeof value === 'number') {
            // Heuristic: seconds vs milliseconds.
            return value < 1e12 ? value * 1000 : value;
        }
        const s = String(value).trim().replace(/\//g, '-').replace(' ', 'T');
        const d = new Date(/Z|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z');
        return isNaN(d.getTime()) ? null : d.getTime();
    }

    function formatObsTime(ts) {
        const ms = toMs(ts);
        if (ms == null) return '-';
        const d = new Date(ms);
        const date = d.toLocaleDateString('en-NZ', {
            day: '2-digit', month: 'short', timeZone: 'Pacific/Auckland'
        });
        const time = d.toLocaleTimeString('en-NZ', {
            hour: '2-digit', minute: '2-digit',
            timeZone: 'Pacific/Auckland', hour12: false
        });
        return `${date} ${time} NZ`;
    }

    function relativeTime(ts) {
        const ms = toMs(ts);
        if (ms == null) return '';
        const diffMin = Math.floor((Date.now() - ms) / 60000);
        if (diffMin < 0)   return 'in the future';
        if (diffMin < 1)   return 'just now';
        if (diffMin < 60)  return `${diffMin} min ago`;
        const hours = Math.floor(diffMin / 60);
        if (hours < 24)    return `${hours} hr ago`;
        return `${Math.floor(hours / 24)} d ago`;
    }

    function freshnessClass(ts) {
        const ms = toMs(ts);
        if (ms == null) return '';
        const mins = (Date.now() - ms) / 60000;
        if (mins <= 60) return 'fresh';
        if (mins <= 180) return 'stale';
        return 'old';
    }

    function normalizeFlightCategory(cat) {
        if (!cat) return null;
        const c = String(cat).toUpperCase();
        return ['VFR', 'MVFR', 'IFR', 'LIFR'].includes(c) ? c : null;
    }

    function categoryClass(cat) {
        switch ((cat || '').toUpperCase()) {
            case 'VFR':  return 'cat-vfr';
            case 'MVFR': return 'cat-mvfr';
            case 'IFR':  return 'cat-ifr';
            case 'LIFR': return 'cat-lifr';
            default:     return 'cat-unknown';
        }
    }

    /* =========================================================
     * METAR parser
     * ========================================================= */

    // Flight category thresholds (US-style, matching the legend).
    function ceilingCategory(ceilingFt) {
        if (ceilingFt == null) return 'VFR';
        if (ceilingFt < 500)   return 'LIFR';
        if (ceilingFt < 1000)  return 'IFR';
        if (ceilingFt <= 3000) return 'MVFR';
        return 'VFR';
    }

    function visibilityCategory(visSm) {
        if (visSm == null) return 'VFR';
        if (visSm < 1)    return 'LIFR';
        if (visSm < 3)    return 'IFR';
        if (visSm <= 5)   return 'MVFR';
        return 'VFR';
    }

    function computeFlightCategory(clouds, visibility) {
        let ceiling = null;
        if (Array.isArray(clouds)) {
            for (const c of clouds) {
                if (!c || c.base == null) continue;
                const cover = String(c.cover || '').toUpperCase();
                if (cover === 'BKN' || cover === 'OVC' || cover === 'VV') {
                    if (ceiling == null || c.base < ceiling) ceiling = c.base;
                }
            }
        }

        let visSm = null;
        if (visibility) {
            if (visibility.statuteMiles != null) {
                visSm = visibility.statuteMiles;
            } else if (visibility.meters != null) {
                visSm = visibility.meters / 1609.34;
            }
        }

        const order = { VFR: 0, MVFR: 1, IFR: 2, LIFR: 3 };
        const cCat = ceilingCategory(ceiling);
        const vCat = visibilityCategory(visSm);
        return order[cCat] >= order[vCat] ? cCat : vCat;
    }

    const WX_RE = /^(?:\+|-|VC)?(?:MI|PR|BC|DR|BL|SH|TS|FZ)?(?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)+$/;

    function parseMetar(rawInput) {
        if (!rawInput || typeof rawInput !== 'string') return null;

        const raw = rawInput.trim();
        if (raw.length < 8) return null;

        // Strip leading "METAR" / "SPECI".
        let text = raw.toUpperCase().replace(/^(METAR|SPECI)\s+/, '');
        if (text.endsWith('=')) text = text.slice(0, -1).trim();

        const out = {
            raw,
            icao: null,
            observedAt: null,
            wind: null,
            visibility: null,
            visibRaw: null,
            weather: [],
            clouds: [],
            temperature: {},
            qnh: {},
            flightCategory: null
        };

        // --- Station ---
        const icaoMatch = text.match(/^([A-Z][A-Z0-9]{3})\b/);
        if (icaoMatch) out.icao = icaoMatch[1];

        // --- Observation time (DDHHMMZ) ---
        const timeMatch = text.match(/\b(\d{2})(\d{2})(\d{2})Z\b/);
        if (timeMatch) {
            const now = new Date();
            const day = +timeMatch[1];
            const hh  = +timeMatch[2];
            const mm  = +timeMatch[3];
            let ts = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, hh, mm, 0);
            // If the "day" is more than 12h in the future, it's likely last month.
            if (ts - now.getTime() > 12 * 3600 * 1000) {
                ts -= 30 * 24 * 3600 * 1000;
            }
            out.observedAt = ts;
        }

        // --- Wind ---
        const windM = text.match(/\b(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS|KMH)\b/);
        if (windM) {
            let spd = +windM[2];
            let gst = windM[3] ? +windM[3] : null;
            const unit = windM[4];
            if (unit === 'MPS') {
                spd = Math.round(spd * 1.94384);
                if (gst != null) gst = Math.round(gst * 1.94384);
            } else if (unit === 'KMH') {
                spd = Math.round(spd / 1.852);
                if (gst != null) gst = Math.round(gst / 1.852);
            }
            const isCalm = windM[1] === '000' && spd === 0;
            out.wind = {
                direction: (windM[1] === 'VRB' || isCalm) ? null : +windM[1],
                speedKt:   spd,
                gustKt:    gst,
                variable:  windM[1] === 'VRB',
                calm:      isCalm
            };
        }

        // --- Visibility ---
        // 1) CAVOK
        if (/\bCAVOK\b/.test(text)) {
            out.visibility = { cavok: true, meters: 9999, statuteMiles: 6.2 };
            out.visibRaw = 'CAVOK (10+ km)';
        } else {
            // 2) Statute-mile forms: P6SM, M1/4SM, 1/2SM, 10SM, "1 1/2SM"
            let visSm = null;
            let visRaw = null;
            let m;

            if ((m = text.match(/\b(P|M)?(\d+)\s(\d+)\/(\d+)SM\b/))) {
                visSm = (+m[2]) + ((+m[3]) / (+m[4]));
                visRaw = `${m[1] || ''}${m[2]} ${m[3]}/${m[4]} SM`;
            } else if ((m = text.match(/\b(P|M)?(\d+)\/(\d+)SM\b/))) {
                visSm = (+m[2]) / (+m[3]);
                visRaw = `${m[1] || ''}${m[2]}/${m[3]} SM`;
            } else if ((m = text.match(/\b(P|M)?(\d+)SM\b/))) {
                visSm = +m[2];
                visRaw = `${m[1] || ''}${m[2]} SM`;
            }

            if (visSm != null) {
                if (m && m[1] === 'P') {
                    visSm = Math.max(visSm, 6.2);
                } else if (m && m[1] === 'M') {
                    visSm = Math.max(0, visSm - 0.05);
                }
                out.visibility = {
                    statuteMiles: +visSm.toFixed(2),
                    meters: Math.round(visSm * 1609.34)
                };
                out.visibRaw = visRaw;
            } else {
                // 3) Metre form (4-digit standalone number after station + time)
                const stripped = text
                    .replace(/^[A-Z][A-Z0-9]{3}\s+/, '')
                    .replace(/\b\d{6}Z\b/, ' ')
                    .replace(/\b\d{3}V\d{3}\b/, ' ');
                const mv = stripped.match(/\b(\d{4})\b/);
                if (mv) {
                    const meters = +mv[1];
                    if (meters >= 9999) {
                        out.visibility = { meters: 9999, statuteMiles: 6.2 };
                        out.visibRaw = '10+ km';
                    } else {
                        out.visibility = {
                            meters,
                            statuteMiles: +(meters / 1609.34).toFixed(2)
                        };
                        out.visibRaw = `${meters} m`;
                    }
                }
            }
        }

        // --- Weather phenomena ---
        const tokens = text.split(/\s+/);
        for (const tok of tokens) {
            if (tok.length < 2 || tok.length > 9) continue;
            if (/^(NOSIG|AUTO|COR|RTD|NSC|NCD|SKC|CLR)$/.test(tok)) continue;
            if (/^(FEW|SCT|BKN|OVC|VV)/.test(tok)) continue;
            if (WX_RE.test(tok)) out.weather.push(tok);
        }

        // --- Clouds ---
        const cloudRe = /\b(FEW|SCT|BKN|OVC|VV)(\d{3}|NO|\/{3})(CB|TCU|ACC|\/\/\/)?\b/g;
        let cm;
        while ((cm = cloudRe.exec(text)) !== null) {
            const cover = cm[1];
            const baseRaw = cm[2];
            const base = (baseRaw === 'NO' || baseRaw.indexOf('/') !== -1)
                ? null
                : (+baseRaw) * 100;
            out.clouds.push({
                cover,
                base,
                type: cm[3] && cm[3].indexOf('/') === -1 ? cm[3] : null
            });
        }

        // --- Temperature / dewpoint ---
        const tempM = text.match(/\b(M?\d{2})\/(M?\d{2})\b/);
        if (tempM) {
            const t = tempM[1].startsWith('M') ? -(+tempM[1].slice(1)) : +tempM[1];
            const d = tempM[2].startsWith('M') ? -(+tempM[2].slice(1)) : +tempM[2];
            out.temperature = { temp: t, dewpoint: d };
        }

        // --- QNH ---
        const qm = text.match(/\bQ(\d{3,4})\b/);
        if (qm) {
            let hpa = +qm[1];
            if (hpa < 1000) hpa *= 10;   // Q0998 style
            out.qnh.hpa = hpa;
        } else {
            const am = text.match(/\bA(\d{4})\b/);
            if (am) {
                const inHg = (+am[1]) / 100;
                out.qnh.hpa = Math.round(inHg * 33.8639);
                out.qnh.inHg = inHg;
            }
        }

        // --- Derived ---
        out.flightCategory = computeFlightCategory(out.clouds, out.visibility);

        return out;
    }

    /* =========================================================
     * Formatters
     * ========================================================= */

    function windText(w) {
        if (!w) return '-';
        if (w.calm) return 'Calm';
        const dir = w.direction != null
            ? String(w.direction).padStart(3, '0') + '°'
            : 'VRB';
        const spd = w.speedKt != null ? `${w.speedKt} kt` : '';
        const gust = w.gustKt ? ` (gust ${w.gustKt} kt)` : '';
        return `${dir} @ ${spd}${gust}`;
    }

    function visibilityText(v, visibRaw) {
        if (visibRaw) return visibRaw;
        if (!v) return '-';
        if (v.cavok) return 'CAVOK (10+ km)';
        if (v.meters != null && v.meters >= 9999) return '10+ km';
        if (v.meters != null) {
            return `${v.meters} m (${v.statuteMiles != null ? v.statuteMiles + ' sm' : '?'})`;
        }
        if (v.statuteMiles != null) return `${v.statuteMiles} sm`;
        return '-';
    }

    const CLOUD_LABELS = {
        SKC: 'Clear', CLR: 'Clear', NSC: 'No significant cloud',
        NCD: 'No cloud detected',
        FEW: 'Few', SCT: 'Scattered', BKN: 'Broken',
        OVC: 'Overcast', VV: 'Vertical visibility'
    };

    function cloudText(clouds) {
        if (!Array.isArray(clouds) || clouds.length === 0) return 'Clear';
        return clouds.map(c => {
            const label = CLOUD_LABELS[c.cover] || c.cover || '?';
            if (c.base == null) return label;
            const type = c.type ? ` ${c.type}` : '';
            return `${label}${type} @ ${c.base.toLocaleString()} ft`;
        }).join(', ');
    }

    function weatherText(wx) {
        if (!Array.isArray(wx) || wx.length === 0) return null;
        return wx.join(' ');
    }

    function dewpointSpread(t, d) {
        if (t == null || d == null) return null;
        const spread = Math.round((t - d) * 10) / 10;
        let risk = 'low';
        if (spread <= 2) risk = 'high';
        else if (spread <= 5) risk = 'med';
        return { spread, risk };
    }

    /* =========================================================
     * Card renderers
     * ========================================================= */

    function loadingCard(icao) {
        return `
            <div class="weather-card loading" data-icao="${escapeHtml(icao)}">
                <div class="weather-card-header">
                    <h4>${escapeHtml(icao)}</h4>
                    <span class="category-badge cat-unknown">…</span>
                </div>
                <div class="weather-card-body">
                    <div class="weather-fields">
                        <div class="wf"><div class="skeleton-line" style="width:60%"></div><div class="skeleton-line" style="width:90%"></div></div>
                        <div class="wf"><div class="skeleton-line" style="width:60%"></div><div class="skeleton-line" style="width:80%"></div></div>
                        <div class="wf"><div class="skeleton-line" style="width:60%"></div><div class="skeleton-line" style="width:70%"></div></div>
                        <div class="wf"><div class="skeleton-line" style="width:60%"></div><div class="skeleton-line" style="width:75%"></div></div>
                    </div>
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
                        <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
                        ${escapeHtml(message)}
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
                    <p class="error-text">
                        <i class="fas fa-info-circle" aria-hidden="true"></i>
                        This station does not publish a METAR.
                    </p>
                </div>
            </div>
        `;
    }

    function weatherCard(d) {
        const icao = d.icao || '-';
        const name = d.name || '';
        const cat  = normalizeFlightCategory(d.flightCategory);
        const raw  = d.raw || 'No raw observation available.';
        const obs  = formatObsTime(d.observedAt);
        const rel  = relativeTime(d.observedAt);
        const fresh = freshnessClass(d.observedAt);

        const temp = d.temperature?.temp      != null ? `${d.temperature.temp}°C`      : '-';
        const dewp = d.temperature?.dewpoint  != null ? `${d.temperature.dewpoint}°C`  : '-';
        const spread = dewpointSpread(d.temperature?.temp, d.temperature?.dewpoint);

        const wind = windText(d.wind);
        const vis  = visibilityText(d.visibility, d.visibRaw);
        const qnh  = d.qnh?.hpa != null ? `${d.qnh.hpa} hPa` : '-';
        const clouds = cloudText(d.clouds);
        const wx = weatherText(d.weather);

        const spreadHtml = spread && spread.spread <= 5
            ? `<span class="spread-pill risk-${spread.risk === 'med' ? 'med' : spread.risk === 'high' ? 'high' : 'low'}">Δ${spread.spread}°</span>`
            : '';

        const footerLeft = obs !== '-'
            ? `<i class="fas fa-clock" aria-hidden="true"></i>
               <span><span class="freshness-dot ${fresh}"></span> Observed ${escapeHtml(obs)}${rel ? ` (${escapeHtml(rel)})` : ''}</span>`
            : `<i class="fas fa-clock" aria-hidden="true"></i> <span>Estimated</span>`;

        const footerRight = d.source
            ? `<span>via ${escapeHtml(d.source)}</span>`
            : '';

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
                            <span class="wf-value">${escapeHtml(wind)}</span>
                        </div>
                        <div class="wf">
                            <span class="wf-label"><i class="fas fa-eye"></i> Visibility</span>
                            <span class="wf-value">${escapeHtml(vis)}</span>
                        </div>
                        <div class="wf">
                            <span class="wf-label"><i class="fas fa-temperature-half"></i> Temp</span>
                            <span class="wf-value">${escapeHtml(temp)}</span>
                        </div>
                        <div class="wf">
                            <span class="wf-label"><i class="fas fa-droplet"></i> Dewpoint</span>
                            <span class="wf-value">${escapeHtml(dewp)}${spreadHtml}</span>
                        </div>
                        <div class="wf">
                            <span class="wf-label"><i class="fas fa-gauge-high"></i> QNH</span>
                            <span class="wf-value">${escapeHtml(qnh)}</span>
                        </div>
                        <div class="wf">
                            <span class="wf-label"><i class="fas fa-cloud"></i> Clouds</span>
                            <span class="wf-value">${escapeHtml(clouds)}</span>
                        </div>
                        ${wx ? `
                        <div class="wf full">
                            <span class="wf-label"><i class="fas fa-cloud-rain"></i> Weather</span>
                            <span class="wf-value">${escapeHtml(wx)}</span>
                        </div>` : ''}
                    </div>
                    <div class="raw-metar">
                        <div class="raw-metar-head">
                            <span class="raw-metar-label">Raw METAR</span>
                            <button type="button" class="copy-metar" data-copy="${escapeHtml(raw)}" aria-label="Copy raw METAR for ${escapeHtml(icao)}">
                                <i class="fas fa-copy" aria-hidden="true"></i> Copy
                            </button>
                        </div>
                        <code>${escapeHtml(raw)}</code>
                    </div>
                    <div class="weather-card-footer">
                        <span class="footer-left">${footerLeft}</span>
                        <span class="footer-right">${footerRight}</span>
                    </div>
                </div>
            </div>
        `;
    }

    /* =========================================================
     * Data sources
     * ========================================================= */

    // All sources return an object of { ICAO: rawMetarString }.

    async function fetchFromVatsim(icaos) {
        const url = `${API.VATSIM}/${icaos.join(',')}`;
        const res = await fetchWithTimeout(url, { headers: { Accept: 'text/plain' } });
        if (!res.ok) throw new Error(`VATSIM HTTP ${res.status}`);

        const text = await res.text();
        const out = {};
        text.split(/\r?\n/).forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;
            const m = trimmed.match(/^([A-Z][A-Z0-9]{3})\s+/);
            if (!m) return;
            const icao = m[1].toUpperCase();
            if (icaos.indexOf(icao) === -1) return;
            out[icao] = trimmed;
        });
        return out;
    }

    async function fetchFromAWCProxy(icaos) {
        const target = `${API.AWC}?ids=${icaos.join(',')}&format=json`;
        let lastErr;

        for (const proxy of API.AWC_PROXIES) {
            try {
                const url = proxy + encodeURIComponent(target);
                const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const text = await res.text();
                if (!text.trim()) throw new Error('empty response');
                const data = JSON.parse(text);
                if (!Array.isArray(data)) throw new Error('unexpected payload');

                const out = {};
                data.forEach(item => {
                    if (!item || !item.icaoId || !item.rawOb) return;
                    const icao = String(item.icaoId).toUpperCase();
                    if (icaos.indexOf(icao) === -1) return;
                    out[icao] = String(item.rawOb).trim();
                });
                return out;
            } catch (e) {
                lastErr = e;
            }
        }
        throw lastErr || new Error('All AWC proxies failed');
    }

    async function fetchFromDatamask(icaos) {
        const out = {};
        await Promise.all(icaos.map(async icao => {
            try {
                const res = await fetchWithTimeout(`${API.DATAMASK}/${encodeURIComponent(icao)}`, {
                    headers: { Accept: 'application/json' }
                });
                if (!res.ok) return;
                const payload = await res.json();
                const raw = payload && (payload.raw || (payload.decoded && payload.decoded.raw));
                if (raw) out[icao.toUpperCase()] = String(raw).trim();
            } catch (_) { /* swallow per-station errors */ }
        }));
        return out;
    }

    // Open-Meteo returns already-normalised objects (not raw METARs).
    async function fetchFromOpenMeteo(icaos) {
        const out = {};
        await Promise.all(icaos.map(async icao => {
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
                const res = await fetchWithTimeout(`${API.OPEN_METEO}?${params}`, {
                    headers: { Accept: 'application/json' }
                });
                if (!res.ok) return;
                const json = await res.json();
                out[icao] = normalizeOpenMeteo(json, icao);
            } catch (_) { /* swallow */ }
        }));
        return out;
    }

    function normalizeOpenMeteo(json, icao) {
        const cur = json.current || {};
        const meta = AIRPORT_META[icao] || {};
        const windKt = cur.wind_speed_10m != null ? Math.round(cur.wind_speed_10m / 1.852) : null;
        const gustKt = cur.wind_gusts_10m != null ? Math.round(cur.wind_gusts_10m / 1.852) : null;

        return {
            icao,
            name: meta.name || '',
            observedAt: cur.time ? new Date(cur.time + 'Z').getTime() : Date.now(),
            raw: [
                'Open-Meteo model data - NOT a METAR.',
                `Time: ${cur.time || 'n/a'}`,
                `Wind: ${cur.wind_speed_10m ?? '-'} km/h @ ${cur.wind_direction_10m ?? '-'}°`,
                `Temp: ${cur.temperature_2m ?? '-'}°C  Dewpoint: ${cur.dewpoint_2m ?? '-'}°C`,
                `Pressure: ${cur.pressure_msl ?? '-'} hPa  Cloud cover: ${cur.cloud_cover ?? '-'}%`
            ].join('\n'),
            wind: {
                direction: cur.wind_direction_10m != null ? cur.wind_direction_10m : null,
                speedKt: windKt,
                gustKt: gustKt
            },
            visibility: cur.visibility != null ? {
                meters: cur.visibility,
                statuteMiles: +(cur.visibility / 1609.34).toFixed(2)
            } : null,
            visibRaw: cur.visibility != null ? `${(cur.visibility / 1000).toFixed(1)} km` : null,
            weather: [],
            clouds: cur.cloud_cover != null
                ? [{ cover: 'Cloud cover', base: null, pct: cur.cloud_cover }]
                : [],
            temperature: {
                temp: cur.temperature_2m,
                dewpoint: cur.dewpoint_2m
            },
            qnh: { hpa: cur.pressure_msl != null ? Math.round(cur.pressure_msl) : null },
            flightCategory: null,
            source: 'Open-Meteo (model)'
        };
    }

    /* =========================================================
     * Orchestration
     * ========================================================= */

    async function fetchAllWeather() {
        const rawMap = {};       // ICAO -> { raw, source }
        const remaining = () => ALL_AIRPORTS.filter(i => !rawMap[i]);

        const sources = [
            { name: 'VATSIM',   fn: fetchFromVatsim },
            { name: 'AWC',      fn: fetchFromAWCProxy },
            { name: 'Datamask', fn: fetchFromDatamask }
        ];

        for (const { name, fn } of sources) {
            const missing = remaining();
            if (!missing.length) break;
            try {
                const partial = await fn(missing);
                Object.keys(partial).forEach(icao => {
                    const key = icao.toUpperCase();
                    if (!rawMap[key]) {
                        rawMap[key] = { raw: partial[icao], source: name };
                    }
                });
            } catch (e) {
                console.warn(`[weather] ${name} failed:`, e.message);
            }
        }

        // Parse raw METAR strings.
        const result = {};
        Object.keys(rawMap).forEach(icao => {
            const entry = rawMap[icao];
            const parsed = parseMetar(entry.raw);
            if (!parsed) return;
            parsed.icao = icao;
            parsed.name = AIRPORT_META[icao]?.name || '';
            parsed.source = entry.source;
            result[icao] = parsed;
        });

        // Open-Meteo fallback (skip known no-METAR stations).
        const missing = ALL_AIRPORTS.filter(i => !result[i] && !NO_METAR_STATIONS.has(i));
        if (missing.length) {
            try {
                const partial = await fetchFromOpenMeteo(missing);
                Object.assign(result, partial);
            } catch (e) {
                console.warn('[weather] Open-Meteo failed:', e.message);
            }
        }

        return result;
    }

    /* =========================================================
     * Rendering
     * ========================================================= */

    function renderGroup(container, icaos, dataMap) {
        if (!container) return;
        container.innerHTML = icaos.map(icao => {
            const key = String(icao).toUpperCase();
            const d = dataMap[key];
            if (d) return weatherCard(d);
            if (NO_METAR_STATIONS.has(key)) return noMetarCard(key);
            return errorCard(key, 'No weather data available for this station.');
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

    /* =========================================================
     * Cache
     * ========================================================= */

    function saveCache(dataMap) {
        try {
            localStorage.setItem(CONFIG.cacheKey, JSON.stringify({
                t: Date.now(),
                d: dataMap
            }));
        } catch (_) { /* quota / private mode */ }
    }

    function loadCache() {
        try {
            const raw = localStorage.getItem(CONFIG.cacheKey);
            if (!raw) return null;
            const obj = JSON.parse(raw);
            if (!obj || !obj.t || !obj.d) return null;
            if (Date.now() - obj.t > CONFIG.cacheTtlMs) return null;
            return obj.d;
        } catch (_) { return null; }
    }

    /* =========================================================
     * Main flow
     * ========================================================= */

    async function loadWeather(opts) {
        opts = opts || {};
        if (isFetching) return;
        isFetching = true;

        const useCache = !opts.force;

        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing…';
        }

        // Try cache first for instant render.
        if (useCache) {
            const cached = loadCache();
            if (cached) {
                renderGroup(gridBases, AIRPORTS.bases || [], cached);
                renderGroup(gridDest,  AIRPORTS.destinations || [], cached);
                setLastUpdated();
                isFetching = false;
                if (refreshBtn) {
                    refreshBtn.disabled = false;
                    refreshBtn.innerHTML = '<i class="fas fa-redo"></i> Refresh';
                }
                // Silently revalidate in the background.
                loadWeather({ force: true, silent: true });
                return;
            }
        }

        // Skeleton while we fetch.
        if (!opts.silent) {
            if (gridBases) gridBases.innerHTML = (AIRPORTS.bases || []).map(loadingCard).join('');
            if (gridDest)  gridDest.innerHTML  = (AIRPORTS.destinations || []).map(loadingCard).join('');
        }

        try {
            const dataMap = await fetchAllWeather();
            renderGroup(gridBases, AIRPORTS.bases || [], dataMap);
            renderGroup(gridDest,  AIRPORTS.destinations || [], dataMap);
            setLastUpdated();
            saveCache(dataMap);
        } catch (err) {
            console.error('[weather] Fatal error:', err);
            const msg = `Failed to load weather data (${err.message || 'unknown error'}).`;
            if (gridBases) gridBases.innerHTML = (AIRPORTS.bases || []).map(i => errorCard(i, msg)).join('');
            if (gridDest)  gridDest.innerHTML  = (AIRPORTS.destinations || []).map(i => errorCard(i, msg)).join('');
        } finally {
            isFetching = false;
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = '<i class="fas fa-redo"></i> Refresh';
            }
        }
    }

    function scheduleAutoRefresh() {
        if (autoRefreshTimer) clearInterval(autoRefreshTimer);
        autoRefreshTimer = setInterval(() => {
            if (document.hidden) return; // don't hammer while tab is backgrounded
            if (isFetching) return;
            loadWeather({ force: true, silent: true });
        }, CONFIG.autoRefreshMs);
    }

    /* =========================================================
     * Event wiring
     * ========================================================= */

    function handleGridClick(e) {
        const btn = e.target.closest('.copy-metar');
        if (!btn) return;
        const text = btn.getAttribute('data-copy') || '';
        const done = () => {
            btn.classList.add('copied');
            const old = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i> Copied';
            setTimeout(() => {
                btn.classList.remove('copied');
                btn.innerHTML = old;
            }, 1400);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
        } else {
            fallbackCopy(text, done);
        }
    }

    function fallbackCopy(text, cb) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); cb && cb(); } catch (_) {}
        document.body.removeChild(ta);
    }

    document.addEventListener('DOMContentLoaded', function () {
        loadWeather();
        scheduleAutoRefresh();

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => loadWeather({ force: true }));
        }

        if (gridBases) gridBases.addEventListener('click', handleGridClick);
        if (gridDest)  gridDest.addEventListener('click', handleGridClick);

        // Refresh when returning to a stale tab.
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) return;
            const cached = loadCache();
            if (!cached) loadWeather({ force: true, silent: true });
        });
    });
})();
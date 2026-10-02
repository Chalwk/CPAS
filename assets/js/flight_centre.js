/* Copyright (c) 2025-2026 Jericho Crosby (Chalwk) */

(function () {
    'use strict';

    const DIFFICULTY_LABELS = {
        1: 'Easy',
        2: 'Light',
        3: 'Moderate',
        4: 'Challenging',
        5: 'Expert'
    };

    const DIFFICULTY_COLORS =
        (window.CPASLeaflet && window.CPASLeaflet.COLORS.difficulty) || {
            1: '#059669',
            2: '#0891b2',
            3: '#2d6bc9',
            4: '#f59e0b',
            5: '#dc2626'
        };

    const CATEGORY_LABELS = {
        'fixed-wing': 'Fixed-Wing',
        'helicopter': 'Helicopter',
        'scenic': 'Scenic Tour',
        'heli-hike': 'Heli-Hike',
        'itinerary': 'Itinerary'
    };

    const TAB_LABELS = {
        'fixed-wing': 'Fixed-Wing Routes',
        'helicopter': 'Helicopter Routes',
        'scenic': 'Scenic Tours',
        'heli-hike': 'Heli-Hike Tours',
        'itinerary': 'Multi-Day Itineraries'
    };

    // Approximate NZ bounding box used as the default modal map view.
    const NZ_CENTER = [-43.5, 171.0];
    const NZ_ZOOM = 6;
    const ICAO_PATTERN = /\bNZ[A-Z]{2}\b/g;

    // Routes whose map path can't be derived from `from`/`to` alone
    // (multi-stop charters).
    const ROUTE_PATH_OVERRIDES = {
        'fw-nzch-nztu-nzqn-multi': ['NZCH', 'NZTU', 'NZQN']
    };

    class FlightCentre {
        constructor(routes, airports) {
            this.allRoutes = Array.isArray(routes) ? routes : [];
            this.airports = (airports && typeof airports === 'object') ? airports : {};

            this.activeTab = 'fixed-wing';
            this.currentPage = 1;
            this.perPage = 6;
            this.els = {};

            this.init();
        }

        init() {
            const ready = () => {
                this.cacheEls();
                if (!this.els.results) return;
                this.buildRoutes();
                this.auditAirports();
                this.bindEvents();
                this.bindTabs();
                this.updateTabCounts();
                this.render();
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', ready);
            } else {
                ready();
            }
        }

        cacheEls() {
            this.els = {
                from: document.getElementById('fcFrom'),
                to: document.getElementById('fcTo'),
                aircraft: document.getElementById('fcAircraft'),
                operation: document.getElementById('fcOperation'),
                conditions: document.getElementById('fcConditions'),
                difficulty: document.getElementById('fcDifficulty'),
                search: document.getElementById('fcSearch'),
                reset: document.getElementById('fcReset'),
                emptyReset: document.getElementById('fcEmptyReset'),
                sort: document.getElementById('fcSort'),
                results: document.getElementById('fcResults'),
                empty: document.getElementById('fcEmpty'),
                count: document.getElementById('fcCount'),
                pagination: document.getElementById('fcPagination'),
                modal: document.getElementById('fcModal'),
                modalClose: document.getElementById('fcModalClose'),
                modalBody: document.getElementById('fcModalBody'),
                tabButtons: Array.from(document.querySelectorAll('.fc-tab-btn'))
            };
        }

        buildRoutes() {
            this.allRoutes.forEach((r, i) => {
                r._key = `${r.id || 'route'}-${i}`;
                r._categoryLabel = CATEGORY_LABELS[r.category] || r.category || 'Flight';
            });
        }

        bindTabs() {
            this.els.tabButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const tab = btn.dataset.tab;
                    if (!tab || tab === this.activeTab) return;

                    this.activeTab = tab;
                    this.currentPage = 1;

                    this.els.tabButtons.forEach(b => {
                        b.classList.toggle('active', b.dataset.tab === tab);
                    });

                    this.render();
                });
            });
        }

        updateTabCounts() {
            this.els.tabButtons.forEach(btn => {
                const tab = btn.dataset.tab;
                const countEl = btn.querySelector('.fc-tab-count');
                if (!countEl || !tab) return;

                const count = this.allRoutes.filter(r => r.category === tab).length;
                countEl.textContent = count > 0 ? count : '';
            });
        }

        bindEvents() {
            const { search, reset, emptyReset, sort, modal, modalClose } = this.els;

            if (search) search.addEventListener('click', () => this.applyFilters(true));
            if (reset) reset.addEventListener('click', () => this.resetFilters());
            if (emptyReset) emptyReset.addEventListener('click', () => this.resetFilters());
            if (sort) sort.addEventListener('change', () => { this.currentPage = 1; this.render(); });

            ['from', 'to', 'aircraft', 'operation', 'conditions', 'difficulty'].forEach(k => {
                const el = this.els[k];
                if (el) el.addEventListener('change', () => this.applyFilters(true));
            });

            document.querySelectorAll('.fc-filter select').forEach(sel => {
                sel.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') this.applyFilters(true);
                });
            });

            if (modalClose) modalClose.addEventListener('click', () => this.closeModal());
            if (modal) {
                modal.querySelectorAll('[data-close-modal]').forEach(el => {
                    el.addEventListener('click', () => this.closeModal());
                });
            }

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.els.modal && this.els.modal.classList.contains('open')) {
                    this.closeModal();
                }
            });
        }

        // ---- MAP DATA HELPERS -------------------------------------------

        codesIn(text) {
            return String(text == null ? '' : text).match(ICAO_PATTERN) || [];
        }

        referencedCodes(r) {
            const chunks = [r.description, r.alternate, r.warning]
                .concat(r.highlights || [], r.airspace || []);
            const out = new Set();
            chunks.forEach(t => this.codesIn(t).forEach(c => out.add(c)));
            return Array.from(out);
        }

        // Itineraries list their legs per day in `highlights`, e.g. "Day 1: NZCH -> NZMC".
        // Each line becomes its own chain of legs; nothing is joined across days.
        itinerarySequences(r) {
            return (r.highlights || [])
                .map(line => this.codesIn(line).filter((c, i, a) => i === 0 || c !== a[i - 1]))
                .filter(seq => seq.length > 1);
        }

        // Works out what to draw for a route:
        //   { kind: 'path', segments: [[ICAO, ICAO], ...], stops: [ICAO, ...] }
        //   { kind: 'loop', segments: [], stops: [ICAO] }   - round trip from a base
        //   null                                            - can't be drawn
        resolveRoute(r) {
            let sequences;
            if (ROUTE_PATH_OVERRIDES[r.id]) {
                sequences = [ROUTE_PATH_OVERRIDES[r.id]];
            } else if (r.category === 'itinerary') {
                sequences = this.itinerarySequences(r);
            } else if (r.from && r.to && r.from !== r.to) {
                sequences = [[r.from, r.to]];
            } else {
                sequences = [];
            }

            // Nothing to join: a sortie, scenic loop or heli-hike that starts and
            // ends at its base.
            if (sequences.length === 0) {
                const base = r.from;
                return (base && this.airports[base])
                    ? { kind: 'loop', segments: [], stops: [base] }
                    : null;
            }

            const stops = [];
            const segments = [];
            const seen = new Set();

            sequences.forEach(seq => {
                seq.forEach((code, i) => {
                    if (!this.airports[code]) return;
                    if (!stops.includes(code)) stops.push(code);

                    const next = seq[i + 1];
                    if (next && next !== code && this.airports[next]) {
                        const pair = [code, next].sort().join('>');
                        if (!seen.has(pair)) {
                            seen.add(pair);
                            segments.push([code, next]);
                        }
                    }
                });
            });

            return segments.length ? { kind: 'path', segments, stops } : null;
        }

        auditAirports() {
            const used = new Set();
            const missing = {};

            const note = (code, id) => {
                used.add(code);
                if (!this.airports[code]) (missing[code] = missing[code] || new Set()).add(id);
            };

            this.allRoutes.forEach(r => {
                [r.from, r.to].forEach(c => { if (c) note(c, r.id); });
                (ROUTE_PATH_OVERRIDES[r.id] || []).forEach(c => note(c, r.id));
                this.referencedCodes(r).forEach(c => note(c, r.id));
            });

            Object.keys(missing).sort().forEach(code => {
                console.warn(
                    `[flight-centre] ${code} is used by routes but missing from airports data: ` +
                    Array.from(missing[code]).join(', ')
                );
            });

            const unused = Object.keys(this.airports).filter(c => !used.has(c)).sort();
            if (unused.length) {
                console.warn(
                    `[flight-centre] airports data has entries no route uses: ${unused.join(', ')}`
                );
            }
        }

        // ---- FILTERS / RESULTS ------------------------------------------

        readFilters() {
            return {
                from: (this.els.from && this.els.from.value) || '',
                to: (this.els.to && this.els.to.value) || '',
                aircraft: (this.els.aircraft && this.els.aircraft.value) || '',
                operation: (this.els.operation && this.els.operation.value) || '',
                conditions: (this.els.conditions && this.els.conditions.value) || '',
                difficulty: (this.els.difficulty && this.els.difficulty.value) || ''
            };
        }

        getFilteredRoutes() {
            const f = this.readFilters();

            return this.allRoutes.filter(r => {
                if (r.category !== this.activeTab) return false;

                if (f.from && r.from !== f.from) return false;
                if (f.to && r.to !== f.to) return false;
                if (f.operation && r.operation !== f.operation) return false;
                if (f.difficulty && String(r.difficulty) !== f.difficulty) return false;

                if (f.aircraft) {
                    const list = Array.isArray(r.aircraft) ? r.aircraft : [];
                    if (!list.includes(f.aircraft)) return false;
                }

                if (f.conditions) {
                    const list = Array.isArray(r.conditions) ? r.conditions : [];
                    if (!list.includes(f.conditions)) return false;
                }

                return true;
            });
        }

        applyFilters(resetPage) {
            if (resetPage !== false) this.currentPage = 1;
            this.render();
        }

        resetFilters() {
            ['from', 'to', 'aircraft', 'operation', 'conditions', 'difficulty'].forEach(k => {
                if (this.els[k]) this.els[k].value = '';
            });
            if (this.els.sort) this.els.sort.value = 'default';
            this.currentPage = 1;
            this.render();
        }

        sortFiltered(arr) {
            const mode = (this.els.sort && this.els.sort.value) || 'default';

            switch (mode) {
                case 'distance-asc':
                    arr.sort((a, b) => this.num(a.distance_nm) - this.num(b.distance_nm));
                    break;
                case 'distance-desc':
                    arr.sort((a, b) => this.num(b.distance_nm) - this.num(a.distance_nm));
                    break;
                case 'difficulty-asc':
                    arr.sort((a, b) => this.num(a.difficulty) - this.num(b.difficulty));
                    break;
                case 'difficulty-desc':
                    arr.sort((a, b) => this.num(b.difficulty) - this.num(a.difficulty));
                    break;
                case 'alpha':
                    arr.sort((a, b) => String(a.id).localeCompare(String(b.id)));
                    break;
                default:
                    arr.sort((a, b) => this.allRoutes.indexOf(a) - this.allRoutes.indexOf(b));
                    break;
            }
            return arr;
        }

        num(v) {
            const n = parseFloat(v);
            return isNaN(n) ? 0 : n;
        }

        render() {
            const filtered = this.sortFiltered(this.getFilteredRoutes());
            this.renderResults(filtered);
            this.renderCount(filtered);
            this.renderPagination(filtered);
            this.toggleEmptyState(filtered);
        }

        renderResults(filtered) {
            const start = (this.currentPage - 1) * this.perPage;
            const slice = filtered.slice(start, start + this.perPage);

            this.els.results.innerHTML = slice.map(r => this.cardHTML(r)).join('');

            // "View Brief"
            this.els.results.querySelectorAll('[data-brief-key]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const key = btn.getAttribute('data-brief-key');
                    const route = this.allRoutes.find(x => x._key === key);
                    if (route) this.openModal(route);
                });
            });

            // "Airspace"
            this.els.results.querySelectorAll('[data-airspace-key]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const key = btn.getAttribute('data-airspace-key');
                    const route = this.allRoutes.find(x => x._key === key);
                    if (route) this.openAirspaceModal(route);
                });
            });

            // "View Map"
            this.els.results.querySelectorAll('[data-map-key]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const key = btn.getAttribute('data-map-key');
                    const route = this.allRoutes.find(x => x._key === key);
                    if (route) this.openRouteMapModal(route);
                });
            });
        }

        renderCount(filtered) {
            const total = filtered.length;
            const totalInTab = this.allRoutes.filter(r => r.category === this.activeTab).length;
            const totalAll = this.allRoutes.length;
            const tabLabel = TAB_LABELS[this.activeTab] || CATEGORY_LABELS[this.activeTab] || this.activeTab;

            let primary;
            if (total === totalInTab) {
                primary = `Showing all ${total} ${total === 1 ? 'flight' : 'flights'} for ${tabLabel}`;
            } else {
                primary = `Showing ${total} of ${totalInTab} ${totalInTab === 1 ? 'flight' : 'flights'} for ${tabLabel}`;
            }

            this.els.count.innerHTML =
                `<span class="fc-count-primary">${this.escape(primary)}</span>` +
                `<span class="fc-count-sep" aria-hidden="true">•</span>` +
                `<span class="fc-count-total">Total Flights: ${totalAll}</span>`;
        }

        toggleEmptyState(filtered) {
            if (filtered.length === 0) {
                this.els.results.hidden = true;
                this.els.empty.hidden = false;
            } else {
                this.els.results.hidden = false;
                this.els.empty.hidden = true;
            }
        }

        renderPagination(filtered) {
            const totalPages = Math.ceil(filtered.length / this.perPage) || 1;

            if (filtered.length === 0 || totalPages <= 1) {
                this.els.pagination.innerHTML = '';
                return;
            }

            const cur = this.currentPage;
            const btn = (label, page, opts = {}) => {
                const cls = ['fc-page-btn'];
                if (opts.active) cls.push('active');
                if (opts.disabled) cls.push('disabled');
                return `<button class="${cls.join(' ')}" ${opts.disabled ? 'disabled' : ''} data-page="${page}">${label}</button>`;
            };

            let html = '';
            html += btn('«', cur - 1, { disabled: cur === 1 });

            const maxVisible = 5;
            let startPage = Math.max(1, cur - Math.floor(maxVisible / 2));
            let endPage = Math.min(totalPages, startPage + maxVisible - 1);
            if (endPage - startPage + 1 < maxVisible) {
                startPage = Math.max(1, endPage - maxVisible + 1);
            }

            if (startPage > 1) {
                html += btn('1', 1);
                if (startPage > 2) html += `<span class="fc-page-info">…</span>`;
            }

            for (let i = startPage; i <= endPage; i++) {
                html += btn(String(i), i, { active: i === cur });
            }

            if (endPage < totalPages) {
                if (endPage < totalPages - 1) html += `<span class="fc-page-info">…</span>`;
                html += btn(String(totalPages), totalPages);
            }

            html += btn('»', cur + 1, { disabled: cur === totalPages });

            this.els.pagination.innerHTML = html;

            this.els.pagination.querySelectorAll('[data-page]').forEach(b => {
                b.addEventListener('click', () => {
                    const p = parseInt(b.getAttribute('data-page'), 10);
                    if (isNaN(p) || p < 1 || p > totalPages) return;
                    this.currentPage = p;
                    this.render();
                    const top = document.querySelector('.fc-section');
                    if (top) window.scrollTo({ top: top.offsetTop - 90, behavior: 'smooth' });
                });
            });
        }

        // ---- HTML builders ---------------------------------------------

        hasAirspace(r) {
            return Array.isArray(r.airspace) && r.airspace.length > 0;
        }

        cardHTML(r) {
            const distance = r.distance_nm ? `${r.distance_nm} NM` : (r.duration || '-');
            const opClass = this.opClass(r.operation);
            const stars = this.starsHTML(r.difficulty);
            const rulesClass = (r.flight_rules === 'IFR') ? 'fc-chip-rules-ifr' : 'fc-chip-rules-vfr';
            const aircraftList = Array.isArray(r.aircraft) ? r.aircraft.join(' · ') : (r.aircraft || '');
            const fromDisplay = r.from || '-';
            const toDisplay = r.to || '-';
            const fromName = r.from_name || '';
            const toName = r.to_name || '';

            const conditionsHTML = (r.conditions || [])
                .map(c => `<span class="fc-chip fc-chip-cond"><i class="fas fa-cloud-sun"></i>${this.escape(c)}</span>`)
                .join('');

            const airspaceBadge = this.hasAirspace(r)
                ? `<span class="fc-chip fc-chip-airspace" title="Airspace & procedures available"><i class="fas fa-tower"></i>Airspace</span>`
                : '';

            const simbriefURL = this.simbriefURL(r);

            return `
                <article class="fc-card" data-key="${this.escape(r._key)}">
                    <header class="fc-card-header ${opClass}">
                        <div class="fc-card-route">
                            <h3>${this.escape(fromDisplay)} → ${this.escape(toDisplay)}</h3>
                            <span class="fc-card-route-names">${this.escape(fromName)} → ${this.escape(toName)}</span>
                        </div>
                        <span class="fc-card-distance">${this.escape(String(distance))}</span>
                    </header>
                    <div class="fc-card-body">
                        <div class="fc-card-meta">
                            <span class="fc-chip fc-chip-op"><i class="fas fa-briefcase"></i>${this.escape(r.operation || 'Flight')}</span>
                            <span class="fc-chip ${rulesClass}"><i class="fas fa-file-alt"></i>${this.escape(r.flight_rules || 'VFR')}</span>
                            <span class="fc-chip"><i class="fas fa-tag"></i>${this.escape(r._categoryLabel)}</span>
                            ${conditionsHTML}
                            ${airspaceBadge}
                        </div>

                        <div class="fc-difficulty">
                            ${stars}
                            <span class="fc-diff-label">${this.escape(DIFFICULTY_LABELS[r.difficulty] || '')}</span>
                        </div>

                        <p class="fc-card-desc">${this.escape(r.description || '')}</p>

                        <div class="fc-card-aircraft">
                            <i class="fas fa-plane"></i>
                            <span>${this.escape(aircraftList)}</span>
                        </div>

                        <div class="fc-card-actions">
                            <button class="fc-btn fc-btn-brief" data-brief-key="${this.escape(r._key)}">
                                <i class="fas fa-clipboard-list"></i> View Brief
                            </button>
                            <button class="fc-btn fc-btn-airspace" data-airspace-key="${this.escape(r._key)}" title="View airspace & procedures">
                                <i class="fas fa-tower"></i> Airspace
                            </button>
                            <a class="fc-btn fc-btn-simbrief" href="${simbriefURL}" target="_blank" rel="noopener" title="Open SimBrief">
                                <i class="fas fa-paper-plane"></i> SimBrief
                            </a>
                            <button class="fc-btn fc-btn-map" data-map-key="${this.escape(r._key)}" title="View route on Leaflet map">
                                <i class="fas fa-map"></i> View Map
                            </button>
                        </div>
                    </div>
                </article>
            `;
        }

        opClass(op) {
            const map = {
                'Tour': 'fc-op-tour',
                'Itinerary': 'fc-op-itinerary',
                'Survey': 'fc-op-survey',
                'Transfer': 'fc-op-transfer'
            };
            return map[op] || '';
        }

        starsHTML(n) {
            const rating = Math.max(0, Math.min(5, parseInt(n, 10) || 0));
            let html = '';
            for (let i = 1; i <= 5; i++) {
                html += i <= rating
                    ? '<i class="fas fa-star"></i>'
                    : '<i class="far fa-star" style="color:#cbd5e0;"></i>';
            }
            return html;
        }

        simbriefURL(r) {
            const from = r.from || '';
            const to = r.to || '';
            return `https://dispatch.simbrief.com/options/custom?orig=${encodeURIComponent(from)}&dest=${encodeURIComponent(to)}`;
        }

        openModal(r) {
            const opClass = this.opClass(r.operation);
            const distance = r.distance_nm ? `${r.distance_nm} NM` : (r.duration || '-');
            const stars = this.starsHTML(r.difficulty);
            const aircraftList = Array.isArray(r.aircraft) ? r.aircraft.join(' · ') : (r.aircraft || '');

            const highlightsHTML = (r.highlights || [])
                .map(h => `<li>${this.escape(h)}</li>`).join('');

            const airspaceHTML = (r.airspace || [])
                .map(a => `<li>${this.escape(a)}</li>`).join('');

            const tagsHTML = (r.tags || [])
                .map(t => `<span class="fc-chip"><i class="fas fa-tag"></i>${this.escape(t)}</span>`).join('');

            const conditionsHTML = (r.conditions || [])
                .map(c => `<span class="fc-chip fc-chip-cond"><i class="fas fa-cloud-sun"></i>${this.escape(c)}</span>`).join('');

            const simbriefURL = this.simbriefURL(r);

            this.els.modalBody.innerHTML = `
                <div class="fc-modal-header ${opClass}">
                    <h2 id="fcModalTitle">${this.escape(r.from || '-')} → ${this.escape(r.to || '-')}</h2>
                    <div class="fc-modal-sub">
                        ${this.escape(r.from_name || '')} → ${this.escape(r.to_name || '')}
                    </div>
                    <div class="fc-modal-meta">
                        <span><i class="fas fa-ruler-horizontal"></i> ${this.escape(String(distance))}</span>
                        <span><i class="fas fa-briefcase"></i> ${this.escape(r.operation || 'Flight')}</span>
                        <span><i class="fas fa-file-alt"></i> ${this.escape(r.flight_rules || 'VFR')}</span>
                        <span>${stars} ${this.escape(DIFFICULTY_LABELS[r.difficulty] || '')}</span>
                    </div>
                </div>

                <div class="fc-modal-body-inner">
                    ${r.description ? `<p>${this.escape(r.description)}</p>` : ''}

                    <h3><i class="fas fa-plane"></i> Aircraft</h3>
                    <p>${this.escape(aircraftList)}</p>

                    ${tagsHTML ? `<h3><i class="fas fa-tags"></i> Tags</h3><div class="fc-card-meta">${tagsHTML}${conditionsHTML}</div>` : ''}

                    ${highlightsHTML ? `<h3><i class="fas fa-star"></i> Highlights</h3><ul>${highlightsHTML}</ul>` : ''}

                    ${airspaceHTML ? `<h3><i class="fas fa-tower"></i> Airspace &amp; Procedures</h3><ul>${airspaceHTML}</ul>` : ''}

                    ${r.alternate ? `<div class="fc-modal-alt"><strong>Alternate / Notes:</strong> ${this.escape(r.alternate)}</div>` : ''}

                    ${r.warning ? `<div class="fc-modal-warning"><i class="fas fa-exclamation-triangle"></i> ${this.escape(r.warning)}</div>` : ''}

                    <div class="fc-modal-actions">
                        <a class="fc-btn fc-btn-simbrief" href="${simbriefURL}" target="_blank" rel="noopener">
                            <i class="fas fa-paper-plane"></i> Open in SimBrief
                        </a>
                        <button class="fc-btn fc-btn-map" id="fcModalViewMapBtn" type="button">
                            <i class="fas fa-map"></i> View Route Map
                        </button>
                    </div>
                </div>
            `;

            // Bind the in-modal "View Route Map" button.
            const viewMapBtn = this.els.modalBody.querySelector('#fcModalViewMapBtn');
            if (viewMapBtn) {
                viewMapBtn.addEventListener('click', () => this.openRouteMapModal(r));
            }

            this.els.modal.classList.add('open');
            this.els.modal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        }

        openAirspaceModal(r) {
            const opClass = this.opClass(r.operation);
            const fromDisplay = r.from || '-';
            const toDisplay = r.to || '-';
            const fromName = r.from_name || '';
            const toName = r.to_name || '';

            const airspaceHTML = (r.airspace || [])
                .map(a => `<li>${this.escape(a)}</li>`).join('');

            const hasAirspace = airspaceHTML.length > 0;

            const alternateHTML = r.alternate
                ? `<div class="fc-modal-alt"><strong>Alternate / Notes:</strong> ${this.escape(r.alternate)}</div>`
                : '';

            const warningHTML = r.warning
                ? `<div class="fc-modal-warning"><i class="fas fa-exclamation-triangle"></i> ${this.escape(r.warning)}</div>`
                : '';

            const emptyHTML = `
                <div class="fc-modal-empty">
                    <i class="fas fa-tower"></i>
                    <p>No airspace or procedure information is available for this route yet.</p>
                </div>
            `;

            this.els.modalBody.innerHTML = `
                <div class="fc-modal-header fc-op-airspace ${opClass}">
                    <h2 id="fcModalTitle"><i class="fas fa-tower"></i> Airspace &amp; Procedures</h2>
                    <div class="fc-modal-sub">
                        ${this.escape(fromDisplay)} → ${this.escape(toDisplay)} &nbsp;·&nbsp;
                        ${this.escape(fromName)} → ${this.escape(toName)}
                    </div>
                    <div class="fc-modal-meta">
                        <span><i class="fas fa-briefcase"></i> ${this.escape(r.operation || 'Flight')}</span>
                        <span><i class="fas fa-file-alt"></i> ${this.escape(r.flight_rules || 'VFR')}</span>
                        <span><i class="fas fa-tag"></i> ${this.escape(r._categoryLabel || '')}</span>
                    </div>
                </div>

                <div class="fc-modal-body-inner">
                    ${hasAirspace
                    ? `<h3><i class="fas fa-tower"></i> Airspace &amp; Procedures</h3><ul>${airspaceHTML}</ul>`
                    : emptyHTML}
                    ${alternateHTML}
                    ${warningHTML}
                </div>
            `;

            this.els.modal.classList.add('open');
            this.els.modal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        }

        // Leaflet route-map modal
        openRouteMapModal(r) {
            const geo = this.resolveRoute(r);
            const opClass = this.opClass(r.operation);
            const distance = r.distance_nm ? `${r.distance_nm} NM` : (r.duration || '-');
            const stars = this.starsHTML(r.difficulty);

            const headerHTML = `
                <div class="fc-modal-header fc-op-map ${opClass}">
                    <h2 id="fcModalTitle"><i class="fas fa-map"></i> Route Map</h2>
                    <div class="fc-modal-sub">
                        ${this.escape(r.from || '-')} → ${this.escape(r.to || '-')} &nbsp;·&nbsp;
                        ${this.escape(r.from_name || '')} → ${this.escape(r.to_name || '')}
                    </div>
                    <div class="fc-modal-meta">
                        <span><i class="fas fa-ruler-horizontal"></i> ${this.escape(String(distance))}</span>
                        <span><i class="fas fa-briefcase"></i> ${this.escape(r.operation || 'Flight')}</span>
                        <span>${stars} ${this.escape(DIFFICULTY_LABELS[r.difficulty] || '')}</span>
                    </div>
                </div>
            `;

            if (!geo) {
                this.els.modalBody.innerHTML = headerHTML + `
                    <div class="fc-modal-body-inner">
                        <div class="fc-modal-empty">
                            <i class="fas fa-map"></i>
                            <p>No map data is available for this route yet.</p>
                        </div>
                    </div>
                `;
                this.els.modal.classList.add('open');
                this.els.modal.setAttribute('aria-hidden', 'false');
                document.body.style.overflow = 'hidden';
                return;
            }

            this.els.modalBody.innerHTML = headerHTML + `
                <div class="fc-modal-map-body">
                    <div class="fc-modal-map" id="fcModalMap"></div>
                </div>
            `;

            this.els.modal.classList.add('open');
            this.els.modal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';

            // Let the modal settle before we ask Leaflet to measure the container.
            window.setTimeout(() => this.drawRouteMap(r, geo), 50);
        }

        drawRouteMap(r, geo) {
            const container = document.getElementById('fcModalMap');
            if (!container) return;
            if (!window.CPASLeaflet) return;

            const map = window.CPASLeaflet.createMap(container, {
                center: NZ_CENTER,
                zoom: NZ_ZOOM
            });
            if (!map) return;

            const color = DIFFICULTY_COLORS[r.difficulty] || DIFFICULTY_COLORS[3];
            const bounds = [];
            const endpoints = new Set();
            const alternates = new Set();

            this.referencedCodes(r).forEach(c => {
                if (this.airports[c]) alternates.add(c);
            });

            if (geo.kind === 'path') {
                const legs = geo.segments.map(([a, b]) => [
                    [this.airports[a].lat, this.airports[a].lon],
                    [this.airports[b].lat, this.airports[b].lon]
                ]);
                window.CPASLeaflet.drawRoute(map, legs, { color: color });
            } else {
                const base = geo.stops[0];
                const airport = this.airports[base];
                const ring = window.CPASLeaflet.drawLoop(
                    map,
                    [airport.lat, airport.lon],
                    { color: color }
                );
                if (ring) {
                    ring.bindTooltip(
                        `<strong>${this.escape(r.to_name || airport.name || base)}</strong><br>` +
                        `${this.escape(r._categoryLabel)} · round trip from ${this.escape(base)}`,
                        { direction: 'top', offset: [0, -10], sticky: true }
                    );
                }
            }

            geo.stops.forEach(c => {
                const ap = this.airports[c];
                if (!ap) return;
                bounds.push([ap.lat, ap.lon]);
                endpoints.add(c);
            });

            endpoints.forEach(code => {
                const ap = this.airports[code];
                if (!ap) return;
                const marker = window.CPASLeaflet.drawAirportMarker(
                    map, [ap.lat, ap.lon], { alternate: false }
                );
                if (marker) {
                    marker.bindTooltip(
                        `<strong>${this.escape(code)}</strong><br>${this.escape(ap.name || '')}`,
                        { direction: 'top', offset: [0, -6] }
                    );
                }
            });

            alternates.forEach(code => {
                if (endpoints.has(code)) return;
                const ap = this.airports[code];
                if (!ap) return;
                const marker = window.CPASLeaflet.drawAirportMarker(
                    map, [ap.lat, ap.lon], { alternate: true }
                );
                if (marker) {
                    marker.bindTooltip(
                        `<strong>${this.escape(code)}</strong><br>${this.escape(ap.name || '')}` +
                        '<br><em>Alternate / optional stop</em>',
                        { direction: 'top', offset: [0, -6] }
                    );
                }
            });

            if (bounds.length > 0) {
                try {
                    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 9 });
                } catch (e) { /* ignore */ }
            }

            window.setTimeout(() => map.invalidateSize(), 60);
        }

        closeModal() {
            this.els.modal.classList.remove('open');
            this.els.modal.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';

            // Drop the map container (if any) so the next open starts fresh.
            const staleMap = document.getElementById('fcModalMap');
            if (staleMap) staleMap.remove();
        }

        escape(str) {
            return String(str == null ? '' : str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }
    }

    async function fetchJSON(url, label) {
        if (!url) {
            console.error(`[flight-centre] Missing URL for ${label}`);
            return null;
        }
        try {
            const res = await fetch(url, { cache: 'no-cache' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (err) {
            console.error(`[flight-centre] Failed to load ${label}:`, err);
            return null;
        }
    }

    async function bootstrap() {
        const routesData = await fetchJSON(window.CPAS_ROUTES_URL, 'routes');

        const routes = Array.isArray(routesData) ? routesData : [];
        const airports = (window.CPAS_AIRPORTS && typeof window.CPAS_AIRPORTS === 'object')
            ? window.CPAS_AIRPORTS
            : {};

        window.flightCentre = new FlightCentre(routes, airports);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }
})();
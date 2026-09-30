/* Copyright (c) 2025-2026 Jericho Crosby (Chalwk) */

class RoutesPagination {
    constructor() {
        this.cardsPerPage = 6;
        this.currentPages = {
            'fixed-wing': 1,
            'helicopter': 1,
            'scenic-tours': 1,
            'heli-hike': 1,
            'itineraries': 1
        };
        this.cardsPerPageOptions = [4, 6, 8, 12];
        this.initialize();
    }

    initialize() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    setup() {
        this.setupTabs();
        this.updatePageCounts();

        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id) {
            this.paginateTab(activeTab.id);
        }
    }

    setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn');

        tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const tabId = e.currentTarget.dataset.tab;
                if (!tabId) return;

                const currentActiveTab = document.querySelector('.tab-content.active');
                if (currentActiveTab && currentActiveTab.id) {
                    this.currentPages[currentActiveTab.id] = this.getCurrentPage(currentActiveTab.id);
                }

                // Activate tab
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                e.currentTarget.classList.add('active');

                const targetTab = document.getElementById(tabId);
                if (!targetTab) return;
                targetTab.classList.add('active');

                // Reset to page 1 the first time a tab is opened (optional)
                if (!this.currentPages[tabId]) this.currentPages[tabId] = 1;

                this.paginateTab(tabId);
                this.updatePageCounts();
            });
        });
    }

    getGrid(tabContent) {
        return tabContent.querySelector('.routes-grid') || tabContent.querySelector('.itineraries-container');
    }

    paginateTab(tabId) {
        const tabContent = document.getElementById(tabId);
        if (!tabContent) return;

        const gridContainer = this.getGrid(tabContent);
        if (!gridContainer) return;

        const cards = Array.from(gridContainer.querySelectorAll('.route-card, .itinerary-card'));
        const totalCards = cards.length;
        const totalPages = Math.ceil(totalCards / this.cardsPerPage);

        let currentPage = this.currentPages[tabId] || 1;
        if (totalPages > 0 && currentPage > totalPages) {
            currentPage = totalPages;
            this.currentPages[tabId] = currentPage;
        }
        if (totalPages === 0) currentPage = 1;

        // Hide all first
        cards.forEach(card => {
            card.style.display = 'none';
            card.style.animation = '';
        });

        // Show the slice for this page
        const startIndex = (currentPage - 1) * this.cardsPerPage;
        const endIndex = startIndex + this.cardsPerPage;
        cards.slice(startIndex, endIndex).forEach(card => {
            card.style.display = 'flex';
            card.style.animation = 'fadeIn 0.5s ease';
        });

        this.createPaginationControls(tabContent, totalCards, totalPages);
    }

    createPaginationControls(tabContent, totalCards, totalPages) {
        // Remove any existing container
        const existing = tabContent.querySelector('.pagination-container');
        if (existing) existing.remove();

        if (totalPages <= 1) return;

        const tabId = tabContent.id;
        const currentPage = this.currentPages[tabId] || 1;

        const paginationContainer = document.createElement('div');
        paginationContainer.className = 'pagination-container';

        // "Showing X-Y of Z" info
        const infoDiv = document.createElement('div');
        infoDiv.className = 'pagination-info';
        const startCard = ((currentPage - 1) * this.cardsPerPage) + 1;
        const endCard = Math.min(currentPage * this.cardsPerPage, totalCards);
        infoDiv.textContent = `Showing ${startCard}-${endCard} of ${totalCards} routes`;
        paginationContainer.appendChild(infoDiv);

        // Pagination buttons
        const pagination = document.createElement('ul');
        pagination.className = 'pagination';

        pagination.appendChild(this._makeButton('«', 'previous', currentPage === 1, false, () => {
            if (currentPage > 1) {
                this.currentPages[tabId] = currentPage - 1;
                this.paginateTab(tabId);
            }
        }));

        const maxVisiblePages = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        if (startPage > 1) {
            pagination.appendChild(this._makeButton(1, 'page', false, false, () => {
                this.currentPages[tabId] = 1;
                this.paginateTab(tabId);
            }));
            if (startPage > 2) {
                pagination.appendChild(this._makeButton('...', 'ellipsis', true, false, null));
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            const isActive = i === currentPage;
            const btn = this._makeButton(i, 'page', false, isActive, () => {
                this.currentPages[tabId] = i;
                this.paginateTab(tabId);
            });
            pagination.appendChild(btn);
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                pagination.appendChild(this._makeButton('...', 'ellipsis', true, false, null));
            }
            pagination.appendChild(this._makeButton(totalPages, 'page', false, false, () => {
                this.currentPages[tabId] = totalPages;
                this.paginateTab(tabId);
            }));
        }

        pagination.appendChild(this._makeButton('»', 'next', currentPage === totalPages, false, () => {
            if (currentPage < totalPages) {
                this.currentPages[tabId] = currentPage + 1;
                this.paginateTab(tabId);
            }
        }));

        paginationContainer.appendChild(pagination);

        // Cards-per-page selector
        const selectorContainer = document.createElement('div');
        selectorContainer.className = 'cards-per-page-selector';

        const label = document.createElement('label');
        label.textContent = 'Cards per page:';

        const select = document.createElement('select');
        this.cardsPerPageOptions.forEach(option => {
            const opt = document.createElement('option');
            opt.value = option;
            opt.textContent = option;
            if (option === this.cardsPerPage) opt.selected = true;
            select.appendChild(opt);
        });

        select.addEventListener('change', (e) => {
            this.cardsPerPage = parseInt(e.target.value, 10);
            // Reset every tab back to page 1
            Object.keys(this.currentPages).forEach(k => { this.currentPages[k] = 1; });
            const activeTab = document.querySelector('.tab-content.active');
            if (activeTab && activeTab.id) {
                this.paginateTab(activeTab.id);
            }
            this.updatePageCounts();
        });

        selectorContainer.appendChild(label);
        selectorContainer.appendChild(select);
        paginationContainer.appendChild(selectorContainer);

        tabContent.appendChild(paginationContainer);
    }

    _makeButton(text, type, disabled, active, onClick) {
        const li = document.createElement('li');
        const button = document.createElement('button');

        button.className = `pagination-btn ${type}`;
        button.textContent = text;

        if (disabled) button.classList.add('disabled');
        if (active) button.classList.add('active');
        if (type === 'ellipsis') button.disabled = true;

        if (onClick) {
            button.addEventListener('click', onClick);
        }

        li.appendChild(button);
        return li;
    }

    updatePageCounts() {
        document.querySelectorAll('.tab-btn').forEach(button => {
            const tabId = button.dataset.tab;
            const tabContent = document.getElementById(tabId);
            if (!tabContent) return;

            const gridContainer = this.getGrid(tabContent);
            if (!gridContainer) return;

            const cards = gridContainer.querySelectorAll('.route-card, .itinerary-card');
            const totalPages = Math.ceil(cards.length / this.cardsPerPage);

            let pageCount = button.querySelector('.page-count');
            if (!pageCount) {
                pageCount = document.createElement('span');
                pageCount.className = 'page-count';
                button.appendChild(pageCount);
            }

            pageCount.textContent = totalPages > 1 ? `${totalPages}p` : '';
        });
    }

    getCurrentPage(tabId) {
        return this.currentPages[tabId] || 1;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.routesPagination = new RoutesPagination();
});
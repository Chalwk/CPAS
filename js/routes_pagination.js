// Copyright (c) 2025. Jericho Crosby (Chalwk)

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
        this.setupCardsPerPageSelector();
        this.updatePageCounts();

        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab) {
            this.paginateTab(activeTab.id);
        }
    }

    setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn');

        tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const tabId = e.target.dataset.tab;

                const currentActiveTab = document.querySelector('.tab-content.active');
                if (currentActiveTab) {
                    this.currentPages[currentActiveTab.id] = this.getCurrentPage();
                }

                setTimeout(() => {
                    this.paginateTab(tabId);
                    this.updatePageCounts();
                }, 10);
            });
        });
    }

    setupCardsPerPageSelector() {
        const container = document.createElement('div');
        container.className = 'cards-per-page-selector';

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
            this.cardsPerPage = parseInt(e.target.value);

            const tabs = document.querySelectorAll('.tab-content');
            tabs.forEach(tab => {
                if (tab.id) {
                    this.currentPages[tab.id] = this.getCurrentPage();
                }
            });

            const activeTab = document.querySelector('.tab-content.active');
            if (activeTab && activeTab.id) {
                this.paginateTab(activeTab.id);
                this.updatePageCounts();
            }
        });

        container.appendChild(label);
        container.appendChild(select);

        const paginationContainers = document.querySelectorAll('.pagination-container');
        paginationContainers.forEach(container => {
            const existingSelector = container.querySelector('.cards-per-page-selector');
            if (existingSelector) existingSelector.remove();

            const newSelector = container.cloneNode(true);
            newSelector.querySelector('select').value = this.cardsPerPage;
            container.appendChild(newSelector);
        });
    }

    paginateTab(tabId) {
        const tabContent = document.getElementById(tabId);
        if (!tabContent) return;

        let gridContainer = tabContent.querySelector('.routes-grid') ||
        tabContent.querySelector('.itineraries-container');

        if (!gridContainer) return;

        const cards = Array.from(gridContainer.querySelectorAll('.route-card, .itinerary-card'));
        const totalCards = cards.length;
        const currentPage = this.currentPages[tabId] || 1;
        const totalPages = Math.ceil(totalCards / this.cardsPerPage);

        if (currentPage > totalPages && totalPages > 0) {
            this.currentPages[tabId] = totalPages;
        }

        cards.forEach(card => card.style.display = 'none');

        const startIndex = (this.currentPages[tabId] - 1) * this.cardsPerPage;
        const endIndex = startIndex + this.cardsPerPage;

        cards.slice(startIndex, endIndex).forEach(card => {
            card.style.display = 'flex';
            card.style.animation = 'fadeIn 0.5s ease';
        });

        this.createPaginationControls(tabContent, totalCards, totalPages);
        this.updatePaginationInfo(tabContent, totalCards);
    }

    createPaginationControls(tabContent, totalCards, totalPages) {
        let paginationContainer = tabContent.querySelector('.pagination-container');
        const currentPage = this.currentPages[tabContent.id];

        if (paginationContainer) {
            paginationContainer.remove();
        }

        if (totalPages <= 1) {
            return;
        }

        paginationContainer = document.createElement('div');
        paginationContainer.className = 'pagination-container';

        const pagination = document.createElement('ul');
        pagination.className = 'pagination';

        const prevButton = this.createPageButton('«', 'previous', currentPage === 1);
        prevButton.addEventListener('click', () => {
            if (currentPage > 1) {
                this.currentPages[tabContent.id] = currentPage - 1;
                this.paginateTab(tabContent.id);
            }
        });
        pagination.appendChild(prevButton);

        const maxVisiblePages = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        if (startPage > 1) {
            const firstPageButton = this.createPageButton(1, 'page');
            firstPageButton.addEventListener('click', () => {
                this.currentPages[tabContent.id] = 1;
                this.paginateTab(tabContent.id);
            });
            pagination.appendChild(firstPageButton);

            if (startPage > 2) {
                const ellipsis = this.createPageButton('...', 'ellipsis');
                pagination.appendChild(ellipsis);
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            const pageButton = this.createPageButton(
                i,
                'page',
                false,
                i === currentPage
            );

            if (i === currentPage) {
                pageButton.classList.add('active');
            }

            pageButton.addEventListener('click', () => {
                this.currentPages[tabContent.id] = i;
                this.paginateTab(tabContent.id);
            });

            pagination.appendChild(pageButton);
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                const ellipsis = this.createPageButton('...', 'ellipsis');
                pagination.appendChild(ellipsis);
            }

            const lastPageButton = this.createPageButton(totalPages, 'page');
            lastPageButton.addEventListener('click', () => {
                this.currentPages[tabContent.id] = totalPages;
                this.paginateTab(tabContent.id);
            });
            pagination.appendChild(lastPageButton);
        }

        const nextButton = this.createPageButton('»', 'next', currentPage === totalPages);
        nextButton.addEventListener('click', () => {
            if (currentPage < totalPages) {
                this.currentPages[tabContent.id] = currentPage + 1;
                this.paginateTab(tabContent.id);
            }
        });
        pagination.appendChild(nextButton);

        paginationContainer.appendChild(pagination);

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
            this.cardsPerPage = parseInt(e.target.value);

            const tabs = document.querySelectorAll('.tab-content');
            tabs.forEach(tab => {
                if (tab.id) {
                    this.currentPages[tab.id] = 1;
                }
            });

            this.paginateTab(tabContent.id);
            this.updatePageCounts();
        });

        selectorContainer.appendChild(label);
        selectorContainer.appendChild(select);
        paginationContainer.appendChild(selectorContainer);

        tabContent.appendChild(paginationContainer);
    }

    createPageButton(text, type = 'page', disabled = false, active = false) {
        const li = document.createElement('li');
        const button = document.createElement('button');

        button.className = `pagination-btn ${type}`;
        button.textContent = text;

        if (disabled) {
            button.classList.add('disabled');
        }

        if (active) {
            button.classList.add('active');
        }

        if (type === 'ellipsis') {
            button.disabled = true;
        }

        li.appendChild(button);
        return li;
    }

    updatePaginationInfo(tabContent, totalCards) {
        const currentPage = this.currentPages[tabContent.id];
        const startCard = ((currentPage - 1) * this.cardsPerPage) + 1;
        const endCard = Math.min(currentPage * this.cardsPerPage, totalCards);

        let infoDiv = tabContent.querySelector('.pagination-info');

        if (!infoDiv) {
            infoDiv = document.createElement('div');
            infoDiv.className = 'pagination-info';
            const paginationContainer = tabContent.querySelector('.pagination-container');
            if (paginationContainer) {
                paginationContainer.insertBefore(infoDiv, paginationContainer.firstChild);
            }
        }

        infoDiv.textContent = `Showing ${startCard}-${endCard} of ${totalCards} routes`;
    }

    updatePageCounts() {
        const tabButtons = document.querySelectorAll('.tab-btn');

        tabButtons.forEach(button => {
            const tabId = button.dataset.tab;
            const tabContent = document.getElementById(tabId);

            if (tabContent) {
                let gridContainer = tabContent.querySelector('.routes-grid') ||
                tabContent.querySelector('.itineraries-container');

                if (gridContainer) {
                    const cards = gridContainer.querySelectorAll('.route-card, .itinerary-card');
                    const totalPages = Math.ceil(cards.length / this.cardsPerPage);

                    let pageCount = button.querySelector('.page-count');
                    if (!pageCount) {
                        pageCount = document.createElement('span');
                        pageCount.className = 'page-count';
                        button.appendChild(pageCount);
                    }

                    pageCount.textContent = totalPages > 1 ? `${totalPages}p` : '';
                }
            }
        });
    }

    getCurrentPage() {
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id) {
            return this.currentPages[activeTab.id] || 1;
        }
        return 1;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.routesPagination = new RoutesPagination();
});
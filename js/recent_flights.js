// Copyright (c) 2025. Jericho Crosby (Chalwk)

document.addEventListener('DOMContentLoaded', function() {
    let flightsData = [];
    let filteredData = [];
    let currentPage = 1;
    const itemsPerPage = 10;
    let currentSort = { column: 'timestamp', direction: 'desc' };

    const flightsTableBody = document.getElementById('flightsTableBody');
    const flightDetails = document.getElementById('flightDetails');
    const closeSidebar = document.getElementById('closeSidebar');
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const aircraftFilter = document.getElementById('aircraftFilter');
    const prevPageBtn = document.getElementById('prevPage');
    const nextPageBtn = document.getElementById('nextPage');
    const pageNumbers = document.getElementById('pageNumbers');
    const refreshDataBtn = document.getElementById('refreshData');
    const lastUpdated = document.getElementById('lastUpdated');

    loadFlightData();

    closeSidebar.addEventListener('click', () => {
        flightDetails.style.display = 'none';
    });

    searchInput.addEventListener('input', filterFlights);
    statusFilter.addEventListener('change', filterFlights);
    aircraftFilter.addEventListener('change', filterFlights);

    prevPageBtn.addEventListener('click', () => changePage(currentPage - 1));
    nextPageBtn.addEventListener('click', () => changePage(currentPage + 1));

    refreshDataBtn.addEventListener('click', loadFlightData);

    document.querySelectorAll('#flightsTable th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.sort;
            if (currentSort.column === column) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = column;
                currentSort.direction = 'asc';
            }

            document.querySelectorAll('#flightsTable th').forEach(h => {
                h.classList.remove('sorted-asc', 'sorted-desc');
            });
            th.classList.add(`sorted-${currentSort.direction}`);

            sortFlights();
        });
    });

    async function loadFlightData() {
        try {
            const response = await fetch('../data/flights.json');
            if (!response.ok) throw new Error('Failed to load flight data');

            const data = await response.json();
            flightsData = data;

            lastUpdated.textContent = new Date().toLocaleString();

            filterFlights();

            updateStatistics();

        } catch (error) {
            console.error('Error loading flight data:', error);
            flightsTableBody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 40px; color: #dc2626;">
                        <i class="fas fa-exclamation-circle"></i> Unable to load flight data. Please try again later.
                    </td>
                </tr>
            `;
        }
    }

    function filterFlights() {
        const searchTerm = searchInput.value.toLowerCase();
        const statusValue = statusFilter.value;
        const aircraftValue = aircraftFilter.value;

        filteredData = flightsData.filter(flight => {
            const matchesSearch =
            flight.flightNumber.toLowerCase().includes(searchTerm) ||
            flight.pilot.toLowerCase().includes(searchTerm) ||
            flight.departure.toLowerCase().includes(searchTerm) ||
            flight.arrival.toLowerCase().includes(searchTerm) ||
            flight.aircraftReg.toLowerCase().includes(searchTerm) ||
            flight.aircraft.toLowerCase().includes(searchTerm);

            const matchesStatus = statusValue === 'all' || flight.status === statusValue;

            const matchesAircraft = aircraftValue === 'all' ||
            flight.aircraftIcao === aircraftValue ||
            flight.aircraft.toLowerCase().includes(aircraftValue.toLowerCase());

            return matchesSearch && matchesStatus && matchesAircraft;
        });

        sortFlights();
        updatePagination();
        updateTable();
        updateStatistics();
    }

    function sortFlights() {
        filteredData.sort((a, b) => {
            let aValue = a[currentSort.column];
            let bValue = b[currentSort.column];

            if (currentSort.column === 'date' || currentSort.column === 'timestamp') {
                aValue = new Date(aValue);
                bValue = new Date(bValue);
            } else if (currentSort.column === 'flightTime') {
                aValue = timeToMinutes(aValue);
                bValue = timeToMinutes(bValue);
            } else if (typeof aValue === 'string') {
                aValue = aValue.toLowerCase();
                bValue = bValue.toLowerCase();
            }

            if (currentSort.direction === 'asc') {
                return aValue > bValue ? 1 : -1;
            } else {
                return aValue < bValue ? 1 : -1;
            }
        });

        currentPage = 1;
        updateTable();
        updatePagination();
    }

    function updateTable() {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const pageData = filteredData.slice(startIndex, endIndex);

        if (pageData.length === 0) {
            flightsTableBody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 40px; color: #6b7280;">
                        <i class="fas fa-plane-slash"></i> No flights found matching your criteria.
                    </td>
                </tr>
            `;
            return;
        }

        flightsTableBody.innerHTML = pageData.map(flight => `
            <tr data-flight-id="${flight.id}">
                <td>
                    <div class="flight-number">${flight.flightNumber}</div>
                </td>
                <td>${formatDate(flight.date)}</td>
                <td>
                    <div class="pilot-info">
                        <div class="pilot-avatar">${flight.pilot.charAt(0).toUpperCase()}</div>
                        <div>
                            <div>${flight.pilot}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="aircraft-info">
                        <div class="aircraft-reg">${flight.aircraftReg}</div>
                        <div class="aircraft-type">${flight.aircraft} (${flight.aircraftIcao})</div>
                    </div>
                </td>
                <td>
                    <div class="route-info">
                        <div class="route-airports">
                            <span class="airport-code">${flight.departure}</span>
                            <i class="fas fa-arrow-right route-arrow"></i>
                            <span class="airport-code">${flight.arrival}</span>
                        </div>
                    </div>
                </td>
                <td>${flight.flightTime}</td>
                <td>
                    <span class="status-badge status-${flight.status}">
                        ${flight.status}
                    </span>
                </td>
                <td>
                    <div class="table-actions">
                        <button class="btn-icon view-flight" data-flight-id="${flight.id}">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        document.querySelectorAll('.view-flight').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const flightId = btn.dataset.flightId;
                showFlightDetails(flightId);
            });
        });

        document.querySelectorAll('#flightsTableBody tr').forEach(row => {
            row.addEventListener('click', (e) => {
                if (!e.target.closest('.table-actions')) {
                    const flightId = row.dataset.flightId;
                    showFlightDetails(flightId);
                }
            });
        });
    }

    function showFlightDetails(flightId) {
        const flight = flightsData.find(f => f.id === flightId);
        if (!flight) return;

        document.getElementById('detailFlightNumber').textContent = flight.flightNumber;
        document.getElementById('detailCallsign').textContent = flight.callsign;
        document.getElementById('detailDate').textContent = formatDate(flight.date);
        document.getElementById('detailStatus').textContent = flight.status;
        document.getElementById('detailStatus').className = `status-badge status-${flight.status}`;

        document.getElementById('detailDeparture').textContent = flight.departure;
        document.getElementById('detailArrival').textContent = flight.arrival;
        document.getElementById('detailAlternate').textContent = flight.alternate;
        document.getElementById('detailCruiseAlt').textContent = `${flight.cruiseAlt} ft`;
        document.getElementById('detailRoute').textContent = flight.route;
        document.getElementById('detailDistance').textContent = flight.distance;

        document.getElementById('detailAircraft').textContent = flight.aircraft;
        document.getElementById('detailAircraftReg').textContent = flight.aircraftReg;
        document.getElementById('detailAircraftIcao').textContent = flight.aircraftIcao;

        document.getElementById('detailFlightTime').textContent = flight.flightTime;
        document.getElementById('detailBlockTime').textContent = flight.blockTime;
        document.getElementById('detailFuelBurn').textContent = `${flight.fuelBurn} kg`;
        document.getElementById('detailZFW').textContent = `${flight.zfw} kg`;
        document.getElementById('detailTOW').textContent = `${flight.tow} kg`;
        document.getElementById('detailWindComponent').textContent = `${flight.windComponent} kts`;

        document.getElementById('detailPilot').textContent = flight.pilot;
        document.getElementById('detailPilotId').textContent = flight.pilotId;

        document.getElementById('detailSource').textContent = flight.source;
        document.getElementById('detailTimestamp').textContent = formatDateTime(flight.timestamp);

        flightDetails.style.display = 'flex';

        const viewSimBriefBtn = document.getElementById('viewSimBrief');
        if (flight.source === 'SimBrief') {
            viewSimBriefBtn.style.display = 'inline-flex';
            viewSimBriefBtn.onclick = () => {
                if (flight.pdfUrl && flight.pdfUrl !== 'N/A') {
                    window.open(flight.pdfUrl, '_blank');
                } else {
                    window.open(`https://www.simbrief.com/ofp/uads/?userid=${flight.pilotId}`, '_blank');
                }
            };
        } else {
            viewSimBriefBtn.style.display = 'none';
        }
    }

    function updatePagination() {
        const totalPages = Math.ceil(filteredData.length / itemsPerPage);

        prevPageBtn.disabled = currentPage === 1;
        nextPageBtn.disabled = currentPage === totalPages || totalPages === 0;

        pageNumbers.innerHTML = '';

        if (totalPages === 0) {
            pageNumbers.innerHTML = '<span>No pages</span>';
            return;
        }

        const pages = [];
        pages.push(1);

        if (currentPage > 3) pages.push('...');

        for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
            pages.push(i);
        }

        if (currentPage < totalPages - 2) pages.push('...');
        if (totalPages > 1) pages.push(totalPages);

        pages.forEach(page => {
            if (page === '...') {
                pageNumbers.innerHTML += '<span class="page-number">...</span>';
            } else {
                const pageBtn = document.createElement('span');
                pageBtn.className = `page-number ${page === currentPage ? 'active' : ''}`;
                pageBtn.textContent = page;
                pageBtn.addEventListener('click', () => changePage(page));
                pageNumbers.appendChild(pageBtn);
            }
        });
    }

    function changePage(page) {
        if (page < 1 || page > Math.ceil(filteredData.length / itemsPerPage)) return;
        currentPage = page;
        updateTable();
        updatePagination();
    }

    function updateStatistics() {
        document.getElementById('totalFlights').textContent = filteredData.length;
        document.getElementById('statsTotalFlights').textContent = filteredData.length;

        let totalMinutes = 0;
        let totalFuel = 0;

        filteredData.forEach(flight => {
            totalMinutes += timeToMinutes(flight.flightTime);
            totalFuel += parseFloat(flight.fuelBurn) || 0;
        });

        const totalHours = Math.floor(totalMinutes / 60);
        const remainingMinutes = totalMinutes % 60;

        document.getElementById('totalHours').textContent = `${totalHours}:${remainingMinutes.toString().padStart(2, '0')}`;
        document.getElementById('totalFuel').textContent = totalFuel.toFixed(1);
        document.getElementById('statsTotalFuel').textContent = totalFuel.toFixed(1);

        const avgMinutes = filteredData.length > 0 ? totalMinutes / filteredData.length : 0;
        const avgHours = Math.floor(avgMinutes / 60);
        const avgRemainingMinutes = Math.round(avgMinutes % 60);
        document.getElementById('statsAvgFlightTime').textContent =
        `${avgHours}:${avgRemainingMinutes.toString().padStart(2, '0')}`;

        const uniquePilots = new Set(filteredData.map(f => f.pilotId));
        document.getElementById('statsActivePilots').textContent = uniquePilots.size;

        updateTopPilots();

        updatePopularRoutes();
    }

    function updateTopPilots() {
        const pilotStats = {};

        filteredData.forEach(flight => {
            if (!pilotStats[flight.pilotId]) {
                pilotStats[flight.pilotId] = {
                    name: flight.pilot,
                    flights: 0,
                    totalTime: 0
                };
            }
            pilotStats[flight.pilotId].flights++;
            pilotStats[flight.pilotId].totalTime += timeToMinutes(flight.flightTime);
        });

        const topPilots = Object.values(pilotStats)
            .sort((a, b) => b.flights - a.flights)
            .slice(0, 3);

        const topPilotsContainer = document.getElementById('topPilots');

        if (topPilots.length === 0) {
            topPilotsContainer.innerHTML = '<p style="color: #6b7280; text-align: center;">No pilot data available</p>';
            return;
        }

        topPilotsContainer.innerHTML = topPilots.map((pilot, index) => `
            <div class="pilot-rank">
                <div class="rank-number">${index + 1}</div>
                <div class="pilot-rank-info">
                    <div class="pilot-rank-name">${pilot.name}</div>
                    <div class="pilot-rank-flights">
                        ${pilot.flights} flights • ${Math.floor(pilot.totalTime / 60)}:${(pilot.totalTime % 60).toString().padStart(2, '0')} hours
                    </div>
                </div>
            </div>
        `).join('');
    }

    function updatePopularRoutes() {
        const routeStats = {};

        filteredData.forEach(flight => {
            const routeKey = `${flight.departure}-${flight.arrival}`;
            if (!routeStats[routeKey]) {
                routeStats[routeKey] = {
                    departure: flight.departure,
                    arrival: flight.arrival,
                    count: 0
                };
            }
            routeStats[routeKey].count++;
        });

        const popularRoutes = Object.values(routeStats)
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);

        const popularRoutesContainer = document.getElementById('popularRoutes');

        if (popularRoutes.length === 0) {
            popularRoutesContainer.innerHTML = '<p style="color: #6b7280; text-align: center;">No route data available</p>';
            return;
        }

        popularRoutesContainer.innerHTML = popularRoutes.map(route => `
            <div class="popular-route">
                <div>
                    <span class="airport-code">${route.departure}</span>
                    <i class="fas fa-arrow-right" style="margin: 0 10px; color: #9ca3af;"></i>
                    <span class="airport-code">${route.arrival}</span>
                </div>
                <div class="route-frequency">
                    <i class="fas fa-plane"></i>
                    ${route.count}
                </div>
            </div>
        `).join('');
    }

    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    function formatDateTime(dateTimeString) {
        const date = new Date(dateTimeString);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    function timeToMinutes(timeString) {
        if (!timeString || timeString === 'N/A') return 0;
        const parts = timeString.split(':').map(Number);
        if (parts.length === 2) {
            return parts[0] * 60 + parts[1];
        }
        return 0;
    }

    updatePagination();
});
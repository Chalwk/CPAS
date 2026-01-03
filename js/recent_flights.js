/* © 2025-2026 Jericho Crosby (Chalwk) */

document.addEventListener('DOMContentLoaded', function() {
    let flightsData = [];
    let filteredData = [];
    let currentPage = 1;
    const itemsPerPage = 10;
    let currentSort = { column: 'timestamp', direction: 'desc' };
    let isRefreshing = false;
    let autoRefreshInterval;

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
    setupAutoRefresh();
    setupEventListeners();

    function setupEventListeners() {
        closeSidebar.addEventListener('click', () => {
            flightDetails.style.display = 'none';
        });

        searchInput.addEventListener('input', filterFlights);
        statusFilter.addEventListener('change', filterFlights);
        aircraftFilter.addEventListener('change', filterFlights);

        prevPageBtn.addEventListener('click', () => changePage(currentPage - 1));
        nextPageBtn.addEventListener('click', () => changePage(currentPage + 1));

        refreshDataBtn.addEventListener('click', () => {
            loadFlightData();
            showRefreshNotification();
        });

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
    }

    function setupAutoRefresh() {
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
        }

        autoRefreshInterval = setInterval(() => {
            if (!isRefreshing && document.visibilityState === 'visible') {
                loadFlightData();
            }
        }, 30000);

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                loadFlightData();
            }
        });
    }

    function showRefreshNotification() {
        const notification = document.createElement('div');
        notification.className = 'refresh-notification';
        notification.innerHTML = `
            <i class="fas fa-check-circle"></i>
            <span>Flight data refreshed successfully!</span>
        `;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #059669;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            display: flex;
            align-items: center;
            gap: 10px;
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);

        if (!document.querySelector('#refreshAnimations')) {
            const style = document.createElement('style');
            style.id = 'refreshAnimations';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
    }

    async function loadFlightData() {
        if (isRefreshing) return;

        isRefreshing = true;
        refreshDataBtn.disabled = true;
        refreshDataBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';

        try {
            const response = await fetch('../data/flights.json?t=' + Date.now());
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

            showErrorNotification('Failed to load flight data. Please check your connection.');
        } finally {
            isRefreshing = false;
            refreshDataBtn.disabled = false;
            refreshDataBtn.innerHTML = '<i class="fas fa-redo"></i> Refresh Data';
        }
    }

    function showErrorNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'error-notification';
        notification.innerHTML = `
            <i class="fas fa-exclamation-triangle"></i>
            <span>${message}</span>
        `;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #dc2626;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            display: flex;
            align-items: center;
            gap: 10px;
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }

    function filterFlights() {
        const searchTerm = searchInput.value.toLowerCase();
        const statusValue = statusFilter.value;
        const aircraftValue = aircraftFilter.value;
        const missionFilterValue = document.getElementById('missionFilter')?.value || 'all';

        filteredData = flightsData.filter(flight => {
            const matchesSearch =
            flight.flightNumber.toLowerCase().includes(searchTerm) ||
            flight.pilot.toLowerCase().includes(searchTerm) ||
            flight.departure.toLowerCase().includes(searchTerm) ||
            flight.arrival.toLowerCase().includes(searchTerm) ||
            flight.aircraftReg.toLowerCase().includes(searchTerm) ||
            flight.aircraft.toLowerCase().includes(searchTerm) ||
            flight.id.toLowerCase().includes(searchTerm) ||
            (flight.missionType && flight.missionType.toLowerCase().includes(searchTerm)) ||
            (flight.missionDetails && flight.missionDetails.toLowerCase().includes(searchTerm));

            const matchesStatus = statusValue === 'all' || flight.status === statusValue;

            const matchesAircraft = aircraftValue === 'all' ||
            flight.aircraftIcao === aircraftValue ||
            flight.aircraft.toLowerCase().includes(aircraftValue.toLowerCase());

            const matchesMission = missionFilterValue === 'all' ||
            (missionFilterValue === 'SimBrief' && flight.source === 'SimBrief') ||
            (missionFilterValue === 'MissionReport' && flight.source === 'MissionReport') ||
            (flight.missionType === missionFilterValue);

            return matchesSearch && matchesStatus && matchesAircraft && matchesMission;
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

            if (currentSort.column === 'date' || currentSort.column === 'timestamp' || currentSort.column === 'lastUpdated') {
                aValue = new Date(aValue || 0);
                bValue = new Date(bValue || 0);
            } else if (currentSort.column === 'flightTime') {
                aValue = timeToMinutes(aValue);
                bValue = timeToMinutes(bValue);
            } else if (typeof aValue === 'string') {
                aValue = aValue.toLowerCase();
                bValue = bValue.toLowerCase();
            }

            if (aValue < bValue) return currentSort.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return currentSort.direction === 'asc' ? 1 : -1;
            return 0;
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
            <td colspan="10" style="text-align: center; padding: 40px; color: #6b7280;">
                <i class="fas fa-plane-slash"></i> No flights found matching your criteria.
            </td>
        </tr>
    `;
            return;
        }

        flightsTableBody.innerHTML = pageData.map(flight => {
            const isMission = flight.source === 'MissionReport';
            const missionIcon = isMission ? '🚁 ' : '';
            const missionClass = isMission ? 'mission-row' : '';
            const missionType = isMission ? getMissionTypeDisplay(flight.missionType) : 'Normal Flight';

            const departureDate = flight.departure_date || flight.date;
            const departureDateFormatted = formatDate(departureDate);
            const departureTime = flight.departure_time_utc || 'N/A';
            const arrivalTime = flight.arrival_time_utc || 'N/A';

            let routeDisplay = flight.route;
            if (isMission && flight.missionType) {
                routeDisplay = `${missionIcon}${missionType}`;
                if (flight.missionDetails) {
                    routeDisplay += `: ${truncateText(flight.missionDetails, 30)}`;
                }
            }

            return `
        <tr data-flight-id="${flight.id}" class="${missionClass}" data-source="${flight.source}">
            <td>
                <div class="flight-number">${flight.id}</div>
                ${isMission ? '<span class="mission-badge">MISSION</span>' : ''}
            </td>
            <td>${departureDateFormatted}</td>
            <td>
                <div class="time-info">
                    <div class="time-display">${departureTime}</div>
                    <small class="time-label">UTC</small>
                </div>
            </td>
            <td>
                <div class="time-info">
                    <div class="time-display">${arrivalTime}</div>
                    <small class="time-label">UTC</small>
                </div>
            </td>
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
                    <div class="aircraft-type">${flight.aircraft}</div>
                </div>
            </td>
            <td>
                <div class="route-info">
                    <div class="route-airports">
                        <span class="airport-code">${flight.departure}</span>
                        <i class="fas fa-arrow-right route-arrow"></i>
                        <span class="airport-code">${flight.arrival}</span>
                    </div>
                    <div class="route-details">${routeDisplay}</div>
                </div>
            </td>
            <td>${formatFlightTimeDisplay(flight.flightTime)}</td>
            <td>
                <span class="status-badge status-${flight.status}">
                    ${formatStatus(flight.status)}
                </span>
            </td>
            <td>
                <div class="table-actions">
                    <button class="btn-icon view-flight" data-flight-id="${flight.id}" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
        }).join('');

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

    function formatStatus(status) {
        const statusMap = {
            'completed': 'Completed',
            'in-progress': 'In Progress',
            'scheduled': 'Scheduled',
            'cancelled': 'Cancelled',
            'diverted': 'Diverted'
        };
        return statusMap[status] || status;
    }

    function showFlightDetails(flightId) {
        const flight = flightsData.find(f => f.id === flightId);
        if (!flight) return;

        document.getElementById('detailFlightNumber').textContent = flight.id;
        document.getElementById('detailCallsign').textContent = flight.callsign;
        document.getElementById('detailDate').textContent = formatDate(flight.date);
        document.getElementById('detailStatus').textContent = formatStatus(flight.status);
        document.getElementById('detailStatus').className = `status-badge status-${flight.status.replace('-', '')}`;

        document.getElementById('detailDeparture').textContent = flight.departure;
        document.getElementById('detailArrival').textContent = flight.arrival;
        document.getElementById('detailAlternate').textContent = flight.alternate;
        document.getElementById('detailCruiseAlt').textContent = `${flight.cruiseAlt} ft`;
        document.getElementById('detailRoute').textContent = flight.route;
        document.getElementById('detailDistance').textContent = flight.route_distance + (flight.route_distance !== 'N/A' ? ' nm' : '');

        document.getElementById('detailAircraft').textContent = flight.aircraft;
        document.getElementById('detailAircraftReg').textContent = flight.aircraftReg;
        document.getElementById('detailAircraftIcao').textContent = flight.aircraftIcao;
        document.getElementById('detailPaxCount').textContent = flight.pax_count || '-';

        document.getElementById('detailFlightTime').textContent = formatFlightTimeDisplay(flight.flightTime);
        document.getElementById('detailBlockTime').textContent = formatFlightTimeDisplay(flight.blockTime);

        document.getElementById('detailPilot').textContent = flight.pilot;
        document.getElementById('detailPilotId').textContent = flight.pilotId;

        document.getElementById('detailSource').textContent = flight.source;
        document.getElementById('detailTimestamp').textContent = formatDateTime(flight.timestamp);

        const routeSection = document.querySelector('.detail-section:nth-child(2)');

        let departureTimeItem = document.getElementById('detailDepartureTime');
        let arrivalTimeItem = document.getElementById('detailArrivalTime');

        if (!departureTimeItem) {
            const departureDiv = document.createElement('div');
            departureDiv.className = 'detail-item';
            departureDiv.innerHTML = `
            <span class="detail-label">Departure (UTC):</span>
            <span class="detail-value" id="detailDepartureTime">-</span>
        `;

            const arrivalDiv = document.createElement('div');
            arrivalDiv.className = 'detail-item';
            arrivalDiv.innerHTML = `
            <span class="detail-label">Arrival (UTC):</span>
            <span class="detail-value" id="detailArrivalTime">-</span>
        `;

            const cruiseAltItem = document.querySelector('.detail-item:has(#detailCruiseAlt)');
            if (cruiseAltItem) {
                cruiseAltItem.parentNode.insertBefore(departureDiv, cruiseAltItem.nextSibling);
                cruiseAltItem.parentNode.insertBefore(arrivalDiv, departureDiv.nextSibling);
            }
        }

        document.getElementById('detailDepartureTime').textContent = flight.departure_time_utc || 'N/A';
        document.getElementById('detailArrivalTime').textContent = flight.arrival_time_utc || 'N/A';

        const missionDetailsSection = document.getElementById('missionDetailsSection');
        if (!missionDetailsSection && flight.source === 'MissionReport') {
            addMissionDetailsToSidebar(flight);
        } else if (missionDetailsSection) {
            if (flight.source === 'MissionReport') {
                updateMissionDetails(flight);
            } else {
                missionDetailsSection.remove();
            }
        }

        flightDetails.style.display = 'flex';
    }

    function addMissionDetailsToSidebar(flight) {
        const sidebarContent = document.querySelector('.sidebar-content');

        const missionSection = document.createElement('div');
        missionSection.className = 'detail-section';
        missionSection.id = 'missionDetailsSection';
        missionSection.innerHTML = `
        <h4><i class="fas fa-helicopter"></i> Mission Details</h4>
        <div class="detail-grid">
            <div class="detail-item">
                <span class="detail-label">Mission Type:</span>
                <span class="detail-value mission-type" id="detailMissionType">${getMissionTypeDisplay(flight.missionType)}</span>
            </div>
            ${flight.patients ? `
            <div class="detail-item">
                <span class="detail-label">Patients:</span>
                <span class="detail-value" id="detailPatients">${flight.patients}</span>
            </div>
            ` : ''}
            ${flight.weather ? `
            <div class="detail-item">
                <span class="detail-label">Weather:</span>
                <span class="detail-value" id="detailWeather">${flight.weather}</span>
            </div>
            ` : ''}
            ${flight.missionDetails ? `
            <div class="detail-item full-width">
                <span class="detail-label">Details:</span>
                <span class="detail-value" id="detailMissionDetails">${flight.missionDetails}</span>
            </div>
            ` : ''}
            ${flight.challenges ? `
            <div class="detail-item full-width">
                <span class="detail-label">Challenges:</span>
                <span class="detail-value" id="detailChallenges">${flight.challenges}</span>
            </div>
            ` : ''}
            ${flight.notes ? `
            <div class="detail-item full-width">
                <span class="detail-label">Notes:</span>
                <span class="detail-value" id="detailNotes">${flight.notes}</span>
            </div>
            ` : ''}
        </div>
    `;

        const sourceSection = document.querySelector('.detail-section:last-child');
        sidebarContent.insertBefore(missionSection, sourceSection);
    }

    function updateMissionDetails(flight) {
        if (document.getElementById('detailMissionType')) {
            document.getElementById('detailMissionType').textContent = getMissionTypeDisplay(flight.missionType);
        }
        if (flight.patients && document.getElementById('detailPatients')) {
            document.getElementById('detailPatients').textContent = flight.patients;
        }
        if (flight.weather && document.getElementById('detailWeather')) {
            document.getElementById('detailWeather').textContent = flight.weather;
        }
        if (flight.missionDetails && document.getElementById('detailMissionDetails')) {
            document.getElementById('detailMissionDetails').textContent = flight.missionDetails;
        }
        if (flight.challenges && document.getElementById('detailChallenges')) {
            document.getElementById('detailChallenges').textContent = flight.challenges;
        }
        if (flight.notes && document.getElementById('detailNotes')) {
            document.getElementById('detailNotes').textContent = flight.notes;
        }
    }

    function getMissionTypeDisplay(type) {
        const typeMap = {
            'SAR': 'Search & Rescue',
            'PATIENT': 'Patient Transfer',
            'MEDEVAC': 'Medical Evacuation',
            'FIRE': 'Firefighting',
            'POLICE': 'Law Enforcement',
            'SURVEY': 'Aerial Survey',
            'VIP': 'VIP Transport',
            'TOUR_GLACIER': 'Glacier Tour',
            'TOUR_SIGHTSEEING': 'Sightseeing Tour',
            'TRAINING': 'Training',
            'MAINTENANCE': 'Maintenance',
            'TEST': 'Test Flight',
            'OTHER': 'Other Mission'
        };
        return typeMap[type] || type;
    }

    function truncateText(text, maxLength) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
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

        flightsTableBody.parentElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function updateStatistics() {
        document.getElementById('totalFlights').textContent = filteredData.length;
        document.getElementById('statsTotalFlights').textContent = filteredData.length;

        let totalMinutes = 0;
        let totalDistance = 0;
        let countedFlights = 0;

        filteredData.forEach(flight => {
            if (flight.status === 'completed' || flight.status === 'diverted') {
                totalMinutes += timeToMinutes(flight.flightTime);
                countedFlights++;
            }

            let distStr = flight.route_distance.toString();
            let distNum = parseFloat(distStr.replace(/[^\d.-]/g, ''));
            if (!isNaN(distNum)) {
                totalDistance += distNum;
            }
        });

        const totalHours = Math.floor(totalMinutes / 60);
        const totalRemainingMinutes = Math.floor(totalMinutes % 60);

        const totalTimeDisplay = totalHours > 0
            ? `${totalHours}h ${totalRemainingMinutes}m`
            : `${totalRemainingMinutes}m`;

        document.getElementById('totalHours').textContent = totalTimeDisplay;
        document.getElementById('totalDistance').textContent = totalDistance.toFixed(1);
        document.getElementById('statsTotalDistance').textContent = totalDistance.toFixed(1);

        const avgMinutes = countedFlights > 0 ? totalMinutes / countedFlights : 0;
        const avgHours = Math.floor(avgMinutes / 60);
        const avgRemainingMinutes = Math.floor(avgMinutes % 60);

        const avgTimeDisplay = avgHours > 0
            ? `${avgHours}h ${avgRemainingMinutes}m`
            : `${avgRemainingMinutes}m`;

        document.getElementById('statsAvgFlightTime').textContent = avgTimeDisplay;

        const uniquePilots = new Set(filteredData.map(f => f.pilot));
        document.getElementById('statsActivePilots').textContent = uniquePilots.size;

        updateTopPilots();
        updatePopularRoutes();
    }

    function updateTopPilots() {
        const pilotStats = {};

        filteredData.forEach(flight => {
            const pilotName = flight.pilot;
            if (!pilotStats[pilotName]) {
                pilotStats[pilotName] = {
                    name: pilotName,
                    flights: 0,
                    totalTime: 0
                };
            }

            if (flight.status === 'completed' || flight.status === 'diverted') {
                pilotStats[pilotName].flights++;
                pilotStats[pilotName].totalTime += timeToMinutes(flight.flightTime);
            }
        });

        const topPilots = Object.values(pilotStats)
            .sort((a, b) => b.flights - a.flights)
            .slice(0, 3);

        const topPilotsContainer = document.getElementById('topPilots');

        if (topPilots.length === 0) {
            topPilotsContainer.innerHTML = '<p style="color: #6b7280; text-align: center;">No pilot data available</p>';
            return;
        }

        topPilotsContainer.innerHTML = topPilots.map((pilot, index) => {
            const totalHours = Math.floor(pilot.totalTime / 60);
            const totalMinutes = Math.floor(pilot.totalTime % 60);
            const timeDisplay = totalHours > 0
                ? `${totalHours}h ${totalMinutes}m`
                : `${totalMinutes}m`;

            return `
            <div class="pilot-rank">
                <div class="rank-number">${index + 1}</div>
                <div class="pilot-rank-info">
                    <div class="pilot-rank-name">${pilot.name}</div>
                    <div class="pilot-rank-flights">
                        ${pilot.flights} flights • ${timeDisplay}
                    </div>
                </div>
            </div>
        `;
        }).join('');
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
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString;

            const day = date.getDate();
            const month = date.getMonth() + 1;
            const year = date.getFullYear().toString().slice(-2);

            return `${day}/${month}/${year}`;
        } catch (e) {
            return dateString;
        }
    }

    function formatDateTime(dateTimeString) {
        try {
            const date = new Date(dateTimeString);
            if (isNaN(date.getTime())) return dateTimeString;
            return date.toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch (e) {
            return dateTimeString;
        }
    }

    function timeToMinutes(timeString) {
        if (!timeString || timeString === 'N/A') return 0;

        try {
            const parts = timeString.split(':');
            if (parts.length === 2) {
                const minutes = parseInt(parts[0], 10);
                const seconds = parseInt(parts[1], 10);

                if (!isNaN(minutes)) {
                    return minutes + (seconds / 60);
                }
            }

            const decimalValue = parseFloat(timeString);
            if (!isNaN(decimalValue)) {
                return decimalValue;
            }

            return 0;
        } catch (e) {
            console.error('Error parsing time:', timeString, e);
            return 0;
        }
    }

    function formatFlightTimeDisplay(timeString) {
        if (!timeString || timeString === 'N/A') return 'N/A';

        try {
            const parts = timeString.split(':');
            if (parts.length === 2) {
                const totalMinutes = parseInt(parts[0], 10);
                const seconds = parseInt(parts[1], 10);

                if (!isNaN(totalMinutes)) {
                    const totalExactMinutes = totalMinutes + (seconds / 60);
                    const hours = Math.floor(totalExactMinutes / 60);
                    const minutes = Math.floor(totalExactMinutes % 60);

                    if (hours > 0) {
                        return `${hours}h ${minutes}m`;
                    } else {
                        return `${minutes}m`;
                    }
                }
            }

            const decimalValue = parseFloat(timeString);
            if (!isNaN(decimalValue)) {
                const hours = Math.floor(decimalValue / 60);
                const minutes = Math.floor(decimalValue % 60);

                if (hours > 0) {
                    return `${hours}h ${minutes}m`;
                } else {
                    return `${minutes}m`;
                }
            }

            return timeString;
        } catch (e) {
            console.error('Error formatting flight time:', timeString, e);
            return timeString;
        }
    }

    updatePagination();
});
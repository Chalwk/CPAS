// Copyright (c) 2025. Jericho Crosby (Chalwk)

document.addEventListener('DOMContentLoaded', function() {
    fetch('../data/members.json')
        .then(response => response.json())
        .then(data => {
        const teamGrid = document.getElementById('team-grid');

        teamGrid.innerHTML = '';

        data.members.forEach(member => {
            teamGrid.appendChild(createMemberCard(member));
        });

        teamGrid.appendChild(createJoinCard());

        updateTeamStatistics(data.members.length);
    })
        .catch(error => console.error('Error loading members:', error));
});

function createMemberCard(member) {
    const card = document.createElement('div');
    card.className = 'member-card';
    card.innerHTML = `
        <div class="member-header">
            <h3>${member.name}</h3>
            <span class="member-role">${member.role}</span>
        </div>
        <div class="member-avatar">
            <i class="fas fa-user"></i>
        </div>
        <div class="member-details">
            <p><i class="fas fa-clock"></i> <strong>Hours on Record:</strong> <span class="member-hours">${member.hours}</span></p>
            <p><i class="fas fa-id-card"></i> <strong>VATSIM ID:</strong> ${member.vatsimId}</p>
            <p><i class="fas fa-plane"></i> <strong>Favorite Aircraft:</strong> ${member.favoriteAircraft}</p>
            <p><i class="fas fa-map-marker-alt"></i> <strong>Base:</strong> ${member.base}</p>
            <p><i class="fas fa-certificate"></i> <strong>Status:</strong>
                <span class="member-status status-${member.status === 'Active' ? 'active' : 'inactive'}">
                    <i class="fas fa-circle" style="font-size: 0.6rem; margin-right: 5px;"></i> ${member.status}
                </span>
                ${member.badge ? `<span class="member-badge">${member.badge}</span>` : ''}
            </p>
            <p style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
                <i class="fas fa-quote-left"></i>
                <em>${member.quote}</em>
            </p>
        </div>
    `;

    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';

    return card;
}

function createJoinCard() {
    const card = document.createElement('div');
    card.className = 'member-card';
    card.style.backgroundColor = '#f0f9ff';
    card.style.border = '2px dashed #93c5fd';

    card.innerHTML = `
        <div class="member-header" style="background-color: #3b82f6;">
            <h3>Join Our Team!</h3>
            <span class="member-role">Future Pilot</span>
        </div>
        <div class="member-avatar">
            <div style="width: 150px; height: 150px; border-radius: 50%; background-color: #dbeafe; display: flex; align-items: center; justify-content: center; border: 4px solid white;">
                <i class="fas fa-user-plus" style="font-size: 3rem; color: #3b82f6;"></i>
            </div>
        </div>
        <div class="member-details" style="text-align: center;">
            <p style="font-size: 1.1rem; margin-bottom: 20px; color: #1e40af;">
                <i class="fas fa-star"></i>
                <strong>Could this be you?</strong>
            </p>
            <p id="recruitment-text">We're always looking for passionate virtual pilots to join our growing team!</p>
            <a class="btn btn-primary"
               href="../index.html#discord"
               style="margin-top: 15px; display: inline-block;"> Apply Now </a>
        </div>
    `;

    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';

    return card;
}

function updateTeamStatistics(count) {
    const activePilotsElement = document.getElementById('active-pilots-count');
    if (activePilotsElement) {
        activePilotsElement.textContent = count;
    }

    const recruitmentTextElement = document.getElementById('recruitment-text');
    if (recruitmentTextElement) {
        if (count === 1) {
            recruitmentTextElement.textContent = "We're a brand new virtual air charter looking for our first team members to help build this community from the ground up!";
        } else {
            recruitmentTextElement.textContent = "We're expanding our virtual air charter and looking for more passionate pilots to join our growing team!";
        }
    }
}

function animateMembersOnScroll() {
    const memberCards = document.querySelectorAll('.member-card');
    memberCards.forEach(card => {
        const cardPosition = card.getBoundingClientRect().top;
        const screenPosition = window.innerHeight / 1.2;
        if (cardPosition < screenPosition) {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        animateMembersOnScroll();
        window.addEventListener('scroll', animateMembersOnScroll);
    }, 500);
});
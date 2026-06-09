/**
 * Hlavný riadiaci skript aplikácie (SPA Router, Formuláre, Modálne okná, Polling)
 */
const app = {
  currentView: 'home',
  activeTournamentId: null,
  activeMatchToEdit: null,
  tempScorers: { team1: [], team2: [] }, // Pomocné pole pre strelcov počas editácie
  pollingInterval: null,
  activeRoundFilter: 'all',
  drawTeams: [], // Zoznam tímov pre žrebovanie
  wizardBreaks: [], // Zoznam prestávok v Kroku 3
  draggedTeamIdx: null, // Index ťahaného tímu pre Drag & Drop
  adminEditTeams: [],
  adminEditBreaks: [],
  isEditingBreakForAdmin: false,

  /**
   * Inicializácia aplikácie
   */
  init: function() {
    this.setupRoutes();
    this.setupEventListeners();
    this.checkOnlineIndicator();
    
    // Periodická kontrola internetového pripojenia každých 10 sekúnd
    setInterval(() => this.checkOnlineIndicator(), 10000);
  },

  /**
   * Nastavenie smerovania (Routing)
   */
  setupRoutes: function() {
    const handleRoute = () => {
      const hash = window.location.hash || '#home';
      this.clearPolling(); // Vždy zastavíme predchádzajúce dopytovanie

      if (hash === '#home') {
        this.switchView('home-view');
        this.loadHomeScreen();
      } else if (hash === '#create') {
        this.switchView('create-view');
        this.resetWizard();
      } else if (hash.startsWith('#tournament/')) {
        const id = hash.split('/')[1];
        this.activeTournamentId = id;
        this.switchView('tournament-view');
        this.loadTournamentScreen(id);
        
        // Spustíme online synchronizáciu každých 5 sekúnd pre divákov
        this.pollingInterval = setInterval(() => {
          this.refreshTournamentData(id);
        }, 5000);
      } else {
        window.location.hash = '#home';
      }
    };

    window.addEventListener('hashchange', handleRoute);
    // Spustiť pri prvom načítaní
    handleRoute();
  },

  /**
   * Prepínanie pohľadov v HTML
   */
  switchView: function(viewId) {
    document.querySelectorAll('.view-section').forEach(section => {
      section.classList.add('hidden');
    });
    const targetSection = document.getElementById(viewId);
    if (targetSection) {
      targetSection.classList.remove('hidden');
    }
    
    // Upravíme aktívny link v menu
    const navHome = document.getElementById('nav-home');
    if (viewId === 'home-view') {
      navHome.classList.add('active');
    } else {
      navHome.classList.remove('active');
    }

    // Scroll hore pri zmene stránky
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  /**
   * Zrušenie dopytovania (polling)
   */
  clearPolling: function() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  },

  /**
   * Zobrazí stav pripojenia (Online / Offline) v rohu obrazovky
   */
  checkOnlineIndicator: async function() {
    await Api.checkConnection();
    
    let indicator = document.getElementById('connection-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'connection-indicator';
      indicator.style.position = 'fixed';
      indicator.style.bottom = '16px';
      indicator.style.left = '16px';
      indicator.style.padding = '6px 12px';
      indicator.style.borderRadius = '20px';
      indicator.style.fontSize = '0.75rem';
      indicator.style.fontWeight = '700';
      indicator.style.zIndex = '999';
      indicator.style.display = 'flex';
      indicator.style.alignItems = 'center';
      indicator.style.gap = '6px';
      indicator.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
      indicator.style.transition = 'all 0.3s ease';
      document.body.appendChild(indicator);
    }

    if (Api.isOnlineMode) {
      indicator.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
      indicator.style.border = '1px solid #10b981';
      indicator.style.color = '#10b981';
      indicator.innerHTML = '<span style="width: 8px; height: 8px; background-color:#10b981; border-radius:50%; display:inline-block;"></span> Online režim';
    } else {
      indicator.style.backgroundColor = 'rgba(245, 158, 11, 0.15)';
      indicator.style.border = '1px solid #f59e0b';
      indicator.style.color = '#f59e0b';
      indicator.innerHTML = '<span style="width: 8px; height: 8px; background-color:#f59e0b; border-radius:50%; display:inline-block; animation: pulseLive 1.5s infinite;"></span> Lokálny režim (Offline)';
    }
  },

  /**
   * Zobrazí toast správu (Upozornenie)
   */
  showToast: function(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = '✔️';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    // Odstránenie po 3.5 sekundách
    setTimeout(() => {
      toast.style.transform = 'translateX(120%)';
      toast.style.transition = 'transform 0.3s ease-in';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  /**
   * Pomocná navigácia pre interné prepínanie stránok
   */
  navigateTo: function(hash) {
    window.location.hash = hash;
  },

  // ==========================================
  // POHĽAD: ZOZNAM TURNAJOV (DOMOV)
  // ==========================================
  
  tournamentsData: [], // Vyrovnávacia pamäť pre filtrovanie

  loadHomeScreen: async function() {
    const spinner = document.getElementById('loading-spinner');
    const noTournaments = document.getElementById('no-tournaments');
    const grid = document.getElementById('tournaments-grid');
    
    spinner.classList.remove('hidden');
    noTournaments.classList.add('hidden');
    grid.innerHTML = '';

    try {
      this.tournamentsData = await Api.getAllTournaments();
      spinner.classList.add('hidden');
      
      this.applyFilters();
    } catch (e) {
      spinner.classList.add('hidden');
      this.showToast('Nepodarilo sa načítať turnaje.', 'error');
    }
  },

  applyFilters: function() {
    const searchQuery = document.getElementById('search-input').value.toLowerCase().trim();
    const categoryQuery = document.getElementById('category-filter') ? document.getElementById('category-filter').value.toLowerCase().trim() : '';
    const formatFilter = document.getElementById('format-filter').value;
    const grid = document.getElementById('tournaments-grid');
    const noTournaments = document.getElementById('no-tournaments');

    // Filtrujeme dáta
    const filtered = this.tournamentsData.filter(t => {
      const matchesSearch = t.name.toLowerCase().includes(searchQuery) || t.location.toLowerCase().includes(searchQuery);
      
      const matchesCategory = !categoryQuery || (t.category && t.category.toLowerCase().includes(categoryQuery));
      
      let matchesFormat = false;
      if (formatFilter === 'all') {
        matchesFormat = true;
      } else if (formatFilter === 'league') {
        matchesFormat = t.format === 'league';
      } else if (formatFilter === 'knockout') {
        matchesFormat = t.format === 'knockout';
      } else if (formatFilter === 'groups') {
        matchesFormat = ['groups_2_top2', 'groups_2_all', 'groups_4_top2'].includes(t.format);
      }
      
      return matchesSearch && matchesFormat && matchesCategory;
    });

    grid.innerHTML = '';

    if (filtered.length === 0) {
      noTournaments.classList.remove('hidden');
    } else {
      noTournaments.classList.add('hidden');
      filtered.forEach(t => {
        grid.innerHTML += Components.renderTournamentCard(t);
      });
    }
  },

  // ==========================================
  // POHĽAD: VYTVORENIE TURNAJA (WIZARD)
  // ==========================================
  
  wizardTeams: [], // Zoznam tímov počas tvorby

  resetWizard: function() {
    // Krok 1
    document.getElementById('create-tournament-form').reset();
    this.wizardTeams = [];
    this.drawTeams = [];
    this.wizardBreaks = [];
    this.draggedTeamIdx = null;
    this.updateTeamsListUI();

    // Zobrazenie prvého kroku
    document.getElementById('wizard-step-1').classList.remove('hidden');
    document.getElementById('wizard-step-2').classList.add('hidden');
    document.getElementById('wizard-step-draw').classList.add('hidden');
    document.getElementById('wizard-step-4').classList.add('hidden');

    // Indikátory kroku
    document.getElementById('step-ind-1').className = 'step-indicator active';
    document.getElementById('step-ind-2').className = 'step-indicator';
    document.getElementById('step-ind-3').className = 'step-indicator';
    document.getElementById('step-ind-4').className = 'step-indicator';
  },

  nextToTeams: function() {
    // Validácia kroku 1
    const name = document.getElementById('t-name').value.trim();
    const location = document.getElementById('t-location').value.trim();
    const date = document.getElementById('t-date').value;
    const duration = document.getElementById('t-match-duration').value;

    if (!name || !location || !date || !duration) {
      this.showToast('Vyplňte prosím všetky povinné polia označené hviezdičkou (*)', 'warning');
      return;
    }

    // Prepnutie na krok 2
    document.getElementById('wizard-step-1').classList.add('hidden');
    document.getElementById('wizard-step-2').classList.remove('hidden');

    document.getElementById('step-ind-1').className = 'step-indicator';
    document.getElementById('step-ind-2').className = 'step-indicator active';
  },

  backToInfo: function() {
    document.getElementById('wizard-step-2').classList.add('hidden');
    document.getElementById('wizard-step-1').classList.remove('hidden');

    document.getElementById('step-ind-2').className = 'step-indicator';
    document.getElementById('step-ind-1').className = 'step-indicator active';
  },

  addTeam: function() {
    const nameInput = document.getElementById('team-name-input');
    const emojiSelect = document.getElementById('team-emoji-select');
    const name = nameInput.value.trim();
    const emoji = emojiSelect.value;

    if (!name) {
      this.showToast('Zadajte názov tímu!', 'warning');
      return;
    }

    // Skontrolujeme duplicitu názvu
    if (this.wizardTeams.some(t => t.name.toLowerCase() === name.toLowerCase())) {
      this.showToast('Tím s takýmto názvom už existuje!', 'warning');
      return;
    }

    // Pridáme tím
    this.wizardTeams.push({
      id: 'team_' + Utils.generateId(),
      name: name,
      emoji: emoji
    });

    nameInput.value = '';
    
    // Vyberieme náhodné emoji pre ďalší vstup
    const options = emojiSelect.options;
    const randomIdx = Math.floor(Math.random() * options.length);
    emojiSelect.selectedIndex = randomIdx;

    this.updateTeamsListUI();
  },

  removeTeam: function(teamId) {
    this.wizardTeams = this.wizardTeams.filter(t => t.id !== teamId);
    this.updateTeamsListUI();
  },

  updateTeamsListUI: function() {
    const list = document.getElementById('teams-list');
    const count = document.getElementById('team-count');
    
    count.innerText = this.wizardTeams.length;
    list.innerHTML = '';

    if (this.wizardTeams.length === 0) {
      list.innerHTML = '<div class="no-teams-placeholder">Zatiaľ neboli pridané žiadne tímy.</div>';
      return;
    }

    this.wizardTeams.forEach(team => {
      list.innerHTML += `
        <div class="team-item">
          <div class="team-item-info">
            <span class="team-item-emoji">${team.emoji}</span>
            <span class="team-item-name" title="${team.name}">${team.name}</span>
          </div>
          <button type="button" class="btn-remove-team" onclick="app.removeTeam('${team.id}')">&times;</button>
        </div>
      `;
    });
  },

  fillPlaceholderTeams: function(teams, format) {
    const filled = [...teams];
    const n = filled.length;
    let target = n;

    if (format === 'league') {
      if (n < 3) target = 3;
    } else if (format === 'knockout') {
      if (n <= 4) target = 4;
      else if (n <= 8) target = 8;
      else if (n <= 16) target = 16;
    } else if (format === 'groups_2_top2') {
      if (n < 6) target = 6;
      else if (n % 2 !== 0) target = n + 1;
    } else if (format === 'groups_2_all') {
      target = 8;
    } else if (format === 'groups_4_top2') {
      if (n < 8) target = 8;
      else if (n % 4 !== 0) target = 4 * Math.ceil(n / 4);
    }

    let placeholderCount = 1;
    filled.forEach(t => {
      if (t.name.startsWith('Voľné miesto')) {
        const num = parseInt(t.name.replace('Voľné miesto ', ''));
        if (!isNaN(num) && num >= placeholderCount) {
          placeholderCount = num + 1;
        }
      }
    });

    while (filled.length < target) {
      filled.push({
        id: 'team_placeholder_' + Utils.generateId(),
        name: `Voľné miesto ${placeholderCount++}`,
        emoji: '❓',
        isPlaceholder: true
      });
    }

    return filled;
  },

  nextToDraw: function() {
    const format = document.getElementById('t-format').value;
    const lookingForTeams = document.getElementById('t-looking-for-teams') ? document.getElementById('t-looking-for-teams').checked : false;

    if (lookingForTeams) {
      this.wizardTeams = this.fillPlaceholderTeams(this.wizardTeams, format);
      this.updateTeamsListUI();
    }
    
    const n = this.wizardTeams.length;

    // Validácia počtu tímov
    if (format === 'league') {
      if (n < 3) {
        this.showToast('Ligový turnaj vyžaduje minimálne 3 tímy!', 'warning');
        return;
      }
    } else if (format === 'knockout') {
      if (n !== 4 && n !== 8 && n !== 16) {
        this.showToast('Vyraďovací turnaj (pavúk) vyžaduje presne 4, 8 alebo 16 tímov! Aktuálne máte: ' + n, 'warning');
        return;
      }
    } else if (format === 'groups_2_top2') {
      if (n < 6 || n % 2 !== 0) {
        this.showToast('Tento formát vyžaduje párny počet tímov (minimálne 6)!', 'warning');
        return;
      }
    } else if (format === 'groups_2_all') {
      if (n !== 8) {
        this.showToast('Tento formát vyžaduje presne 8 tímov (4 v každej skupine)!', 'warning');
        return;
      }
    } else if (format === 'groups_4_top2') {
      if (n < 8 || n % 4 !== 0) {
        this.showToast('Tento formát vyžaduje počet tímov deliteľný 4 (minimálne 8 tímov)!', 'warning');
        return;
      }
    }

    // Prekopírujeme tímy do drawTeams pre krok žrebovania
    this.drawTeams = [...this.wizardTeams];
    this.wizardBreaks = [];
    this.draggedTeamIdx = null;

    // Prepnutie na krok 3 (Žrebovanie)
    document.getElementById('wizard-step-2').classList.add('hidden');
    document.getElementById('wizard-step-draw').classList.remove('hidden');

    document.getElementById('step-ind-2').className = 'step-indicator';
    document.getElementById('step-ind-3').className = 'step-indicator active';

    this.updateDrawWorkspace();
  },

  backToTeams: function() {
    document.getElementById('wizard-step-draw').classList.add('hidden');
    document.getElementById('wizard-step-2').classList.remove('hidden');

    document.getElementById('step-ind-3').className = 'step-indicator';
    document.getElementById('step-ind-2').className = 'step-indicator active';
  },

  // ==========================================
  // POHĽAD: ŽREBOVANIE A HARMONOGRAM (WIZARD KROK 3)
  // ==========================================

  updateDrawWorkspace: function() {
    const format = document.getElementById('t-format').value;
    
    // 1. Vykreslenie tímov (Drag & Drop)
    const groupsContainer = document.getElementById('draw-groups-container');
    groupsContainer.innerHTML = '';
    
    const groups = {};
    if (format === 'league') {
      groups['Ligová skupina'] = this.drawTeams.map((t, idx) => ({ team: t, index: idx }));
    } else if (format === 'knockout') {
      groups['Nasadené tímy'] = this.drawTeams.map((t, idx) => ({ team: t, index: idx }));
    } else {
      let numGroups = 2;
      if (format === 'groups_4_top2') numGroups = 4;
      const groupNames = ['Skupina A', 'Skupina B', 'Skupina C', 'Skupina D'].slice(0, numGroups);
      groupNames.forEach(name => groups[name] = []);
      this.drawTeams.forEach((team, idx) => {
        const groupName = groupNames[idx % numGroups];
        groups[groupName].push({ team: team, index: idx });
      });
    }

    Object.keys(groups).forEach(groupName => {
      const items = groups[groupName];
      let itemsHtml = '';
      items.forEach(item => {
        itemsHtml += `
          <div class="draggable-team" draggable="true" data-index="${item.index}">
            <span class="team-item-emoji">${item.team.emoji}</span>
            <span class="team-item-name" title="${item.team.name}">${item.team.name}</span>
          </div>
        `;
      });
      
      groupsContainer.innerHTML += `
        <div class="draw-group-box">
          <h5>${groupName}</h5>
          <div class="draw-teams-dropzone" data-group="${groupName}">
            ${itemsHtml}
          </div>
        </div>
      `;
    });
    
    // Priradenie drag & drop eventov
    this.setupDragAndDropEvents();
    
    // 2. Prepočet a vykreslenie harmonogramu
    this.renderWizardSchedule();
  },

  setupDragAndDropEvents: function() {
    document.querySelectorAll('.draggable-team').forEach(el => {
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', el.getAttribute('data-index'));
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
      });
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        const sourceIdx = parseInt(e.dataTransfer.getData('text/plain'));
        const targetIdx = parseInt(el.getAttribute('data-index'));
        if (sourceIdx !== targetIdx && !isNaN(sourceIdx) && !isNaN(targetIdx)) {
          const temp = this.drawTeams[sourceIdx];
          this.drawTeams[sourceIdx] = this.drawTeams[targetIdx];
          this.drawTeams[targetIdx] = temp;
          this.updateDrawWorkspace();
        }
      });
    });
  },

  renderWizardSchedule: function() {
    const format = document.getElementById('t-format').value;
    let tempMatches = [];
    if (format === 'league') {
      tempMatches = Utils.generateRoundRobin(this.drawTeams);
    } else if (format === 'knockout') {
      tempMatches = Utils.generateKnockout(this.drawTeams);
    } else {
      tempMatches = Utils.generateGroupsAndPlayoffs(this.drawTeams, format);
    }
    
    const startTime = document.getElementById('t-start-time').value || '09:00';
    const interval = parseInt(document.getElementById('t-interval').value) || 20;
    const pitches = parseInt(document.getElementById('t-pitches').value) || 1;
    const duration = parseInt(document.getElementById('t-match-duration').value) || 15;
    
    tempMatches = Utils.calculateScheduleTimes(tempMatches, startTime, interval, pitches, this.wizardBreaks, duration);
    
    const timelineContainer = document.getElementById('draw-schedule-timeline');
    timelineContainer.innerHTML = '';
    
    tempMatches.forEach((match, idx) => {
      // Skontrolujeme a vykreslíme prestávku PRED týmto zápasom (ak existuje)
      const activeBreak = this.wizardBreaks.find(b => parseInt(b.afterMatchIndex) === idx);
      if (activeBreak) {
        timelineContainer.innerHTML += `
          <div class="timeline-break-card" style="margin: 8px 0;">
            <span>☕ <strong>${activeBreak.name}</strong> (${activeBreak.duration} min)</span>
            <button type="button" class="btn-delete-break" onclick="app.deleteBreak(${idx})">&times;</button>
          </div>
        `;
      } else {
        // Tlačidlo pre pridanie prestávky
        timelineContainer.innerHTML += `
          <button type="button" class="btn-add-break-trigger" onclick="app.openBreakModal(${idx})" style="margin: 4px 0; width: 100%;">
            + Pridať prestávku / udalosť pred zápasom ${idx + 1}
          </button>
        `;
      }
      
      const team1Name = match.team1 ? match.team1.name : 'Čaká sa na súperov';
      const team1Emoji = match.team1 ? match.team1.emoji : '❓';
      const team2Name = match.team2 ? match.team2.name : 'Čaká sa na súperov';
      const team2Emoji = match.team2 ? match.team2.emoji : '❓';
      
      let roundLabel = '';
      if (match.stage === 'group') {
        roundLabel = `Skupina ${match.group} - Kolo ${match.round}`;
      } else if (match.stage === 'playoff') {
        roundLabel = `Play-off - ${match.roundName}`;
      } else if (match.roundName) {
        roundLabel = match.roundName;
      } else if (match.round) {
        roundLabel = `${match.round}. Kolo`;
      }
      
      const timePitch = match.time ? `🕐 ${match.time} | 🏟️ ${match.pitch || 'Ihrisko 1'}` : '';
      
      timelineContainer.innerHTML += `
        <div class="timeline-match-row" style="margin: 4px 0;">
          <div class="tm-time-pitch">${timePitch}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); flex: 1; text-align: left; padding-left: 10px;">${roundLabel}</div>
          <div class="tm-teams">
            <span>${team1Emoji} ${team1Name}</span>
            <span style="color: var(--text-muted); margin: 0 4px;">vs</span>
            <span>${team2Name} ${team2Emoji}</span>
          </div>
        </div>
      `;
    });
    
    // Na konci harmonogramu (po poslednom zápase) môžeme pridať možnosť prestávky (napr. Vyhodnotenie)
    const lastIdx = tempMatches.length;
    const lastBreak = this.wizardBreaks.find(b => parseInt(b.afterMatchIndex) === lastIdx);
    if (lastBreak) {
      timelineContainer.innerHTML += `
        <div class="timeline-break-card" style="margin: 8px 0;">
          <span>🏆 <strong>${lastBreak.name}</strong> (${lastBreak.duration} min)</span>
          <button type="button" class="btn-delete-break" onclick="app.deleteBreak(${lastIdx})">&times;</button>
        </div>
      `;
    } else {
      timelineContainer.innerHTML += `
        <button type="button" class="btn-add-break-trigger" onclick="app.openBreakModal(${lastIdx})" style="margin: 4px 0; width: 100%;">
          + Pridať prestávku / vyhodnotenie na záver turnaja
        </button>
      `;
    }
  },

  openBreakModal: function(afterMatchIndex) {
    this.isEditingBreakForAdmin = false;
    document.getElementById('break-after-match-idx').value = afterMatchIndex;
    document.getElementById('break-name').value = '';
    document.getElementById('break-duration').value = '30';
    document.getElementById('break-form-modal').classList.add('active');
  },

  closeBreakModal: function() {
    document.getElementById('break-form-modal').classList.remove('active');
  },

  saveBreak: function() {
    const afterMatchIndex = parseInt(document.getElementById('break-after-match-idx').value);
    const name = document.getElementById('break-name').value.trim();
    const duration = parseInt(document.getElementById('break-duration').value) || 30;
    
    if (!name) {
      this.showToast('Zadajte názov prestávky!', 'warning');
      return;
    }
    
    if (this.isEditingBreakForAdmin) {
      this.adminEditBreaks = this.adminEditBreaks.filter(b => b.afterMatchIndex !== afterMatchIndex);
      this.adminEditBreaks.push({
        afterMatchIndex: afterMatchIndex,
        name: name,
        duration: duration
      });
      this.adminEditBreaks.sort((a, b) => a.afterMatchIndex - b.afterMatchIndex);
      this.closeBreakModal();
      this.updateAdminDrawWorkspace();
    } else {
      this.wizardBreaks = this.wizardBreaks.filter(b => b.afterMatchIndex !== afterMatchIndex);
      this.wizardBreaks.push({
        afterMatchIndex: afterMatchIndex,
        name: name,
        duration: duration
      });
      this.wizardBreaks.sort((a, b) => a.afterMatchIndex - b.afterMatchIndex);
      this.closeBreakModal();
      this.updateDrawWorkspace();
    }
  },

  deleteBreak: function(afterMatchIndex) {
    this.wizardBreaks = this.wizardBreaks.filter(b => b.afterMatchIndex !== afterMatchIndex);
    this.updateDrawWorkspace();
  },

  shuffleDrawTeams: function() {
    // Zamiešame drawTeams
    for (let i = this.drawTeams.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = this.drawTeams[i];
      this.drawTeams[i] = this.drawTeams[j];
      this.drawTeams[j] = temp;
    }
    this.updateDrawWorkspace();
    this.showToast('Tímy boli úspešne náhodne rozlosované!', 'success');
  },

  submitTournament: async function() {
    // Načítanie ostatných dát z kroku 1
    const name = document.getElementById('t-name').value.trim();
    const format = document.getElementById('t-format').value;
    const location = document.getElementById('t-location').value.trim();
    const date = document.getElementById('t-date').value;
    const duration = document.getElementById('t-match-duration').value;
    const emoji = document.getElementById('t-emoji').value;
    const description = document.getElementById('t-description').value.trim();
    const startTime = document.getElementById('t-start-time').value || '09:00';
    const interval = parseInt(document.getElementById('t-interval').value) || 20;
    const pitches = parseInt(document.getElementById('t-pitches').value) || 1;
    const category = document.getElementById('t-category') ? document.getElementById('t-category').value.trim() : 'U15';
    const lookingForTeams = document.getElementById('t-looking-for-teams') ? document.getElementById('t-looking-for-teams').checked : false;

    const btnSubmit = document.getElementById('btn-draw-launch');
    btnSubmit.disabled = true;
    btnSubmit.innerText = 'Vytváram turnaj...';

    // Generovanie zápasov pre uložený turnaj na základe usporiadania v drawTeams
    let finalMatches = [];
    if (format === 'league') {
      finalMatches = Utils.generateRoundRobin(this.drawTeams);
    } else if (format === 'knockout') {
      finalMatches = Utils.generateKnockout(this.drawTeams);
    } else {
      finalMatches = Utils.generateGroupsAndPlayoffs(this.drawTeams, format);
    }

    // Prepočítanie harmonogramu
    finalMatches = Utils.calculateScheduleTimes(finalMatches, startTime, interval, pitches, this.wizardBreaks, parseInt(duration) || 15);

    try {
      const created = await Api.createTournament({
        name, format, location, date, duration, emoji, description,
        category, lookingForTeams,
        teams: this.drawTeams,
        matches: finalMatches,
        breaks: this.wizardBreaks,
        startTime,
        interval,
        pitches
      });

      // Zobrazenie kroku 4
      document.getElementById('wizard-step-draw').classList.add('hidden');
      document.getElementById('wizard-step-4').classList.remove('hidden');

      document.getElementById('step-ind-3').className = 'step-indicator';
      document.getElementById('step-ind-4').className = 'step-indicator active';

      // Zobrazenie admin tokenu
      document.getElementById('admin-token-display').innerText = created.adminToken;
      
      // Nastavenie tlačidla pre prechod
      document.getElementById('btn-go-to-tournament').onclick = () => {
        this.navigateTo(`tournament/${created.id}`);
      };

      this.showToast('Turnaj bol úspešne vytvorený!', 'success');
    } catch (e) {
      this.showToast('Chyba pri vytváraní turnaja. Skúste znova.', 'error');
      btnSubmit.disabled = false;
      btnSubmit.innerText = 'Zahájiť turnaj!';
    }
  },

  // ==========================================
  // POHĽAD: DETAIL TURNAJA
  // ==========================================
  
  isOrganizerForActive: false,
  currentAdminToken: null,
  activeTournament: null,

  loadTournamentScreen: async function(id) {
    // Načítanie detailov turnaja
    const tournament = await Api.getTournament(id);
    if (!tournament) {
      this.showToast('Turnaj nebol nájdený!', 'error');
      this.navigateTo('home');
      return;
    }

    this.activeTournament = tournament;
    this.isOrganizerForActive = false; // Vždy začíname ako divák
    this.currentAdminToken = null;
    
    // Predvolený filter na kolá
    this.activeRoundFilter = 'all';

    this.renderTournamentUI();
  },

  /**
   * Pravidelný refresh na pozadí pre live prenos divákom
   */
  refreshTournamentData: async function(id) {
    if (document.getElementById('tournament-view').classList.contains('hidden')) {
      this.clearPolling();
      return;
    }

    const tournament = await Api.getTournament(id);
    if (tournament) {
      this.activeTournament = tournament;
      // Udržiavame aktuálny stav prihlásenia admina na pozadí
      this.renderTournamentUI(true); // pre-render stats and tables dynamically
    }
  },

  checkAdminPrivileges: function(tournament) {
    // Táto funkcia už nie je potrebná pre autologin pri vstupe, ponecháme len false
    return false;
  },

  renderTournamentUI: function(isSilentUpdate = false) {
    const t = this.activeTournament;
    const isOrganizer = this.isOrganizerForActive;

    // Statické informácie (nepotrebujeme prekresľovať každých 5 sekúnd, ak nie je zmena)
    if (!isSilentUpdate) {
      document.getElementById('td-emoji').innerText = t.emoji || '🏆';
      document.getElementById('td-title').innerText = t.name;
      document.getElementById('td-desc').innerText = t.description || 'Žiadne podrobnosti o turnaji.';
      document.getElementById('td-date').innerText = Utils.formatDate(t.date);
      document.getElementById('td-location').innerText = t.location;
      document.getElementById('td-duration').innerText = `${t.duration} min / zápas`;
      
      const categoryEl = document.getElementById('td-category');
      if (categoryEl) {
        categoryEl.innerText = t.category || 'U15';
      }

      const lookingBanner = document.getElementById('td-looking-teams-banner');
      if (lookingBanner) {
        if (t.lookingForTeams) {
          lookingBanner.classList.remove('hidden');
        } else {
          lookingBanner.classList.add('hidden');
        }
      }

      const formatBadge = document.getElementById('td-format-badge');
      
      let formatLabel = 'Liga';
      if (t.format === 'knockout') formatLabel = 'Vyraďovačka';
      else if (t.format === 'groups_2_top2') formatLabel = '2 Skupiny -> SF';
      else if (t.format === 'groups_2_all') formatLabel = '2 Skupiny -> Všetci';
      else if (t.format === 'groups_4_top2') formatLabel = '4 Skupiny -> ŠF';
      
      formatBadge.innerText = formatLabel;
      
      // Nastavenie záložiek podľa typu turnaja
      const tabStandings = document.getElementById('tab-btn-standings');
      const tabBracket = document.getElementById('tab-btn-bracket');
      const isGroupFormat = ['groups_2_top2', 'groups_2_all', 'groups_4_top2'].includes(t.format);

      if (t.format === 'league') {
        tabStandings.style.display = 'block';
        tabStandings.innerText = 'Tabuľka ligy';
        tabBracket.style.display = 'none';
        this.switchTab('matches'); // predvolený tab zápasy
      } else if (t.format === 'knockout') {
        tabStandings.style.display = 'none';
        tabBracket.style.display = 'block';
        tabBracket.innerText = 'Vyraďovací pavúk';
        this.switchTab('bracket'); // predvolený tab pavúk pre vyraďovačku
      } else if (isGroupFormat) {
        tabStandings.style.display = 'block';
        tabStandings.innerText = 'Tabuľky skupín';
        tabBracket.style.display = 'block';
        tabBracket.innerText = 'Vyraďovací pavúk';
        this.switchTab('matches'); // predvolene zápasy pre skupiny
      }
    }

    // Tlačidlo vymazania turnaja a editácie (iba ak sme admin)
    const btnDelete = document.getElementById('btn-delete-tournament');
    const btnEditDetails = document.getElementById('btn-edit-tournament-details');
    if (isOrganizer) {
      if (btnDelete) btnDelete.classList.remove('hidden');
      if (btnEditDetails) btnEditDetails.classList.remove('hidden');
    } else {
      if (btnDelete) btnDelete.classList.add('hidden');
      if (btnEditDetails) btnEditDetails.classList.add('hidden');
    }

    // ADMINISTRÁTORSKÝ PANEL / BADGE
    const adminBadgeContainer = document.getElementById('admin-badge-container');
    if (isOrganizer) {
      adminBadgeContainer.innerHTML = `
        <span class="admin-badge">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
          Ste administrátor
        </span>
      `;
    } else {
      adminBadgeContainer.innerHTML = `
        <button class="btn btn-sm btn-secondary" onclick="app.openAdminModal()">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          Spravovať turnaj
        </button>
      `;
    }

    // RYCHLE ŠTATISTIKY
    const totalMatches = t.matches.length;
    const finishedMatches = t.matches.filter(m => m.status === 'finished').length;
    const liveMatches = t.matches.filter(m => m.status === 'live').length;
    
    // Spočítame góly
    let totalGoals = 0;
    t.matches.forEach(m => {
      if (m.score1 !== null) totalGoals += m.score1;
      if (m.score2 !== null) totalGoals += m.score2;
    });

    document.getElementById('stat-teams-count').innerText = t.teams.length;
    document.getElementById('stat-matches-count').innerText = `${finishedMatches}/${totalMatches}`;
    document.getElementById('stat-goals-count').innerText = totalGoals;
    
    const statusText = document.getElementById('stat-status');
    if (liveMatches > 0) {
      statusText.innerHTML = '<span class="text-danger font-bold">🔴 NAŽIVO</span>';
    } else if (finishedMatches === totalMatches && totalMatches > 0) {
      statusText.innerText = 'Ukončený';
    } else if (finishedMatches > 0) {
      statusText.innerText = 'Prebieha';
    } else {
      statusText.innerText = 'Plánovaný';
    }

    // ZÁLOŽKA: ZÁPASY - Vykreslenie a filter kôl
    this.renderRoundsSelector();
    this.renderMatchesList();

    // ZÁLOŽKA: TABUĽKA LIGY / TABUĽKY SKUPÍN
    const tabStandingsContent = document.getElementById('tab-standings');
    const isGroupFormat = ['groups_2_top2', 'groups_2_all', 'groups_4_top2'].includes(t.format);

    if (t.format === 'league') {
      tabStandingsContent.innerHTML = `
        <h3 class="tab-title">Priebežná ligová tabuľka</h3>
        <div class="table-responsive">
          <table class="standings-table">
            <thead>
              <tr>
                <th style="width: 50px;">#</th>
                <th>Tím</th>
                <th class="txt-center">Z</th>
                <th class="txt-center text-success">V</th>
                <th class="txt-center text-warning">R</th>
                <th class="txt-center text-danger">P</th>
                <th class="txt-center">Skóre</th>
                <th class="txt-center">Rozdiel</th>
                <th class="txt-center font-bold">Body</th>
              </tr>
            </thead>
            <tbody id="standings-table-body">
              ${Components.renderStandingsTable(t)}
            </tbody>
          </table>
        </div>
      `;
    } else if (isGroupFormat) {
      tabStandingsContent.innerHTML = Components.renderGroupStandings(t);
    }

    // ZÁLOŽKA: VYRAĎOVACÍ PAVÚK (iba pre Knockout a skupinové play-off)
    if (t.format === 'knockout' || isGroupFormat) {
      document.getElementById('bracket-root').innerHTML = Components.renderBracket(t, isOrganizer);
    }

    // ZÁLOŽKA: STRELCI
    const tabScorersContent = document.getElementById('tab-scorers');
    if (tabScorersContent) {
      const scorers = this.calculateTournamentScorers(t);
      tabScorersContent.innerHTML = Components.renderScorersTable(scorers);
    }
  },

  /**
   * Prepínanie záložiek
   */
  switchTab: function(tabName) {
    // Odznačíme aktívne tlačidlá a obsah
    document.querySelectorAll('.tab-btn').forEach(btn => {
      if (btn.getAttribute('data-tab') === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    document.querySelectorAll('.tab-content').forEach(content => {
      if (content.id === `tab-${tabName}`) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });
  },

  /**
   * Výpočet a agregácia strelcov pre tabuľku strelcov
   */
  calculateTournamentScorers: function(tournament) {
    const scorersMap = {};
    tournament.matches.forEach(m => {
      const t1Scorers = (m.scorers && m.scorers.team1) || [];
      t1Scorers.forEach(s => {
        const playerName = s.name.trim();
        if (!playerName) return;
        const teamId = m.team1 ? m.team1.id : 'unknown';
        const teamName = m.team1 ? m.team1.name : 'Neznámy tím';
        const teamEmoji = m.team1 ? m.team1.emoji : '⚽';
        
        const key = playerName + "||" + teamId;
        if (!scorersMap[key]) {
          scorersMap[key] = {
            name: playerName,
            teamName: teamName,
            teamEmoji: teamEmoji,
            goals: 0
          };
        }
        scorersMap[key].goals += 1;
      });

      const t2Scorers = (m.scorers && m.scorers.team2) || [];
      t2Scorers.forEach(s => {
        const playerName = s.name.trim();
        if (!playerName) return;
        const teamId = m.team2 ? m.team2.id : 'unknown';
        const teamName = m.team2 ? m.team2.name : 'Neznámy tím';
        const teamEmoji = m.team2 ? m.team2.emoji : '⚽';
        
        const key = playerName + "||" + teamId;
        if (!scorersMap[key]) {
          scorersMap[key] = {
            name: playerName,
            teamName: teamName,
            teamEmoji: teamEmoji,
            goals: 0
          };
        }
        scorersMap[key].goals += 1;
      });
    });

    const scorersList = Object.values(scorersMap);
    scorersList.sort((a, b) => b.goals - a.goals);
    return scorersList;
  },

  /**
   * Admin: Otvorenie modálu pre úpravu turnaja a prelosovanie
   */
  openAdminEditModal: function() {
    const t = this.activeTournament;
    if (!t) return;

    // Detaily turnaja
    document.getElementById('ae-name').value = t.name || '';
    document.getElementById('ae-location').value = t.location || '';
    document.getElementById('ae-date').value = t.date || '';
    document.getElementById('ae-category').value = t.category || 'U15';
    document.getElementById('ae-match-duration').value = t.duration || 15;
    document.getElementById('ae-looking-for-teams').checked = !!t.lookingForTeams;
    document.getElementById('ae-start-time').value = t.startTime || '09:00';
    document.getElementById('ae-interval').value = t.interval || 20;
    document.getElementById('ae-pitches').value = t.pitches || 1;
    document.getElementById('ae-description').value = t.description || '';

    // Inicializujeme kopie tímov a prestávok
    this.adminEditTeams = JSON.parse(JSON.stringify(t.teams || []));
    this.adminEditBreaks = JSON.parse(JSON.stringify(t.breaks || []));
    
    // Zobrazenie tímov a prelosovania
    this.updateAdminTeamsListUI();
    this.updateAdminDrawWorkspace();

    // Zobrazenie modálu
    document.getElementById('admin-edit-tournament-modal').classList.add('active');
  },

  /**
   * Admin: Zatvorenie modálu pre úpravu turnaja
   */
  closeAdminEditModal: function() {
    document.getElementById('admin-edit-tournament-modal').classList.remove('active');
  },

  /**
   * Admin: Pridanie nového tímu
   */
  addAdminTeam: function() {
    const nameInput = document.getElementById('ae-team-name-input');
    const emojiSelect = document.getElementById('ae-team-emoji-select');
    const name = nameInput.value.trim();
    const emoji = emojiSelect.value;

    if (!name) {
      this.showToast('Zadajte názov tímu!', 'warning');
      return;
    }

    if (this.adminEditTeams.some(t => t.name.toLowerCase() === name.toLowerCase())) {
      this.showToast('Tím s takýmto názvom už existuje!', 'warning');
      return;
    }

    this.adminEditTeams.push({
      id: 'team_' + Utils.generateId(),
      name: name,
      emoji: emoji
    });

    nameInput.value = '';
    
    // Vyberieme náhodné emoji
    const options = emojiSelect.options;
    const randomIdx = Math.floor(Math.random() * options.length);
    emojiSelect.selectedIndex = randomIdx;

    this.updateAdminTeamsListUI();
    this.updateAdminDrawWorkspace();
  },

  /**
   * Admin: Odstránenie tímu zo zoznamu
   */
  removeAdminTeam: function(teamId) {
    this.adminEditTeams = this.adminEditTeams.filter(t => t.id !== teamId);
    this.updateAdminTeamsListUI();
    this.updateAdminDrawWorkspace();
  },

  /**
   * Admin: Aktualizácia zoznamu tímov v HTML
   */
  updateAdminTeamsListUI: function() {
    const list = document.getElementById('ae-teams-list');
    const count = document.getElementById('ae-team-count');
    if (!list || !count) return;

    count.innerText = this.adminEditTeams.length;
    list.innerHTML = '';

    if (this.adminEditTeams.length === 0) {
      list.innerHTML = '<div class="no-teams-placeholder">Zatiaľ neboli pridané žiadne tímy.</div>';
      return;
    }

    this.adminEditTeams.forEach(team => {
      list.innerHTML += `
        <div class="team-item">
          <div class="team-item-info">
            <span class="team-item-emoji">${team.emoji}</span>
            <span class="team-item-name" title="${team.name}">${team.name}</span>
          </div>
          <button type="button" class="btn-remove-team" onclick="app.removeAdminTeam('${team.id}')">&times;</button>
        </div>
      `;
    });
  },

  /**
   * Admin: Aktualizácia prostredia pre prelosovanie a drag-and-drop
   */
  updateAdminDrawWorkspace: function() {
    const format = this.activeTournament ? this.activeTournament.format : 'league';
    const groupsContainer = document.getElementById('ae-draw-groups-container');
    if (!groupsContainer) return;
    groupsContainer.innerHTML = '';
    
    const groups = {};
    if (format === 'league') {
      groups['Ligová skupina'] = this.adminEditTeams.map((t, idx) => ({ team: t, index: idx }));
    } else if (format === 'knockout') {
      groups['Nasadené tímy'] = this.adminEditTeams.map((t, idx) => ({ team: t, index: idx }));
    } else {
      let numGroups = 2;
      if (format === 'groups_4_top2') numGroups = 4;
      const groupNames = ['Skupina A', 'Skupina B', 'Skupina C', 'Skupina D'].slice(0, numGroups);
      groupNames.forEach(name => groups[name] = []);
      this.adminEditTeams.forEach((team, idx) => {
        const groupName = groupNames[idx % numGroups];
        groups[groupName].push({ team: team, index: idx });
      });
    }

    Object.keys(groups).forEach(groupName => {
      const items = groups[groupName];
      let itemsHtml = '';
      items.forEach(item => {
        itemsHtml += `
          <div class="draggable-team admin-draggable-team" draggable="true" data-index="${item.index}">
            <span class="team-item-emoji">${item.team.emoji}</span>
            <span class="team-item-name" title="${item.team.name}">${item.team.name}</span>
          </div>
        `;
      });
      
      groupsContainer.innerHTML += `
        <div class="draw-group-box">
          <h5>${groupName}</h5>
          <div class="draw-teams-dropzone admin-dropzone" data-group="${groupName}">
            ${itemsHtml}
          </div>
        </div>
      `;
    });
    
    this.setupAdminDragAndDropEvents();
    this.renderAdminSchedule();
  },

  /**
   * Admin: Nastavenie drag & drop pre admin rozhranie
   */
  setupAdminDragAndDropEvents: function() {
    document.querySelectorAll('.admin-draggable-team').forEach(el => {
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', el.getAttribute('data-index'));
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
      });
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        const sourceIdx = parseInt(e.dataTransfer.getData('text/plain'));
        const targetIdx = parseInt(el.getAttribute('data-index'));
        if (sourceIdx !== targetIdx && !isNaN(sourceIdx) && !isNaN(targetIdx)) {
          const temp = this.adminEditTeams[sourceIdx];
          this.adminEditTeams[sourceIdx] = this.adminEditTeams[targetIdx];
          this.adminEditTeams[targetIdx] = temp;
          this.updateAdminDrawWorkspace();
        }
      });
    });
  },

  /**
   * Admin: Vykreslenie a harmonogram prelosovania v admin modále
   */
  renderAdminSchedule: function() {
    const format = this.activeTournament ? this.activeTournament.format : 'league';
    let tempMatches = [];
    if (format === 'league') {
      tempMatches = Utils.generateRoundRobin(this.adminEditTeams);
    } else if (format === 'knockout') {
      tempMatches = Utils.generateKnockout(this.adminEditTeams);
    } else {
      tempMatches = Utils.generateGroupsAndPlayoffs(this.adminEditTeams, format);
    }
    
    // Načítame aktuálne vstupy z modálu
    const startTime = document.getElementById('ae-start-time').value || '09:00';
    const interval = parseInt(document.getElementById('ae-interval').value) || 20;
    const pitches = parseInt(document.getElementById('ae-pitches').value) || 1;
    const duration = parseInt(document.getElementById('ae-match-duration').value) || 15;
    
    tempMatches = Utils.calculateScheduleTimes(tempMatches, startTime, interval, pitches, this.adminEditBreaks, duration);
    
    const timelineContainer = document.getElementById('ae-draw-schedule-timeline');
    if (!timelineContainer) return;
    timelineContainer.innerHTML = '';
    
    tempMatches.forEach((match, idx) => {
      // Skontrolujeme a vykreslíme prestávku PRED týmto zápasom
      const activeBreak = this.adminEditBreaks.find(b => parseInt(b.afterMatchIndex) === idx);
      if (activeBreak) {
        timelineContainer.innerHTML += `
          <div class="timeline-break-card" style="margin: 8px 0;">
            <span>☕ <strong>${activeBreak.name}</strong> (${activeBreak.duration} min)</span>
            <button type="button" class="btn-delete-break" onclick="app.deleteAdminBreak(${idx})">&times;</button>
          </div>
        `;
      } else {
        timelineContainer.innerHTML += `
          <button type="button" class="btn-add-break-trigger" onclick="app.openAdminBreakModal(${idx})" style="margin: 4px 0; width: 100%;">
            + Pridať prestávku / udalosť pred zápasom ${idx + 1}
          </button>
        `;
      }
      
      const team1Name = match.team1 ? match.team1.name : 'Čaká sa na súperov';
      const team1Emoji = match.team1 ? match.team1.emoji : '❓';
      const team2Name = match.team2 ? match.team2.name : 'Čaká sa na súperov';
      const team2Emoji = match.team2 ? match.team2.emoji : '❓';
      
      let roundLabel = '';
      if (match.stage === 'group') {
        roundLabel = `Skupina ${match.group} - Kolo ${match.round}`;
      } else if (match.stage === 'playoff') {
        roundLabel = `Play-off - ${match.roundName}`;
      } else if (match.roundName) {
        roundLabel = match.roundName;
      } else if (match.round) {
        roundLabel = `${match.round}. Kolo`;
      }
      
      const timePitch = match.time ? `🕐 ${match.time} | 🏟️ ${match.pitch || 'Ihrisko 1'}` : '';
      
      timelineContainer.innerHTML += `
        <div class="timeline-match-row" style="margin: 4px 0;">
          <div class="tm-time-pitch">${timePitch}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); flex: 1; text-align: left; padding-left: 10px;">${roundLabel}</div>
          <div class="tm-teams">
            <span>${team1Emoji} ${team1Name}</span>
            <span style="color: var(--text-muted); margin: 0 4px;">vs</span>
            <span>${team2Name} ${team2Emoji}</span>
          </div>
        </div>
      `;
    });
    
    const lastIdx = tempMatches.length;
    const lastBreak = this.adminEditBreaks.find(b => parseInt(b.afterMatchIndex) === lastIdx);
    if (lastBreak) {
      timelineContainer.innerHTML += `
        <div class="timeline-break-card" style="margin: 8px 0;">
          <span>🏆 <strong>${lastBreak.name}</strong> (${lastBreak.duration} min)</span>
          <button type="button" class="btn-delete-break" onclick="app.deleteAdminBreak(${lastIdx})">&times;</button>
        </div>
      `;
    } else {
      timelineContainer.innerHTML += `
        <button type="button" class="btn-add-break-trigger" onclick="app.openAdminBreakModal(${lastIdx})" style="margin: 4px 0; width: 100%;">
          + Pridať prestávku / vyhodnotenie na záver turnaja
        </button>
      `;
    }
  },

  /**
   * Admin: Otvorenie formulára prestávky v admin modále
   */
  openAdminBreakModal: function(afterMatchIndex) {
    this.isEditingBreakForAdmin = true;
    document.getElementById('break-after-match-idx').value = afterMatchIndex;
    document.getElementById('break-name').value = '';
    document.getElementById('break-duration').value = '30';
    document.getElementById('break-form-modal').classList.add('active');
  },

  /**
   * Admin: Odstránenie prestávky z harmonogramu
   */
  deleteAdminBreak: function(afterMatchIndex) {
    this.adminEditBreaks = this.adminEditBreaks.filter(b => b.afterMatchIndex !== afterMatchIndex);
    this.updateAdminDrawWorkspace();
  },

  /**
   * Admin: Náhodné prelosovanie tímov v admin modále
   */
  shuffleAdminDrawTeams: function() {
    for (let i = this.adminEditTeams.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = this.adminEditTeams[i];
      this.adminEditTeams[i] = this.adminEditTeams[j];
      this.adminEditTeams[j] = temp;
    }
    this.updateAdminDrawWorkspace();
    this.showToast('Tímy boli úspešne náhodne prelosované!', 'success');
  },

  /**
   * Admin: Uloženie všetkých zmien a nového rozpisu na API
   */
  saveAdminTournamentEdit: async function() {
    const t = this.activeTournament;
    if (!t) return;

    const name = document.getElementById('ae-name').value.trim();
    const location = document.getElementById('ae-location').value.trim();
    const date = document.getElementById('ae-date').value;
    const category = document.getElementById('ae-category').value.trim();
    const duration = parseInt(document.getElementById('ae-match-duration').value) || 15;
    const lookingForTeams = document.getElementById('ae-looking-for-teams').checked;
    const startTime = document.getElementById('ae-start-time').value || '09:00';
    const interval = parseInt(document.getElementById('ae-interval').value) || 20;
    const pitches = parseInt(document.getElementById('ae-pitches').value) || 1;
    const description = document.getElementById('ae-description').value.trim();

    if (!name || !location || !date) {
      this.showToast('Vyplňte prosím všetky povinné polia (*)', 'warning');
      return;
    }

    let n = this.adminEditTeams.length;
    const format = t.format;

    if (lookingForTeams) {
      this.adminEditTeams = this.fillPlaceholderTeams(this.adminEditTeams, format);
      n = this.adminEditTeams.length;
      this.updateAdminTeamsListUI();
      this.updateAdminDrawWorkspace();
    } else {
      const hasPlaceholders = this.adminEditTeams.some(t => t.name.startsWith('Voľné miesto') || t.isPlaceholder);
      if (hasPlaceholders) {
        this.showToast('Pred zatvorením prihlášok (zrušením Hľadáme tímy) musíte nahradiť alebo odstrániť všetky voľné miesta!', 'warning');
        return;
      }
    }

    // Validácia
    if (format === 'league') {
      if (n < 3) {
        this.showToast('Ligový turnaj vyžaduje minimálne 3 tímy!', 'warning');
        return;
      }
    } else if (format === 'knockout') {
      if (n !== 4 && n !== 8 && n !== 16) {
        this.showToast('Vyraďovací turnaj (pavúk) vyžaduje presne 4, 8 alebo 16 tímov!', 'warning');
        return;
      }
    } else if (format === 'groups_2_top2') {
      if (n < 6 || n % 2 !== 0) {
        this.showToast('Tento formát vyžaduje párny počet tímov (minimálne 6)!', 'warning');
        return;
      }
    } else if (format === 'groups_2_all') {
      if (n !== 8) {
        this.showToast('Tento formát vyžaduje presne 8 tímov (4 v každej skupine)!', 'warning');
        return;
      }
    } else if (format === 'groups_4_top2') {
      if (n < 8 || n % 4 !== 0) {
        this.showToast('Tento formát vyžaduje počet tímov deliteľný 4 (minimálne 8 tímov)!', 'warning');
        return;
      }
    }

    const btnSubmit = document.getElementById('btn-save-admin-edit');
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerText = 'Ukladám zmeny...';
    }

    // Generujeme nový rozpis zápasov
    let finalMatches = [];
    if (format === 'league') {
      finalMatches = Utils.generateRoundRobin(this.adminEditTeams);
    } else if (format === 'knockout') {
      finalMatches = Utils.generateKnockout(this.adminEditTeams);
    } else {
      finalMatches = Utils.generateGroupsAndPlayoffs(this.adminEditTeams, format);
    }

    // Prepočet časov rozpisu
    finalMatches = Utils.calculateScheduleTimes(finalMatches, startTime, interval, pitches, this.adminEditBreaks, duration);

    try {
      const updated = await Api.updateTournamentDetails(this.activeTournamentId, {
        name,
        location,
        date,
        duration,
        category,
        lookingForTeams,
        startTime,
        interval,
        pitches,
        description,
        teams: this.adminEditTeams,
        matches: finalMatches,
        breaks: this.adminEditBreaks
      }, this.currentAdminToken);

      this.activeTournament = updated;
      this.closeAdminEditModal();
      this.renderTournamentUI(false);
      this.showToast('Turnaj bol úspešne aktualizovaný a prelosovaný!', 'success');
    } catch (e) {
      this.showToast('Chyba pri aktualizácii turnaja: ' + e.message, 'error');
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerText = 'Uložiť a prelosovať turnaj!';
      }
    }
  },

  /**
   * Vygeneruje prepínač kôl (Round selector)
   */
  renderRoundsSelector: function() {
    const t = this.activeTournament;
    const container = document.getElementById('round-selector-container');
    
    // Zistíme zoznam všetkých kol/rounds
    const rounds = [...new Set(t.matches.map(m => m.round || m.roundName))];
    
    // Ak je to vyraďovačka a round je string alebo index, zoradíme ich.
    // Pre ligu sú to čísla 1, 2, 3...
    rounds.sort((a, b) => {
      if (typeof a === 'number' && typeof b === 'number') return a - b;
      return String(a).localeCompare(String(b));
    });

    if (rounds.length <= 1) {
      container.innerHTML = '';
      return;
    }

    let html = `<button class="round-btn ${this.activeRoundFilter === 'all' ? 'active' : ''}" onclick="app.setRoundFilter('all')">Všetky kolá</button>`;
    
    rounds.forEach(r => {
      const isAct = String(this.activeRoundFilter) === String(r);
      const label = typeof r === 'number' ? `${r}. Kolo` : r;
      html += `<button class="round-btn ${isAct ? 'active' : ''}" onclick="app.setRoundFilter('${r}')">${label}</button>`;
    });

    container.innerHTML = html;
  },

  setRoundFilter: function(round) {
    this.activeRoundFilter = round;
    this.renderMatchesList();
    this.renderRoundsSelector();
  },

  /**
   * Vykreslí zoznam zápasov so zohľadnením filtra kola
   */
  renderMatchesList: function() {
    const t = this.activeTournament;
    const container = document.getElementById('matches-list-container');
    const isOrganizer = this.isOrganizerForActive;

    let filteredMatches = t.matches;
    if (this.activeRoundFilter !== 'all') {
      filteredMatches = t.matches.filter(m => String(m.round || m.roundName) === String(this.activeRoundFilter));
    }

    container.innerHTML = '';
    
    if (filteredMatches.length === 0) {
      container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">Žiadne zápasy v tomto kole.</div>';
      return;
    }

    // Ak zobrazujeme všetky kolá a turnaj má prestávky, môžeme ich vykresliť inline
    const showBreaks = this.activeRoundFilter === 'all' && t.breaks && t.breaks.length > 0;

    filteredMatches.forEach((match, idx) => {
      if (showBreaks) {
        const activeBreak = t.breaks.find(b => parseInt(b.afterMatchIndex) === idx);
        if (activeBreak) {
          container.innerHTML += `
            <div class="timeline-break-public">
              <span>☕ ${activeBreak.name} (${activeBreak.duration} min)</span>
            </div>
          `;
        }
      }
      container.innerHTML += Components.renderMatchCard(match, isOrganizer);
    });

    if (showBreaks) {
      const lastIdx = filteredMatches.length;
      const lastBreak = t.breaks.find(b => parseInt(b.afterMatchIndex) === lastIdx);
      if (lastBreak) {
        container.innerHTML += `
          <div class="timeline-break-public">
            <span>☕ ${lastBreak.name} (${lastBreak.duration} min)</span>
          </div>
        `;
      }
    }
  },

  /**
   * Skopíruje odkaz na zdieľanie turnaja
   */
  shareTournamentLink: function() {
    const link = window.location.href;
    navigator.clipboard.writeText(link).then(() => {
      this.showToast('Odkaz na turnaj bol skopírovaný do schránky! Môžete ho poslať divákom.', 'success');
    }).catch(err => {
      this.showToast('Nepodarilo sa skopírovať odkaz automatically.', 'error');
    });
  },

  // ==========================================
  // MODÁL: UPRAVENIE VÝSLEDKU ZÁPASU (ADMIN)
  // ==========================================
  
  openMatchEditModal: function(matchId) {
    const t = this.activeTournament;
    const match = t.matches.find(m => m.id === matchId);
    if (!match) return;

    this.activeMatchToEdit = match;
    
    // Nastavenie hodnôt
    document.getElementById('edit-match-id').value = match.id;
    document.getElementById('edit-match-status').value = match.status;
    
    document.getElementById('edit-team1-name').innerText = match.team1 ? match.team1.name : 'Postupujúci A';
    document.getElementById('edit-team1-emoji').innerText = match.team1 ? match.team1.emoji : '❓';
    document.getElementById('edit-team1-score').value = match.score1 !== null ? match.score1 : 0;
    document.getElementById('scorers-team1-lbl').innerText = match.team1 ? match.team1.name : 'Tím A';

    document.getElementById('edit-team2-name').innerText = match.team2 ? match.team2.name : 'Postupujúci B';
    document.getElementById('edit-team2-emoji').innerText = match.team2 ? match.team2.emoji : '❓';
    document.getElementById('edit-team2-score').value = match.score2 !== null ? match.score2 : 0;
    document.getElementById('scorers-team2-lbl').innerText = match.team2 ? match.team2.name : 'Tím B';

    // Zakážeme skóre a strelcov ak tímy nie sú ešte známe (vyraďovačka)
    const hasBothTeams = match.team1 && match.team2;
    document.getElementById('edit-team1-score').disabled = !hasBothTeams;
    document.getElementById('edit-team2-score').disabled = !hasBothTeams;
    document.getElementById('team1-scorer-name').disabled = !hasBothTeams;
    document.getElementById('team2-scorer-name').disabled = !hasBothTeams;

    // Kopírujeme existujúcich strelcov do dočasného poľa
    this.tempScorers = {
      team1: match.scorers ? [...match.scorers.team1] : [],
      team2: match.scorers ? [...match.scorers.team2] : []
    };

    this.updateModalScorersListUI();

    // Zobrazenie modálu
    document.getElementById('match-edit-modal').classList.add('active');
  },

  closeMatchEditModal: function() {
    document.getElementById('match-edit-modal').classList.remove('active');
    this.activeMatchToEdit = null;
  },

  addScorer: function(teamSide) {
    const nameInput = document.getElementById(`${teamSide}-scorer-name`);
    const minInput = document.getElementById(`${teamSide}-scorer-minute`);
    
    const name = nameInput.value.trim();
    const min = parseInt(minInput.value) || 1;

    if (!name) {
      this.showToast('Zadajte meno strelca!', 'warning');
      return;
    }

    this.tempScorers[teamSide].push({
      id: 'scorer_' + Utils.generateId(),
      name: name,
      min: min
    });

    // Zoradíme strelcov podľa minúty
    this.tempScorers[teamSide].sort((a, b) => a.min - b.min);

    // Vyčistíme vstupy
    nameInput.value = '';
    minInput.value = '';

    this.updateModalScorersListUI();
  },

  removeScorer: function(teamSide, scorerId) {
    this.tempScorers[teamSide] = this.tempScorers[teamSide].filter(s => s.id !== scorerId);
    this.updateModalScorersListUI();
  },

  updateModalScorersListUI: function() {
    ['team1', 'team2'].forEach(side => {
      const list = document.getElementById(`${side}-scorers-list`);
      list.innerHTML = '';
      
      this.tempScorers[side].forEach(s => {
        list.innerHTML += `
          <li class="scorer-item">
            <span>⚽ ${s.name} (${s.min}')</span>
            <button type="button" class="btn-delete-scorer" onclick="app.removeScorer('${side}', '${s.id}')">&times;</button>
          </li>
        `;
      });
    });
  },

  saveMatchEdit: async function() {
    if (!this.activeMatchToEdit) return;

    const matchId = document.getElementById('edit-match-id').value;
    const status = document.getElementById('edit-match-status').value;
    const score1 = document.getElementById('edit-team1-score').value;
    const score2 = document.getElementById('edit-team2-score').value;

    const adminToken = this.currentAdminToken; // Používame token z relácie v pamäti

    const updateData = {
      status: status,
      score1: score1,
      score2: score2,
      scorers: this.tempScorers
    };

    try {
      const updatedTournament = await Api.updateMatchScore(
        this.activeTournamentId,
        matchId,
        updateData,
        adminToken
      );

      this.activeTournament = updatedTournament;
      this.closeMatchEditModal();
      this.renderTournamentUI(true);
      this.showToast('Výsledok zápasu bol úspešne uložený.', 'success');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  // ==========================================
  // MODÁL: PRIHLÁSENIE/ZADANIE KĽÚČA
  // ==========================================
  
  openAdminModal: function() {
    document.getElementById('admin-token-input').value = '';
    document.getElementById('admin-key-modal').classList.add('active');
  },

  closeAdminModal: function() {
    document.getElementById('admin-key-modal').classList.remove('active');
  },

  loginAsAdmin: function() {
    const inputKey = document.getElementById('admin-token-input').value.trim();
    if (!inputKey) {
      this.showToast('Zadajte kľúč turnaja!', 'warning');
      return;
    }

    if (inputKey === this.activeTournament.adminToken) {
      this.currentAdminToken = inputKey; // Kľúč uložený v pamäti pre aktuálnu návštevu
      this.isOrganizerForActive = true;
      this.closeAdminModal();
      this.renderTournamentUI();
      this.showToast('Úspešne prihlásený! Teraz môžete spravovať výsledky zápasov.', 'success');
    } else {
      this.showToast('Zadaný administrátorský kľúč je neplatný.', 'error');
    }
  },

  /**
   * Vymaže aktuálny turnaj po potvrdení
   */
  deleteActiveTournament: async function() {
    if (!this.isOrganizerForActive || !this.currentAdminToken) {
      this.showToast('Nemáte oprávnenie na zmazanie turnaja!', 'error');
      return;
    }

    const confirmed = confirm('Naozaj chcete natrvalo zmazať tento turnaj? Táto akcia sa nedá vrátiť!');
    if (!confirmed) return;

    try {
      await Api.deleteTournament(this.activeTournamentId, this.currentAdminToken);
      this.showToast('Turnaj bol úspešne zmazaný.', 'success');
      this.navigateTo('home');
    } catch (err) {
      this.showToast('Chyba pri mazaní turnaja: ' + err.message, 'error');
    }
  },

  // ==========================================
  // EVENT LISTENERS SETUP
  // ==========================================
  
  setupEventListeners: function() {
    const bindClick = (id, handler) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', handler);
    };
    const bindSubmit = (id, handler) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('submit', handler);
    };
    const bindEvent = (id, eventName, handler) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(eventName, handler);
    };

    // Navigácia a linky
    document.querySelectorAll('.scroll-link').forEach(link => {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        const targetId = this.getAttribute('href').replace('#', '');
        const target = document.getElementById(targetId);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });

    // Filtre na domovskej obrazovke
    bindEvent('search-input', 'input', () => this.applyFilters());
    bindEvent('category-filter', 'input', () => this.applyFilters());
    bindEvent('format-filter', 'change', () => this.applyFilters());

    // Tvorca turnaja - Wizard tlačidlá
    bindClick('btn-next-to-teams', () => this.nextToTeams());
    bindClick('btn-back-to-info', () => this.backToInfo());
    bindClick('btn-add-team', () => this.addTeam());
    
    // Odoslanie tímu po stlačení Enter
    bindEvent('team-name-input', 'keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.addTeam();
      }
    });

    // Krok 3 - Žrebovanie a Harmonogram
    bindClick('btn-next-to-draw', () => this.nextToDraw());
    bindClick('btn-back-to-teams', () => this.backToTeams());
    bindClick('btn-draw-shuffle', () => this.shuffleDrawTeams());
    bindClick('btn-draw-launch', () => this.submitTournament());
    
    // Zatvorenie modálu prestávky
    bindClick('btn-close-break-modal', () => this.closeBreakModal());
    bindClick('btn-cancel-break-modal', () => this.closeBreakModal());
    
    // Odoslanie prestávky
    bindSubmit('break-add-form', (e) => {
      e.preventDefault();
      this.saveBreak();
    });

    // Kopírovanie tokenu v Kroku 4
    bindClick('btn-copy-token', () => {
      const tokenDisplay = document.getElementById('admin-token-display');
      const token = tokenDisplay ? tokenDisplay.innerText : '';
      navigator.clipboard.writeText(token).then(() => {
        this.showToast('Administrátorský kľúč skopírovaný do schránky!', 'success');
      });
    });

    // Detail turnaja - záložky (Tab navigácia)
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tabName = e.currentTarget.getAttribute('data-tab');
        this.switchTab(tabName);
      });
    });

    // Zdieľanie linku na turnaj
    bindClick('btn-share-link', () => this.shareTournamentLink());
    
    // Vymazanie turnaja
    bindClick('btn-delete-tournament', () => this.deleteActiveTournament());

    // Otvorenie modálu admin editácie
    bindClick('btn-edit-tournament-details', () => this.openAdminEditModal());

    // Zatvorenie modálu admin editácie
    bindClick('btn-close-admin-edit-modal', () => this.closeAdminEditModal());
    bindClick('btn-cancel-admin-edit', () => this.closeAdminEditModal());

    // Pridávanie tímu v admin modále
    bindClick('ae-btn-add-team', () => this.addAdminTeam());
    bindEvent('ae-team-name-input', 'keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.addAdminTeam();
      }
    });

    // Zmena parametrov harmonogramu v admin modále
    bindEvent('ae-start-time', 'input', () => this.renderAdminSchedule());
    bindEvent('ae-interval', 'input', () => this.renderAdminSchedule());
    bindEvent('ae-pitches', 'input', () => this.renderAdminSchedule());
    bindEvent('ae-match-duration', 'input', () => this.renderAdminSchedule());

    // Losovanie a odoslanie zmeny v admin modále
    bindClick('ae-btn-draw-shuffle', () => this.shuffleAdminDrawTeams());
    bindSubmit('admin-edit-tournament-form', (e) => {
      e.preventDefault();
      this.saveAdminTournamentEdit();
    });

    // Zatvorenie modálov
    bindClick('btn-close-match-modal', () => this.closeMatchEditModal());
    bindClick('btn-cancel-match-edit', () => this.closeMatchEditModal());
    
    bindClick('btn-close-admin-modal', () => this.closeAdminModal());
    bindClick('btn-cancel-admin-modal', () => this.closeAdminModal());

    // Odoslanie editácie zápasu
    bindSubmit('match-edit-form', (e) => {
      e.preventDefault();
      this.saveMatchEdit();
    });

    // Pridávanie strelcov v modále
    bindClick('btn-add-team1-scorer', () => this.addScorer('team1'));
    bindClick('btn-add-team2-scorer', () => this.addScorer('team2'));

    // Prihlásenie administrátora
    bindSubmit('admin-login-form', (e) => {
      e.preventDefault();
      this.loginAsAdmin();
    });
  }
};

// Spustenie aplikácie po načítaní stránky
window.addEventListener('DOMContentLoaded', () => {
  app.init();
});

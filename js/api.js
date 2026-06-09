/**
 * API klient pre správu turnajov (Online KVdb s LocalStorage fallbackom)
 */
const Api = {
  // Unikátne vedro (bucket) pre tohto používateľa, odvodené z prostredia
  BUCKET_URL: 'https://kvdb.io/kqTZd1BSAvBNEeHNBmAvK/data',
  LOCAL_KEY: 'futbal_tournaments_local',
  isOnlineMode: true,

  /**
   * Zistí stav pripojenia a otestuje KVdb
   */
  checkConnection: async function() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 sekundy timeout
      
      const response = await fetch(this.BUCKET_URL, { 
        method: 'GET',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      this.isOnlineMode = true;
      return true;
    } catch (e) {
      console.warn('Prepínam do offline režimu kvôli chybe pripojenia:', e);
      this.isOnlineMode = false;
      return false;
    }
  },

  /**
   * Získa zoznam všetkých turnajov
   */
  getAllTournaments: async function() {
    await this.checkConnection();

    if (this.isOnlineMode) {
      try {
        const response = await fetch(this.BUCKET_URL);
        if (response.status === 404) {
          // Ak kľúč ešte neexistuje, inicializujeme ho prázdnym polom
          await this._saveOnline([]);
          return [];
        }
        if (!response.ok) throw new Error('Chyba servera pri načítaní');
        const data = await response.json();
        return Array.isArray(data) ? data : [];
      } catch (e) {
        console.error('Chyba pri online načítaní, používam localStorage:', e);
        this.isOnlineMode = false;
        return this._loadLocal();
      }
    } else {
      return this._loadLocal();
    }
  },

  /**
   * Získa jeden turnaj podľa ID
   */
  getTournament: async function(id) {
    const tournaments = await this.getAllTournaments();
    return tournaments.find(t => t.id === id) || null;
  },

  /**
   * Vytvorí nový turnaj a uloží ho
   */
  createTournament: async function(tournamentData) {
    const tournaments = await this.getAllTournaments();
    
    // Vygenerujeme ID a Admin Token
    const id = Utils.generateId();
    const adminToken = Utils.generateToken();

    // Ak klient pošle vopred pripravené zápasy (z losovania), použijeme ich
    let matches = tournamentData.matches;
    if (!matches || matches.length === 0) {
      if (tournamentData.format === 'league') {
        matches = Utils.generateRoundRobin(tournamentData.teams);
      } else if (tournamentData.format === 'league_double') {
        matches = Utils.generateDoubleRoundRobin(tournamentData.teams);
      } else if (tournamentData.format === 'knockout') {
        matches = Utils.generateKnockout(tournamentData.teams);
      } else {
        matches = Utils.generateGroupsAndPlayoffs(tournamentData.teams, tournamentData.format);
      }
    }

    const newTournament = {
      id: id,
      name: tournamentData.name,
      format: tournamentData.format,
      location: tournamentData.location,
      date: tournamentData.date,
      duration: parseInt(tournamentData.duration) || 15,
      emoji: tournamentData.emoji,
      description: tournamentData.description || '',
      category: tournamentData.category || 'U15',
      lookingForTeams: !!tournamentData.lookingForTeams,
      teams: tournamentData.teams,
      matches: matches,
      breaks: tournamentData.breaks || [],
      startTime: tournamentData.startTime || '09:00',
      interval: parseInt(tournamentData.interval) || 20,
      pitches: parseInt(tournamentData.pitches) || 1,
      sponsors: tournamentData.sponsors || [],
      adminToken: adminToken,
      createdAt: new Date().toISOString()
    };

    tournaments.push(newTournament);
    
    // Uložíme
    await this._save(tournaments);

    // Vstupujeme ako divák, preto NEukladáme admin token do localStorage pre automatické prihlásenie

    return newTournament;
  },

  /**
   * Aktualizuje výsledok konkrétneho zápasu v turnaji
   */
  updateMatchScore: async function(tournamentId, matchId, updateData, adminToken) {
    const tournaments = await this.getAllTournaments();
    const tournament = tournaments.find(t => t.id === tournamentId);

    if (!tournament) {
      throw new Error('Turnaj nebol nájdený!');
    }

    // Overenie admin tokenu
    if (tournament.adminToken !== adminToken) {
      throw new Error('Neplatný administrátorský kľúč!');
    }

    const match = tournament.matches.find(m => m.id === matchId);
    if (!match) {
      throw new Error('Zápas nebol nájdený!');
    }

    // Aktualizácia dát zápasu
    match.status = updateData.status; // scheduled, live, finished
    match.score1 = updateData.score1 !== '' ? parseInt(updateData.score1) : null;
    match.score2 = updateData.score2 !== '' ? parseInt(updateData.score2) : null;
    match.scorers = updateData.scorers || { team1: [], team2: [] };

    // Logika postupu pre vyraďovacie zápasy (knockout alebo play-off)
    const isPlayoffMatch = match.stage === 'playoff' || tournament.format === 'knockout';
    if (isPlayoffMatch && match.status === 'finished') {
      if (match.score1 === null || match.score2 === null) {
        throw new Error('Pre ukončenie vyraďovacieho zápasu musíte zadať skóre!');
      }
      if (match.score1 === match.score2) {
        throw new Error('Vyraďovací zápas nemôže skončiť remízou! Zadajte víťaza (predĺženie/penalty).');
      }

      // Kto vyhral?
      const winner = match.score1 > match.score2 ? match.team1 : match.team2;

      // Ak má zápas nasledovníka, posunieme víťaza
      if (match.nextMatchId) {
        const nextMatch = tournament.matches.find(m => m.id === match.nextMatchId);
        if (nextMatch) {
          if (match.nextMatchSide === 'team1') {
            nextMatch.team1 = winner;
          } else if (match.nextMatchSide === 'team2') {
            nextMatch.team2 = winner;
          }
          nextMatch.score1 = null;
          nextMatch.score2 = null;
          nextMatch.status = 'scheduled';
        }
      }
    }

    // Logika pre skupinové fázy (ak sa ukončil zápas v skupine)
    const isGroupFormat = ['groups_2_top2', 'groups_2_all', 'groups_4_top2', 'league_playoff', 'groups_2_top4', 'groups_4_all'].includes(tournament.format);
    if (isGroupFormat && match.stage === 'group' && match.status === 'finished') {
      const groupMatches = tournament.matches.filter(m => m.stage === 'group');
      const allGroupMatchesFinished = groupMatches.every(m => m.status === 'finished');
      
      if (allGroupMatchesFinished) {
        this._seedPlayoffs(tournament);
      }
    }

    // Uložíme zmeny
    await this._save(tournaments);
    return tournament;
  },

  /**
   * Vymaže turnaj z databázy
   */
  deleteTournament: async function(tournamentId, adminToken) {
    const tournaments = await this.getAllTournaments();
    const tournament = tournaments.find(t => t.id === tournamentId);
    if (!tournament) {
      throw new Error('Turnaj nebol nájdený!');
    }
    if (tournament.adminToken !== adminToken) {
      throw new Error('Neplatný administrátorský kľúč!');
    }
    
    const filtered = tournaments.filter(t => t.id !== tournamentId);
    await this._save(filtered);
    return true;
  },

  /**
   * Aktualizuje kompletné detaily turnaja adminom (prelosovanie, tímy, nastavenia)
   */
  updateTournamentDetails: async function(tournamentId, updatedFields, adminToken) {
    const tournaments = await this.getAllTournaments();
    const tournament = tournaments.find(t => t.id === tournamentId);

    if (!tournament) {
      throw new Error('Turnaj nebol nájdený!');
    }

    if (tournament.adminToken !== adminToken) {
      throw new Error('Neplatný administrátorský kľúč!');
    }

    // Aktualizácia polí
    tournament.name = updatedFields.name;
    tournament.location = updatedFields.location;
    tournament.date = updatedFields.date;
    tournament.duration = parseInt(updatedFields.duration) || 15;
    tournament.description = updatedFields.description || '';
    tournament.category = updatedFields.category || 'U15';
    tournament.lookingForTeams = !!updatedFields.lookingForTeams;
    tournament.startTime = updatedFields.startTime || '09:00';
    tournament.interval = parseInt(updatedFields.interval) || 20;
    tournament.pitches = parseInt(updatedFields.pitches) || 1;
    
    // Nové tímy, zápasy a prestávky (prelosovanie)
    tournament.teams = updatedFields.teams;
    tournament.matches = updatedFields.matches;
    tournament.breaks = updatedFields.breaks || [];
    tournament.sponsors = updatedFields.sponsors || [];

    // Uložíme zmeny
    await this._save(tournaments);
    return tournament;
  },

  /**
   * Automatické nasadenie playoff zápasov na základe umiestnenia v skupinách
   */
  _seedPlayoffs: function(tournament) {
    let numGroups = 2;
    if (tournament.format === 'groups_4_top2' || tournament.format === 'groups_4_all') {
      numGroups = 4;
    } else if (tournament.format === 'league_playoff') {
      numGroups = 1;
    }
    const groupNames = ['A', 'B', 'C', 'D'].slice(0, numGroups);
    const standings = {};
    
    groupNames.forEach(g => {
      const groupMatches = tournament.matches.filter(m => m.stage === 'group' && m.group === g);
      
      // Množina tímov v tejto skupine
      const groupTeamIds = new Set();
      groupMatches.forEach(m => {
        groupTeamIds.add(m.team1.id);
        groupTeamIds.add(m.team2.id);
      });
      const groupTeams = tournament.teams.filter(t => groupTeamIds.has(t.id));
      
      standings[g] = Utils.calculateGroupStandings(groupTeams, groupMatches);
    });

    // Prejdeme play-off zápasy a dosadíme tímy podľa seedInfo
    tournament.matches.forEach(m => {
      if (m.stage === 'playoff' && m.seedInfo) {
        const seed1 = m.seedInfo.team1; // napr. '1A'
        const seed2 = m.seedInfo.team2; // napr. '2B'
        
        m.team1 = this._getTeamBySeed(standings, seed1);
        m.team2 = this._getTeamBySeed(standings, seed2);
        
        m.score1 = null;
        m.score2 = null;
        m.status = 'scheduled';
      }
    });
  },

  _getTeamBySeed: function(standings, seedStr) {
    if (!seedStr) return null;
    const rank = parseInt(seedStr.charAt(0)) - 1;
    const group = seedStr.charAt(1);
    
    const groupStandings = standings[group];
    if (groupStandings && groupStandings[rank]) {
      return groupStandings[rank].team;
    }
    return null;
  },

  /**
   * Pomocná funkcia na uloženie dát (Rozhodne o online vs local)
   */
  _save: async function(tournaments) {
    if (this.isOnlineMode) {
      try {
        await this._saveOnline(tournaments);
        // Tiež si spravíme lokálnu zálohu
        this._saveLocal(tournaments);
      } catch (e) {
        console.error('Chyba pri online ukladaní, ukladám lokálne:', e);
        this.isOnlineMode = false;
        this._saveLocal(tournaments);
      }
    } else {
      this._saveLocal(tournaments);
    }
  },

  /**
   * Uloží dáta na KVdb server
   */
  _saveOnline: async function(data) {
    const response = await fetch(this.BUCKET_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      throw new Error('Chyba pri odosielaní dát na server.');
    }
  },

  /**
   * Uloží dáta do localStorage
   */
  _saveLocal: function(data) {
    localStorage.setItem(this.LOCAL_KEY, JSON.stringify(data));
  },

  /**
   * Načíta dáta z localStorage
   */
  _loadLocal: function() {
    const localData = localStorage.getItem(this.LOCAL_KEY);
    return localData ? JSON.parse(localData) : [];
  }
};

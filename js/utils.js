/**
 * Pomocné funkcie pre turnajovú aplikáciu
 */
const Utils = {
  /**
   * Generuje náhodný token pre administrátora
   */
  generateToken: function() {
    return 't_' + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 6);
  },

  /**
   * Generuje unikátne ID pre turnaj alebo zápas
   */
  generateId: function() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  },

  /**
   * Naformátuje dátum do slovenského formátu (DD.MM.RRRR)
   */
  formatDate: function(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  },

  /**
   * Generuje rozpis zápasov pre formát Každý s každým (Round Robin)
   * Používa cyklický algoritmus (Bergerov systém)
   * 
   * @param {Array} teams - Zoznam objektov tímov {id, name, emoji}
   * @returns {Array} - Vygenerované zápasy
   */
  generateRoundRobin: function(teams) {
    const list = [...teams];
    const matches = [];
    
    // Ak je nepárny počet, pridáme voľno (null)
    if (list.length % 2 !== 0) {
      list.push(null);
    }

    const numTeams = list.length;
    const numRounds = numTeams - 1;
    const halfSize = numTeams / 2;

    for (let round = 0; round < numRounds; round++) {
      for (let i = 0; i < halfSize; i++) {
        const homeIdx = (round + i) % (numTeams - 1);
        let awayIdx = (numTeams - 1 - i + round) % (numTeams - 1);

        // Prvý prvok zostáva fixný na pozícii 0
        if (i === 0) {
          awayIdx = numTeams - 1;
        }

        const teamHome = list[homeIdx];
        const teamAway = list[awayIdx];

        // Zápas s "voľnom" (null) ignorujeme, tím má v danom kole voľno
        if (teamHome !== null && teamAway !== null) {
          // Striedanie domáci/hostia pre vyváženosť
          const isHome = (round + i) % 2 === 0;
          const t1 = isHome ? teamHome : teamAway;
          const t2 = isHome ? teamAway : teamHome;

          matches.push({
            id: 'match_' + round + '_' + i + '_' + Math.random().toString(36).substring(2, 6),
            team1: t1,
            team2: t2,
            score1: null,
            score2: null,
            status: 'scheduled', // scheduled, live, finished
            scorers: { team1: [], team2: [] },
            round: round + 1, // Číslo kola (1-indexed)
            roundName: `Kolo ${round + 1}`
          });
        }
      }
    }

    // Zamiešame zápasy v rámci kôl alebo zoradíme podľa kôl
    return matches.sort((a, b) => a.round - b.round);
  },

  /**
   * Generuje vyraďovací pavúk (Single Elimination)
   * Podporuje presne 4, 8 alebo 16 tímov.
   * 
   * @param {Array} teams - Zoznam tímov
   * @returns {Array} - Zápasy pavúka s prepojeniami na ďalšie kolá
   */
  generateKnockout: function(teams) {
    const n = teams.length;
    if (n !== 4 && n !== 8 && n !== 16) {
      throw new Error('Vyraďovací turnaj vyžaduje presne 4, 8 alebo 16 tímov!');
    }

    const matches = [];
    let matchCounter = 1;
    
    // Určíme štruktúru turnaja
    // roundsCount: 4 tímy = 2 kolá, 8 tímov = 3 kolá, 16 tímov = 4 kolá
    const roundsCount = Math.log2(n);
    
    // Zoznam kôl
    const roundNames = [];
    if (n === 4) {
      roundNames.push('Semifinále', 'Finále');
    } else if (n === 8) {
      roundNames.push('Štvrťfinále', 'Semifinále', 'Finále');
    } else if (n === 16) {
      roundNames.push('Osemfinále', 'Štvrťfinále', 'Semifinále', 'Finále');
    }

    // Vytvoríme prvé kolo so skutočnými tímami
    const firstRoundMatchesCount = n / 2;
    const firstRoundMatches = [];

    // Nasadenie tímov (Tím 1 vs Tím N, Tím 2 vs Tím N-1 atď. pre férové nasadenie)
    // Alebo jednoduché rad-radom
    for (let i = 0; i < firstRoundMatchesCount; i++) {
      const matchId = `m_${matchCounter++}`;
      const t1 = teams[i];
      const t2 = teams[n - 1 - i]; // Nasadenie najlepší s najhorším

      firstRoundMatches.push({
        id: matchId,
        team1: t1,
        team2: t2,
        score1: null,
        score2: null,
        status: 'scheduled',
        scorers: { team1: [], team2: [] },
        roundIndex: 0,
        roundName: roundNames[0],
        nextMatchId: null,      // Bude doplnené
        nextMatchSide: null     // Bude doplnené (team1 alebo team2)
      });
    }
    matches.push(...firstRoundMatches);

    // Vygenerujeme ďalšie kolá (prázdne, tímy postúpia neskôr)
    let prevRoundMatches = firstRoundMatches;
    
    for (let r = 1; r < roundsCount; r++) {
      const currentRoundMatchesCount = prevRoundMatches.length / 2;
      const currentRoundMatches = [];

      for (let i = 0; i < currentRoundMatchesCount; i++) {
        const matchId = `m_${matchCounter++}`;
        currentRoundMatches.push({
          id: matchId,
          team1: null, // Bude dosadený postupom
          team2: null, // Bude dosadený postupom
          score1: null,
          score2: null,
          status: 'scheduled',
          scorers: { team1: [], team2: [] },
          roundIndex: r,
          roundName: roundNames[r],
          nextMatchId: null,
          nextMatchSide: null
        });

        // Prepojíme predchádzajúce kolo s týmto zápasom
        const parentMatch1 = prevRoundMatches[i * 2];
        const parentMatch2 = prevRoundMatches[i * 2 + 1];

        parentMatch1.nextMatchId = matchId;
        parentMatch1.nextMatchSide = 'team1';

        parentMatch2.nextMatchId = matchId;
        parentMatch2.nextMatchSide = 'team2';
      }

      matches.push(...currentRoundMatches);
      prevRoundMatches = currentRoundMatches;
    }

    return matches;
  },

  /**
   * Generuje skupinovú fázu a prázdny play-off pavúk
   * Podporuje formáty groups_2_top2, groups_2_all, groups_4_top2.
   */
  generateGroupsAndPlayoffs: function(teams, format) {
    let numGroups = 2;
    if (format === 'groups_4_top2') {
      numGroups = 4;
    }
    
    // Rozdelenie tímov do skupín (striedavo)
    const groups = {};
    const groupNames = ['A', 'B', 'C', 'D'].slice(0, numGroups);
    groupNames.forEach(g => groups[g] = []);
    
    teams.forEach((team, idx) => {
      const gName = groupNames[idx % numGroups];
      groups[gName].push(team);
    });
    
    const matches = [];
    
    // Generovanie zápasov v skupinách
    groupNames.forEach(g => {
      const groupTeams = groups[g];
      const groupMatches = this._generateGroupRoundRobin(groupTeams, g);
      matches.push(...groupMatches);
    });
    
    // Generovanie prázdneho play-off pavúka
    const playoffMatches = [];
    if (format === 'groups_2_top2') {
      // 4 tímy v play-off (2 SF, 1 F)
      playoffMatches.push(
        {
          id: 'p_sf_1',
          team1: null, team2: null, score1: null, score2: null,
          status: 'scheduled', scorers: { team1: [], team2: [] },
          roundIndex: 0, roundName: 'Semifinále', stage: 'playoff',
          nextMatchId: 'p_f_1', nextMatchSide: 'team1',
          seedInfo: { team1: '1A', team2: '2B' }
        },
        {
          id: 'p_sf_2',
          team1: null, team2: null, score1: null, score2: null,
          status: 'scheduled', scorers: { team1: [], team2: [] },
          roundIndex: 0, roundName: 'Semifinále', stage: 'playoff',
          nextMatchId: 'p_f_1', nextMatchSide: 'team2',
          seedInfo: { team1: '1B', team2: '2A' }
        },
        {
          id: 'p_f_1',
          team1: null, team2: null, score1: null, score2: null,
          status: 'scheduled', scorers: { team1: [], team2: [] },
          roundIndex: 1, roundName: 'Finále', stage: 'playoff',
          nextMatchId: null, nextMatchSide: null
        }
      );
    } else if (format === 'groups_2_all' || format === 'groups_4_top2') {
      // 8 tímov v play-off (4 QF, 2 SF, 1 F)
      const seedInfoMap = format === 'groups_2_all' ? {
        qf1: { team1: '1A', team2: '4B' },
        qf2: { team1: '2A', team2: '3B' },
        qf3: { team1: '3A', team2: '2B' },
        qf4: { team1: '4A', team2: '1B' }
      } : {
        qf1: { team1: '1A', team2: '2B' },
        qf2: { team1: '1C', team2: '2D' },
        qf3: { team1: '1B', team2: '2A' },
        qf4: { team1: '1D', team2: '2C' }
      };

      playoffMatches.push(
        {
          id: 'p_qf_1',
          team1: null, team2: null, score1: null, score2: null,
          status: 'scheduled', scorers: { team1: [], team2: [] },
          roundIndex: 0, roundName: 'Štvrťfinále', stage: 'playoff',
          nextMatchId: 'p_sf_1', nextMatchSide: 'team1',
          seedInfo: seedInfoMap.qf1
        },
        {
          id: 'p_qf_2',
          team1: null, team2: null, score1: null, score2: null,
          status: 'scheduled', scorers: { team1: [], team2: [] },
          roundIndex: 0, roundName: 'Štvrťfinále', stage: 'playoff',
          nextMatchId: 'p_sf_1', nextMatchSide: 'team2',
          seedInfo: seedInfoMap.qf2
        },
        {
          id: 'p_qf_3',
          team1: null, team2: null, score1: null, score2: null,
          status: 'scheduled', scorers: { team1: [], team2: [] },
          roundIndex: 0, roundName: 'Štvrťfinále', stage: 'playoff',
          nextMatchId: 'p_sf_2', nextMatchSide: 'team1',
          seedInfo: seedInfoMap.qf3
        },
        {
          id: 'p_qf_4',
          team1: null, team2: null, score1: null, score2: null,
          status: 'scheduled', scorers: { team1: [], team2: [] },
          roundIndex: 0, roundName: 'Štvrťfinále', stage: 'playoff',
          nextMatchId: 'p_sf_2', nextMatchSide: 'team2',
          seedInfo: seedInfoMap.qf4
        },
        {
          id: 'p_sf_1',
          team1: null, team2: null, score1: null, score2: null,
          status: 'scheduled', scorers: { team1: [], team2: [] },
          roundIndex: 1, roundName: 'Semifinále', stage: 'playoff',
          nextMatchId: 'p_f_1', nextMatchSide: 'team1'
        },
        {
          id: 'p_sf_2',
          team1: null, team2: null, score1: null, score2: null,
          status: 'scheduled', scorers: { team1: [], team2: [] },
          roundIndex: 1, roundName: 'Semifinále', stage: 'playoff',
          nextMatchId: 'p_f_1', nextMatchSide: 'team2'
        },
        {
          id: 'p_f_1',
          team1: null, team2: null, score1: null, score2: null,
          status: 'scheduled', scorers: { team1: [], team2: [] },
          roundIndex: 2, roundName: 'Finále', stage: 'playoff',
          nextMatchId: null, nextMatchSide: null
        }
      );
    }
    
    matches.push(...playoffMatches);
    return matches;
  },

  /**
   * Pomocná funkcia pre generovanie ligových zápasov v konkrétnej skupine
   */
  _generateGroupRoundRobin: function(teams, groupName) {
    const list = [...teams];
    const matches = [];
    if (list.length % 2 !== 0) {
      list.push(null);
    }
    const numTeams = list.length;
    const numRounds = numTeams - 1;
    const halfSize = numTeams / 2;

    for (let round = 0; round < numRounds; round++) {
      for (let i = 0; i < halfSize; i++) {
        const homeIdx = (round + i) % (numTeams - 1);
        let awayIdx = (numTeams - 1 - i + round) % (numTeams - 1);
        if (i === 0) awayIdx = numTeams - 1;

        const teamHome = list[homeIdx];
        const teamAway = list[awayIdx];

        if (teamHome !== null && teamAway !== null) {
          const isHome = (round + i) % 2 === 0;
          const t1 = isHome ? teamHome : teamAway;
          const t2 = isHome ? teamAway : teamHome;

          matches.push({
            id: 'match_g_' + groupName.toLowerCase() + '_' + round + '_' + i + '_' + Math.random().toString(36).substring(2, 6),
            team1: t1,
            team2: t2,
            score1: null,
            score2: null,
            status: 'scheduled',
            scorers: { team1: [], team2: [] },
            round: round + 1,
            roundName: `Skupina ${groupName} - Kolo ${round + 1}`,
            stage: 'group',
            group: groupName
          });
        }
      }
    }
    return matches.sort((a, b) => a.round - b.round);
  },

  /**
   * Spoločný výpočet tabuľky umiestnenia pre ligu alebo skupinu
   */
  calculateGroupStandings: function(teams, matches) {
    const stats = {};
    
    // Inicializácia štatistík pre tímy
    teams.forEach(team => {
      stats[team.id] = {
        team: team,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        pts: 0
      };
    });

    // Spracovanie zápasov
    matches.forEach(match => {
      if (match.status === 'finished' && match.score1 !== null && match.score2 !== null) {
        const t1 = match.team1.id;
        const t2 = match.team2.id;
        
        if (!stats[t1] || !stats[t2]) return;

        stats[t1].played += 1;
        stats[t2].played += 1;

        stats[t1].gf += match.score1;
        stats[t1].ga += match.score2;
        stats[t2].gf += match.score2;
        stats[t2].ga += match.score1;

        if (match.score1 > match.score2) {
          stats[t1].wins += 1;
          stats[t1].pts += 3;
          stats[t2].losses += 1;
        } else if (match.score1 < match.score2) {
          stats[t2].wins += 1;
          stats[t2].pts += 3;
          stats[t1].losses += 1;
        } else {
          stats[t1].draws += 1;
          stats[t1].pts += 1;
          stats[t2].draws += 1;
          stats[t2].pts += 1;
        }
      }
    });

    const list = Object.values(stats);
    list.forEach(s => s.gd = s.gf - s.ga);

    // Zoradenie: Body -> GD -> GF -> Názov tímu
    list.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.team.name.localeCompare(b.team.name);
    });

    return list;
  },

  /**
   * Vypočíta a priradí časy štartov a ihriská pre jednotlivé zápasy s ohľadom na prestávky
   */
  calculateScheduleTimes: function(matches, startTimeStr, intervalMin, pitchesCount, breaks, matchDuration = 15) {
    if (!matches || matches.length === 0) return [];
    
    // 1. Zoskupíme zápasy do kôl (Round Blocks)
    const blocks = {};
    const blockKeys = [];
    
    matches.forEach(m => {
      let key = '';
      let order = 0;
      
      if (m.stage === 'group') {
        key = `skupina_kolo_${m.round}`;
        order = m.round;
      } else if (m.stage === 'playoff') {
        key = `playoff_kolo_${m.roundIndex}`;
        order = 100 + m.roundIndex;
      } else if (m.roundIndex !== undefined) {
        key = `knockout_kolo_${m.roundIndex}`;
        order = m.roundIndex;
      } else {
        key = `liga_kolo_${m.round}`;
        order = m.round;
      }
      
      if (!blocks[key]) {
        blocks[key] = {
          key: key,
          order: order,
          matches: []
        };
        blockKeys.push(blocks[key]);
      }
      blocks[key].matches.push(m);
    });
    
    // Zoradíme bloky podľa poradia
    blockKeys.sort((a, b) => a.order - b.order);
    
    // 2. Prepočet štartovacieho času na minúty
    const timeParts = startTimeStr.split(':');
    let currentMin = (parseInt(timeParts[0]) || 9) * 60 + (parseInt(timeParts[1]) || 0);
    
    // Ihriská
    const pitchNames = [];
    for (let p = 1; p <= pitchesCount; p++) {
      pitchNames.push(`Ihrisko ${p}`);
    }
    
    let scheduledMatchCount = 0;
    
    blockKeys.forEach(block => {
      const blockMatches = block.matches;
      const mCount = blockMatches.length;
      
      const slotsCount = Math.ceil(mCount / pitchesCount);
      
      for (let s = 0; s < slotsCount; s++) {
        // Kontrola prestávky PRED týmto slotom
        if (breaks && breaks.length > 0) {
          const activeBreak = breaks.find(b => parseInt(b.afterMatchIndex) === scheduledMatchCount);
          if (activeBreak) {
            currentMin += parseInt(activeBreak.duration) || 0;
          }
        }
        
        for (let p = 0; p < pitchesCount; p++) {
          const mIdx = s * pitchesCount + p;
          if (mIdx < mCount) {
            const match = blockMatches[mIdx];
            
            const hr = String(Math.floor(currentMin / 60) % 24).padStart(2, '0');
            const mn = String(currentMin % 60).padStart(2, '0');
            match.time = `${hr}:${mn}`;
            match.pitch = pitchNames[p];
            
            scheduledMatchCount++;
          }
        }
        
        // Interval je teraz prestávka MEDZI zápasmi, takže časový posun je dĺžka zápasu + prestávka
        currentMin += parseInt(matchDuration) + parseInt(intervalMin);
      }
    });
    
    return matches;
  }
};


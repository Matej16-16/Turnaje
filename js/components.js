/**
 * UI Komponenty pre FutbalTurnaje.sk
 */
const Components = {
  /**
   * Vykreslí kartu turnaja pre domovskú obrazovku (mriežku)
   */
  renderTournamentCard: function(tournament) {
    // Spočítame progres zápasov
    const totalMatches = tournament.matches.length;
    const finishedMatches = tournament.matches.filter(m => m.status === 'finished').length;
    const liveMatches = tournament.matches.filter(m => m.status === 'live').length;
    
    let progressPercent = 0;
    if (totalMatches > 0) {
      progressPercent = Math.round((finishedMatches / totalMatches) * 100);
    }

    // Stav turnaja
    let statusClass = '';
    let statusText = 'Plánovaný';
    
    if (liveMatches > 0) {
      statusClass = 'live';
      statusText = '🔴 NAŽIVO';
    } else if (finishedMatches === totalMatches && totalMatches > 0) {
      statusClass = 'finished';
      statusText = 'Ukončený';
    } else if (finishedMatches > 0) {
      statusClass = 'live';
      statusText = 'Prebieha';
    }

    const formatText = tournament.format === 'league' ? 'Liga (Každý s každým)' : 'Vyraďovačka (Pavúk)';
    const dateFormatted = Utils.formatDate(tournament.date);

    const categoryHtml = tournament.category ? `<span class="badge-category">👶 ${tournament.category}</span>` : '';
    const lookingHtml = tournament.lookingForTeams ? `<span class="badge badge-status looking">🔍 Hľadá sa tím</span>` : '';

    return `
      <div class="card tournament-card" onclick="app.navigateTo('tournament/${tournament.id}')">
        <div class="tc-header">
          <div class="tc-title-wrapper">
            <span class="tc-emoji">${tournament.emoji || '🏆'}</span>
            <div>
              <h3 class="tc-title">${tournament.name}</h3>
              <div style="display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap;">
                ${categoryHtml}
                ${lookingHtml}
              </div>
            </div>
          </div>
          <span class="badge badge-status ${statusClass}">${statusText}</span>
        </div>
        
        <div class="tc-details">
          <div class="tc-details-row">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            <span>Dátum: ${dateFormatted}</span>
          </div>
          <div class="tc-details-row">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            <span>Miesto: ${tournament.location}</span>
          </div>
          <div class="tc-details-row">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            <span>Počet tímov: ${tournament.teams.length}</span>
          </div>
        </div>

        <div class="tc-footer">
          <div class="tc-progress-bar">
            <div class="tc-progress-fill" style="width: ${progressPercent}%;"></div>
          </div>
          <span class="tc-progress-lbl">${finishedMatches}/${totalMatches} zápasov</span>
        </div>
      </div>
    `;
  },

  /**
   * Vypočíta ligovú tabuľku z odohraných zápasov (delegované na spoločný Utils)
   */
  calculateStandings: function(tournament) {
    return Utils.calculateGroupStandings(tournament.teams, tournament.matches);
  },

  /**
   * Vykreslí tabuľku umiestnenia pre ligu (Round Robin)
   */
  renderStandingsTable: function(tournament) {
    const standings = this.calculateStandings(tournament);
    let html = '';

    if (standings.length === 0) {
      return `<tr><td colspan="9" class="txt-center">Žiadne tímy.</td></tr>`;
    }

    standings.forEach((row, index) => {
      const isTop = index === 0 && row.played > 0;
      const rowClass = isTop ? 'top-team' : '';
      
      html += `
        <tr class="${rowClass}">
          <td class="rank-num">${index + 1}.</td>
          <td>
            <div class="team-cell">
              <span class="team-emoji">${row.team.emoji || '⚽'}</span>
              <span>${row.team.name}</span>
            </div>
          </td>
          <td class="txt-center">${row.played}</td>
          <td class="txt-center text-success">${row.wins}</td>
          <td class="txt-center text-warning">${row.draws}</td>
          <td class="txt-center text-danger">${row.losses}</td>
          <td class="txt-center">${row.gf}:${row.ga}</td>
          <td class="txt-center">${row.gd > 0 ? '+' + row.gd : row.gd}</td>
          <td class="txt-center font-bold">${row.pts}</td>
        </tr>
      `;
    });

    return html;
  },

  /**
   * Vykreslí samostatné tabuľky pre jednotlivé skupiny v skupinových turnajoch
   */
  renderGroupStandings: function(tournament) {
    let numGroups = 2;
    if (tournament.format === 'groups_4_top2') {
      numGroups = 4;
    }
    const groupNames = ['A', 'B', 'C', 'D'].slice(0, numGroups);
    let html = '';
    
    groupNames.forEach(g => {
      // Zistíme zápasy pre túto skupinu
      const groupMatches = tournament.matches.filter(m => m.stage === 'group' && m.group === g);
      
      // Zistíme tímy v tejto skupine
      const groupTeamIds = new Set();
      groupMatches.forEach(m => {
        groupTeamIds.add(m.team1.id);
        groupTeamIds.add(m.team2.id);
      });
      const groupTeams = tournament.teams.filter(t => groupTeamIds.has(t.id));
      
      const standings = Utils.calculateGroupStandings(groupTeams, groupMatches);
      
      let rowsHtml = '';
      if (standings.length === 0) {
        rowsHtml = `<tr><td colspan="9" class="txt-center">Žiadne tímy.</td></tr>`;
      } else {
        standings.forEach((row, index) => {
          // Zelené zafarbenie pre postupujúcich (prví dvaja, okrem groups_2_all kde postupujú všetci štyria)
          let rowClass = '';
          const maxAdvancing = tournament.format === 'groups_2_all' ? 4 : 2;
          if (index < maxAdvancing && row.played > 0) {
            rowClass = 'top-team';
          }
          
          rowsHtml += `
            <tr class="${rowClass}">
              <td class="rank-num">${index + 1}.</td>
              <td>
                <div class="team-cell">
                  <span class="team-emoji">${row.team.emoji || '⚽'}</span>
                  <span>${row.team.name}</span>
                </div>
              </td>
              <td class="txt-center">${row.played}</td>
              <td class="txt-center text-success">${row.wins}</td>
              <td class="txt-center text-warning">${row.draws}</td>
              <td class="txt-center text-danger">${row.losses}</td>
              <td class="txt-center">${row.gf}:${row.ga}</td>
              <td class="txt-center">${row.gd > 0 ? '+' + row.gd : row.gd}</td>
              <td class="txt-center font-bold">${row.pts}</td>
            </tr>
          `;
        });
      }
      
      html += `
        <div class="group-standings-card card" style="margin-bottom: 30px;">
          <h3 class="tab-title" style="border-bottom: 1px solid var(--border-color); padding-bottom: 8px; margin-bottom: 16px;">Skupina ${g}</h3>
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
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        </div>
      `;
    });
    
    return html;
  },

  /**
   * Vykreslí kartu zápasu (Schedule)
   */
  renderMatchCard: function(match, isOrganizer) {
    let statusText = 'Plánovaný';
    let statusClass = '';

    if (match.status === 'live') {
      statusClass = 'live';
      statusText = '<span class="mc-pulse-dot"></span> NAŽIVO';
    } else if (match.status === 'finished') {
      statusClass = 'finished';
      statusText = 'Ukončený';
    }

    const score1Text = match.score1 !== null ? match.score1 : '-';
    const score2Text = match.score2 !== null ? match.score2 : '-';
    
    // Generovanie strelcov gólov
    let eventsHtml = '';
    const t1Scorers = (match.scorers && match.scorers.team1) || [];
    const t2Scorers = (match.scorers && match.scorers.team2) || [];

    if (t1Scorers.length > 0 || t2Scorers.length > 0) {
      let t1List = t1Scorers.map(s => `<li>⚽ ${s.name} (${s.min}')</li>`).join('');
      let t2List = t2Scorers.map(s => `<li>(${s.min}') ${s.name} ⚽</li>`).join('');

      eventsHtml = `
        <div class="mc-events">
          <div class="mc-events-row">
            <ul class="mc-events-list home-events">
              ${t1List}
            </ul>
            <ul class="mc-events-list away-events">
              ${t2List}
            </ul>
          </div>
        </div>
      `;
    }

    // Tlačidlo pre organizátora
    const editBtnHtml = isOrganizer ? `
      <div class="mc-footer">
        <button class="btn btn-sm btn-secondary btn-edit-match" onclick="app.openMatchEditModal('${match.id}')">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          Upraviť výsledok
        </button>
      </div>
    ` : '';

    const timePitchText = match.time ? `🕐 ${match.time} | 🏟️ ${match.pitch || 'Ihrisko 1'}` : '';

    return `
      <div class="match-card">
        <div class="mc-header">
          <span>Kolo ${match.round || match.roundName || ''} ${timePitchText ? `(${timePitchText})` : ''}</span>
          <span class="mc-status ${statusClass}">${statusText}</span>
        </div>
        <div class="mc-body">
          <div class="mc-team team-home">
            <span class="mc-team-emoji">${match.team1 ? (match.team1.emoji || '⚽') : '❓'}</span>
            <span class="mc-team-name" title="${match.team1 ? match.team1.name : 'Čaká sa na súpera'}">
              ${match.team1 ? match.team1.name : 'Čaká sa na súpera'}
            </span>
          </div>
          
          <div class="mc-score-area">
            <div class="mc-score ${match.score1 === null ? 'score-empty' : ''}">${score1Text}</div>
            <span class="mc-vs">:</span>
            <div class="mc-score ${match.score2 === null ? 'score-empty' : ''}">${score2Text}</div>
          </div>

          <div class="mc-team team-away">
            <span class="mc-team-name" title="${match.team2 ? match.team2.name : 'Čaká sa na súpera'}">
              ${match.team2 ? match.team2.name : 'Čaká sa na súpera'}
            </span>
            <span class="mc-team-emoji">${match.team2 ? (match.team2.emoji || '⚽') : '❓'}</span>
          </div>
        </div>
        ${eventsHtml}
        ${editBtnHtml}
      </div>
    `;
  },

  /**
   * Vykreslí vyraďovacieho pavúka (Single Elimination)
   */
  renderBracket: function(tournament, isOrganizer) {
    const isGroupFormat = ['groups_2_top2', 'groups_2_all', 'groups_4_top2'].includes(tournament.format);
    if (tournament.format !== 'knockout' && !isGroupFormat) {
      return '<div class="txt-center" style="padding: 40px; color: var(--text-muted);">Tento turnaj nemá vyraďovacieho pavúka.</div>';
    }
    
    // Filtrujeme play-off zápasy pre skupinové turnaje
    const matches = tournament.format === 'knockout'
      ? tournament.matches
      : tournament.matches.filter(m => m.stage === 'playoff');

    if (matches.length === 0) {
      return '<div class="txt-center" style="padding: 40px; color: var(--text-muted);">Play-off pavúk zatiaľ nie je vygenerovaný. Odohrajte zápasy v skupinách!</div>';
    }
    
    // Zistíme maximálny roundIndex
    const maxRound = Math.max(...matches.map(m => m.roundIndex));
    const rounds = [];
    
    for (let r = 0; r <= maxRound; r++) {
      rounds.push(matches.filter(m => m.roundIndex === r));
    }

    let html = '';
    
    rounds.forEach((roundMatches, rIdx) => {
      let roundName = roundMatches[0].roundName;
      let roundMatchesHtml = '';

      roundMatches.forEach(match => {
        const isLive = match.status === 'live';
        const isFinished = match.status === 'finished';
        
        let score1Html = match.score1 !== null ? match.score1 : '-';
        let score2Html = match.score2 !== null ? match.score2 : '-';
        
        let winnerSide = '';
        if (isFinished && match.score1 !== null && match.score2 !== null) {
          winnerSide = match.score1 > match.score2 ? 'team1' : 'team2';
        }

        // Overlay na úpravu pre organizátora
        const editOverlay = isOrganizer ? `
          <div class="bm-edit-overlay active">
            <button class="btn btn-sm btn-primary" onclick="app.openMatchEditModal('${match.id}')">Upraviť</button>
          </div>
        ` : '';

        // Detekcia stavu naživo pre mini-badge
        const liveBadge = isLive ? `<span class="badge badge-status live">Live</span>` : '';

        const timePitchText = match.time ? ` | 🕐 ${match.time} | 🏟️ ${match.pitch || 'Ihrisko 1'}` : '';
        roundMatchesHtml += `
          <div class="bracket-match">
            <div class="bm-info ${isLive ? 'live' : ''}">
              <span>Zápas ${match.id.replace('m_', '#').replace('p_sf_', 'SF ').replace('p_qf_', 'ŠF ').replace('p_f_', 'Finále ')}${timePitchText}</span>
              ${liveBadge}
            </div>
            
            <!-- Domáci tím (Team 1) -->
            <div class="bm-team-row ${winnerSide === 'team1' ? 'winner' : ''}">
              <div class="bm-team-info">
                <span>${match.team1 ? (match.team1.emoji || '⚽') : '❓'}</span>
                <span class="bm-team-name">${match.team1 ? match.team1.name : 'Postupujúci'}</span>
              </div>
              <span class="bm-team-score">${score1Html}</span>
            </div>

            <!-- Hostia (Team 2) -->
            <div class="bm-team-row ${winnerSide === 'team2' ? 'winner' : ''}">
              <div class="bm-team-info">
                <span>${match.team2 ? (match.team2.emoji || '⚽') : '❓'}</span>
                <span class="bm-team-name">${match.team2 ? match.team2.name : 'Postupujúci'}</span>
              </div>
              <span class="bm-team-score">${score2Html}</span>
            </div>

            ${editOverlay}
          </div>
        `;
      });

      html += `
        <div class="bracket-round">
          <div class="bracket-round-title">${roundName}</div>
          <div class="bracket-matches">
            ${roundMatchesHtml}
          </div>
        </div>
      `;
    });

    return html;
  },

  /**
   * Vykreslí tabuľku strelcov
   */
  renderScorersTable: function(scorers) {
    if (!scorers || scorers.length === 0) {
      return `
        <h3 class="tab-title">Najlepší strelci turnaja</h3>
        <div class="txt-center card" style="padding: 40px; color: var(--text-muted);">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 12px; opacity: 0.5; display: inline-block;"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v8M8 12h8"></path></svg>
          <p>Zatiaľ neboli zaznamenané žiadne góly v turnaji.</p>
        </div>
      `;
    }

    let rowsHtml = '';
    scorers.forEach((s, idx) => {
      const isTop = idx === 0;
      const rowClass = isTop ? 'top-team' : '';
      
      rowsHtml += `
        <tr class="${rowClass}">
          <td class="rank-num">${idx + 1}.</td>
          <td>
            <div class="team-cell">
              <span style="font-size: 1.1rem; margin-right: 6px;">⚽</span>
              <span class="font-bold">${s.name}</span>
            </div>
          </td>
          <td>
            <div class="team-cell">
              <span class="team-emoji">${s.teamEmoji}</span>
              <span>${s.teamName}</span>
            </div>
          </td>
          <td class="txt-center font-bold" style="font-size: 1.1rem; color: var(--primary);">${s.goals}</td>
        </tr>
      `;
    });

    return `
      <h3 class="tab-title">Najlepší strelci turnaja</h3>
      <div class="table-responsive">
        <table class="standings-table">
          <thead>
            <tr>
              <th style="width: 50px;">#</th>
              <th>Meno hráča</th>
              <th>Tím</th>
              <th class="txt-center font-bold" style="width: 100px;">Góly</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  }
};

window.DivPre=(function(){
  async function renderDivision(season,type){
    const divs=await fetchDivisionStandings(season,type)
    if(divs && Object.keys(divs).length){
      renderDivisions(divs)
      return
    }
    const raw=await fetchStandings(season,type)
    if(!raw) return
    const data=normalize(raw)
    window.currentData=data
    if(Object.keys(data.divisions||{}).length){
      renderDivisions(data.divisions)
      return
    }
    const fb=await buildStandingsFallback()
    if(!fb) return
    const base=fb.league||[]
    const container=document.querySelector('#divisions')
    if(!container) return
    container.innerHTML=''
    const mkTable=()=>{
      const table=document.createElement('table')
      table.className='standings'
      const thead=document.createElement('thead')
      thead.innerHTML=`<tr>
        <th></th>
        <th data-sort="wins">W</th>
        <th data-sort="losses">L</th>
        <th data-sort="pct">PCT</th>
        <th data-sort="gb">GB</th>
        <th>HOME</th>
        <th>AWAY</th>
        <th>DIV</th>
        <th>CONF</th>
        <th data-sort="ppg">PPG</th>
        <th data-sort="opppg">OPP PPG</th>
        <th data-sort="diff">DIFF</th>
        <th data-sort="streak">STRK</th>
        <th>L10</th>
      </tr>`
      table.appendChild(thead)
      return table
    }
    const DIV_MAP={
      East:{Atlantic:['NY','NYK','TOR','BOS','PHI','BKN'],Central:['DET','CLE','MIL','CHI','IND'],Southeast:['ORL','MIA','ATL','CHA','WSH','WAS']},
      West:{Northwest:['OKC','DEN','MIN','POR','UTA','UTAH'],Pacific:['LAL','PHX','GS','GSW','SAC','LAC'],Southwest:['SAS','SA','HOU','MEM','DAL','NO','NOP','NOLA']}
    }
    const inSet=(abbr,set)=>{ const a=String(abbr||'').toUpperCase(); return set.some(x=>a===x) }
    const bySet=(set)=> rank(base.filter(t=> inSet(t.short,set)))
    const eastOrder=['Atlantic','Central','Southeast']
    const westOrder=['Northwest','Pacific','Southwest']
    const makeCard=(title,teams)=>{
      const card=document.createElement('div')
      card.className='division-card'
      const h=document.createElement('h3')
      h.textContent=title
      const wrap=document.createElement('div')
      wrap.className='table-wrap'
      const table=mkTable()
      const tbody=document.createElement('tbody')
      fillTable(tbody,teams,{showOrdinal:false})
      attachSort(tbody,()=>teams.slice())
      table.appendChild(tbody)
      wrap.appendChild(table)
      card.appendChild(h)
      card.appendChild(wrap)
      return card
    }
    const grid=document.createElement('div')
    grid.className='division-grid'
    const eastSection=document.createElement('div')
    eastSection.className='conference-block'
    const eastTitle=document.createElement('h2')
    eastTitle.textContent='Eastern Conference'
    eastSection.appendChild(eastTitle)
    eastOrder.forEach(d=>eastSection.appendChild(makeCard(d,bySet(DIV_MAP.East[d]))))
    const westSection=document.createElement('div')
    westSection.className='conference-block'
    const westTitle=document.createElement('h2')
    westTitle.textContent='Western Conference'
    westSection.appendChild(westTitle)
    westOrder.forEach(d=>westSection.appendChild(makeCard(d,bySet(DIV_MAP.West[d]))))
    grid.appendChild(eastSection)
    grid.appendChild(westSection)
    container.appendChild(grid)
  }
  async function renderPreseasonLeague(season){
    const raw=await fetchStandings(season,'1')
    let data=null
    if(raw){
      data=normalize(raw)
    }
    if(!data || !(data.league||[]).length){
      const fb=await buildStandingsFallback()
      if(fb){
        window.currentData=fb
        renderLeague(fb.league)
        attachSort(document.querySelector('#league-body'),()=>window.currentData.league)
        backfillRecords(fb).then(()=>{ renderLeague(window.currentData.league) }).catch(()=>{})
        return
      }
    }
    window.currentData=data
    renderLeague(data.league)
    attachSort(document.querySelector('#league-body'),()=>window.currentData.league)
  }
  return {renderDivision,renderPreseasonLeague}
})()

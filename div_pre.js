window.DivPre=(function(){
  async function renderDivision(season,type){
    console.log('DivPre: renderDivision start',{season,type})
    const container=document.querySelector('#divisions')
    console.log('DivPre: container found',!!container)
    if(!container) return
    container.innerHTML=''
    const divs=await fetchDivisionStandings(season,type)
    console.log('DivPre: fetched division groups',divs?Object.keys(divs).length:0)
    if(divs && Object.keys(divs).length){
      renderDivisions(divs)
      console.log('DivPre: rendered fetched division groups')
      return
    }
    const dataResp=await fetchStandings(season,type)
    console.log('DivPre: standings resp present',!!dataResp)
    const normalized=dataResp?normalize(dataResp):null
    console.log('DivPre: normalized divisions keys',normalized?Object.keys(normalized.divisions||{}):[])
    if(normalized && Object.keys(normalized.divisions||{}).length){
      window.currentData=normalized
      renderDivisions(normalized.divisions)
      console.log('DivPre: rendered normalized divisions')
      return
    }
    let base=(window.currentData?.league)||[]
    console.log('DivPre: base from currentData size',base.length)
    if(!base.length){
      const fb=await buildStandingsFallback()
      if(fb) base=fb.league||[]
      console.log('DivPre: fallback base size',base.length)
    }
    if(!base.length) return
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
    const computedDivs=(()=>{
      const out={Atlantic:[],Central:[],Southeast:[],Northwest:[],Pacific:[],Southwest:[]}
      const DIV_MAP={
        East:{Atlantic:['NY','NYK','TOR','BOS','PHI','BKN'],Central:['DET','CLE','MIL','CHI','IND'],Southeast:['ORL','MIA','ATL','CHA','WSH','WAS']},
        West:{Northwest:['OKC','DEN','MIN','POR','UTA','UTAH'],Pacific:['LAL','PHX','GS','GSW','SAC','LAC'],Southwest:['SAS','SA','HOU','MEM','DAL','NO','NOP','NOLA']}
      }
      const sets={...DIV_MAP.East,...DIV_MAP.West}
      base.forEach(t=>{
        const ab=String(t.short||'').toUpperCase()
        Object.entries(sets).forEach(([name,set])=>{
          if(set.includes(ab)) out[name].push(t)
        })
      })
      Object.keys(out).forEach(k=>out[k]=rank(out[k]))
      console.log('DivPre: computedDivs sizes',{
        Atlantic:out.Atlantic.length,Central:out.Central.length,Southeast:out.Southeast.length,
        Northwest:out.Northwest.length,Pacific:out.Pacific.length,Southwest:out.Southwest.length
      })
      return out
    })()
    const eastSection=document.createElement('div')
    eastSection.className='conference-block'
    const eastTitle=document.createElement('h2')
    eastTitle.textContent='Eastern Conference'
    eastSection.appendChild(eastTitle)
    eastOrder.forEach(d=>eastSection.appendChild(makeCard(d,computedDivs[d])))
    const westSection=document.createElement('div')
    westSection.className='conference-block'
    const westTitle=document.createElement('h2')
    westTitle.textContent='Western Conference'
    westSection.appendChild(westTitle)
    westOrder.forEach(d=>westSection.appendChild(makeCard(d,computedDivs[d])))
    grid.appendChild(eastSection)
    grid.appendChild(westSection)
    container.appendChild(grid)
    console.log('DivPre: division grid rendered')
  }
  async function renderPreseasonLeague(season){
    console.log('DivPre: renderPreseasonLeague start',{season})
    const raw=await fetchStandings(season,'1')
    let data=null
    if(raw){
      data=normalize(raw)
      console.log('DivPre: preseason normalize league size',data.league?.length||0)
    }
    if(!data || !(data.league||[]).length){
      const fb=await buildStandingsFallback()
      if(fb){
        window.currentData=fb
        renderLeague(fb.league)
        attachSort(document.querySelector('#league-body'),()=>window.currentData.league)
        backfillRecords(fb).then(()=>{ renderLeague(window.currentData.league) }).catch(()=>{})
        console.log('DivPre: preseason rendered from fallback league size',fb.league?.length||0)
        return
      }
    }
    window.currentData=data
    renderLeague(data.league)
    attachSort(document.querySelector('#league-body'),()=>window.currentData.league)
    console.log('DivPre: preseason rendered league size',data.league?.length||0)
  }
  return {renderDivision,renderPreseasonLeague}
})()

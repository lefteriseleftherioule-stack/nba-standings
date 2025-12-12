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
    renderDivisions(data.divisions)
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

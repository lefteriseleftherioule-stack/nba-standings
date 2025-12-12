window.DivPre=(function(){
  async function renderDivision(season,type){
    const raw=await fetchStandings(season,type)
    if(!raw) return
    const data=normalize(raw)
    window.currentData=data
    renderDivisions(data.divisions)
  }
  async function renderPreseasonLeague(season){
    const raw=await fetchStandings(season,'1')
    if(!raw) return
    const data=normalize(raw)
    window.currentData=data
    renderLeague(data.league)
    attachSort(document.querySelector('#league-body'),()=>window.currentData.league)
  }
  return {renderDivision,renderPreseasonLeague}
})()

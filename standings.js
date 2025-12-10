const state={season:'2025',type:'2',scope:'conference'}
const $=s=>document.querySelector(s)
const $$=s=>Array.from(document.querySelectorAll(s))
const statusEl=$('#status')
$$('.view-btn').forEach(b=>b.addEventListener('click',e=>{
  $$('.view-btn').forEach(x=>x.classList.remove('active'))
  e.currentTarget.classList.add('active')
  state.scope=e.currentTarget.dataset.scope
  renderScope()
}))
$$('.season-btn').forEach(b=>b.addEventListener('click',e=>{
  $$('.season-btn').forEach(x=>x.classList.remove('active'))
  e.currentTarget.classList.add('active')
  state.season=e.currentTarget.dataset.season
  load()
}))
$$('.type-btn').forEach(b=>b.addEventListener('click',e=>{
  $$('.type-btn').forEach(x=>x.classList.remove('active'))
  e.currentTarget.classList.add('active')
  state.type=e.currentTarget.dataset.type
  load()
}))

async function load(){
  status('Loading…')
  const data=await fetchStandings(state.season,state.type)
  if(!data){status('Failed to load standings');return}
  const normalized=normalize(data)
  render(normalized)
  status('Updated')
}

function status(t){statusEl.textContent=t}

async function fetchStandings(season,type){
  const urls=[
    `https://site.web.api.espn.com/apis/v2/sports/basketball/nba/standings?season=${season}&seasontype=${type}&region=us&lang=en&contentorigin=espn`,
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/standings?region=us&lang=en`
  ]
  for(const u of urls){
    try{
      const r=await fetch(u,{cache:'no-store'})
      if(!r.ok)continue
      const j=await r.json()
      return j
    }catch(e){}
  }
  return null
}

function normalize(raw){
  if(raw.children){
    const groups=raw.children.map(g=>({
      name:g.name||g.uid||'',
      teams:(g.standings?.entries||[]).length
        ? (g.standings.entries||[]).map(e=>mapEntry(e))
        : (g.children||[]).flatMap(c=> (c.standings?.entries||[]).map(e=>mapEntry(e,c.name)))
    }))
    return groupByScope(groups)
  }
  if(raw.children && raw.standings){
    const groups=raw.children.map(g=>({name:g.name,teams:(g.standings?.entries||[]).map(mapEntry)}))
    return groupByScope(groups)
  }
  if(raw.standings){
    const groups=(raw.children||raw.standings.groups||[]).map(g=>({
      name:g.name||g.abbreviation||'',
      teams:(g.standings?.entries||g.entries||[]).map(mapEntry)
    }))
    return groupByScope(groups)
  }
  const flat=(raw.entries||raw.teams||[]).map(mapEntry)
  return {conference:{East:flat.filter(t=>t.conference==='East'),West:flat.filter(t=>t.conference==='West')},league:flat,divisions:groupDivisions(flat)}
}

function mapEntry(e,divisionName){
  const team=e.team||e
  const stats=e.stats||e.statsItems||e.record||[]
  const records=e.records||[]
  const sv=(arr,...names)=>{
    if(!Array.isArray(arr)) return undefined
    for(const n of names){
      const f=arr.find(x=>x.name===n||x.type===n||x.abbreviation===n)
      if(f) return f.value??f.displayValue
    }
    return undefined
  }
  const rec=(n)=>Array.isArray(records)?records.find(r=>r.name===n):undefined
  const wins=(rec('overall')?.wins)!=null?parseInt(rec('overall').wins):parseInt(sv(stats,'wins'))||0
  const losses=(rec('overall')?.losses)!=null?parseInt(rec('overall').losses):parseInt(sv(stats,'losses'))||0
  let pct=sv(stats,'winPercent','percentage')
  pct=typeof pct==='number'?pct:(wins+losses?wins/(wins+losses):0)
  const hw=(rec('home')?.wins)!=null?parseInt(rec('home').wins):parseInt(sv(stats,'homeWins'))
  const hl=(rec('home')?.losses)!=null?parseInt(rec('home').losses):parseInt(sv(stats,'homeLosses'))
  const rw=(rec('road')?.wins)!=null?parseInt(rec('road').wins):parseInt(sv(stats,'roadWins')||sv(stats,'awayWins'))
  const rl=(rec('road')?.losses)!=null?parseInt(rec('road').losses):parseInt(sv(stats,'roadLosses')||sv(stats,'awayLosses'))
  const cw=(rec('conference')?.wins)!=null?parseInt(rec('conference').wins):parseInt(sv(stats,'conferenceWins'))
  const cl=(rec('conference')?.losses)!=null?parseInt(rec('conference').losses):parseInt(sv(stats,'conferenceLosses'))
  const dw=(rec('division')?.wins)!=null?parseInt(rec('division').wins):parseInt(sv(stats,'divisionWins'))
  const dl=(rec('division')?.losses)!=null?parseInt(rec('division').losses):parseInt(sv(stats,'divisionLosses'))
  const lts=rec('lastTen')?.summary
  const ltw=(rec('lastTen')?.wins)!=null?parseInt(rec('lastTen').wins):parseInt(sv(stats,'lastTenWins'))
  const ltl=(rec('lastTen')?.losses)!=null?parseInt(rec('lastTen').losses):parseInt(sv(stats,'lastTenLosses'))
  const streak=sv(stats,'streak')||rec('streak')?.summary
  const ppg=parseFloat(sv(stats,'pointsPerGame','avgPointsFor','pointsFor','ppg'))
  const opppg=parseFloat(sv(stats,'opponentPointsPerGame','avgPointsAgainst','pointsAgainst','oppg'))
  return {
    id:team.id||team.uid||'',
    name:team.displayName||team.name,
    short:team.abbreviation||'',
    logo:(team.logos?.[0]?.href)||team.logo||'',
    conference:team.conference?.name||team.conferenceName||team.groups?.[0]?.name||'',
    division:divisionName||team.division?.name||team.divisionName||'',
    wins,
    losses,
    pct,
    home:fmtWL(hw,hl) || rec('home')?.summary || '-',
    away:fmtWL(rw,rl) || rec('road')?.summary || '-',
    conf:fmtWL(cw,cl) || rec('conference')?.summary || '-',
    div:fmtWL(dw,dl) || rec('division')?.summary || '-',
    ppg:isNaN(ppg)?null:round(ppg,1),
    opppg:isNaN(opppg)?null:round(opppg,1),
    diff:(isNaN(ppg)||isNaN(opppg))?null:round(ppg-opppg,1),
    streak:typeof streak==='string'?streak:(streak?.displayValue||rec('streak')?.summary||''),
    lastTen:lts||fmtWL(ltw,ltl)
  }
}

function groupByScope(groups){
  const east=(groups.find(g=>/east/i.test(g.name))?.teams)||[]
  const west=(groups.find(g=>/west/i.test(g.name))?.teams)||[]
  const league=[...east,...west]
  return {conference:{East:rank(east),West:rank(west)},league:rank(league),divisions:groupDivisions(league)}
}

function groupDivisions(list){
  const map={}
  list.forEach(t=>{if(!map[t.division])map[t.division]=[];map[t.division].push(t)})
  Object.keys(map).forEach(k=>map[k]=rank(map[k]))
  return map
}

function rank(list){
  const s=[...list].sort((a,b)=>b.pct-a.pct||b.wins-a.wins||a.losses-b.losses||a.name.localeCompare(b.name))
  s.forEach((t,i)=>t.rank=i+1)
  const lead=s[0]
  s.forEach(t=>t.gb=lead?(Math.abs((lead.wins-t.wins)+(t.losses-lead.losses))/2):0)
  return s
}

function round(n,d){const p=10**d;return Math.round(n*p)/p}
function fmtWL(w,l){
  if(!Number.isFinite(w) || !Number.isFinite(l)) return '-'
  return `${w}-${l}`
}

function render(data){
  renderConference(data.conference)
  renderLeague(data.league)
  renderDivisions(data.divisions)
  renderScope()
}

function renderScope(){
  $$('.view').forEach(v=>v.classList.remove('active'))
  if(state.scope==='conference')$('#conference-view').classList.add('active')
  if(state.scope==='league')$('#league-view').classList.add('active')
  if(state.scope==='division')$('#division-view').classList.add('active')
}

function renderConference(conf){
  fillTable($('#east-body'),conf.East)
  fillTable($('#west-body'),conf.West)
}

function renderLeague(list){
  fillTable($('#league-body'),list)
}

function renderDivisions(divs){
  const container=$('#divisions')
  container.innerHTML=''
  const grid=document.createElement('div')
  grid.className='division-grid'
  Object.entries(divs).forEach(([name,teams])=>{
    const card=document.createElement('div')
    card.className='division-card'
    const h=document.createElement('h3')
    h.textContent=name||'Division'
    const wrap=document.createElement('div')
    wrap.className='table-wrap'
    const table=document.createElement('table')
    table.className='standings'
    table.innerHTML=document.querySelector('table.standings thead').outerHTML
    const tbody=document.createElement('tbody')
    fillTable(tbody,teams)
    table.appendChild(tbody)
    wrap.appendChild(table)
    card.appendChild(h)
    card.appendChild(wrap)
    grid.appendChild(card)
  })
  container.appendChild(grid)
}

function fillTable(tbody,teams){
  tbody.innerHTML=''
  teams.forEach(t=>{
    const tr=document.createElement('tr')
    const fallbackLogo=t.short?`https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/${t.short.toLowerCase()}.png`:''
    const logoSrc=t.logo||fallbackLogo
    const logo=logoSrc?`<img class="team-logo" src="${logoSrc}" alt="">`:''
    const diffClass=t.diff==null?'':(t.diff>=0?'pos-good':'pos-bad')
    tr.innerHTML=`
      <td class="rank">${t.rank}</td>
      <td class="team"><div class="team-cell">${logo}<span>${t.name}</span></div></td>
      <td>${t.wins}</td>
      <td>${t.losses}</td>
      <td>${round(t.pct,3).toFixed(3)}</td>
      <td>${t.gb?round(t.gb,1):'-'}</td>
      <td>${t.home||'-'}</td>
      <td>${t.away||'-'}</td>
      <td>${t.div||'-'}</td>
      <td>${t.conf||'-'}</td>
      <td>${t.ppg!=null?t.ppg:'-'}</td>
      <td>${t.opppg!=null?t.opppg:'-'}</td>
      <td class="${diffClass}">${t.diff!=null?(t.diff>0?`+${t.diff}`:t.diff):'-'}</td>
      <td>${t.streak??'-'}</td>
      <td>${t.lastTen??'-'}</td>
    `
    tbody.appendChild(tr)
  })
}

load()

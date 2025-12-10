const state={season:'2025',type:'2',scope:'conference',tab:'standings'}
const $=s=>document.querySelector(s)
const $$=s=>Array.from(document.querySelectorAll(s))
const statusEl=$('#status')
const seasonSelect=$('#season-select')
const typeSelect=$('#season-type-select')
seasonSelect.addEventListener('change',e=>{state.season=e.target.value;load()})
typeSelect.addEventListener('change',e=>{state.type=e.target.value;load()})
$$('.scope').forEach(b=>b.addEventListener('click',e=>{$$('.scope').forEach(x=>x.classList.remove('active'));e.currentTarget.classList.add('active');state.scope=e.currentTarget.dataset.scope;renderScope()}))
$$('.tab').forEach(b=>b.addEventListener('click',e=>{$$('.tab').forEach(x=>x.classList.remove('active'));e.currentTarget.classList.add('active');state.tab=e.currentTarget.dataset.view}))

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
    `https://site.web.api.espn.com/apis/v2/sports/basketball/nba/standings?season=${season}&seasontype=${type}`,
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/standings`
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
      teams:(g.standings?.entries||g.children?.flatMap(c=>c.standings?.entries)||[]).map(e=>mapEntry(e))
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

function mapEntry(e){
  const team=e.team||e
  const recs=e.stats||e.records||e.statsItems||e.record||{}
  const get=(a,b)=>{
    if(Array.isArray(a)){
      const f=a.find(x=>x.name===b||x.type===b||x.abbreviation===b)
      return f?.value??f?.displayValue
    }
    return a?.[b]
  }
  const overall=e.records?.find(r=>r.name==='overall')||e.stats?.find(s=>s.name==='overall')
  const home=e.records?.find(r=>r.name==='home')||e.stats?.find(s=>s.name==='home')
  const road=e.records?.find(r=>r.name==='road')||e.stats?.find(s=>s.name==='away')
  const conf=e.records?.find(r=>r.name==='conference')||e.stats?.find(s=>s.name==='conference')
  const div=e.records?.find(r=>r.name==='division')||e.stats?.find(s=>s.name==='division')
  const lastTen=e.records?.find(r=>r.name==='lastTen')||e.stats?.find(s=>s.name==='lastTen')
  const streak=e.records?.find(r=>r.name==='streak')||e.stats?.find(s=>s.name==='streak')
  const wins=parseInt(get(overall,'wins'))||0
  const losses=parseInt(get(overall,'losses'))||0
  const pct=wins+losses?wins/(wins+losses):0
  const pf=parseFloat(get(recs,'pointsFor'))||parseFloat(get(e.stats,'pointsFor'))||NaN
  const pa=parseFloat(get(recs,'pointsAgainst'))||parseFloat(get(e.stats,'pointsAgainst'))||NaN
  const ppg=isNaN(pf)?NaN:pf
  const opppg=isNaN(pa)?NaN:pa
  return {
    id:team.id||team.uid||'',
    name:team.displayName||team.name,
    short:team.abbreviation||'',
    logo:(team.logos?.[0]?.href)||team.logo||'',
    conference:team.conference?.name||team.conferenceName||team.groups?.[0]?.name||'',
    division:team.division?.name||team.divisionName||'',
    wins,
    losses,
    pct,
    home:get(home,'summary')||fmtWL(get(home,'wins'),get(home,'losses')),
    away:get(road,'summary')||fmtWL(get(road,'wins'),get(road,'losses')),
    conf:get(conf,'summary')||fmtWL(get(conf,'wins'),get(conf,'losses')),
    div:get(div,'summary')||fmtWL(get(div,'wins'),get(div,'losses')),
    ppg:isNaN(ppg)?null:round(ppg,1),
    opppg:isNaN(opppg)?null:round(opppg,1),
    diff:(isNaN(ppg)||isNaN(opppg))?null:round(ppg-opppg,1),
    streak:streak?.summary||streak?.displayValue||'',
    lastTen:lastTen?.summary||fmtWL(get(lastTen,'wins'),get(lastTen,'losses'))
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
function fmtWL(w,l){if(w==null||l==null)return '';return `${w}-${l}`}

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
    const logo=t.logo?`<img class="team-logo" src="${t.logo}" alt="">`:''
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
      <td>${t.streak||'-'}</td>
      <td>${t.lastTen||'-'}</td>
    `
    tbody.appendChild(tr)
  })
}

load()

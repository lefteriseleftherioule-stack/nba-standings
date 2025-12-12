const state={season:'2025',type:'2',scope:'conference'}
const teamIndex=new Map()
const teamDetailCache=new Map()
const $=s=>document.querySelector(s)
const $$=s=>Array.from(document.querySelectorAll(s))
const statusEl=$('#status')
$$('.view-btn').forEach(b=>b.addEventListener('click',e=>{
  $$('.view-btn').forEach(x=>x.classList.remove('active'))
  e.currentTarget.classList.add('active')
  state.scope=e.currentTarget.dataset.scope
  renderScope()
}))
const seasonSel=$('#season-select')
if(seasonSel){
  seasonSel.addEventListener('change',e=>{
    state.season=e.target.value
    load()
  })
}
$$('.type-btn').forEach(b=>b.addEventListener('click',e=>{
  $$('.type-btn').forEach(x=>x.classList.remove('active'))
  e.currentTarget.classList.add('active')
  state.type=e.currentTarget.dataset.type
  load()
}))

async function load(){
  status('Loading…')
  const embed=document.getElementById('embed-fallback')
  const data=await fetchStandings(state.season,state.type)
  if(!data){
    const fb=await buildStandingsFallback()
    if(fb && (fb.league?.length||0)>0){
      render(fb)
      status('Updating splits…')
      backfillRecords(fb).then(()=>{ render(fb); status('Updated') }).catch(()=>status('Updated'))
      if(embed) embed.style.display='none'
      return
    }
    const sample=sampleData()
    if(sample){
      render(sample)
      status('Updating splits…')
      backfillRecords(sample).then(()=>{ render(sample); status('Showing sample data') }).catch(()=>status('Showing sample data'))
      if(embed) embed.style.display='none'
      return
    }
    status('Failed to load standings');
    return
  }
  const fb=await buildStandingsFallback()
  if(fb && (fb.league?.length||0)>0){
    render(fb)
    status('Updating splits…')
    backfillRecords(fb).then(()=>{ render(fb); status('Updated') }).catch(()=>status('Updated'))
    if(embed) embed.style.display='none'
    return
  }
  const normalized=normalize(data)
  render(normalized)
  status('Updating splits…')
  backfillRecords(normalized).then(()=>{ render(normalized); status('Updated') }).catch(()=>status('Updated'))
  if(embed) embed.style.display='none'
}

function status(t){statusEl.textContent=t}

function parseWL(s){
  if(typeof s!=='string') return [NaN,NaN]
  const m=s.match(/(\d+)\s*-\s*(\d+)/)
  if(!m) return [NaN,NaN]
  return [parseInt(m[1]),parseInt(m[2])]
}

async function fetchStandings(season,type){
  const urls=[
    `https://site.web.api.espn.com/apis/v2/sports/basketball/nba/standings?season=${season}&seasontype=${type}&region=us&lang=en&contentorigin=espn`,
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/standings?season=${season}&seasontype=${type}&region=us&lang=en`
  ]
  for(const u of urls){
    try{
      const r=await fetch(u,{cache:'no-store',mode:'cors',headers:{'accept':'application/json'}})
      if(!r.ok)continue
      const j=await r.json()
      if(j) return j
    }catch(e){continue}
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
  const statsRaw=e.stats||e.statsItems||e.statistics||null
  const stats=Array.isArray(statsRaw)?statsRaw:[]
  const records=Array.isArray(e.records)?e.records:(Array.isArray(e.record?.items)?e.record.items:[])
  const find=(arr,...names)=>{
    if(!Array.isArray(arr)) return undefined
    const norm=names.map(n=>String(n).toLowerCase())
    return arr.find(x=>{
      const nm=String(x.name||'').toLowerCase()
      const tp=String(x.type||'').toLowerCase()
      const ab=String(x.abbreviation||'').toLowerCase()
      return norm.some(n=>nm===n||tp===n||ab===n)
    })
  }
  const sv=(arr,...names)=>{
    if(!Array.isArray(arr)) return undefined
    const norm=names.map(n=>String(n).toLowerCase())
    for(const x of arr){
      const nm=String(x.name||'').toLowerCase()
      const tp=String(x.type||'').toLowerCase()
      const ab=String(x.abbreviation||'').toLowerCase()
      if(norm.some(n=>nm===n||tp===n||ab===n)) return x.value??x.displayValue
    }
    return undefined
  }
  const rec=(...names)=>{
    if(!Array.isArray(records)) return undefined
    const norm=names.map(n=>String(n).toLowerCase())
    return records.find(r=>{
      const nm=String(r.name||'').toLowerCase()
      const tp=String(r.type||'').toLowerCase()
      const ab=String(r.abbreviation||'').toLowerCase()
      return norm.some(n=>nm===n||tp===n||ab===n)
    })
  }
  const overallRec=rec('overall','total','overallRecord')
  let wins=(overallRec?.wins)!=null?parseInt(overallRec.wins):parseInt(sv(stats,'wins','totalWins','overallWins'))
  let losses=(overallRec?.losses)!=null?parseInt(overallRec.losses):parseInt(sv(stats,'losses','totalLosses','overallLosses'))
  if(!Number.isFinite(wins) || !Number.isFinite(losses)){
    const [pw,pl]=parseWL(overallRec?.summary||sv(stats,'overallRecord','record'))
    if(Number.isFinite(pw)) wins=pw
    if(Number.isFinite(pl)) losses=pl
  }
  wins=wins||0; losses=losses||0
  let pct=sv(stats,'winPercent','winPct','pct','percentage')
  pct=typeof pct==='number'?pct:(typeof pct==='string'?parseFloat(pct):(wins+losses?wins/(wins+losses):0))
  const hw=(rec('home')?.wins)!=null?parseInt(rec('home').wins):parseInt(sv(stats,'homeWins'))
  const hl=(rec('home')?.losses)!=null?parseInt(rec('home').losses):parseInt(sv(stats,'homeLosses'))
  const rw=(rec('road')?.wins)!=null?parseInt(rec('road').wins):parseInt(sv(stats,'roadWins')||sv(stats,'awayWins'))
  const rl=(rec('road')?.losses)!=null?parseInt(rec('road').losses):parseInt(sv(stats,'roadLosses')||sv(stats,'awayLosses'))
  const cw=(rec('conference')?.wins)!=null?parseInt(rec('conference').wins):parseInt(sv(stats,'conferenceWins'))
  const cl=(rec('conference')?.losses)!=null?parseInt(rec('conference').losses):parseInt(sv(stats,'conferenceLosses'))
  const dw=(rec('division')?.wins)!=null?parseInt(rec('division').wins):parseInt(sv(stats,'divisionWins'))
  const dl=(rec('division')?.losses)!=null?parseInt(rec('division').losses):parseInt(sv(stats,'divisionLosses'))
  const lastTenStat=find(stats,'lastTen','last10','L10')
  const lts=rec('lastTen','last10','L10','lastTenRecord')?.summary
  let ltw=(rec('lastTen','last10','L10','lastTenRecord')?.wins)!=null?parseInt(rec('lastTen','last10','L10','lastTenRecord').wins):parseInt(sv(stats,'lastTenWins','last10wins'))
  let ltl=(rec('lastTen','last10','L10','lastTenRecord')?.losses)!=null?parseInt(rec('lastTen','last10','L10','lastTenRecord').losses):parseInt(sv(stats,'lastTenLosses','last10losses'))
  if(!Number.isFinite(ltw) || !Number.isFinite(ltl)){
    const [pw,pl]=parseWL((lastTenStat?.summary||lastTenStat?.displayValue||lts))
    if(Number.isFinite(pw)) ltw=pw
    if(Number.isFinite(pl)) ltl=pl
  }
  const streakStat=find(stats,'streak')
  const streak=(typeof streakStat?.displayValue==='string'&&streakStat.displayValue)||rec('streak')?.summary||undefined
  const ppg=parseFloat(sv(stats,'pointsPerGame','avgPointsFor','pointsFor','ppg','pointsForAverage','pointsScoredPerGame'))
  const opppg=parseFloat(sv(stats,'opponentPointsPerGame','avgPointsAgainst','pointsAgainst','oppg','pointsAgainstAverage','pointsAllowedPerGame'))
  const homeStat=find(stats,'home')
  const awayStat=find(stats,'away','road')
  const confStat=find(stats,'conference','conferenceRecord','vsConference','vsConf','CONF')
  const divStat=find(stats,'division','divisionRecord','vsDivision','vsDiv','DIV')
  
  return {
    id:team.id||team.uid||'',
    name:team.displayName||team.name,
    short:team.abbreviation||'',
    logo:(team.logos?.[0]?.href)||team.logo||'',
    conference:team.conference?.name||team.conferenceName||team.groups?.[0]?.name||extractConfDiv(team).conference||'',
    division:divisionName||team.division?.name||team.divisionName||extractConfDiv(team).division||'',
    wins,
    losses,
    pct,
    home:homeStat?.summary || fmtWL(hw,hl) || rec('home')?.summary || '-',
    away:awayStat?.summary || fmtWL(rw,rl) || rec('road')?.summary || '-',
    conf:(confStat?.summary||confStat?.displayValue)|| fmtWL(cw,cl) || (rec('conference','conf','conferenceRecord','vsConference','vsConf','CONF')?.summary||rec('conference','conf','conferenceRecord','vsConference','vsConf','CONF')?.displayValue) || '-',
    div:(divStat?.summary||divStat?.displayValue) || fmtWL(dw,dl) || (rec('division','div','divisionRecord','vsDivision','vsDiv','DIV')?.summary||rec('division','div','divisionRecord','vsDivision','vsDiv','DIV')?.displayValue) || '-',
    ppg:isNaN(ppg)?null:round(ppg,1),
    opppg:isNaN(opppg)?null:round(opppg,1),
    diff:(isNaN(ppg)||isNaN(opppg))?null:round(ppg-opppg,1),
    streak:streak||'',
    lastTen:(lastTenStat?.summary||lastTenStat?.displayValue) || (Number.isFinite(ltw)&&Number.isFinite(ltl)?fmtWL(ltw,ltl):undefined) || '-'
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
  list.forEach(t=>{if(!t.division) return; if(!map[t.division])map[t.division]=[]; map[t.division].push(t)})
  Object.keys(map).forEach(k=>map[k]=rank(map[k]))
  return map
}

function rank(list){
  const s=[...list].sort((a,b)=>{
    const ap=(typeof a.pct==='number')?a.pct:(a.wins+a.losses?a.wins/(a.losses+a.wins):0)
    const bp=(typeof b.pct==='number')?b.pct:(b.wins+b.losses?b.wins/(b.losses+b.wins):0)
    return bp-ap || b.wins-a.wins || a.losses-b.losses || a.name.localeCompare(b.name)
  })
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
  window.currentData=data
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
  fillTable($('#east-body'),conf.East,{showOrdinal:false})
  attachSort($('#east-body'),()=>window.currentData.conference.East)
  fillTable($('#west-body'),conf.West,{showOrdinal:false})
  attachSort($('#west-body'),()=>window.currentData.conference.West)
}

function renderLeague(list){
  fillTable($('#league-body'),list,{showOrdinal:false})
  attachSort($('#league-body'),()=>window.currentData.league)
}

function renderDivisions(divs){
  const container=$('#divisions')
  container.innerHTML=''
  const mkTable=()=>{
    const table=document.createElement('table')
    table.className='standings'
    const thead=document.createElement('thead')
    thead.innerHTML=`
      <tr>
        <th></th>
        <th>W</th>
        <th>L</th>
        <th>PCT</th>
        <th>GB</th>
        <th>HOME</th>
        <th>AWAY</th>
        <th>DIV</th>
        <th>CONF</th>
        <th>PPG</th>
        <th>OPP PPG</th>
        <th>DIFF</th>
        <th>STRK</th>
        <th>L10</th>
      </tr>`
    table.appendChild(thead)
    return table
  }
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
  const eastOrder=['Atlantic','Central','Southeast']
  const westOrder=['Northwest','Pacific','Southwest']
  const byDiv=(name,conf)=>{
    const grouped=(window.currentData?.divisions?.[name])||[]
    if(grouped.length){
      return rank(grouped.filter(t=>String(t.conference||'').toLowerCase()===conf.toLowerCase()))
    }
    const base=(conf==='East'?window.currentData?.conference?.East:window.currentData?.conference?.West)||[]
    const out=base.filter(t=>{
      const meta=teamIndex.get(String(t.id))||{}
      const divName=t.division||meta.division||''
      return String(divName).toLowerCase()===name.toLowerCase()
    })
    return rank(out)
  }
  const grid=document.createElement('div')
  grid.className='division-grid'
  const eastSection=document.createElement('div')
  eastSection.className='conference-block'
  const eastTitle=document.createElement('h2')
  eastTitle.textContent='Eastern Conference'
  eastSection.appendChild(eastTitle)
  eastOrder.forEach(d=>eastSection.appendChild(makeCard(d,byDiv(d,'East'))))
  const westSection=document.createElement('div')
  westSection.className='conference-block'
  const westTitle=document.createElement('h2')
  westTitle.textContent='Western Conference'
  westSection.appendChild(westTitle)
  westOrder.forEach(d=>westSection.appendChild(makeCard(d,byDiv(d,'West'))))
  grid.appendChild(eastSection)
  grid.appendChild(westSection)
  container.appendChild(grid)
}

function fillTable(tbody,teams,opts={}){
  const showOrdinal=!!opts.showOrdinal
  tbody.innerHTML=''
  const list=Array.isArray(teams)?teams:[]
  list.forEach(t=>{
    const tr=document.createElement('tr')
    const fallbackLogo=t.short?`https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/${t.short.toLowerCase()}.png`:''
    const logoSrc=t.logo||fallbackLogo
    const logo=logoSrc?`<img class="team-logo" src="${logoSrc}" alt="">`:''
    const diffClass=t.diff==null?'':(t.diff>=0?'pos-good':'pos-bad')
    const gbDisplay=(t.gb===0)?'-':round(t.gb,1)
    const ord='' // remove ordinal numbers in Team cell
    tr.innerHTML=`
      <td class="team"><div class="team-cell">${logo}<span>${ord}${t.name}</span></div></td>
      <td>${t.wins}</td>
      <td>${t.losses}</td>
      <td>${round(t.pct,3).toFixed(3)}</td>
      <td>${gbDisplay}</td>
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

function attachSort(tbody,getList){
  const table=tbody.closest('table')
  const ths=table.querySelectorAll('thead th[data-sort]')
  ths.forEach(th=>{
    th.style.cursor='pointer'
    th.addEventListener('click',()=>{
      const key=th.dataset.sort
      const dir=th.dataset.dir==='asc'?'desc':'asc'
      ths.forEach(x=>{ if(x!==th) x.dataset.dir='' })
      th.dataset.dir=dir
      const list=[...getList()]
      const cmp=makeComparator(key,dir)
      list.sort(cmp)
      fillTable(tbody,list,{showOrdinal:false})
    })
  })
}

function recordPct(s){
  if(typeof s!=='string') return NaN
  const m=s.match(/(\d+)\s*-\s*(\d+)/)
  if(!m) return NaN
  const w=parseInt(m[1]),l=parseInt(m[2])
  if(!Number.isFinite(w)||!Number.isFinite(l)||w+l===0) return NaN
  return w/(w+l)
}

function streakVal(s){
  if(typeof s!=='string') return 0
  const m=s.match(/([WL])(\d+)/i)
  if(!m) return 0
  const v=parseInt(m[2])
  return m[1].toUpperCase()==='W'?v:-v
}

function makeComparator(key,dir){
  const d=dir==='asc'?1:-1
  const num=(a)=>Number.isFinite(a)?a:(typeof a==='string'?parseFloat(a):NaN)
  return (a,b)=>{
    let av,bv
    switch(key){
      case 'wins': av=a.wins; bv=b.wins; break
      case 'losses': av=a.losses; bv=b.losses; break
      case 'pct': av=(typeof a.pct==='number')?a.pct:(a.wins+a.losses?a.wins/(a.wins+a.losses):0); bv=(typeof b.pct==='number')?b.pct:(b.wins+b.losses?b.wins/(b.wins+b.losses):0); break
      case 'gb': av=a.gb; bv=b.gb; break
      case 'home': av=recordPct(a.home); bv=recordPct(b.home); break
      case 'away': av=recordPct(a.away); bv=recordPct(b.away); break
      case 'div': av=recordPct(a.div); bv=recordPct(b.div); break
      case 'conf': av=recordPct(a.conf); bv=recordPct(b.conf); break
      case 'ppg': av=a.ppg; bv=b.ppg; break
      case 'opppg': av=b.opppg; bv=a.opppg; break // sorting opppg higher->lower when desc; keep comparator consistent by flipping
      case 'diff': av=a.diff; bv=b.diff; break
      case 'streak': av=streakVal(a.streak); bv=streakVal(b.streak); break
      case 'lastTen': av=recordPct(a.lastTen); bv=recordPct(b.lastTen); break
      default: av=a.name; bv=b.name
    }
    if(typeof av==='string' && typeof bv==='string') return d * av.localeCompare(bv)
    av=num(av); bv=num(bv)
    if(!Number.isFinite(av) && Number.isFinite(bv)) return 1
    if(Number.isFinite(av) && !Number.isFinite(bv)) return -1
    if(!Number.isFinite(av) && !Number.isFinite(bv)) return 0
    return d * (av-bv)
  }
}

async function backfillRecords(data){
  try{
    const all=data.league
    const idMap=new Map(all.map(t=>[String(t.id),t]))
    const queue=all.map(t=>()=>fetchCoreRecordAndApply(t,idMap))
    const limit=8
    let index=0
    const workers=Array.from({length:limit}).map(async()=>{
      while(index<queue.length){
        const fn=queue[index++]
        await fn()
      }
    })
    await Promise.all(workers)
    await backfillSchedule(data,idMap)
    const applyToArray=(arr)=>{
      arr.forEach((t,i)=>{
        const updated=idMap.get(String(t.id))
        if(updated){
          arr[i]={...t,
            wins: Number.isFinite(updated.wins)?updated.wins:t.wins,
            losses: Number.isFinite(updated.losses)?updated.losses:t.losses,
            pct: Number.isFinite(updated.pct)?updated.pct:t.pct,
            home:updated.home||t.home,
            away:updated.away||t.away,
            div:updated.div||t.div,
            conf:updated.conf||t.conf,
            lastTen:updated.lastTen||t.lastTen,
            streak:updated.streak||t.streak,
            ppg:updated.ppg??t.ppg,
            opppg:updated.opppg??t.opppg,
            diff:updated.diff??t.diff
          }
        }
      })
    }
    applyToArray(data.conference.East)
    applyToArray(data.conference.West)
    Object.keys(data.divisions).forEach(k=>applyToArray(data.divisions[k]))
    data.conference.East=rank(data.conference.East)
    data.conference.West=rank(data.conference.West)
    Object.keys(data.divisions).forEach(k=>data.divisions[k]=rank(data.divisions[k]))
    data.league=rank([...data.conference.East,...data.conference.West])
  }catch(e){/* ignore backfill errors */}
}

async function fetchCoreRecordAndApply(team,idMap){
  const base=`https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${state.season}/types/${state.type}/teams/${team.id}/record?lang=en&region=us`
  try{
    let details=[]
    let r=await fetch(base,{cache:'no-store'})
    if(r.ok){
      const j=await r.json()
      const items=j.items||[]
      details=await Promise.all(items.slice(0,16).map(async it=>{
        try{const rr=await fetch(`${it.href}?lang=en&region=us`,{cache:'no-store'});if(!rr.ok) return null;return await rr.json()}catch(e){return null}
      }))
      details=details.filter(Boolean)
    }
    if(!details.length){
      const alt=`https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/teams/${team.id}/record?season=${state.season}&type=${state.type}&lang=en&region=us`
      r=await fetch(alt,{cache:'no-store'})
      if(r.ok){
        const j=await r.json()
        const items=j.items||[]
        const ds=await Promise.all(items.slice(0,16).map(async it=>{
          try{const rr=await fetch(`${it.href}?lang=en&region=us`,{cache:'no-store'});if(!rr.ok) return null;return await rr.json()}catch(e){return null}
        }))
        details=ds.filter(Boolean)
      }
    }
    if(!details.length){
      const altWeb=`https://site.web.api.espn.com/apis/v2/sports/basketball/nba/teams/${team.id}?region=us&lang=en`
      r=await fetch(altWeb,{cache:'no-store'})
      if(r.ok){
        const j=await r.json()
        const items=j.record?.items||[]
        const ds=await Promise.all(items.slice(0,16).map(async it=>{
          try{const rr=await fetch(`${it.href}?lang=en&region=us`,{cache:'no-store'});if(!rr.ok) return null;return await rr.json()}catch(e){return null}
        }))
        details=ds.filter(Boolean)
      }
    }
    if(!details.length){
      const altSite=`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${team.id}`
      r=await fetch(altSite,{cache:'no-store'})
      if(r.ok){
        const j=await r.json()
        const items=j.record?.items||j.team?.record?.items||[]
        const ds=await Promise.all(items.slice(0,16).map(async it=>{
          try{const rr=await fetch(it.href,{cache:'no-store'});if(!rr.ok) return null;return await rr.json()}catch(e){return null}
        }))
        details=ds.filter(Boolean)
      }
    }
    if(!details.length) return
    const byName=(n)=>details.find(d=>d&&((d.type&&new RegExp(n,'i').test(d.type))||(d.name&&new RegExp(n,'i').test(d.name))))
    const getSummary=(d)=>{
      if(!d) return undefined
      if(typeof d.summary==='string') return d.summary
      if(typeof d.displayValue==='string') return d.displayValue
      if(Number.isFinite(d.wins)&&Number.isFinite(d.losses)) return `${d.wins}-${d.losses}`
      if((d.type&&/streak/i.test(d.type))||(d.name&&/streak/i.test(d.name))){
        if(typeof d.value==='number'){ return d.value>0?`W${d.value}`:`L${Math.abs(d.value)}` }
      }
      return undefined
    }
    const updated=idMap.get(String(team.id))||team
    const home=byName('home')
    const road=byName('road')||byName('away')
    const conf=byName('conference')
    const div=byName('division')
    const lastTen=byName('lastTen')
    const streak=byName('streak')
    updated.home=getSummary(home)||updated.home
    updated.away=getSummary(road)||updated.away
    updated.conf=getSummary(conf)||updated.conf
    updated.div=getSummary(div)||updated.div
    updated.lastTen=getSummary(lastTen)||updated.lastTen
    updated.streak=getSummary(streak)||updated.streak
    // keep ppg/opppg if already present
  }catch(e){return}
}

async function backfillSchedule(data,idMap){
  await ensureTeamIndex()
  const all=data.league
  const confById=new Map()
  data.conference.East.forEach(t=>confById.set(String(t.id),'East'))
  data.conference.West.forEach(t=>confById.set(String(t.id),'West'))
  const divById=new Map()
  Object.entries(data.divisions).forEach(([name,teams])=>{
    teams.forEach(t=>divById.set(String(t.id),name))
  })
  const queue=all.map(t=>()=>fetchScheduleAndApply(t,idMap,confById,divById))
  const limit=8
  let index=0
  const workers=Array.from({length:limit}).map(async()=>{
    while(index<queue.length){
      const fn=queue[index++]
      await fn()
    }
  })
  await Promise.all(workers)
}

async function fetchScheduleAndApply(team,idMap,confById,divById){
  const u=`https://site.web.api.espn.com/apis/v2/sports/basketball/nba/teams/${team.id}/schedule?season=${state.season}&seasontype=${state.type}&region=us&lang=en`
  try{
    const r=await fetch(u,{cache:'no-store'})
    if(!r.ok) return
    const j=await r.json()
    const events=j.events||j.items||[]
    if(!events.length) return
    let hw=0,hl=0,rw=0,rl=0,cw=0,cl=0,dw=0,dl=0
    let sumFor=0,sumAgainst=0,games=0
    const results=[]
    const selfId=String(team.id)
    const selfConf=confById.get(selfId) || (await getTeamMeta(selfId))?.conference || ''
    const selfDiv=divById.get(selfId) || (await getTeamMeta(selfId))?.division || ''
    for(const ev of events){
      const comp=(ev.competitions&&ev.competitions[0])||ev.competition||null
      const comps=(comp&&comp.competitors)||[]
      const me=comps.find(c=>String(c.team?.id||c.id)===String(team.id))
      const opp=comps.find(c=>String(c.team?.id||c.id)!==String(team.id))
      if(!me) continue
      const done=(comp?.status?.type?.completed===true)||(comp?.status?.type?.state==='post')
      if(!done) continue
      const myScoreRaw=(me?.score?.value ?? me?.score ?? me?.score?.displayValue ?? (me?.linescores?.[0]?.value))
      const oppScoreRaw=(opp?.score?.value ?? opp?.score ?? opp?.score?.displayValue ?? (opp?.linescores?.[0]?.value))
      const myScoreNum=Number.parseFloat(String(myScoreRaw||'0'))
      const oppScoreNum=Number.parseFloat(String(oppScoreRaw||'0'))
      const win=(me?.winner===true) || (Number.isFinite(myScoreNum) && Number.isFinite(oppScoreNum) ? myScoreNum>oppScoreNum : false)
      results.push(win)
      if(me.homeAway==='home'){ if(win) hw++; else hl++; }
      else { if(win) rw++; else rl++; }
      if(Number.isFinite(myScoreNum) && Number.isFinite(oppScoreNum)){
        sumFor+=myScoreNum
        sumAgainst+=oppScoreNum
        games++
      }
      const oppId=String(opp?.team?.id||opp?.id||'')
      if(oppId){
        const oppConf=confById.get(oppId) || (await getTeamMeta(oppId))?.conference || ''
        const oppDiv=divById.get(oppId) || (await getTeamMeta(oppId))?.division || ''
        if(selfConf && oppConf && oppConf===selfConf){ if(win) cw++; else cl++; }
        if(selfDiv && oppDiv && oppDiv===selfDiv){ if(win) dw++; else dl++; }
      }
    }
    const updated=idMap.get(String(team.id))||team
    const last=results.slice(-10)
    const ltw=last.filter(Boolean).length
    const ltl=last.length-ltw
    const streakLen=(()=>{ let s=0; for(let i=results.length-1;i>=0;i--){ if(results[i]) s++; else break } return s })()
    const losingLen=(()=>{ let s=0; for(let i=results.length-1;i>=0;i--){ if(!results[i]) s++; else break } return s })()
    const totalWins=results.filter(Boolean).length
    const totalLosses=results.length-totalWins
    updated.home=(Number.isFinite(hw)&&Number.isFinite(hl))?`${hw}-${hl}`:updated.home
    updated.away=(Number.isFinite(rw)&&Number.isFinite(rl))?`${rw}-${rl}`:updated.away
    updated.lastTen=(last.length?`${ltw}-${ltl}`:updated.lastTen)
    updated.conf=(Number.isFinite(cw)&&Number.isFinite(cl))?`${cw}-${cl}`:updated.conf
    updated.div=(Number.isFinite(dw)&&Number.isFinite(dl))?`${dw}-${dl}`:updated.div
    if(streakLen>0) updated.streak=`W${streakLen}`
    else if(losingLen>0) updated.streak=`L${losingLen}`
    if(Number.isFinite(totalWins) && Number.isFinite(totalLosses)){
      updated.wins=totalWins
      updated.losses=totalLosses
      updated.pct=(totalWins+totalLosses)?(totalWins/(totalWins+totalLosses)):updated.pct
    }
    if(games>0){
      const p=round(sumFor/games,1)
      const o=round(sumAgainst/games,1)
      updated.ppg=p
      updated.opppg=o
      updated.diff=round(p-o,1)
    }
  }catch(e){return}
}

async function ensureTeamIndex(){
  if(teamIndex.size>0) return
  const urls=[
    'https://site.web.api.espn.com/apis/v2/sports/basketball/nba/teams?region=us&lang=en',
    'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams'
  ]
  for(const u of urls){
    try{
      const r=await fetch(u,{cache:'no-store'})
      if(!r.ok) continue
      const j=await r.json()
      const list=(j.teams)|| (j.sports?.[0]?.leagues?.[0]?.teams)|| []
      list.forEach(t=>{
        const obj=t.team||t
        const id=String(obj.id)
        const meta=extractConfDiv(obj)
        if(id && (meta.conference||meta.division)) teamIndex.set(id,meta)
      })
      if(teamIndex.size>0) break
    }catch(e){continue}
  }
}

function extractConfDiv(team){
  const conference=(team.conference?.name)||(team.groups?.[0]?.name)||(team.group?.name)||''
  let division=''
  if(team.division?.name) division=team.division.name
  else if(Array.isArray(team.groups)){
    const d=team.groups.find(g=>/division/i.test(g.name||g.abbreviation||''))
    if(d) division=d.name
  }
  return {conference,division}
}

async function buildStandingsFallback(){
  try{
    const urls=[
      'https://site.web.api.espn.com/apis/v2/sports/basketball/nba/teams?region=us&lang=en',
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams'
    ]
    let list=[]
    for(const u of urls){
      try{
        const r=await fetch(u,{cache:'no-store'})
        if(!r.ok) continue
        const j=await r.json()
        const arr=(j.teams)|| (j.sports?.[0]?.leagues?.[0]?.teams)|| []
        list=arr.map(t=>t.team||t)
        if(list.length) break
      }catch(e){continue}
    }
    if(!list.length) return null
    const baseEntries=list.map(team=>{
      const meta=extractConfDiv(team)
      return {
        id:String(team.id||''),
        name:team.displayName||team.name||'',
        short:team.abbreviation||'',
        logo:(team.logos?.[0]?.href)||team.logo||'',
        conference:meta.conference,
        division:meta.division,
        wins:0,losses:0,pct:0,
        home:'-',away:'-',div:'-',conf:'-',ppg:null,opppg:null,diff:null,streak:'',lastTen:'-'
      }
    })
    const idMap=new Map(baseEntries.map(t=>[String(t.id),t]))
    const queue=baseEntries.map(t=>()=>fetchOverallForTeam(t.id,idMap))
    const limit=8
    let index=0
    const workers=Array.from({length:limit}).map(async()=>{
      while(index<queue.length){
        const fn=queue[index++]
        await fn()
      }
    })
    await Promise.all(workers)
    const east=rank(baseEntries.filter(t=>t.conference==='East'))
    const west=rank(baseEntries.filter(t=>t.conference==='West'))
    const league=rank([...east,...west])
    const divisions=groupDivisions(league)
    return {conference:{East:east,West:west},league,divisions}
  }catch(e){return null}
}

async function fetchOverallForTeam(teamId,idMap){
  const endpoints=[
    `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${state.season}/types/${state.type}/teams/${teamId}/record?lang=en&region=us`
  ]
  const parseWL=(s)=>{ if(typeof s!=='string') return [NaN,NaN]; const m=s.match(/(\d+)\s*-\s*(\d+)/); return m?[parseInt(m[1]),parseInt(m[2])]:[NaN,NaN] }
  try{
    let wins,losses
    for(const u of endpoints){
      try{
        const r=await fetch(u,{cache:'no-store'})
        if(!r.ok) continue
        const j=await r.json()
        // core: j.items -> fetch each, find overall
        if(Array.isArray(j.items) && j.items.length){
          const ds=await Promise.all(j.items.slice(0,12).map(async it=>{
            try{const rr=await fetch(`${it.href}?lang=en&region=us`,{cache:'no-store'}); if(!rr.ok) return null; return await rr.json()}catch(e){return null}
          }))
          const overall=ds.find(d=>d&&( /overall/i.test(d.type||'') || /overall/i.test(d.name||'') ))
          if(overall){ wins=overall.wins; losses=overall.losses; if(!Number.isFinite(wins)||!Number.isFinite(losses)){ const [w,l]=parseWL(overall.summary||overall.displayValue); wins=w; losses=l }
          }
        }
        if(Number.isFinite(wins) && Number.isFinite(losses)) break
      }catch(e){continue}
    }
    const t=idMap.get(String(teamId))
    if(t){
      t.wins=Number.isFinite(wins)?wins:0
      t.losses=Number.isFinite(losses)?losses:0
      t.pct=(t.wins+t.losses)?(t.wins/(t.wins+t.losses)):0
    }
  }catch(e){return}
}

function sampleData(){
  const mk=(id,name,short,conference,division)=>({
    id:String(id),name,short,logo:`https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/${short.toLowerCase()}.png`,
    conference,division,wins:0,losses:0,pct:0,
    home:'-',away:'-',div:'-',conf:'-',ppg:null,opppg:null,diff:null,streak:'',lastTen:'-'
  })
  const east=[
    mk(2,'Boston Celtics','BOS','East','Atlantic'),
    mk(5,'Cleveland Cavaliers','CLE','East','Central')
  ]
  const west=[
    mk(25,'Oklahoma City Thunder','OKC','West','Northwest'),
    mk(7,'Denver Nuggets','DEN','West','Northwest')
  ]
  const league=rank([...east,...west])
  const divisions=groupDivisions(league)
  return {conference:{East:rank(east),West:rank(west)},league,divisions}
}

async function getTeamMeta(id){
  if(teamIndex.has(id)) return teamIndex.get(id)
  if(teamDetailCache.has(id)) return teamDetailCache.get(id)
  const urls=[
    `https://site.web.api.espn.com/apis/v2/sports/basketball/nba/teams/${id}?region=us&lang=en`,
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${id}`,
    `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/teams/${id}`
  ]
  for(const u of urls){
    try{
      const r=await fetch(u,{cache:'no-store'})
      if(!r.ok) continue
      const j=await r.json()
      const team=j.team||j
      const meta=extractConfDiv(team)
      teamDetailCache.set(id,meta)
      return meta
    }catch(e){continue}
  }
  return null
}

load()

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
  const data=await fetchStandings(state.season,state.type)
  if(!data){status('Failed to load standings');return}
  const normalized=normalize(data)
  render(normalized)
  status('Updating splits…')
  backfillRecords(normalized).then(()=>{
    render(normalized)
    status('Updated')
  }).catch(()=>{
    status('Updated')
  })
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
  const ltw=(rec('lastTen')?.wins)!=null?parseInt(rec('lastTen').wins):parseInt(sv(stats,'lastTenWins')||sv(stats,'last10wins'))
  const ltl=(rec('lastTen')?.losses)!=null?parseInt(rec('lastTen').losses):parseInt(sv(stats,'lastTenLosses')||sv(stats,'last10losses'))
  const streakStat=find(stats,'streak')
  const streak=(typeof streakStat?.displayValue==='string'&&streakStat.displayValue)||rec('streak')?.summary||undefined
  const ppg=parseFloat(sv(stats,'pointsPerGame','avgPointsFor','pointsFor','ppg'))
  const opppg=parseFloat(sv(stats,'opponentPointsPerGame','avgPointsAgainst','pointsAgainst','oppg'))
  const homeStat=find(stats,'home')
  const awayStat=find(stats,'away','road')
  const confStat=find(stats,'conference','conferenceRecord','vsConference','vsConf','CONF')
  const divStat=find(stats,'division','divisionRecord','vsDivision','vsDiv','DIV')
  const lastTenStat=find(stats,'lastTen','last10','L10')
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
  list.forEach(t=>{if(!map[t.division])map[t.division]=[];map[t.division].push(t)})
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
  fillTable($('#east-body'),conf.East,{showOrdinal:true})
  fillTable($('#west-body'),conf.West,{showOrdinal:true})
}

function renderLeague(list){
  fillTable($('#league-body'),list,{showOrdinal:false})
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
    table.appendChild(tbody)
    wrap.appendChild(table)
    card.appendChild(h)
    card.appendChild(wrap)
    return card
  }
  const eastOrder=['Atlantic','Central','Southeast']
  const westOrder=['Northwest','Pacific','Southwest']
  const byDiv=(name)=>{
    const list=(window.currentData?.divisions?.[name])||[]
    return rank(list)
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
  teams.forEach(t=>{
    const tr=document.createElement('tr')
    const fallbackLogo=t.short?`https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/${t.short.toLowerCase()}.png`:''
    const logoSrc=t.logo||fallbackLogo
    const logo=logoSrc?`<img class="team-logo" src="${logoSrc}" alt="">`:''
    const diffClass=t.diff==null?'':(t.diff>=0?'pos-good':'pos-bad')
    const gbDisplay=(t.gb===0)?'-':round(t.gb,1)
    const ord=showOrdinal?`<span class="ordinal">No. ${t.rank}</span> `:''
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
      const win=!!me.winner
      results.push(win)
      if(me.homeAway==='home'){ if(win) hw++; else hl++; }
      else { if(win) rw++; else rl++; }
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
    updated.home=(Number.isFinite(hw)&&Number.isFinite(hl))?`${hw}-${hl}`:updated.home
    updated.away=(Number.isFinite(rw)&&Number.isFinite(rl))?`${rw}-${rl}`:updated.away
    updated.lastTen=(last.length?`${ltw}-${ltl}`:updated.lastTen)
    updated.conf=(Number.isFinite(cw)&&Number.isFinite(cl))?`${cw}-${cl}`:updated.conf
    updated.div=(Number.isFinite(dw)&&Number.isFinite(dl))?`${dw}-${dl}`:updated.div
    if(streakLen>0) updated.streak=`W${streakLen}`
    else if(losingLen>0) updated.streak=`L${losingLen}`
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

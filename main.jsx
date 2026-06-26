
import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Trophy, Flag, Users, ShieldCheck, Camera, Check, Lock, Unlock, Image as ImageIcon, PartyPopper, ChevronRight } from 'lucide-react'
import confetti from 'canvas-confetti'
import { supabase, isSupabaseConfigured } from './supabaseClient'
import { activities } from './gameData'
import { riddleList } from './riddles'
import './styles.css'

const holes = [...new Map(activities.map(a => [a.hole, { hole: a.hole, venue: a.venue }])).values()]
const firstHole = holes[0].hole
const STORAGE_KEY = 'stag-open-team-id-v2'
const PIN_DEFAULT = 'tommy'

const defaultTeams = [
  { id: 'team-1', team_name: 'Team 1', players: '', colour: 'Gold', scores: {}, tom: {}, evidence: {}, approvals: {}, riddles: [], riddle_answers: {}, riddle_locked: false, unlocked_hole: firstHole, locked: false, round_finished: false, bonus: 0 },
  { id: 'team-2', team_name: 'Team 2', players: '', colour: 'Pink', scores: {}, tom: {}, evidence: {}, approvals: {}, riddles: [], riddle_answers: {}, riddle_locked: false, unlocked_hole: firstHole, locked: false, round_finished: false, bonus: 0 },
  { id: 'team-3', team_name: 'Team 3', players: 'Willsy, Rhys, Lu, Nick, Conor', colour: 'Mint', scores: {}, tom: {}, evidence: {}, approvals: {}, riddles: [], riddle_answers: {}, riddle_locked: false, unlocked_hole: firstHole, locked: false, round_finished: false, bonus: 0 },
  { id: 'team-4', team_name: 'Team 4', players: '', colour: 'Blue', scores: {}, tom: {}, evidence: {}, approvals: {}, riddles: [], riddle_answers: {}, riddle_locked: false, unlocked_hole: firstHole, locked: false, round_finished: false, bonus: 0 }
]

function blankTeam() {
  return { id: crypto.randomUUID(), team_name: '', players: '', colour: 'Gold', scores: {}, tom: {}, evidence: {}, approvals: {}, riddles: [], riddle_answers: {}, riddle_locked: false, unlocked_hole: firstHole, locked: false, round_finished: false, bonus: 0 }
}

function normaliseTeam(t) {
  return {
    ...t,
    scores: t.scores || {},
    tom: t.tom || {},
    evidence: t.evidence || {},
    approvals: t.approvals || {},
    riddles: t.riddles || [],
    riddle_answers: t.riddle_answers || {},
    riddle_locked: Boolean(t.riddle_locked),
    unlocked_hole: Number(t.unlocked_hole || firstHole),
    locked: Boolean(t.locked),
    round_finished: Boolean(t.round_finished),
    bonus: Number(t.bonus || 0)
  }
}

function activityScore(team, idx) {
  const a = activities[idx]
  const submitted = Number(team?.scores?.[idx] || 0)
  const approval = team?.approvals?.[idx]
  if (submitted <= 0) return 0
  if (approval === 'rejected') return 0
  let score = submitted
  if (a.tomDouble && team?.tom?.[idx]) score *= 2
  return score
}

function totalScore(team) {
  if (!team) return 0
  const base = activities.reduce((sum, _, idx) => sum + activityScore(team, idx), 0)
  const riddleCount = Object.values(team.riddle_answers || {}).filter(v => String(v || '').trim()).length
  return base + (riddleCount * 2) + Number(team.bonus || 0)
}

function holeScore(team, hole) {
  return activities.reduce((sum, a, idx) => a.hole === hole ? sum + activityScore(team, idx) : sum, 0)
}

function holeItems(hole) {
  return activities.map((a, idx) => ({...a, idx})).filter(a => a.hole === hole)
}

function holeComplete(team, hole) {
  return holeItems(hole).every(a => Number(team?.scores?.[a.idx] || 0) > 0 && team?.evidence?.[a.idx])
}

function nextHole(current) {
  const ix = holes.findIndex(h => h.hole === current)
  return holes[Math.min(ix + 1, holes.length - 1)]?.hole || current
}

function App() {
  const [view, setView] = useState('home')
  const [teams, setTeams] = useState([])
  const [teamId, setTeamId] = useState(localStorage.getItem(STORAGE_KEY) || '')
  const [status, setStatus] = useState('Loading…')
  const [activeHole, setActiveHole] = useState(firstHole)
  const [adminPin, setAdminPin] = useState('')
  const [setupDraft, setSetupDraft] = useState({ team_name: '', players: '', colour: 'Gold' })

  const myTeam = teams.find(t => t.id === teamId)
  const leaderboard = useMemo(() => [...teams].sort((a,b) => totalScore(b) - totalScore(a)), [teams])
  const isAdmin = adminPin === (import.meta.env.VITE_ADMIN_PIN || PIN_DEFAULT)
  const galleryOpen = teams.some(t => t.round_finished)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      const local = JSON.parse(localStorage.getItem('stag-local-teams-v2') || 'null') || defaultTeams
      setTeams(local.map(normaliseTeam))
      setStatus('Local demo mode — connect Supabase for live scoring')
      return
    }
    loadTeams()
    const channel = supabase
      .channel('teams-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => loadTeams())
      .subscribe(() => setStatus('Live scoring connected'))
    return () => supabase.removeChannel(channel)
  }, [])

  useEffect(() => {
    if (myTeam) setActiveHole(Math.min(myTeam.unlocked_hole, activeHole || firstHole))
  }, [myTeam?.id])

  async function loadTeams() {
    const { data, error } = await supabase.from('teams').select('*').order('created_at', { ascending: true })
    if (error) { setStatus(error.message); return }
    setTeams((data || []).map(normaliseTeam))
    setStatus('Live scoring connected')
  }

  async function saveTeam(team) {
    const next = normaliseTeam({ ...team, updated_at: new Date().toISOString() })
    if (!isSupabaseConfigured) {
      const updated = teams.some(t => t.id === next.id) ? teams.map(t => t.id === next.id ? next : t) : [...teams, next]
      setTeams(updated)
      localStorage.setItem('stag-local-teams-v2', JSON.stringify(updated))
      return next
    }
    const payload = {
      id: next.id,
      team_name: next.team_name,
      players: next.players,
      colour: next.colour,
      scores: next.scores,
      tom: next.tom,
      evidence: next.evidence,
      approvals: next.approvals,
      riddles: next.riddles,
      riddle_answers: next.riddle_answers,
      riddle_locked: next.riddle_locked,
      unlocked_hole: next.unlocked_hole,
      locked: next.locked,
      round_finished: next.round_finished,
      bonus: next.bonus,
      updated_at: next.updated_at
    }
    const { data, error } = await supabase.from('teams').upsert(payload).select().single()
    if (error) { alert(error.message); return next }
    await loadTeams()
    return normaliseTeam(data)
  }

  async function createTeam() {
    if (!setupDraft.team_name.trim()) return alert('Add a team name')
    const team = await saveTeam({ ...blankTeam(), ...setupDraft, team_name: setupDraft.team_name.trim(), players: setupDraft.players.trim() })
    localStorage.setItem(STORAGE_KEY, team.id)
    setTeamId(team.id)
    setView('score')
  }

  async function chooseTeam(id) {
    localStorage.setItem(STORAGE_KEY, id)
    setTeamId(id)
    const t = teams.find(x => x.id === id)
    setActiveHole(t?.unlocked_hole || firstHole)
    setView('score')
  }

  async function updateMine(mutator) {
    if (!myTeam || myTeam.locked) return
    const next = structuredClone(myTeam)
    mutator(next)
    await saveTeam(next)
  }

  async function submitChallenge(idx, points, file, tomPresent=false) {
    if (!file) return alert('Upload/select a photo before submitting points')
    const reader = new FileReader()
    reader.onload = async () => {
      await updateMine(t => {
        if (t.scores[idx]) return
        t.scores[idx] = points
        t.evidence[idx] = {
          name: file.name,
          type: file.type,
          dataUrl: reader.result,
          submittedAt: new Date().toISOString()
        }
        t.tom[idx] = tomPresent
        t.approvals[idx] = 'pending'
      })
    }
    reader.readAsDataURL(file)
  }

  async function unlockNextHole() {
    if (!holeComplete(myTeam, activeHole)) return alert('Complete every challenge on this hole before unlocking the next venue')
    await updateMine(t => { t.unlocked_hole = nextHole(activeHole) })
    setActiveHole(nextHole(activeHole))
  }

  async function saveRiddleAnswers(answers) {
    await updateMine(t => {
      if (t.riddle_locked) return
      t.riddle_answers = answers
      t.riddle_locked = true
    })
  }

  async function adminUpdate(team, mutator) {
    const next = structuredClone(team)
    mutator(next)
    await saveTeam(next)
  }

  return <>
    <header className="topbar">
      <div>
        <div className="eyebrow">The Stag Open</div>
        <h1>Tommy's Stag · Day 1</h1>
        <p>{status}</p>
      </div>
      <button className="mini" onClick={() => setView('leaderboard')}><Trophy size={20}/></button>
    </header>

    {view === 'home' && <Home setupDraft={setupDraft} setSetupDraft={setSetupDraft} teams={teams} chooseTeam={chooseTeam} createTeam={createTeam}/>}
    {view === 'score' && <Score team={myTeam} activeHole={activeHole} setActiveHole={setActiveHole} submitChallenge={submitChallenge} unlockNextHole={unlockNextHole} saveRiddleAnswers={saveRiddleAnswers}/>}
    {view === 'leaderboard' && <Leaderboard teams={leaderboard}/>}
    {view === 'admin' && <Admin teams={leaderboard} isAdmin={isAdmin} adminPin={adminPin} setAdminPin={setAdminPin} adminUpdate={adminUpdate}/>}
    {view === 'gallery' && <Gallery teams={leaderboard} galleryOpen={galleryOpen}/>}

    <nav className="bottomNav">
      <button className={view==='score'?'active':''} onClick={() => setView(myTeam ? 'score' : 'home')}><Flag/>Score</button>
      <button className={view==='leaderboard'?'active':''} onClick={() => setView('leaderboard')}><Trophy/>Scores</button>
      <button className={view==='home'?'active':''} onClick={() => setView('home')}><Users/>Teams</button>
      <button className={view==='gallery'?'active':''} onClick={() => setView('gallery')}><ImageIcon/>Gallery</button>
      <button className={view==='admin'?'active':''} onClick={() => setView('admin')}><ShieldCheck/>Admin</button>
    </nav>
  </>
}

function Home({ setupDraft, setSetupDraft, teams, chooseTeam, createTeam }) {
  return <main className="screen">
    <section className="hero card">
      <div className="heroIcon">🏌️‍♂️</div>
      <h2>Join the round</h2>
      <p>Create your team, then score one venue at a time. Photo evidence is required before points lock in.</p>
    </section>

    <section className="card stack">
      <label>Team name</label>
      <input value={setupDraft.team_name} onChange={e => setSetupDraft({...setupDraft, team_name:e.target.value})} placeholder="e.g. Team 3" />
      <label>Player names</label>
      <input value={setupDraft.players} onChange={e => setSetupDraft({...setupDraft, players:e.target.value})} placeholder="e.g. Willsy, Rhys, Lu…" />
      <label>Team colour</label>
      <select value={setupDraft.colour} onChange={e => setSetupDraft({...setupDraft, colour:e.target.value})}>
        {['Gold','Pink','Mint','Blue','Red','Purple'].map(c => <option key={c}>{c}</option>)}
      </select>
      <button className="primary" onClick={createTeam}>Start scoring</button>
    </section>

    {teams.length > 0 && <section className="card">
      <h3>Existing teams</h3>
      <div className="list">
        {teams.map(t => <button className="rowButton" key={t.id} onClick={() => chooseTeam(t.id)}>
          <span>{t.team_name}</span><strong>{totalScore(t)} pts</strong>
        </button>)}
      </div>
    </section>}
  </main>
}

function Score({ team, activeHole, setActiveHole, submitChallenge, unlockNextHole, saveRiddleAnswers }) {
  if (!team) return <main className="screen"><section className="card"><h2>Choose or create a team first</h2></section></main>
  const unlocked = team.unlocked_hole || firstHole
  const hole = holes.find(h => h.hole === activeHole) || holes[0]
  const lockedHole = activeHole > unlocked
  const complete = holeComplete(team, activeHole)
  return <main className="screen">
    <section className="scoreHero card">
      <div>
        <span className="pill">Your score</span>
        <h2>{team.team_name}</h2>
        <p>{team.players || 'No players set'}</p>
      </div>
      <div className="scoreNumber">{totalScore(team)}</div>
    </section>

    <section className="card">
      <div className="holeRail">
        {holes.map(h => {
          const disabled = h.hole > unlocked
          return <button key={h.hole} disabled={disabled} className={activeHole===h.hole?'hole active': disabled?'hole disabled':'hole'} onClick={() => setActiveHole(h.hole)}>
            {h.hole}
          </button>
        })}
      </div>
    </section>

    <section className="card">
      <div className="venueHeader">
        <div><span className="pill">Hole {hole.hole}</span><h2>{hole.venue}</h2></div>
        <strong>{holeScore(team, hole.hole)} pts</strong>
      </div>
      {lockedHole ? <div className="lockedNotice"><Lock/> This venue is locked until you finish the previous hole.</div> :
        <div className="challengeStack">
          {holeItems(hole.hole).map(a => <Challenge key={a.idx} team={team} a={a} submitChallenge={submitChallenge}/>)}
          {hole.hole < holes[holes.length-1].hole && <button className={complete ? 'primary full' : 'disabledButton full'} onClick={unlockNextHole}>
            {complete ? <>Unlock next venue <ChevronRight size={18}/></> : 'Complete all challenges to unlock next venue'}
          </button>}
        </div>}
    </section>

    <RiddleSection team={team} saveRiddleAnswers={saveRiddleAnswers} />
  </main>
}


function RiddleSection({ team, saveRiddleAnswers }) {
  const [answers, setAnswers] = useState(team.riddle_answers || {})
  const locked = Boolean(team.riddle_locked)
  const answerCount = Object.values(locked ? (team.riddle_answers || {}) : answers).filter(v => String(v || '').trim()).length

  useEffect(() => {
    setAnswers(team.riddle_answers || {})
  }, [team.id, team.riddle_locked])

  function updateAnswer(n, value) {
    if (locked) return
    setAnswers(prev => ({ ...prev, [n]: value }))
  }

  return <section className="card riddleCard">
    <div className="riddleTop">
      <div>
        <span className="pill">2 pts each</span>
        <h2>The riddle sheet</h2>
        <p>Answer as many as you can. Once submitted, answers are locked.</p>
      </div>
      <div className="riddleScore">{answerCount * 2}</div>
    </div>

    <div className="warningBox">
      <strong>A warning.</strong>
      <p>There are deliberately too many of these, and some are deliberately brutal. Nobody is meant to solve them all. Pick the ones you can crack, grab evidence, and lock in your answers.</p>
    </div>

    <div className="riddleList">
      {riddleList.map((text, i) => {
        const n = i + 1
        const val = locked ? (team.riddle_answers?.[n] || '') : (answers[n] || '')
        return <details className="riddleDetail" key={n}>
          <summary><span>{n}</span><p>{text}</p></summary>
          <textarea
            value={val}
            disabled={locked}
            onChange={e => updateAnswer(n, e.target.value)}
            placeholder={`Your answer for riddle ${n}…`}
          />
        </details>
      })}
    </div>

    {locked ? <div className="submittedBox"><Check/> Riddle answers locked · {answerCount} answered · {answerCount * 2} pts claimed</div> :
      <button className={answerCount ? 'primary full' : 'disabledButton full'} onClick={() => answerCount ? saveRiddleAnswers(answers) : alert('Type at least one riddle answer first')}>
        <Lock size={18}/> Submit and lock riddle answers
      </button>}
  </section>
}


function Challenge({ team, a, submitChallenge }) {
  const submitted = Number(team.scores?.[a.idx] || 0) > 0
  const [file, setFile] = useState(null)
  const [points, setPoints] = useState(a.kind === 'toggle' ? a.points : a.options[0].points)
  const [tomPresent, setTomPresent] = useState(Boolean(team.tom?.[a.idx]))
  const evidence = team.evidence?.[a.idx]
  const approval = team.approvals?.[a.idx] || 'not submitted'
  const finalScore = activityScore(team, a.idx)

  return <div className={submitted ? 'challenge submitted' : 'challenge'}>
    <div className="challengeHead">
      <div><h3>{a.challenge}</h3><p>{a.tomDouble ? 'Tom present doubles the points' : `${a.points} pts base`}</p></div>
      <strong>{submitted ? finalScore : points}</strong>
    </div>

    {submitted ? <div className="submittedBox">
      <Check/> Locked · {approval}
      {evidence?.dataUrl && <img src={evidence.dataUrl} alt="Evidence" />}
    </div> : <>
      {a.kind === 'options' && <div className="optionGrid">
        {a.options.map(o => <button key={o.label} className={points===o.points?'option selected':'option'} onClick={() => setPoints(o.points)}>
          <span>{o.label}</span><strong>{o.points}</strong>
        </button>)}
      </div>}

      {a.tomDouble && <button className={tomPresent?'tom on':'tom'} onClick={() => setTomPresent(!tomPresent)}>Tom present: {tomPresent?'Yes':'No'}</button>}

      <label className="photoPick">
        <Camera/> {file ? file.name : 'Choose photo evidence'}
        <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} />
      </label>

      <button className={file ? 'primary full' : 'disabledButton full'} onClick={() => submitChallenge(a.idx, points, file, tomPresent)}>
        Submit and lock points
      </button>
    </>}
  </div>
}

function Leaderboard({ teams }) {
  return <main className="screen">
    <section className="card">
      <h2>Live leaderboard</h2>
      <div className="list">{teams.map((t,i) => <div className="leader" key={t.id}>
        <span>{i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</span>
        <div><strong>{t.team_name}</strong><p>{t.players || 'No players'} · Hole {t.unlocked_hole}</p></div>
        <b>{totalScore(t)}</b>
      </div>)}</div>
    </section>
    <section className="card">
      <h2>Golf scorecard</h2>
      <div className="tableWrap"><table>
        <thead><tr><th>Team</th>{holes.map(h=><th key={h.hole}>{h.hole}</th>)}<th>Total</th></tr></thead>
        <tbody>{teams.map(t => <tr key={t.id}><td>{t.team_name}</td>{holes.map(h => <td key={h.hole}>{holeScore(t,h.hole)}</td>)}<td><strong>{totalScore(t)}</strong></td></tr>)}</tbody>
      </table></div>
    </section>
  </main>
}

function Admin({ teams, isAdmin, adminPin, setAdminPin, adminUpdate }) {
  if (!isAdmin) return <main className="screen"><section className="card stack">
    <h2>Best man admin</h2><p className="muted">Default PIN is tommy unless changed in Vercel.</p>
    <input type="password" value={adminPin} onChange={e => setAdminPin(e.target.value)} placeholder="Admin PIN"/>
  </section></main>

  return <main className="screen">
    <section className="card">
      <h2>Best man dashboard</h2>
      <button className="primary full" onClick={() => { confetti({particleCount:180,spread:90}); teams.forEach(t => adminUpdate(t, x => x.round_finished = true)) }}><PartyPopper/> Finish round / open gallery</button>
    </section>
    {teams.map(t => <section className="card" key={t.id}>
      <div className="adminTeamHead"><div><h3>{t.team_name}</h3><p>{totalScore(t)} pts · Hole {t.unlocked_hole}</p></div>
      <button onClick={() => adminUpdate(t, x => x.locked = !x.locked)}>{t.locked ? <Unlock/> : <Lock/>}</button></div>
      <div className="adminActions">
        <button onClick={() => adminUpdate(t, x => x.bonus = Number(x.bonus||0)+5)}>+5 bonus</button>
        <button onClick={() => adminUpdate(t, x => x.bonus = Number(x.bonus||0)-5)}>-5 penalty</button>
      </div>
      {t.riddle_locked && <div className="adminRiddles">
        <strong>Riddle answers</strong>
        <p>{Object.values(t.riddle_answers || {}).filter(v => String(v || '').trim()).length} submitted · {Object.values(t.riddle_answers || {}).filter(v => String(v || '').trim()).length * 2} pts</p>
        <details>
          <summary>View answers</summary>
          {Object.entries(t.riddle_answers || {}).filter(([,v]) => String(v || '').trim()).map(([n,v]) => <div className="answerLine" key={n}><b>{n}.</b> {v}</div>)}
        </details>
      </div>}
      <div className="evidenceList">
        {activities.map((a,idx) => t.evidence?.[idx] ? <div className="evidenceItem" key={idx}>
          <img src={t.evidence[idx].dataUrl} alt="Evidence"/>
          <div><strong>Hole {a.hole}: {a.challenge}</strong><p>{t.approvals?.[idx] || 'pending'} · {activityScore(t, idx)} pts</p>
          <div className="adminActions">
            <button onClick={() => adminUpdate(t, x => x.approvals[idx] = 'approved')}>Approve</button>
            <button onClick={() => adminUpdate(t, x => x.approvals[idx] = 'rejected')}>Reject</button>
          </div></div>
        </div> : null)}
      </div>
    </section>)}
  </main>
}

function Gallery({ teams, galleryOpen }) {
  return <main className="screen">
    <section className="card"><h2>After-party gallery</h2><p className="muted">{galleryOpen ? 'Gallery is open.' : 'Gallery opens when the best man finishes the round.'}</p></section>
    {galleryOpen && teams.map(t => <section className="card" key={t.id}>
      <h3>{t.team_name}</h3>
      <div className="galleryGrid">
        {activities.map((a,idx) => t.evidence?.[idx]?.dataUrl && t.approvals?.[idx] !== 'rejected' ? <div className="galleryItem" key={idx}>
          <img src={t.evidence[idx].dataUrl} alt="Gallery"/>
          <span>Hole {a.hole}: {a.challenge}</span>
        </div> : null)}
      </div>
    </section>)}
  </main>
}

createRoot(document.getElementById('root')).render(<App />)

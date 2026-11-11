import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, BellRing, LogIn, LogOut, Siren, UserRound,
  CheckCircle2, ChevronRight, CircleHelp, Clock3, Database, FileClock,
  Fingerprint, Gauge, HardDrive, LayoutDashboard, LoaderCircle, LockKeyhole,
  Play, RefreshCw, Search, Server, Shield, ShieldAlert, ShieldCheck,
  SlidersHorizontal, Terminal, Workflow, X, Zap
} from 'lucide-react'
import './live.css'

const API = '/api'

const SCENARIOS = [
  {
    id: 'cloud', title: 'Production deployment', domain: 'Cloud operations', level: 'Advanced',
    description: 'Assess a deployment plan before it changes a production service.',
    actions: [
      'Build and validate the application release',
      'Deploy the application to production',
      'Verify production service health'
    ]
  },
  {
    id: 'database', title: 'Database migration', domain: 'Data engineering', level: 'Expert',
    description: 'Review a schema migration and its effect on production data.',
    actions: [
      'Create a backup of the production database',
      'Run a migration on the production database',
      'Verify migrated customer records'
    ]
  },
  {
    id: 'security', title: 'Security policy change', domain: 'Security operations', level: 'Advanced',
    description: 'Evaluate a sensitive permission and credential change.',
    actions: [
      'Review the requested permission change',
      'Rotate production security credentials',
      'Verify access policy and audit evidence'
    ]
  },
  {
    id: 'payments', title: 'Payment workflow', domain: 'Financial systems', level: 'Expert',
    description: 'Check a high-impact payment action before approval.',
    actions: [
      'Validate the payment request and supporting evidence',
      'Approve the customer payment',
      'Verify the payment ledger entry'
    ]
  }
]

const DECISION_META = {
  ALLOW: { label: 'ALLOW', icon: CheckCircle2, tone: 'allow' },
  REVIEW: { label: 'REVIEW', icon: AlertTriangle, tone: 'review' },
  BLOCK: { label: 'BLOCK', icon: ShieldAlert, tone: 'block' }
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(sessionStorage.getItem('aegis_token') ? { Authorization: `Bearer ${sessionStorage.getItem('aegis_token')}` } : {}), ...(options.headers || {}) }
  })
  const raw = await response.text()
  let data = null
  try { data = raw ? JSON.parse(raw) : {} } catch { data = { detail: raw || 'The server returned an unreadable response.' } }
  if (!response.ok) {
    const detail = typeof data?.detail === 'string' ? data.detail : `Request failed (${response.status})`
    throw new Error(detail)
  }
  return data
}

function safeDate(value) {
  if (!value) return 'Time unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function parseReasons(value) {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value !== 'string' || !value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)]
  } catch {
    return [value]
  }
}

function decisionTone(decision) {
  return DECISION_META[String(decision || '').toUpperCase()]?.tone || 'neutral'
}

function DecisionPill({ decision }) {
  const key = String(decision || '').toUpperCase()
  const meta = DECISION_META[key]
  const Icon = meta?.icon || CircleHelp
  return <span className={`ax-decision ${meta?.tone || 'neutral'}`}><Icon size={13} />{meta?.label || key || 'PENDING'}</span>
}

function RiskGauge({ score }) {
  const value = Number.isFinite(Number(score)) ? Math.max(0, Math.min(100, Number(score))) : null
  const color = value === null ? 'var(--muted)' : value >= 70 ? 'var(--red)' : value >= 40 ? 'var(--amber)' : 'var(--green)'
  return (
    <div className="ax-gauge-wrap">
      <div className="ax-gauge" style={{ '--gauge-value': `${value ?? 0}%`, '--gauge-color': color }}>
        <div className="ax-gauge-inner">
          <strong>{value === null ? '—' : value}</strong>
          <span>RISK / 100</span>
        </div>
      </div>
      <div className="ax-gauge-caption"><span className="ax-dot" style={{ background: color }} />{value === null ? 'Awaiting evaluation' : value >= 70 ? 'High risk' : value >= 40 ? 'Moderate risk' : 'Lower risk'}</div>
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, note, tone = 'default' }) {
  return (
    <article className={`ax-metric ax-metric-${tone}`}>
      <div className="ax-metric-top"><span className="ax-metric-icon"><Icon size={17} /></span><span>{label}</span></div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function EmptyState({ icon: Icon = FileClock, title, detail }) {
  return <div className="ax-empty"><span><Icon size={21} /></span><strong>{title}</strong><p>{detail}</p></div>
}

export default function App() {
  const [page, setPage] = useState('overview')
  const [system, setSystem] = useState({ loading: true, health: null, verify: null, audit: null, error: '' })
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [activeScenario, setActiveScenario] = useState('cloud')
  const [simulation, setSimulation] = useState({ loading: false, data: null, error: '' })
  const [evaluation, setEvaluation] = useState(null)
  const [evaluationError, setEvaluationError] = useState('')
  const [evaluating, setEvaluating] = useState(false)
  const [action, setAction] = useState('Deploy the application to production')
  const [evidenceScore, setEvidenceScore] = useState(85)
  const [policyViolation, setPolicyViolation] = useState(false)
  const [contradiction, setContradiction] = useState(false)
  const [planText, setPlanText] = useState('')
  const [search, setSearch] = useState('')
  const [securityToken, setSecurityToken] = useState(() => sessionStorage.getItem('aegis_token') || '')
  const [securityUser, setSecurityUser] = useState(null)
  const [securityLogin, setSecurityLogin] = useState({ username: '', password: '' })
  const [securityError, setSecurityError] = useState('')
  const [securityEvents, setSecurityEvents] = useState([])
  const [securityLoading, setSecurityLoading] = useState(false)
  const [eventDraft, setEventDraft] = useState({
    actor: 'demo-operator', action: 'Delete customer records from production database',
    resource: 'production/customer_records'
  })
  const [notificationEnabled, setNotificationEnabled] = useState(false)
  const [lastSecurityEvent, setLastSecurityEvent] = useState(null)

  const selectedScenario = useMemo(
    () => SCENARIOS.find(item => item.id === activeScenario) || SCENARIOS[0],
    [activeScenario]
  )

  const refreshSystem = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true)
    const [healthResult, verifyResult, auditResult] = await Promise.allSettled([
      apiRequest('/health'), apiRequest('/audit/verify'), apiRequest('/audit?limit=50')
    ])
    const errors = [healthResult, verifyResult, auditResult]
      .filter(result => result.status === 'rejected')
      .map(result => result.reason?.message || 'A backend request failed.')
    setSystem({
      loading: false,
      health: healthResult.status === 'fulfilled' ? healthResult.value : null,
      verify: verifyResult.status === 'fulfilled' ? verifyResult.value : null,
      audit: auditResult.status === 'fulfilled' ? auditResult.value : null,
      error: errors.join(' • ')
    })
    setLastUpdated(new Date())
    if (!quiet) setRefreshing(false)
  }, [])

  const runSimulation = useCallback(async (actions, label = 'scenario') => {
    setSimulation({ loading: true, data: null, error: '' })
    try {
      const data = await apiRequest('/simulate', {
        method: 'POST', body: JSON.stringify({ actions })
      })
      setSimulation({ loading: false, data: { ...data, _label: label }, error: '' })
      return data
    } catch (error) {
      setSimulation({ loading: false, data: null, error: error.message || 'Simulation failed.' })
      return null
    }
  }, [])

  useEffect(() => {
    refreshSystem(true)
    const timer = window.setInterval(() => refreshSystem(true), 20000)
    return () => window.clearInterval(timer)
  }, [refreshSystem])

  useEffect(() => {
    if (securityToken) {
      refreshSystem(true)
    } else {
      setSystem(current => ({ ...current, verify: null, audit: null, error: '' }))
    }
  }, [securityToken, refreshSystem])

  useEffect(() => {
    if (!securityToken) {
      setSimulation({ loading: false, data: null, error: 'Sign in to run a simulation.' })
      return
    }
    let active = true
    const actions = selectedScenario.actions
    setSimulation({ loading: true, data: null, error: '' })
    apiRequest('/simulate', { method: 'POST', body: JSON.stringify({ actions }) })
      .then(data => { if (active) setSimulation({ loading: false, data: { ...data, _label: selectedScenario.title }, error: '' }) })
      .catch(error => { if (active) setSimulation({ loading: false, data: null, error: error.message || 'Simulation failed.' }) })
    return () => { active = false }
  }, [selectedScenario, securityToken])

  const submitEvaluation = async event => {
    event.preventDefault()
    if (!action.trim()) return
    setEvaluating(true)
    setEvaluationError('')
    try {
      const data = await apiRequest('/evaluate', {
        method: 'POST',
        body: JSON.stringify({
          action: action.trim(), evidence_score: Number(evidenceScore),
          policy_violation: policyViolation, contradiction_detected: contradiction
        })
      })
      setEvaluation(data)
      await refreshSystem(true)
    } catch (error) {
      setEvaluationError(error.message || 'Evaluation failed. Check the backend and try again.')
    } finally {
      setEvaluating(false)
    }
  }

  const submitCustomPlan = async event => {
    event.preventDefault()
    const actions = planText.split('\n').map(item => item.trim()).filter(Boolean)
    if (!actions.length) return
    if (actions.length > 10) {
      setSimulation({ loading: false, data: null, error: 'A plan can contain at most 10 actions.' })
      return
    }
    await runSimulation(actions, 'Custom plan')
  }

  const signInSecurity = async event => {
    event.preventDefault()
    setSecurityError('')
    try {
      const result = await apiRequest('/security/login', {
        method: 'POST', body: JSON.stringify(securityLogin)
      })
      sessionStorage.setItem('aegis_token', result.access_token)
      setSecurityToken(result.access_token)
      setSecurityUser(result.user)
      setSecurityLogin({ username: securityLogin.username, password: '' })
    } catch (error) {
      setSecurityError(error.message || 'Sign-in failed.')
    }
  }

  const signOutSecurity = async () => {
    try { await apiRequest('/security/logout', { method: 'POST' }) } catch {}
    sessionStorage.removeItem('aegis_token')
    setSecurityToken('')
    setSecurityUser(null)
    setSecurityEvents([])
  }

  const loadSecurityEvents = useCallback(async () => {
    if (!securityToken) return
    setSecurityLoading(true)
    try {
      const result = await apiRequest('/security/events?limit=50')
      const next = result.events || []
      const newest = next[0]
      if (newest && lastSecurityEvent && newest.id > lastSecurityEvent) {
        const urgent = next.filter(item => item.id > lastSecurityEvent && ['CRITICAL', 'HIGH'].includes(item.severity))
        if (urgent.length) {
          try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext
            if (AudioCtx) {
              const ctx = new AudioCtx()
              const oscillator = ctx.createOscillator()
              const gain = ctx.createGain()
              oscillator.type = 'sine'
              oscillator.frequency.value = 880
              gain.gain.value = 0.045
              oscillator.connect(gain); gain.connect(ctx.destination)
              oscillator.start()
              oscillator.stop(ctx.currentTime + 0.18)
              oscillator.onended = () => ctx.close()
            }
          } catch {}
          if (notificationEnabled && 'Notification' in window && Notification.permission === 'granted') {
            new Notification('AEGIS-X security alert', {
              body: `${urgent[0].severity}: ${urgent[0].action}`,
            })
          }
        }
      }
      if (newest) setLastSecurityEvent(newest.id)
      setSecurityEvents(next)
      if (!securityUser) {
        const me = await apiRequest('/security/me')
        setSecurityUser(me)
      }
    } catch (error) {
      if (/401|token|session|unauthorized/i.test(error.message || '')) {
        sessionStorage.removeItem('aegis_token')
        setSecurityToken('')
        setSecurityUser(null)
      } else {
        setSecurityError(error.message || 'Could not load security events.')
      }
    } finally {
      setSecurityLoading(false)
    }
  }, [securityToken, securityUser, lastSecurityEvent, notificationEnabled])

  const submitSecurityEvent = async event => {
    event.preventDefault()
    setSecurityError('')
    try {
      const result = await apiRequest('/security/events/ingest', {
        method: 'POST',
        body: JSON.stringify({ ...eventDraft, evidence_score: 100, source: 'AEGIS-X interactive demo' })
      })
      setLastSecurityEvent(result.event_id)
      if (['CRITICAL', 'HIGH'].includes(result.severity)) {
        try {
          const AudioCtx = window.AudioContext || window.webkitAudioContext
          if (AudioCtx) {
            const ctx = new AudioCtx()
            const oscillator = ctx.createOscillator()
            const gain = ctx.createGain()
            oscillator.type = 'sine'
            oscillator.frequency.value = 880
            gain.gain.value = 0.055
            oscillator.connect(gain); gain.connect(ctx.destination)
            oscillator.start()
            oscillator.stop(ctx.currentTime + 0.2)
            oscillator.onended = () => ctx.close()
          }
        } catch {}
        if (notificationEnabled && 'Notification' in window && Notification.permission === 'granted') {
          new Notification('AEGIS-X security alert', { body: `${result.severity}: ${eventDraft.action}` })
        }
      }
      await loadSecurityEvents()
    } catch (error) {
      setSecurityError(error.message || 'Event submission failed.')
    }
  }

  const enableNotifications = async () => {
    if (!('Notification' in window)) {
      setSecurityError('This browser does not support desktop notifications.')
      return
    }
    const permission = await Notification.requestPermission()
    setNotificationEnabled(permission === 'granted')
  }

  useEffect(() => {
    if (!securityToken) return
    loadSecurityEvents()
    const timer = window.setInterval(loadSecurityEvents, 7000)
    return () => window.clearInterval(timer)
  }, [securityToken, loadSecurityEvents])

  const records = Array.isArray(system.audit?.records) ? system.audit.records : []
  const totalVerified = Number(system.verify?.checked_records ?? 0)
  const integrityValid = system.verify?.valid === true
  const backendHealthy = system.health?.status === 'healthy'
  const latestRecord = records[0] || null
  const activeRisk = evaluation?.risk_score ?? simulation.data?.overall_risk_score ?? null
  const activeDecision = evaluation?.decision ?? simulation.data?.decision ?? latestRecord?.decision ?? null
  const filteredRecords = records.filter(record => {
    const query = search.trim().toLowerCase()
    if (!query) return true
    return [record.action, record.decision, record.created_at, record.risk_score]
      .some(value => String(value ?? '').toLowerCase().includes(query))
  })

  const goTo = next => {
    setPage(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="ax-app">
      <aside className="ax-sidebar">
        <div className="ax-brand">
          <div className="ax-brand-mark"><ShieldCheck size={22} strokeWidth={1.8} /></div>
          <div><strong>AEGIS<span>-X</span></strong><small>AGENT CONTROL PLANE</small></div>
        </div>
        <div className="ax-workspace"><span className="ax-workspace-dot" />LOCAL ENVIRONMENT <span className="ax-workspace-tag">DEV</span></div>
        <div className="ax-nav-label">WORKSPACE</div>
        <nav className="ax-nav">
          <button className={page === 'overview' ? 'active' : ''} onClick={() => goTo('overview')}><LayoutDashboard size={17} />Overview</button>
          <button className={page === 'simulate' ? 'active' : ''} onClick={() => goTo('simulate')}><Workflow size={17} />Plan simulation</button>
          <button className={page === 'audit' ? 'active' : ''} onClick={() => goTo('audit')}><Fingerprint size={17} />Audit & evidence<span className="ax-nav-count">{totalVerified}</span></button>
          <button className={page === 'security' ? 'active' : ''} onClick={() => goTo('security')}><BellRing size={17} />Security centre<span className="ax-nav-count">{securityEvents.length}</span></button>
        </nav>
        <div className="ax-sidebar-bottom">
          <div className="ax-side-status"><span className={`ax-status-light ${backendHealthy ? 'online' : 'offline'}`} /><div><strong>{backendHealthy ? 'API connected' : 'API unavailable'}</strong><small>{system.health?.version ? `Backend v${system.health.version}` : 'Waiting for backend'}</small></div></div>
          <div className="ax-side-footer"><span>AEGIS-X · 0.1.0</span><span>CONTROL / VERIFY / TRUST</span></div>
        </div>
      </aside>

      <main className="ax-main">
        <header className="ax-topbar">
          <div className="ax-breadcrumb"><span>AEGIS-X</span><ChevronRight size={14} /><strong>{page === 'overview' ? 'Overview' : page === 'audit' ? 'Audit & evidence' : 'Plan simulation'}</strong></div>
          <div className="ax-top-actions">
            <div className={`ax-connection ${backendHealthy ? 'connected' : 'disconnected'}`}><span />{backendHealthy ? 'SYSTEM ONLINE' : 'SYSTEM OFFLINE'}</div>
            <button className="ax-icon-button" title="Refresh backend data" onClick={() => refreshSystem(false)} disabled={refreshing}>{refreshing ? <LoaderCircle className="ax-spin" size={17} /> : <RefreshCw size={16} />}</button>
          </div>
        </header>

        {system.error && <div className="ax-global-error"><AlertTriangle size={16} /><span>{system.error}</span><button onClick={() => refreshSystem(false)}>Retry</button></div>}

        {page === 'overview' && (
          <div className="ax-content">
            <section className="ax-page-heading">
              <div><div className="ax-eyebrow"><span className="ax-eyebrow-line" />AUTONOMOUS SYSTEM GOVERNANCE</div><h1>Control before <em>execution.</em></h1><p>Evaluate high-impact actions, inspect multi-step plans, and verify an append-only audit trail.</p></div>
              <div className="ax-updated"><span>LAST SYNC</span><strong>{lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</strong><small>Auto-refresh · 20 sec</small></div>
            </section>

            <section className="ax-metrics-grid">
              <MetricCard icon={Server} label="Backend service" value={system.loading ? '…' : backendHealthy ? 'Healthy' : 'Offline'} note={system.health?.version ? `Version ${system.health.version}` : 'Live /health response'} tone={backendHealthy ? 'green' : 'red'} />
              <MetricCard icon={Fingerprint} label="Verified audit records" value={system.loading ? '…' : totalVerified.toLocaleString()} note={system.verify ? 'Records checked in hash chain' : 'Awaiting verification'} />
              <MetricCard icon={ShieldCheck} label="Audit integrity" value={system.verify ? integrityValid ? 'Verified' : 'Failed' : 'Unknown'} note={system.verify ? integrityValid ? 'No chain errors reported' : `${system.verify.errors?.length ?? 0} integrity issue(s)` : 'Live integrity endpoint'} tone={system.verify ? integrityValid ? 'green' : 'red' : 'default'} />
              <MetricCard icon={Gauge} label="Latest decision" value={activeDecision ? String(activeDecision).toUpperCase() : '—'} note={evaluation ? 'Live action evaluation' : simulation.data ? 'Latest plan simulation' : latestRecord ? 'Latest audit record' : 'No decision recorded yet'} tone={activeDecision ? decisionTone(activeDecision) : 'default'} />
            </section>

            <section className="ax-main-grid">
              <article className="ax-panel ax-evaluate-panel">
                <div className="ax-panel-heading"><div><div className="ax-section-kicker">01 / LIVE POLICY CHECK</div><h2>Evaluate an action</h2><p>Send a real request to the AEGIS-X decision API.</p></div><span className="ax-live-tag"><span />LIVE API</span></div>
                <form onSubmit={submitEvaluation} className="ax-eval-form">
                  <label className="ax-field-label" htmlFor="ax-action">ACTION UNDER REVIEW</label>
                  <textarea id="ax-action" value={action} onChange={event => setAction(event.target.value)} maxLength={500} rows={3} placeholder="Describe the action to evaluate…" required />
                  <div className="ax-range-heading"><label className="ax-field-label" htmlFor="ax-evidence">EVIDENCE CONFIDENCE</label><strong>{evidenceScore}<span> / 100</span></strong></div>
                  <input id="ax-evidence" className="ax-range" type="range" min="0" max="100" value={evidenceScore} onChange={event => setEvidenceScore(Number(event.target.value))} style={{ '--range-progress': `${evidenceScore}%` }} />
                  <div className="ax-range-labels"><span>Insufficient evidence</span><span>Strong evidence</span></div>
                  <div className="ax-checks">
                    <label><input type="checkbox" checked={policyViolation} onChange={event => setPolicyViolation(event.target.checked)} /><span className="ax-custom-check"><CheckCircle2 size={13} /></span>Policy violation detected</label>
                    <label><input type="checkbox" checked={contradiction} onChange={event => setContradiction(event.target.checked)} /><span className="ax-custom-check"><CheckCircle2 size={13} /></span>Conflicting evidence found</label>
                  </div>
                  {evaluationError && <div className="ax-inline-error"><AlertTriangle size={15} />{evaluationError}</div>}
                  <button className="ax-primary-button" type="submit" disabled={evaluating || !backendHealthy || !action.trim()}>{evaluating ? <><LoaderCircle className="ax-spin" size={16} />Evaluating…</> : <><Zap size={16} />Run policy evaluation<ArrowRight size={16} /></>}</button>
                </form>
                {evaluation && <div className="ax-result-card">
                  <div className="ax-result-top"><div><span className="ax-section-kicker">LIVE EVALUATION RESULT</span><strong>{Number(evaluation.risk_score ?? 0)}<small> / 100 RISK</small></strong></div><DecisionPill decision={evaluation.decision} /></div>
                  <div className="ax-result-action">{evaluation.action || action}</div>
                  {parseReasons(evaluation.reasons).length > 0 && <ul className="ax-reason-list">{parseReasons(evaluation.reasons).map((reason, index) => <li key={`${index}-${reason}`}>{reason}</li>)}</ul>}
                  <div className="ax-result-foot"><CheckCircle2 size={14} />Response received from POST /evaluate · Audit refresh requested</div>
                </div>}
              </article>

              <article className="ax-panel ax-posture-panel">
                <div className="ax-panel-heading"><div><div className="ax-section-kicker">02 / CURRENT POSTURE</div><h2>Decision intelligence</h2><p>Derived from the latest live response available.</p></div><Shield size={19} /></div>
                <RiskGauge score={activeRisk} />
                <div className="ax-posture-divider" />
                <div className="ax-posture-row"><span>Decision state</span><DecisionPill decision={activeDecision} /></div>
                <div className="ax-posture-row"><span>Policy engine</span><strong>Deterministic rules</strong></div>
                <div className="ax-posture-row"><span>Execution mode</span><strong>Evaluation only</strong></div>
                <div className="ax-posture-note"><LockKeyhole size={15} /><span>AEGIS-X evaluates and records decisions. It does not execute external infrastructure actions.</span></div>
              </article>
            </section>

            <section className="ax-panel ax-activity-panel">
              <div className="ax-panel-heading ax-activity-heading"><div><div className="ax-section-kicker">03 / EVIDENCE STREAM</div><h2>Recent audit activity</h2><p>Latest records returned by the backend audit endpoint.</p></div><button className="ax-text-button" onClick={() => goTo('audit')}>View full audit <ArrowRight size={15} /></button></div>
              {records.length ? <div className="ax-activity-list">{records.slice(0, 5).map((record, index) => <div className="ax-activity-row" key={record.id ?? `${record.created_at}-${index}`}><div className={`ax-activity-icon ${decisionTone(record.decision)}`}><FileClock size={16} /></div><div className="ax-activity-copy"><strong>{record.action || 'Action not supplied'}</strong><span>{safeDate(record.created_at)} · Record {record.id ?? '—'}</span></div><div className="ax-activity-risk"><strong>{record.risk_score ?? '—'}</strong><small>RISK</small></div><DecisionPill decision={record.decision} /></div>)}</div> : <EmptyState title="No audit records available" detail="Successful evaluations will appear here after the backend records them." />}
            </section>

            <footer className="ax-footer"><span>AEGIS-X · AUTONOMOUS AI RELIABILITY & CONTROL</span><span>LIVE DATA ONLY · NO EXTERNAL ACTION EXECUTION</span></footer>
          </div>
        )}

        {page === 'simulate' && (
          <div className="ax-content">
            <section className="ax-page-heading"><div><div className="ax-eyebrow"><span className="ax-eyebrow-line" />PLAN RISK INTELLIGENCE</div><h1>Simulate the <em>blast radius.</em></h1><p>Preview a sequence of actions before execution. Simulation is advisory and does not run the actions.</p></div><div className="ax-heading-icon"><Workflow size={25} /></div></section>
            <section className="ax-panel ax-scenarios-panel"><div className="ax-panel-heading"><div><div className="ax-section-kicker">SCENARIO LIBRARY</div><h2>Choose an operational context</h2><p>Each selection is sent to the backend simulation endpoint.</p></div><span className="ax-count-label">{SCENARIOS.length} SCENARIOS</span></div><div className="ax-scenario-grid">{SCENARIOS.map((scenario, index) => <button key={scenario.id} className={`ax-scenario-card ${activeScenario === scenario.id ? 'selected' : ''}`} onClick={() => setActiveScenario(scenario.id)}><div className="ax-scenario-card-top"><span>0{index + 1}</span><span className="ax-scenario-level">{scenario.level}</span></div><strong>{scenario.title}</strong><small>{scenario.domain}</small><p>{scenario.description}</p><span className="ax-scenario-select">{activeScenario === scenario.id ? 'SELECTED' : 'SELECT SCENARIO'} <ArrowRight size={13} /></span></button>)}</div></section>
            <section className="ax-sim-grid">
              <article className="ax-panel"><div className="ax-panel-heading"><div><div className="ax-section-kicker">SELECTED WORKFLOW</div><h2>{selectedScenario.title}</h2><p>{selectedScenario.description}</p></div><span className="ax-live-tag"><span />BACKEND SIMULATION</span></div><div className="ax-step-list">{selectedScenario.actions.map((item, index) => <div className="ax-step-row" key={item}><span className="ax-step-number">{String(index + 1).padStart(2, '0')}</span><div><strong>{item}</strong><small>Action {index + 1} · Included in simulation request</small></div><ChevronRight size={16} /></div>)}</div><button className="ax-primary-button" onClick={() => runSimulation(selectedScenario.actions, selectedScenario.title)} disabled={simulation.loading || !backendHealthy}>{simulation.loading ? <><LoaderCircle className="ax-spin" size={16} />Simulating…</> : <><Play size={15} />Re-run scenario<ArrowRight size={16} /></>}</button></article>
              <article className="ax-panel ax-sim-result-panel"><div className="ax-panel-heading"><div><div className="ax-section-kicker">SIMULATION OUTPUT</div><h2>Plan assessment</h2><p>Results from POST /simulate.</p></div><Activity size={19} /></div>{simulation.loading ? <div className="ax-loading-state"><LoaderCircle className="ax-spin" size={22} /><span>Assessing action sequence…</span></div> : simulation.error ? <div className="ax-inline-error"><AlertTriangle size={15} />{simulation.error}</div> : simulation.data ? <><div className="ax-sim-score"><RiskGauge score={simulation.data.overall_risk_score} /><DecisionPill decision={simulation.data.decision} /></div><div className="ax-sim-stat"><span>Potential blast radius</span><strong>{simulation.data.potential_blast_radius ?? 'Not provided'}</strong></div><div className="ax-sim-stat"><span>Steps assessed</span><strong>{simulation.data.step_count ?? simulation.data.steps?.length ?? '—'}</strong></div><div className="ax-sim-stat"><span>Actions executed</span><strong className="ax-never">No · Preview only</strong></div></> : <EmptyState icon={Gauge} title="Waiting for simulation" detail="Choose a scenario or run a custom action plan." />}</article>
            </section>
            {simulation.data && <section className="ax-panel ax-sim-details"><div className="ax-panel-heading"><div><div className="ax-section-kicker">STEP-BY-STEP ASSESSMENT</div><h2>Risk by action</h2><p>Backend-generated decision and risk classification for each step.</p></div></div><div className="ax-step-results">{(simulation.data.steps || []).map((step, index) => <div className="ax-step-result" key={step.step ?? index}><span className="ax-step-number">{String(step.step ?? index + 1).padStart(2, '0')}</span><div className="ax-step-result-main"><strong>{step.action || 'Action'}</strong><small>{step.potentially_irreversible ? 'Potentially irreversible' : 'No irreversible flag reported'}</small>{Array.isArray(step.safer_alternatives) && step.safer_alternatives.length > 0 && <p>{step.safer_alternatives.join(' · ')}</p>}</div><div className="ax-step-result-score"><strong>{step.risk_score ?? '—'}</strong><small>RISK</small></div><DecisionPill decision={step.decision} /></div>)}</div>{Array.isArray(simulation.data.recommendations) && simulation.data.recommendations.length > 0 && <div className="ax-recommendations"><strong>Recommended safeguards</strong><ul>{simulation.data.recommendations.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>}{Array.isArray(simulation.data.limitations) && simulation.data.limitations.length > 0 && <div className="ax-limitations"><CircleHelp size={15} /><div><strong>Model limitations</strong><ul>{simulation.data.limitations.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div></div>}</section>}
            <section className="ax-panel ax-custom-plan"><div className="ax-panel-heading"><div><div className="ax-section-kicker">CUSTOM INPUT</div><h2>Build a custom action plan</h2><p>Enter one action per line. Maximum 10 actions per request.</p></div><Terminal size={19} /></div><form onSubmit={submitCustomPlan}><textarea value={planText} onChange={event => setPlanText(event.target.value)} rows={4} maxLength={3000} placeholder={'Create a production backup\nDeploy the new release\nVerify service health'} /><div className="ax-custom-bottom"><span>{planText.split('\n').filter(line => line.trim()).length} / 10 actions</span><button className="ax-secondary-button" type="submit" disabled={!planText.trim() || simulation.loading || !backendHealthy}><Play size={14} />Simulate custom plan</button></div></form></section>
            <footer className="ax-footer"><span>SIMULATION IS NON-EXECUTING</span><span>HEURISTIC OUTPUT · HUMAN REVIEW REQUIRED</span></footer>
          </div>
        )}

        {page === 'security' && (
          <div className="ax-content">
            <section className="ax-page-heading">
              <div><div className="ax-eyebrow"><span className="ax-eyebrow-line" />IDENTITY · EVENTS · RESPONSE</div><h1>Security <em>centre.</em></h1><p>Sign in, submit a test security event, and inspect the policy decision with a browser alert signal.</p></div>
              <div className="ax-heading-icon"><Siren size={25} /></div>
            </section>
            {!securityToken ? (
              <section className="ax-panel ax-security-login">
                <div className="ax-panel-heading"><div><div className="ax-section-kicker">AUTHENTICATED WORKSPACE</div><h2>Sign in to AEGIS-X</h2><p>Create the first administrator using the one-time bootstrap API described in docs/STAGE6_SECURITY.md.</p></div><UserRound size={20} /></div>
                <form onSubmit={signInSecurity} className="ax-security-form">
                  <label>USERNAME<input value={securityLogin.username} onChange={e => setSecurityLogin(v => ({...v, username:e.target.value}))} autoComplete="username" required /></label>
                  <label>PASSWORD<input type="password" value={securityLogin.password} onChange={e => setSecurityLogin(v => ({...v, password:e.target.value}))} autoComplete="current-password" required /></label>
                  <button className="ax-primary-button" type="submit"><LogIn size={15} />Sign in securely</button>
                </form>
                {securityError && <div className="ax-inline-error"><AlertTriangle size={15} />{securityError}</div>}
                <div className="ax-security-note"><LockKeyhole size={15} />Session token is held in this browser tab's session storage and can be revoked by signing out.</div>
              </section>
            ) : (
              <>
                <section className="ax-security-toolbar">
                  <div className="ax-security-identity"><span className="ax-live-dot" /><div><strong>{securityUser?.username || 'Authenticated user'}</strong><small>{securityUser?.role || 'Loading role'} · ACTIVE SESSION</small></div></div>
                  <div className="ax-security-actions">
                    <button className="ax-secondary-button" onClick={enableNotifications}><BellRing size={14} />{notificationEnabled ? 'Desktop alerts enabled' : 'Enable desktop alerts'}</button>
                    <button className="ax-secondary-button" onClick={signOutSecurity}><LogOut size={14} />Sign out</button>
                  </div>
                </section>
                <section className="ax-security-grid">
                  <article className="ax-panel">
                    <div className="ax-panel-heading"><div><div className="ax-section-kicker">INTERACTIVE SECURITY TEST</div><h2>Submit a suspicious action</h2><p>Send a test event through the policy engine. This does not execute or delete anything.</p></div><Siren size={19} /></div>
                    <form className="ax-security-form" onSubmit={submitSecurityEvent}>
                      <label>ACTOR<input value={eventDraft.actor} onChange={e => setEventDraft(v => ({...v, actor:e.target.value}))} required /></label>
                      <label>ACTION<input value={eventDraft.action} onChange={e => setEventDraft(v => ({...v, action:e.target.value}))} maxLength={500} required /></label>
                      <label>RESOURCE<input value={eventDraft.resource} onChange={e => setEventDraft(v => ({...v, resource:e.target.value}))} required /></label>
                      <button className="ax-primary-button" type="submit" disabled={securityLoading}><Siren size={15} />Evaluate security event</button>
                    </form>
                    <div className="ax-security-note"><AlertTriangle size={15} />Demo event submission only. Real laptop/database monitoring requires an endpoint or database connector.</div>
                  </article>
                  <article className="ax-panel">
                    <div className="ax-panel-heading"><div><div className="ax-section-kicker">ALERT DELIVERY</div><h2>Browser notification signal</h2><p>High and critical submitted events trigger a short tone while this page is open.</p></div><BellRing size={19} /></div>
                    <div className="ax-alert-preview"><div className="ax-alert-icon"><BellRing size={21} /></div><div><strong>Critical action detected</strong><small>Example: production data deletion request</small></div><span className="ax-decision block">BLOCK</span></div>
                    <div className="ax-security-note">Desktop notification permission is optional. Keep this tab open to receive the current polling-based alert signal.</div>
                  </article>
                </section>
                <section className="ax-panel ax-security-events">
                  <div className="ax-panel-heading"><div><div className="ax-section-kicker">SECURITY EVENT LEDGER</div><h2>Submitted events & explanations</h2><p>Events are refreshed every 7 seconds while this page is open.</p></div><button className="ax-secondary-button" onClick={loadSecurityEvents}><RefreshCw size={14} />Refresh</button></div>
                  {securityEvents.length ? <div className="ax-security-event-list">{securityEvents.map(item => <article className="ax-security-event" key={item.id}><div className={`ax-event-severity ${item.severity.toLowerCase()}`}><Siren size={17} /></div><div className="ax-event-main"><div className="ax-event-title"><strong>{item.action}</strong><span className={`ax-severity-label ${item.severity.toLowerCase()}`}>{item.severity}</span></div><p>{item.reason}</p><small>{item.actor} · {item.resource} · {safeDate(item.created_at)}</small></div><DecisionPill decision={item.decision} /></article>)}</div> : <EmptyState icon={BellRing} title="No security events yet" detail="Submit the production deletion test above. AEGIS-X will evaluate it and record the explanation here." />}
                </section>
              </>
            )}
            <footer className="ax-footer"><span>AEGIS-X · SECURITY EVENT REVIEW</span><span>SUBMITTED EVENTS · NO ENDPOINT INTERCEPTION CLAIM</span></footer>
          </div>
        )}

        {page === 'audit' && (
          <div className="ax-content">
            <section className="ax-page-heading"><div><div className="ax-eyebrow"><span className="ax-eyebrow-line" />TAMPER-EVIDENT EVIDENCE</div><h1>Audit & <em>verification.</em></h1><p>Inspect persisted decisions and the backend's hash-chain verification result.</p></div><button className="ax-secondary-button ax-heading-refresh" onClick={() => refreshSystem(false)} disabled={refreshing}>{refreshing ? <LoaderCircle className="ax-spin" size={15} /> : <RefreshCw size={15} />}Refresh records</button></section>
            <section className="ax-audit-summary">
              <article className="ax-panel ax-integrity-card"><div className="ax-integrity-icon"><Fingerprint size={22} /></div><div><span className="ax-section-kicker">HASH-CHAIN STATUS</span><h2>{system.verify ? integrityValid ? 'Integrity verified' : 'Integrity check failed' : 'Verification unavailable'}</h2><p>{system.verify ? integrityValid ? 'The backend reported no chain errors for the records checked.' : 'The backend reported one or more integrity errors. Treat this ledger as untrusted.' : 'Waiting for the live verification endpoint.'}</p></div><DecisionPill decision={system.verify ? integrityValid ? 'ALLOW' : 'BLOCK' : 'REVIEW'} /></article>
              <MetricCard icon={Database} label="Records verified" value={system.verify ? totalVerified.toLocaleString() : '—'} note="Full chain verification count" />
              <MetricCard icon={FileClock} label="Records displayed" value={system.audit ? records.length.toLocaleString() : '—'} note="Latest records fetched (max 50)" />
            </section>
            {system.verify && !integrityValid && <div className="ax-global-error"><ShieldAlert size={16} /><span>Audit integrity is not valid. Do not treat these records as trusted evidence.</span></div>}
            {system.verify?.errors?.length > 0 && <section className="ax-panel ax-integrity-errors"><strong>Verification errors</strong>{system.verify.errors.map((error, index) => <p key={`${index}-${error}`}>{error}</p>)}</section>}
            <section className="ax-panel ax-audit-table-panel"><div className="ax-panel-heading ax-audit-table-heading"><div><div className="ax-section-kicker">PERSISTED DECISION HISTORY</div><h2>Audit records</h2><p>Data returned by GET /audit?limit=50.</p></div><label className="ax-search"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search action or decision" /></label></div>
              {system.loading ? <div className="ax-loading-state"><LoaderCircle className="ax-spin" size={22} /><span>Loading audit evidence…</span></div> : filteredRecords.length ? <div className="ax-table-scroll"><table className="ax-table"><thead><tr><th>RECORD</th><th>ACTION</th><th>RISK</th><th>DECISION</th><th>CREATED</th><th>FLAGS</th></tr></thead><tbody>{filteredRecords.map((record, index) => <tr key={record.id ?? `${record.created_at}-${index}`}><td className="ax-record-id">#{record.id ?? '—'}</td><td className="ax-record-action">{record.action || '—'}<small>Evidence score: {record.evidence_score ?? '—'}</small></td><td><strong className="ax-risk-value">{record.risk_score ?? '—'}</strong></td><td><DecisionPill decision={record.decision} /></td><td className="ax-date-cell">{safeDate(record.created_at)}</td><td><div className="ax-flag-list">{record.policy_violation && <span>POLICY</span>}{record.contradiction_detected && <span>CONFLICT</span>}{!record.policy_violation && !record.contradiction_detected && <i>NONE</i>}</div></td></tr>)}</tbody></table></div> : <EmptyState title="No matching audit records" detail={records.length ? 'Change the search term to see other records.' : 'No records have been returned by the audit endpoint yet.'} />}
            </section>
            <div className="ax-audit-footnote"><LockKeyhole size={15} /><span>Read-only interface. Verification is performed by the backend; this page does not alter, repair, or delete audit records.</span></div>
            <footer className="ax-footer"><span>AEGIS-X · AUDIT EVIDENCE</span><span>{lastUpdated ? `LAST SYNC ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'NOT SYNCED'}</span></footer>
          </div>
        )}
      </main>
    </div>
  )
}

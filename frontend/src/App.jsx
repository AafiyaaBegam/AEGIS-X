
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight,
  BellRing, LogIn, LogOut, Siren, UserRound, CheckCircle2,
  ChevronRight, CircleHelp, Clock3, Database, FileClock,
  Fingerprint, Gauge, HardDrive, LayoutDashboard, LoaderCircle,
  LockKeyhole, Play, RefreshCw, Search, Server, Shield,
  ShieldAlert, ShieldCheck, SlidersHorizontal, Terminal,
  Workflow, X, Zap
} from 'lucide-react'
import AegisScene from './AegisScene'

const API = '/api'

const SCENARIOS = [
  {
    id: 'cloud',
    title: 'Production deployment',
    domain: 'Cloud operations',
    level: 'Advanced',
    description: 'Assess a deployment plan before it changes a production service.',
    actions: [
      'Build and validate the application release',
      'Deploy the application to production',
      'Verify production service health'
    ]
  },
  {
    id: 'database',
    title: 'Database migration',
    domain: 'Data engineering',
    level: 'Expert',
    description: 'Review a schema migration and its effect on production data.',
    actions: [
      'Create a backup of the production database',
      'Run a migration on the production database',
      'Verify migrated customer records'
    ]
  },
  {
    id: 'security',
    title: 'Security policy change',
    domain: 'Security operations',
    level: 'Advanced',
    description: 'Evaluate a sensitive permission and credential change.',
    actions: [
      'Review the requested permission change',
      'Rotate production security credentials',
      'Verify access policy and audit evidence'
    ]
  },
  {
    id: 'payments',
    title: 'Payment workflow',
    domain: 'Financial systems',
    level: 'Expert',
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
  const token = sessionStorage.getItem('aegis_token')

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  })

  const raw = await response.text()
  let data = null

  try {
    data = raw ? JSON.parse(raw) : {}
  } catch {
    data = {
      detail: raw || 'The server returned an unreadable response.'
    }
  }

  if (!response.ok) {
    const detail = typeof data?.detail === 'string'
      ? data.detail
      : `Request failed (${response.status})`

    throw new Error(detail)
  }

  return data
}

function safeDate(value) {
  if (!value) return 'Time unavailable'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return String(value)

  return date.toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
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

  return (
    <span className={`ax-decision ${meta?.tone || 'neutral'}`}>
      <Icon size={13} />
      {meta?.label || key || 'PENDING'}
    </span>
  )
}

function RiskGauge({ score }) {
  const value = Number.isFinite(Number(score))
    ? Math.max(0, Math.min(100, Number(score)))
    : null

  const color = value === null
    ? 'var(--muted)'
    : value >= 70
      ? 'var(--red)'
      : value >= 40
        ? 'var(--amber)'
        : 'var(--green)'

  return (
    <div className="ax-gauge-wrap">
      <div
        className="ax-gauge"
        style={{
          '--gauge-value': `${value ?? 0}%`,
          '--gauge-color': color
        }}
      >
        <div className="ax-gauge-inner">
          <strong>{value === null ? '?' : value}</strong>
          <span>RISK SCORE</span>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, note, tone = 'default' }) {
  return (
    <article className={`ax-metric ax-metric-${tone}`}>
      <div className="ax-metric-top">
        <span className="ax-metric-icon"><Icon size={17} /></span>
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function EmptyState({ icon: Icon = FileClock, title, detail }) {
  return (
    <div className="ax-empty">
      <span><Icon size={21} /></span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState('overview')

  const [system, setSystem] = useState({
    loading: true,
    health: null,
    verify: null,
    audit: null,
    error: ''
  })

  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)

  const [activeScenario, setActiveScenario] = useState('cloud')

  const [simulation, setSimulation] = useState({
    loading: false,
    data: null,
    error: ''
  })

  const [simulationHistory, setSimulationHistory] = useState({
    loading: false,
    records: [],
    error: ''
  })

  const [simulationSearch, setSimulationSearch] = useState('')

  const [evaluation, setEvaluation] = useState(null)
  const [evaluationError, setEvaluationError] = useState('')
  const [evaluating, setEvaluating] = useState(false)

  const [action, setAction] = useState('Deploy the application to production')
  const [evidenceScore, setEvidenceScore] = useState(85)
  const [policyViolation, setPolicyViolation] = useState(false)
  const [contradiction, setContradiction] = useState(false)

  const [planText, setPlanText] = useState('')
  const [search, setSearch] = useState('')

  const [securityToken, setSecurityToken] = useState(
    () => sessionStorage.getItem('aegis_token') || ''
  )

  const [securityUser, setSecurityUser] = useState(null)

  const [securityLogin, setSecurityLogin] = useState({
    username: '',
    password: ''
  })

  const [securityError, setSecurityError] = useState('')
  const [securityEvents, setSecurityEvents] = useState([])
  const [securityLoading, setSecurityLoading] = useState(false)
  const [securityIntegrity, setSecurityIntegrity] = useState({
    loading: false,
    data: null,
    error: ''
  })

  const [eventDraft, setEventDraft] = useState({
    actor: 'demo-operator',
    action: 'Delete customer records from production database',
    resource: 'production/customer_records'
  })

  const [notificationEnabled, setNotificationEnabled] = useState(false)
  const [lastSecurityEvent, setLastSecurityEvent] = useState(null)

  const selectedScenario = useMemo(
    () => SCENARIOS.find(item => item.id === activeScenario) || SCENARIOS[0],
    [activeScenario]
  )

  // --------------------------------------------------
  // SYSTEM STATUS AND EXECUTION AUDIT
  // --------------------------------------------------

  const refreshSystem = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true)

    try {
      const hasToken = Boolean(sessionStorage.getItem('aegis_token'))
      const requests = [apiRequest('/health')]

      if (hasToken) {
        requests.push(
          apiRequest('/audit/verify'),
          apiRequest('/audit?limit=50')
        )
      }

      const [healthResult, verifyResult, auditResult] =
        await Promise.allSettled(requests)

      const results = [
        healthResult,
        ...(hasToken ? [verifyResult, auditResult] : [])
      ]

      const errors = results
        .filter(result => result.status === 'rejected')
        .map(result => result.reason?.message || 'A backend request failed.')

      setSystem({
        loading: false,
        health: healthResult.status === 'fulfilled'
          ? healthResult.value
          : null,
        verify: verifyResult?.status === 'fulfilled'
          ? verifyResult.value
          : null,
        audit: auditResult?.status === 'fulfilled'
          ? auditResult.value
          : null,
        error: errors.join(' | ')
      })

      setLastUpdated(new Date())
    } finally {
      if (!quiet) setRefreshing(false)
    }
  }, [])

  // --------------------------------------------------
  // SIMULATION HISTORY
  // Separate from the execution decision audit ledger.
  // --------------------------------------------------

  const refreshSimulationHistory = useCallback(async () => {
    if (!securityToken) {
      setSimulationHistory({
        loading: false,
        records: [],
        error: 'Sign in with an auditor or administrator account to view simulation history.'
      })
      return
    }

    setSimulationHistory(current => ({
      ...current,
      loading: true,
      error: ''
    }))

    try {
      const data = await apiRequest('/simulation-history?limit=50')

      setSimulationHistory({
        loading: false,
        records: Array.isArray(data.records) ? data.records : [],
        error: ''
      })
    } catch (error) {
      setSimulationHistory({
        loading: false,
        records: [],
        error: error.message || 'Could not load simulation history.'
      })
    }
  }, [securityToken])

  // --------------------------------------------------
  // RUN A PLAN SIMULATION
  // Only explicit user actions create history records.
  // --------------------------------------------------

  const runSimulation = useCallback(async (actions, label = 'scenario') => {
    setSimulation({
      loading: true,
      data: null,
      error: ''
    })

    try {
      const data = await apiRequest('/simulate', {
        method: 'POST',
        body: JSON.stringify({ actions })
      })

      setSimulation({
        loading: false,
        data: { ...data, _label: label },
        error: ''
      })

      // Refresh the separate history ledger after saving.
      await refreshSimulationHistory()

      return data
    } catch (error) {
      setSimulation({
        loading: false,
        data: null,
        error: error.message || 'Simulation failed.'
      })

      return null
    }
  }, [refreshSimulationHistory])

  // --------------------------------------------------
  // REACT EFFECTS
  // --------------------------------------------------

  useEffect(() => {
    refreshSystem(true)

    const timer = window.setInterval(
      () => refreshSystem(true),
      20000
    )

    return () => window.clearInterval(timer)
  }, [refreshSystem])

  useEffect(() => {
    if (securityToken) {
      refreshSystem(true)
    } else {
      setSystem(current => ({
        ...current,
        verify: null,
        audit: null,
        error: ''
      }))
    }
  }, [securityToken, refreshSystem])

  useEffect(() => {
    if (page === 'audit') {
      refreshSimulationHistory()
    }
  }, [page, refreshSimulationHistory])

  // Selecting a scenario does not submit or persist a simulation.
  useEffect(() => {
    setSimulation({
      loading: false,
      data: null,
      error: securityToken
        ? ''
        : 'Sign in to run a simulation.'
    })
  }, [selectedScenario, securityToken])

  // --------------------------------------------------
  // LIVE ACTION EVALUATION
  // --------------------------------------------------

  const submitEvaluation = async event => {
    event.preventDefault()

    if (!action.trim()) return

    setEvaluating(true)
    setEvaluationError('')

    try {
      const data = await apiRequest('/evaluate', {
        method: 'POST',
        body: JSON.stringify({
          action: action.trim(),
          evidence_score: Number(evidenceScore),
          policy_violation: policyViolation,
          contradiction_detected: contradiction
        })
      })

      setEvaluation(data)
      await refreshSystem(true)
    } catch (error) {
      setEvaluationError(
        error.message || 'Evaluation failed. Check the backend and try again.'
      )
    } finally {
      setEvaluating(false)
    }
  }

  // --------------------------------------------------
  // CUSTOM PLAN SUBMISSION
  // --------------------------------------------------

  const submitCustomPlan = async event => {
    event.preventDefault()

    const actions = planText
      .split('\n')
      .map(item => item.trim())
      .filter(Boolean)

    if (!actions.length) return

    if (actions.length > 10) {
      setSimulation({
        loading: false,
        data: null,
        error: 'A plan can contain at most 10 actions.'
      })
      return
    }

    await runSimulation(actions, 'Custom plan')
  }

  // --------------------------------------------------
  // SECURITY AUTHENTICATION
  // --------------------------------------------------

  const signInSecurity = async event => {
    event.preventDefault()
    setSecurityError('')

    try {
      const result = await apiRequest('/security/login', {
        method: 'POST',
        body: JSON.stringify(securityLogin)
      })

      sessionStorage.setItem('aegis_token', result.access_token)

      setSecurityToken(result.access_token)
      setSecurityUser(result.user)

      setSecurityLogin({
        username: securityLogin.username,
        password: ''
      })
    } catch (error) {
      setSecurityError(error.message || 'Sign-in failed.')
    }
  }

  const signOutSecurity = async () => {
    try {
      await apiRequest('/security/logout', {
        method: 'POST'
      })
    } catch {
      // Clear local session even if the logout request fails.
    }

    sessionStorage.removeItem('aegis_token')

    setSecurityToken('')
    setSecurityUser(null)
    setSecurityEvents([])
    setSimulationHistory({
      loading: false,
      records: [],
      error: 'Sign in with an auditor or administrator account to view simulation history.'
    })
  }

  // --------------------------------------------------
  // SECURITY EVENT MONITORING
  // --------------------------------------------------

  const loadSecurityEvents = useCallback(async () => {
    if (!securityToken) return

    setSecurityLoading(true)

    try {
      const result = await apiRequest('/security/events?limit=50')
      const next = result.events || []
      const newest = next[0]

      if (newest && lastSecurityEvent && newest.id > lastSecurityEvent) {
        const urgent = next.filter(item =>
          item.id > lastSecurityEvent &&
          ['CRITICAL', 'HIGH'].includes(item.severity)
        )

        if (urgent.length) {
          try {
            const AudioCtx =
              window.AudioContext || window.webkitAudioContext

            if (AudioCtx) {
              const ctx = new AudioCtx()
              const oscillator = ctx.createOscillator()
              const gain = ctx.createGain()

              oscillator.type = 'sine'
              oscillator.frequency.value = 880
              gain.gain.value = 0.045

              oscillator.connect(gain)
              gain.connect(ctx.destination)

              oscillator.start()
              oscillator.stop(ctx.currentTime + 0.18)
              oscillator.onended = () => ctx.close()
            }
          } catch {}

          if (
            notificationEnabled &&
            'Notification' in window &&
            Notification.permission === 'granted'
          ) {
            new Notification('AEGIS-X security alert', {
              body: `${urgent[0].severity}: ${urgent[0].action}`
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
        setSecurityError(
          error.message || 'Could not load security events.'
        )
      }
    } finally {
      setSecurityLoading(false)
    }
  }, [
    securityToken,
    securityUser,
    lastSecurityEvent,
    notificationEnabled
  ])

  const verifySecurityLedger = async () => {
    setSecurityIntegrity({ loading: true, data: null, error: '' })

    try {
      const result = await apiRequest('/security/events/verify')
      setSecurityIntegrity({
        loading: false,
        data: result,
        error: ''
      })
    } catch (error) {
      setSecurityIntegrity({
        loading: false,
        data: null,
        error: error.message || 'Ledger verification failed.'
      })
    }
  }

  const downloadSecurityEvidence = async () => {
    try {
      const token = sessionStorage.getItem('aegis_token')
      const response = await fetch('/api/security/events/export', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.detail || 'Evidence export failed.')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `aegis-security-evidence-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      window.alert(error.message || 'Evidence export failed.')
    }
  }

  const submitSecurityEvent = async event => {
    event.preventDefault()
    setSecurityError('')

    try {
      const result = await apiRequest('/security/events/ingest', {
        method: 'POST',
        body: JSON.stringify({
          ...eventDraft,
          evidence_score: 100,
          source: 'AEGIS-X interactive demo'
        })
      })

      setLastSecurityEvent(result.event_id)

      if (['CRITICAL', 'HIGH'].includes(result.severity)) {
        try {
          const AudioCtx =
            window.AudioContext || window.webkitAudioContext

          if (AudioCtx) {
            const ctx = new AudioCtx()
            const oscillator = ctx.createOscillator()
            const gain = ctx.createGain()

            oscillator.type = 'sine'
            oscillator.frequency.value = 880
            gain.gain.value = 0.055

            oscillator.connect(gain)
            gain.connect(ctx.destination)

            oscillator.start()
            oscillator.stop(ctx.currentTime + 0.2)
            oscillator.onended = () => ctx.close()
          }
        } catch {}

        if (
          notificationEnabled &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          new Notification('AEGIS-X security alert', {
            body: `${result.severity}: ${eventDraft.action}`
          })
        }
      }

      await loadSecurityEvents()
    } catch (error) {
      setSecurityError(error.message || 'Event submission failed.')
    }
  }

  const enableNotifications = async () => {
    if (!('Notification' in window)) {
      setSecurityError(
        'This browser does not support desktop notifications.'
      )
      return
    }

    const permission = await Notification.requestPermission()
    setNotificationEnabled(permission === 'granted')
  }

  useEffect(() => {
    if (!securityToken) return

    loadSecurityEvents()

    const timer = window.setInterval(
      loadSecurityEvents,
      7000
    )

    return () => window.clearInterval(timer)
  }, [securityToken, loadSecurityEvents])

  // --------------------------------------------------
  // DERIVED DATA
  // --------------------------------------------------

  const records = Array.isArray(system.audit?.records)
    ? system.audit.records
    : []

  const totalVerified = Number(
    system.verify?.checked_records ?? 0
  )

  const integrityValid = system.verify?.valid === true
  const backendHealthy = system.health?.status === 'healthy'
  const latestRecord = records[0] || null

  const activeRisk =
    evaluation?.risk_score ??
    simulation.data?.overall_risk_score ??
    null

  const activeDecision =
    evaluation?.decision ??
    simulation.data?.decision ??
    latestRecord?.decision ??
    null

  const filteredRecords = records.filter(record => {
    const query = search.trim().toLowerCase()

    if (!query) return true

    return [
      record.action,
      record.decision,
      record.created_at,
      record.risk_score
    ].some(value =>
      String(value ?? '').toLowerCase().includes(query)
    )
  })

  const filteredSimulationHistory = simulationHistory.records.filter(record => {
    const query = simulationSearch.trim().toLowerCase()

    if (!query) return true

    const actions = Array.isArray(record.actions)
      ? record.actions
      : []

    return [
      ...actions,
      record.decision,
      record.created_at,
      record.overall_risk_score,
      record.id
    ].some(value =>
      String(value ?? '').toLowerCase().includes(query)
    )
  })

  const goTo = next => {
    setPage(next)
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

  // --------------------------------------------------
  // USER INTERFACE
  // --------------------------------------------------

  return (
    <div className="ax-app">

      <aside className="ax-sidebar">
        <div className="ax-brand">
          <div className="ax-brand-mark">
            <ShieldCheck size={22} strokeWidth={1.8} />
          </div>
          <div>
            <strong>AEGIS<span>-X</span></strong>
            <small>AGENT CONTROL PLANE</small>
          </div>
        </div>

        <div className="ax-workspace">
          <span className="ax-workspace-dot" />
          LOCAL ENVIRONMENT
          <span className="ax-workspace-tag">DEV</span>
        </div>

        <div className="ax-nav-label">WORKSPACE</div>

        <nav className="ax-nav">
          <button
            className={page === 'overview' ? 'active' : ''}
            onClick={() => goTo('overview')}
          >
            <LayoutDashboard size={17} />
            Overview
          </button>

          <button
            className={page === 'simulate' ? 'active' : ''}
            onClick={() => goTo('simulate')}
          >
            <Workflow size={17} />
            Plan simulation
          </button>

          <button
            className={page === 'audit' ? 'active' : ''}
            onClick={() => goTo('audit')}
          >
            <Fingerprint size={17} />
            Audit & evidence
            <span className="ax-nav-count">{totalVerified}</span>
          </button>

          <button
            className={page === 'security' ? 'active' : ''}
            onClick={() => goTo('security')}
          >
            <BellRing size={17} />
            Security centre
            <span className="ax-nav-count">{securityEvents.length}</span>
          </button>
        </nav>

        <div className="ax-sidebar-bottom">
          <div className="ax-side-status">
            <span className={`ax-status-light ${backendHealthy ? 'online' : 'offline'}`} />
            <div>
              <strong>{backendHealthy ? 'API connected' : 'API unavailable'}</strong>
              <small>
                {system.health?.version
                  ? `Backend v${system.health.version}`
                  : 'Waiting for backend'}
              </small>
            </div>
          </div>

          <div className="ax-side-footer">
            <span>AEGIS-X / 0.1.0</span>
            <span>CONTROL / VERIFY / TRUST</span>
          </div>
        </div>
      </aside>

      <main className="ax-main">

        <header className="ax-topbar">
          <div className="ax-breadcrumb">
            <span>AEGIS-X</span>
            <ChevronRight size={14} />
            <strong>
              {page === 'overview'
                ? 'Overview'
                : page === 'audit'
                  ? 'Audit & evidence'
                  : page === 'security'
                    ? 'Security centre'
                    : 'Plan simulation'}
            </strong>
          </div>

          <div className="ax-top-actions">
            <div className={`ax-connection ${backendHealthy ? 'connected' : 'disconnected'}`}>
              <span />
              {backendHealthy ? 'SYSTEM ONLINE' : 'SYSTEM OFFLINE'}
            </div>

            <button
              className="ax-icon-button"
              title="Refresh backend data"
              onClick={() => refreshSystem(false)}
              disabled={refreshing}
            >
              {refreshing
                ? <LoaderCircle className="ax-spin" size={17} />
                : <RefreshCw size={16} />}
            </button>
          </div>
        </header>

        {system.error && (
          <div className="ax-global-error">
            <AlertTriangle size={16} />
            <span>{system.error}</span>
            <button onClick={() => refreshSystem(false)}>Retry</button>
          </div>
        )}

        {/* ==========================================
            OVERVIEW
        ========================================== */}

        {page === 'overview' && (
          <div className="axv4-overview">
            <section className="axv4-heading">
              <div className="axv4-heading-main">
                <div className="axv4-eyebrow"><span /> AUTONOMOUS AI GOVERNANCE PLATFORM <b> / 01</b></div>
                <h1>Control before <em>execution.</em></h1>
                <p>Evidence-led decisions. Deterministic policy. Verifiable accountability.</p>
              </div>
              <div className="axv4-live-status">
                <span className={`axv4-live-light ${backendHealthy ? 'online' : 'offline'}`} />
                <div><small>CONTROL PLANE</small><strong>{backendHealthy ? 'CONNECTED' : 'OFFLINE'}</strong><span>{lastUpdated ? `Last sync ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Waiting for backend'}</span></div>
                <Activity size={21} />
              </div>
            </section>

            <section className="axv4-hero">
              <div className="axv4-hero-copy">
                <div className="axv4-brandline"><span className="axv4-mark"><ShieldCheck size={17} /></span><span>AEGIS-X <i>/</i> AGENT CONTROL PLANE</span><b>CORE 01</b></div>
                <div className="axv4-hero-kicker">PRE-EXECUTION INTELLIGENCE</div>
                <h2>Trust the action.<br /><em>Verify the outcome.</em></h2>
                <p>Every proposed agent action is assessed against evidence and policy before it crosses a critical execution boundary.</p>
                <div className="axv4-hero-signals">
                  <span><i className="signal-cyan" /> EVIDENCE CHECK</span>
                  <span><i className="signal-violet" /> POLICY ENGINE</span>
                  <span><i className="signal-green" /> AUDIT TRAIL</span>
                </div>
                <div className="axv4-decision">
                  <span className="axv4-decision-icon"><ShieldCheck size={20} /></span>
                  <div><small>LATEST GOVERNANCE DECISION</small><strong>{activeDecision ? String(activeDecision).toUpperCase() : 'AWAITING EVALUATION'}</strong><span>{activeRisk == null ? 'No risk assessment recorded yet' : `Risk assessment · ${activeRisk} / 100`}</span></div>
                  <Activity size={20} />
                </div>
              </div>

              <div className="axv4-visual-wrap">
                <div className="axv4-visual-label"><span><i /> LIVE SYSTEM MODEL</span><b>AEGIS / CORE-01</b></div>
                <div className="axv4-visual-stage">
                  <div className="axv4-grid" />
                  <div className="axv4-glow axv4-glow-blue" />
                  <div className="axv4-glow axv4-glow-violet" />
                  <div className="axv4-orbit axv4-orbit-one" />
                  <div className="axv4-orbit axv4-orbit-two" />
                  <AegisScene />
                  <div className="axv4-chip axv4-chip-top"><span className="axv4-chip-led" /><div><small>SYSTEM STATUS</small><strong>{backendHealthy ? 'OPERATIONAL' : 'UNAVAILABLE'}</strong></div></div>
                  <div className="axv4-chip axv4-chip-bottom-left"><Fingerprint size={15} /><div><small>VERIFIED RECORDS</small><strong>{system.loading ? '—' : totalVerified.toLocaleString()}</strong></div></div>
                  <div className="axv4-chip axv4-chip-bottom-right"><LockKeyhole size={15} /><div><small>AUDIT INTEGRITY</small><strong>{system.verify ? (integrityValid ? 'VERIFIED' : 'FAILED') : 'UNKNOWN'}</strong></div></div>
                </div>
                <div className="axv4-visual-foot"><span>THREAT ASSESSMENT</span><i /><span>POLICY ENFORCEMENT</span><i /><span>AUDIT VERIFICATION</span></div>
              </div>
            </section>

            <section className="axv4-metrics" aria-label="Platform telemetry">
              <MetricCard icon={Server} label="Backend service" value={system.loading ? '…' : backendHealthy ? 'Healthy' : 'Offline'} note={system.health?.version ? `API v${system.health.version}` : 'Live health endpoint'} tone={backendHealthy ? 'green' : 'red'} />
              <MetricCard icon={Fingerprint} label="Verified records" value={system.loading ? '…' : totalVerified.toLocaleString()} note="Records checked in hash chain" />
              <MetricCard icon={ShieldCheck} label="Audit integrity" value={system.verify ? (integrityValid ? 'Verified' : 'Failed') : 'Unknown'} note={system.verify ? (integrityValid ? 'No chain errors reported' : `${system.verify.errors?.length ?? 0} integrity issue(s)`) : 'Live integrity endpoint'} tone={system.verify ? (integrityValid ? 'green' : 'red') : 'default'} />
              <MetricCard icon={Gauge} label="Latest decision" value={activeDecision ? String(activeDecision).toUpperCase() : '—'} note={evaluation ? 'Live action evaluation' : simulation.data ? 'Latest plan simulation' : latestRecord ? 'Latest audit record' : 'No decision recorded yet'} tone={activeDecision ? decisionTone(activeDecision) : 'default'} />
            </section>

            <section className="axv4-lower-grid">
              <article className="axv4-card axv4-posture-card">
                <div className="axv4-card-heading"><div><small>01 / SYSTEM HEALTH</small><h2>Security posture</h2></div><span className="axv4-card-icon"><ShieldCheck size={18} /></span></div>
                <div className="axv4-posture-body">
                  <div className="axv4-posture-score"><RiskGauge score={activeRisk} /></div>
                  <div className="axv4-posture-checks">
                    <div><span className={backendHealthy ? 'ok' : 'warn'}>{backendHealthy ? '✓' : '!'}</span><p><b>Backend service</b><small>{backendHealthy ? 'Operational' : 'Unavailable'}</small></p></div>
                    <div><span className={system.verify ? (integrityValid ? 'ok' : 'warn') : 'pending'}>{system.verify ? (integrityValid ? '✓' : '!') : '·'}</span><p><b>Audit chain</b><small>{system.verify ? (integrityValid ? 'Integrity verified' : 'Verification failed') : 'Awaiting verification'}</small></p></div>
                    <div><span className="ok">✓</span><p><b>Decision model</b><small>Deterministic policy</small></p></div>
                  </div>
                </div>
              </article>

              <article className="axv4-card axv4-activity-card">
                <div className="axv4-card-heading"><div><small>02 / EVIDENCE STREAM</small><h2>Recent activity</h2></div><button className="axv4-link-button" onClick={() => goTo('audit')}>View all <ArrowRight size={13} /></button></div>
                <div className="axv4-recent-list">
                  {records.length ? records.slice(0, 3).map((record, index) => (
                    <div className="axv4-recent-row" key={record.id ?? `${record.created_at}-${index}`}>
                      <span className={`axv4-recent-icon ${decisionTone(record.decision)}`}><FileClock size={15} /></span>
                      <div className="axv4-recent-copy"><strong>{record.action || 'Action not supplied'}</strong><small>{safeDate(record.created_at)} · #{record.id ?? '—'}</small></div>
                      <DecisionPill decision={record.decision} />
                    </div>
                  )) : <EmptyState title="No audit activity yet" detail="Recorded decisions will appear here." />}
                </div>
              </article>

              <article className="axv4-card axv4-actions-card">
                <div className="axv4-card-heading"><div><small>03 / OPERATOR CONSOLE</small><h2>Quick actions</h2></div><span className="axv4-card-icon violet"><Zap size={18} /></span></div>
                <div className="axv4-action-grid">
                  <button onClick={() => document.getElementById('axv4-evaluation')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><span className="blue"><Zap size={16} /></span><b>Evaluate action</b><small>Run policy check</small></button>
                  <button onClick={() => goTo('simulate')}><span className="violet"><Workflow size={16} /></span><b>Plan simulation</b><small>Preview a workflow</small></button>
                  <button onClick={() => goTo('audit')}><span className="cyan"><Fingerprint size={16} /></span><b>Audit evidence</b><small>Inspect records</small></button>
                  <button onClick={() => goTo('security')}><span className="green"><LockKeyhole size={16} /></span><b>Security centre</b><small>Review security events</small></button>
                </div>
              </article>
            </section>

            <section className="axv4-workbench" id="axv4-evaluation">
              <article className="axv4-card axv4-evaluate-card">
                <div className="axv4-card-heading"><div><small>04 / LIVE POLICY ENGINE</small><h2>Evaluate an action</h2><p>Submit an action to the existing AEGIS-X decision API.</p></div><span className="axv4-api-status"><i /> LIVE API</span></div>
                <form onSubmit={submitEvaluation} className="axv4-eval-form">
                  <label htmlFor="axv4-action">ACTION UNDER REVIEW</label>
                  <textarea id="axv4-action" value={action} onChange={event => setAction(event.target.value)} maxLength={500} rows={2} placeholder="Describe the action to evaluate..." required />
                  <div className="axv4-range-head"><label htmlFor="axv4-evidence">EVIDENCE CONFIDENCE</label><strong>{evidenceScore}<small> / 100</small></strong></div>
                  <input id="axv4-evidence" className="ax-range" type="range" min="0" max="100" value={evidenceScore} onChange={event => setEvidenceScore(Number(event.target.value))} style={{ '--range-progress': `${evidenceScore}%` }} />
                  <div className="axv4-range-labels"><span>Insufficient evidence</span><span>Strong evidence</span></div>
                  <div className="ax-checks">
                    <label><input type="checkbox" checked={policyViolation} onChange={event => setPolicyViolation(event.target.checked)} /><span className="ax-custom-check"><CheckCircle2 size={13} /></span>Policy violation detected</label>
                    <label><input type="checkbox" checked={contradiction} onChange={event => setContradiction(event.target.checked)} /><span className="ax-custom-check"><CheckCircle2 size={13} /></span>Conflicting evidence found</label>
                  </div>
                  {evaluationError && <div className="ax-inline-error"><AlertTriangle size={15} />{evaluationError}</div>}
                  <button className="ax-primary-button" type="submit" disabled={evaluating || !backendHealthy || !action.trim()}>{evaluating ? <><LoaderCircle className="ax-spin" size={16} />Evaluating...</> : <><Zap size={16} />Run policy evaluation<ArrowRight size={16} /></>}</button>
                </form>
              </article>
              <aside className="axv4-card axv4-result-card">
                <div className="axv4-card-heading"><div><small>05 / DECISION INTELLIGENCE</small><h2>Evaluation result</h2></div><span className="axv4-card-icon"><Activity size={18} /></span></div>
                {evaluation ? (
                  <div className="axv4-result-content"><div className="axv4-result-main"><RiskGauge score={evaluation.risk_score} /><DecisionPill decision={evaluation.decision} /></div><p>{evaluation.action || action}</p>{parseReasons(evaluation.reasons).length > 0 && <ul className="ax-reason-list">{parseReasons(evaluation.reasons).map((reason, index) => <li key={`${index}-${reason}`}>{reason}</li>)}</ul>}<small className="axv4-result-foot"><CheckCircle2 size={13} /> Response received from POST /evaluate</small></div>
                ) : (
                  <div className="axv4-empty-result"><Activity size={22} /><strong>Awaiting an evaluation</strong><p>Run a policy check to see its risk score and decision rationale here.</p><span>NO EXTERNAL ACTIONS ARE EXECUTED</span></div>
                )}
              </aside>
            </section>

            <footer className="axv4-footer"><span>AEGIS-X · AUTONOMOUS AI RELIABILITY & CONTROL</span><span>CONTROL / VERIFY / TRUST</span></footer>
          </div>
        )}

        {/* ==========================================
            PLAN SIMULATION
        ========================================== */}

        {page === 'simulate' && (
          <div className="ax-content">

            <section className="ax-page-heading">
              <div>
                <div className="ax-eyebrow">
                  <span className="ax-eyebrow-line" />
                  PLAN RISK INTELLIGENCE
                </div>
                <h1>Simulate the <em>blast radius.</em></h1>
                <p>
                  Preview a sequence of actions before execution.
                  Simulation is advisory and does not run the actions.
                </p>
              </div>

              <div className="ax-heading-icon">
                <Workflow size={25} />
              </div>
            </section>

            <section className="ax-panel ax-scenarios-panel">
              <div className="ax-panel-heading">
                <div>
                  <div className="ax-section-kicker">SCENARIO LIBRARY</div>
                  <h2>Choose an operational context</h2>
                  <p>
                    Select a scenario, review its steps, and explicitly run
                    the simulation when ready.
                  </p>
                </div>
                <span className="ax-count-label">
                  {SCENARIOS.length} SCENARIOS
                </span>
              </div>

              <div className="ax-scenario-grid">
                {SCENARIOS.map((scenario, index) => (
                  <button
                    key={scenario.id}
                    className={`ax-scenario-card ${activeScenario === scenario.id ? 'selected' : ''}`}
                    onClick={() => setActiveScenario(scenario.id)}
                  >
                    <div className="ax-scenario-card-top">
                      <span>0{index + 1}</span>
                      <span className="ax-scenario-level">{scenario.level}</span>
                    </div>

                    <strong>{scenario.title}</strong>
                    <small>{scenario.domain}</small>
                    <p>{scenario.description}</p>

                    <span className="ax-scenario-select">
                      {activeScenario === scenario.id ? 'SELECTED' : 'SELECT SCENARIO'}
                      <ArrowRight size={13} />
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="ax-sim-grid">

              <article className="ax-panel">
                <div className="ax-panel-heading">
                  <div>
                    <div className="ax-section-kicker">SELECTED WORKFLOW</div>
                    <h2>{selectedScenario.title}</h2>
                    <p>{selectedScenario.description}</p>
                  </div>
                  <span className="ax-live-tag"><span />BACKEND SIMULATION</span>
                </div>

                <div className="ax-step-list">
                  {selectedScenario.actions.map((item, index) => (
                    <div className="ax-step-row" key={item}>
                      <span className="ax-step-number">
                        {String(index + 1).padStart(2, '0')}
                      </span>

                      <div>
                        <strong>{item}</strong>
                        <small>Action {index + 1} · Awaiting simulation</small>
                      </div>

                      <ChevronRight size={16} />
                    </div>
                  ))}
                </div>

                <button
                  className="ax-primary-button"
                  onClick={() => runSimulation(
                    selectedScenario.actions,
                    selectedScenario.title
                  )}
                  disabled={simulation.loading || !backendHealthy || !securityToken}
                >
                  {simulation.loading
                    ? <><LoaderCircle className="ax-spin" size={16} />Simulating…</>
                    : <><Play size={15} />Run scenario simulation<ArrowRight size={16} /></>}
                </button>

                {!securityToken && (
                  <div className="ax-security-note">
                    <LockKeyhole size={15} />
                    Sign in before submitting a simulation.
                  </div>
                )}
              </article>

              <article className="ax-panel ax-sim-result-panel">
                <div className="ax-panel-heading">
                  <div>
                    <div className="ax-section-kicker">SIMULATION OUTPUT</div>
                    <h2>Plan assessment</h2>
                    <p>Results from POST /simulate.</p>
                  </div>
                  <Activity size={19} />
                </div>

                {simulation.loading ? (
                  <div className="ax-loading-state">
                    <LoaderCircle className="ax-spin" size={22} />
                    <span>Assessing action sequence…</span>
                  </div>
                ) : simulation.error ? (
                  <div className="ax-inline-error">
                    <AlertTriangle size={15} />
                    {simulation.error}
                  </div>
                ) : simulation.data ? (
                  <>
                    <div className="ax-sim-score">
                      <RiskGauge score={simulation.data.overall_risk_score} />
                      <DecisionPill decision={simulation.data.decision} />
                    </div>

                    <div className="ax-sim-stat">
                      <span>Potential blast radius</span>
                      <strong>
                        {simulation.data.potential_blast_radius ?? 'Not provided'}
                      </strong>
                    </div>

                    <div className="ax-sim-stat">
                      <span>Steps assessed</span>
                      <strong>
                        {simulation.data.step_count ?? simulation.data.steps?.length ?? '—'}
                      </strong>
                    </div>

                    <div className="ax-sim-stat">
                      <span>Actions executed</span>
                      <strong className="ax-never">No · Preview only</strong>
                    </div>
                  </>
                ) : (
                  <EmptyState
                    icon={Gauge}
                    title="Waiting for simulation"
                    detail="Select a scenario and run the simulation to receive its assessment."
                  />
                )}
              </article>
            </section>

            {simulation.data && (
              <section className="ax-panel ax-sim-details">
                <div className="ax-panel-heading">
                  <div>
                    <div className="ax-section-kicker">STEP-BY-STEP ASSESSMENT</div>
                    <h2>Risk by action</h2>
                    <p>Backend-generated decision and risk classification for each step.</p>
                  </div>
                </div>


                <section
                  className="ax-sim-dependency-panel"
                  style={{
                    marginTop: 24,
                    padding: 20,
                    border: '1px solid rgba(80, 190, 255, 0.25)',
                    borderRadius: 14,
                    background: 'rgba(20, 70, 110, 0.12)'
                  }}
                >
                  <div className="ax-section-kicker">DEPENDENCY INTELLIGENCE</div>
                  <h2>Dependency &amp; downstream impact</h2>
                  <p>
                    Estimated links between actions based on shared resource
                    keywords. These are not verified infrastructure dependencies.
                  </p>
                  <div className="ax-sim-stat">
                    <span>Heuristic blast-radius score</span>
                    <strong>{simulation.data.blast_radius_score ?? 'Not available'} / 100</strong>
                  </div>
                  <h3>Inferred resource dependencies</h3>
                  {Array.isArray(simulation.data.inferred_dependencies) &&
                   simulation.data.inferred_dependencies.length > 0 ? (
                    <div className="ax-step-results">
                      {simulation.data.inferred_dependencies.map((edge, index) => (
                        <div className="ax-step-result" key={`${edge.from_step}-${edge.to_step}-${index}`}>
                          <span className="ax-step-number">{String(edge.from_step).padStart(2, '0')}</span>
                          <div className="ax-step-result-main">
                            <strong>Step {edge.from_step} → Step {edge.to_step}</strong>
                            <small>Shared resources: {(edge.shared_resources || []).join(', ')}</small>
                            <small>Basis: {edge.basis || 'Heuristic'} · Confidence: {edge.confidence || 'heuristic'}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>No shared-resource links were inferred between these actions.</p>
                  )}
                  <h3>Downstream impact by step</h3>
                  {Object.entries(
                    simulation.data.dependency_analysis?.downstream_impact || {}
                  ).map(([step, impact]) => (
                    <div className="ax-sim-stat" key={step}>
                      <span>Step {step} · potentially affected later steps</span>
                      <strong>
                        {impact.downstream_count ?? 0}
                        {Array.isArray(impact.downstream_steps) && impact.downstream_steps.length > 0
                          ? ` \u2192 ${impact.downstream_steps.join(', ')}`
                          : ''}
                      </strong>
                    </div>
                  ))}
                  <small>
                    {simulation.data.dependency_analysis?.limitation ||
                     'Heuristic analysis only; live infrastructure is not inspected.'}
                  </small>
                </section>

                <div className="ax-step-results">
                  {(simulation.data.steps || []).map((step, index) => (
                    <div className="ax-step-result" key={step.step ?? index}>
                      <span className="ax-step-number">
                        {String(step.step ?? index + 1).padStart(2, '0')}
                      </span>

                      <div className="ax-step-result-main">
                        <strong>{step.action || 'Action'}</strong>
                        <small>
                          {step.potentially_irreversible
                            ? 'Potentially irreversible'
                            : 'No irreversible flag reported'}
                        </small>

                        {Array.isArray(step.safer_alternatives) &&
                          step.safer_alternatives.length > 0 && (
                            <p>{step.safer_alternatives.join(' · ')}</p>
                          )}
                      </div>

                      <div className="ax-step-result-score">
                        <strong>{step.risk_score ?? '—'}</strong>
                        <small>RISK</small>
                      </div>

                      <DecisionPill decision={step.decision} />
                    </div>
                  ))}
                </div>

                {Array.isArray(simulation.data.recommendations) &&
                  simulation.data.recommendations.length > 0 && (
                    <div className="ax-recommendations">
                      <strong>Recommended safeguards</strong>
                      <ul>
                        {simulation.data.recommendations.map((item, index) => (
                          <li key={`${index}-${item}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                {Array.isArray(simulation.data.limitations) &&
                  simulation.data.limitations.length > 0 && (
                    <div className="ax-limitations">
                      <CircleHelp size={15} />
                      <div>
                        <strong>Model limitations</strong>
                        <ul>
                          {simulation.data.limitations.map((item, index) => (
                            <li key={`${index}-${item}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                <div className="ax-security-note">
                  <LockKeyhole size={15} />
                  This result is a saved plan preview. No external action was executed.
                </div>
              </section>
            )}

            <section className="ax-panel ax-custom-plan">
              <div className="ax-panel-heading">
                <div>
                  <div className="ax-section-kicker">CUSTOM INPUT</div>
                  <h2>Build a custom action plan</h2>
                  <p>Enter one action per line. Maximum 10 actions per request.</p>
                </div>
                <Terminal size={19} />
              </div>

              <form onSubmit={submitCustomPlan}>
                <textarea
                  value={planText}
                  onChange={event => setPlanText(event.target.value)}
                  rows={4}
                  maxLength={3000}
                  placeholder={'Create a production backup\nDeploy the new release\nVerify service health'}
                />

                <div className="ax-custom-bottom">
                  <span>
                    {planText.split('\n').filter(line => line.trim()).length} / 10 actions
                  </span>

                  <button
                    className="ax-secondary-button"
                    type="submit"
                    disabled={
                      !planText.trim() ||
                      simulation.loading ||
                      !backendHealthy ||
                      !securityToken
                    }
                  >
                    <Play size={14} />
                    Simulate custom plan
                  </button>
                </div>
              </form>
            </section>

            <footer className="ax-footer">
              <span>SIMULATION IS NON-EXECUTING</span>
              <span>HEURISTIC OUTPUT · HUMAN REVIEW REQUIRED</span>
            </footer>
          </div>
        )}

        {/* ==========================================
            SECURITY CENTRE
        ========================================== */}

        {page === 'security' && (
          <div className="ax-content">

            <section className="ax-page-heading">
              <div>
                <div className="ax-eyebrow">
                  <span className="ax-eyebrow-line" />
                  IDENTITY · EVENTS · RESPONSE
                </div>
                <h1>Security <em>centre.</em></h1>
                <p>
                  Sign in, submit a test security event, and inspect the policy
                  decision with a browser alert signal.
                </p>
              </div>

              <div className="ax-heading-icon">
                <Siren size={25} />
              </div>
            </section>

            {!securityToken ? (
              <section className="ax-panel ax-security-login">
                <div className="ax-panel-heading">
                  <div>
                    <div className="ax-section-kicker">AUTHENTICATED WORKSPACE</div>
                    <h2>Sign in to AEGIS-X</h2>
                    <p>
                      Create the first administrator using the one-time
                      bootstrap API described in docs/STAGE6_SECURITY.md.
                    </p>
                  </div>
                  <UserRound size={20} />
                </div>

                <form onSubmit={signInSecurity} className="ax-security-form">
                  <label>
                    USERNAME
                    <input
                      value={securityLogin.username}
                      onChange={e => setSecurityLogin(v => ({
                        ...v,
                        username: e.target.value
                      }))}
                      autoComplete="username"
                      required
                    />
                  </label>

                  <label>
                    PASSWORD
                    <input
                      type="password"
                      value={securityLogin.password}
                      onChange={e => setSecurityLogin(v => ({
                        ...v,
                        password: e.target.value
                      }))}
                      autoComplete="current-password"
                      required
                    />
                  </label>

                  <button className="ax-primary-button" type="submit">
                    <LogIn size={15} />
                    Sign in securely
                  </button>
                </form>

                {securityError && (
                  <div className="ax-inline-error">
                    <AlertTriangle size={15} />
                    {securityError}
                  </div>
                )}

                <div className="ax-security-note">
                  <LockKeyhole size={15} />
                  Session token is held in this browser tab's session storage
                  and can be revoked by signing out.
                </div>
              </section>
            ) : (
              <>
                <section className="ax-security-toolbar">
                  <div className="ax-security-identity">
                    <span className="ax-live-dot" />
                    <div>
                      <strong>{securityUser?.username || 'Authenticated user'}</strong>
                      <small>
                        {securityUser?.role || 'Loading role'} · ACTIVE SESSION
                      </small>
                    </div>
                  </div>

                  <div className="ax-security-actions">
                    <button
                      className="ax-secondary-button"
                      onClick={enableNotifications}
                    >
                      <BellRing size={14} />
                      {notificationEnabled
                        ? 'Desktop alerts enabled'
                        : 'Enable desktop alerts'}
                    </button>

                    <button
                      className="ax-secondary-button"
                      onClick={signOutSecurity}
                    >
                      <LogOut size={14} />
                      Sign out
                    </button>
                  </div>
                </section>

                <section className="ax-security-grid">
                  <article className="ax-panel">
                    <div className="ax-panel-heading">
                      <div>
                        <div className="ax-section-kicker">INTERACTIVE SECURITY TEST</div>
                        <h2>Submit a suspicious action</h2>
                        <p>
                          Send a test event through the policy engine.
                          This does not execute or delete anything.
                        </p>
                      </div>
                      <Siren size={19} />
                    </div>

                    <form
                      className="ax-security-form"
                      onSubmit={submitSecurityEvent}
                    >
                      <label>
                        ACTOR
                        <input
                          value={eventDraft.actor}
                          onChange={e => setEventDraft(v => ({
                            ...v,
                            actor: e.target.value
                          }))}
                          required
                        />
                      </label>

                      <label>
                        ACTION
                        <input
                          value={eventDraft.action}
                          onChange={e => setEventDraft(v => ({
                            ...v,
                            action: e.target.value
                          }))}
                          maxLength={500}
                          required
                        />
                      </label>

                      <label>
                        RESOURCE
                        <input
                          value={eventDraft.resource}
                          onChange={e => setEventDraft(v => ({
                            ...v,
                            resource: e.target.value
                          }))}
                          required
                        />
                      </label>

                      <button
                        className="ax-primary-button"
                        type="submit"
                        disabled={securityLoading}
                      >
                        <Siren size={15} />
                        Evaluate security event
                      </button>
                    </form>

                    <div className="ax-security-note">
                      <AlertTriangle size={15} />
                      Demo event submission only. Real laptop/database
                      monitoring requires an endpoint or database connector.
                    </div>



              </article>

                  <article className="ax-panel">
                    <div className="ax-panel-heading">
                      <div>
                        <div className="ax-section-kicker">ALERT DELIVERY</div>
                        <h2>Browser notification signal</h2>
                        <p>
                          High and critical submitted events trigger a short
                          tone while this page is open.
                        </p>
                      </div>
                      <BellRing size={19} />
                    </div>

                    <div className="ax-alert-preview">
                      <div className="ax-alert-icon">
                        <BellRing size={21} />
                      </div>
                      <div>
                        <strong>Critical action detected</strong>
                        <small>Example: production data deletion request</small>
                      </div>
                      <span className="ax-decision block">BLOCK</span>
                    </div>

                    <div className="ax-security-note">
                      Desktop notification permission is optional.
                      Keep this tab open to receive the current polling-based alert signal.
                    </div>
                  </article>
                </section>

                <section className="ax-panel ax-security-events">
                  <div className="ax-panel-heading">
                    <div>
                      <div className="ax-section-kicker">SECURITY EVENT LEDGER</div>
                      <h2>Submitted events & explanations</h2>
                      <p>Events are refreshed every 7 seconds while this page is open.</p>
                    </div>

                    <button
                      className="ax-secondary-button"
                      onClick={loadSecurityEvents}
                    >
                      <RefreshCw size={14} />
                      Refresh
                    </button>

                    <button
                      className="ax-secondary-button"
                      onClick={verifySecurityLedger}
                      disabled={securityIntegrity.loading}
                    >
                      <ShieldCheck size={14} />
                      {securityIntegrity.loading ? 'Verifying...' : 'Verify ledger'}
                    </button>

                    <button
                      className="ax-secondary-button"
                      onClick={downloadSecurityEvidence}
                    >
                      <FileClock size={14} />
                      Download evidence
                    </button>
                  </div>

                  {securityIntegrity.loading && (
                    <p>Verifying security event integrity...</p>
                  )}

                  {securityIntegrity.error && (
                    <div role="alert" style={{
                      padding: '14px',
                      marginBottom: '16px',
                      border: '1px solid #ef4444',
                      borderRadius: '10px',
                      color: '#ef4444'
                    }}>
                      <strong>Verification failed</strong>
                      <p>{securityIntegrity.error}</p>
                    </div>
                  )}

                  {securityIntegrity.data && (
                    <div style={{
                      padding: '16px',
                      marginBottom: '16px',
                      border: `1px solid ${securityIntegrity.data.valid ? '#16a34a' : '#ef4444'}`,
                      borderRadius: '12px',
                      background: 'rgba(15, 23, 42, 0.35)'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        marginBottom: '14px'
                      }}>
                        {securityIntegrity.data.valid
                          ? <ShieldCheck color="#22c55e" size={22} />
                          : <ShieldAlert color="#ef4444" size={22} />}
                        <strong>
                          {securityIntegrity.data.valid
                            ? 'LEDGER INTEGRITY VERIFIED'
                            : 'LEDGER INTEGRITY COMPROMISED'}
                        </strong>
                      </div>

                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                        gap: '12px'
                      }}>
                        <div>
                          <small>EVENTS CHECKED</small>
                          <h3>{securityIntegrity.data.checked_records ?? 0}</h3>
                        </div>
                        <div>
                          <small>EVENT RECORDS</small>
                          <h3>{securityIntegrity.data.event_count ?? 0}</h3>
                        </div>
                        <div>
                          <small>HASH RECORDS</small>
                          <h3>{securityIntegrity.data.integrity_record_count ?? 0}</h3>
                        </div>
                      </div>

                      {securityIntegrity.data.errors?.length > 0 && (
                        <ul>
                          {securityIntegrity.data.errors.map((error, index) => (
                            <li key={index}>{error}</li>
                          ))}
                        </ul>
                      )}

                      {securityIntegrity.data.historical_proof_note && (
                        <p style={{ marginTop: '12px', fontSize: '12px' }}>
                          {securityIntegrity.data.historical_proof_note}
                        </p>
                      )}
                    </div>
                  )}

                  {securityEvents.length ? (
                    <div className="ax-security-event-list">
                      {securityEvents.map(item => (
                        <article className="ax-security-event" key={item.id}>
                          <div className={`ax-event-severity ${item.severity.toLowerCase()}`}>
                            <Siren size={17} />
                          </div>

                          <div className="ax-event-main">
                            <div className="ax-event-title">
                              <strong>{item.action}</strong>
                              <span className={`ax-severity-label ${item.severity.toLowerCase()}`}>
                                {item.severity}
                              </span>
                            </div>

                            <p>{item.reason}</p>

                            <small>
                              {item.actor} · {item.resource} · {safeDate(item.created_at)}
                            </small>
                          </div>

                          <DecisionPill decision={item.decision} />
                        </article>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={BellRing}
                      title="No security events yet"
                      detail="Submit the production deletion test above. AEGIS-X will evaluate it and record the explanation here."
                    />
                  )}
                </section>
              </>
            )}

            <footer className="ax-footer">
              <span>AEGIS-X · SECURITY EVENT REVIEW</span>
              <span>SUBMITTED EVENTS · NO ENDPOINT INTERCEPTION CLAIM</span>
            </footer>
          </div>
        )}

        {/* ==========================================
            AUDIT & EVIDENCE
        ========================================== */}

        {page === 'audit' && (
          <div className="ax-content">

            <section className="ax-page-heading">
              <div>
                <div className="ax-eyebrow">
                  <span className="ax-eyebrow-line" />
                  TAMPER-EVIDENT EVIDENCE
                </div>
                <h1>Audit & <em>verification.</em></h1>
                <p>
                  Inspect persisted decisions, simulation previews,
                  and the backend's hash-chain verification result.
                </p>
              </div>

              <button
                className="ax-secondary-button ax-heading-refresh"
                onClick={() => {
                  refreshSystem(false)
                  refreshSimulationHistory()
                }}
                disabled={refreshing || simulationHistory.loading}
              >
                {refreshing || simulationHistory.loading
                  ? <LoaderCircle className="ax-spin" size={15} />
                  : <RefreshCw size={15} />}
                Refresh records
              </button>
            </section>

            <section className="ax-audit-summary">
              <article className="ax-panel ax-integrity-card">
                <div className="ax-integrity-icon">
                  <Fingerprint size={22} />
                </div>

                <div>
                  <span className="ax-section-kicker">HASH-CHAIN STATUS</span>
                  <h2>
                    {system.verify
                      ? integrityValid
                        ? 'Integrity verified'
                        : 'Integrity check failed'
                      : 'Verification unavailable'}
                  </h2>
                  <p>
                    {system.verify
                      ? integrityValid
                        ? 'The backend reported no chain errors for the records checked.'
                        : 'The backend reported one or more integrity errors. Treat this ledger as untrusted.'
                      : 'Waiting for the live verification endpoint.'}
                  </p>
                </div>

                <DecisionPill
                  decision={
                    system.verify
                      ? integrityValid
                        ? 'ALLOW'
                        : 'BLOCK'
                      : 'REVIEW'
                  }
                />
              </article>

              <MetricCard
                icon={Database}
                label="Records verified"
                value={system.verify ? totalVerified.toLocaleString() : '—'}
                note="Full chain verification count"
              />

              <MetricCard
                icon={FileClock}
                label="Records displayed"
                value={system.audit ? records.length.toLocaleString() : '—'}
                note="Latest records fetched (max 50)"
              />
            </section>

            {system.verify && !integrityValid && (
              <div className="ax-global-error">
                <ShieldAlert size={16} />
                <span>
                  Audit integrity is not valid. Do not treat these records as trusted evidence.
                </span>
              </div>
            )}

            {system.verify?.errors?.length > 0 && (
              <section className="ax-panel ax-integrity-errors">
                <strong>Verification errors</strong>
                {system.verify.errors.map((error, index) => (
                  <p key={`${index}-${error}`}>{error}</p>
                ))}
              </section>
            )}

            {/* EXECUTION DECISION AUDIT */}

            <section className="ax-panel ax-audit-table-panel">
              <div className="ax-panel-heading ax-audit-table-heading">
                <div>
                  <div className="ax-section-kicker">PERSISTED DECISION HISTORY</div>
                  <h2>Audit records</h2>
                  <p>Data returned by GET /audit?limit=50.</p>
                </div>

                <label className="ax-search">
                  <Search size={15} />
                  <input
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder="Search action or decision"
                  />
                </label>
              </div>

              {system.loading ? (
                <div className="ax-loading-state">
                  <LoaderCircle className="ax-spin" size={22} />
                  <span>Loading audit evidence…</span>
                </div>
              ) : filteredRecords.length ? (
                <div className="ax-table-scroll">
                  <table className="ax-table">
                    <thead>
                      <tr>
                        <th>RECORD</th>
                        <th>ACTION</th>
                        <th>RISK</th>
                        <th>DECISION</th>
                        <th>CREATED</th>
                        <th>FLAGS</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredRecords.map((record, index) => (
                        <tr key={record.id ?? `${record.created_at}-${index}`}>
                          <td className="ax-record-id">
                            #{record.id ?? '—'}
                          </td>

                          <td className="ax-record-action">
                            {record.action || '—'}
                            <small>
                              Evidence score: {record.evidence_score ?? '—'}
                            </small>
                          </td>

                          <td>
                            <strong className="ax-risk-value">
                              {record.risk_score ?? '—'}
                            </strong>
                          </td>

                          <td>
                            <DecisionPill decision={record.decision} />
                          </td>

                          <td className="ax-date-cell">
                            {safeDate(record.created_at)}
                          </td>

                          <td>
                            <div className="ax-flag-list">
                              {record.policy_violation && <span>POLICY</span>}
                              {record.contradiction_detected && <span>CONFLICT</span>}
                              {!record.policy_violation &&
                                !record.contradiction_detected && <i>NONE</i>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="No matching audit records"
                  detail={
                    records.length
                      ? 'Change the search term to see other records.'
                      : 'No records have been returned by the audit endpoint yet.'
                  }
                />
              )}
            </section>

            {/* SEPARATE SIMULATION HISTORY */}

            <section className="ax-panel ax-audit-table-panel ax-simulation-history">
              <div className="ax-panel-heading ax-audit-table-heading">
                <div>
                  <div className="ax-section-kicker">
                    NON-EXECUTING PLAN RECORDS
                  </div>
                  <h2>Simulation history</h2>
                  <p>
                    Saved plan assessments from the separate
                    simulation-history endpoint.
                  </p>
                </div>

                <div className="ax-security-actions">
                  <label className="ax-search">
                    <Search size={15} />
                    <input
                      value={simulationSearch}
                      onChange={event => setSimulationSearch(event.target.value)}
                      placeholder="Search plan or decision"
                    />
                  </label>

                  <button
                    className="ax-secondary-button"
                    onClick={refreshSimulationHistory}
                    disabled={simulationHistory.loading}
                  >
                    {simulationHistory.loading
                      ? <LoaderCircle className="ax-spin" size={14} />
                      : <RefreshCw size={14} />}
                    Refresh history
                  </button>
                </div>
              </div>

              <div className="ax-security-note">
                <LockKeyhole size={15} />
                Simulation records are stored separately from the execution
                decision audit chain. They represent previews, not completed
                infrastructure actions. They are not included in the
                execution audit hash-chain verification count.
              </div>

              {simulationHistory.loading ? (
                <div className="ax-loading-state">
                  <LoaderCircle className="ax-spin" size={22} />
                  <span>Loading simulation history…</span>
                </div>
              ) : simulationHistory.error ? (
                <div className="ax-inline-error">
                  <AlertTriangle size={15} />
                  <span>{simulationHistory.error}</span>
                </div>
              ) : filteredSimulationHistory.length ? (
                <div className="ax-table-scroll">
                  <table className="ax-table">
                    <thead>
                      <tr>
                        <th>SIMULATION</th>
                        <th>PLAN ACTIONS</th>
                        <th>RISK</th>
                        <th>DECISION</th>
                        <th>CREATED</th>
                        <th>EXECUTION</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredSimulationHistory.map(record => (
                        <tr key={record.id}>
                          <td className="ax-record-id">
                            #{record.id ?? '—'}
                          </td>

                          <td className="ax-record-action">
                            {Array.isArray(record.actions) && record.actions.length
                              ? (
                                <>
                                  <strong>
                                    {record.actions.length} action(s) assessed
                                  </strong>
                                  <small>
                                    {record.actions.join(' · ')}
                                  </small>
                                </>
                              )
                              : 'No action details available'}
                          </td>

                          <td>
                            <strong className="ax-risk-value">
                              {record.overall_risk_score ?? '—'}
                            </strong>
                          </td>

                          <td>
                            <DecisionPill decision={record.decision} />
                          </td>

                          <td className="ax-date-cell">
                            {safeDate(record.created_at)}
                          </td>

                          <td>
                            <span className="ax-never">
                              {record.execution_performed === false
                                ? 'NOT EXECUTED'
                                : 'UNCONFIRMED'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  icon={Workflow}
                  title={
                    simulationHistory.records.length
                      ? 'No matching simulations'
                      : 'No simulation history yet'
                  }
                  detail={
                    simulationHistory.records.length
                      ? 'Try another search term.'
                      : 'Run a plan simulation first. Saved previews will appear here when your account has auditor or administrator access.'
                  }
                />
              )}

              <div className="ax-audit-footnote">
                <span>
                  PREVIEW ONLY · NOT EXECUTED · SEPARATE SQLITE STORE
                </span>
                <span>
                  {simulationHistory.records.length} record(s) loaded
                </span>
              </div>
            </section>

            <div className="ax-audit-footnote">
              <LockKeyhole size={15} />
              <span>
                Read-only interface. Verification is performed by the backend;
                this page does not alter, repair, or delete execution audit records.
              </span>
            </div>

            <footer className="ax-footer">
              <span>AEGIS-X · AUDIT EVIDENCE</span>
              <span>
                {lastUpdated
                  ? `LAST SYNC ${lastUpdated.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}`
                  : 'NOT SYNCED'}
              </span>
            </footer>
          </div>
        )}

      </main>
    </div>
  )
}

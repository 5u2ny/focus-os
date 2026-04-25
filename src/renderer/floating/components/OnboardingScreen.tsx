import React, { useState, useEffect } from 'react'
import { ipc } from '@shared/ipc-client'

interface Props { onComplete: () => void }

type Step = 'welcome' | 'accessibility' | 'optional'

export function OnboardingScreen({ onComplete }: Props) {
  const [step, setStep]           = useState<Step>('welcome')
  const [granted, setGranted]     = useState(false)
  const [checking, setChecking]   = useState(false)

  // Poll for accessibility permission once user clicks "Grant"
  useEffect(() => {
    if (step !== 'accessibility' || granted) return
    if (!checking) return
    const t = setInterval(async () => {
      const ok = await ipc.invoke<boolean>('permission:checkAccessibility')
      if (ok) { setGranted(true); clearInterval(t) }
    }, 1000)
    return () => clearInterval(t)
  }, [step, checking, granted])

  function openAccessibility() {
    ipc.invoke('permission:openAccessibilitySettings')
    setChecking(true)
  }

  return (
    <div className="onboarding">
      {step === 'welcome' && (
        <div className="onboarding-step">
          <div className="onboarding-icon">✦</div>
          <h2 className="onboarding-title">Welcome to Focus OS</h2>
          <ul className="onboarding-list">
            <li>⏱ Pomodoro timer with dynamic island pill</li>
            <li>⌘ Capture highlighted text from any app</li>
            <li>📝 Local notes with TipTap editor</li>
            <li>📬 AI email triage from your Gmail inbox</li>
            <li>✅ Todos and calendar — all offline, all private</li>
          </ul>
          <button className="onboarding-btn" onClick={() => setStep('accessibility')}>Get started →</button>
        </div>
      )}

      {step === 'accessibility' && (
        <div className="onboarding-step">
          <div className="onboarding-icon">🔐</div>
          <h2 className="onboarding-title">Accessibility Permission</h2>
          <p className="onboarding-body">
            Focus OS needs Accessibility access to capture highlighted text from other apps using <kbd>⌘⇧C</kbd>.
            Your captured text never leaves your Mac.
          </p>
          {!granted ? (
            <>
              <button className="onboarding-btn" onClick={openAccessibility}>
                {checking ? 'Waiting for permission…' : 'Open System Settings'}
              </button>
              {checking && <p className="onboarding-hint">Enable Focus OS in System Settings → Privacy &amp; Security → Accessibility, then return here</p>}
              <button className="onboarding-link" onClick={() => setStep('optional')}>Skip for now</button>
            </>
          ) : (
            <>
              <p className="onboarding-granted">✓ Accessibility granted</p>
              <button className="onboarding-btn" onClick={() => setStep('optional')}>Continue →</button>
            </>
          )}
        </div>
      )}

      {step === 'optional' && (
        <div className="onboarding-step">
          <div className="onboarding-icon">⚙</div>
          <h2 className="onboarding-title">Optional Setup</h2>
          <p className="onboarding-body">
            You can connect Gmail with an App Password and add an AI provider key for email triage.
            Both can be configured later in <strong>Settings</strong>.
          </p>
          <button className="onboarding-btn" onClick={onComplete}>Start using Focus OS →</button>
        </div>
      )}
    </div>
  )
}

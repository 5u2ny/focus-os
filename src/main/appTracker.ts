import { freezeController } from './freezeController'
import { stateStore } from './stateStore'
import { IPC } from '../renderer/shared/types'
import { isTimerRunning, pauseTimer, resumeTimer } from './ipcHandlers'

// Use dynamic import because active-win is ESM-only
let activeWin: any = null
async function getActiveWin() {
  if (!activeWin) {
    activeWin = (await import('active-win')).default
  }
  return activeWin()
}

// Local Agentic LLM tracking instance
let classifierPipeline: any = null
async function getClassifier() {
  if (!classifierPipeline) {
    console.log('[Agentic] Downloading/Loading local model pipeline (first run may take a minute...)')
    const { pipeline, env } = await import('@xenova/transformers')
    env.allowLocalModels = true
    classifierPipeline = await pipeline('zero-shot-classification', 'Xenova/mobilebert-uncased-mnli')
    console.log('[Agentic] Neural Network Ready.')
  }
  return classifierPipeline
}

export class AppTracker {
  private appTimes: Map<string, number> = new Map()
  private recentTitles: string[] = []
  private pollInterval: NodeJS.Timeout | null = null
  private readonly INTERVAL_MS = 5000 // Poll every 5s to keep CPU low
  private readonly THRESHOLD_SEC = 2 * 60 * 60 // 2 hours limit
  private readonly BREAK_SEC = 60 // 1 minute break
  private readonly AI_CLASSIFY_INTERVAL_MS = 10000 // Run AI Check fast (every 10s)
  private lastClassifyTime = 0 // Run immediately on first poll

  start() {
    if (this.pollInterval) return
    this.pollInterval = setInterval(() => this.poll(), this.INTERVAL_MS)
  }

  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
  }

  private async poll() {
    // If the system is already frozen by a Pomodoro break, skip tracking
    if (freezeController.isFrozen()) return

    try {
      const win = await getActiveWin()
      if (!win) return

      // Create a key for the "one window/app/tab"
      const appKey = `${win.owner.name}::${win.title}`

      const currentTimeSpent = (this.appTimes.get(appKey) || 0) + (this.INTERVAL_MS / 1000)
      this.appTimes.set(appKey, currentTimeSpent)

      // Push rolling memory for the Agent Context
      if (win.title || (win.owner && win.owner.name)) {
        this.recentTitles.push(`${win.owner?.name || 'App'}: ${win.title || 'Window'}`)
        if (this.recentTitles.length > 8) this.recentTitles.shift()
      }

      // Handle AI Auto-Start
      const now = Date.now()
      if (now - this.lastClassifyTime > this.AI_CLASSIFY_INTERVAL_MS) {
        console.log(`[AppTracker] Hit classification loop window (${this.recentTitles.length} items logged).`)
        this.lastClassifyTime = now
        await this.runAIClassification()
      }

      // Log every 30 minutes for visibility without spamming
      if (Math.floor(currentTimeSpent) % 1800 === 0 && currentTimeSpent > 0) {
        console.log(`[AppTracker] ${appKey} has been active for ${Math.floor(currentTimeSpent / 60)} minutes.`)
      }

      if (currentTimeSpent >= this.THRESHOLD_SEC) {
        console.log(`[AppTracker] Threshold reached for ${appKey}. Triggering mandatory break.`)
        this.triggerAutomaticBreak(appKey)
      }
    } catch (err) {
      // ignore errors, likely permission or no active window
    }
  }

  private async runAIClassification() {
    console.log(`[Smart Agent] runAIClassification fired. recentTitles len: ${this.recentTitles.length}`)
    if (this.recentTitles.length === 0) return
    const isRunning = isTimerRunning()

    if (isRunning) {
      return
    }

    try {
      console.log(`[Smart Agent] Activating Zero-Shot NLP Neural Network on context...`);
      const classifier = await getClassifier()

      const textContext = this.recentTitles.join(' | ')
      const labels = ['Coding', 'Designing', 'Reading Documentation', 'Browsing Social Media', 'Communication', 'Writing']
      const res = await classifier(textContext, labels)

      const topLabel = res.labels[0]
      const topScore = res.scores[0]

      console.log(`[Agentic] Brain analyzed Context: "${topLabel}" (Confidence: ${Math.round(topScore*100)}%)`)

      if (topScore > 0.40 && ['Coding', 'Designing', 'Writing', 'Reading Documentation'].includes(topLabel)) {
        console.log(`[Agentic] Auto-starting focus session! Discovered Task: ${topLabel}`)
        stateStore.update({ currentTask: `Agent Auto-Task: ${topLabel}` })

        resumeTimer()
      }
    } catch (err) {
      console.log('[Agentic] Engine classification error:', err)
    }
  }

  private triggerAutomaticBreak(appKey: string) {
    // Reset timer for this specific app/window so we don't immediately re-trigger
    this.appTimes.set(appKey, 0)
    
    // Store whether the standard timer was running so we can restore it
    const wasTimerRunning = isTimerRunning()

    if (wasTimerRunning) {
      pauseTimer()
    }

    // Trigger the break overlay
    freezeController.enter('rest', this.BREAK_SEC, () => {
      // Restore standard timer state after the rest break finishes
      if (wasTimerRunning) {
        resumeTimer()
      }
    })
  }
}

export const appTracker = new AppTracker()

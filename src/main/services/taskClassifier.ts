type Category = 'Coding' | 'Designing' | 'Reading Documentation' | 'Writing' | 'Entertainment/Social'

const KEYWORDS: Record<Category, string[]> = {
  'Coding': ['visual studio code', 'vs code', 'code:', 'intellij', 'webstorm', 'xcode', 'sublime', 'cursor', 'terminal', 'iterm', 'electron', 'antigravity'],
  'Designing': ['figma', 'sketch', 'adobe', 'framer', 'canva'],
  'Reading Documentation': ['docs', 'stack overflow', 'stackoverflow', 'mdn', 'documentation', 'github', 'confluence'],
  'Writing': ['notion', 'word', 'pages', 'google docs', 'evernote', 'obsidian'],
  'Entertainment/Social': ['youtube', 'netflix', 'twitter', 'x.com', 'facebook', 'reddit', 'spotify', 'tiktok', 'instagram']
}

export function classifyTask(recentTitles: string[]): { isProductive: boolean, inferredTask?: string } {
  if (!recentTitles || recentTitles.length === 0) return { isProductive: false }

  const voteCounts: Record<Category, number> = {
    'Coding': 0,
    'Designing': 0,
    'Reading Documentation': 0,
    'Writing': 0,
    'Entertainment/Social': 0
  }

  for (const title of recentTitles) {
    const lowerTitle = title.toLowerCase()

    // Look for matches
    for (const [category, keywords] of Object.entries(KEYWORDS) as [Category, string[]][]) {
      if (keywords.some(k => lowerTitle.includes(k))) {
        voteCounts[category] += 1
        break // Count highest priority first match per window
      }
    }
  }

  const productiveCategories: Category[] = ['Coding', 'Designing', 'Reading Documentation', 'Writing']

  let bestCategory: Category | null = null
  let maxVotes = 0

  // We weight productive slightly higher in ties by doing checking it first or filtering
  for (const [cat, votes] of Object.entries(voteCounts) as [Category, number][]) {
    if (votes > maxVotes) {
      maxVotes = votes
      bestCategory = cat
    } else if (votes === maxVotes && maxVotes > 0 && productiveCategories.includes(cat) && bestCategory === 'Entertainment/Social') {
      // In a tie between Productive and Entertainment, productive wins
      bestCategory = cat
    }
  }

  if (bestCategory && productiveCategories.includes(bestCategory)) {
    return { isProductive: true, inferredTask: bestCategory }
  }

  return { isProductive: false }
}

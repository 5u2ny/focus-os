import { expect, test, describe } from 'vitest'
import { classifyTask } from './taskClassifier'

describe('classifyTask', () => {
  test('correctly identifies Coding from IDE titles across platforms', () => {
    // VS Code (Windows/Mac)
    expect(classifyTask(['focus-app - Visual Studio Code', 'App.tsx - VS Code'])).toEqual({
      isProductive: true,
      inferredTask: 'Coding'
    })

    // WebStorm / IntelliJ
    expect(classifyTask(['focus-app [~/projects/focus] - ... - IntelliJ IDEA'])).toEqual({
      isProductive: true,
      inferredTask: 'Coding'
    })
  })

  test('correctly identifies Design from Figma and design tools', () => {
    expect(classifyTask(['Figma', 'Landing Page Design - Figma'])).toEqual({
      isProductive: true,
      inferredTask: 'Designing'
    })
  })

  test('correctly ignores entertainment streaming and social media regardless of browser', () => {
    expect(classifyTask(['Netflix', 'YouTube - Chrome', 'Twitter / X - Safari', 'Spotify'])).toEqual({
      isProductive: false,
      inferredTask: undefined
    })
  })

  test('does not treat incidental x characters in unrelated titles as social media', () => {
    expect(classifyTask(['Excel - Microsoft', 'Inbox - Gmail', 'Text Editor - Chrome'])).toEqual({
      isProductive: false,
      inferredTask: undefined
    })
  })

  test('identifies documentation and research reading across browsers', () => {
    expect(classifyTask(['React Docs - Firefox', 'Stack Overflow - Chrome', 'MDN Web Docs - Safari'])).toEqual({
      isProductive: true,
      inferredTask: 'Reading Documentation'
    })
  })

  test('defaults to checking the majority of the context array to avoid flickering', () => {
    // user looks at youtube for 1 title, but vs code for 5
    const context = [
      'App.tsx - VS Code',
      'App.tsx - VS Code',
      'App.tsx - VS Code',
      'YouTube - Chrome',
      'App.tsx - VS Code'
    ]
    expect(classifyTask(context)).toEqual({
      isProductive: true,
      inferredTask: 'Coding'
    })
  })

  test('returns primarily the productive context when evenly split', () => {
    // user looks at twitter for 2 titles, figma for 2
    const context = [
      'Twitter',
      'Twitter',
      'Figma',
      'Figma'
    ]
    expect(classifyTask(context)).toEqual({
      isProductive: true,
      inferredTask: 'Designing'
    })
  })
})

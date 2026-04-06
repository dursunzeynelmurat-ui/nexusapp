import { create } from 'zustand'

interface TutorialState {
  isOpen:      boolean
  currentStep: number
  open:        () => void
  close:       () => void
  next:        () => void
  prev:        () => void
  goTo:        (step: number) => void
}

export const useTutorialStore = create<TutorialState>((set) => ({
  isOpen:      false,
  currentStep: 0,

  open:  () => set({ isOpen: true,  currentStep: 0 }),
  close: () => set({ isOpen: false }),
  next:  () => set((s) => ({ currentStep: s.currentStep + 1 })),
  prev:  () => set((s) => ({ currentStep: Math.max(0, s.currentStep - 1) })),
  goTo:  (step) => set({ currentStep: step }),
}))

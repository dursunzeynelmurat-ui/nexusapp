import { create } from 'zustand'

interface StatusEvent {
  type:       'published' | 'failed'
  scheduleId: string
  postId?:    string
  error?:     string
  timestamp:  number
}

interface StatusState {
  events: StatusEvent[]
  addEvent: (event: Omit<StatusEvent, 'timestamp'>) => void
  clearEvents: () => void
}

export const useStatusStore = create<StatusState>((set) => ({
  events: [],

  addEvent: (event) =>
    set((s) => ({
      events: [{ ...event, timestamp: Date.now() }, ...s.events].slice(0, 50),
    })),

  clearEvents: () => set({ events: [] }),
}))

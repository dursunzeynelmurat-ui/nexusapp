import { create } from 'zustand'

export type SessionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'QR_READY'

export interface WhatsAppSession {
  id:          string
  sessionId:   string
  status:      SessionStatus
  phoneNumber?: string
  displayName?: string
  createdAt:   string
}

interface QRData {
  sessionId: string
  qr:        string
}

interface WhatsAppState {
  sessions:          WhatsAppSession[]
  activeQR:          QRData | null
  isConnecting:      boolean

  setSessions:       (sessions: WhatsAppSession[]) => void
  updateSession:     (sessionId: string, update: Partial<WhatsAppSession>) => void
  setQR:             (data: QRData | null) => void
  setConnecting:     (v: boolean) => void
  markConnected:     (sessionId: string, phoneNumber: string, displayName: string) => void
  markDisconnected:  (sessionId: string) => void
}

export const useWhatsAppStore = create<WhatsAppState>((set) => ({
  sessions:     [],
  activeQR:     null,
  isConnecting: false,

  setSessions:   (sessions) => set({ sessions }),
  setQR:         (data)     => set({ activeQR: data }),
  setConnecting: (v)        => set({ isConnecting: v }),

  updateSession: (sessionId, update) =>
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.sessionId === sessionId ? { ...sess, ...update } : sess
      ),
    })),

  markConnected: (sessionId, phoneNumber, displayName) =>
    set((s) => ({
      activeQR:  null,
      sessions: s.sessions.map((sess) =>
        sess.sessionId === sessionId
          ? { ...sess, status: 'CONNECTED', phoneNumber, displayName }
          : sess
      ),
    })),

  markDisconnected: (sessionId) =>
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.sessionId === sessionId ? { ...sess, status: 'DISCONNECTED' } : sess
      ),
    })),
}))

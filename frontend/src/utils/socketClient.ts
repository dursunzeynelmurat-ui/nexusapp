import { io, type Socket } from 'socket.io-client'

const SOCKET_URL = window.location.origin

function createNamespaceSocket(namespace: string): Socket {
  const token = localStorage.getItem('accessToken')
  const socket = io(`${SOCKET_URL}${namespace}`, {
    auth:        { token },
    transports:  ['websocket', 'polling'],
    autoConnect: false,
  })
  // Re-attach fresh token on every reconnect attempt
  socket.on('connect_error', () => {
    socket.auth = { token: localStorage.getItem('accessToken') }
  })
  return socket
}

let whatsappSocket: Socket | null = null
let campaignSocket: Socket | null = null
let statusSocket:   Socket | null = null

export function getWhatsAppSocket(): Socket {
  if (!whatsappSocket) {
    whatsappSocket = createNamespaceSocket('/whatsapp')
  }
  return whatsappSocket
}

export function getCampaignSocket(): Socket {
  if (!campaignSocket) {
    campaignSocket = createNamespaceSocket('/campaigns')
  }
  return campaignSocket
}

export function getStatusSocket(): Socket {
  if (!statusSocket) {
    statusSocket = createNamespaceSocket('/status')
  }
  return statusSocket
}

export function disconnectAll(): void {
  whatsappSocket?.disconnect()
  campaignSocket?.disconnect()
  statusSocket?.disconnect()
  whatsappSocket = null
  campaignSocket = null
  statusSocket   = null
}

export function reconnectAll(): void {
  const token = localStorage.getItem('accessToken')
  const updateAuth = (s: Socket | null) => {
    if (s) {
      s.auth = { token }
      s.connect()
    }
  }
  updateAuth(whatsappSocket)
  updateAuth(campaignSocket)
  updateAuth(statusSocket)
}

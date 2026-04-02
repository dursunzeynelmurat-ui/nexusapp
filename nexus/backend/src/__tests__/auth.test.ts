import { register, login, refreshTokens, logout, getUserById } from '../auth/auth.service'
import { prisma } from '../prisma/client'

// Mock prisma
jest.mock('../prisma/client', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create:     jest.fn(),
    },
    refreshToken: {
      create:     jest.fn(),
      findUnique: jest.fn(),
      delete:     jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

const TEST_USER = {
  id:           'user-1',
  email:        'test@example.com',
  passwordHash: '$2b$12$somehashedpassword',
  name:         'Test User',
  role:         'USER' as const,
  createdAt:    new Date(),
  updatedAt:    new Date(),
}

beforeEach(() => {
  jest.clearAllMocks()

  // Silence logger in tests
  jest.spyOn(console, 'info').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('Auth service', () => {
  describe('register', () => {
    it('throws if email already in use', async () => {
      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce(TEST_USER)
      await expect(register({ email: TEST_USER.email, password: 'password123', name: 'Test' }))
        .rejects.toThrow('Email already in use')
    })

    it('creates user and returns token pair', async () => {
      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null)
      ;(mockPrisma.user.create as jest.Mock).mockResolvedValueOnce(TEST_USER)
      ;(mockPrisma.refreshToken.create as jest.Mock).mockResolvedValueOnce({})

      const result = await register({ email: TEST_USER.email, password: 'password123', name: 'Test User' })

      expect(result.user.email).toBe(TEST_USER.email)
      expect(result.tokens.accessToken).toBeDefined()
      expect(result.tokens.refreshToken).toBeDefined()
    })
  })

  describe('login', () => {
    it('throws on invalid email', async () => {
      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null)
      await expect(login({ email: 'no@one.com', password: 'pass' }))
        .rejects.toThrow('Invalid credentials')
    })

    it('throws on wrong password', async () => {
      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce(TEST_USER)
      // bcrypt.compare will be false since the hash doesn't match
      await expect(login({ email: TEST_USER.email, password: 'wrongpassword' }))
        .rejects.toThrow('Invalid credentials')
    })
  })

  describe('logout', () => {
    it('calls deleteMany on refresh tokens', async () => {
      ;(mockPrisma.refreshToken.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 })
      await logout('some-refresh-token')
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { token: 'some-refresh-token' },
      })
    })
  })

  describe('getUserById', () => {
    it('returns null when user not found', async () => {
      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null)
      const result = await getUserById('nonexistent')
      expect(result).toBeNull()
    })

    it('returns auth user when found', async () => {
      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce(TEST_USER)
      const result = await getUserById(TEST_USER.id)
      expect(result?.id).toBe(TEST_USER.id)
      expect(result?.email).toBe(TEST_USER.email)
    })
  })
})

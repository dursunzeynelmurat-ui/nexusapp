import { createCampaign, startCampaign, pauseCampaign } from '../campaigns/campaign.service'
import { prisma } from '../prisma/client'
import { campaignQueue } from '../campaigns/campaign.queue'

jest.mock('../prisma/client', () => ({
  prisma: {
    campaign: {
      create:     jest.fn(),
      findFirst:  jest.fn(),
      update:     jest.fn(),
    },
    list: {
      findFirst: jest.fn(),
    },
  },
}))

jest.mock('../campaigns/campaign.queue', () => ({
  campaignQueue: {
    add:    jest.fn().mockResolvedValue({}),
    getJob: jest.fn().mockResolvedValue(null),
    close:  jest.fn(),
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

const MOCK_LIST = {
  id:       'list-1',
  userId:   'user-1',
  name:     'Test List',
  contacts: [
    { contact: { id: 'c-1', phone: '1111', name: 'A', isGroup: false, userId: 'user-1', createdAt: new Date(), metadata: null } },
    { contact: { id: 'c-2', phone: '2222', name: 'B', isGroup: false, userId: 'user-1', createdAt: new Date(), metadata: null } },
  ],
  description: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  campaigns: [],
}

const MOCK_CAMPAIGN = {
  id:         'camp-1',
  userId:     'user-1',
  listId:     'list-1',
  sessionId:  'sess-1',
  name:       'Test Campaign',
  message:    'Hello!',
  mediaUrl:   null,
  status:     'DRAFT',
  totalCount: 2,
  sentCount:  0,
  failedCount: 0,
  startedAt:  null,
  completedAt: null,
  createdAt:  new Date(),
  updatedAt:  new Date(),
  campaignContacts: [],
}

beforeEach(() => jest.clearAllMocks())

describe('Campaign service', () => {
  describe('createCampaign', () => {
    it('throws if list not found', async () => {
      ;(mockPrisma.list.findFirst as jest.Mock).mockResolvedValueOnce(null)
      await expect(
        createCampaign('user-1', { listId: 'no-list', name: 'C', message: 'Hi', sessionId: 's-1' })
      ).rejects.toThrow('List not found')
    })

    it('throws if list has no contacts', async () => {
      ;(mockPrisma.list.findFirst as jest.Mock).mockResolvedValueOnce({ ...MOCK_LIST, contacts: [] })
      await expect(
        createCampaign('user-1', { listId: 'list-1', name: 'C', message: 'Hi', sessionId: 's-1' })
      ).rejects.toThrow('List has no contacts')
    })

    it('creates campaign with correct totalCount', async () => {
      ;(mockPrisma.list.findFirst as jest.Mock).mockResolvedValueOnce(MOCK_LIST)
      ;(mockPrisma.campaign.create as jest.Mock).mockResolvedValueOnce(MOCK_CAMPAIGN)

      const result = await createCampaign('user-1', {
        listId: 'list-1', name: 'Test Campaign', message: 'Hello!', sessionId: 'sess-1',
      })

      expect(mockPrisma.campaign.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ totalCount: 2 }),
        })
      )
      expect(result.id).toBe('camp-1')
    })
  })

  describe('startCampaign', () => {
    it('throws if campaign not found', async () => {
      ;(mockPrisma.campaign.findFirst as jest.Mock).mockResolvedValueOnce(null)
      await expect(startCampaign('no-camp', 'user-1')).rejects.toThrow('Campaign not found')
    })

    it('throws if campaign cannot be started from RUNNING status', async () => {
      ;(mockPrisma.campaign.findFirst as jest.Mock).mockResolvedValueOnce({ ...MOCK_CAMPAIGN, status: 'RUNNING' })
      await expect(startCampaign('camp-1', 'user-1')).rejects.toThrow('Campaign cannot be started')
    })

    it('queues campaign and returns QUEUED status', async () => {
      ;(mockPrisma.campaign.findFirst as jest.Mock).mockResolvedValueOnce(MOCK_CAMPAIGN)
      ;(mockPrisma.campaign.update as jest.Mock).mockResolvedValueOnce({ ...MOCK_CAMPAIGN, status: 'QUEUED' })

      const result = await startCampaign('camp-1', 'user-1')

      expect(campaignQueue.add).toHaveBeenCalledWith({ campaignId: 'camp-1' }, { jobId: 'camp-1' })
      expect(result.status).toBe('QUEUED')
    })
  })

  describe('pauseCampaign', () => {
    it('throws if campaign not in RUNNING or QUEUED state', async () => {
      ;(mockPrisma.campaign.findFirst as jest.Mock).mockResolvedValueOnce({ ...MOCK_CAMPAIGN, status: 'DRAFT' })
      await expect(pauseCampaign('camp-1', 'user-1')).rejects.toThrow('Campaign cannot be paused')
    })

    it('pauses a running campaign', async () => {
      ;(mockPrisma.campaign.findFirst as jest.Mock).mockResolvedValueOnce({ ...MOCK_CAMPAIGN, status: 'RUNNING' })
      ;(mockPrisma.campaign.update as jest.Mock).mockResolvedValueOnce({ ...MOCK_CAMPAIGN, status: 'PAUSED' })

      const result = await pauseCampaign('camp-1', 'user-1')
      expect(result.status).toBe('PAUSED')
    })
  })
})

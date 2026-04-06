import { create } from 'zustand'

export interface CampaignProgress {
  campaignId:  string
  sentCount:   number
  failedCount: number
  totalCount:  number
  percent:     number
}

interface CampaignState {
  progressMap: Record<string, CampaignProgress>

  setProgress: (data: CampaignProgress) => void
  clearProgress: (campaignId: string) => void
}

export const useCampaignStore = create<CampaignState>((set) => ({
  progressMap: {},

  setProgress: (data) =>
    set((s) => ({
      progressMap: { ...s.progressMap, [data.campaignId]: data },
    })),

  clearProgress: (campaignId) =>
    set((s) => {
      const next = { ...s.progressMap }
      delete next[campaignId]
      return { progressMap: next }
    }),
}))

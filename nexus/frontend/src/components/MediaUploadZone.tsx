import { useState, useCallback, useRef } from 'react'
import { Upload, X, File, ImageIcon, Film } from 'lucide-react'
import clsx from 'clsx'
import api from '../utils/apiClient'

interface StoredFile {
  key:      string
  url:      string
  mimeType: string
  size:     number
}

interface Props {
  onUpload:  (file: StoredFile) => void
  onRemove?: () => void
  value?:    StoredFile | null
  accept?:   string
  label?:    string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)         return `${bytes} B`
  if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('image/')) return <ImageIcon size={20} className="text-accent" />
  if (mimeType.startsWith('video/')) return <Film       size={20} className="text-blue-400" />
  return <File size={20} className="text-text-muted" />
}

export function MediaUploadZone({ onUpload, onRemove, value, accept, label }: Props) {
  const [dragging,  setDragging]  = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress,  setProgress]  = useState(0)
  const [error,     setError]     = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadFile = useCallback(async (file: File) => {
    setError(null)
    setUploading(true)
    setProgress(0)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await api.post('/media/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100))
        },
      })
      onUpload(res.data as StoredFile)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Upload failed'
      setError(msg)
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }, [onUpload])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }, [uploadFile])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    e.target.value = ''
  }

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
        <FileIcon mimeType={value.mimeType} />
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm text-text-primary">{value.key}</p>
          <p className="text-xs text-text-muted">{formatBytes(value.size)}</p>
        </div>
        {onRemove && (
          <button
            onClick={onRemove}
            className="rounded-lg p-1 text-text-muted hover:bg-secondary hover:text-red-400 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        className={clsx(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 transition-colors',
          dragging
            ? 'border-accent bg-accent/5'
            : 'border-border bg-secondary/50 hover:border-accent/50 hover:bg-accent/5'
        )}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 rounded-full border-2 border-accent/20 border-t-accent animate-spin" />
            <p className="text-sm text-text-muted">{progress}%</p>
          </div>
        ) : (
          <>
            <Upload size={24} className="text-text-muted" />
            <p className="text-sm text-text-muted">
              {label ?? 'Drop a file here or click to upload'}
            </p>
            <p className="text-xs text-text-muted opacity-60">Max 16 MB</p>
          </>
        )}
      </div>

      {error && (
        <p className="mt-1 text-xs text-red-400">{error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleChange}
      />
    </div>
  )
}

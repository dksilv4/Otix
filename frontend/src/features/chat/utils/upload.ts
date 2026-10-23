import { apiClient } from '@/lib/api'

export async function uploadChatAttachment(file: File): Promise<{
  fileName: string
  fileUrl: string
  contentType: string
  fileSize: number
}> {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await apiClient.post<{ url: string }>('/upload', formData)

  return {
    fileName: file.name,
    fileUrl: data.url,
    contentType: file.type || 'application/octet-stream',
    fileSize: file.size,
  }
}

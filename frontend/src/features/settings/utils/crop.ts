export const getCroppedBlob = async (
  imageUrl: string,
  pixelCrop: { x: number; y: number; width: number; height: number },
  outputSize: { width: number; height: number },
  format: 'image/jpeg' | 'image/webp' | 'image/png' = 'image/webp',
  quality = 0.92,
): Promise<Blob> => {
  const response = await fetch(imageUrl)
  const blob = await response.blob()
  const image = await createImageBitmap(blob)

  const canvas = document.createElement('canvas')
  canvas.width = outputSize.width
  canvas.height = outputSize.height
  const ctx = canvas.getContext('2d')!

  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, outputSize.width, outputSize.height,
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result)
        else reject(new Error('Canvas toBlob returned null'))
      },
      format,
      quality,
    )
  })
}

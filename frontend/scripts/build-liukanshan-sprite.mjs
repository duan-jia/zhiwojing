import { chromium } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontendDir = path.resolve(scriptDir, '..')
const sourcePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(frontendDir, '../material/test/12黑.png')
const outputPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.resolve(frontendDir, 'public/spritesheets/liukanshan.png')

const source = await readFile(sourcePath)
const sourceUrl = `data:image/png;base64,${source.toString('base64')}`
const browser = await chromium.launch({ headless: true })

try {
  const page = await browser.newPage()
  const result = await page.evaluate(async ({ sourceUrl }) => {
    const image = new Image()
    image.src = sourceUrl
    await image.decode()

    if (image.width % 3 !== 0 || image.height % 4 !== 0) {
      throw new Error(`Expected a 3x4 source grid, received ${image.width}x${image.height}`)
    }

    const sourceCellWidth = image.width / 3
    const sourceCellHeight = image.height / 4
    const outputCellSize = 64
    const contentHeight = 56
    const baseline = 61
    const alphaThreshold = 64
    const sourceCanvas = document.createElement('canvas')
    sourceCanvas.width = image.width
    sourceCanvas.height = image.height
    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true })
    sourceContext.drawImage(image, 0, 0)

    const outputCanvas = document.createElement('canvas')
    outputCanvas.width = outputCellSize * 3
    outputCanvas.height = outputCellSize * 4
    const outputContext = outputCanvas.getContext('2d')
    outputContext.imageSmoothingEnabled = false

    const frames = []
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        const sourceX = column * sourceCellWidth
        const sourceY = row * sourceCellHeight
        const pixels = sourceContext.getImageData(
          sourceX,
          sourceY,
          sourceCellWidth,
          sourceCellHeight,
        ).data
        let minX = sourceCellWidth
        let minY = sourceCellHeight
        let maxX = -1
        let maxY = -1

        for (let y = 0; y < sourceCellHeight; y += 1) {
          for (let x = 0; x < sourceCellWidth; x += 1) {
            if (pixels[(y * sourceCellWidth + x) * 4 + 3] < alphaThreshold) continue
            minX = Math.min(minX, x)
            minY = Math.min(minY, y)
            maxX = Math.max(maxX, x)
            maxY = Math.max(maxY, y)
          }
        }

        if (maxX < minX || maxY < minY) {
          throw new Error(`No visible character pixels in frame ${row + 1}:${column + 1}`)
        }

        const visibleHeight = maxY - minY + 1
        const scale = contentHeight / visibleHeight
        const visibleCenterX = (minX + maxX + 1) / 2
        const frameCanvas = document.createElement('canvas')
        frameCanvas.width = outputCellSize
        frameCanvas.height = outputCellSize
        const frameContext = frameCanvas.getContext('2d')
        frameContext.imageSmoothingEnabled = false
        frameContext.drawImage(
          image,
          sourceX,
          sourceY,
          sourceCellWidth,
          sourceCellHeight,
          outputCellSize / 2 - visibleCenterX * scale,
          baseline - (maxY + 1) * scale,
          sourceCellWidth * scale,
          sourceCellHeight * scale,
        )
        outputContext.drawImage(
          frameCanvas,
          column * outputCellSize,
          row * outputCellSize,
        )
        frames.push({ row, column, minX, minY, maxX, maxY, scale })
      }
    }

    return {
      png: outputCanvas.toDataURL('image/png').split(',')[1],
      width: outputCanvas.width,
      height: outputCanvas.height,
      frames,
    }
  }, { sourceUrl })

  await writeFile(outputPath, Buffer.from(result.png, 'base64'))
  console.log(`Wrote ${result.width}x${result.height} spritesheet to ${outputPath}`)
  for (const frame of result.frames) {
    console.log(
      `frame ${frame.row + 1}:${frame.column + 1} `
      + `bbox=${frame.minX},${frame.minY}-${frame.maxX},${frame.maxY} `
      + `scale=${frame.scale.toFixed(4)}`,
    )
  }
} finally {
  await browser.close()
}

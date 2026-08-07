/**
 * Cross-platform file save helper.
 * Uses Tauri dialog/fs plugins when running inside Tauri,
 * falls back to the browser File System Access API or download link.
 */

function isTauri() {
  return typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined
}

async function saveWithTauri(blob, defaultName, extensions, description) {
  const { save } = await import('@tauri-apps/plugin-dialog')
  const { writeFile } = await import('@tauri-apps/plugin-fs')

  const filename = await save({
    defaultPath: defaultName,
    filters: [{ name: description, extensions }],
  })

  if (!filename) return false

  const arrayBuffer = await blob.arrayBuffer()
  await writeFile(filename, new Uint8Array(arrayBuffer))
  return true
}

async function saveWithBrowser(blob, defaultName) {
  if ('showSaveFilePicker' in window) {
    try {
      const ext = defaultName.split('.').pop() || 'bin'
      const handle = await window.showSaveFilePicker({
        suggestedName: defaultName,
        types: [{
          description: 'File',
          accept: { 'application/octet-stream': [`.${ext}`] },
        }],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return true
    } catch (err) {
      if (err.name === 'AbortError') return false
      throw err
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.style.display = 'none'
  a.href = url
  a.download = defaultName
  document.body.appendChild(a)
  a.click()
  URL.revokeObjectURL(url)
  document.body.removeChild(a)
  return true
}

export async function saveBlob(blob, defaultName, extensions = ['bin'], description = 'File') {
  if (isTauri()) {
    return saveWithTauri(blob, defaultName, extensions, description)
  }
  return saveWithBrowser(blob, defaultName)
}

export async function saveText(text, defaultName, extensions = ['txt'], description = 'Text file') {
  const blob = new Blob([text], { type: 'text/plain' })
  return saveBlob(blob, defaultName, extensions, description)
}

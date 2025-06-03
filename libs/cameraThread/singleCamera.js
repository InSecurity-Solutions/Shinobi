const fs = require('fs')
const { exec, spawn } = require('child_process')
const isWindows = process.platform === 'win32' || process.platform === 'win64'

// --- helper -----------------------------------------------------------
const safeWriteStderr = (payload) => {
  try {
    const out = Array.isArray(payload) ? JSON.stringify(payload) : String(payload)
    process.stderr.write(Buffer.from(out.slice(0, 2 * 1024), 'utf8')) // cap 2 KiB
  } catch (_) {}
}

process.logData = safeWriteStderr
process.send = process.send || function () {}

// --- config  ----------------------------------------------------------
if (!process.argv[2] || !process.argv[3]) {
  return safeWriteStderr('Missing FFMPEG path or JSON payload')
}

const ffmpegAbsolutePath = process.argv[2].trim()
const jsonData = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))
const {
  globalInfo: { config },
  cmd: ffmpegCommandString,
  rawMonitorConfig,
  pipes: stdioPipes = []
} = jsonData

const { fetchTimeout } = require('../basic/utils.js')(process.cwd(), config)
const dataPort = require('./libs/dataPortConnection.js')(jsonData,
  () => dataPort.send(jsonData.dataPortToken),           // onConnected
  (err) => safeWriteStderr(['dataPort:Connection:Error', err]), // onError
  (e)   => safeWriteStderr(['dataPort:Connection:Closed', e])   // onClose
)

// Make sure we can terminate the websocket cleanly later
const destroyDataPort = () => {
  if (dataPort && typeof dataPort.close === 'function') dataPort.close()
}

// --- global resource holders -----------------------------------------
let stdioWriters = []
let cameraProcess = null
let jpegInterval  = null

// Build stdio array (keeping original loop logic per request – suggestion #2 skipped)
const newPipes = []
for (let i = 0; i < stdioPipes; i++) {
  switch (i) {
    case 0:
      newPipes[i] = 'pipe'
      break
    case 1:
      newPipes[i] = 1
      break
    case 2:
      newPipes[i] = 2
      break
    case 3:
      stdioWriters[i] = fs.createWriteStream(null, { fd: i, end: false })
      newPipes[i] = (rawMonitorConfig.details.detector === '1' && rawMonitorConfig.details.detector_pam === '1') ? 'pipe' : stdioWriters[i]
      break
    case 5:
      stdioWriters[i] = fs.createWriteStream(null, { fd: i, end: false })
      newPipes[i] = 'pipe'
      break
    default:
      stdioWriters[i] = fs.createWriteStream(null, { fd: i, end: false })
      newPipes[i] = stdioWriters[i]
      break
  }
}

// Guard writers against silent errors
stdioWriters.forEach((w) => w && w.on('error', (e) => safeWriteStderr(e)))

// --- child process ----------------------------------------------------
const spawnCamera = () => {
  cameraProcess = spawn(ffmpegAbsolutePath, ffmpegCommandString, { detached: true, stdio: newPipes })

  // forward extra stdout (pipe 5) with automatic listener removal
  const pipe5 = cameraProcess.stdio[5]
  const onPipe5Data = (d) => stdioWriters[5]?.write(d)
  pipe5?.on('data', onPipe5Data)

  cameraProcess.once('close', () => {
    safeWriteStderr('FFmpeg process closed')
    pipe5?.off('data', onPipe5Data)
    cleanupWriters()
    clearInterval(jpegInterval)
    jpegInterval = null
    destroyDataPort()
    process.exit()
  })
}

// ------------------------------------------------ jpeg puller ---------
const startJpegPuller = () => {
  if (rawMonitorConfig.type !== 'jpeg') return
  safeWriteStderr('JPEG Input Type Detected')

  const fps = parseInt(rawMonitorConfig.details.sfps) || 1
  if (Number.isNaN(fps) || fps <= 0) {
    safeWriteStderr('Invalid capture FPS')
    return
  }
  safeWriteStderr(`Running at ${fps} FPS`)

  const fetchAndPipe = async () => {
    try {
      const res = await fetchTimeout(buildMonitorUrl(rawMonitorConfig), 15000)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      res.body.pipe(cameraProcess.stdin, { end: false })
    } catch (err) {
      safeWriteStderr(err.message)
    }
  }

  jpegInterval = setInterval(fetchAndPipe, 1000 / fps)
}

// ------------------------------------------------ misc helpers --------
const buildMonitorUrl = (e, noPath) => {
  let auth = ''
  if (e.details.muser && e.details.muser !== '' && !e.host.includes('@')) {
    auth = `${e.details.muser}:${e.details.mpass}@`
  }
  const portPart = (e.port == 80 && e.details.port_force !== '1') ? '' : `:${e.port}`
  return `${e.protocol}://${auth}${e.host}${portPart}${noPath ? '' : e.path}`
}

const cleanupWriters = () => {
  stdioWriters.forEach((w, idx) => {
    if (!w) return
    w.removeAllListeners()
    w.end()
    w.destroy?.()
    stdioWriters[idx] = null
  })
  stdioWriters = []
}

// ------------------------------------------------ exit handling -------
const exitAction = () => {
  try {
    if (jpegInterval) clearInterval(jpegInterval)
    cleanupWriters()
    destroyDataPort()
    if (cameraProcess) {
      if (isWindows) spawn('taskkill', ['/pid', cameraProcess.pid, '/f', '/t'])
      else process.kill(-cameraProcess.pid)
    }
  } catch (_) {}
}

const registerOnce = (evt, fn) => {
  if (!process.listenerCount(evt)) process.once(evt, fn)
}

registerOnce('SIGTERM', exitAction)
registerOnce('SIGINT', exitAction)
registerOnce('exit', exitAction)
registerOnce('uncaughtException', (err) => {
  safeWriteStderr(['Uncaught Exception', err.message])
  exitAction()
})

// ------------------------------------------------ bootstrap -----------
spawnCamera()
startJpegPuller()

// dashcam / socket pass‑through remains unchanged
if (rawMonitorConfig.type === 'dashcam' || rawMonitorConfig.type === 'socket') {
  process.stdin.on('data', (d) => cameraProcess.stdin.write(d))
}

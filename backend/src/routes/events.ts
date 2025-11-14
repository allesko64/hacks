import { Router } from 'express'
import { subscribeToEvents } from '../events/bus'

const router = Router()

router.get('/', (_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  res.write(`event: ready\ndata: {}\n\n`)

  const keepAlive = setInterval(() => {
    res.write(`event: ping\ndata: {}\n\n`)
  }, 25000)

  const unsubscribe = subscribeToEvents((event) => {
    res.write(`event: ${event.type}\n`)
    res.write(`data: ${JSON.stringify({ payload: event.data, at: event.at })}\n\n`)
  })

  const closeHandler = () => {
    clearInterval(keepAlive)
    unsubscribe()
    res.end()
  }

  res.on('close', closeHandler)
  res.on('end', closeHandler)
})

export default router



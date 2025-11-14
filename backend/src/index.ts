// backend/src/index.ts
import express from 'express'
import cors from 'cors'

import { getAgent } from './agent'
import didRoutes from './routes/did'
import vcRoutes from './routes/vc'
import vpRouter from './routes/vp'
import authRoutes from './routes/auth'
import documentsRoutes from './routes/documents'
import requestsRoutes from './routes/requests'
import credentialsRoutes from './routes/credentials'
import citizensRoutes from './routes/citizens'
import accessRoutes from './routes/access'
import eventsRoutes from './routes/events'
import adminRoutes from './routes/admin'

async function main() {
  // initialize agent first (ensures DB + migrations etc run)
  await getAgent()

  const app = express()

  app.use(express.json())
  app.use(
    cors({
      origin: true,
      credentials: true
    })
  )

  app.use('/did', didRoutes)
  app.use('/vc', vcRoutes)
  app.use('/vp', vpRouter)
  app.use('/auth', authRoutes)
  app.use('/documents', documentsRoutes)
  app.use('/requests', requestsRoutes)
  app.use('/credentials', credentialsRoutes)
  app.use('/citizens', citizensRoutes)
  app.use('/access', accessRoutes)
  app.use('/events', eventsRoutes)
  app.use('/admin', adminRoutes)

  app.listen(3000, () => {
    console.log('Backend running on http://localhost:3000')
    console.log(
      'Endpoints ready: /did /vc /vp /auth /documents /requests /credentials /citizens /access /events /admin'
    )
  })
}

main().catch((err) => {
  console.error('Startup error:', err)
  process.exit(1)
})

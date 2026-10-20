import express from 'express'
import authRouter from '../src/routes/authRoute.js'
import errorHandler from './middleware/errorHandler.js'
const app = express()

app.use(express.json())
app.use(errorHandler)

app.use('/api', authRouter)

export default app;
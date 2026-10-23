import express from 'express'
import swaggerUi from 'swagger-ui-express'
import authRouter from '../src/routes/authRoute.js'
import productRouter from './routes/productRoute.js'
import orderRouter from './routes/orderRoute.js'
import errorHandler from './middleware/errorHandler.js'
import swaggerSpec from './configs/swagger.js'
const app = express()

app.use(express.json())

// API documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec))

app.use('/api', authRouter)
app.use('/api', productRouter)
app.use('/api', orderRouter)

// Error handler must be registered after all routes
app.use(errorHandler)

export default app;

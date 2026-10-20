import 'dotenv/config'
import app from '../backend/src/app.js'

const PORT = process.env.PORT || 3000

const server = app.listen(PORT, () => {
    console.log(`server run on: http://localhost:${PORT}`)
})
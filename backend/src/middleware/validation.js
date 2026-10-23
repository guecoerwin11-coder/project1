import jwt from 'jsonwebtoken'
import { Unauthorized } from '../utils/errorClass.js'

const validation = (req, res, next) => {
    try{
        const authHead = req.headers.authorization;

        if(!authHead || !authHead.startsWith('Bearer ')){
            throw new Unauthorized("Missing or invalid authorization header")
        }

        const token = authHead.split(' ')[1];
        const decode = jwt.verify(token, process.env.JWT_PASS)

        req.user = decode
        next()
    }catch(err){
        // jwt.verify throws its own errors for bad or expired tokens
        if(err instanceof Unauthorized){
            return next(err)
        }
        next(new Unauthorized("Invalid Token or Expired Token"))
    }
}

export default validation

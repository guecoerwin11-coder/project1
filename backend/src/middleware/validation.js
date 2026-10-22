import jwt from 'jsonwebtoken'
import { Unauthorized } from '../utils/errorClass.js'

const validation = (req, res, next) => {
    try{

        const authHead = req.headers.authorization;

        if(!authHead){
            throw new Unauthorized("Invalid Token or Expired Token")
        }

        const veri = authHead.split(' ')[1];
        const decode = jwt.verify(veri, process.env.JWT_PASS)

        req.user = decode
        next()
    }catch(err){
        next()
    }
}

export default validation
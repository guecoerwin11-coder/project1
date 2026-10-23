import prisma from '../configs/postgres.js'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { BadRequest, Unauthorized, Forbidden, NotFound, InternalServer } from '../utils/errorClass.js'
import logger from '../logger/logger.js'

const accessToken = (user) => {
    return jwt.sign(
        {id: user.id, userName: user.userName, email: user.email, roles: user.roles},
        process.env.JWT_PASS,
        {
            expiresIn: '2d'
        }
    )
}
const refreshToken = (user) => {
    return jwt.sign(
        {id: user.id, userName: user.userName, email: user.email, roles: user.roles},
        process.env.JWT_FRESH,
        {
            expiresIn: '7d'
        }
    )
}

const register = async  (req, res, next) => {
    try{

        const {userName, email, password} = req.body;

        if(!userName || !email || !password){
            logger.warn({
                message: "Failed register- empty input",
                ip: req.ip
            })
            throw new BadRequest("Must input the required field")
        }

        if(password.length < 6){
            throw new BadRequest('Password to short, must at least 6 more than character')
        }

        const isExist = await prisma.user.findUnique({
            where: {
                email: email
            }
        });

        if(isExist){
            logger.warn("Failed Register - email is already used")
            throw new Unauthorized("email is already used")
        }

        const salt = await bcrypt.genSalt(10);
        const hashPass = await bcrypt.hash(password, salt);

        const user = await prisma.user.create({
            data: {
                userName, email, password: hashPass
            }
        })

        const newToken = accessToken(user)

        logger.info({
            message: 'login sucess',
            id: user.id,
            email,
            ip: req.ip
        })

        res.status(201).json({
            message: 'register successful',
            accessToken: newToken
        })
    }
    catch(err){
        next(err)
    }
}

const login = async (req, res, next) => {
    try{
        const {email, password} = req.body;

        if(!email || !password){
            logger.warn({
                message: "Failed Login - Empty input required"
            })
            throw new BadRequest("must input the required fields")
        }

        const user = await prisma.user.findUnique({
            where: {
                email : email
            }
        });

        if(!user){
            logger.warn({
                message: "Failed Login - email is not registered"
            })
            throw new Unauthorized("email is not been registered")
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if(!isMatch){
            logger.warn({
                message: "Failed Login - Invalid Password"
            })
            throw new Unauthorized("invalid credentials or wrong password")
        }

        const newToken = accessToken(user);

        logger.info({
            message: "Login Success",
            email,
            ip: req.ip
        })
        
        res.status(200).json({
            message: "login success",
            accessToken: newToken
        })
    }catch(err){
        next(err)
    }
}

export {
    register, login
}
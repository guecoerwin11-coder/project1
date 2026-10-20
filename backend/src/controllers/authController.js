import prisma from '../configs/postgres.js'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { BadRequest, Unauthorized, Forbidden, NotFound, InternalServer } from '../utils/errorClass.js'

const accessToken = (user) => {
    return jwt.sign(
        {id: user.id, userName: user.userName, email: user.email},
        process.env.JWT_PASS,
        {
            expiresIn: '2d'
        }
    )
}

const refreshToken = (user) => {
    return jwt.sign(
        {id: user.id, userName: user.userName, email: user.email},
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
        const {userName, password} = req.body;

        if(!userName || !password){
            throw new BadRequest("must input the required fields")
        }

        const user = await prisma.user.findUnique({
            where: {
                email : email
            }
        });

        if(!user){
            throw new Unauthorized("email is not been registered")
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if(!isMatch){
            throw new Unauthorized("invalid credentials or wrong password")
        }

        const newToken = accessToken(user);

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
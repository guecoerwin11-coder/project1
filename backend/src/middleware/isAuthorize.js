import { Unauthorized, Forbidden } from '../utils/errorClass.js'

// Usage: router.post('/products', validation, isAuthorize('ADMIN', 'SELLER'), handler)
// Must run AFTER the validation middleware, which puts the decoded token on req.user.
const isAuthorize = (...allowedRoles) => {
    return (req, res, next) => {
        // validation should have set req.user. If not, the route is wired wrong.
        if(!req.user){
            return next(new Unauthorized("You must be logged in"))
        }

        if(!allowedRoles.includes(req.user.roles)){
            return next(new Forbidden("You do not have permission to do this"))
        }

        next()
    }
}

export default isAuthorize

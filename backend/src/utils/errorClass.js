class BadRequest extends Error{
    constructor(message){
        super(message);
        this.status = 400;
        this.name = "Bad Request Error"
    }
}

class Unauthorized extends Error{
    constructor(message){
        super(message);
        this.status = 401;
        this.name = "Unauthorized Error"
    }
}

class Forbidden extends Error{
    constructor(message){
        super(message);
        this.status = 403;
        this.name = "Forbidden Error"
    }
}

class NotFound extends Error{
    constructor(message){
        super(message);
        this.status = 404;
        this.name = "Not Found Error"
    }
}

class InternalServer extends Error{
    constructor(message){
        super(message);
        this.status = 500;
        this.name = "Internal Server Error"
    }
}

// A service the API depends on (like Redis) is down. The client can retry later.
class ServiceUnavailable extends Error{
    constructor(message){
        super(message);
        this.status = 503;
        this.name = "Service Unavailable Error"
    }
}

export {
    BadRequest, Unauthorized, NotFound, Forbidden, InternalServer, ServiceUnavailable
}
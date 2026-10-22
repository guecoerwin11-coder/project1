import logger from "../logger/logger.js";

const errorHandler = (err, req, res, next) => {
    const status = err.status || 500;
    const message = err.message || "Internal Server Error"

    // Log the error
    const errorLog = {
        message: err.message,
        status,
        name: err.name,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userId: req.user?.userId || 'anonymous',
        timestamp: new Date().toISOString(),
        stack: err.stack,
        requestBody: process.env.NODE_ENV === 'development' ? req.body : undefined
    };

    // Log based on status code
    if (status >= 500) {
        logger.error(errorLog);
    } else if (status >= 400) {
        logger.warn(errorLog);
    } else {
        logger.info(errorLog);
    }

    // Prepare error response
    const errorResponse = {
        success: false,
        error: {
            message,
            status
        }
    };

    // Add error name in development
    if (process.env.NODE_ENV === 'development') {
        errorResponse.error.name = err.name;
        errorResponse.error.stack = err.stack;
    }

    // Don't expose sensitive info in production
    if (status === 500 && process.env.NODE_ENV === 'production') {
        errorResponse.error.message = 'Internal server error. Contact support.';
    }

    res.status(status).json(errorResponse);
}
export default errorHandler
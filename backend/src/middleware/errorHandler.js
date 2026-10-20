const errorHandler = (err, req, res, next) => {
    const status = err.status || 500;
    const message = err.message || "Internal Server Error"

    console.log(`[${status}]: message: ${message}`)

    const response = {
        success: false,
        status: status,
        error: message,
        timestamps: new Date().toString()
    }

    res.status(status).json(response)
}

export default errorHandler
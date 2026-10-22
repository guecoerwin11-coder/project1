import winston from 'winston'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const logs = path.join(__dirname, '../../logs')

//if no folder named logs this will create
if(!fs.existsSync(logs)){
    fs.mkdirSync(logs);
}

//create a logger format
const customFormat = winston.format.combine(
    winston.format.timestamp({format: "YY:MM:DD HH:mm:ss"}),
    winston.format.errors({ stack: true }),
    winston.format.json()
);


//create file logs for error and success
const logger = winston.createLogger({
    level: "info",
    format: customFormat,
    defaultMeta: {service: 'backend-api'},
    transports: [
        //error log file
        new winston.transports.File({
            filename: path.join(logs, 'error.log'),
            level: 'error',
            maxsize: 5242880,
            maxFiles: 10,
            format: winston.format.combine(
                winston.format.timestamp({format: 'YY:MM:DD HH:mm:ss'}),
                winston.format.json()
            )
        }),

                // Combined logs (all levels)
        new winston.transports.File({
            filename: path.join(logs, 'combined.log'),
            maxsize: 5242880,
            maxFiles: 10,
            format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                winston.format.json()
            )
        }),

                // Warnings
        new winston.transports.File({
            filename: path.join(logs, 'warning.log'),
            level: 'warn',
            maxsize: 5242880,
            maxFiles: 10,
            format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                winston.format.json()
            )
        })
    ]
});

export default logger
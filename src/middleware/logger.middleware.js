/**
 * src/middleware/logger.middleware.js
 * Detailed request/response logger for the terminal.
 */

const logger = (req, res, next) => {
    const start = Date.now();
    const { method, url, ip } = req;
    const timestamp = new Date().toISOString();

    // Log the incoming request
    console.log(`\n[${timestamp}] \x1b[36m${method}\x1b[0m ${url} from ${ip}`);
    
    if (Object.keys(req.body).length > 0) {
        // Mask sensitive data
        const body = { ...req.body };
        if (body.password) body.password = '********';
        console.log(`\x1b[2mBody:\x1b[0m`, JSON.stringify(body, null, 2));
    }

    // Capture the original end function to log after response is sent
    const originalEnd = res.end;
    res.end = function (chunk, encoding) {
        const duration = Date.now() - start;
        const statusCode = res.statusCode;
        
        let color = '\x1b[32m'; // Green for 2xx
        if (statusCode >= 400) color = '\x1b[31m'; // Red for 4xx/5xx
        if (statusCode >= 300 && statusCode < 400) color = '\x1b[33m'; // Yellow for 3xx

        console.log(`\x1b[2mResponse:\x1b[0m ${color}${statusCode}\x1b[0m \x1b[2m(${duration}ms)\x1b[0m`);
        
        originalEnd.call(this, chunk, encoding);
    };

    next();
};

module.exports = logger;

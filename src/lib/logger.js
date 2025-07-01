const supabase = require('./supabase');

class Logger {
    constructor(functionName = 'unknown') {
        this.functionName = functionName;
        this.logs = [];
        this.startTime = new Date();
    }

    log(level, message, metadata = null) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            metadata: metadata || null
        };
        
        this.logs.push(logEntry);
        
        // Also console.log for immediate debugging if needed
        console.log(`[${level.toUpperCase()}] ${this.functionName}: ${message}`, metadata || '');
    }

    info(message, metadata = null) {
        this.log('info', message, metadata);
    }

    error(message, metadata = null) {
        this.log('error', message, metadata);
    }

    warn(message, metadata = null) {
        this.log('warn', message, metadata);
    }

    debug(message, metadata = null) {
        this.log('debug', message, metadata);
    }

    async flush() {
        if (this.logs.length === 0) {
            return { success: true, count: 0 };
        }

        // Check if there are any error logs
        const hasErrors = this.logs.some(log => log.level === 'error');
        
        if (!hasErrors) {
            // No errors, just clear logs and return success without writing to DB
            const logCount = this.logs.length;
            this.logs = [];
            return { success: true, count: logCount, skipped: true, reason: 'No errors to log' };
        }

        try {
            const endTime = new Date();
            const duration = endTime - this.startTime;
            
            // Create a single combined log entry with all logs as JSON
            const combinedLogEntry = {
                timestamp: this.startTime.toISOString(),
                level: 'error', // Set to error since we only log when there are errors
                message: `Function execution with errors: ${this.functionName}`,
                function_name: this.functionName,
                metadata: JSON.stringify({
                    summary: {
                        startTime: this.startTime.toISOString(),
                        endTime: endTime.toISOString(),
                        duration: `${duration}ms`,
                        totalLogs: this.logs.length,
                        logLevels: this.logs.reduce((acc, log) => {
                            acc[log.level] = (acc[log.level] || 0) + 1;
                            return acc;
                        }, {})
                    },
                    logs: this.logs
                })
            };

            const { data, error } = await supabase
                .from('logs')
                .insert([combinedLogEntry]);

            if (error) {
                console.error('Failed to write error log to Supabase:', error);
                return { success: false, error: error.message, count: this.logs.length };
            }

            const logCount = this.logs.length;
            this.logs = []; // Clear logs after successful write
            
            return { success: true, count: logCount };
        } catch (err) {
            console.error('Exception writing error log to Supabase:', err);
            return { success: false, error: err.message, count: this.logs.length };
        }
    }

    getLogSummary() {
        const endTime = new Date();
        const duration = endTime - this.startTime;
        
        return {
            functionName: this.functionName,
            startTime: this.startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: `${duration}ms`,
            totalLogs: this.logs.length,
            logLevels: this.logs.reduce((acc, log) => {
                acc[log.level] = (acc[log.level] || 0) + 1;
                return acc;
            }, {})
        };
    }
}

module.exports = Logger; 
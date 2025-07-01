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
            function_name: this.functionName,
            metadata: metadata ? JSON.stringify(metadata) : null
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

        try {
            const { data, error } = await supabase
                .from('logs')
                .insert(this.logs);

            if (error) {
                console.error('Failed to write logs to Supabase:', error);
                return { success: false, error: error.message, count: this.logs.length };
            }

            const logCount = this.logs.length;
            this.logs = []; // Clear logs after successful write
            
            return { success: true, count: logCount };
        } catch (err) {
            console.error('Exception writing logs to Supabase:', err);
            return { success: false, error: err.message, count: this.logs.length };
        }
    }

    async logAndFlush(level, message, metadata = null) {
        this.log(level, message, metadata);
        return await this.flush();
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
import { SupabaseClient } from '@supabase/supabase-js';
import supabase from './supabase';

type LogMetadata = Record<string, unknown> | null;

interface LogEntry {
    timestamp: string;
    level: 'info' | 'error' | 'warn' | 'debug';
    message: string;
    metadata: LogMetadata;
}

interface DatabaseLogEntry {
    timestamp: string;
    level: 'info' | 'error' | 'warn' | 'debug';
    message: string;
    function_name: string;
    metadata: string;
}

interface LogSummary {
    functionName: string;
    startTime: string;
    endTime: string;
    duration: string;
    totalLogs: number;
    logLevels: Record<string, number>;
}

interface FlushResult {
    success: boolean;
    count: number;
    error?: string;
    skipped?: boolean;
    reason?: string;
}

class Logger {
    private functionName: string;
    private logs: LogEntry[];
    private startTime: Date;

    constructor(functionName: string = 'unknown') {
        this.functionName = functionName;
        this.logs = [];
        this.startTime = new Date();
    }

    private log(level: LogEntry['level'], message: string, metadata: LogMetadata = null): void {
        const logEntry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            metadata: metadata || null
        };
        
        this.logs.push(logEntry);
        
        // Also console.log for immediate debugging if needed
        console.log(`[${level.toUpperCase()}] ${this.functionName}: ${message}`, metadata || '');
    }

    public info(message: string, metadata: LogMetadata = null): void {
        this.log('info', message, metadata);
    }

    public error(message: string, metadata: LogMetadata = null): void {
        this.log('error', message, metadata);
    }

    public warn(message: string, metadata: LogMetadata = null): void {
        this.log('warn', message, metadata);
    }

    public debug(message: string, metadata: LogMetadata = null): void {
        this.log('debug', message, metadata);
    }

    public async flush(): Promise<FlushResult> {
        if (this.logs.length === 0) {
            return { success: true, count: 0 };
        }

        // Check if there are any error logs
        const hasErrors = this.logs.some(log => log.level === 'error');
        
        if (!hasErrors) {
            // No errors, just clear logs and return success without writing to DB
            const logCount = this.logs.length;
            this.logs = [];
            return { 
                success: true, 
                count: logCount, 
                skipped: true, 
                reason: 'No errors to log' 
            };
        }

        try {
            const endTime = new Date();
            const duration = endTime.getTime() - this.startTime.getTime();
            
            // Create a single combined log entry with all logs as JSON
            const combinedLogEntry: DatabaseLogEntry = {
                timestamp: this.startTime.toISOString(),
                level: 'error',
                message: `Function execution with errors: ${this.functionName}`,
                function_name: this.functionName,
                metadata: JSON.stringify({
                    summary: {
                        startTime: this.startTime.toISOString(),
                        endTime: endTime.toISOString(),
                        duration: `${duration}ms`,
                        totalLogs: this.logs.length,
                        logLevels: this.logs.reduce<Record<string, number>>((acc, log) => {
                            acc[log.level] = (acc[log.level] || 0) + 1;
                            return acc;
                        }, {})
                    },
                    logs: this.logs
                })
            };

            const { error } = await supabase
                .from('logs')
                .insert([combinedLogEntry]);

            if (error) {
                console.error('Failed to write error log to Supabase:', error);
                return { 
                    success: false, 
                    error: error.message, 
                    count: this.logs.length 
                };
            }

            const logCount = this.logs.length;
            this.logs = []; // Clear logs after successful write
            
            return { success: true, count: logCount };
        } catch (err) {
            const error = err as Error;
            console.error('Exception writing error log to Supabase:', error);
            return { 
                success: false, 
                error: error.message, 
                count: this.logs.length 
            };
        }
    }

    public getLogSummary(): LogSummary {
        const endTime = new Date();
        const duration = endTime.getTime() - this.startTime.getTime();
        
        return {
            functionName: this.functionName,
            startTime: this.startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: `${duration}ms`,
            totalLogs: this.logs.length,
            logLevels: this.logs.reduce<Record<string, number>>((acc, log) => {
                acc[log.level] = (acc[log.level] || 0) + 1;
                return acc;
            }, {})
        };
    }
}

export default Logger; 
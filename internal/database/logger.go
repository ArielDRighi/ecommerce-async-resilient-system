package database

import (
	"context"
	"errors"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm/logger"
)

// GormLogger implements GORM's logger interface using Zap
type GormLogger struct {
	ZapLogger *zap.Logger
	LogLevel  logger.LogLevel
}

// NewGormLogger creates a new GORM logger using Zap
func NewGormLogger(zapLogger *zap.Logger) logger.Interface {
	return &GormLogger{
		ZapLogger: zapLogger,
		LogLevel:  logger.Info,
	}
}

// LogMode sets the log level
func (l *GormLogger) LogMode(level logger.LogLevel) logger.Interface {
	newLogger := *l
	newLogger.LogLevel = level
	return &newLogger
}

// Info logs info messages
func (l *GormLogger) Info(ctx context.Context, msg string, data ...interface{}) {
	if l.LogLevel >= logger.Info {
		l.ZapLogger.Sugar().Infof(msg, data...)
	}
}

// Warn logs warning messages
func (l *GormLogger) Warn(ctx context.Context, msg string, data ...interface{}) {
	if l.LogLevel >= logger.Warn {
		l.ZapLogger.Sugar().Warnf(msg, data...)
	}
}

// Error logs error messages
func (l *GormLogger) Error(ctx context.Context, msg string, data ...interface{}) {
	if l.LogLevel >= logger.Error {
		l.ZapLogger.Sugar().Errorf(msg, data...)
	}
}

// Trace logs SQL queries and execution time
func (l *GormLogger) Trace(ctx context.Context, begin time.Time, fc func() (sql string, rowsAffected int64), err error) {
	if l.LogLevel <= logger.Silent {
		return
	}

	elapsed := time.Since(begin)
	sql, rows := fc()

	fields := []zap.Field{
		zap.Duration("duration", elapsed),
		zap.String("sql", sql),
		zap.Int64("rows", rows),
	}

	switch {
	case err != nil && l.LogLevel >= logger.Error && (!errors.Is(err, logger.ErrRecordNotFound)):
		l.ZapLogger.Error("SQL query failed", append(fields, zap.Error(err))...)
	case elapsed > 200*time.Millisecond && l.LogLevel >= logger.Warn:
		l.ZapLogger.Warn("Slow SQL query", fields...)
	case l.LogLevel == logger.Info:
		l.ZapLogger.Debug("SQL query executed", fields...)
	}
}
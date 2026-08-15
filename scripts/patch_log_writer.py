from pathlib import Path

path = Path('/home/ubuntu/intranetorganife/server/backend/app.js')
text = path.read_text()
text = text.replace("const { createRealtimeServer } = require('./realtime');\n", "const { createRealtimeServer } = require('./realtime');\nconst { createNdjsonWriter } = require('./log-store');\n")
text = text.replace("const LOG_FLUSH_INTERVAL_MS = Math.max(200, Number(process.env.LOG_FLUSH_INTERVAL_MS) || 1000);\n", "const LOG_FLUSH_INTERVAL_MS = Math.max(200, Number(process.env.LOG_FLUSH_INTERVAL_MS) || 1000);\nconst logWriter = createNdjsonWriter(logsDir);\n")
text = text.replace("  scheduleLogFlush();\n  return normalized;\n", "  scheduleLogFlush(logWriteQueue.length >= 50 ? 0 : LOG_FLUSH_INTERVAL_MS);\n  return normalized;\n")
text = text.replace("      await fs.promises.appendFile(getLogFilePath(dayKey), content, 'utf8');\n", "      await logWriter.append(dayKey, content);\n")
text = text.replace("  await fs.promises.mkdir(logsDir, { recursive: true });\n  await migrateLegacyLogsFromRuntimeState();\n", "  await logWriter.ensureDirectory();\n  await migrateLegacyLogsFromRuntimeState();\n")
path.write_text(text)

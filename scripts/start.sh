#!/bin/sh
set -eu
mkdir -p /app/data/backups
node <<'NODE'
const fs = require('node:fs');
const Database = require('better-sqlite3');
const path = process.env.DATABASE_PATH || '/app/data/growth.db';
const db = new Database(path);
db.pragma('journal_mode=WAL');
db.exec(fs.readFileSync('/app/drizzle/0000_init.sql', 'utf8'));
const taskColumns = db.prepare('PRAGMA table_info(tasks)').all();
if (!taskColumns.some(column => column.name === 'priority')) db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'important'");
db.exec("CREATE TABLE IF NOT EXISTS study_time_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'study', title TEXT, subtitle TEXT, started_at TEXT NOT NULL, ended_at TEXT, duration_seconds INTEGER, duration_minutes INTEGER, note TEXT)");
const studyColumns = db.prepare('PRAGMA table_info(study_time_logs)').all();
if (!studyColumns.some(column => column.name === 'duration_seconds')) db.exec('ALTER TABLE study_time_logs ADD COLUMN duration_seconds INTEGER');
if (!studyColumns.some(column => column.name === 'category')) db.exec("ALTER TABLE study_time_logs ADD COLUMN category TEXT NOT NULL DEFAULT 'study'");
if (!studyColumns.some(column => column.name === 'title')) db.exec('ALTER TABLE study_time_logs ADD COLUMN title TEXT');
if (!studyColumns.some(column => column.name === 'subtitle')) db.exec('ALTER TABLE study_time_logs ADD COLUMN subtitle TEXT');
db.close();
NODE
node /app/scripts/seed.mjs
exec node server.js

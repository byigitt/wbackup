# Roadmap

This document outlines planned features and improvements for `@byigitt/wbackup`.

## Current Status (v1.0.x)

- [x] MongoDB backup support (mongodump)
- [x] PostgreSQL backup support (pg_dump)
- [x] Discord webhook delivery
- [x] Telegram delivery (opt-in)
- [x] Gzip compression
- [x] File chunking for large backups
- [x] Fluent builder API
- [x] TypeScript support
- [x] Unit tests

---

## v1.1.0 - More Databases

### MySQL Support
- [ ] Register MySQL strategy by default
- [ ] Support for `mysqldump` options
- [ ] SSL/TLS connection support

### SQLite Support
- [ ] New SQLite backup strategy
- [ ] Simple file copy with optional compression
- [ ] Support for WAL mode databases

### Redis Support
- [ ] New Redis backup strategy
- [ ] RDB snapshot support
- [ ] AOF file backup

---

## v1.2.0 - More Delivery Platforms

### Slack
- [ ] Slack webhook delivery
- [ ] Block kit message formatting
- [ ] Channel selection

### Email
- [ ] SMTP email delivery
- [ ] Attachment support
- [ ] HTML email templates

### Cloud Storage
- [ ] AWS S3 upload
- [ ] Google Cloud Storage
- [ ] Azure Blob Storage
- [ ] Backblaze B2

### Custom Webhooks
- [ ] Generic HTTP webhook
- [ ] Custom headers/auth
- [ ] Configurable payload format

---

## v1.3.0 - Scheduling & Automation

### Built-in Scheduler
- [ ] Cron-like scheduling
- [ ] Interval-based backups
- [ ] One-time scheduled backups

### Retention Policies
- [ ] Keep last N backups
- [ ] Time-based retention (keep 7 days, 4 weeks, etc.)
- [ ] Automatic cleanup

### Backup Rotation
- [ ] Daily/weekly/monthly rotation
- [ ] Grandfather-father-son scheme

---

## v1.4.0 - Encryption & Security

### Encryption
- [ ] AES-256 encryption before upload
- [ ] GPG encryption support
- [ ] Password-protected archives

### Security Improvements
- [ ] Credential validation
- [ ] Connection string sanitization in logs
- [ ] Secure temp file handling

---

## v1.5.0 - Monitoring & Observability

### Notifications
- [ ] Success/failure notifications
- [ ] Customizable alert thresholds
- [ ] Multi-channel notifications

### Metrics
- [ ] Backup duration tracking
- [ ] Size trends
- [ ] Success/failure rates

### Logging
- [ ] Structured logging (JSON)
- [ ] Log levels
- [ ] Log rotation

### Health Checks
- [ ] Database connectivity check
- [ ] Webhook connectivity check
- [ ] Disk space check

---

## v2.0.0 - Advanced Features

### Incremental Backups
- [ ] MongoDB oplog-based incremental
- [ ] PostgreSQL WAL archiving
- [ ] Point-in-time recovery

### Parallel Backups
- [ ] Multiple databases simultaneously
- [ ] Worker pool management
- [ ] Resource limits

### Restore Support
- [ ] MongoDB restore (mongorestore)
- [ ] PostgreSQL restore (pg_restore)
- [ ] Verification after restore

### Web Dashboard
- [ ] Backup history view
- [ ] Manual backup trigger
- [ ] Configuration UI
- [ ] Status monitoring

### CLI Tool
- [ ] `wbackup backup` command
- [ ] `wbackup restore` command
- [ ] `wbackup list` command
- [ ] Configuration file support

---

## Future Ideas

- **Docker image** - Pre-built container for scheduled backups
- **Kubernetes CronJob** - Helm chart for K8s deployments
- **GitHub Action** - Backup as part of CI/CD
- **Serverless support** - AWS Lambda / Vercel Functions
- **Multi-region backup** - Replicate to multiple destinations
- **Backup verification** - Automatic restore testing
- **Deduplication** - Reduce storage with dedup
- **Compression options** - zstd, lz4, brotli

---

## Contributing

Have an idea? Open an issue or submit a PR!

### Priority Labels
- `priority: high` - Core functionality
- `priority: medium` - Nice to have
- `priority: low` - Future consideration

### Difficulty Labels
- `good first issue` - Great for newcomers
- `help wanted` - Looking for contributors
- `complex` - Requires significant effort

// round-length/backend/ecosystem.config.js
// PM2 process manager configuration
// Start with: pm2 start ecosystem.config.js
// Save config: pm2 save
// Enable auto-start: pm2 startup (follow the printed command)

module.exports = {
  apps: [{
    name:        'round-length',
    script:      'server.js',
    cwd:         '/var/www/round-length/backend',
    instances:   1,
    autorestart: true,
    watch:       false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
    },
    // Log files
    out_file:  '/var/log/round-length/out.log',
    error_file:'/var/log/round-length/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};

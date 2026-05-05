# Round Length

Free Australian dairy farm pasture growth calculator.

## What it does

Tells a farmer how long their grazing rotation needs to be based on how fast
their pasture is actually growing. Uses 136 years of SILO climate data to show
historical context and project future round lengths.

## Tech stack

- **Frontend** — React + Vite, served by Nginx
- **Backend** — Node.js + Express
- **Database** — PostgreSQL
- **Server** — Vultr VPS, Ubuntu 24.04
- **Process manager** — PM2
- **SSL** — Let's Encrypt

## Project structure

```
round-length/
├── backend/
│   ├── db/
│   │   ├── schema.sql          # Database schema — run once to set up
│   │   └── queries.js          # All database queries
│   ├── lib/
│   │   └── formula.js          # LAR and round length calculations
│   ├── cron/
│   │   └── nightly.js          # Nightly SILO fetch and update
│   ├── routes/
│   │   ├── farms.js            # Farm CRUD endpoints
│   │   ├── scenarios.js        # Scenario CRUD + percentiles
│   │   └── silo.js             # SILO fetch endpoints
│   ├── silo.js                 # SILO API client
│   ├── server.js               # Express app entry point
│   ├── package.json
│   └── .env.example            # Environment variable template
├── frontend/
│   ├── src/
│   │   ├── lib/
│   │   │   ├── formula.js      # Same formula logic mirrored on frontend
│   │   │   └── api.js          # API client (fetch wrapper)
│   │   ├── hooks/
│   │   │   └── useScenarios.js # Data fetching hooks
│   │   ├── components/
│   │   │   ├── BottomNav.jsx
│   │   │   ├── ScenarioCard.jsx
│   │   │   ├── ProgressBar.jsx
│   │   │   └── Chart.jsx
│   │   ├── pages/
│   │   │   ├── Setup.jsx           # First launch setup wizard
│   │   │   ├── Dashboard.jsx       # Scenarios list
│   │   │   ├── ScenarioDetail.jsx  # Single scenario detail + chart
│   │   │   ├── Planning.jsx        # Desktop planning table placeholder
│   │   │   └── Settings.jsx        # Farm settings
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── nginx/
│   └── round-length.conf       # Nginx site config
└── README.md
```

## Vultr setup — run these commands on your server

### 1. Connect to your Vultr instance

```bash
ssh root@YOUR_VULTR_IP
```

### 2. Update the system

```bash
apt update && apt upgrade -y
```

### 3. Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version   # should show v20.x.x
```

### 4. Install PostgreSQL

```bash
apt install -y postgresql postgresql-contrib
systemctl start postgresql
systemctl enable postgresql
```

### 5. Create the database and user

```bash
sudo -u postgres psql <<EOF
CREATE USER roundlength WITH PASSWORD 'choose_a_strong_password_here';
CREATE DATABASE roundlength OWNER roundlength;
GRANT ALL PRIVILEGES ON DATABASE roundlength TO roundlength;
EOF
```

### 6. Install Nginx

```bash
apt install -y nginx
systemctl start nginx
systemctl enable nginx
```

### 7. Install PM2

```bash
npm install -g pm2
```

### 8. Install Certbot (SSL)

```bash
apt install -y certbot python3-certbot-nginx
```

### 9. Clone the project

```bash
cd /var/www
git clone https://github.com/YOUR_USERNAME/round-length.git
cd round-length
```

### 10. Set up the database schema

```bash
sudo -u postgres psql -d roundlength -f backend/db/schema.sql
```

### 11. Configure the backend

```bash
cd backend
cp .env.example .env
nano .env   # fill in your values
npm install
```

### 12. Configure the frontend

```bash
cd ../frontend
npm install
npm run build   # builds to frontend/dist/
```

### 13. Configure Nginx

```bash
cp /var/www/round-length/nginx/round-length.conf /etc/nginx/sites-available/round-length
ln -s /etc/nginx/sites-available/round-length /etc/nginx/sites-enabled/
nginx -t   # test config
systemctl reload nginx
```

### 14. Get SSL certificate

```bash
certbot --nginx -d yourdomain.com
```

### 15. Start the backend with PM2

```bash
cd /var/www/round-length/backend
pm2 start server.js --name round-length
pm2 save
pm2 startup   # follow the printed command to enable auto-start
```

### 16. Check everything is running

```bash
pm2 status
systemctl status nginx
systemctl status postgresql
```

## Local development (on your laptop)

### Backend

```bash
cd backend
cp .env.example .env   # fill in values
npm install
npm run dev   # starts with nodemon, auto-restarts on changes
```

### Frontend

```bash
cd frontend
npm install
npm run dev   # starts Vite dev server at http://localhost:5173
```

The frontend dev server proxies API requests to the backend at localhost:3000.
Open http://localhost:5173 in Chrome, then press F12 and click the phone icon
to simulate a mobile screen.

To test on your phone: find your laptop IP address (run `ipconfig` on Windows
or `ifconfig` on Mac), then open http://YOUR_LAPTOP_IP:5173 in your phone browser.
Both devices must be on the same WiFi network.

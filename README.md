# Team Page & About Page Scraper

A Node.js microservice that scrapes websites to find and extract text content from team and about pages. Given a URL, it probes common page slugs (`/team`, `/about-us`, `/our-team`, etc.), fetches the best match, and returns clean text content.

## Features

- Probes common team/about page slugs: `/team`, `/our-team`, `/meet-the-team`, `/staff`, `/people`, `/about`, `/about-us`, `/who-we-are`
- Fast fetching via Axios with Puppeteer fallback for JS-rendered pages
- CAPTCHA detection and automatic retry
- Rotating residential proxy support via Geonix
- Automatic proxy health checking every 10 minutes
- Falls back to homepage if no team/about page is found
- Health check endpoint for monitoring

## Prerequisites

- Node.js >= 14.0.0
- Chromium / Google Chrome (for Puppeteer fallback)

## Installation

```bash
git clone https://github.com/lukearian2952/team-page-and-about-page-scraper.git
cd team-page-and-about-page-scraper
npm install
cp .env.example .env
# Fill in your proxy credentials in .env
```

## Configuration

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `4404` |
| `GEONIX_PROXY_HOST` | Proxy hostname | `res.geonix.com` |
| `GEONIX_PROXY_PORT` | Proxy base port | `10000` |
| `GEONIX_PROXY_USER` | Proxy username | *(required)* |
| `GEONIX_PROXY_PASS` | Proxy password | *(required)* |
| `CHROME_PATH` | Path to Chrome/Chromium binary | Puppeteer default |
| `SCRAPER_USER_AGENT` | Custom User-Agent string | Chrome 120 UA |

## Usage

```bash
npm start
```

## API Endpoints

### `GET /website?url=<target_url>`

Finds and scrapes the team or about page for the given website.

**Query Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `url` | string | Yes | The website URL to scrape |

**Response:**

```json
{
  "status": "success",
  "content": "Extracted text from the team/about page..."
}
```

### `GET /health`

Returns proxy health status and server uptime.

**Response:**

```json
{
  "healthyPorts": [10000, 10001, 10003],
  "uptime": 3600,
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

## How It Works

1. Receives a URL and constructs a base URL
2. Probes common team/about page slugs in order
3. For each slug, tries Axios first (fast), falls back to Puppeteer if content is too short or CAPTCHA is detected
4. Returns the first page with meaningful content (>300 chars)
5. If no team/about page is found, falls back to the homepage
6. Strips scripts, styles, and media elements, returning clean text

## Security Notes

- TLS certificate verification is disabled globally to handle proxy certificate mismatches

## License

MIT

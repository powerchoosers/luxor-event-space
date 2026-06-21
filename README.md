This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Architecture & Modules

### 1. Client-Facing Site (`/`)
- **Home**: High-conversion landing page for Luxor Event Space.
- **Pricing**: Transparent tiered event packages.
- **Tour**: Interactive booking for physical space walkthroughs.

### 2. Ownership Portal (`/portal`)
A forensic, high-authority CRM designed for executive management of the space.
- **Dashboard**: Real-time revenue metrics and lead influx telemetry.
- **Leads & Clients**: CRM pipeline for processing form submissions and prospects.
- **Communications**: Integrated interface for unified email and voice execution.
- **Revenue & Invoicing**: Financial command center for invoice lifecycle and AR.
- **Marketing Command**: Audience segmentation and automated campaign orchestration.

## Design Philosophy: "Forensic Command Center"
The portal uses a dark-themed, data-driven aesthetic:
- **Signal over Noise**: Core metrics use high-contrast monospace fonts for immediate legibility.
- **Glassmorphism**: Layered depth using `nodal-void-card` and `nodal-glass` utilities.
- **Low Latency Perception**: Visual feedback and micro-animations for state changes.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

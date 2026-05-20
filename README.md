# 🧠💪 PhysiQ

**PhysiQ** is a clinical assessment web application for physiotherapists, built with Next.js 15 and TypeScript. It uses **TensorFlow.js pose detection** and **OpenCV.js** to perform real-time body tracking directly in the browser — no server-side processing required.

🔗 **[Live demo → physiotracker.netlify.app](https://physiotracker.netlify.app)**

<div style="display: flex; gap: 10px;">
  <img src="https://github.com/physiodevapp/physio-tracker/blob/main/public/landing-page.png" alt="PhysiQ app screenshot" width="300"/>
  <img src="https://github.com/physiodevapp/physio-tracker/blob/main/public/force-screenshot.png" alt="PhysiQ force screenshot" width="300"/>
  <img src="https://github.com/physiodevapp/physio-tracker/blob/main/public/balance-screenshot.png" alt="PhysiQ force screenshot" width="300"/>
</div>

---

## Why PhysiQ?

Traditional physiotherapy assessment relies on goniometers, force plates, and balance boards — equipment that is expensive, clinic-bound, and generates data that's hard to track over time. PhysiQ brings objective measurement tools to any device with a camera, making it accessible for home exercise monitoring and clinic follow-up sessions.

---

## Features

### ⚖️ Balance Assessment
Measures postural stability using dynamic centre-of-pressure data. Visualises balance traces over time to track rehabilitation progress.

### 🏋️ Strength & Fatigue Analysis
Records force-time curves and applies **DSP (Digital Signal Processing)** to detect fatigue patterns. Useful for monitoring neuromuscular performance across sessions.

### 🤸 Range of Motion
Uses **TensorFlow.js `pose-detection`** (MoveNet/BlazePose) with **OpenCV.js** to track skeletal keypoints via webcam and calculate joint angles in real time. Measurements are displayed as the patient moves, with Chart.js overlays showing angle over time.

### 🖍️ Body Chart — Pain Mapping
An interactive anatomical diagram where clinicians can mark and colour-code pain or dysfunction areas. Designed for fast clinical documentation.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5 |
| AI / Computer Vision | TensorFlow.js · `@tensorflow-models/pose-detection` · OpenCV.js |
| Signal Processing | DSP.js (force-time curve analysis) |
| Data Visualisation | Chart.js 4 · chartjs-plugin-zoom · chartjs-plugin-annotation |
| Animations | Framer Motion 12 |
| Styling | Tailwind CSS · next-themes (dark/light mode) |
| Hardware | Web Bluetooth API (external force sensors) |
| Deployment | Netlify |

---

## Architecture highlights

- **Client-side ML inference**: TensorFlow.js runs the pose estimation model entirely in the browser using WebGL backend — no data leaves the device, which is critical for clinical privacy.
- **Custom React hooks**: sensor data streams, Bluetooth device connection, and pose estimation loops are each encapsulated in dedicated hooks (`/hooks`).
- **Component-driven structure**: UI is split into `components/`, `modals/`, and `providers/` for clear separation of concerns.
- **TypeScript throughout**: 98%+ TypeScript coverage with custom type declarations for Bluetooth (`bluetooth.d.ts`) and DSP (`dsp.d.ts`) APIs that lack official types.

---

## Clinical disclaimer

PhysiQ is an assistive tool for orientation purposes. Range of motion and balance metrics have not been validated against gold-standard clinical devices (isokinetic dynamometers, force plates). Results should be interpreted by a qualified physiotherapist.

---

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> **Note**: Range of Motion requires camera access. Strength & Balance modules may require a compatible Bluetooth force sensor.

---

## Roadmap

- [ ] Session history and patient profiles (backend integration)
- [ ] PDF report export per session
- [ ] Clinical validation against gold-standard devices
- [ ] Mobile PWA support

---

## Author

**Edu Gamboa** · Full Stack Developer  
[GitHub](https://github.com/physiodevapp) · [LinkedIn](https://www.linkedin.com/in/edu-gamboa/)

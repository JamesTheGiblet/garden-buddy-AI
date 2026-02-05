# 🌱 GardenBuddy Ecosystem

**The complete platform for garden management, connecting professional contractors with home gardeners.**

This repository contains the source code for the entire GardenBuddy ecosystem, which consists of two distinct but integrated applications:

1. **[GardenBuddy AI](./GardenBuddy%20AI)** - The free companion app for home gardeners (Clients).
2. **[GardenManager Pro](./GardenManager%20AI)** - The business management platform for professional gardeners (Contractors).

---

## 🏗️ The Ecosystem

The GardenBuddy ecosystem solves the communication and management gap between garden contractors and their clients.

| **For Home Gardeners** | **For Contractors** |
| :--- | :--- |
| **GardenBuddy AI** 🌻 | **GardenManager Pro** 🚜 |
| A personal AI gardening assistant that helps track plants, provides weather advice, and maintains a garden calendar. | A professional business tool to manage clients, schedule jobs, track payments, and eliminate admin chaos. |
| [View Client App](./GardenBuddy%20AI) | [View Contractor App](./GardenManager%20AI) |

### 🤝 How They Connect

The two apps work together via a simple **QR Code Pairing** system:

1. **Contractor** generates a QR code in *Garden Buddy 4U Pro*.
2. **Client** scans it using *Garden Buddy 4U AI*.
3. **Connected!** The contractor can now push job schedules, updates, and invoices directly to the client's app.

---

## 🚀 Quick Links

- **Live Landing Page:** [garden-buddy-ai.netlify.app](https://garden-buddy-ai.netlify.app)
- **GardenBuddy AI (Client) Demo:** [Launch App](https://garden-buddy-ai.netlify.app/GardenBuddy%20AI/)
- **GardenManager Pro (Contractor) Demo:** [Launch App](https://garden-buddy-ai.netlify.app/GardenManager%20AI/)

---

## 📂 Project Structure

```text
garden-buddy-AI/
├── Garden Buddy 4U AI/       # Client Application (PWA)
│   ├── index.html        # Main App Entry
│   ├── sw.js             # Service Worker
│   └── README.md         # Client App Documentation
│
├── Garden Buddy 4U Pro/     # Contractor Application (PWA)
│   ├── index.html        # Dashboard Entry
│   ├── scan.html         # QR Scanner
│   └── README.md         # Contractor App Documentation
│
├── gardener.html         # Landing Page for Gardeners
├── landing_page.html     # Main Landing Page
└── config.js             # Shared Configuration
```

## 🛠️ Tech Stack

- **Frontend:** Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Architecture:** Progressive Web Apps (PWA)
- **Backend:** Supabase (PostgreSQL, Auth, Realtime)
- **Hosting:** Netlify / Static Hosting
- **APIs:** OpenWeatherMap, Supabase JS Client

## 📦 Installation & Development

To run the entire ecosystem locally:

1. **Clone the repository:**

    ```bash
    git clone https://github.com/gibletscreations/gardenbuddy.git
    cd gardenbuddy
    ```

2. **Serve the root directory:**
    You can use any static file server (e.g., Python, Node `http-server`, or VS Code Live Server).

    ```bash
    # Using Python
    python -m http.server 8000
    ```

3. **Access the apps:**
    - Landing Page: `http://localhost:8000/`
    - Client App: `http://localhost:8000/GardenBuddy%20AI/`
    - Contractor App: `http://localhost:8000/GardenManager%20AI/`

## 📄 License

This project is licensed under the **MIT License**. See the LICENSE file for details.

---

<p align="center">
  <strong>Built with 💚 by <a href="https://giblets.uk">Giblets Creations</a></strong>
</p>

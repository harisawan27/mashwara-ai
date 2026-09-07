<p align="center">
  <img src="frontend/public/logo_original.png" alt="Mashwara AI logo" width="112" />
</p>

<h1 align="center">Mashwara AI</h1>

<p align="center"><strong>Don't ask one AI. Ask a panel.</strong></p>

<p align="center">
  A multilingual agentic decision-support platform for Pakistan that turns complex dilemmas into structured, evidence-backed consultations from six contextual AI Musheers.
</p>

<p align="center">
  <a href="https://mashwara-ai.vercel.app"><strong>Try the live app</strong></a>
  &nbsp;&middot;&nbsp;
  <a href="https://github.com/harisawan27/mashwara-ai"><strong>View the repository</strong></a>
</p>

<p align="center">
  <img alt="React" src="https://img.shields.io/badge/React-19-149ECA?style=flat-square&logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-Python-009688?style=flat-square&logo=fastapi&logoColor=white" />
  <img alt="Google Gemini" src="https://img.shields.io/badge/AI-Google_Gemini-8E75B2?style=flat-square&logo=googlegemini&logoColor=white" />
  <img alt="Google Cloud Run" src="https://img.shields.io/badge/Backend-Cloud_Run-4285F4?style=flat-square&logo=googlecloud&logoColor=white" />
  <img alt="Vercel" src="https://img.shields.io/badge/Frontend-Vercel-000000?style=flat-square&logo=vercel&logoColor=white" />
</p>

## Why Mashwara exists

Important decisions rarely belong to one discipline. A career move may involve finances, family obligations, market timing, risk tolerance, and long-term growth at the same time. Yet diverse professional advice is often expensive, fragmented, or simply unavailable.

Most single-assistant conversations collapse that complexity into one response. Mashwara creates a council around the decision: six relevant Musheers analyze it independently, challenge material disagreements, record their positions, and produce one transparent recommendation.

| Typical single-assistant flow | Mashwara AI |
|---|---|
| One prompt → one answer | One dilemma → six perspectives → deliberation → one decision |

## How it works

```mermaid
flowchart TD
    A["Your dilemma"] --> B["Input context"]
    B --> B1["Typed text or voice"]
    B --> B2["Private files and images"]
    B --> B3["Optional web research"]
    B1 --> C["Decision Router"]
    B2 --> C
    B3 --> C
    C --> D["Six contextual Musheers"]
    D --> E["Round 1: independent analysis"]
    E --> F["Round 2: targeted rebuttal"]
    F --> G["Votes and confidence"]
    G --> H["Hidden Lead Advisor synthesis"]
    H --> I["Final Mashwara"]
    I --> I1["Recommendation"]
    I --> I2["Risks and actions"]
    I --> I3["What would change the decision"]
```

Round 1 starts all six specialist analyses concurrently. Round 2 brings back two or three Musheers when their positions contain a material disagreement; it can be skipped when the council already agrees. The hidden Lead Advisor then synthesizes the consultation without rewriting the Musheers' recorded votes.

## The experience

1. **Tell your situation** in Urdu, Roman Urdu, or English.
2. **Bring evidence** such as a CV, offer, contract, quote, proposal, spreadsheet, or product specification.
3. **Choose current context** with Web Research set to Auto, On, or Off.
4. **Meet the right Musheers** selected for the dimensions of your decision.
5. **Watch the consultation** as analyses, challenges, votes, and confidence arrive in real time.
6. **Get one decision** with the reasoning, risks, actions, and conditions behind it.
7. **Use the result** by reading it, listening to it, exporting a PDF, or creating a read-only public link.

Private consultation history is available to signed-in users. Guest mode lets someone start without creating an account.

## What makes Mashwara different

| Capability | Typical single-assistant flow | Mashwara AI |
|---|---|---|
| Perspective | One generated response | Six distinct expert perspectives |
| Expert selection | General-purpose assistant | Contextual routing for each dilemma |
| Evidence | Pasted context | Shared evidence extracted from private files and images |
| Current research | Depends on the chat configuration | Explicit Auto, On, and Off modes with cited sources |
| Disagreement | Often flattened into one answer | Targeted rebuttal when positions materially differ |
| Voting | Usually absent | Per-Musheer position and confidence |
| Transparency | Final prose | Agreement, disagreement, risks, actions, and change conditions |
| Pakistan language support | Varies | Urdu, Roman Urdu, English, RTL, and mixed-input detection |
| Voice | Varies by product and browser | Hold-to-speak browser voice typing with an editable transcript |
| Outcome | Advice | A structured final Mashwara and action plan |

## A contextual AI council

Mashwara does not force every problem through the same fixed set of titles. Its Decision Router identifies the relevant dimensions, selects from a global expert pool, and guarantees exactly six visible Musheers for the consultation. When the existing pool has a genuine gap, the router can add a small number of contextual specialist roles for that decision.

The default Auto/Open path adapts to the dilemma. Optional presets can provide a starting context, while routing still builds the council that the actual question needs. A separate Lead Advisor remains behind the scenes and produces the final synthesis after the six visible Musheers finish.

## Evidence-aware decisions

### Private documents and images

Mashwara accepts the following evidence formats:

`PDF` · `DOCX` · `TXT` · `MD` · `CSV` · `XLSX` · `PNG` · `JPG/JPEG` · `WEBP`

Each file can be up to **20 MB**, with up to **5 files** and **50 MB total** in one attachment context. The backend validates file extension, MIME type, and size before accepting the upload.

Evidence is extracted once into a bounded evidence pack and shared with the entire council. That keeps all six Musheers grounded in the same facts, numbers, constraints, contradictions, and unknowns instead of independently interpreting different fragments.

Useful cases include comparing a CV with a job description, reviewing university offers or scholarship documents, checking contract terms, evaluating vendor quotes, and reasoning from proposals, spreadsheets, or product specifications.

### Current web research

Web Research adds a separate, centralized evidence pack backed by Google Search grounding:

- **Auto** searches when the dilemma appears to depend on fresh information.
- **On** requests current research explicitly.
- **Off** keeps the consultation limited to the user's message and attached evidence.

The research stage collects current claims, sources, citations, and uncertainties once, then gives that same context to all six Musheers. Mashwara does not run six unrelated searches or claim unrestricted web crawling.

## Language-first for Pakistan

Mashwara's interface and consultation pipeline support:

- **Urdu** with right-to-left layout and Urdu-script responses
- **Roman Urdu** for natural Urdu written in the Latin alphabet
- **English**
- **Mixed input detection** for common Urdu-English code-switching

The selected interface language remains authoritative for the consultation response, so users can describe a real Pakistani dilemma in the words that feel natural to them.

## Browser-native voice typing

```mermaid
flowchart LR
    A["Hold mic"] --> B["Live recognition"]
    B --> C["Editable transcript"]
    C --> D["User reviews"]
    D --> E["Manual Send"]
```

The current voice flow uses the browser's `SpeechRecognition` or `webkitSpeechRecognition` API. It provides interim text while the user speaks, preserves the final transcript, and inserts it into the composer for editing. **Voice never auto-sends.**

English recognition uses `en-US`; Urdu and Roman Urdu use `ur-PK`. The WhatsApp-style interaction supports hold-to-speak, physical-left cancel, upward lock, and pause/resume after locking. `getUserMedia` and the Web Audio API power microphone access and the waveform.

Recorded audio is not uploaded to Mashwara's backend in this browser-native flow. Speech recognition behavior depends on the browser and may use the browser vendor's speech service; it should not be treated as fully offline.

## The final Mashwara

The final report is built for action rather than another wall of generated text:

- **Decision** — approve, reject, or defer
- **Confidence** — the synthesized confidence score
- **Council votes** — each Musheer's recorded position and confidence
- **Agreement** — where the council aligned
- **Disagreement** — the material tension that remained
- **Key risks** — the most important downside scenarios
- **Recommended actions** — concrete next steps
- **What would change the recommendation** — new evidence or conditions that should trigger a reassessment

After a private consultation, Mashwara can narrate the exact executive summary in its resolved language. The player supports play/pause, seeking, replay, and `1×`, `1.25×`, and `1.5×` speeds. Reports can also be exported as PDF or shared through an unguessable, read-only public snapshot.

## Technical architecture

```mermaid
flowchart TB
    subgraph Browser["Browser / installable PWA"]
        UI["React + TypeScript + Vite UI"]
        WS["Web Speech API"]
        WA["Web Audio waveform"]
        UI --- WS
        UI --- WA
    end

    subgraph API["FastAPI on Google Cloud Run"]
        AUTH["Auth and guest scopes"]
        ROUTER["Decision Router"]
        FILES["Evidence pipeline"]
        WEB["Web research"]
        COUNCIL["Council orchestrator"]
        LEAD["Lead Advisor synthesis"]
        TTS["Summary narration"]
        ROUTER --> COUNCIL
        FILES --> COUNCIL
        WEB --> COUNCIL
        COUNCIL --> LEAD
        LEAD --> TTS
    end

    UI -->|"HTTPS + Server-Sent Events"| API
    API --> GEMINI["Google Gemini"]
    API --> DB["Neon PostgreSQL"]
    API --> GCS["Private Google Cloud Storage"]
    WEB --> SEARCH["Google Search grounding"]
```

| Layer | Current implementation |
|---|---|
| Frontend | React 19, TypeScript 6, Vite 8, Tailwind CSS 4, Zustand |
| Backend | Python 3.11, FastAPI, Uvicorn, SQLAlchemy async |
| AI | Google Gemini models for routing, specialists, synthesis, evidence, research, and TTS |
| Realtime | Server-Sent Events for streamed consultation progress |
| Database | Neon PostgreSQL in production; SQLite fallback for local development |
| Files | Private Google Cloud Storage using the configured Firebase Storage bucket |
| Authentication | Google Identity Services, server-verified Google ID tokens, Mashwara JWT sessions |
| Voice input | Web Speech API with Web Audio for the waveform |
| Deployment | Vercel frontend and Google Cloud Run backend |

The orchestration layer is implemented in the application: it launches specialists concurrently, selects rebuttal participants, preserves votes, and streams structured events to the client.

## Security and privacy

- Google sign-in credentials are verified by the backend with Google's token verification library before Mashwara issues its own session token.
- Consultations, attachment contexts, and generated audio enforce authenticated ownership or a valid guest scope.
- Attachments use private object storage and time-limited signed upload/download mechanisms.
- File type, declared MIME type, per-file size, file count, and combined size are validated server-side.
- Public share links expose a sanitized read-only consultation snapshot; they do not expose user IDs, email addresses, system prompts, secrets, or raw uploaded file bytes.
- Public share pages cannot generate or play private consultation narration.
- File and web content is delimited and treated as untrusted evidence rather than instructions to the council.
- Server credentials are loaded from environment variables. The frontend receives only public configuration such as the API URL and Google OAuth client ID.
- Browser-native voice typing does not send recorded microphone audio to the Mashwara backend.

These controls describe the current implementation; they are not a claim of formal security certification.

## Project structure

```text
mashwara-ai/
├── frontend/
│   ├── public/                 # PWA icons, fonts, and product assets
│   └── src/
│       ├── components/         # Council, voice, evidence, auth, and report UI
│       ├── hooks/              # Browser speech input
│       ├── i18n/               # Urdu, Roman Urdu, and English copy
│       ├── pages/              # App and public report pages
│       └── store/              # Client state
├── backend/
│   ├── agents/                 # Routing, council, evidence, research, and TTS
│   ├── models/                 # Database models
│   ├── security/               # Auth and middleware
│   ├── tools/                  # Storage and supporting tools
│   ├── main.py                 # FastAPI application
│   └── requirements.txt
├── scripts/                    # Cloud Run deployment helpers
├── Dockerfile
└── README.md
```

## Local development

### 1. Backend

```bash
cd backend
python -m venv .venv
```

Activate the environment:

```bash
# macOS / Linux
source .venv/bin/activate

# Windows PowerShell
.venv\Scripts\Activate.ps1
```

Install and start the API:

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The API health endpoint is available at `http://localhost:8000/health`.

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

## Environment variables

Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`. Use your own values; never commit either file. The repository's `.gitignore` excludes `.env` variants.

### Backend

| Variable | Purpose |
|---|---|
| `GOOGLE_API_KEY` | Google Gemini API access |
| `DATABASE_URL` | Async PostgreSQL connection string; omit only when intentionally using the local SQLite fallback |
| `JWT_SECRET_KEY` | Signs Mashwara access tokens |
| `GOOGLE_CLIENT_ID` | Audience used to verify Google ID tokens |
| `GCS_BUCKET_NAME` | Private attachment and generated-audio bucket |
| `GCS_SERVICE_ACCOUNT_EMAIL` | Signing identity used for Cloud Run signed URLs when required by the runtime |

Example:

```dotenv
GOOGLE_API_KEY=your_google_api_key_here
DATABASE_URL=postgresql+asyncpg://user:password@host/database
JWT_SECRET_KEY=replace_with_a_long_random_secret
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GCS_BUCKET_NAME=your_private_bucket_name
GCS_SERVICE_ACCOUNT_EMAIL=your_runtime_service_account@example-project.iam.gserviceaccount.com
```

### Frontend

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | FastAPI base URL |
| `VITE_GOOGLE_CLIENT_ID` | Public Google Identity Services client ID |

```dotenv
VITE_API_BASE_URL=http://localhost:8000
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
```

## Deployment

The current production path is intentionally small:

| Component | Service |
|---|---|
| Web app and PWA | Vercel |
| FastAPI container | Google Cloud Run |
| Relational data | Neon PostgreSQL |
| Private attachments and generated audio | Google Cloud Storage / configured Firebase Storage bucket |
| AI and grounded research | Google Gemini and Google Search grounding |

The root `Dockerfile` builds the Python 3.11 API for Cloud Run. The frontend includes Vercel SPA rewrites and an auto-updating PWA configuration.

## Built for Alibaba Cloud AI Hackathon Pakistan 2026

Prepared as a solo submission through Bano Qabil, Mashwara began as an agentic AI planning and advisory platform focused on local languages and accessible guidance for people who may not have affordable access to professional or peer advice.

The current build deepens that same scope through contextual expert routing, private document evidence, current web research, browser-native voice input, multi-round deliberation, and transparent decision reports. Each addition serves the original goal: help people reason through consequential choices with more perspectives and clearer next steps.

## Built solo

Mashwara AI was designed and engineered end-to-end as a solo submission—from product UX and multilingual interaction to agent orchestration, evidence pipelines, realtime streaming, authentication, and deployment.

## Roadmap

- Evaluate decision quality with real users and structured rubrics
- Improve speech support and recovery behavior across more browsers
- Add deeper reliability, latency, and consultation-quality observability
- Expand language support to more regional Pakistani languages

---

<p align="center">
  Pakistan does not need another chatbot.<br />
  It needs a better way to decide.
</p>

<p align="center">
  <strong>Don't ask one AI. Ask a panel.</strong><br />
  <a href="https://mashwara-ai.vercel.app">Open Mashwara AI</a>
</p>

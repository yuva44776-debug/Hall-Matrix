# Hall Matrix – NLP-Based Intelligent Exam Cell Assistant

## AI Curriculum Development Implementation

This version adds a production-friendly **TF-IDF + Logistic Regression intent-classification layer** to the existing Hall Matrix Matrix AI Assistant.

### What was added
- 1,800 labelled natural-language query samples in `data/matrix_ai_intent_dataset.csv`.
- Eight intent classes covering the existing assistant workflows.
- TF-IDF feature extraction with unigram + bigram features.
- Logistic Regression intent classifier trained offline with scikit-learn.
- Exported model parameters in `backend/ai_model/model.json` so the Node.js application can run inference without Python at runtime.
- Node.js inference module in `backend/ai_model/tfidf_intent_model.js`.
- Integration into `/api/ai/chat` for intent-aware routing while retaining the existing database access and role/security logic.
- Natural-language hall-count analysis backed by the tenant's `halls` and `seat_allocations` tables.
- Training/evaluation script in `scripts/train_intent_model.py`.

## Intent classes

| Intent | Purpose |
|---|---|
| `student_hall` | Student exam hall / seat lookup |
| `student_profile` | Student profile, tutor, department, batch and subject queries |
| `tutor_today_exam` | Tutor's today's exam query |
| `tutor_timetable` | Tutor batch timetable / schedule query |
| `today_students_count` | Total students/candidates for a date |
| `today_halls_count` | Total halls/rooms for a date |
| `today_summary` | Combined student + hall allocation summary |
| `general_help` | Greetings and assistant help queries |

Hall-count questions are handled by a deterministic query parser before model routing. It supports individual and multiple hall IDs, totals across registered halls, and highest-count hall queries. Results count distinct, non-empty student register numbers from the latest available exam date/session (or an explicitly requested date/session), rather than generating counts with the language model. Unknown hall IDs return a not-found response, and hall-wide counts require an administrator session.

## AI workflow

User query → text normalization → TF-IDF (1-2 grams) → Logistic Regression → intent + confidence → existing Hall Matrix routing → SQLite/live allocation data → response.

For hall-count queries, the deterministic database-backed handler runs before ML intent routing. The ML model is used as an intent-routing layer for the remaining workflows. Existing database retrieval, student/tutor session checks and tutor department/batch access controls remain in place.

## Dataset

- Total labelled queries: **1,800**
- Intents: **8**
- Samples per intent: **225**
- Training/test split: **80/20** with stratification and random state 42.

The dataset is a project-created labelled intent dataset for development and demonstration. It is not claimed to be a production user-traffic dataset.

## Model training

From the project root:

```bash
python scripts/train_intent_model.py
```

Python packages required for training:

```bash
pip install pandas scikit-learn
```

The script writes:

- `backend/ai_model/model.json`
- `data/model_metrics.json`

### Reported validation result

On the generated 80/20 held-out dataset, the classifier achieved 100% accuracy, weighted precision, weighted recall and weighted F1. Because the dataset is synthetic/project-created, these metrics should be treated as development validation results rather than evidence of real-world performance.

## Running the application

The application itself remains a Node.js + React + SQLite application. The exported model is already included, so Python is **not required at runtime**.

### Backend

```bash
cd backend
npm install
npm start
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Demonstration queries

- Where is my exam hall?
- What is my seat number?
- Who is my tutor?
- What exam is my batch writing today?
- What is the exam timetable for my batch?
- How many students are writing today?
- How many halls are used today?
- Show total students and halls today.
- What is the count in H101?
- Compare H101 and H102.
- Which hall has the highest number of students?
- Show the total number of students across all halls.

Run the hall-count service tests from the project root with:

```bash
node --test backend/tests/hallCountService.test.js
```

## Important implementation note

The original Hall Matrix application already contained rule-based natural-language routing. This update adds a trained ML classifier in front of those workflows rather than removing the existing database and security logic. This allows the project to demonstrate an actual TF-IDF + Logistic Regression AI component while preserving the existing Hall Matrix functionality.

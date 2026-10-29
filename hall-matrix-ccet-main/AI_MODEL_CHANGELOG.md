# AI Model Change Log

## Version 1.0 – September 2026

### Added
- TF-IDF vectorization using unigram and bigram features.
- Logistic Regression classifier with eight Hall Matrix intent classes.
- 1,800 labelled query samples.
- Offline model training and JSON export.
- Runtime JavaScript inference without a Python service.
- AI metadata in `/api/ai/chat` responses: model, predicted intent and confidence.

### Preserved
- Existing Matrix AI database queries.
- Student login/session handling.
- Tutor department/batch authorization checks.
- Existing hall/seat allocation logic.
- Existing SQLite tenant databases.

### Validation
- 1,440 training samples.
- 360 held-out test samples.
- Stratified 80/20 split, random state 42.
- Accuracy: 100% on the project-created held-out dataset.

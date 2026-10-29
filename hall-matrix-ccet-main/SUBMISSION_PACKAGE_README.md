# Hall Matrix AI Curriculum Development – Submission Package

## Main deliverables
1. `Hall_Matrix_AI_Curriculum_Development_Presentation.pptx` – presentation for coordinator review.
2. `Hall_Matrix_AI_Curriculum_Technical_Document.docx` – technical supporting document.
3. `Hall_Matrix_AI_Enhanced_Source.zip` – modified Hall Matrix source code, model and training resources.
4. `matrix_ai_intent_dataset.csv` – 1,800 labelled query samples.
5. `model_metrics.json` – training/test metrics.
6. `sample_ai_queries.csv` – small demonstration set.
7. `README_AI_CURRICULUM.md` – implementation and run instructions.
8. `AI_MODEL_CHANGELOG.md` – change summary.

## AI implementation
The project now includes a TF-IDF + Logistic Regression intent classifier with eight intents. The exported model runs inside the Node.js application, so Python is needed only when retraining the model.

## Important note for presentation
The reported 100% validation metrics are from a project-created synthetic/templated dataset with an 80/20 held-out split. They should be described as development validation results, not real-world production accuracy.

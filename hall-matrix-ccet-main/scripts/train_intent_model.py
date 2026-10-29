import json
from pathlib import Path
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, classification_report, confusion_matrix

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data'/'matrix_ai_intent_dataset.csv'
OUT=ROOT/'backend'/'ai_model'/'model.json'
METRICS=ROOT/'data'/'model_metrics.json'

df=pd.read_csv(DATA).dropna()
X_train,X_test,y_train,y_test=train_test_split(df['query'],df['intent'],test_size=0.2,random_state=42,stratify=df['intent'])
vec=TfidfVectorizer(lowercase=True, ngram_range=(1,2), min_df=1, sublinear_tf=True, norm='l2')
Xt=vec.fit_transform(X_train)
Xv=vec.transform(X_test)
clf=LogisticRegression(max_iter=2000, random_state=42, solver='lbfgs')
clf.fit(Xt,y_train)
pred=clf.predict(Xv)
proba=clf.predict_proba(Xv)
acc=accuracy_score(y_test,pred)
prec,rec,f1,_=precision_recall_fscore_support(y_test,pred,average='weighted',zero_division=0)
labels=list(clf.classes_)
cm=confusion_matrix(y_test,pred,labels=labels)
report=classification_report(y_test,pred,labels=labels,output_dict=True,zero_division=0)

# Store feature ordering, including sklearn's unigram/bigram vocabulary. JS reproduces this tokenization.
features=vec.get_feature_names_out().tolist()
idf=vec.idf_.tolist()
model={
  'model_type':'TF-IDF + Logistic Regression',
  'version':'1.0',
  'classes':labels,
  'vocabulary':features,
  'idf':idf,
  'coef':clf.coef_.tolist(),
  'intercept':clf.intercept_.tolist(),
  'training_rows':int(len(X_train)),
  'test_rows':int(len(X_test)),
  'random_state':42,
  'vectorizer':{'ngram_range':[1,2],'sublinear_tf':True,'norm':'l2'}
}
OUT.write_text(json.dumps(model),encoding='utf-8')
metrics={
 'dataset_rows':int(len(df)), 'train_rows':int(len(X_train)), 'test_rows':int(len(X_test)),
 'accuracy':acc,'weighted_precision':prec,'weighted_recall':rec,'weighted_f1':f1,
 'classes':labels,'classification_report':report,'confusion_matrix':cm.tolist()
}
METRICS.write_text(json.dumps(metrics,indent=2),encoding='utf-8')
print(f'Accuracy: {acc:.4f}')
print(f'Weighted precision: {prec:.4f}')
print(f'Weighted recall: {rec:.4f}')
print(f'Weighted F1: {f1:.4f}')
print(classification_report(y_test,pred,labels=labels,zero_division=0))

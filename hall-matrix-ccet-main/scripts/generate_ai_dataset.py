import csv, random, re
from pathlib import Path

random.seed(42)
OUT = Path(__file__).resolve().parents[1] / 'data' / 'matrix_ai_intent_dataset.csv'
OUT.parent.mkdir(exist_ok=True)

regnos = ['100000000001','100000000002','100000000003','100000000004','100000000005']
dates = ['14 September 2026','15 September 2026','18/09/2026','20-09-2026','2026-09-25','25/09/2026']

templates = {
'student_hall': [
 'Where is my exam hall?', 'Where is my seat?', 'What is my hall number?', 'What is my seat number?',
 'Which hall am I assigned to?', 'Where should I sit for the exam?', 'Find my exam room', 'Tell me my seating location',
 'Where do I write my exam?', 'Show my hall and seat details', 'Can you find my exam seat?', 'My hall details please',
 'Where is my exam room?', 'Which seat is mine?', 'Hall and seat for my exam please', 'Entha hall la exam ezhuthanum?',
 'Enoda seat enga?', 'Enaku hall number sollunga', 'Exam hall enga irukku?', 'Where should I go for my exam?'
],
'student_profile': [
 'Show my profile', 'What are my student details?', 'Who is my tutor?', 'Who is my class advisor?',
 'What is my department?', 'What is my batch?', 'What is my register number?', 'Show my academic information',
 'What subjects am I taking?', 'List my subjects', 'Tell me my tutor details', 'Show my student information',
 'What is my semester?', 'Show my profile information', 'Who is my mentor?', 'Enoda tutor yaaru?',
 'Enoda department enna?', 'Enoda subjects enna?', 'Enoda profile kaami', 'My academic details please'
],
'tutor_today_exam': [
 'What exam is my batch writing today?', 'Which exam do my students have today?', 'What is today exam for my batch?',
 'Do my students have an exam today?', 'What paper are my students writing today?', 'Tell me today exam',
 'Which subject exam is today?', 'What examination is scheduled today for my students?', 'Today which exam for my batch?',
 'Are my batch students writing an exam today?', 'What exam do our students have today?', 'Today exam details for my batch',
 'Inaiku enna exam for my batch?', 'Which paper do my students write today?', 'Tell me the exam scheduled today'
],
'tutor_timetable': [
 'What is the exam timetable for my batch?', 'Show my batch exam schedule', 'Give me the exam timetable',
 'When are my students exams?', 'Show upcoming exams for my students', 'List all exam dates for my batch',
 'What are the upcoming exams?', 'Show exam dates for my batch', 'Give the schedule for my students',
 'What is the timetable?', 'Show my batch schedule', 'When is the next exam for my students?',
 'Exam timetable for our batch please', 'Upcoming exam list for my students', 'Show all exams for my batch'
],
'today_students_count': [
 'How many students are writing today?', 'What is the total student count today?', 'How many students are allocated today?',
 'How many candidates have exams today?', 'Give me today student strength', 'How many students are appearing today?',
 'What is the number of students writing the exam today?', 'Today how many students are allocated?',
 'Total students for today exam?', 'How many students have exams today?', 'Student count for today',
 'How many candidates are appearing today?', 'How many students are writing the paper today?'
],
'today_halls_count': [
 'How many halls are used today?', 'What is the total number of halls today?', 'How many exam halls are allocated today?',
 'Give me today hall count', 'How many rooms are being used today?', 'What is the hall count for today?',
 'How many examination halls are active today?', 'Total halls for today exam?', 'How many halls are allocated today?',
 'Number of rooms used today', 'Today how many halls are occupied?', 'Exam hall count for today'
],
'today_summary': [
 'Show total students and halls today', 'Give me today exam allocation summary', 'How many students and halls are there today?',
 'Show the complete allocation summary for today', 'Today exam summary please', 'Give total students and total halls today',
 'How many candidates and halls are allocated today?', 'Show today allocation statistics', 'Today hall and student summary',
 'Give me the exam allocation overview for today', 'Total students and exam halls today', 'Show today exam allocation details'
],
'general_help': [
 'Hello', 'Hi', 'Hey', 'Help', 'What can you do?', 'How can you help me?', 'Matrix AI help', 'What queries can I ask?',
 'Tell me about the assistant', 'I need help', 'Show available options', 'What can Matrix AI do?', 'Hello Matrix AI',
 'Hi assistant', 'Help me with exam information', 'What information is available?', 'Can you help?', 'Good morning',
 'Good afternoon', 'Start assistant'
]
}

prefixes = ['', 'please ', 'can you ', 'could you ', 'kindly ', 'tell me ', 'i want to know ', 'i need to know ', 'can i know ', 'please tell me ']
suffixes = ['', ' please', ' now', ' for today', ' for my exam', ' for my batch', ' quickly', ' thanks', ' kindly']
role_phrases = {
 'student_hall': ['', ' for me', ' for my exam', ' with my register number'],
 'student_profile': ['', ' for me', ' as a student'],
 'tutor_today_exam': ['', ' for my batch', ' for my students'],
 'tutor_timetable': ['', ' for my batch', ' for my students'],
 'today_students_count': ['', ' for the exam', ' in the system'],
 'today_halls_count': ['', ' for the exam', ' in the system'],
 'today_summary': ['', ' for the exam', ' in the system'],
 'general_help': ['', ' please']
}

def personalize(intent, base, idx):
    text = base
    if intent in ('student_hall','student_profile') and idx % 5 == 0:
        text += f' for {regnos[idx % len(regnos)]}'
    if intent in ('today_students_count','today_halls_count','today_summary') and idx % 6 == 0:
        text = text.replace('today', dates[idx % len(dates)])
    if intent in ('tutor_today_exam','tutor_timetable') and idx % 7 == 0:
        text += ' for my department'
    return re.sub(r'\s+', ' ', text).strip()

rows=[]
per_intent=225
for intent, bases in templates.items():
    seen=set()
    candidates=[]
    # Base + prefix/suffix combinations provide many natural paraphrases.
    for bi, base in enumerate(bases):
        for pi, pre in enumerate(prefixes):
            for si, suf in enumerate(suffixes):
                if len(candidates) >= per_intent * 3:
                    break
                q=f"{pre}{base}{suf}"
                if intent in ('student_hall','student_profile') and (bi+pi+si)%9==0:
                    q += f" for {regnos[(bi+pi+si)%len(regnos)]}"
                if intent in ('today_students_count','today_halls_count','today_summary') and (bi+pi+si)%13==0:
                    q=q.replace('today', dates[(bi+pi+si)%len(dates)])
                if intent in ('tutor_today_exam','tutor_timetable') and (bi+pi+si)%11==0:
                    q += ' for my department'
                q=re.sub(r'\s+', ' ', q).strip()
                key=q.lower()
                if key not in seen:
                    seen.add(key); candidates.append(q)
            if len(candidates) >= per_intent * 3: break
        if len(candidates) >= per_intent * 3: break
    random.shuffle(candidates)
    for q in candidates[:per_intent]: rows.append((q,intent))

random.shuffle(rows)
with OUT.open('w',newline='',encoding='utf-8') as f:
    w=csv.writer(f); w.writerow(['query','intent']); w.writerows(rows)
print(f'Wrote {len(rows)} rows to {OUT}')
for intent in templates:
    print(intent, sum(1 for _,y in rows if y==intent))

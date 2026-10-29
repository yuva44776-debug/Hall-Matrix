// Utility to generate sample Excel/CSV templates for bulk upload

function downloadCSV(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export const downloadStudentsTemplate = () => {
  const content = `regno,name,gmail_username,dept,subject_code,batch,degree
950001,John Doe,johndoe@gmail.com,CSE,CS8591,2022-2026,B.E.
950002,Jane Smith,janesmith@gmail.com,ECE,EC8551,2022-2026,B.E.
950003,Robert Brown,robertbrown@gmail.com,MECH,ME8592,2022-2026,B.E.`;
  downloadCSV('students_template.csv', content);
};

export const downloadSubjectsTemplate = () => {
  const content = `Department,Subject Code,Subject Name,Assigned Batch
AIDS,HS3151,Professional English I,2023-2027
AIDS,MA3151,Matrices and Calculus,2023-2027
CSE,CS8591,Computer Networks,2022-2026
ECE,EC8551,Communication Networks,2022-2026`;
  downloadCSV('subjects_template.csv', content);
};

export const downloadHallsTemplate = () => {
  const content = `hall_no,capacity,block
101,24,Main Block
102,30,Science Block
103,24,IT Block`;
  downloadCSV('halls_template.csv', content);
};

export const downloadInvigilatorsTemplate = () => {
  const content = `name,dept
Dr. Alan Turing,CSE
Prof. Grace Hopper,ECE
Dr. Nikola Tesla,MECH`;
  downloadCSV('invigilators_template.csv', content);
};

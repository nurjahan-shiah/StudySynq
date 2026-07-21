/**
 * frontend/src/lib/majors.ts
 * York University undergraduate majors/programs, grouped by faculty.
 * Shared between /signup (student's own major) and /groups (a group's intended major).
 */

export interface MajorGroup {
  faculty: string;
  majors: string[];
}

export const MAJOR_GROUPS: MajorGroup[] = [
  {
    faculty: "Lassonde School of Engineering",
    majors: [
      "Computer Science",
      "Software Engineering",
      "Computer Engineering",
      "Electrical Engineering",
      "Civil Engineering",
      "Mechanical Engineering",
      "Space Engineering",
      "Geomatics Engineering",
      "Engineering (Common First Year)",
    ],
  },
  {
    faculty: "Faculty of Science",
    majors: [
      "Biology",
      "Biochemistry",
      "Biomedical Science",
      "Chemistry",
      "Physics and Astronomy",
      "Mathematics",
      "Applied Mathematics",
      "Statistics",
      "Earth and Atmospheric Science",
      "Environmental Biology",
      "Mathematical Biology",
      "Science and Technology Studies",
      "Psychology (BSc)",
    ],
  },
  {
    faculty: "Schulich School of Business",
    majors: [
      "Business Administration (BBA)",
      "International Business (iBBA)",
    ],
  },
  {
    faculty: "Liberal Arts & Professional Studies",
    majors: [
      "Economics",
      "Political Science",
      "Sociology",
      "Psychology (BA)",
      "English",
      "History",
      "Philosophy",
      "Communication Studies",
      "Criminology",
      "Human Rights and Equity Studies",
      "International Development Studies",
      "Public Policy and Administration",
      "Social Work",
      "Anthropology",
      "Geography",
      "Global and International Studies",
      "Linguistics and Language Studies",
      "French Studies",
      "Spanish",
      "Gender, Sexuality and Women's Studies",
      "Disaster and Emergency Management",
      "Human Resources Management",
      "Information Technology",
    ],
  },
  {
    faculty: "Faculty of Health",
    majors: [
      "Kinesiology and Health Science",
      "Nursing",
      "Global Health",
      "Health Policy and Management",
      "Health Informatics",
      "Public Health",
    ],
  },
  {
    faculty: "School of the Arts, Media, Performance & Design",
    majors: [
      "Cinema and Media Arts",
      "Dance",
      "Music",
      "Theatre",
      "Visual Arts",
      "Design",
      "Digital Media",
    ],
  },
  {
    faculty: "Faculty of Education",
    majors: ["Education"],
  },
  {
    faculty: "Glendon College",
    majors: ["Multidisciplinary Studies (Glendon)", "International Studies (Glendon)"],
  },
  {
    faculty: "Environmental & Urban Change",
    majors: ["Environmental Studies", "Environmental Science", "Urban Studies"],
  },
  {
    faculty: "Other",
    majors: ["Other"],
  },
];

// Flat list, useful for simple validation or search
export const ALL_MAJORS: string[] = MAJOR_GROUPS.flatMap(g => g.majors);
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const outputDir = path.join(rootDir, "server", "pdfs");
const markdownPath = path.join(outputDir, "company-x-employee-knowledge-base.md");
const pdfPath = path.join(outputDir, "company-x-employee-knowledge-base.pdf");

const firstNames = [
  "Amina", "Noah", "Leila", "Adam", "Sofia", "Youssef", "Maya", "Omar", "Nora", "Liam",
  "Hana", "Elias", "Sara", "Karim", "Mila", "Rayan", "Lina", "Ilyas", "Jana", "Amir",
  "Zara", "Daniel", "Salma", "Leo", "Ines", "Nabil", "Mariam", "Samir", "Aya", "Lucas",
  "Dina", "Malik", "Rim", "Evan", "Nadia", "Bilal", "Emma", "Tariq", "Clara", "Hamza",
  "Yasmine", "Victor", "Imane", "Oscar", "Lara", "Mehdi", "Nour", "Jonas", "Farah", "Anas"
];

const lastNames = [
  "Bennani", "Carter", "El Amrani", "Stone", "Haddad", "Morrison", "Belkacem", "Wright", "Rahmani", "Cooper",
  "Alaoui", "Foster", "Mansouri", "Bennett", "Ziani", "Morgan", "Kabbaj", "Reed", "Saidi", "Parker",
  "Cherkaoui", "Brooks", "Idrissi", "Fleming", "Tazi", "Hayes", "Berrada", "Mason", "Lahlou", "Price",
  "Fassi", "Cole", "Skalli", "Ward", "Jalal", "Ross", "Lamrani", "Bishop", "Guessous", "Wells",
  "Bouzid", "Knight", "Rami", "Sharp", "Bakkali", "Hunt", "Sefrioui", "Walsh", "Amrani", "Page"
];

const locations = ["New York HQ", "Rabat Office", "London Office", "Berlin Office", "Remote US", "Remote EMEA"];

const shiftPatterns = [
  "Morning shift, 08:00-16:00 local time",
  "Standard shift, 09:00-17:30 local time",
  "Late support shift, 12:00-20:00 local time",
  "Split collaboration shift, 10:00-14:00 and 16:00-20:00 local time",
  "Night operations shift, 20:00-04:00 local time"
];

const workModes = ["Office", "Hybrid 3 days office", "Remote", "Field customer visits", "Rotating branch coverage"];

const skillPools = {
  Engineering: ["Node.js", "React", "API design", "observability", "automated testing", "cloud deployment"],
  Product: ["roadmapping", "customer discovery", "analytics", "prioritization", "launch planning"],
  Design: ["Figma", "accessibility", "UX research", "design systems", "interaction design"],
  "Data and AI": ["SQL", "Python", "dashboarding", "model evaluation", "data quality", "experimentation"],
  Sales: ["enterprise discovery", "CRM hygiene", "demo strategy", "negotiation", "account planning"],
  "Customer Success": ["onboarding", "health scoring", "renewal planning", "support triage", "training"],
  Marketing: ["campaign strategy", "copywriting", "SEO", "webinars", "product messaging"],
  Finance: ["forecasting", "billing controls", "payroll", "revenue recognition", "vendor management"],
  "People Operations": ["recruiting", "employee relations", "performance reviews", "policy operations"],
  "IT and Security": ["identity access", "endpoint security", "SOC 2 evidence", "incident response"],
  Operations: ["procurement", "process design", "vendor operations", "reporting", "office coordination"],
  Executive: ["strategy", "operating cadence", "board communication", "risk management"]
};

const languageByCountry = {
  France: ["French", "English"],
  USA: ["English", "Spanish"],
  Canada: ["English", "French"],
  Nigeria: ["English", "Yoruba"],
  "South Africa": ["English", "Zulu"],
  Morocco: ["Arabic", "French", "English"],
  Russia: ["Russian", "English"],
  Indonesia: ["Indonesian", "English"],
  Australia: ["English"]
};

const branchCountries = [
  {
    country: "France",
    city: "Paris",
    code: "FR",
    employeeCount: 38,
    focus: "European enterprise sales, product localization, and data privacy readiness",
    branchProject: "PX-France-Elevate",
    specialties: ["French market expansion", "GDPR operations", "enterprise onboarding", "localized product demos"]
  },
  {
    country: "USA",
    city: "New York",
    code: "US",
    employeeCount: 52,
    focus: "global headquarters, strategic accounts, platform engineering, and finance operations",
    branchProject: "PX-USA-Core",
    specialties: ["executive operations", "enterprise sales", "platform reliability", "billing automation"]
  },
  {
    country: "Canada",
    city: "Toronto",
    code: "CA",
    employeeCount: 34,
    focus: "customer success, analytics delivery, and North American implementation support",
    branchProject: "PX-Canada-Northstar",
    specialties: ["customer onboarding", "analytics dashboards", "renewal support", "implementation playbooks"]
  },
  {
    country: "Nigeria",
    city: "Lagos",
    code: "NG",
    employeeCount: 36,
    focus: "African market growth, mobile workflows, and regional partner enablement",
    branchProject: "PX-Nigeria-Rise",
    specialties: ["partner enablement", "mobile adoption", "field operations", "regional support"]
  },
  {
    country: "South Africa",
    city: "Cape Town",
    code: "ZA",
    employeeCount: 32,
    focus: "support operations, security coordination, and customer training for Southern Africa",
    branchProject: "PX-SouthAfrica-Sentinel",
    specialties: ["support operations", "security reviews", "training programs", "incident coordination"]
  },
  {
    country: "Morocco",
    city: "Casablanca",
    code: "MA",
    employeeCount: 44,
    focus: "nearshore engineering, multilingual support, and EMEA operations",
    branchProject: "PX-Morocco-Bridge",
    specialties: ["frontend engineering", "Arabic and French support", "EMEA operations", "QA automation"]
  },
  {
    country: "Russia",
    city: "Moscow",
    code: "RU",
    employeeCount: 28,
    focus: "infrastructure research, internal tooling, and system performance testing",
    branchProject: "PX-Russia-Nebula",
    specialties: ["performance testing", "internal tools", "infrastructure research", "data pipelines"]
  },
  {
    country: "Indonesia",
    city: "Jakarta",
    code: "ID",
    employeeCount: 40,
    focus: "APAC customer operations, mobile-first workflows, and implementation delivery",
    branchProject: "PX-Indonesia-Garuda",
    specialties: ["APAC onboarding", "mobile workflows", "customer education", "local partner support"]
  },
  {
    country: "Australia",
    city: "Sydney",
    code: "AU",
    employeeCount: 30,
    focus: "APAC enterprise sales, compliance support, and late-day global support coverage",
    branchProject: "PX-Australia-SouthernCross",
    specialties: ["APAC sales", "compliance support", "support coverage", "executive reporting"]
  }
];

const projects = [
  {
    code: "PX-Atlas",
    name: "Atlas Customer Portal",
    owner: "Product",
    status: "In build",
    summary: "Self-service customer portal for contracts, support cases, and billing visibility.",
    goal: "Reduce support tickets by 18 percent and improve renewal readiness."
  },
  {
    code: "PX-Nova",
    name: "Nova Mobile App",
    owner: "Engineering",
    status: "Beta",
    summary: "Mobile companion app for field employees and customer success managers.",
    goal: "Launch iOS and Android beta with offline-first task capture."
  },
  {
    code: "PX-Orion",
    name: "Orion Data Lake",
    owner: "Data and AI",
    status: "Discovery",
    summary: "Unified analytics layer for sales, product usage, finance, and support data.",
    goal: "Create trusted weekly executive dashboards."
  },
  {
    code: "PX-Mercury",
    name: "Mercury Billing Automation",
    owner: "Finance",
    status: "In build",
    summary: "Automates invoice validation, renewal notices, and revenue recognition checks.",
    goal: "Cut manual finance operations by 30 percent."
  },
  {
    code: "PX-Horizon",
    name: "Horizon Security Program",
    owner: "IT and Security",
    status: "Active",
    summary: "Company-wide security hardening, device compliance, and access review program.",
    goal: "Prepare for SOC 2 Type II audit."
  },
  {
    code: "PX-Summit",
    name: "Summit Sales Enablement",
    owner: "Sales",
    status: "Active",
    summary: "Playbooks, demo assets, and account intelligence for enterprise sales teams.",
    goal: "Increase enterprise win rate by 10 percent."
  },
  {
    code: "PX-Pulse",
    name: "Pulse Employee Experience",
    owner: "People Operations",
    status: "Planning",
    summary: "Employee engagement surveys, career ladders, and manager enablement program.",
    goal: "Improve engagement score from 72 to 80."
  },
  {
    code: "PX-Launchpad",
    name: "Launchpad Onboarding",
    owner: "Customer Success",
    status: "In build",
    summary: "Repeatable customer onboarding journey with templates, health scores, and milestones.",
    goal: "Reduce time to first value from 21 days to 12 days."
  },
  {
    code: "PX-Lumen",
    name: "Lumen Brand Refresh",
    owner: "Marketing",
    status: "Active",
    summary: "Refreshes brand language, product pages, event content, and case studies.",
    goal: "Increase qualified inbound pipeline by 15 percent."
  },
  {
    code: "PX-Forge",
    name: "Forge Internal Tools",
    owner: "Operations",
    status: "Maintenance",
    summary: "Internal workflow tools for approvals, procurement, travel, and equipment requests.",
    goal: "Make internal requests traceable and measurable."
  }
];

const departmentPlans = [
  {
    name: "Executive",
    count: 5,
    roles: ["Chief Executive Officer", "Chief Technology Officer", "Chief Revenue Officer", "Chief Financial Officer", "Chief Operating Officer"],
    baseSalary: 195000,
    tasks: [
      "Review company scorecards and unblock cross-functional decisions.",
      "Coach department leads on quarterly goals and operating risks.",
      "Prepare updates for board, investors, and strategic partners."
    ]
  },
  {
    name: "Engineering",
    count: 18,
    roles: ["Backend Engineer", "Frontend Engineer", "Full Stack Engineer", "Platform Engineer", "QA Automation Engineer", "Engineering Manager"],
    baseSalary: 108000,
    tasks: [
      "Ship code against sprint tickets and review pull requests.",
      "Fix production issues from the on-call or support escalation queue.",
      "Write tests, update technical docs, and improve developer tooling."
    ]
  },
  {
    name: "Product",
    count: 8,
    roles: ["Product Manager", "Product Operations Manager", "Technical Product Manager", "Growth Product Manager"],
    baseSalary: 116000,
    tasks: [
      "Prioritize roadmap items using customer feedback and business impact.",
      "Write product briefs, acceptance criteria, and launch notes.",
      "Run discovery calls and align design, engineering, and GTM teams."
    ]
  },
  {
    name: "Design",
    count: 7,
    roles: ["Product Designer", "UX Researcher", "Design Systems Designer", "Content Designer"],
    baseSalary: 98000,
    tasks: [
      "Design user flows, prototypes, and interface states for active projects.",
      "Conduct usability reviews and synthesize research findings.",
      "Maintain design system components and accessibility standards."
    ]
  },
  {
    name: "Data and AI",
    count: 10,
    roles: ["Data Analyst", "Analytics Engineer", "Machine Learning Engineer", "Data Scientist", "AI Product Specialist"],
    baseSalary: 118000,
    tasks: [
      "Build datasets, dashboards, and model evaluation reports.",
      "Investigate data quality issues and document metric definitions.",
      "Support product teams with experiments and AI-assisted workflows."
    ]
  },
  {
    name: "Sales",
    count: 12,
    roles: ["Account Executive", "Sales Development Representative", "Solutions Consultant", "Enterprise Account Executive"],
    baseSalary: 84000,
    tasks: [
      "Prospect target accounts and update pipeline notes.",
      "Prepare demos, proposals, and stakeholder maps for opportunities.",
      "Coordinate handoffs with customer success after closed deals."
    ]
  },
  {
    name: "Customer Success",
    count: 10,
    roles: ["Customer Success Manager", "Implementation Specialist", "Support Lead", "Renewals Manager"],
    baseSalary: 82000,
    tasks: [
      "Monitor customer health and respond to support escalations.",
      "Run onboarding sessions, adoption reviews, and renewal planning calls.",
      "Capture product feedback and share patterns with Product."
    ]
  },
  {
    name: "Marketing",
    count: 8,
    roles: ["Content Marketing Manager", "Demand Generation Manager", "Product Marketing Manager", "Events Manager"],
    baseSalary: 79000,
    tasks: [
      "Create campaign assets, landing pages, and customer stories.",
      "Analyze campaign performance and update lifecycle segments.",
      "Support launches with messaging, webinars, and field enablement."
    ]
  },
  {
    name: "Finance",
    count: 6,
    roles: ["Financial Analyst", "Accounting Manager", "Revenue Operations Analyst", "Payroll Specialist"],
    baseSalary: 88000,
    tasks: [
      "Review invoices, revenue reports, and forecast assumptions.",
      "Reconcile payroll, expenses, and vendor payment queues.",
      "Prepare finance dashboards and month-end close documentation."
    ]
  },
  {
    name: "People Operations",
    count: 6,
    roles: ["People Operations Partner", "Recruiter", "Learning and Development Lead", "HR Generalist"],
    baseSalary: 76000,
    tasks: [
      "Support hiring loops, onboarding, and employee relations.",
      "Update policies, compensation bands, and performance review materials.",
      "Coordinate learning programs and manager enablement sessions."
    ]
  },
  {
    name: "IT and Security",
    count: 5,
    roles: ["IT Support Specialist", "Security Engineer", "Systems Administrator", "Compliance Analyst"],
    baseSalary: 92000,
    tasks: [
      "Resolve access requests, device issues, and security alerts.",
      "Review permissions, compliance evidence, and vendor risk items.",
      "Improve endpoint management, backup, and incident response playbooks."
    ]
  },
  {
    name: "Operations",
    count: 5,
    roles: ["Operations Manager", "Procurement Specialist", "Office Coordinator", "Business Operations Analyst"],
    baseSalary: 74000,
    tasks: [
      "Manage internal requests, vendor renewals, and office operations.",
      "Track process bottlenecks and improve approval workflows.",
      "Prepare weekly operational metrics for department leads."
    ]
  }
];

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function dateOfBirth(index) {
  const year = 1976 + ((index * 7) % 25);
  const month = String(((index * 5) % 12) + 1).padStart(2, "0");
  const day = String(((index * 11) % 28) + 1).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startDate(index) {
  const year = 2017 + (index % 8);
  const month = String(((index * 3) % 12) + 1).padStart(2, "0");
  const day = String(((index * 7) % 28) + 1).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
}

function phoneNumber(countryCode, index) {
  return `+1-555-${String(countryCode.length * 100 + index).padStart(4, "0")}`;
}

function pickSkills(department, index) {
  const pool = skillPools[department] || skillPools.Operations;
  return [pool[index % pool.length], pool[(index + 2) % pool.length], pool[(index + 4) % pool.length]];
}

function pickLanguages(country, index) {
  const languages = languageByCountry[country] || ["English"];
  if (index % 5 === 0 && !languages.includes("English")) {
    return [...languages, "English"];
  }
  return languages;
}

function projectManagerName(index) {
  const firstName = firstNames[(index * 2 + 3) % firstNames.length];
  const lastName = lastNames[(index * 5 + 8) % lastNames.length];
  return `${firstName} ${lastName}`;
}

function deadline(index) {
  const quarter = (index % 4) + 1;
  const year = 2026 + (index % 2);
  return `Q${quarter} ${year}`;
}

function budget(index, base = 240000) {
  return currency(base + index * 37500);
}

function shiftFor(index) {
  return shiftPatterns[index % shiftPatterns.length];
}

function workModeFor(index) {
  return workModes[index % workModes.length];
}

function performanceBand(index) {
  const bands = ["Exceeds expectations", "Strong performer", "Solid performer", "New in role", "Needs focused support"];
  return bands[index % bands.length];
}

function accessLevel(department, role) {
  if (role.includes("Director") || department === "Executive") {
    return "Admin and strategic reporting access";
  }
  if (department === "Finance") {
    return "Finance systems and billing access";
  }
  if (department === "IT and Security") {
    return "Security tools and device management access";
  }
  if (department === "Engineering" || department === "Data and AI") {
    return "Product, repository, and analytics access";
  }
  return "Standard business application access";
}

function buildEmployees() {
  const employees = [];
  let employeeIndex = 0;

  for (const department of departmentPlans) {
    for (let offset = 0; offset < department.count; offset += 1) {
      const firstName = firstNames[employeeIndex % firstNames.length];
      const lastName = lastNames[(employeeIndex * 7 + Math.floor(employeeIndex / firstNames.length)) % lastNames.length];
      const role = department.roles[offset % department.roles.length];
      const project = projects[employeeIndex % projects.length];
      const secondaryProject = employeeIndex % 4 === 0 ? projects[(employeeIndex + 3) % projects.length] : null;
      const salary = department.baseSalary + (offset % 5) * 4500 + (employeeIndex % 3) * 2500;
      const manager = department.name === "Executive" ? "Board of Directors" : `${department.name} Director`;

      employees.push({
        id: `CX-${String(employeeIndex + 1).padStart(3, "0")}`,
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`,
        dateOfBirth: dateOfBirth(employeeIndex),
        startDate: startDate(employeeIndex),
        email: `${slug(firstName)}.${slug(lastName)}${employeeIndex + 1}@companyx.example`,
        phone: phoneNumber("HQ", employeeIndex + 1),
        salary,
        role,
        department: department.name,
        manager,
        location: locations[employeeIndex % locations.length],
        employmentType: employeeIndex % 13 === 0 ? "Contractor" : "Full-time",
        workMode: workModeFor(employeeIndex),
        shift: shiftFor(employeeIndex),
        projects: secondaryProject ? [project, secondaryProject] : [project],
        projectManager: projectManagerName(employeeIndex),
        projectRole: role.includes("Manager") || department.name === "Executive" ? "Project sponsor or decision owner" : "Contributing team member",
        skills: pickSkills(department.name, employeeIndex),
        languages: employeeIndex % 4 === 0 ? ["English", "French"] : ["English"],
        performanceBand: performanceBand(employeeIndex),
        accessLevel: accessLevel(department.name, role),
        ptoBalanceDays: 8 + (employeeIndex % 15),
        dailyTasks: department.tasks,
        focus: project.goal
      });

      employeeIndex += 1;
    }
  }

  return employees;
}

function buildMarkdown() {
  const employees = buildEmployees();
  const departmentRows = departmentPlans
    .map((department) => `| ${department.name} | ${department.count} | ${department.roles.join(", ")} |`)
    .join("\n");
  const projectRows = projects
    .map((project, index) => `| ${project.code} | ${project.name} | ${project.owner} | ${projectManagerName(index)} | ${project.status} | ${budget(index, 420000)} | ${deadline(index)} | ${project.goal} |`)
    .join("\n");
  const employeeRows = employees
    .map((employee) => {
      const projectNames = employee.projects.map((project) => project.code).join(", ");
      return `| ${employee.id} | ${employee.fullName} | ${employee.dateOfBirth} | ${employee.email} | ${employee.department} | ${employee.role} | ${currency(employee.salary)} | ${employee.shift} | ${employee.manager} | ${employee.location} | ${projectNames} | ${employee.projectManager} |`;
    })
    .join("\n");
  const employeeBriefs = employees
    .map((employee) => {
      const projectsLine = employee.projects.map((project) => `${project.code} (${project.name})`).join("; ");
      const tasks = employee.dailyTasks.map((task) => `  - ${task}`).join("\n");
      return `### ${employee.id} - ${employee.fullName}

- Department: ${employee.department}
- Post: ${employee.role}
- Email: ${employee.email}
- Phone: ${employee.phone}
- Date of birth: ${employee.dateOfBirth}
- Start date: ${employee.startDate}
- Salary: ${currency(employee.salary)}
- Manager: ${employee.manager}
- Location: ${employee.location}
- Employment type: ${employee.employmentType}
- Work mode: ${employee.workMode}
- Shift: ${employee.shift}
- Active project work: ${projectsLine}
- Project manager: ${employee.projectManager}
- Project role: ${employee.projectRole}
- Current project focus: ${employee.focus}
- Key skills: ${employee.skills.join(", ")}
- Languages: ${employee.languages.join(", ")}
- Performance band: ${employee.performanceBand}
- Access level: ${employee.accessLevel}
- PTO balance: ${employee.ptoBalanceDays} days
- Daily tasks:
${tasks}`;
    })
    .join("\n\n");

  return `# Company X Employee Knowledge Base

Version: 1.0
Dataset type: fictional synthetic company data for Document Q&A testing
Employee count: ${employees.length}

Important privacy note: Company X, the people, emails, salaries, dates of birth, projects, and policies in this document are fully fictional. The data is intended for testing a document Q&A chatbot and should not be treated as real personal information.

## Company Overview

Company X is a mid-sized B2B software company with 100 employees across product, engineering, data, revenue, finance, people operations, IT, and operations. The company sells a workflow intelligence platform for operations teams. The main business goals this year are improving customer onboarding, reducing manual internal processes, improving security posture, and increasing enterprise revenue.

Company X works in a hybrid model. Employees are distributed across New York HQ, Rabat Office, London Office, Berlin Office, Remote US, and Remote EMEA. Standard working hours are 9:00 to 17:30 local time, with engineering support coverage rotating weekly.

## Department Summary

| Department | Employees | Typical posts |
| --- | ---: | --- |
${departmentRows}

## Project Portfolio

| Code | Project | Owner | Project manager | Status | Budget | Deadline | Goal |
| --- | --- | --- | --- | --- | ---: | --- | --- |
${projectRows}

### Project Details

${projects
  .map(
    (project) => `#### ${project.code} - ${project.name}

- Owner department: ${project.owner}
- Project manager: ${projectManagerName(projects.indexOf(project))}
- Status: ${project.status}
- Budget: ${budget(projects.indexOf(project), 420000)}
- Deadline: ${deadline(projects.indexOf(project))}
- Summary: ${project.summary}
- Business goal: ${project.goal}`
  )
  .join("\n\n")}

## Company Policies and Operating Notes

- Compensation is reviewed every April. Salary changes depend on role scope, location band, performance, and company budget.
- Employees should update project status notes every Friday before 15:00 local time.
- Customer-facing teams must log account risks in the CRM within one business day.
- Engineering teams use two-week sprints. Pull requests should be reviewed within one business day.
- Security training is mandatory every quarter. All employees must use multi-factor authentication.
- Paid time off requires manager approval at least five working days in advance when possible.
- Contractors can access only the systems required for their assigned project.
- Managers should hold one-on-one meetings at least twice per month.
- Support escalations are handled by Customer Success first, then Engineering if a product defect is confirmed.
- The company prefers async updates for status, blockers, risks, and decision logs.

## Employee Directory

| ID | Name | Date of birth | Email | Department | Post | Salary | Shift | Manager | Location | Projects | Project manager |
| --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- |
${employeeRows}

## Employee Daily Work Briefs

${employeeBriefs}

## Useful Chatbot Test Questions

- Who works on PX-Atlas and what are their roles?
- Which employees are in Engineering and what are their daily tasks?
- What is the salary of CX-023?
- Who are the Customer Success employees assigned to onboarding work?
- Which departments are involved in SOC 2 readiness?
- List employees in the Rabat Office with their projects.
- What should employees do every Friday?
- Which projects are in build status?
- Compare the responsibilities of Product and Design.
- Which employees are contractors?
`;
}

function escapePdfText(value) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function stripMarkdown(line) {
  return line
    .replace(/^#{1,6}\s*/, "")
    .replace(/^[-*]\s*/, "- ")
    .replace(/\|/g, " | ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .trimEnd();
}

function wrapLine(line, maxLength = 96) {
  if (line.length <= maxLength) {
    return [line];
  }

  const words = line.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function writePdfFromMarkdown(markdown, targetPdfPath = pdfPath) {
  const lines = markdown
    .split(/\r?\n/)
    .flatMap((line) => {
      const clean = stripMarkdown(line);
      if (!clean) {
        return [""];
      }
      return wrapLine(clean);
    });

  const pages = [];
  let currentPage = [];
  const maxLinesPerPage = 50;

  for (const line of lines) {
    if (currentPage.length >= maxLinesPerPage) {
      pages.push(currentPage);
      currentPage = [];
    }
    currentPage.push(line);
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  const objects = [];

  function addObject(content) {
    objects.push(content);
    return objects.length;
  }

  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];

  for (const pageLines of pages) {
    const textCommands = pageLines
      .map((line) => {
        if (!line) {
          return "T*";
        }
        return `(${escapePdfText(line)}) Tj T*`;
      })
      .join("\n");

    const stream = `BT
/F1 8 Tf
38 770 Td
12 TL
${textCommands}
ET`;

    const contentId = addObject(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>
stream
${stream}
endstream`);

    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((content, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${content}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  fs.writeFileSync(targetPdfPath, pdf, "utf8");
  return pages.length;
}

function branchRole(index) {
  const leadershipRoles = [
    "Branch Director",
    "Operations Manager",
    "Engineering Manager",
    "Customer Success Manager",
    "Regional Sales Manager",
    "Data Lead",
    "Support Lead",
    "Security Coordinator",
    "Finance Coordinator",
    "People Operations Partner"
  ];
  const contributorRoles = [
    "Backend Engineer",
    "Frontend Engineer",
    "QA Automation Engineer",
    "Data Analyst",
    "Implementation Specialist",
    "Support Specialist",
    "Solutions Consultant",
    "Account Executive",
    "Marketing Specialist",
    "Office Coordinator",
    "Payroll Specialist",
    "Security Analyst",
    "Recruiting Coordinator",
    "Product Operations Analyst",
    "Backend Engineer",
    "Frontend Engineer",
    "Data Analyst",
    "Implementation Specialist",
    "Support Specialist"
  ];

  if (index < leadershipRoles.length) {
    return leadershipRoles[index];
  }

  return contributorRoles[(index - leadershipRoles.length) % contributorRoles.length];
}

function branchDepartment(role) {
  if (role.includes("Engineer") || role.includes("QA")) {
    return "Engineering";
  }
  if (role.includes("Data")) {
    return "Data and AI";
  }
  if (role.includes("Customer") || role.includes("Support") || role.includes("Implementation")) {
    return "Customer Success";
  }
  if (role.includes("Finance") || role.includes("Payroll")) {
    return "Finance";
  }
  if (role.includes("People") || role.includes("Recruiting")) {
    return "People Operations";
  }
  if (role.includes("Security")) {
    return "IT and Security";
  }
  if (role.includes("Sales") || role.includes("Solutions") || role.includes("Account Executive")) {
    return "Sales";
  }
  if (role.includes("Marketing")) {
    return "Marketing";
  }
  return "Operations";
}

function branchSalary(role, countryIndex, employeeIndex) {
  const base = role.includes("Director")
    ? 126000
    : role.includes("Engineering Manager") || role.includes("Regional Sales Manager") || role.includes("Data Lead")
      ? 108000
      : role.includes("Engineer")
      ? 94000
      : role.includes("Manager") || role.includes("Support Lead")
        ? 88000
      : role.includes("Data")
        ? 86000
        : role.includes("Security")
          ? 78000
          : role.includes("Finance") || role.includes("Payroll")
            ? 76000
            : role.includes("People") || role.includes("Recruiting")
              ? 74000
              : role.includes("Sales") || role.includes("Solutions") || role.includes("Account")
                ? 77000
                : role.includes("Marketing")
                  ? 72000
          : 70000;

  return base + countryIndex * 1300 + (employeeIndex % 6) * 2700;
}

function branchTasks(branch, role) {
  const sharedTasks = [
    `Support ${branch.country} branch goals for ${branch.focus}.`,
    `Update ${branch.branchProject} progress notes and risks before Friday close.`,
    `Coordinate with the global team when branch work affects shared customers or systems.`,
    `Document decisions, blockers, and next actions in the ${branch.country} branch workspace.`
  ];
  let roleTasks = [
    `Review local operating metrics for the ${branch.city} office.`,
    "Remove blockers for branch teammates and route decisions to the right owner.",
    "Prepare a concise daily update for branch leadership."
  ];

  if (role.includes("Director")) {
    roleTasks = [
      `Lead the ${branch.country} branch operating rhythm and weekly executive update.`,
      "Approve budget, hiring, and priority changes for the branch.",
      "Escalate customer, staffing, and compliance risks to global leadership."
    ];
  } else if (role.includes("Operations Manager") || role.includes("Office Coordinator") || role.includes("Product Operations")) {
    roleTasks = [
      `Coordinate staffing, vendor, office, and delivery workflows for ${branch.city}.`,
      "Keep branch process documentation, service levels, and handoffs current.",
      "Track branch blockers and follow up with the accountable owner."
    ];
  } else if (role.includes("Engineer") || role.includes("QA")) {
    roleTasks = [
      `Build and maintain product features used by the ${branch.country} branch.`,
      "Review pull requests, write tests, and fix production defects.",
      `Improve performance, reliability, and localized workflows for ${branch.city} operations.`
    ];
  } else if (role.includes("Customer") || role.includes("Implementation") || role.includes("Support")) {
    roleTasks = [
      `Run onboarding, training, and adoption sessions for ${branch.country} customers.`,
      "Track customer health, support escalations, and renewal risks.",
      `Share recurring ${branch.country} customer feedback with Product and Engineering.`
    ];
  } else if (role.includes("Sales") || role.includes("Solutions") || role.includes("Account Executive")) {
    roleTasks = [
      `Build pipeline, demos, and partner conversations for the ${branch.country} market.`,
      "Keep CRM opportunities, next steps, and decision makers current.",
      "Share buyer objections and pricing feedback with Product and Finance."
    ];
  } else if (role.includes("Security")) {
    roleTasks = [
      `Review access, compliance evidence, and incident readiness for the ${branch.country} branch.`,
      "Coordinate endpoint security and quarterly training completion.",
      "Escalate high-risk security events to the Horizon Security Program."
    ];
  } else if (role.includes("Finance") || role.includes("Payroll")) {
    roleTasks = [
      `Validate payroll, invoices, expense controls, and budget usage for ${branch.country}.`,
      "Prepare month-end finance notes and resolve missing approvals.",
      "Flag budget variance or vendor payment risks to the finance owner."
    ];
  } else if (role.includes("People") || role.includes("Recruiting")) {
    roleTasks = [
      `Support hiring, onboarding, employee relations, and policy questions in ${branch.country}.`,
      "Maintain employee records, onboarding tasks, and performance cycle reminders.",
      "Coach managers on one-on-ones, feedback, and staffing risks."
    ];
  } else if (role.includes("Data")) {
    roleTasks = [
      `Maintain dashboards for ${branch.country} capacity, project delivery, and customer risk.`,
      "Check source data quality and document metric definitions.",
      "Prepare insights for weekly branch planning and leadership review."
    ];
  } else if (role.includes("Marketing")) {
    roleTasks = [
      `Localize campaigns, webinars, and customer stories for ${branch.country}.`,
      "Coordinate launch assets with Sales, Product, and Design.",
      "Report campaign performance and content gaps to the growth team."
    ];
  }

  return [...roleTasks, ...sharedTasks];
}

function branchResponsibility(branch, role) {
  if (role.includes("Director")) {
    return `Owns branch strategy, staffing, budget health, and executive reporting for ${branch.country}.`;
  }
  if (role.includes("Manager") || role.includes("Lead")) {
    return `Leads planning and delivery for the ${branch.country} ${branchDepartment(role)} team.`;
  }
  if (role.includes("Engineer") || role.includes("QA")) {
    return `Delivers product quality and localized platform improvements for ${branch.city} customers.`;
  }
  if (role.includes("Customer") || role.includes("Support") || role.includes("Implementation")) {
    return `Owns customer adoption, training, support quality, and escalation follow-through in ${branch.country}.`;
  }
  if (role.includes("Sales") || role.includes("Solutions") || role.includes("Account")) {
    return `Builds regional pipeline, demos, and account plans for the ${branch.country} market.`;
  }
  if (role.includes("Security")) {
    return `Protects access, devices, security evidence, and incident readiness for ${branch.country}.`;
  }
  if (role.includes("Finance") || role.includes("Payroll")) {
    return `Manages branch finance controls, payroll support, invoices, and budget evidence.`;
  }
  if (role.includes("People") || role.includes("Recruiting")) {
    return `Supports hiring, onboarding, employee records, and manager guidance for ${branch.country}.`;
  }
  if (role.includes("Data")) {
    return `Maintains branch analytics, metric quality, and decision dashboards for ${branch.country}.`;
  }
  if (role.includes("Marketing")) {
    return `Localizes campaigns, launch assets, and market education for the ${branch.country} audience.`;
  }
  return `Supports daily operations, documentation, vendor coordination, and branch execution in ${branch.city}.`;
}

function branchSystems(department, role) {
  const systems = {
    Engineering: ["GitHub", "Vercel", "Sentry", "Jira"],
    "Data and AI": ["Snowflake", "Looker", "dbt", "Notion"],
    "Customer Success": ["HubSpot", "Zendesk", "Gainsight", "Notion"],
    Sales: ["Salesforce", "Gong", "HubSpot", "DocuSign"],
    Finance: ["QuickBooks", "Ramp", "PayrollHub", "Google Sheets"],
    "People Operations": ["BambooHR", "Greenhouse", "Lattice", "Notion"],
    "IT and Security": ["Okta", "Jamf", "Cloudflare", "Vanta"],
    Marketing: ["Webflow", "HubSpot", "Google Analytics", "Canva"],
    Operations: ["Notion", "Asana", "Google Workspace", "Slack"]
  };
  const base = systems[department] || systems.Operations;

  if (role.includes("Director") || role.includes("Manager") || role.includes("Lead")) {
    return [...base, "Executive Dashboards"];
  }

  return base;
}

function branchDepartmentResponsibility(department) {
  const responsibilities = {
    Engineering: "Builds, tests, and maintains localized product capabilities.",
    "Data and AI": "Maintains analytics, reporting quality, and operational insights.",
    "Customer Success": "Owns onboarding, support quality, customer health, and escalations.",
    Sales: "Develops pipeline, regional account plans, demos, and partner opportunities.",
    Finance: "Controls payroll support, invoices, expense reviews, and branch budget evidence.",
    "People Operations": "Supports hiring, onboarding, employee records, and performance cycles.",
    "IT and Security": "Manages access, devices, security evidence, and incident readiness.",
    Marketing: "Localizes campaigns, webinars, launch assets, and market content.",
    Operations: "Runs branch coordination, vendors, documentation, staffing, and delivery cadence."
  };

  return responsibilities[department] || responsibilities.Operations;
}

function branchWeeklyDeliverables(branch, role) {
  if (role.includes("Director") || role.includes("Manager") || role.includes("Lead")) {
    return [
      `${branch.country} leadership status note`,
      "Risk and staffing review",
      "Project milestone decision log"
    ];
  }
  if (role.includes("Engineer") || role.includes("QA")) {
    return ["Merged product changes", "Test evidence", "Sprint status note"];
  }
  if (role.includes("Customer") || role.includes("Support") || role.includes("Implementation")) {
    return ["Customer health updates", "Escalation summary", "Training or onboarding notes"];
  }
  if (role.includes("Sales") || role.includes("Solutions") || role.includes("Account")) {
    return ["CRM pipeline update", "Demo notes", "Next-step account plan"];
  }
  if (role.includes("Security")) {
    return ["Access review notes", "Training completion report", "Security evidence upload"];
  }
  if (role.includes("Finance") || role.includes("Payroll")) {
    return ["Budget variance note", "Invoice approval queue", "Payroll exception list"];
  }
  if (role.includes("People") || role.includes("Recruiting")) {
    return ["Hiring pipeline update", "Onboarding checklist review", "Employee support notes"];
  }
  return ["Operations tracker update", "Branch documentation note", "Open blocker summary"];
}

function branchAddress(branch) {
  return `${100 + branch.code.length * 17} Innovation Avenue, ${branch.city}, ${branch.country}`;
}

function branchTimezone(branch) {
  const zones = {
    FR: "Europe/Paris",
    US: "America/New_York",
    CA: "America/Toronto",
    NG: "Africa/Lagos",
    ZA: "Africa/Johannesburg",
    MA: "Africa/Casablanca",
    RU: "Europe/Moscow",
    ID: "Asia/Jakarta",
    AU: "Australia/Sydney"
  };

  return zones[branch.code];
}

function employeeForProjectRole(employees, preferredRoles, fallbackIndex, excludedName = "") {
  const found = employees.find((employee) => (
    employee.fullName !== excludedName
    && preferredRoles.some((role) => employee.role.includes(role))
  ));

  if (found) {
    return found;
  }

  return employees.find((employee) => employee.fullName !== excludedName) || employees[fallbackIndex % employees.length];
}

function branchManagerFor(employee, employees) {
  if (employee.role.includes("Director")) {
    return "Global COO";
  }
  if (employee.role.includes("Manager") || employee.role.includes("Lead")) {
    return employeeForProjectRole(employees, ["Branch Director"], 0, employee.fullName).fullName;
  }
  if (employee.department === "Engineering") {
    return employeeForProjectRole(employees, ["Engineering Manager"], 2, employee.fullName).fullName;
  }
  if (employee.department === "Data and AI") {
    return employeeForProjectRole(employees, ["Data Lead"], 5, employee.fullName).fullName;
  }
  if (employee.department === "Customer Success") {
    return employeeForProjectRole(employees, ["Customer Success Manager", "Support Lead"], 3, employee.fullName).fullName;
  }
  if (employee.department === "Sales" || employee.department === "Marketing") {
    return employeeForProjectRole(employees, ["Regional Sales Manager"], 4, employee.fullName).fullName;
  }
  if (employee.department === "IT and Security") {
    return employeeForProjectRole(employees, ["Security Coordinator"], 7, employee.fullName).fullName;
  }
  if (employee.department === "Finance" || employee.department === "People Operations" || employee.department === "Operations") {
    return employeeForProjectRole(employees, ["Operations Manager"], 1, employee.fullName).fullName;
  }

  return employeeForProjectRole(employees, ["Branch Director"], 0, employee.fullName).fullName;
}

function buildBranchProjects(branch, employees, countryIndex) {
  const projectTemplates = [
    {
      suffix: "OPS",
      name: `${branch.country} Operating System`,
      status: "Active",
      purpose: `Run daily branch operations, local reporting, staffing plans, and customer escalation tracking for ${branch.country}.`,
      managerRoles: ["Branch Director", "Operations Manager"],
      deputyRoles: ["Operations Manager", "Office Coordinator", "Product Operations"]
    },
    {
      suffix: "GROW",
      name: `${branch.country} Market Growth Program`,
      status: "In build",
      purpose: `Grow regional pipeline, partner relationships, and customer education in ${branch.country}.`,
      managerRoles: ["Regional Sales Manager", "Account Executive", "Solutions Consultant"],
      deputyRoles: ["Solutions Consultant", "Marketing Specialist", "Account Executive"]
    },
    {
      suffix: "CX",
      name: `${branch.country} Customer Experience Program`,
      status: "Beta",
      purpose: `Improve onboarding, training, customer health, and renewal readiness for ${branch.country} accounts.`,
      managerRoles: ["Customer Success Manager", "Support Lead", "Implementation Specialist"],
      deputyRoles: ["Support Lead", "Implementation Specialist", "Support Specialist"]
    },
    {
      suffix: "SEC",
      name: `${branch.country} Compliance And Security Track`,
      status: "Active",
      purpose: `Maintain access reviews, policy adoption, device compliance, and local audit evidence for ${branch.country}.`,
      managerRoles: ["Security Coordinator", "Security Analyst"],
      deputyRoles: ["Security Analyst", "IT"]
    },
    {
      suffix: "DATA",
      name: `${branch.country} Branch Analytics Layer`,
      status: "Discovery",
      purpose: `Create branch dashboards for employee capacity, project delivery, revenue contribution, and customer risk.`,
      managerRoles: ["Data Lead", "Data Analyst", "Engineering Manager"],
      deputyRoles: ["Data Analyst", "Product Operations", "Engineering Manager"]
    }
  ];

  return projectTemplates.map((template, index) => {
    const manager = employeeForProjectRole(employees, template.managerRoles, index);
    const deputy = employeeForProjectRole(employees, template.deputyRoles, index + 5, manager.fullName);

    return {
      code: `${branch.code}-${template.suffix}`,
      name: template.name,
      status: template.status,
      manager: manager.fullName,
      managerRole: manager.role,
      deputy: deputy.fullName,
      deputyRole: deputy.role,
      budget: budget(countryIndex * 8 + index, 180000),
      deadline: deadline(countryIndex + index),
      purpose: template.purpose,
      risk: [
        "Customer adoption delay",
        "Hiring capacity gap",
        "Data quality dependency",
        "Security evidence delay",
        "Vendor delivery risk"
      ][index],
      kpi: [
        "Branch SLA above 95 percent",
        "Qualified regional pipeline growth above 12 percent",
        "Customer onboarding completion within 14 days",
        "Quarterly security training completion above 98 percent",
        "Executive dashboard accuracy above 99 percent"
      ][index]
    };
  });
}

function buildBranchEmployees(branch, countryIndex) {
  const employees = Array.from({ length: branch.employeeCount }, (_unused, employeeIndex) => {
    const globalIndex = countryIndex * 60 + employeeIndex;
    const firstName = firstNames[globalIndex % firstNames.length];
    const lastName = lastNames[(globalIndex * 5 + countryIndex) % lastNames.length];
    const role = branchRole(employeeIndex);
    const department = branchDepartment(role);
    const salary = branchSalary(role, countryIndex, employeeIndex);
    const employeeNumber = countryIndex * 1000 + employeeIndex + 1;

    return {
      id: `CX-${branch.code}-${String(employeeIndex + 1).padStart(3, "0")}`,
      fullName: `${firstName} ${lastName}`,
      dateOfBirth: dateOfBirth(globalIndex + 100),
      startDate: startDate(globalIndex + 100),
      email: `${slug(firstName)}.${slug(lastName)}.${branch.code.toLowerCase()}${employeeIndex + 1}@companyx.example`,
      phone: phoneNumber(branch.code, employeeIndex + 1),
      role,
      department,
      salary,
      manager: "",
      location: `${branch.city}, ${branch.country}`,
      project: branch.branchProject,
      projectCode: `${branch.code}-P${String((employeeIndex % 5) + 1).padStart(2, "0")}`,
      employeeNumber,
      employmentType: employeeIndex % 11 === 0 ? "Contractor" : "Full-time",
      workMode: workModeFor(employeeIndex + countryIndex),
      shift: shiftFor(employeeIndex + countryIndex),
      skills: pickSkills(department, employeeIndex + countryIndex),
      languages: pickLanguages(branch.country, employeeIndex),
      performanceBand: performanceBand(employeeIndex + countryIndex),
      accessLevel: accessLevel(department, role),
      ptoBalanceDays: 6 + (employeeIndex % 18),
      responsibility: branchResponsibility(branch, role),
      systems: branchSystems(department, role),
      weeklyDeliverables: branchWeeklyDeliverables(branch, role),
      tasks: branchTasks(branch, role)
    };
  });

  employees.forEach((employee) => {
    employee.manager = branchManagerFor(employee, employees);
  });

  return employees;
}

function buildBranchMarkdown(branch, countryIndex) {
  const employees = buildBranchEmployees(branch, countryIndex);
  const branchProjects = buildBranchProjects(branch, employees, countryIndex);
  employees.forEach((employee, index) => {
    const project = branchProjects[index % branchProjects.length];
    employee.assignedProject = project;
    employee.project = project.name;
    employee.projectCode = project.code;
    employee.projectManager = project.manager;
  });
  const projectRows = branchProjects
    .map((project) => {
      const employeeCount = employees.filter((employee) => employee.projectCode === project.code).length;
      return `| ${project.code} | ${project.name} | ${project.manager} (${project.managerRole}) | ${project.deputy} (${project.deputyRole}) | ${project.status} | ${employeeCount} | ${project.budget} | ${project.deadline} | ${project.kpi} | ${project.risk} |`;
    })
    .join("\n");
  const departmentCounts = employees.reduce((counts, employee) => {
    counts[employee.department] = (counts[employee.department] || 0) + 1;
    return counts;
  }, {});
  const departmentRows = Object.entries(departmentCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([department, count]) => `| ${department} | ${count} | ${branchDepartmentResponsibility(department)} |`)
    .join("\n");
  const staffingRows = branchProjects
    .map((project) => {
      const assignedEmployees = employees
        .filter((employee) => employee.projectCode === project.code)
        .map((employee) => `${employee.id} ${employee.fullName} - ${employee.role}`)
        .join("; ");
      return `| ${project.code} | ${project.manager} | ${project.deputy} | ${employees.filter((employee) => employee.projectCode === project.code).length} | ${assignedEmployees} |`;
    })
    .join("\n");
  const employeeRows = employees
    .map((employee) => `| ${employee.id} | ${employee.fullName} | ${employee.dateOfBirth} | ${employee.startDate} | ${employee.email} | ${employee.department} | ${employee.role} | ${currency(employee.salary)} | ${employee.shift} | ${employee.manager} | ${employee.projectCode} | ${employee.projectManager} |`)
    .join("\n");
  const briefs = employees
    .map((employee) => {
      const tasks = employee.tasks.map((task) => `  - ${task}`).join("\n");
      const deliverables = employee.weeklyDeliverables.map((item) => `  - ${item}`).join("\n");
      return `### ${employee.id} - ${employee.fullName}

- Branch: ${branch.city}, ${branch.country}
- Department: ${employee.department}
- Post: ${employee.role}
- Email: ${employee.email}
- Phone: ${employee.phone}
- Date of birth: ${employee.dateOfBirth}
- Start date: ${employee.startDate}
- Salary: ${currency(employee.salary)}
- Manager: ${employee.manager}
- Employment type: ${employee.employmentType}
- Work mode: ${employee.workMode}
- Shift: ${employee.shift}
- Responsibility area: ${employee.responsibility}
- Branch project: ${employee.project}
- Local workstream: ${employee.projectCode}
- Project manager: ${employee.projectManager}
- Project status: ${employee.assignedProject.status}
- Project budget: ${employee.assignedProject.budget}
- Project deadline: ${employee.assignedProject.deadline}
- Project KPI: ${employee.assignedProject.kpi}
- Current project risk: ${employee.assignedProject.risk}
- Skills: ${employee.skills.join(", ")}
- Languages: ${employee.languages.join(", ")}
- Main systems used: ${employee.systems.join(", ")}
- Performance band: ${employee.performanceBand}
- Access level: ${employee.accessLevel}
- PTO balance: ${employee.ptoBalanceDays} days
- Weekly deliverables:
${deliverables}
- Daily tasks:
${tasks}`;
    })
    .join("\n\n");

  return `# Company X ${branch.country} Branch Knowledge Base

Version: 1.0
Dataset type: fictional synthetic branch data for Document Q&A testing
Branch: ${branch.city}, ${branch.country}
Employee count: ${employees.length}

Important privacy note: all employees, salaries, emails, dates of birth, branch details, and projects in this file are fictional and created for chatbot testing.

## Branch Overview

The Company X ${branch.country} branch is based in ${branch.city}. Its main focus is ${branch.focus}. The branch works with headquarters and other regions to deliver customer value while keeping local operations accountable.

- Office address: ${branchAddress(branch)}
- Timezone: ${branchTimezone(branch)}
- Standard working hours: 09:00-17:30 local time, with shift coverage for support and operations.
- Branch director: ${employees[0].fullName}
- Branch operations manager: ${employees[1].fullName}
- Branch engineering manager: ${employees.find((employee) => employee.role === "Engineering Manager")?.fullName || employees[2].fullName}
- Branch customer success manager: ${employees.find((employee) => employee.role === "Customer Success Manager")?.fullName || employees[3].fullName}
- Branch regional sales manager: ${employees.find((employee) => employee.role === "Regional Sales Manager")?.fullName || employees[4].fullName}
- Branch data lead: ${employees.find((employee) => employee.role === "Data Lead")?.fullName || employees[5].fullName}
- Branch security coordinator: ${employees.find((employee) => employee.role === "Security Coordinator")?.fullName || employees[8].fullName}
- Primary finance contact: ${employees.find((employee) => employee.role === "Finance Coordinator")?.fullName || employees[9].fullName}
- Main branch project: ${branch.branchProject}

## Branch Specialties

${branch.specialties.map((specialty) => `- ${specialty}`).join("\n")}

## Branch Department Capacity

| Department | Employees | Main responsibility |
| --- | ---: | --- |
${departmentRows}

## Branch Project

- Project name: ${branch.branchProject}
- Project objective: support ${branch.focus}
- Weekly rhythm: branch project updates are posted every Friday before 15:00 local time.
- Escalation rule: customer, security, or finance risks must be escalated to the global owner within one business day.

## Branch Project Portfolio

| Code | Project | Manager | Deputy | Status | Employees | Budget | Deadline | KPI | Current risk |
| --- | --- | --- | --- | --- | ---: | ---: | --- | --- | --- |
${projectRows}

## Project Staffing

| Project code | Project manager | Deputy | Employee count | Assigned employees |
| --- | --- | --- | ---: | --- |
${staffingRows}

## Branch Operating Notes

- The ${branch.country} branch has ${employees.length} employees.
- Branch leadership meets every Monday to review goals, blockers, customer risks, and staffing.
- Employees must keep project notes current in the global Company X workspace.
- Customer-facing employees should record customer feedback after every major call.
- Engineering and data employees should link technical decisions to the relevant branch workstream.
- The branch contributes to global Company X projects when local knowledge or timezone coverage is needed.

## Employee Directory

| ID | Name | Date of birth | Start date | Email | Department | Post | Salary | Shift | Manager | Project | Project manager |
| --- | --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- |
${employeeRows}

## Employee Daily Work Briefs

${briefs}

## Useful Branch Questions

- How many employees work in the ${branch.country} branch?
- Who is the Branch Director for ${branch.country}?
- Which ${branch.country} employees work in Engineering?
- What does the ${branch.country} branch specialize in?
- List employees in ${branch.city} with their salaries and posts.
- What are the daily tasks for the ${branch.country} Customer Success team?
`;
}

fs.mkdirSync(outputDir, { recursive: true });

const markdown = buildMarkdown();
fs.writeFileSync(markdownPath, markdown, "utf8");
const pageCount = writePdfFromMarkdown(markdown);

console.log(`Created ${path.relative(rootDir, markdownPath)}`);
console.log(`Created ${path.relative(rootDir, pdfPath)} with ${pageCount} pages.`);

branchCountries.forEach((branch, index) => {
  const fileSlug = branch.country.toLowerCase().replace(/\s+/g, "-");
  const branchMarkdownPath = path.join(outputDir, `company-x-branch-${fileSlug}.md`);
  const branchPdfPath = path.join(outputDir, `company-x-branch-${fileSlug}.pdf`);
  const branchMarkdown = buildBranchMarkdown(branch, index);
  fs.writeFileSync(branchMarkdownPath, branchMarkdown, "utf8");
  const branchPageCount = writePdfFromMarkdown(branchMarkdown, branchPdfPath);

  console.log(`Created ${path.relative(rootDir, branchMarkdownPath)}`);
  console.log(`Created ${path.relative(rootDir, branchPdfPath)} with ${branchPageCount} pages.`);
});

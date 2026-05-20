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

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
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
        email: `${slug(firstName)}.${slug(lastName)}${employeeIndex + 1}@companyx.example`,
        salary,
        role,
        department: department.name,
        manager,
        location: locations[employeeIndex % locations.length],
        employmentType: employeeIndex % 13 === 0 ? "Contractor" : "Full-time",
        projects: secondaryProject ? [project, secondaryProject] : [project],
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
    .map((project) => `| ${project.code} | ${project.name} | ${project.owner} | ${project.status} | ${project.goal} |`)
    .join("\n");
  const employeeRows = employees
    .map((employee) => {
      const projectNames = employee.projects.map((project) => project.code).join(", ");
      return `| ${employee.id} | ${employee.fullName} | ${employee.dateOfBirth} | ${employee.email} | ${employee.department} | ${employee.role} | ${currency(employee.salary)} | ${employee.location} | ${projectNames} |`;
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
- Date of birth: ${employee.dateOfBirth}
- Salary: ${currency(employee.salary)}
- Manager: ${employee.manager}
- Location: ${employee.location}
- Employment type: ${employee.employmentType}
- Active project work: ${projectsLine}
- Current project focus: ${employee.focus}
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

| Code | Project | Owner | Status | Goal |
| --- | --- | --- | --- | --- |
${projectRows}

### Project Details

${projects
  .map(
    (project) => `#### ${project.code} - ${project.name}

- Owner department: ${project.owner}
- Status: ${project.status}
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

| ID | Name | Date of birth | Email | Department | Post | Salary | Location | Projects |
| --- | --- | --- | --- | --- | --- | ---: | --- | --- |
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

function writePdfFromMarkdown(markdown) {
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

  fs.writeFileSync(pdfPath, pdf, "utf8");
  return pages.length;
}

fs.mkdirSync(outputDir, { recursive: true });

const markdown = buildMarkdown();
fs.writeFileSync(markdownPath, markdown, "utf8");
const pageCount = writePdfFromMarkdown(markdown);

console.log(`Created ${path.relative(rootDir, markdownPath)}`);
console.log(`Created ${path.relative(rootDir, pdfPath)} with ${pageCount} pages.`);

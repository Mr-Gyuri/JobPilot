// Build a realistic PDF resume (via Puppeteer) and a DOCX resume (via a minimal
// OOXML zip) to exercise the upload/parse path end to end.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const OUT = path.join(ROOT, "scripts", "fixtures");
fs.mkdirSync(OUT, { recursive: true });

// Resolve the app's dependencies from the project root.
const require = createRequire(path.join(ROOT, "package.json"));
const puppeteer = require("puppeteer");

const RESUME_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: Georgia, serif; font-size: 11pt; line-height: 1.35; margin: 0.6in; color: #111; }
  h1 { font-size: 20pt; margin: 0 0 2px; text-align: center; letter-spacing: .5px; }
  .contact { text-align: center; font-size: 9.5pt; margin-bottom: 14px; }
  h2 { font-size: 11pt; text-transform: uppercase; letter-spacing: 1px;
       border-bottom: 1px solid #333; padding-bottom: 2px; margin: 14px 0 6px; }
  .entry { margin-bottom: 10px; }
  .row { display: flex; justify-content: space-between; font-weight: bold; }
  .sub { font-style: italic; margin-bottom: 3px; }
  ul { margin: 3px 0 0 18px; padding: 0; }
  li { margin-bottom: 2px; }
</style></head><body>
  <h1>Maria Santos Reyes</h1>
  <div class="contact">
    Makati, Metro Manila &middot; maria.reyes@example.com &middot; +63 917 555 0142 &middot;
    https://linkedin.com/in/mariareyes &middot; https://github.com/mariareyes
  </div>

  <h2>Professional Summary</h2>
  <p>Backend engineer with eight years building payment and logistics platforms for Philippine
  and Singapore markets. Comfortable owning a service end to end, from schema design through
  on-call. Strongest in Python and PostgreSQL, with recent production work in TypeScript.</p>

  <h2>Experience</h2>
  <div class="entry">
    <div class="row"><span>Coins.ph</span><span>Mar 2021 – Present</span></div>
    <div class="sub">Senior Backend Engineer</div>
    <ul>
      <li>Led the rewrite of the merchant settlement service from Django to FastAPI, cutting p99 latency from 1.8s to 240ms</li>
      <li>Designed the double-entry ledger schema in PostgreSQL that now records 4 million transactions per month</li>
      <li>Built the reconciliation pipeline in Airflow that replaced a manual finance process taking 3 days each month</li>
      <li>Introduced contract tests with pytest, taking integration escapes from roughly 6 per quarter to 1</li>
      <li>Mentored 4 junior engineers; two were promoted within 18 months</li>
    </ul>
  </div>
  <div class="entry">
    <div class="row"><span>Ninja Van Philippines</span><span>Jun 2018 – Feb 2021</span></div>
    <div class="sub">Backend Engineer</div>
    <ul>
      <li>Owned the route optimisation API serving 900 daily drivers, written in Python with Redis caching</li>
      <li>Migrated the parcel tracking service into Docker and deployed it on AWS ECS</li>
      <li>Added Kafka event streaming so warehouse scans propagated to customers in under 2 seconds</li>
      <li>Wrote the on-call runbook still used by the logistics platform team</li>
    </ul>
  </div>
  <div class="entry">
    <div class="row"><span>Accenture Philippines</span><span>Aug 2016 – May 2018</span></div>
    <div class="sub">Software Engineer</div>
    <ul>
      <li>Built internal reporting tools in Java and Spring Boot for a retail banking client</li>
      <li>Automated a nightly ETL job in SQL Server that had previously been run by hand</li>
      <li>Supported a legacy ASP.NET application through two compliance audits</li>
    </ul>
  </div>

  <h2>Education</h2>
  <div class="entry">
    <div class="row"><span>University of the Philippines Diliman</span><span>2016</span></div>
    <div class="sub">BS in Computer Science</div>
    <ul><li>Cum laude, GPA 1.75</li></ul>
  </div>

  <h2>Skills</h2>
  <p>Languages: Python, TypeScript, Java, SQL, Bash<br/>
  Frameworks: FastAPI, Django, Spring Boot, Node.js, Express<br/>
  Data: PostgreSQL, Redis, Kafka, Airflow, SQL Server<br/>
  Cloud &amp; Tooling: AWS, Docker, Kubernetes, Terraform, GitHub Actions, Git, Jira<br/>
  Practices: Microservices, REST, TDD, CI/CD, Agile, Code review</p>

  <h2>Certifications</h2>
  <ul>
    <li>AWS Certified Solutions Architect – Associate (Amazon Web Services), 2022</li>
    <li>Certified Kubernetes Application Developer (CNCF), 2023</li>
  </ul>

  <h2>Projects</h2>
  <ul>
    <li>pesos-cli: open-source CLI for BIR tax computation, 400 GitHub stars</li>
    <li>Volunteer maintainer for a barangay vaccination scheduling tool used during 2021</li>
  </ul>
</body></html>`;

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setContent(RESUME_HTML, { waitUntil: "domcontentloaded" });
await page.pdf({ path: path.join(OUT, "maria-reyes-resume.pdf"), format: "Letter", printBackground: true });
await page.close();
await browser.close();
console.log("wrote maria-reyes-resume.pdf");

// --- DOCX fixture: minimal but valid OOXML ---
const { ZipArchive } = await import(
  pathToFileURL(path.join(ROOT, "node_modules", "archiver", "index.js")).href
);

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const DOCX_LINES = [
  "Juan Miguel Cruz",
  "Cebu City, Philippines | juan.cruz@example.com | +63 932 444 8810 | https://linkedin.com/in/juanmcruz",
  "SUMMARY",
  "Customer support team lead with five years in BPO operations, moving into a technical support role. Handles escalations, coaches new hires, and reports on queue performance.",
  "WORK EXPERIENCE",
  "Team Lead, Customer Support | Concentrix Cebu | Jan 2022 - Present",
  "- Led a team of 14 agents supporting a US e-commerce account, holding CSAT at 92%",
  "- Cut average handle time from 9.4 to 6.8 minutes by rewriting the top 20 macros",
  "- Built a Google Sheets dashboard that replaced the manual daily shift report",
  "- Ran onboarding for 30+ new hires across four batches",
  "Senior Support Agent | TaskUs | Mar 2019 - Dec 2021",
  "- Handled tier 2 email and chat support for a fintech client, roughly 60 tickets daily",
  "- Wrote 40 help centre articles in Zendesk that reduced repeat contacts",
  "- Recognised as top agent for three consecutive quarters",
  "EDUCATION",
  "University of San Carlos | 2018",
  "BS in Business Administration",
  "SKILLS",
  "Tools: Zendesk, Salesforce, Jira, Slack, Excel, Google Sheets",
  "Skills: Customer service, Technical support, Escalation management, Coaching, Reporting, Documentation",
  "CERTIFICATIONS",
  "Zendesk Support Administrator, 2023",
];
const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
${DOCX_LINES.map((l) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(l)}</w:t></w:r></w:p>`).join("\n")}
</w:body></w:document>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const docxPath = path.join(OUT, "juan-cruz-resume.docx");
await new Promise((resolve, reject) => {
  const out = fs.createWriteStream(docxPath);
  const zip = new ZipArchive({ zlib: { level: 9 } });
  out.on("close", resolve);
  zip.on("error", reject);
  zip.pipe(out);
  zip.append(contentTypes, { name: "[Content_Types].xml" });
  zip.append(rootRels, { name: "_rels/.rels" });
  zip.append(documentXml, { name: "word/document.xml" });
  void zip.finalize();
});
console.log("wrote juan-cruz-resume.docx");

// --- Job description fixture for the paste path ---
fs.writeFileSync(
  path.join(OUT, "job-description.txt"),
  `Senior Backend Engineer (Python) - Remote Philippines
GrowthBank Technologies

About the role
We are looking for a Senior Backend Engineer to own our payments and ledger services. You will
work with a small platform team distributed across Manila and Singapore. This is a fully remote
role, PHP 180,000 - 250,000 per month depending on experience.

Key Responsibilities
- Design, build and operate backend services in Python (FastAPI) that process high volumes of financial transactions
- Own the correctness of our double-entry ledger, including reconciliation and audit reporting
- Improve observability and reduce p99 latency across our core payment APIs
- Partner with the data team on event streaming into our warehouse using Kafka
- Take part in the on-call rotation and drive incident postmortems
- Mentor mid-level engineers and raise the bar in code review

Requirements
- 6+ years of professional backend engineering experience
- Deep expertise in Python and PostgreSQL, including query tuning and schema design
- Production experience with FastAPI or a comparable async Python framework
- Strong grasp of microservices, REST API design and distributed systems trade-offs
- Hands-on experience with AWS, Docker and Kubernetes
- Experience with Kafka or another event streaming platform
- Familiarity with infrastructure as code, ideally Terraform
- Solid testing discipline, TDD and CI/CD
- Excellent written communication for an async, distributed team

Nice to have
- Fintech or payments domain experience
- Experience with Go for performance-critical services
- Exposure to gRPC
- Knowledge of PCI DSS compliance requirements

Benefits
- Fully remote within the Philippines
- HMO from day one, plus dependents
- Annual learning budget
`,
  "utf8"
);
console.log("wrote job-description.txt");
console.log("fixtures at:", OUT);
